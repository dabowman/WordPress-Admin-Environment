import './index.css';
import '../_shared/app.css';
import { useState, useMemo, useCallback, useRef } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Icon, Stack, Text } from '@wordpress/ui';
import { Spinner, ToggleControl, Modal } from '@wordpress/components';
import { __, _n, sprintf } from '@wordpress/i18n';
import { upload } from '@wordpress/icons';
import { useDataView } from '../../runtime/dataView/useDataView';
import { buildFields } from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import { buildQueryArgs } from '../_shared/dataviews/buildQueryArgs.mjs';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';
import {
	useEntityElementCounts,
	invalidateEntityElementCounts,
} from '../_shared/dataviews/useEntityElementCounts';
import MediaDetails from './MediaDetails';

const MEDIA_TYPE_VALUES = [ 'image', 'video', 'audio', 'application' ];

// Plain English type labels for the mapped `typeLabel` cell. Kept in sync with
// the dataView `type` field elements; the count-augmented filter labels come
// from buildFields, this is just the table-cell display.
const FILTER_TYPE_LABELS = {
	image: __( 'Image', 'wp-admin-shell' ),
	video: __( 'Video', 'wp-admin-shell' ),
	audio: __( 'Audio', 'wp-admin-shell' ),
	application: __( 'Document', 'wp-admin-shell' ),
	file: __( 'File', 'wp-admin-shell' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	title: __( 'Title', 'wp-admin-shell' ),
	thumbnail: __( 'Preview', 'wp-admin-shell' ),
	type: __( 'Type', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
	date: __( 'Date', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-shell' ),
	'copy-url': __( 'Copy URL', 'wp-admin-shell' ),
	delete: __( 'Delete Permanently', 'wp-admin-shell' ),
};

const VIEW_DEFAULTS = {
	type: 'grid',
	search: '',
	filters: [],
	page: 1,
	perPage: 40,
	sort: { field: 'date', direction: 'desc' },
	fields: [],
	layout: {},
};

// DataViews `view` → REST query-args mapping (search / sort / pagination +
// the media_type filter). Mine + Unattached are toolbar pseudo-filters merged
// as static args below.
const QUERY_MAPPING = {
	search: 'search',
	sort: { defaultField: 'date', defaultDirection: 'desc' },
	filters: {
		type: { isAny: 'media_type', is: 'media_type' },
	},
};

/**
 * Render the thumbnail media field: image thumbnail for `media_type === 'image'`,
 * else a labeled file-type tile (PDF / MP4 / …). Media's one renderer the other
 * list apps don't need.
 *
 * @param {Object} root0
 * @param {Object} root0.item Mapped attachment data item.
 * @return {JSX.Element} The tile.
 */
function ThumbnailField( { item } ) {
	if ( item.mediaType === 'image' && item.thumbnail ) {
		return (
			<img
				className="wp-admin-shell-app-media__thumb"
				src={ item.thumbnail }
				alt={ item.altText || '' }
				loading="lazy"
			/>
		);
	}
	return (
		<div className="wp-admin-shell-app-media__file-icon">
			<Text>
				{ item.mimeType?.split( '/' ).pop()?.toUpperCase() || 'FILE' }
			</Text>
		</div>
	);
}

const FIELD_RENDERERS = {
	title: ( { item } ) => <Text>{ item.title }</Text>,
	thumbnail: ( props ) => <ThumbnailField { ...props } />,
	type: ( { item } ) => <Text>{ item.typeLabel }</Text>,
	author: ( { item } ) => <Text>{ item.author }</Text>,
};

export default function MediaApp( { config = {} } ) {
	const screenId = config.screenId || null;
	const currentUserId = window.wpAdminShell?.userId;

	const { config: dataViewConfig } = useDataView( screenId );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
	} );

	// Toolbar pseudo-filters (no DataViews filter UI for these): Mine restricts
	// to the current user's uploads; Unattached restricts to `parent: 0`.
	const [ showMine, setShowMine ] = useState( false );
	const [ showUnattached, setShowUnattached ] = useState( false );
	const [ isUploading, setIsUploading ] = useState( false );
	const [ editingId, setEditingId ] = useState( null );
	const fileInputRef = useRef();

	const queryArgs = useMemo( () => {
		const staticArgs = { context: 'edit' };
		if ( showMine && currentUserId ) {
			staticArgs.author = currentUserId;
		}
		if ( showUnattached ) {
			staticArgs.parent = 0;
		}
		return buildQueryArgs( view, QUERY_MAPPING, staticArgs );
	}, [ view, showMine, showUnattached, currentUserId ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'media',
		queryArgs
	);

	const typeCounts = useEntityElementCounts(
		'root',
		'media',
		'media_type',
		MEDIA_TYPE_VALUES
	);

	const { deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice, createNotice } =
		useDispatch( noticesStore );

	const refreshAfterMutation = useCallback( () => {
		invalidateResolution( 'getEntityRecords', [
			'root',
			'media',
			queryArgs,
		] );
		invalidateEntityElementCounts(
			invalidateResolution,
			'root',
			'media',
			'media_type',
			MEDIA_TYPE_VALUES
		);
	}, [ invalidateResolution, queryArgs ] );

	const handleUpload = useCallback(
		async ( event ) => {
			const files = event.target.files;
			if ( ! files?.length ) {
				return;
			}
			setIsUploading( true );
			try {
				let uploaded = 0;
				// Upload each file independently so a single failure (oversize /
				// disallowed MIME / quota) surfaces its own error notice without
				// aborting the rest of the batch.
				for ( const file of files ) {
					const formData = new FormData();
					formData.append( 'file', file );
					try {
						await apiFetch( {
							path: '/wp/v2/media',
							method: 'POST',
							body: formData,
						} );
						uploaded += 1;
					} catch ( err ) {
						createErrorNotice(
							sprintf(
								/* translators: 1: file name, 2: error message. */
								__(
									'Could not upload "%1$s": %2$s',
									'wp-admin-shell'
								),
								file.name,
								err?.message ||
									__( 'Upload failed.', 'wp-admin-shell' )
							),
							{ isDismissible: true }
						);
					}
				}
				if ( uploaded > 0 ) {
					createSuccessNotice(
						sprintf(
							/* translators: %d: number of files uploaded. */
							_n(
								'%d file uploaded.',
								'%d files uploaded.',
								uploaded,
								'wp-admin-shell'
							),
							uploaded
						),
						{ type: 'snackbar' }
					);
					refreshAfterMutation();
				}
			} finally {
				setIsUploading( false );
				if ( fileInputRef.current ) {
					fileInputRef.current.value = '';
				}
			}
		},
		[ refreshAfterMutation, createErrorNotice, createSuccessNotice ]
	);

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => ( {
			id: record.id,
			title:
				record.title?.raw ||
				record.title?.rendered ||
				__( '(no title)', 'wp-admin-shell' ),
			thumbnail:
				record.media_details?.sizes?.thumbnail?.source_url ||
				record.source_url,
			mediaType: record.media_type,
			typeLabel:
				FILTER_TYPE_LABELS[ record.media_type ] ||
				record.media_type ||
				'',
			mimeType: record.mime_type,
			altText: record.alt_text || '',
			author: record.author,
			date: record.date,
			source_url: record.source_url,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: FIELD_RENDERERS,
				elementCounts: { type: typeCounts },
			} ),
		[ dataViewConfig, typeCounts ]
	);

	const actions = useMemo( () => {
		const deleteModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to permanently delete this attachment? This cannot be undone.',
							'wp-admin-shell'
					  )
					: __(
							'Are you sure you want to permanently delete these attachments? This cannot be undone.',
							'wp-admin-shell'
					  ),
			confirmLabel: __( 'Delete Permanently', 'wp-admin-shell' ),
			// Media has no trash — force: true skips it.
			mutate: ( item ) =>
				deleteEntityRecord( 'root', 'media', item.id, { force: true } ),
			onSettled: ( { targets, failed } ) => {
				refreshAfterMutation();
				if ( failed > 0 ) {
					createNotice(
						'error',
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d attachment failed to delete.',
								'%1$d of %2$d attachments failed to delete.',
								failed,
								'wp-admin-shell'
							),
							failed,
							targets.length
						),
						{ type: 'snackbar' }
					);
				} else {
					createNotice(
						'success',
						sprintf(
							/* translators: %d: permanently deleted attachment count */
							_n(
								'%d attachment permanently deleted.',
								'%d attachments permanently deleted.',
								targets.length,
								'wp-admin-shell'
							),
							targets.length
						),
						{ type: 'snackbar' }
					);
				}
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				edit: ( items ) => setEditingId( items[ 0 ].id ),
				'copy-url': async ( items ) => {
					try {
						await navigator.clipboard.writeText(
							items[ 0 ].source_url || ''
						);
						createSuccessNotice(
							__( 'URL copied to clipboard.', 'wp-admin-shell' ),
							{ type: 'snackbar' }
						);
					} catch ( err ) {
						createErrorNotice(
							err?.message ||
								__( 'Failed to copy URL.', 'wp-admin-shell' ),
							{ isDismissible: true }
						);
					}
				},
			},
			modals: { delete: deleteModal },
		} );
	}, [
		dataViewConfig,
		deleteEntityRecord,
		refreshAfterMutation,
		createNotice,
		createSuccessNotice,
		createErrorNotice,
	] );

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	return (
		<div className="wp-admin-shell-app-media wp-admin-shell-app--fill">
			<Stack
				direction="row"
				align="center"
				justify="space-between"
				gap="md"
				className="wp-admin-shell-app-media__toolbar"
			>
				<Stack direction="row" align="center" gap="lg">
					<ToggleControl
						__nextHasNoMarginBottom
						label={ __( 'Mine', 'wp-admin-shell' ) }
						checked={ showMine }
						onChange={ setShowMine }
					/>
					<ToggleControl
						__nextHasNoMarginBottom
						label={ __( 'Unattached', 'wp-admin-shell' ) }
						checked={ showUnattached }
						onChange={ setShowUnattached }
					/>
				</Stack>
				<Stack direction="row" gap="md" align="center">
					<Button
						tone="brand"
						variant="solid"
						onClick={ () => fileInputRef.current?.click() }
						loading={ isUploading }
						disabled={ isUploading }
						size="compact"
					>
						<Icon icon={ upload } size={ 16 } />
						{ __( 'Upload', 'wp-admin-shell' ) }
					</Button>
					<input
						ref={ fileInputRef }
						type="file"
						multiple
						onChange={ handleUpload }
						style={ { display: 'none' } }
					/>
				</Stack>
			</Stack>

			{ ! records ? (
				<div className="wp-admin-shell-app__center">
					<Spinner />
				</div>
			) : (
				<DataViews
					data={ data }
					fields={ fields }
					view={ view }
					onChangeView={ setView }
					actions={ actions }
					paginationInfo={ paginationInfo }
					isLoading={ isResolving }
					defaultLayouts={ dataViewConfig.defaultLayouts ?? {} }
					selection={ selection }
					onChangeSelection={ setSelection }
					getItemId={ ( item ) => item.id.toString() }
				/>
			) }

			{ editingId !== null && (
				<MediaDetailsModal
					id={ editingId }
					onClose={ () => setEditingId( null ) }
					onMutated={ refreshAfterMutation }
				/>
			) }
		</div>
	);
}

/**
 * Host chrome for `MediaDetails`: today a simple modal frame. `MediaDetails`
 * owns the entity binding + form + actions; this wrapper supplies only the
 * overlay + an Escape / backdrop close. Keyed by the caller on `id` so the
 * buffered entity record resets between attachments.
 *
 * Uses `@wordpress/components` Modal — WPDS 0.12 has no clean Dialog port for
 * this composite (preview + DataForm + action row).
 *
 * @param {Object}   root0
 * @param {number}   root0.id        Attachment id.
 * @param {Function} root0.onClose   Close callback.
 * @param {Function} root0.onMutated Post-save / delete invalidation callback.
 * @return {JSX.Element} The modal.
 */
function MediaDetailsModal( { id, onClose, onMutated } ) {
	return (
		<Modal
			title={ __( 'Media Details', 'wp-admin-shell' ) }
			onRequestClose={ onClose }
			size="large"
		>
			<MediaDetails
				key={ id }
				id={ id }
				onClose={ onClose }
				onMutated={ onMutated }
			/>
		</Modal>
	);
}
