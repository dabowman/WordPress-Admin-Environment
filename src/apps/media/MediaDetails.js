import { useCallback, useMemo, useState } from '@wordpress/element';
import { useEntityRecord, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataForm } from '@wordpress/dataviews/wp';
import { Button, Icon, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { copy, trash, crop } from '@wordpress/icons';
import { useEntitySave } from '../_shared/forms/useEntitySave';
import ImageEditor from './ImageEditor';

/**
 * MediaDetails — a presentation-agnostic attachment metadata editor.
 *
 * Owns everything the host should NOT care about so the same unit can later be
 * dropped into a region / inspector / side-pane instead of today's DataViews
 * `RenderModal`:
 *
 * 1. **Entity binding** — `useEntityRecord('root','media', id)` with the
 *    buffered `edit()` / `save()` / `hasEdits`, threaded through the shared
 *    `useEntitySave` so a server-reported error keeps the host open.
 * 2. **Preview / media slot** — a `<MediaPreview>` sibling sub-component, never
 *    fused into the form. This is the seam where the #125 image editor lands
 *    (an image-edit canvas composed next to the form, not inside it).
 * 3. **Metadata `DataForm`** — title, alt-text (images only, via `isVisible`),
 *    caption, description. The `fields` / `form` split lets a host vary only
 *    the `form` layout (compact panel here; expanded sections in a future pane)
 *    while reusing the same field set + validation.
 * 4. **Actions** — Copy URL + Delete, plus an explicit Save (a reassurance
 *    superset over the buffered `edit()`; see the commit-strategy note below).
 *
 * **Commit strategy.** The data flow is autosave-ready: `edit()` buffers every
 * keystroke and the entity exposes `save()` / `hasEdits`, so a future
 * autosaving host (a side-pane / the #119 document-settings sidebar) can wire a
 * debounced/on-blur `save()` without touching this component. Today's modal
 * host renders an explicit Save button (the reassurance superset). Choosing the
 * buffered-edit data flow now is what avoids a rewrite when the pane lands; a
 * shared `useEntityAutosave` should be promoted only when a second autosaving
 * consumer actually needs it.
 *
 * The HOST supplies only chrome (the modal frame + an `onClose` callback) and,
 * optionally, post-mutation cache invalidation via `onMutated`. Swapping hosts
 * must not touch this file.
 *
 * @param {Object}   root0
 * @param {number}   root0.id           Attachment id to edit (the host keys on this).
 * @param {Function} [root0.onClose]    Called after a successful save or delete.
 * @param {Function} [root0.onMutated]  Called after save / delete / image-edit so
 *                                      the host can invalidate its list + counts.
 * @param {Function} [root0.onReplaced] Called with the NEW attachment id after an
 *                                      inline image edit (which always creates a
 *                                      new attachment); lets the host re-point to
 *                                      it. Falls back to `onClose` when absent.
 * @return {JSX.Element} The details editor.
 */
export default function MediaDetails( { id, onClose, onMutated, onReplaced } ) {
	const { record, editedRecord, edit, save, hasEdits, isSaving } =
		useEntityRecord( 'root', 'media', id );

	const [ isEditingImage, setIsEditingImage ] = useState( false );

	const { deleteEntityRecord } = useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const handleSave = useEntitySave(
		save,
		{
			success: __( 'Media details saved.', 'wp-admin-workspaces' ),
			error: __( 'Failed to save media details.', 'wp-admin-workspaces' ),
		},
		{ kind: 'root', name: 'media', recordId: id }
	);

	const fields = useMemo(
		() => [
			{
				id: 'title',
				type: 'text',
				label: __( 'Title', 'wp-admin-workspaces' ),
				// title is `{ raw, rendered }`; bind to the raw value so the form
				// edits what the REST `title` field accepts back.
				getValue: ( { item } ) => item?.title?.raw ?? item?.title ?? '',
				setValue: ( { value } ) => ( { title: value } ),
			},
			{
				id: 'alt_text',
				type: 'text',
				label: __( 'Alt Text', 'wp-admin-workspaces' ),
			},
			{
				id: 'caption',
				type: 'text',
				label: __( 'Caption', 'wp-admin-workspaces' ),
				Edit: { control: 'textarea', rows: 2 },
				getValue: ( { item } ) =>
					item?.caption?.raw ?? item?.caption ?? '',
				setValue: ( { value } ) => ( { caption: value } ),
			},
			{
				id: 'description',
				type: 'text',
				label: __( 'Description', 'wp-admin-workspaces' ),
				Edit: { control: 'textarea', rows: 4 },
				getValue: ( { item } ) =>
					item?.description?.raw ?? item?.description ?? '',
				setValue: ( { value } ) => ( { description: value } ),
			},
		],
		[]
	);

	// `fields` / `form` split: define the field set once; a host varies only the
	// layout. Alt-text is image-only via `isVisible` so the field set itself
	// stays host- and mime-agnostic.
	const form = useMemo(
		() => ( {
			layout: { type: 'regular', labelPosition: 'top' },
			fields: [
				'title',
				{
					id: 'alt_text',
					isVisible: ( item ) => item?.media_type === 'image',
				},
				'caption',
				'description',
			],
		} ),
		[]
	);

	const onCopyUrl = useCallback( async () => {
		try {
			await navigator.clipboard.writeText( record?.source_url || '' );
			createSuccessNotice(
				__( 'URL copied to clipboard.', 'wp-admin-workspaces' ),
				{ type: 'snackbar' }
			);
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__( 'Failed to copy URL.', 'wp-admin-workspaces' ),
				{ isDismissible: true }
			);
		}
	}, [ record, createSuccessNotice, createErrorNotice ] );

	const onSave = useCallback( async () => {
		const saved = await handleSave();
		if ( ! saved ) {
			return;
		}
		onMutated?.();
		onClose?.();
	}, [ handleSave, onMutated, onClose ] );

	// The `/edit` route always returns a NEW attachment (no in-place REST mode —
	// see docs/parity/media.md blocker #1). Surface that, refresh the host list,
	// and re-point to the new id (or just close if the host can't re-point).
	const onImageSaved = useCallback(
		( newAttachment ) => {
			setIsEditingImage( false );
			createSuccessNotice(
				__(
					'Edited image saved as a new attachment.',
					'wp-admin-workspaces'
				),
				{ type: 'snackbar' }
			);
			onMutated?.();
			if ( newAttachment?.id && onReplaced ) {
				onReplaced( newAttachment.id );
			} else {
				onClose?.();
			}
		},
		[ createSuccessNotice, onMutated, onReplaced, onClose ]
	);

	const onDelete = useCallback( async () => {
		try {
			await deleteEntityRecord( 'root', 'media', id, { force: true } );
			createSuccessNotice(
				__( 'Attachment permanently deleted.', 'wp-admin-workspaces' ),
				{ type: 'snackbar' }
			);
			onMutated?.();
			onClose?.();
		} catch ( err ) {
			createErrorNotice(
				err?.message ||
					__( 'Failed to delete attachment.', 'wp-admin-workspaces' ),
				{ isDismissible: true }
			);
		}
	}, [
		deleteEntityRecord,
		id,
		createSuccessNotice,
		createErrorNotice,
		onMutated,
		onClose,
	] );

	if ( ! record ) {
		return (
			<div className="wp-admin-workspaces-app__center">
				<Spinner />
			</div>
		);
	}

	return (
		<Stack
			direction="row"
			align="flex-start"
			gap="xl"
			className="wp-admin-workspaces-app-media__details"
		>
			{ /* Preview slot — own sibling sub-component. The #125 image editor
			     replaces the static preview here while editing. */ }
			{ isEditingImage ? (
				<ImageEditor
					record={ record }
					onCancel={ () => setIsEditingImage( false ) }
					onSaved={ onImageSaved }
				/>
			) : (
				<MediaPreview
					record={ record }
					onEditImage={
						record.media_type === 'image'
							? () => setIsEditingImage( true )
							: null
					}
				/>
			) }

			<Stack direction="column" gap="md" style={ { flex: 1 } }>
				<DataForm
					data={ editedRecord }
					fields={ fields }
					form={ form }
					onChange={ edit }
				/>

				<Text
					variant="body-sm"
					className="wp-admin-workspaces-app__muted wp-admin-workspaces-app-media__details-url"
				>
					{ record.source_url }
				</Text>

				<Stack direction="row" justify="space-between" gap="sm">
					<Stack direction="row" gap="sm">
						<Button
							tone="neutral"
							variant="minimal"
							onClick={ onCopyUrl }
							size="compact"
						>
							<Icon icon={ copy } size={ 16 } />
							{ __( 'Copy URL', 'wp-admin-workspaces' ) }
						</Button>
						<DestructiveButton
							icon={ trash }
							variant="tertiary"
							isDestructive
							onClick={ onDelete }
							size="compact"
						>
							{ __( 'Delete', 'wp-admin-workspaces' ) }
						</DestructiveButton>
					</Stack>
					<Button
						tone="brand"
						variant="solid"
						onClick={ onSave }
						loading={ isSaving }
						disabled={ ! hasEdits || isSaving }
					>
						{ __( 'Save', 'wp-admin-workspaces' ) }
					</Button>
				</Stack>
			</Stack>
		</Stack>
	);
}

/**
 * Attachment preview — image thumbnail, audio / video player, or a labeled
 * file-type tile. Its own sub-component so the #125 image-edit canvas can
 * replace / wrap it without touching the metadata form. For images, an
 * "Edit Image" affordance (when `onEditImage` is supplied) swaps in the editor.
 *
 * @param {Object}    root0
 * @param {Object}    root0.record        The attachment entity record.
 * @param {?Function} [root0.onEditImage] Enters the inline image editor; only
 *                                        passed for image attachments.
 * @return {JSX.Element} The preview.
 */
function MediaPreview( { record, onEditImage } ) {
	const src =
		record.media_details?.sizes?.medium?.source_url || record.source_url;

	if ( record.media_type === 'image' ) {
		return (
			<Stack direction="column" gap="sm" align="flex-start">
				<div className="wp-admin-workspaces-app-media__preview">
					<img src={ src } alt={ record.alt_text || '' } />
				</div>
				{ onEditImage && (
					<Button
						tone="neutral"
						variant="outline"
						size="compact"
						onClick={ onEditImage }
					>
						<Icon icon={ crop } size={ 16 } />
						{ __( 'Edit Image', 'wp-admin-workspaces' ) }
					</Button>
				) }
			</Stack>
		);
	}
	if ( record.media_type === 'audio' ) {
		return (
			<div className="wp-admin-workspaces-app-media__preview">
				{ /* eslint-disable-next-line jsx-a11y/media-has-caption -- user media, no caption track available. */ }
				<audio controls src={ record.source_url } />
			</div>
		);
	}
	if ( record.media_type === 'video' ) {
		return (
			<div className="wp-admin-workspaces-app-media__preview">
				{ /* eslint-disable-next-line jsx-a11y/media-has-caption -- user media, no caption track available. */ }
				<video controls src={ record.source_url } />
			</div>
		);
	}
	return (
		<div className="wp-admin-workspaces-app-media__preview wp-admin-workspaces-app-media__preview--file">
			<Text>{ record.mime_type }</Text>
		</div>
	);
}
