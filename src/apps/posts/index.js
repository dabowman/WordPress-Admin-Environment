import '../_shared/app.css';
import './index.css';
import { Spinner } from '@wordpress/components';
import { useMemo, useRef } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch, resolveSelect } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Badge, Button, Stack, Text } from '@wordpress/ui';
import { __, sprintf, _n } from '@wordpress/i18n';
import { dateI18n } from '@wordpress/date';
import { decodeEntities } from '@wordpress/html-entities';
import { navigate, useRoute } from '../../runtime/routing/router';
import { editHref } from './editHref.mjs';
import { useDataView } from '../../runtime/dataView/useDataView';
import { postDateLabel } from '../_shared/postDateLabel.mjs';
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

const STATUS_LABELS = {
	publish: __( 'Published', 'wp-admin-workspaces' ),
	draft: __( 'Draft', 'wp-admin-workspaces' ),
	pending: __( 'Pending', 'wp-admin-workspaces' ),
	private: __( 'Private', 'wp-admin-workspaces' ),
	future: __( 'Scheduled', 'wp-admin-workspaces' ),
	trash: __( 'Trash', 'wp-admin-workspaces' ),
};

const STATUS_VALUES = Object.keys( STATUS_LABELS );

// Bulk-edit status options — the writable statuses a row can be moved to. Trash
// has its own (confirmed) action and `future` is date-driven, so neither is a
// straight bulk-settable target.
const BULK_STATUS_LABELS = {
	publish: __( 'Published', 'wp-admin-workspaces' ),
	draft: __( 'Draft', 'wp-admin-workspaces' ),
	pending: __( 'Pending', 'wp-admin-workspaces' ),
	private: __( 'Private', 'wp-admin-workspaces' ),
};

// Post formats wp-admin's Bulk Edit exposes. REST writes these via the `format`
// param; `standard` clears the format.
const FORMAT_LABELS = {
	standard: __( 'Standard', 'wp-admin-workspaces' ),
	aside: __( 'Aside', 'wp-admin-workspaces' ),
	gallery: __( 'Gallery', 'wp-admin-workspaces' ),
	link: __( 'Link', 'wp-admin-workspaces' ),
	image: __( 'Image', 'wp-admin-workspaces' ),
	quote: __( 'Quote', 'wp-admin-workspaces' ),
	status: __( 'Status', 'wp-admin-workspaces' ),
	video: __( 'Video', 'wp-admin-workspaces' ),
	audio: __( 'Audio', 'wp-admin-workspaces' ),
	chat: __( 'Chat', 'wp-admin-workspaces' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	title: __( 'Title', 'wp-admin-workspaces' ),
	status: __( 'Status', 'wp-admin-workspaces' ),
	author: __( 'Author', 'wp-admin-workspaces' ),
	categories: __( 'Categories', 'wp-admin-workspaces' ),
	format: __( 'Format', 'wp-admin-workspaces' ),
	date: __( 'Date', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-workspaces' ),
	view: __( 'View', 'wp-admin-workspaces' ),
	'bulk-edit': __( 'Edit', 'wp-admin-workspaces' ),
	trash: __( 'Move to Trash', 'wp-admin-workspaces' ),
	restore: __( 'Restore', 'wp-admin-workspaces' ),
	'delete-permanent': __( 'Delete Permanently', 'wp-admin-workspaces' ),
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

// Per-taxonomy element cache for the categorical filter `getElements` providers.
// DataViews calls `getElements()` each time a filter opens; without a cache that
// would re-fetch the taxonomy every open. `resolveSelect` already memoizes the
// underlying core-data resolution, but caching the mapped `{ value, label }`
// array avoids re-decoding on every call too.
const taxonomyElementsCache = new Map();

/**
 * Build an async DataViews `getElements` provider for a taxonomy filter. Fetches
 * the terms via core-data (`resolveSelect`, never raw `fetch`) and maps them to
 * `{ value: termId, label: name }`. The result is cached per taxonomy so
 * re-opening the filter doesn't re-resolve.
 * @param {string} taxonomy Taxonomy rest base, e.g. `'category'`.
 * @return {Function} `async () => [ { value, label } ]`.
 */
function makeTaxonomyElements( taxonomy ) {
	return async () => {
		if ( taxonomyElementsCache.has( taxonomy ) ) {
			return taxonomyElementsCache.get( taxonomy );
		}
		const terms = await resolveSelect( coreStore ).getEntityRecords(
			'taxonomy',
			taxonomy,
			{ per_page: 100, orderby: 'name', order: 'asc', _fields: 'id,name' }
		);
		const elements = ( terms ?? [] ).map( ( term ) => ( {
			value: term.id,
			label: decodeEntities( term.name ),
		} ) );
		taxonomyElementsCache.set( taxonomy, elements );
		return elements;
	};
}

/**
 * Field id → render callback. View-config declares the *shape*; the React
 * layer supplies the row renderer. Unknown ids fall through to DataViews'
 * default renderer for the declared field type.
 * @param {string} postType Active post type id from app config.
 */
// Status-aware date label keys → localized strings, mirroring wp-admin's
// `column_date()`. `missed` is the past-due scheduled state.
const DATE_LABELS = {
	published: __( 'Published', 'wp-admin-workspaces' ),
	scheduled: __( 'Scheduled', 'wp-admin-workspaces' ),
	missed: __( 'Missed schedule', 'wp-admin-workspaces' ),
	modified: __( 'Last Modified', 'wp-admin-workspaces' ),
};

function buildFieldRenderers( postType ) {
	return {
		title: ( { item } ) => (
			<Stack
				direction="row"
				gap="xs"
				align="center"
				wrap="wrap"
				className="wp-admin-workspaces-app-posts__title"
			>
				<Button
					variant="minimal"
					onClick={ () => navigate( editHref( postType, item.id ) ) }
				>
					{ item.title }
				</Button>
				{ item.sticky && (
					<Badge intent="warning">
						{ __( 'Sticky', 'wp-admin-workspaces' ) }
					</Badge>
				) }
				{ item.passwordProtected && (
					<Badge intent="neutral">
						{ __( 'Password protected', 'wp-admin-workspaces' ) }
					</Badge>
				) }
			</Stack>
		),
		status: ( { item } ) => (
			<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
		),
		author: ( { item } ) => <Text>{ item.author }</Text>,
		// Status-aware date: "Published" / "Scheduled" / "Missed schedule" /
		// "Last Modified" above the formatted date, like wp-admin's Date column.
		date: ( { item } ) => {
			const { key, dateField, missedSchedule } = postDateLabel( item );
			const value = item[ dateField ];
			return (
				<Stack direction="column" gap="xs">
					<Text
						variant="body-sm"
						className={
							missedSchedule
								? 'wp-admin-workspaces-app-posts__date-missed'
								: 'wp-admin-workspaces-app__muted'
						}
					>
						{ DATE_LABELS[ key ] }
					</Text>
					{ value && (
						<Text variant="body-sm">
							{ dateI18n( 'M j, Y g:i a', value ) }
						</Text>
					) }
				</Stack>
			);
		},
	};
}

// Bulk-edit fields whose REST params are only registered for post types that
// support those features — `sticky` / `format` need `post`-format/sticky
// support, `categories` / `tags` need those taxonomies attached. Default
// (non-`post`) post types like `page` don't register them, so WP REST silently
// ignores the params: gate these fields on `post` to avoid presenting no-op
// inputs, mirroring how wp-admin omits Sticky/Format on the Pages list.
const POST_ONLY_BULK_FIELDS = [ 'sticky', 'format', 'categories', 'tags' ];

// Filter/column field specs whose categorical options only populate for `post`:
// `categories` resolves the category taxonomy and `format` the post-format set.
// On a non-`post` binding (the Pages screen reuses PostsApp) these field specs
// would otherwise surface in the DataViews filter UI with empty option sets, so
// drop the specs entirely — mirroring how POST_ONLY_BULK_FIELDS gates the
// bulk-edit form.
const POST_ONLY_FILTER_FIELDS = [ 'categories', 'format' ];

/**
 * Bulk-edit DataForm fields. Every field is seeded to the `NO_CHANGE` sentinel
 * by `createBulkEditModal`; `fieldsWithNoChange` injects the matching
 * `— No change —` option for the `elements`-backed selects. The non-elements
 * fields (author / parent / categories / tags) map the sentinel to an empty
 * input via `getValue` so the literal sentinel string never renders, and
 * `computeBulkPayload` drops them unless the user types a value.
 *
 * The post-only fields (`sticky` / `format` / `categories` / `tags`) are
 * omitted entirely for non-`post` post types — their REST params aren't
 * registered there, so editing them would be a silent no-op.
 * @param {string} postType Active post type id from app config.
 */
function buildBulkEditFields( postType ) {
	const isPost = postType === 'post';
	const sentinelToText =
		( id ) =>
		( { item } ) =>
			item?.[ id ] === NO_CHANGE ? '' : item?.[ id ] ?? '';

	const base = [
		{
			id: 'status',
			label: __( 'Status', 'wp-admin-workspaces' ),
			elements: elementsFromLabels( BULK_STATUS_LABELS ),
		},
		{
			id: 'sticky',
			label: __( 'Sticky', 'wp-admin-workspaces' ),
			elements: [
				{ value: 'true', label: __( 'Sticky', 'wp-admin-workspaces' ) },
				{
					value: 'false',
					label: __( 'Not sticky', 'wp-admin-workspaces' ),
				},
			],
		},
		{
			id: 'format',
			label: __( 'Format', 'wp-admin-workspaces' ),
			elements: elementsFromLabels( FORMAT_LABELS ),
		},
		{
			id: 'comment_status',
			label: __( 'Comments', 'wp-admin-workspaces' ),
			elements: [
				{ value: 'open', label: __( 'Allow', 'wp-admin-workspaces' ) },
				{
					value: 'closed',
					label: __( 'Do not allow', 'wp-admin-workspaces' ),
				},
			],
		},
		{
			id: 'author',
			type: 'integer',
			label: __( 'Author (user ID)', 'wp-admin-workspaces' ),
			getValue: sentinelToText( 'author' ),
		},
		{
			id: 'parent',
			type: 'integer',
			label: __( 'Parent (post ID)', 'wp-admin-workspaces' ),
			getValue: sentinelToText( 'parent' ),
		},
		{
			id: 'categories',
			type: 'text',
			label: __(
				'Categories (comma-separated IDs)',
				'wp-admin-workspaces'
			),
			getValue: sentinelToText( 'categories' ),
		},
		{
			id: 'tags',
			type: 'text',
			label: __( 'Tags (comma-separated IDs)', 'wp-admin-workspaces' ),
			getValue: sentinelToText( 'tags' ),
		},
	].filter(
		( field ) => isPost || ! POST_ONLY_BULK_FIELDS.includes( field.id )
	);

	return fieldsWithNoChange( base, {
		ids: [ 'status', 'sticky', 'format', 'comment_status' ],
	} );
}

/**
 * Bulk-edit DataForm field order. Post-only fields are dropped for non-`post`
 * post types so the form doesn't reference fields `buildBulkEditFields` omits.
 * @param {string} postType Active post type id from app config.
 */
function buildBulkEditForm( postType ) {
	const isPost = postType === 'post';
	return {
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
		].filter( ( id ) => isPost || ! POST_ONLY_BULK_FIELDS.includes( id ) ),
	};
}

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
 *
 * The free-text fields (author / parent / categories / tags) map the
 * `NO_CHANGE` sentinel to an empty input for display (`getValue` in
 * `buildBulkEditFields`). Focusing then clearing such a field stores `''`
 * rather than the sentinel, so `computeBulkPayload` would treat the blank as a
 * real edit — writing `author=undefined` or, worse, `parent=0` (which *removes*
 * a post's parent). Treat an empty string for these fields as no-change here so
 * only a non-empty value counts: drop the key before coercing.
 * @param {Object} payload Changed-field payload, keyed by field id.
 * @return {Object} REST body (without `id`, which the modal merges in).
 */
function bulkToRecord( payload ) {
	const body = { ...payload };
	// Blank free-text fields mean "leave unchanged" — strip them before any
	// coercion so a cleared-but-touched field can't write a spurious value.
	for ( const id of [ 'author', 'parent', 'categories', 'tags' ] ) {
		if ( id in body && ( body[ id ] === '' || body[ id ] === undefined ) ) {
			delete body[ id ];
		}
	}
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

/**
 * Coerce a raw author value (URL string or number) to a positive integer
 * author (user) id, or `null` when absent / non-numeric. Mirrors the
 * positive-int guard `parseIdList` applies — an interpolation miss leaves the
 * literal `"{author}"` placeholder, which must NOT seed a filter.
 * @param {*} raw Author value from `config.author` / the URL `?author=` slot.
 * @return {number|null} Positive author id, or null.
 */
function authorIdFromConfig( raw ) {
	const n = parseInt( raw, 10 );
	return Number.isInteger( n ) && n > 0 ? n : null;
}

export default function PostsApp( { config } ) {
	const postType = config.postType || 'post';
	const screenId = config.screenId || null;
	const currentUserId = window.wpAdminWorkspaces?.userId;

	// "View posts" (Users screen) scopes the list to one author via the
	// `?author=N` URL slot. The `posts` screen declares `config.author:
	// "{author}"`, but the primary content region resolves on `_self` (the
	// URL primary path), and `_self` interpolation only carries path params —
	// query params don't reach `config`. So read the slot directly off the URL
	// (`useRoute().params.author`) and fall back to `config.author` for any
	// region wiring that DOES interpolate it (e.g. a query-mode slot route).
	const routeAuthor = useRoute().params?.author;
	const authorFilterId = authorIdFromConfig( routeAuthor ?? config.author );

	const { config: dataViewConfig } = useDataView( screenId );

	// Seed the author scope once as an initial `author` view-filter — the same
	// filter field the "Mine" tab toggles, so `buildQueryArgs` emits `?author=N`
	// to REST. Folded into `viewDefaults` (a transient axis), so it survives the
	// resync re-seed and is NOT overwritten by saved durable prefs. Clearing it
	// via the filter UI updates the view and is respected until a screen flip.
	const viewDefaults = useMemo( () => {
		if ( authorFilterId === null ) {
			return VIEW_DEFAULTS;
		}
		return {
			...VIEW_DEFAULTS,
			filters: [
				...VIEW_DEFAULTS.filters,
				{ field: 'author', operator: 'is', value: authorFilterId },
			],
		};
	}, [ authorFilterId ] );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults,
		resyncKeys: [ postType, authorFilterId ],
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
	// Sticky is `post`-only — pass no values for other post types so the hook
	// short-circuits (no `?sticky=true` request that would count all rows).
	const stickyCount = useEntityElementCounts(
		'postType',
		postType,
		'sticky',
		postType === 'post' ? [ true ] : []
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
					__( '(no title)', 'wp-admin-workspaces' )
			),
			status: record.status,
			date: record.date,
			// `date_gmt` is always UTC (ends in `Z`) — used by `postDateLabel`
			// for timezone-stable missed-schedule detection. Absent on some
			// draft/auto-draft records; falls back to `date` in `postDateLabel`.
			date_gmt: record.date_gmt || '',
			modified: record.modified,
			// `_post_states` badges: sticky (post-only REST field) + password
			// protection (the `edit`-context `password` field is the raw
			// password — non-empty means protected).
			sticky: !! record.sticky,
			passwordProtected: !! record.password,
			author: record._embedded?.author?.[ 0 ]?.name || '',
			link: record.link,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo( () => {
		// On a non-`post` binding the `categories`/`format` filters carry no
		// resolvable options, so drop their field specs rather than surface
		// empty filter dropdowns (mirrors the POST_ONLY_BULK_FIELDS gate).
		const fieldSpecs =
			postType === 'post'
				? dataViewConfig.fields
				: dataViewConfig.fields.filter(
						( f ) => ! POST_ONLY_FILTER_FIELDS.includes( f.id )
				  );
		return buildFields( fieldSpecs, {
			labels: FIELD_LABELS,
			renderers: buildFieldRenderers( postType ),
			elementFallbacks: {
				status: elementsFromLabels( STATUS_LABELS ),
				// `format` is a finite known set — feed a static element list
				// so the categorical filter dropdown has options. (`post`
				// only; `format` isn't a registered REST param elsewhere.)
				...( postType === 'post'
					? { format: elementsFromLabels( FORMAT_LABELS ) }
					: {} ),
			},
			elementCounts: {
				status: statusCounts,
			},
			// `categories` options are dynamic — DataViews resolves them
			// lazily via `getElements` (fetching the category terms through
			// core-data). `post` only, mirroring the registered taxonomy.
			getElements:
				postType === 'post'
					? { categories: makeTaxonomyElements( 'category' ) }
					: {},
		} );
	}, [ dataViewConfig, postType, statusCounts ] );

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
			fields: buildBulkEditFields( postType ),
			form: buildBulkEditForm( postType ),
			toRecord: bulkToRecord,
			messages: {
				applyLabel: __( 'Update', 'wp-admin-workspaces' ),
			},
			onApplied: refreshAfterMutation,
		} );

		const trashModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to move this item to the trash?',
							'wp-admin-workspaces'
					  )
					: __(
							'Are you sure you want to move these items to the trash?',
							'wp-admin-workspaces'
					  ),
			confirmLabel: __( 'Move to Trash', 'wp-admin-workspaces' ),
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
							/* translators: %d: trashed item count */
							_n(
								'%d item moved to trash.',
								'%d items moved to trash.',
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

		// Delete Permanently is irreversible (force: true skips trash), so it
		// confirms before mutating like the trash flow does.
		const deletePermanentModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to permanently delete this item? This cannot be undone.',
							'wp-admin-workspaces'
					  )
					: __(
							'Are you sure you want to permanently delete these items? This cannot be undone.',
							'wp-admin-workspaces'
					  ),
			confirmLabel: __( 'Delete Permanently', 'wp-admin-workspaces' ),
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
							/* translators: %d: permanently deleted item count */
							_n(
								'%d item permanently deleted.',
								'%d items permanently deleted.',
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
								'wp-admin-workspaces'
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
								'wp-admin-workspaces'
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
				label: __( 'All', 'wp-admin-workspaces' ),
				filter: { field: 'status', operator: 'is', value: 'any' },
			},
		];
		if ( currentUserId ) {
			segments.push( {
				id: 'mine',
				label: __( 'Mine', 'wp-admin-workspaces' ),
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
			}
		);
		// Sticky is a `post`-only REST param — `?sticky=true` is silently
		// ignored on post types that don't register it (e.g. `page`), so the
		// count would return ALL rows and the tab wouldn't filter. Omit it for
		// non-`post` post types, mirroring wp-admin's Pages list.
		if ( postType === 'post' ) {
			segments.push( {
				id: 'sticky',
				label: __( 'Sticky', 'wp-admin-workspaces' ),
				filter: { field: 'sticky', operator: 'is', value: true },
			} );
		}
		return segments;
	}, [ currentUserId, postType ] );

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
		<div className="wp-admin-workspaces-app-posts wp-admin-workspaces-app--fill">
			{ ! records ? (
				<div className="wp-admin-workspaces-app__center">
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
