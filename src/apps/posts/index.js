import '../_shared/app.css';
import { Spinner } from '@wordpress/components';
import { useMemo, useRef } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Text } from '@wordpress/ui';
import { __, sprintf, _n } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { navigate } from '../../runtime/routing/router';
import { useDataView } from '../../runtime/dataView/useDataView';
import {
	buildFields,
	elementsFromLabels,
} from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import {
	useEntityElementCounts,
	invalidateEntityElementCounts,
} from '../_shared/dataviews/useEntityElementCounts';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';
import {
	createBulkEditModal,
	fieldsWithNoChange,
} from '../_shared/dataviews/BulkEditModal';
import { NO_CHANGE } from '../_shared/dataviews/bulkEditPayload.mjs';
import { buildQueryArgs } from '../_shared/dataviews/buildQueryArgs.mjs';
import ViewTabs from '../_shared/dataviews/ViewTabs';

/**
 * Map a post type id to the URL hash that opens its editor route.
 * Routes are bundled in shells that surface PostsApp + the native
 * editor (e.g. single-pane-demo). The `post` / `page` post types get their own pluralized
 * paths (`/posts/{id}/edit`, `/pages/{id}/edit`) — site-editor post
 * types (`wp_template`, `wp_block`, `wp_navigation`) need their own
 * edit canvas + URL-encoding (slug-shaped ids); defer until those
 * screens land.
 * @param {*} postType
 * @param {*} id
 */
function editHref( postType, id ) {
	const segment = postType === 'page' ? 'pages' : 'posts';
	return `#/${ segment }/${ id }/edit`;
}

const STATUS_LABELS = {
	publish: __( 'Published', 'wp-admin-shell' ),
	draft: __( 'Draft', 'wp-admin-shell' ),
	pending: __( 'Pending', 'wp-admin-shell' ),
	private: __( 'Private', 'wp-admin-shell' ),
	future: __( 'Scheduled', 'wp-admin-shell' ),
	trash: __( 'Trash', 'wp-admin-shell' ),
};

const STATUS_VALUES = Object.keys( STATUS_LABELS );

// Bulk-edit status options — the writable statuses a row can be moved to. Trash
// has its own (confirmed) action and `future` is date-driven, so neither is a
// straight bulk-settable target.
const BULK_STATUS_LABELS = {
	publish: __( 'Published', 'wp-admin-shell' ),
	draft: __( 'Draft', 'wp-admin-shell' ),
	pending: __( 'Pending', 'wp-admin-shell' ),
	private: __( 'Private', 'wp-admin-shell' ),
};

// Post formats wp-admin's Bulk Edit exposes. REST writes these via the `format`
// param; `standard` clears the format.
const FORMAT_LABELS = {
	standard: __( 'Standard', 'wp-admin-shell' ),
	aside: __( 'Aside', 'wp-admin-shell' ),
	gallery: __( 'Gallery', 'wp-admin-shell' ),
	link: __( 'Link', 'wp-admin-shell' ),
	image: __( 'Image', 'wp-admin-shell' ),
	quote: __( 'Quote', 'wp-admin-shell' ),
	status: __( 'Status', 'wp-admin-shell' ),
	video: __( 'Video', 'wp-admin-shell' ),
	audio: __( 'Audio', 'wp-admin-shell' ),
	chat: __( 'Chat', 'wp-admin-shell' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	title: __( 'Title', 'wp-admin-shell' ),
	status: __( 'Status', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
	categories: __( 'Categories', 'wp-admin-shell' ),
	format: __( 'Format', 'wp-admin-shell' ),
	date: __( 'Date', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-shell' ),
	view: __( 'View', 'wp-admin-shell' ),
	'bulk-edit': __( 'Edit', 'wp-admin-shell' ),
	trash: __( 'Move to Trash', 'wp-admin-shell' ),
	restore: __( 'Restore', 'wp-admin-shell' ),
	'delete-permanent': __( 'Delete Permanently', 'wp-admin-shell' ),
};

const VIEW_DEFAULTS = {
	type: 'table',
	search: '',
	filters: [],
	page: 1,
	perPage: 20,
	sort: { field: 'date', direction: 'desc' },
	fields: [],
	layout: {},
};

/**
 * Declarative `view` → REST query mapping consumed by `buildQueryArgs`.
 * Status / author / categories / format all collapse to single REST params;
 * the date `before`/`after` operators are applied in a supplemental pass (the
 * shared mapper only speaks `is`/`isAny`).
 */
const QUERY_MAPPING = {
	sort: { defaultField: 'date', defaultDirection: 'desc' },
	filters: {
		status: { is: 'status', isAny: 'status' },
		author: { is: 'author' },
		categories: { is: 'categories' },
		format: { is: 'format' },
	},
};

/**
 * Apply the DataViews date filter (`before` / `after` operators) to the REST
 * args. `buildQueryArgs` only handles `is`/`isAny`, so the date range — which
 * maps to REST's `before` / `after` ISO params — is wired here.
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
 * Field id → render callback. View-config declares the *shape*; the React
 * layer supplies the row renderer. Unknown ids fall through to DataViews'
 * default renderer for the declared field type.
 * @param {string} postType Active post type id from app config.
 */
function buildFieldRenderers( postType ) {
	return {
		title: ( { item } ) => (
			<Button
				variant="minimal"
				onClick={ () => navigate( editHref( postType, item.id ) ) }
			>
				{ item.title }
			</Button>
		),
		status: ( { item } ) => (
			<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
		),
		author: ( { item } ) => <Text>{ item.author }</Text>,
	};
}

/**
 * Bulk-edit DataForm fields. Every field is seeded to the `NO_CHANGE` sentinel
 * by `createBulkEditModal`; `fieldsWithNoChange` injects the matching
 * `— No change —` option for the `elements`-backed selects. The non-elements
 * fields (author / parent / categories / tags) map the sentinel to an empty
 * input via `getValue` so the literal sentinel string never renders, and
 * `computeBulkPayload` drops them unless the user types a value.
 */
function buildBulkEditFields() {
	const sentinelToText =
		( id ) =>
		( { item } ) =>
			item?.[ id ] === NO_CHANGE ? '' : item?.[ id ] ?? '';

	const base = [
		{
			id: 'status',
			label: __( 'Status', 'wp-admin-shell' ),
			elements: elementsFromLabels( BULK_STATUS_LABELS ),
		},
		{
			id: 'sticky',
			label: __( 'Sticky', 'wp-admin-shell' ),
			elements: [
				{ value: 'true', label: __( 'Sticky', 'wp-admin-shell' ) },
				{
					value: 'false',
					label: __( 'Not sticky', 'wp-admin-shell' ),
				},
			],
		},
		{
			id: 'format',
			label: __( 'Format', 'wp-admin-shell' ),
			elements: elementsFromLabels( FORMAT_LABELS ),
		},
		{
			id: 'comment_status',
			label: __( 'Comments', 'wp-admin-shell' ),
			elements: [
				{ value: 'open', label: __( 'Allow', 'wp-admin-shell' ) },
				{
					value: 'closed',
					label: __( 'Do not allow', 'wp-admin-shell' ),
				},
			],
		},
		{
			id: 'author',
			type: 'integer',
			label: __( 'Author (user ID)', 'wp-admin-shell' ),
			getValue: sentinelToText( 'author' ),
		},
		{
			id: 'parent',
			type: 'integer',
			label: __( 'Parent (post ID)', 'wp-admin-shell' ),
			getValue: sentinelToText( 'parent' ),
		},
		{
			id: 'categories',
			type: 'text',
			label: __( 'Categories (comma-separated IDs)', 'wp-admin-shell' ),
			getValue: sentinelToText( 'categories' ),
		},
		{
			id: 'tags',
			type: 'text',
			label: __( 'Tags (comma-separated IDs)', 'wp-admin-shell' ),
			getValue: sentinelToText( 'tags' ),
		},
	];

	return fieldsWithNoChange( base, {
		ids: [ 'status', 'sticky', 'format', 'comment_status' ],
	} );
}

const BULK_EDIT_FORM = {
	type: 'regular',
	fields: [
		'status',
		'author',
		'sticky',
		'parent',
		'format',
		'comment_status',
		'categories',
		'tags',
	],
};

/**
 * Parse a comma-separated id list into an array of positive integers.
 * @param {string|Array} value Comma-separated id string (or already an array).
 * @return {Array} Positive integer ids.
 */
function parseIdList( value ) {
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value !== 'string' ) {
		return [];
	}
	return value
		.split( ',' )
		.map( ( part ) => parseInt( part.trim(), 10 ) )
		.filter( ( n ) => Number.isInteger( n ) && n > 0 );
}

/**
 * Translate the changed bulk-edit payload into a REST body. Only fields the
 * user actually changed reach here (`computeBulkPayload` already dropped the
 * sentinel-valued ones), so each branch fires only when present.
 * @param {Object} payload Changed-field payload, keyed by field id.
 * @return {Object} REST body (without `id`, which the modal merges in).
 */
function bulkToRecord( payload ) {
	const body = { ...payload };
	if ( 'sticky' in body ) {
		body.sticky = body.sticky === 'true' || body.sticky === true;
	}
	if ( 'author' in body ) {
		body.author = parseInt( body.author, 10 ) || undefined;
	}
	if ( 'parent' in body ) {
		body.parent = parseInt( body.parent, 10 ) || 0;
	}
	if ( 'categories' in body ) {
		body.categories = parseIdList( body.categories );
	}
	if ( 'tags' in body ) {
		body.tags = parseIdList( body.tags );
	}
	return body;
}

export default function PostsApp( { config } ) {
	const postType = config.postType || 'post';
	const screenId = config.screenId || null;
	const currentUserId = window.wpAdminShell?.userId;

	const { config: dataViewConfig } = useDataView( screenId );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
		resyncKeys: [ postType ],
	} );

	const queryArgs = useMemo( () => {
		const args = buildQueryArgs( view, QUERY_MAPPING, {
			status: config.status || 'any',
			context: 'edit',
			_embed: 'author',
		} );
		// Sticky is a boolean REST param surfaced through the Sticky view tab
		// (it has no DataViews filter field), so it's applied off the raw view
		// filters here rather than through the declarative mapping.
		for ( const filter of view.filters ) {
			if ( filter.field === 'sticky' && filter.operator === 'is' ) {
				args.sticky = filter.value === true || filter.value === 'true';
			}
		}
		return applyDateFilters( args, view.filters );
	}, [ view, config.status ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'postType',
		postType,
		queryArgs
	);

	const statusCounts = useEntityElementCounts(
		'postType',
		postType,
		'status',
		STATUS_VALUES
	);

	// Counts for the "Mine" and "Sticky" view tabs ride their own count queries
	// (different REST fields than status). Keyed by the value each tab's filter
	// applies so `mergeSegmentCounts` can match them.
	const mineCount = useEntityElementCounts(
		'postType',
		postType,
		'author',
		currentUserId ? [ currentUserId ] : []
	);
	const stickyCount = useEntityElementCounts(
		'postType',
		postType,
		'sticky',
		[ true ]
	);

	// Total across all statuses for the "All" tab — one extra count keyed by the
	// `any` filter value the All tab applies.
	const anyCount = useEntityElementCounts( 'postType', postType, 'status', [
		'any',
	] );

	const { deleteEntityRecord, saveEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createNotice } = useDispatch( noticesStore );

	// Re-entry guard for the non-modal `restore` callback — mirrors the
	// `isBusy` guard the confirm-modal flows get from `createBulkConfirmModal`,
	// so a fast double-click can't fire two restore batches.
	const restoreBusy = useRef( false );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => ( {
			id: record.id,
			title: decodeEntities(
				record.title?.rendered ||
					record.title?.raw ||
					__( '(no title)', 'wp-admin-shell' )
			),
			status: record.status,
			date: record.date,
			author: record._embedded?.author?.[ 0 ]?.name || '',
			link: record.link,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers( postType ),
				elementFallbacks: {
					status: elementsFromLabels( STATUS_LABELS ),
				},
				elementCounts: {
					status: statusCounts,
				},
			} ),
		[ dataViewConfig, postType, statusCounts ]
	);

	const actions = useMemo( () => {
		// Status mutations move rows between filters, so the list query and the
		// per-status count queries the filter labels read from both refresh.
		const refreshAfterMutation = () => {
			invalidateResolution( 'getEntityRecords', [
				'postType',
				postType,
				queryArgs,
			] );
			invalidateEntityElementCounts(
				invalidateResolution,
				'postType',
				postType,
				'status',
				STATUS_VALUES
			);
		};

		const bulkEditModal = createBulkEditModal( {
			entity: [ 'postType', postType ],
			fields: buildBulkEditFields(),
			form: BULK_EDIT_FORM,
			toRecord: bulkToRecord,
			messages: {
				applyLabel: __( 'Update', 'wp-admin-shell' ),
			},
			onApplied: refreshAfterMutation,
		} );

		const trashModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to move this item to the trash?',
							'wp-admin-shell'
					  )
					: __(
							'Are you sure you want to move these items to the trash?',
							'wp-admin-shell'
					  ),
			confirmLabel: __( 'Move to Trash', 'wp-admin-shell' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'postType', postType, item.id ),
			onSettled: ( { targets, failed } ) => {
				refreshAfterMutation();
				if ( failed > 0 ) {
					createNotice(
						'error',
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d item failed to move to trash.',
								'%1$d of %2$d items failed to move to trash.',
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
							/* translators: %d: trashed item count */
							_n(
								'%d item moved to trash.',
								'%d items moved to trash.',
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

		// Delete Permanently is irreversible (force: true skips trash), so it
		// confirms before mutating like the trash flow does.
		const deletePermanentModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to permanently delete this item? This cannot be undone.',
							'wp-admin-shell'
					  )
					: __(
							'Are you sure you want to permanently delete these items? This cannot be undone.',
							'wp-admin-shell'
					  ),
			confirmLabel: __( 'Delete Permanently', 'wp-admin-shell' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'postType', postType, item.id, {
					force: true,
				} ),
			onSettled: ( { targets, failed } ) => {
				refreshAfterMutation();
				if ( failed > 0 ) {
					createNotice(
						'error',
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d item failed to delete.',
								'%1$d of %2$d items failed to delete.',
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
							/* translators: %d: permanently deleted item count */
							_n(
								'%d item permanently deleted.',
								'%d items permanently deleted.',
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

		// Restore untrashes the selected rows. Classic wp-admin restores to the
		// pre-trash status (`_wp_trash_meta_status`); REST doesn't expose that
		// meta, so we restore to `draft` — an accepted divergence documented in
		// docs/parity/posts.md (blocker #4).
		const restore = async ( items, { onActionPerformed } = {} ) => {
			if ( restoreBusy.current ) {
				return;
			}
			restoreBusy.current = true;
			try {
				const results = await Promise.allSettled(
					items.map( ( item ) =>
						saveEntityRecord( 'postType', postType, {
							id: item.id,
							status: 'draft',
						} )
					)
				);
				refreshAfterMutation();
				const failed = results.filter(
					( r ) => r.status === 'rejected'
				).length;
				if ( failed > 0 ) {
					createNotice(
						'error',
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d item failed to restore.',
								'%1$d of %2$d items failed to restore.',
								failed,
								'wp-admin-shell'
							),
							failed,
							items.length
						),
						{ type: 'snackbar' }
					);
				} else {
					createNotice(
						'success',
						sprintf(
							/* translators: %d: restored item count */
							_n(
								'%d item restored to draft.',
								'%d items restored to draft.',
								items.length,
								'wp-admin-shell'
							),
							items.length
						),
						{ type: 'snackbar' }
					);
				}
				// Clear the selection for the rows that actually restored —
				// mirrors the modal flows' onActionPerformed(succeeded).
				const succeeded = items.filter(
					( _item, i ) => results[ i ]?.status === 'fulfilled'
				);
				onActionPerformed?.( succeeded );
			} finally {
				restoreBusy.current = false;
			}
		};

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				edit: ( items ) =>
					navigate( editHref( postType, items[ 0 ].id ) ),
				view: ( items ) => {
					window.open(
						items[ 0 ].link,
						'_blank',
						'noopener,noreferrer'
					);
				},
				restore,
			},
			modals: {
				'bulk-edit': bulkEditModal,
				trash: trashModal,
				'delete-permanent': deletePermanentModal,
			},
		} );
	}, [
		dataViewConfig,
		postType,
		deleteEntityRecord,
		saveEntityRecord,
		invalidateResolution,
		queryArgs,
		createNotice,
	] );

	// --- View tabs (#111) ----------------------------------------------------
	// Status / Mine / Sticky one-click view switches above the list, mirroring
	// wp-admin's subsubsub strip. Each segment's `filter` is the `view.filters`
	// entry the tab applies; the count is keyed by `filter.value`.
	const tabSegments = useMemo( () => {
		const segments = [
			{
				id: 'all',
				label: __( 'All', 'wp-admin-shell' ),
				filter: { field: 'status', operator: 'is', value: 'any' },
			},
		];
		if ( currentUserId ) {
			segments.push( {
				id: 'mine',
				label: __( 'Mine', 'wp-admin-shell' ),
				filter: {
					field: 'author',
					operator: 'is',
					value: currentUserId,
				},
			} );
		}
		segments.push(
			{
				id: 'publish',
				label: STATUS_LABELS.publish,
				filter: { field: 'status', operator: 'is', value: 'publish' },
			},
			{
				id: 'draft',
				label: STATUS_LABELS.draft,
				filter: { field: 'status', operator: 'is', value: 'draft' },
			},
			{
				id: 'pending',
				label: STATUS_LABELS.pending,
				filter: { field: 'status', operator: 'is', value: 'pending' },
			},
			{
				id: 'sticky',
				label: __( 'Sticky', 'wp-admin-shell' ),
				filter: { field: 'sticky', operator: 'is', value: true },
			}
		);
		return segments;
	}, [ currentUserId ] );

	// Merge the multi-source counts into one { filterValue: count } map keyed
	// the way ViewTabs/mergeSegmentCounts looks them up.
	const tabCounts = useMemo(
		() => ( {
			...statusCounts,
			...anyCount,
			...( currentUserId !== undefined
				? { [ currentUserId ]: mineCount[ currentUserId ] }
				: {} ),
			true: stickyCount.true,
		} ),
		[ statusCounts, anyCount, mineCount, stickyCount, currentUserId ]
	);

	// Derive the active tab from the live view filters: an author=me filter →
	// Mine, a sticky filter → Sticky, a status filter → that status (or All for
	// `any` / no status filter). Author/sticky filters take precedence so the
	// Mine/Sticky tabs stay highlighted even with a status default present.
	const activeTab = useMemo( () => {
		const filters = view.filters || [];
		if (
			currentUserId &&
			filters.some(
				( f ) => f.field === 'author' && f.value === currentUserId
			)
		) {
			return 'mine';
		}
		if (
			filters.some(
				( f ) =>
					f.field === 'sticky' &&
					( f.value === true || f.value === 'true' )
			)
		) {
			return 'sticky';
		}
		const statusFilter = filters.find( ( f ) => f.field === 'status' );
		const value = statusFilter?.value;
		if ( ! value || value === 'any' ) {
			return 'all';
		}
		const match = tabSegments.find(
			( seg ) =>
				seg.filter.field === 'status' && seg.filter.value === value
		);
		return match ? match.id : undefined;
	}, [ view.filters, currentUserId, tabSegments ] );

	const onSelectTab = ( segment ) => {
		// Replace any status / author / sticky filter with the segment's filter;
		// preserve other filters (date / categories / format). The "All" tab
		// clears the status scope entirely rather than pinning `status=any` as a
		// filter chip.
		const preserved = ( view.filters || [] ).filter(
			( f ) =>
				f.field !== 'status' &&
				f.field !== 'author' &&
				f.field !== 'sticky'
		);
		const nextFilters =
			segment.id === 'all' ? preserved : [ ...preserved, segment.filter ];
		setView( { ...view, filters: nextFilters, page: 1 } );
	};

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	return (
		<div className="wp-admin-shell-app-posts wp-admin-shell-app--fill">
			{ ! records ? (
				<div className="wp-admin-shell-app__center">
					<Spinner />
				</div>
			) : (
				<>
					<ViewTabs
						segments={ tabSegments }
						currentValue={ activeTab }
						onSelect={ onSelectTab }
						counts={ tabCounts }
					/>
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
				</>
			) }
		</div>
	);
}
