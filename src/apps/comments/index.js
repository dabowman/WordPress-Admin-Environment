import './index.css';
import { useCallback, useEffect, useMemo, useState } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __, sprintf, _n } from '@wordpress/i18n';
import { resolveIcon } from '../../runtime/config/iconMap';
import { useViewConfig } from '../../runtime/viewConfig/useViewConfig';

/**
 * core:comments — moderation list backed by `useEntityRecords('root','comment')`.
 *
 * Status flow: hold → approved | spam | trash. The REST endpoint accepts
 * `status` updates via PATCH; we issue them through `saveEntityRecord`
 * with a partial payload so optimistic edits round-trip cleanly. Comment
 * content arrives HTML-rendered; we rely on `dangerouslySetInnerHTML`
 * because WPDS `Text` doesn't pass HTML through. The HTML is already
 * sanitized server-side by `wp_filter_comment_content`.
 */
const STATUS_LABELS = {
	approved: __( 'Approved', 'wp-admin-shell' ),
	hold: __( 'Pending', 'wp-admin-shell' ),
	spam: __( 'Spam', 'wp-admin-shell' ),
	trash: __( 'Trash', 'wp-admin-shell' ),
};

// View-config primitives ship as locale-agnostic JSON (spec §13 #7) —
// labels reach DataViews in whatever locale the spec was authored in.
// Recover pre-C2 translation by mapping known field/action ids to
// `__()`-wrapped strings at compile time. Unknown ids (plugin extension
// columns / actions) fall through to `spec.label` so third-party authors
// can still label their own additions.
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
 * Snackbar copy for each non-trash status-change action. Keyed by spec id
 * so a cascade override that renames `spam` → `mark-as-spam` keeps the
 * declared label (via `ACTION_LABELS`) but loses the success message —
 * which is fine; the default fallback below covers it.
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

/**
 * Shape defaults for DataViews `view` state. Spread under the resolved
 * `defaultView` so iteration over `view.filters` / `view.fields` is safe
 * when admin.json omits empty-list keys.
 */
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
 * Field id → render callback. View-config declares the *shape* (id,
 * type, label, hide/sort/search flags); the React layer supplies the
 * row renderer. Unknown ids fall through to DataViews' default
 * renderer for the declared field type.
 */
const FIELD_RENDERERS = {
	author: ( { item } ) => (
		<Stack direction="column" gap="xs">
			<Text className="wp-admin-shell-app-comments__name">
				{ item.author }
			</Text>
			<Text
				variant="body-sm"
				className="wp-admin-shell-app-comments__muted"
			>
				{ item.authorEmail }
			</Text>
		</Stack>
	),
	// Trust boundary: `item.content` is `record.content.rendered`, which
	// WordPress core filters server-side via `wp_filter_comment_content`
	// (kses + the comment-text filter chain). Author-supplied raw HTML
	// has been sanitized before it reaches the REST response.
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

/**
 * Compile a declarative `eligibleWhen` predicate into a DataViews
 * `isEligible(item)` callback. Supports `{ field: value | [values] }`
 * shape; absent → no eligibility filter (always shown).
 *
 * @param {Object} eligibleWhen Eligibility map.
 */
function compileEligibility( eligibleWhen ) {
	if ( ! eligibleWhen || typeof eligibleWhen !== 'object' ) {
		return undefined;
	}
	const entries = Object.entries( eligibleWhen );
	if ( entries.length === 0 ) {
		return undefined;
	}
	return ( item ) =>
		entries.every( ( [ field, expected ] ) => {
			const actual = item?.[ field ];
			if ( Array.isArray( expected ) ) {
				return expected.includes( actual );
			}
			return actual === expected;
		} );
}

function buildFields( fieldSpecs, fieldRenderers ) {
	return fieldSpecs
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				type: spec.type,
				label: FIELD_LABELS[ spec.id ] ?? spec.label,
			};
			if ( spec.enableGlobalSearch !== undefined ) {
				compiled.enableGlobalSearch = !! spec.enableGlobalSearch;
			}
			if ( spec.enableHiding !== undefined ) {
				compiled.enableHiding = !! spec.enableHiding;
			}
			if ( spec.enableSorting !== undefined ) {
				compiled.enableSorting = !! spec.enableSorting;
			}
			if ( Array.isArray( spec.elements ) ) {
				compiled.elements = spec.elements;
			} else if ( spec.id === 'status' && ! spec.elements ) {
				compiled.elements = Object.entries( STATUS_LABELS ).map(
					( [ value, label ] ) => ( { value, label } )
				);
			}
			if ( spec.filterBy ) {
				compiled.filterBy = spec.filterBy;
			}
			if ( fieldRenderers[ spec.id ] ) {
				compiled.render = fieldRenderers[ spec.id ];
			}
			return compiled;
		} );
}

function buildActions(
	actions,
	{
		setCommentsStatus,
		deleteEntityRecord,
		invalidateResolution,
		queryArgs,
		createSuccessNotice,
		createErrorNotice,
	}
) {
	const callbacks = {
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
	};

	return actions
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				label: ACTION_LABELS[ spec.id ] ?? spec.label,
				isPrimary: !! spec.isPrimary,
				isDestructive: !! spec.isDestructive,
				supportsBulk: !! spec.supportsBulk,
				icon: spec.icon ? resolveIcon( spec.icon ) : undefined,
				isEligible: compileEligibility( spec.eligibleWhen ),
			};

			if ( spec.id === 'trash' ) {
				compiled.RenderModal = ( {
					items,
					closeModal,
					onActionPerformed,
				} ) => (
					<Stack
						direction="column"
						gap="lg"
						style={ {
							padding: 'var(--wpds-dimension-padding-lg)',
						} }
					>
						<Text>
							{ items.length === 1
								? __(
										'Move this comment to trash?',
										'wp-admin-shell'
								  )
								: __(
										'Move these comments to trash?',
										'wp-admin-shell'
								  ) }
						</Text>
						<Stack direction="row" justify="flex-end" gap="sm">
							<Button
								tone="neutral"
								variant="minimal"
								onClick={ closeModal }
							>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<DestructiveButton
								variant="primary"
								isDestructive
								onClick={ async () => {
									// `allSettled` so one failure doesn't
									// collapse the rest of a bulk action.
									const results = await Promise.allSettled(
										items.map( ( item ) =>
											deleteEntityRecord(
												'root',
												'comment',
												item.id
											)
										)
									);
									const failed = results.filter(
										( r ) => r.status === 'rejected'
									).length;
									invalidateResolution( 'getEntityRecords', [
										'root',
										'comment',
										queryArgs,
									] );
									if ( failed > 0 ) {
										createErrorNotice(
											sprintf(
												/* translators: 1: failed item count, 2: total item count */
												_n(
													'%1$d of %2$d comment failed to move to trash.',
													'%1$d of %2$d comments failed to move to trash.',
													items.length,
													'wp-admin-shell'
												),
												failed,
												items.length
											),
											{ isDismissible: true }
										);
									} else {
										createSuccessNotice(
											__(
												'Moved to trash.',
												'wp-admin-shell'
											),
											{ type: 'snackbar' }
										);
									}
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Trash', 'wp-admin-shell' ) }
							</DestructiveButton>
						</Stack>
					</Stack>
				);
			} else if ( callbacks[ spec.id ] ) {
				compiled.callback = callbacks[ spec.id ];
			}

			return compiled;
		} );
}

export default function CommentsApp( { config = {} } ) {
	const variant = config.variant || null;

	const { config: viewConfig } = useViewConfig( 'root', 'comment', variant );

	const [ view, setView ] = useState( () => ( {
		...VIEW_DEFAULTS,
		...viewConfig.defaultView,
	} ) );

	// Resync `view` when the variant flips on the same hook instance.
	// `useState`'s initializer runs once, so without this effect a
	// second variant inherits the first's perPage / sort / filters.
	// Keyed only on the triple — not viewConfig — to avoid clobbering
	// in-session view edits whenever the cascade re-resolves the doc.
	useEffect( () => {
		setView( {
			...VIEW_DEFAULTS,
			...( viewConfig.defaultView || {} ),
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ variant ] );

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
			// the rest — symmetric with the trash modal. Partial failure
			// surfaces as an error notice with the failed/total count.
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
			const failed = results.filter(
				( r ) => r.status === 'rejected'
			).length;
			if ( failed === 0 ) {
				createSuccessNotice(
					label || __( 'Updated.', 'wp-admin-shell' ),
					{ type: 'snackbar' }
				);
			} else if ( failed === items.length ) {
				// Everything failed — surface the first rejection's message
				// so authors get a real reason, not a generic count.
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
							items.length,
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
		() => buildFields( viewConfig.fields ?? [], FIELD_RENDERERS ),
		[ viewConfig ]
	);

	const actions = useMemo(
		() =>
			buildActions( viewConfig.actions ?? [], {
				setCommentsStatus,
				deleteEntityRecord,
				invalidateResolution,
				queryArgs,
				createSuccessNotice,
				createErrorNotice,
			} ),
		[
			viewConfig,
			setCommentsStatus,
			deleteEntityRecord,
			invalidateResolution,
			queryArgs,
			createSuccessNotice,
			createErrorNotice,
		]
	);

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	const [ selection, setSelection ] = useState( [] );

	return (
		<div className="wp-admin-shell-app-comments">
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isResolving }
				defaultLayouts={ viewConfig.defaultLayouts ?? {} }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>
		</div>
	);
}
