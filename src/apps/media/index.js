import './index.css';
import '../_shared/app.css';
import {
	useState,
	useMemo,
	useCallback,
	useRef,
	useEffect,
} from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch, resolveSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Icon, Stack, Text } from '@wordpress/ui';
import { Spinner, ToggleControl, Modal } from '@wordpress/components';
import { __, _n, sprintf } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
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
import { Page } from '../_shared/Page';

const MEDIA_TYPE_VALUES = [ 'image', 'video', 'audio', 'text', 'application' ];

// Plain English type labels for the mapped `typeLabel` cell. Kept in sync with
// the dataView `type` field elements; the count-augmented filter labels come
// from buildFields, this is just the table-cell display.
const FILTER_TYPE_LABELS = {
	image: __( 'Image', 'wp-admin-workspaces' ),
	video: __( 'Video', 'wp-admin-workspaces' ),
	audio: __( 'Audio', 'wp-admin-workspaces' ),
	text: __( 'Text', 'wp-admin-workspaces' ),
	application: __( 'Document', 'wp-admin-workspaces' ),
	file: __( 'File', 'wp-admin-workspaces' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	title: __( 'Title', 'wp-admin-workspaces' ),
	thumbnail: __( 'Preview', 'wp-admin-workspaces' ),
	type: __( 'Type', 'wp-admin-workspaces' ),
	author: __( 'Author', 'wp-admin-workspaces' ),
	date: __( 'Date', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-workspaces' ),
	'copy-url': __( 'Copy URL', 'wp-admin-workspaces' ),
	delete: __( 'Delete Permanently', 'wp-admin-workspaces' ),
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
// the media_type + author filters). Mine + Unattached are toolbar
// pseudo-filters merged as static args below; the date `before`/`after`
// operators are applied in a supplemental pass (the shared mapper only speaks
// `is`/`isAny`).
const QUERY_MAPPING = {
	search: 'search',
	sort: { defaultField: 'date', defaultDirection: 'desc' },
	filters: {
		type: { is: 'media_type' },
		author: { is: 'author' },
	},
};

/**
 * Apply the DataViews date filter (`before` / `after` operators) to the REST
 * args. `buildQueryArgs` only handles `is`/`isAny`, so the date range — which
 * maps to the attachments controller's `before` / `after` ISO params — is wired
 * here. Mirrors the Posts lane's `applyDateFilters` supplement.
 * @param {Object} args    REST args produced by `buildQueryArgs`.
 * @param {Array}  filters `view.filters`.
 * @return {Object} `args` with `before`/`after` applied where present.
 */
function applyDateFilters( args, filters ) {
	for ( const filter of Array.isArray( filters ) ? filters : [] ) {
		if ( filter.field !== 'date' || ! filter.value ) {
			continue;
		}
		if ( filter.operator === 'before' ) {
			args.before = filter.value;
		} else if ( filter.operator === 'after' ) {
			args.after = filter.value;
		}
	}
	return args;
}

/**
 * Find the active `author` DataViews view-filter (an `is`-operator entry with a
 * defined value), if any. The author dropdown filter and the Mine toggle both
 * scope by author; this lets the app keep them mutually consistent — one author
 * scope at a time. Returns the filter's value (a user id) or `null` when no
 * author filter is engaged.
 *
 * @param {Array} filters `view.filters`.
 * @return {number|string|null} The active author filter value, or `null`.
 */
function activeAuthorFilterValue( filters ) {
	for ( const filter of Array.isArray( filters ) ? filters : [] ) {
		if (
			filter.field === 'author' &&
			filter.value !== null &&
			filter.value !== undefined &&
			filter.value !== ''
		) {
			return filter.value;
		}
	}
	return null;
}

// Cache for the author filter `getElements` provider. DataViews calls
// `getElements()` each time the filter opens; caching the mapped
// `{ value, label }` array avoids re-decoding on every open. `resolveSelect`
// already memoizes the underlying core-data resolution.
let authorElementsCache = null;

/**
 * Async DataViews `getElements` provider for the author filter. Fetches users
 * able to author content via core-data (`resolveSelect`, never raw `fetch`) and
 * maps them to `{ value: userId, label: name }`, cached after the first open.
 * Mirrors how the Posts lane builds its taxonomy filter element providers.
 * @return {Promise<Array>} `[ { value, label } ]`.
 */
async function getAuthorElements() {
	if ( authorElementsCache ) {
		return authorElementsCache;
	}
	const users = await resolveSelect( coreStore ).getEntityRecords(
		'root',
		'user',
		{ who: 'authors', per_page: 100, _fields: 'id,name' }
	);
	authorElementsCache = ( users ?? [] ).map( ( user ) => ( {
		value: user.id,
		label: decodeEntities( user.name ),
	} ) );
	return authorElementsCache;
}

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
				className="wp-admin-workspaces-app-media__thumb"
				src={ item.thumbnail }
				alt={ item.altText || '' }
				loading="lazy"
			/>
		);
	}
	return (
		<div className="wp-admin-workspaces-app-media__file-icon">
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
	const currentUserId = window.wpAdminWorkspaces?.userId;

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

	// The author dropdown filter and the Mine toggle are two controls for the
	// same axis (author scope). Keep exactly one active: when an author
	// view-filter is engaged it is the single source of author scope, so the
	// Mine static arg is skipped (otherwise `buildQueryArgs` would overwrite it
	// with the dropdown value, leaving Mine checked while another author's media
	// showed — contradictory state).
	const authorFilterValue = useMemo(
		() => activeAuthorFilterValue( view.filters ),
		[ view.filters ]
	);
	const authorFilterActive = authorFilterValue !== null;

	// Mine reflects reality, not a standalone boolean: checked when the Mine
	// static scope is the active author scope (toggle on, no dropdown filter
	// overriding it) OR when the dropdown's author value happens to be the
	// current user. Compare as strings so a string filter value ('5') matches a
	// numeric current-user id (5).
	const mineChecked = authorFilterActive
		? String( authorFilterValue ) === String( currentUserId )
		: showMine;

	// Toggling Mine takes over the author axis. One author scope at a time, no
	// contradiction:
	// - ON  drops any active author dropdown filter so Mine is the single scope.
	// - OFF clears the static scope AND any author dropdown filter — when Mine
	//   reads checked solely because the dropdown points at the current user
	//   (`mineChecked` derives from the filter), unchecking must drop that
	//   filter too, otherwise the toggle would snap back checked (inert toggle).
	const handleMineToggle = useCallback(
		( next ) => {
			if ( authorFilterActive ) {
				setView( ( current ) => ( {
					...current,
					filters: ( current.filters ?? [] ).filter(
						( filter ) => filter.field !== 'author'
					),
				} ) );
			}
			setShowMine( next );
		},
		[ authorFilterActive, setView ]
	);

	// The symmetric half of `handleMineToggle`: whenever an author dropdown
	// filter becomes the active scope, actually clear the Mine static scope
	// rather than only suppressing it in the derived `mineChecked`/`queryArgs`
	// guards. Without this, `showMine` could stay latently `true` underneath an
	// author filter, producing two bugs once the filter cleared: (1) clearing
	// the dropdown would silently resurface the user's OWN media (Mine
	// re-applies `author=currentUserId`) instead of returning to all media, and
	// (2) selecting yourself in the dropdown made the Mine toggle inert (a
	// `handleMineToggle(false)` no-op). Keyed on `authorFilterActive` so it only
	// fires on the false→true transition — no render loop.
	useEffect( () => {
		if ( authorFilterActive ) {
			setShowMine( false );
		}
	}, [ authorFilterActive ] );

	const queryArgs = useMemo( () => {
		// `_embed: 'author'` so each record carries `_embedded.author[0].name`
		// for the Author column — `record.author` alone is a bare numeric id.
		const staticArgs = { context: 'edit', _embed: 'author' };
		// Skip the Mine static author arg when an explicit author filter is the
		// active scope — the filter wins and is applied by buildQueryArgs.
		if ( showMine && currentUserId && ! authorFilterActive ) {
			staticArgs.author = currentUserId;
		}
		if ( showUnattached ) {
			staticArgs.parent = 0;
		}
		const args = buildQueryArgs( view, QUERY_MAPPING, staticArgs );
		// The DataViews date filter maps to REST `before`/`after`, which
		// `buildQueryArgs` doesn't express — apply it as a supplemental pass.
		return applyDateFilters( args, view.filters );
	}, [ view, showMine, showUnattached, currentUserId, authorFilterActive ] );

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
									'wp-admin-workspaces'
								),
								file.name,
								err?.message ||
									__(
										'Upload failed.',
										'wp-admin-workspaces'
									)
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
								'wp-admin-workspaces'
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
				__( '(no title)', 'wp-admin-workspaces' ),
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
			// Prefer the embedded author display name; fall back to em dash
			// while the embed resolves (or if the author can't be embedded).
			author: record._embedded?.author?.[ 0 ]?.name || '—',
			date: record.date,
			source_url: record.source_url,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: FIELD_RENDERERS,
				elementCounts: { type: typeCounts },
				// Author filter options resolve lazily — DataViews calls the
				// provider when the filter opens (fetches authors via core-data).
				getElements: { author: getAuthorElements },
			} ),
		[ dataViewConfig, typeCounts ]
	);

	const actions = useMemo( () => {
		const deleteModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to permanently delete this attachment? This cannot be undone.',
							'wp-admin-workspaces'
					  )
					: __(
							'Are you sure you want to permanently delete these attachments? This cannot be undone.',
							'wp-admin-workspaces'
					  ),
			confirmLabel: __( 'Delete Permanently', 'wp-admin-workspaces' ),
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
								'wp-admin-workspaces'
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
								'wp-admin-workspaces'
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
							__(
								'URL copied to clipboard.',
								'wp-admin-workspaces'
							),
							{ type: 'snackbar' }
						);
					} catch ( err ) {
						createErrorNotice(
							err?.message ||
								__(
									'Failed to copy URL.',
									'wp-admin-workspaces'
								),
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
		<Page
			before={
				<Stack direction="row" align="center" gap="lg">
					{ /* Only offer the Mine toggle when the current user id
						     is known — without it the filter would no-op. */ }
					{ currentUserId ? (
						<ToggleControl
							__nextHasNoMarginBottom
							label={ __( 'Mine', 'wp-admin-workspaces' ) }
							checked={ mineChecked }
							onChange={ handleMineToggle }
						/>
					) : null }
					<ToggleControl
						__nextHasNoMarginBottom
						label={ __( 'Unattached', 'wp-admin-workspaces' ) }
						checked={ showUnattached }
						onChange={ setShowUnattached }
					/>
				</Stack>
			}
			actions={
				<>
					<Button
						tone="brand"
						variant="solid"
						onClick={ () => fileInputRef.current?.click() }
						loading={ isUploading }
						disabled={ isUploading }
						size="compact"
					>
						<Icon icon={ upload } size={ 16 } />
						{ __( 'Upload', 'wp-admin-workspaces' ) }
					</Button>
					<input
						ref={ fileInputRef }
						type="file"
						multiple
						onChange={ handleUpload }
						style={ { display: 'none' } }
					/>
				</>
			}
		>
			{ ! records ? (
				<div className="wp-admin-workspaces-app__center">
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
		</Page>
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
			title={ __( 'Media Details', 'wp-admin-workspaces' ) }
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
