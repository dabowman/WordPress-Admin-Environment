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

/**
 * core:comments — moderation list backed by `useEntityRecords('root','comment')`.
 *
 * Status flow: hold → approved | spam | trash. The REST endpoint accepts
 * `status` updates via PATCH; we issue them through `saveEntityRecord` with a
 * partial payload so optimistic edits round-trip cleanly. Comment content
 * arrives HTML-rendered (already sanitized server-side by
 * `wp_filter_comment_content`); we render it via `dangerouslySetInnerHTML`.
 */
const STATUS_LABELS = {
	approved: __( 'Approved', 'wp-admin-shell' ),
	hold: __( 'Pending', 'wp-admin-shell' ),
	spam: __( 'Spam', 'wp-admin-shell' ),
	trash: __( 'Trash', 'wp-admin-shell' ),
};

const STATUS_VALUES = Object.keys( STATUS_LABELS );

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	author: __( 'Author', 'wp-admin-shell' ),
	content: __( 'Comment', 'wp-admin-shell' ),
	status: __( 'Status', 'wp-admin-shell' ),
	date: __( 'Date', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	approve: __( 'Approve', 'wp-admin-shell' ),
	unapprove: __( 'Unapprove', 'wp-admin-shell' ),
	spam: __( 'Mark as spam', 'wp-admin-shell' ),
	trash: __( 'Move to trash', 'wp-admin-shell' ),
};

/**
 * Snackbar copy for each non-trash status-change action. Keyed by spec id so a
 * cascade override that renames `spam` → `mark-as-spam` keeps the declared
 * label but loses the success message — the default fallback covers it.
 */
const STATUS_SUCCESS_LABELS = {
	approve: __( 'Approved.', 'wp-admin-shell' ),
	unapprove: __( 'Set to pending.', 'wp-admin-shell' ),
	spam: __( 'Marked as spam.', 'wp-admin-shell' ),
};

const STATUS_TARGETS = {
	approve: 'approved',
	unapprove: 'hold',
	spam: 'spam',
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
 * Field id → render callback. Module-scoped — renderers capture no props.
 */
const FIELD_RENDERERS = {
	author: ( { item } ) => (
		<Stack direction="column" gap="xs">
			<Text>{ item.author }</Text>
			<Text className="wp-admin-shell-app__muted">
				{ item.authorEmail }
			</Text>
		</Stack>
	),
	// Trust boundary: `item.content` is `record.content.rendered`, which
	// WordPress core filters server-side via `wp_filter_comment_content`
	// (kses + the comment-text filter chain). Author-supplied raw HTML has
	// been sanitized before it reaches the REST response.
	content: ( { item } ) => (
		<div
			className="wp-admin-shell-app-comments__excerpt"
			dangerouslySetInnerHTML={ { __html: item.content } }
		/>
	),
	status: ( { item } ) => (
		<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
	),
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
		return records.map( ( record ) => ( {
			id: record.id,
			author: record.author_name || '',
			authorEmail: record.author_email || '',
			content: record.content?.rendered || '',
			status: record.status,
			date: record.date,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const setCommentsStatus = useCallback(
		async ( items, targetStatus, label ) => {
			// `allSettled` so one failure in a bulk action doesn't collapse
			// the rest — symmetric with the trash modal.
			const results = await Promise.allSettled(
				items.map( ( item ) =>
					saveEntityRecord( 'root', 'comment', {
						id: item.id,
						status: targetStatus,
					} )
				)
			);
			invalidateResolution( 'getEntityRecords', [
				'root',
				'comment',
				queryArgs,
			] );
			// Status transitions move comments between buckets, so the
			// per-status count queries the filter labels read from need
			// to refresh too — same goes for the trash modal below.
			invalidateEntityElementCounts(
				invalidateResolution,
				'root',
				'comment',
				'status',
				STATUS_VALUES
			);
			const failed = results.filter(
				( r ) => r.status === 'rejected'
			).length;
			if ( failed === 0 ) {
				createSuccessNotice(
					label || __( 'Updated.', 'wp-admin-shell' ),
					{ type: 'snackbar' }
				);
			} else if ( failed === items.length ) {
				const firstError = results.find(
					( r ) => r.status === 'rejected'
				);
				createErrorNotice(
					firstError?.reason?.message ||
						__( 'Action failed.', 'wp-admin-shell' ),
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
							'wp-admin-shell'
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
			invalidateResolution,
			queryArgs,
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
				},
				elementCounts: {
					status: statusCounts,
				},
			} ),
		[ dataViewConfig, statusCounts ]
	);

	const actions = useMemo( () => {
		const trashModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __( 'Move this comment to trash?', 'wp-admin-shell' )
					: __( 'Move these comments to trash?', 'wp-admin-shell' ),
			confirmLabel: __( 'Trash', 'wp-admin-shell' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'root', 'comment', item.id ),
			onSettled: ( { items, failed } ) => {
				invalidateResolution( 'getEntityRecords', [
					'root',
					'comment',
					queryArgs,
				] );
				invalidateEntityElementCounts(
					invalidateResolution,
					'root',
					'comment',
					'status',
					STATUS_VALUES
				);
				if ( failed > 0 ) {
					createErrorNotice(
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d comment failed to move to trash.',
								'%1$d of %2$d comments failed to move to trash.',
								failed,
								'wp-admin-shell'
							),
							failed,
							items.length
						),
						{ isDismissible: true }
					);
				} else {
					createSuccessNotice(
						__( 'Moved to trash.', 'wp-admin-shell' ),
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
			},
			modals: { trash: trashModal },
		} );
	}, [
		dataViewConfig,
		setCommentsStatus,
		deleteEntityRecord,
		invalidateResolution,
		queryArgs,
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
		<div className="wp-admin-shell-app-comments wp-admin-shell-app--fill">
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
		</div>
	);
}
