import { useEffect, useMemo, useState } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __, sprintf, _n } from '@wordpress/i18n';
import { resolveIcon } from '../../runtime/config/iconMap';
import { useViewConfig } from '../../runtime/viewConfig/useViewConfig';

// View-config primitives ship as locale-agnostic JSON (spec §13 #7) — labels
// reach DataViews in whatever locale the spec was authored in. Recover the
// pre-C2 translation behavior by mapping known field/action ids to `__()`-
// wrapped strings at compile time. Unknown ids (plugin extension columns /
// actions) fall through to `spec.label` so third-party authors can still
// label their own additions.
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-shell' ),
	email: __( 'Email', 'wp-admin-shell' ),
	roles: __( 'Roles', 'wp-admin-shell' ),
	registered_date: __( 'Registered', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	delete: __( 'Delete', 'wp-admin-shell' ),
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
	sort: { field: 'name', direction: 'asc' },
	fields: [],
	layout: {},
};

/**
 * Field id → render callback. View-config declares the *shape* (id,
 * type, label, hide/sort/search flags); the React layer supplies the
 * row renderer. Unknown ids fall through to DataViews' default
 * renderer for the declared field type.
 */
function buildFieldRenderers() {
	return {
		name: ( { item } ) => (
			<Stack direction="column" gap="xs">
				<Text className="wp-admin-shell-app-users__name">
					{ item.name }
				</Text>
				<Text
					variant="body-sm"
					className="wp-admin-shell-app-users__muted"
				>
					{ item.username }
				</Text>
			</Stack>
		),
		email: ( { item } ) => <Text>{ item.email }</Text>,
		roles: ( { item } ) => <Text>{ item.roles }</Text>,
	};
}

/**
 * Compile a declarative `eligibleWhen` predicate into a DataViews
 * `isEligible(item)` callback. Supports `{ field: value | [values] }`
 * shape; absent → no eligibility filter (always shown).
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

function buildActions(
	actions,
	{
		deleteEntityRecord,
		invalidateResolution,
		queryArgs,
		createSuccessNotice,
		createErrorNotice,
	}
) {
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

			if ( spec.id === 'delete' ) {
				compiled.RenderModal = ( {
					items,
					closeModal,
					onActionPerformed,
				} ) => {
					const currentUserId = window.wpAdminShell?.userId;
					const targets = items.filter(
						( i ) => i.id !== currentUserId
					);
					const skipped = items.length - targets.length;
					return (
						<Stack
							direction="column"
							gap="lg"
							style={ {
								padding: 'var(--wpds-dimension-padding-lg)',
							} }
						>
							<Text>
								{ ( () => {
									if ( targets.length === 0 ) {
										return __(
											'You cannot delete your own account.',
											'wp-admin-shell'
										);
									}
									if ( targets.length === 1 ) {
										return __(
											'Delete this user permanently? Their content will be reassigned to you.',
											'wp-admin-shell'
										);
									}
									return __(
										'Delete these users permanently? Their content will be reassigned to you.',
										'wp-admin-shell'
									);
								} )() }
								{ skipped > 0 && targets.length > 0 && (
									<>
										{ ' ' }
										{ __(
											'(Your own account will be skipped.)',
											'wp-admin-shell'
										) }
									</>
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
									disabled={ targets.length === 0 }
									onClick={ async () => {
										if ( targets.length === 0 ) {
											createErrorNotice(
												__(
													'Cannot delete yourself.',
													'wp-admin-shell'
												)
											);
											closeModal();
											return;
										}
										// `allSettled` so one failure doesn't
										// collapse the rest of a bulk action;
										// surface partial-success via a
										// snackbar notice.
										const results =
											await Promise.allSettled(
												targets.map( ( item ) =>
													deleteEntityRecord(
														'root',
														'user',
														item.id,
														{
															force: true,
															reassign:
																currentUserId,
														}
													)
												)
											);
										const failed = results.filter(
											( r ) => r.status === 'rejected'
										).length;
										invalidateResolution(
											'getEntityRecords',
											[ 'root', 'user', queryArgs ]
										);
										if ( failed === 0 ) {
											createSuccessNotice(
												__(
													'User(s) deleted.',
													'wp-admin-shell'
												),
												{ type: 'snackbar' }
											);
										} else if ( failed < targets.length ) {
											createErrorNotice(
												sprintf(
													/* translators: 1: failed item count, 2: total item count */
													_n(
														'%1$d of %2$d user failed to delete.',
														'%1$d of %2$d users failed to delete.',
														targets.length,
														'wp-admin-shell'
													),
													failed,
													targets.length
												),
												{ isDismissible: true }
											);
										} else {
											const first = results.find(
												( r ) => r.status === 'rejected'
											);
											createErrorNotice(
												first?.reason?.message ||
													__(
														'Failed to delete user(s).',
														'wp-admin-shell'
													),
												{ isDismissible: true }
											);
										}
										onActionPerformed?.( targets );
										closeModal();
									} }
								>
									{ __( 'Delete', 'wp-admin-shell' ) }
								</DestructiveButton>
							</Stack>
						</Stack>
					);
				};
			}

			return compiled;
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

/**
 * core:users — DataViews list of WordPress users.
 *
 * Reads its DataViews spec via `useViewConfig('root', 'user')`. The
 * baseline ships in `app.json#viewConfig` and is injected post-merge by
 * `inject_app_baselines`; admin.json `viewConfigs.root.user._default`
 * wins on per-entry override; the per-triple filter
 * `wp_admin_shell_view_config_root_user` runs last.
 *
 * Reads via useEntityRecords('root', 'user') with `context: 'edit'` so
 * email + roles come back in the response. Bulk delete supported via
 * the deleteEntityRecord( 'root', 'user', id, { reassign, force: true } )
 * — users have no trash, so deletion is permanent.
 *
 * Plugin-contributed actions land via the core:users.row-actions data
 * slot (M4.5).
 */
export default function UsersApp() {
	const { config: viewConfig } = useViewConfig( 'root', 'user' );

	const [ view, setView ] = useState( () => ( {
		...VIEW_DEFAULTS,
		...viewConfig.defaultView,
	} ) );

	// Resync `view` when the triple flips on the same hook instance
	// (UsersApp ships a single triple today, but the recipe matches
	// PostsApp's so a future variant config — e.g. `?role=author` — picks
	// up without rewriting. Keyed only on the triple — not viewConfig —
	// to avoid clobbering in-session view edits whenever the cascade
	// re-resolves the doc shape.)
	useEffect( () => {
		setView( {
			...VIEW_DEFAULTS,
			...( viewConfig.defaultView || {} ),
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const queryArgs = useMemo( () => {
		const sortField = view.sort?.field || 'name';
		// Map our DataViews field id back to the REST orderby alias.
		const orderby =
			sortField === 'registered_date' ? 'registered_date' : sortField;
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'asc',
			orderby,
			context: 'edit',
		};
		if ( view.search ) {
			args.search = view.search;
		}
		for ( const filter of view.filters ) {
			if ( filter.field === 'roles' && filter.operator === 'is' ) {
				args.roles = filter.value;
			}
		}
		return args;
	}, [ view ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'user',
		queryArgs
	);

	const { deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => ( {
			id: record.id,
			name: record.name,
			email: record.email || '',
			username: record.username,
			roles: ( record.roles || [] ).join( ', ' ),
			registered_date: record.registered_date,
			rawRecord: record,
		} ) );
	}, [ records ] );

	// Strip the titleField from the visible-columns list. DataViews renders
	// the title cell from `view.titleField`; leaving the id in `view.fields`
	// would render a second column for the same field. PostsApp recipe.
	const visibleView = useMemo( () => {
		const titleField =
			view.titleField || viewConfig.defaultView?.titleField;
		if ( ! titleField || ! Array.isArray( view.fields ) ) {
			return view;
		}
		const fields = view.fields.filter( ( id ) => id !== titleField );
		if ( fields.length === view.fields.length ) {
			return view;
		}
		return { ...view, fields };
	}, [ view, viewConfig ] );

	const fields = useMemo(
		() => buildFields( viewConfig.fields ?? [], buildFieldRenderers() ),
		[ viewConfig ]
	);

	const actions = useMemo(
		() =>
			buildActions( viewConfig.actions ?? [], {
				deleteEntityRecord,
				invalidateResolution,
				queryArgs,
				createSuccessNotice,
				createErrorNotice,
			} ),
		[
			viewConfig,
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
		<div className="wp-admin-shell-app-users">
			<DataViews
				data={ data }
				fields={ fields }
				view={ visibleView }
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
