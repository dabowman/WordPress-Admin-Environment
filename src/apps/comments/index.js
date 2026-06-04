import './index.css';
import { Spinner } from '@wordpress/components';
import '../_shared/app.css';
import { useCallback, useMemo } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Stack, Text } from '@wordpress/ui';
import { __, sprintf, _n } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { useDataView } from '../../runtime/dataView/useDataView';
import { userCan } from '../../runtime/capabilities/userCan';
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
import { createEntityFormModal } from '../_shared/dataviews/EntityFormModal';
import ViewTabs from '../_shared/dataviews/ViewTabs';

/**
 * core:comments — moderation list backed by `useEntityRecords('root','comment')`.
 *
 * Status flow: hold → approved | spam | trash, plus the inverse transitions —
 * unspam (spam → approved), restore (trash → approved), and permanent delete
 * (`force`). The REST endpoint accepts `status` updates via PATCH; we issue them
 * through `saveEntityRecord` with a partial payload so optimistic edits
 * round-trip cleanly. Comment content arrives HTML-rendered (already sanitized
 * server-side by `wp_filter_comment_content`); we render it via
 * `dangerouslySetInnerHTML`.
 *
 * Single-comment Edit (Quick Edit ≡ full Edit, collapsed into one modal) and
 * Reply ride the shared `createEntityFormModal` factory — Edit in edit mode
 * (PATCH the buffered record), Reply in create mode (content-only POST with the
 * row's `parent`/`post`). Inline-in-row placement is upstream-blocked (DataViews
 * has no editable-cell / detail-row primitive), so both ship as modal actions.
 */
const STATUS_LABELS = {
	approved: __( 'Approved', 'wp-admin-workspaces' ),
	hold: __( 'Pending', 'wp-admin-workspaces' ),
	spam: __( 'Spam', 'wp-admin-workspaces' ),
	trash: __( 'Trash', 'wp-admin-workspaces' ),
};

const STATUS_VALUES = Object.keys( STATUS_LABELS );

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	author: __( 'Author', 'wp-admin-workspaces' ),
	content: __( 'Comment', 'wp-admin-workspaces' ),
	response: __( 'In response to', 'wp-admin-workspaces' ),
	status: __( 'Status', 'wp-admin-workspaces' ),
	date: __( 'Date', 'wp-admin-workspaces' ),
	type: __( 'Type', 'wp-admin-workspaces' ),
};

// Comment-type filter options (Comments / Pings), mapped to the REST `type`
// collection param. `pings` resolves to pingbacks + trackbacks server-side.
const TYPE_ELEMENTS = [
	{ value: 'comment', label: __( 'Comments', 'wp-admin-workspaces' ) },
	{ value: 'pings', label: __( 'Pings', 'wp-admin-workspaces' ) },
];

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-workspaces' ),
	reply: __( 'Reply', 'wp-admin-workspaces' ),
	approve: __( 'Approve', 'wp-admin-workspaces' ),
	unapprove: __( 'Unapprove', 'wp-admin-workspaces' ),
	spam: __( 'Mark as spam', 'wp-admin-workspaces' ),
	unspam: __( 'Not spam', 'wp-admin-workspaces' ),
	trash: __( 'Move to trash', 'wp-admin-workspaces' ),
	untrash: __( 'Restore', 'wp-admin-workspaces' ),
	'delete-permanently': __( 'Delete permanently', 'wp-admin-workspaces' ),
};

/**
 * Snackbar copy for each non-destructive status-change action. Keyed by spec id
 * so a cascade override that renames `spam` → `mark-as-spam` keeps the declared
 * label but loses the success message — the default fallback covers it.
 */
const STATUS_SUCCESS_LABELS = {
	approve: __( 'Approved.', 'wp-admin-workspaces' ),
	unapprove: __( 'Set to pending.', 'wp-admin-workspaces' ),
	spam: __( 'Marked as spam.', 'wp-admin-workspaces' ),
	unspam: __( 'No longer marked as spam.', 'wp-admin-workspaces' ),
	untrash: __( 'Restored.', 'wp-admin-workspaces' ),
};

/**
 * Target status for each status-flip action. `unspam` and `untrash` both
 * resolve to `approved` — mirroring wp-admin, where "Not Spam" and "Restore"
 * return a comment to the approved queue (not its prior pending state, which
 * REST does not preserve).
 */
const STATUS_TARGETS = {
	approve: 'approved',
	unapprove: 'hold',
	spam: 'spam',
	unspam: 'approved',
	untrash: 'approved',
};

// View-tab segments — the classic All | Pending | Approved | Spam | Trash strip.
// `filter.value` is the REST `status` arg `useEntityElementCounts` keys on; the
// counts object is `{ approved, hold, spam, trash }`. "All" carries no count
// (it's the unfiltered `status: 'any'` base, not a single status value).
const VIEW_TAB_SEGMENTS = [
	{ id: 'all', label: __( 'All', 'wp-admin-workspaces' ), filter: null },
	{
		id: 'hold',
		label: __( 'Pending', 'wp-admin-workspaces' ),
		filter: { field: 'status', value: 'hold' },
	},
	{
		id: 'approved',
		label: __( 'Approved', 'wp-admin-workspaces' ),
		filter: { field: 'status', value: 'approved' },
	},
	{
		id: 'spam',
		label: __( 'Spam', 'wp-admin-workspaces' ),
		filter: { field: 'status', value: 'spam' },
	},
	{
		id: 'trash',
		label: __( 'Trash', 'wp-admin-workspaces' ),
		filter: { field: 'status', value: 'trash' },
	},
];

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
 * Derive the active view-tab segment id from the current `view.filters`. A
 * single `status` filter (`is`/`isAny` on one value) maps to that segment; an
 * absent or multi-value status filter falls back to "all".
 *
 * @param {Object} view DataViews controlled view shape.
 * @return {string} The active segment id.
 */
function activeSegmentId( view ) {
	const statusFilter = ( view.filters ?? [] ).find(
		( f ) => f.field === 'status'
	);
	if ( ! statusFilter ) {
		return 'all';
	}
	const { value } = statusFilter;
	const single = Array.isArray( value ) ? value : [ value ];
	if ( single.length !== 1 ) {
		return 'all';
	}
	const match = VIEW_TAB_SEGMENTS.find(
		( seg ) => seg.filter && seg.filter.value === single[ 0 ]
	);
	return match ? match.id : 'all';
}

/**
 * Author cell renderer. Stacks avatar + name + email (`mailto:`) + author URL
 * link, and — for users who can `moderate_comments` — the author IP. All fields
 * already ride the `edit`-context REST record; only the moderate gate hides IP.
 *
 * Module-scoped — captures no props. The `canModerate` flag is resolved once at
 * module load via `userCan` (the cap map is static for the session).
 *
 * @param {Object} root0
 * @param {Object} root0.item The DataViews row.
 * @return {JSX.Element} The author cell.
 */
const canModerate = userCan( 'moderate_comments' );

function AuthorCell( { item } ) {
	return (
		<Stack
			direction="row"
			gap="sm"
			align="flex-start"
			className="wp-admin-workspaces-app-comments__author"
		>
			{ item.avatarUrl ? (
				<img
					className="wp-admin-workspaces-app-comments__avatar"
					src={ item.avatarUrl }
					alt=""
					width={ 32 }
					height={ 32 }
				/>
			) : null }
			<Stack direction="column" gap="xs">
				<Text>
					<strong>
						{ item.author ||
							__( 'Anonymous', 'wp-admin-workspaces' ) }
					</strong>
				</Text>
				{ item.authorEmail ? (
					<a
						className="wp-admin-workspaces-app-comments__author-email"
						href={ `mailto:${ item.authorEmail }` }
					>
						{ item.authorEmail }
					</a>
				) : null }
				{ item.authorUrl ? (
					<a
						className="wp-admin-workspaces-app-comments__author-url"
						href={ item.authorUrl }
						target="_blank"
						rel="noopener noreferrer"
					>
						{ item.authorUrlDisplay }
					</a>
				) : null }
				{ canModerate && item.authorIp ? (
					<Text className="wp-admin-workspaces-app__muted">
						{ item.authorIp }
					</Text>
				) : null }
			</Stack>
		</Stack>
	);
}

/**
 * Workspace editor hash-route for a comment's parent post. `page` post types
 * get `/pages/{id}/edit`; everything else falls back to `/posts/{id}/edit`
 * (the same convention PostsApp's `editHref` uses). Returns `''` for post types
 * without a workspace edit canvas so the renderer can fall back to the
 * permalink. Rendered as `<a href="#/…">` so the kernel router handles it.
 *
 * @param {string} postType Embedded post `type`.
 * @param {number} postId   Comment's `post` id.
 * @return {string} Hash route, or '' when no editor route applies.
 */
function postEditHref( postType, postId ) {
	if ( ! postId ) {
		return '';
	}
	if ( postType === 'page' ) {
		return `#/pages/${ postId }/edit`;
	}
	if ( postType === 'post' ) {
		return `#/posts/${ postId }/edit`;
	}
	return '';
}

/**
 * "In response to" cell. Deep-links the parent post: the title routes to the
 * workspace post editor when one exists (post / page), and a "View Post" link
 * opens the live permalink. Mirrors wp-admin's `column_response`.
 *
 * @param {Object} root0
 * @param {Object} root0.item The DataViews row.
 * @return {JSX.Element} The response cell.
 */
function ResponseCell( { item } ) {
	if ( ! item.post ) {
		return <Text className="wp-admin-workspaces-app__muted">—</Text>;
	}
	const editHref = postEditHref( item.postType, item.post );
	const title =
		item.postTitle || __( '(no title)', 'wp-admin-workspaces' );
	return (
		<Stack direction="column" gap="xs">
			{ editHref ? (
				<a href={ editHref }>{ title }</a>
			) : (
				<Text>{ title }</Text>
			) }
			{ item.postLink ? (
				<a
					className="wp-admin-workspaces-app__muted"
					href={ item.postLink }
					target="_blank"
					rel="noopener noreferrer"
				>
					{ __( 'View Post', 'wp-admin-workspaces' ) }
				</a>
			) : null }
		</Stack>
	);
}

/**
 * Field id → render callback. Module-scoped — renderers capture no props.
 */
const FIELD_RENDERERS = {
	author: AuthorCell,
	response: ResponseCell,
	// Trust boundary: `item.content` is `record.content.rendered`, which
	// WordPress core filters server-side via `wp_filter_comment_content`
	// (kses + the comment-text filter chain). Author-supplied raw HTML has
	// been sanitized before it reaches the REST response.
	content: ( { item } ) => (
		<div
			className="wp-admin-workspaces-app-comments__excerpt"
			dangerouslySetInnerHTML={ { __html: item.content } }
		/>
	),
	status: ( { item } ) => (
		<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
	),
};

// ---- Edit / Reply DataForm field + form definitions ------------------------

const STATUS_ELEMENTS = STATUS_VALUES.map( ( value ) => ( {
	value,
	label: STATUS_LABELS[ value ],
} ) );

// Edit-modal fields. `author_email` is gated behind `moderate_comments` via the
// form layout (built below) — non-moderators never reach this app (the app cap
// floor is `moderate_comments`), but the gate is kept explicit for parity with
// the spec and any future relaxed floor.
const EDIT_FIELDS = [
	{
		id: 'author_name',
		type: 'text',
		label: __( 'Name', 'wp-admin-workspaces' ),
	},
	{
		id: 'author_email',
		type: 'email',
		label: __( 'Email', 'wp-admin-workspaces' ),
	},
	{
		id: 'author_url',
		type: 'text',
		label: __( 'URL', 'wp-admin-workspaces' ),
	},
	{
		id: 'content',
		type: 'text',
		label: __( 'Comment', 'wp-admin-workspaces' ),
		Edit: { control: 'textarea', rows: 6 },
	},
	{
		id: 'status',
		type: 'text',
		label: __( 'Status', 'wp-admin-workspaces' ),
		elements: STATUS_ELEMENTS,
		Edit: 'select',
	},
	{
		id: 'date',
		type: 'datetime',
		label: __( 'Date', 'wp-admin-workspaces' ),
	},
];

const EDIT_FORM = {
	layout: { type: 'regular', labelPosition: 'top' },
	fields: [
		'author_name',
		...( canModerate ? [ 'author_email' ] : [] ),
		'author_url',
		'content',
		'status',
		'date',
	],
};

const REPLY_FIELDS = [
	{
		id: 'content',
		type: 'text',
		label: __( 'Reply', 'wp-admin-workspaces' ),
		Edit: { control: 'textarea', rows: 6 },
		isValid: { required: true },
	},
];

const REPLY_FORM = {
	layout: { type: 'regular', labelPosition: 'top' },
	fields: [ 'content' ],
};

export default function CommentsApp( { config = {} } ) {
	const screenId = config.screenId || null;

	const { config: dataViewConfig } = useDataView( screenId );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'desc',
			// REST orderby alias for date is `date_gmt`, not `date`.
			orderby:
				view.sort?.field === 'date'
					? 'date_gmt'
					: view.sort?.field || 'date_gmt',
			context: 'edit',
			status: 'any',
			// Embed the `up` link (parent post) so the "In response to" column
			// names + deep-links the post without an N+1 fetch per row.
			_embed: 'up',
			// Default to real comments — `WP_Comment_Query` would otherwise
			// surface pingbacks/trackbacks under `'all'`. The Comments/Pings
			// filter (below) overrides this.
			type: 'comment',
		};
		if ( view.search ) {
			args.search = view.search;
		}
		for ( const filter of view.filters ) {
			if ( filter.field === 'status' ) {
				if (
					filter.operator === 'isAny' &&
					Array.isArray( filter.value )
				) {
					args.status = filter.value.join( ',' );
				} else if ( filter.operator === 'is' ) {
					args.status = filter.value;
				}
			} else if (
				filter.field === 'type' &&
				filter.operator === 'is' &&
				filter.value
			) {
				// `comment` (default) | `pings` (pingbacks + trackbacks).
				args.type = filter.value;
			}
		}
		return args;
	}, [ view ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'comment',
		queryArgs
	);

	const statusCounts = useEntityElementCounts(
		'root',
		'comment',
		'status',
		STATUS_VALUES
	);

	const { saveEntityRecord, deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => {
			const avatarUrls = record.author_avatar_urls || {};
			// Prefer the 48px avatar, fall back to whatever size is present.
			const avatarUrl =
				avatarUrls[ '48' ] ||
				avatarUrls[ '96' ] ||
				avatarUrls[ '24' ] ||
				Object.values( avatarUrls )[ 0 ] ||
				'';
			const authorUrl = record.author_url || '';
			// The embedded parent post (`_embed: 'up'`) supplies the "In
			// response to" title + permalink + post type without a per-row fetch.
			const embeddedPost = record._embedded?.up?.[ 0 ] || null;
			return {
				id: record.id,
				author: decodeEntities( record.author_name || '' ),
				authorEmail: decodeEntities( record.author_email || '' ),
				authorUrl,
				// Strip the protocol for a tidier display label, like wp-admin.
				authorUrlDisplay: authorUrl.replace( /^https?:\/\//, '' ),
				authorIp: record.author_ip || '',
				avatarUrl,
				content: record.content?.rendered || '',
				status: record.status,
				date: record.date,
				type: record.type || 'comment',
				post: record.post,
				postTitle: embeddedPost
					? decodeEntities(
							embeddedPost.title?.rendered ||
								embeddedPost.title?.raw ||
								''
					  )
					: '',
				postLink: embeddedPost?.link || '',
				postType: embeddedPost?.type || '',
				rawRecord: record,
			};
		} );
	}, [ records ] );

	const refreshList = useCallback( () => {
		invalidateResolution( 'getEntityRecords', [
			'root',
			'comment',
			queryArgs,
		] );
		// Status transitions move comments between buckets, so the per-status
		// count queries the filter labels + view tabs read from refresh too.
		invalidateEntityElementCounts(
			invalidateResolution,
			'root',
			'comment',
			'status',
			STATUS_VALUES
		);
	}, [ invalidateResolution, queryArgs ] );

	const setCommentsStatus = useCallback(
		async ( items, targetStatus, label ) => {
			// `allSettled` so one failure in a bulk action doesn't collapse
			// the rest — symmetric with the destructive modals.
			const results = await Promise.allSettled(
				items.map( ( item ) =>
					saveEntityRecord( 'root', 'comment', {
						id: item.id,
						status: targetStatus,
					} )
				)
			);
			refreshList();
			const failed = results.filter(
				( r ) => r.status === 'rejected'
			).length;
			if ( failed === 0 ) {
				createSuccessNotice(
					label || __( 'Updated.', 'wp-admin-workspaces' ),
					{ type: 'snackbar' }
				);
			} else if ( failed === items.length ) {
				const firstError = results.find(
					( r ) => r.status === 'rejected'
				);
				createErrorNotice(
					firstError?.reason?.message ||
						__( 'Action failed.', 'wp-admin-workspaces' ),
					{ isDismissible: true }
				);
			} else {
				createErrorNotice(
					sprintf(
						/* translators: 1: failed item count, 2: total item count */
						_n(
							'%1$d of %2$d comment failed to update.',
							'%1$d of %2$d comments failed to update.',
							failed,
							'wp-admin-workspaces'
						),
						failed,
						items.length
					),
					{ isDismissible: true }
				);
			}
		},
		[
			saveEntityRecord,
			refreshList,
			createSuccessNotice,
			createErrorNotice,
		]
	);

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: FIELD_RENDERERS,
				elementFallbacks: {
					status: elementsFromLabels( STATUS_LABELS ),
					// Translated Comments/Pings options for the type filter; the
					// JSON field ships English labels, this localizes them.
					type: TYPE_ELEMENTS,
				},
				elementCounts: {
					status: statusCounts,
				},
			} ),
		[ dataViewConfig, statusCounts ]
	);

	const actions = useMemo( () => {
		// Modal Edit (Quick Edit ≡ full Edit) — PATCH the buffered record.
		const editModal = createEntityFormModal( {
			entity: [ 'root', 'comment' ],
			mode: 'edit',
			fields: EDIT_FIELDS,
			form: EDIT_FORM,
			// Near-identity: edit commits the buffered `editedRecord`, not a
			// re-mapped payload. We only normalize `content` from the rendered
			// shape into the raw string the textarea + PATCH expect.
			toData: ( record ) => ( {
				...record,
				content:
					typeof record?.content === 'string'
						? record.content
						: record?.content?.raw ??
						  record?.content?.rendered ??
						  '',
			} ),
			messages: {
				saved: __( 'Comment updated.', 'wp-admin-workspaces' ),
				error: __( 'Failed to update comment.', 'wp-admin-workspaces' ),
				saveLabel: __( 'Update', 'wp-admin-workspaces' ),
			},
			onSaved: refreshList,
		} );

		// Reply — content-only POST; `parent`/`post` come from the subject row.
		// `author` defaults to the current moderator server-side; the reply
		// auto-approves (the moderator is trusted).
		const replyModal = createEntityFormModal( {
			entity: [ 'root', 'comment' ],
			mode: 'create',
			fields: REPLY_FIELDS,
			form: REPLY_FORM,
			toData: () => ( { content: '' } ),
			toRecord: ( draft, item ) => ( {
				content: draft.content,
				parent: item?.id,
				post: item?.post,
			} ),
			renderContext: ( item ) => (
				<Stack
					direction="column"
					gap="xs"
					className="wp-admin-workspaces-app-comments__reply-context"
				>
					<Text className="wp-admin-workspaces-app__muted">
						{ sprintf(
							/* translators: %s: comment author name. */
							__( 'In reply to %s', 'wp-admin-workspaces' ),
							item.author ||
								__( 'Anonymous', 'wp-admin-workspaces' )
						) }
					</Text>
					<div
						className="wp-admin-workspaces-app-comments__excerpt"
						dangerouslySetInnerHTML={ { __html: item.content } }
					/>
				</Stack>
			),
			messages: {
				saved: __( 'Reply posted.', 'wp-admin-workspaces' ),
				error: __( 'Failed to post reply.', 'wp-admin-workspaces' ),
				createLabel: __( 'Reply', 'wp-admin-workspaces' ),
			},
			onSaved: refreshList,
		} );

		const trashModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __( 'Move this comment to trash?', 'wp-admin-workspaces' )
					: __(
							'Move these comments to trash?',
							'wp-admin-workspaces'
					  ),
			confirmLabel: __( 'Trash', 'wp-admin-workspaces' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'root', 'comment', item.id ),
			onSettled: ( { items, failed } ) => {
				refreshList();
				if ( failed > 0 ) {
					createErrorNotice(
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d comment failed to move to trash.',
								'%1$d of %2$d comments failed to move to trash.',
								failed,
								'wp-admin-workspaces'
							),
							failed,
							items.length
						),
						{ isDismissible: true }
					);
				} else {
					createSuccessNotice(
						__( 'Moved to trash.', 'wp-admin-workspaces' ),
						{ type: 'snackbar' }
					);
				}
			},
		} );

		const deleteModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Permanently delete this comment? This cannot be undone.',
							'wp-admin-workspaces'
					  )
					: __(
							'Permanently delete these comments? This cannot be undone.',
							'wp-admin-workspaces'
					  ),
			confirmLabel: __( 'Delete permanently', 'wp-admin-workspaces' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'root', 'comment', item.id, {
					force: true,
				} ),
			onSettled: ( { items, failed } ) => {
				refreshList();
				if ( failed > 0 ) {
					createErrorNotice(
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d comment failed to delete.',
								'%1$d of %2$d comments failed to delete.',
								failed,
								'wp-admin-workspaces'
							),
							failed,
							items.length
						),
						{ isDismissible: true }
					);
				} else {
					createSuccessNotice(
						__( 'Permanently deleted.', 'wp-admin-workspaces' ),
						{ type: 'snackbar' }
					);
				}
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				approve: ( items ) =>
					setCommentsStatus(
						items,
						STATUS_TARGETS.approve,
						STATUS_SUCCESS_LABELS.approve
					),
				unapprove: ( items ) =>
					setCommentsStatus(
						items,
						STATUS_TARGETS.unapprove,
						STATUS_SUCCESS_LABELS.unapprove
					),
				spam: ( items ) =>
					setCommentsStatus(
						items,
						STATUS_TARGETS.spam,
						STATUS_SUCCESS_LABELS.spam
					),
				unspam: ( items ) =>
					setCommentsStatus(
						items,
						STATUS_TARGETS.unspam,
						STATUS_SUCCESS_LABELS.unspam
					),
				untrash: ( items ) =>
					setCommentsStatus(
						items,
						STATUS_TARGETS.untrash,
						STATUS_SUCCESS_LABELS.untrash
					),
			},
			modals: {
				edit: editModal,
				reply: replyModal,
				trash: trashModal,
				'delete-permanently': deleteModal,
			},
		} );
	}, [
		dataViewConfig,
		setCommentsStatus,
		deleteEntityRecord,
		refreshList,
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

	const currentSegment = activeSegmentId( view );

	const onSelectSegment = useCallback(
		( segment ) => {
			setView( ( prev ) => {
				// Drop any existing status filter, then add the segment's (if
				// any). "All" carries no filter → unfiltered `status: 'any'`.
				const filters = ( prev.filters ?? [] ).filter(
					( f ) => f.field !== 'status'
				);
				if ( segment.filter ) {
					filters.push( {
						field: segment.filter.field,
						operator: 'is',
						value: segment.filter.value,
					} );
				}
				// Reset to page 1 — the new filter set has its own pagination.
				return { ...prev, filters, page: 1 };
			} );
		},
		[ setView ]
	);

	return (
		<div className="wp-admin-workspaces-app-comments wp-admin-workspaces-app--fill">
			{ ! records ? (
				<div className="wp-admin-workspaces-app__center">
					<Spinner />
				</div>
			) : (
				<>
					<ViewTabs
						segments={ VIEW_TAB_SEGMENTS }
						currentValue={ currentSegment }
						onSelect={ onSelectSegment }
						counts={ statusCounts }
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
