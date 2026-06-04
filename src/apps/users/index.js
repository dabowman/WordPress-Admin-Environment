import './index.css';
import '../_shared/app.css';
import { Spinner } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Stack, Text } from '@wordpress/ui';
import { __, sprintf, _n } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { navigate } from '../../runtime/routing/router';
import { useDataView } from '../../runtime/dataView/useDataView';
import { buildFields } from '../_shared/dataviews/buildFields.mjs';
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
import { DEFAULT_ROLES, roleDisplayName } from '../_shared/roles';

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-workspaces' ),
	username: __( 'Username', 'wp-admin-workspaces' ),
	email: __( 'Email', 'wp-admin-workspaces' ),
	roles: __( 'Role', 'wp-admin-workspaces' ),
	registered_date: __( 'Registered', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-workspaces' ),
	view: __( 'View posts', 'wp-admin-workspaces' ),
	'change-role': __( 'Change role to…', 'wp-admin-workspaces' ),
	delete: __( 'Delete', 'wp-admin-workspaces' ),
};

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
 * Workspace route for the Edit User screen (`user-edit` in wp-admin-default).
 * The list has no dedicated Edit User app yet — the workspace binds `/users/{id}/edit`
 * to `core:profile` with `config.userId: "{id}"`, and `core:profile` now edits
 * the user named by `config.userId` (not the acting user) — so "Edit" + the
 * username cell both edit the *target* user. See app.md "Known limitations".
 *
 * @param {number} id User id.
 * @return {string} Hash route.
 */
function editHref( id ) {
	return `#/users/${ id }/edit`;
}

/**
 * Workspace route for "View posts" — the author-scoped Posts list. Navigates to
 * the Posts screen with the `?author=N` URL slot set. `core:posts` reads that
 * slot (`useRoute().params.author`, with `config.author` — declared on the
 * screen as `"{author}"` — as the fallback) and seeds it once as an initial
 * `author` view-filter, so the shared `buildQueryArgs` mapper emits `?author=N`
 * to REST and the list is scoped to that author (the same author-filter
 * mechanism the Posts "Mine" tab uses). Router nav, never `window.location`, so
 * the admin-link interceptor governs it.
 *
 * @param {number} id Author (user) id.
 * @return {string} Hash route.
 */
function viewPostsHref( id ) {
	return `#/posts?author=${ id }`;
}

/**
 * Field id → render callback. View-config declares the *shape*; the React
 * layer supplies the row renderer.
 *
 * @param {Object} elementLabel `value` → `label` map for role slugs.
 * @return {Object} Renderer map keyed by field id.
 */
function buildFieldRenderers( elementLabel ) {
	return {
		// The username cell mirrors the classic Users screen primary column:
		// avatar + display name (linking to the edit surface) + username + a
		// `mailto:` email.
		name: ( { item } ) => (
			<Stack direction="row" gap="sm" align="center">
				{ item.avatarUrl && (
					<img
						className="wp-admin-workspaces-app-users__avatar"
						src={ item.avatarUrl }
						alt=""
						width={ 32 }
						height={ 32 }
						loading="lazy"
					/>
				) }
				<Stack direction="column" gap="xs">
					<a
						href={ editHref( item.id ) }
						className="wp-admin-workspaces-app-users__name-link"
					>
						{ item.name }
					</a>
					<Text className="wp-admin-workspaces-app__muted">
						{ item.username }
					</Text>
					{ item.email && (
						<a
							href={ `mailto:${ item.email }` }
							className="wp-admin-workspaces-app-users__email"
						>
							{ item.email }
						</a>
					) }
				</Stack>
			</Stack>
		),
		email: ( { item } ) =>
			item.email ? (
				<a href={ `mailto:${ item.email }` }>{ item.email }</a>
			) : (
				<Text>{ '—' }</Text>
			),
		roles: ( { item } ) => (
			<Text>
				{ item.roleSlugs.length
					? item.roleSlugs
							.map( ( slug ) =>
								roleDisplayName( slug, elementLabel )
							)
							.join( ', ' )
					: __( 'None', 'wp-admin-workspaces' ) }
			</Text>
		),
	};
}

/**
 * core:users — DataViews list of WordPress users.
 *
 * Reads its DataViews spec via `useDataView(screenId)`. Bulk delete uses
 * `deleteEntityRecord( 'root', 'user', id, { reassign, force: true } )` —
 * users have no trash, so deletion is permanent. The "Change role to…" bulk
 * action issues a roles-only `saveEntityRecord` per target (REST `PUT
 * /wp/v2/users/{id} { roles }` needs only `promote_users`). Both bulk actions
 * filter the acting user out of the target set: deletion would orphan the
 * acting account, and a self-demote would strip the admin's own caps
 * mid-flight.
 *
 * @param {Object} root0          Mount-supplied props.
 * @param {Object} [root0.config] App config — `config.screenId` keys the per-screen view lookup.
 */
export default function UsersApp( { config = {} } = {} ) {
	const screenId = config.screenId || null;
	const { config: dataViewConfig } = useDataView( screenId );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
	} );

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
			if ( filter.field !== 'roles' ) {
				continue;
			}
			// `is` carries a single role; `isAny` (emitted by the
			// `administrators` variant and by DataViews multi-select) carries an
			// array. REST `?roles=a,b` is OR-multi (`role__in`); there is no
			// AND-multi equivalent, so `isAll` is deliberately not mapped.
			if ( filter.operator === 'is' ) {
				if ( filter.value ) {
					args.roles = filter.value;
				}
			} else if ( filter.operator === 'isAny' ) {
				const values = Array.isArray( filter.value )
					? filter.value
					: [ filter.value ];
				if ( values.length ) {
					args.roles = values.join( ',' );
				}
			}
		}
		return args;
	}, [ view ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'user',
		queryArgs
	);

	// Role elements come from the resolved spec (workspace-authored `roles`
	// elements). One source of truth for: the filter dropdown counts, the
	// "Change role to…" select, and the translated cell display names.
	const roleElements = useMemo( () => {
		const roleField = ( dataViewConfig.fields ?? [] ).find(
			( field ) => field.id === 'roles'
		);
		return roleField?.elements ?? [];
	}, [ dataViewConfig ] );

	// Role slugs for the filter counts + the "Change role to…" select. Falls
	// back to the standard WordPress roles when a leaner override drops the spec
	// `elements` — mirrors the cell renderer's `STANDARD_ROLE_LABELS` fallback
	// and the `core:user-new` app, so the bulk action stays usable (an empty set
	// would leave the select with only the "— No change —" sentinel).
	const roleValues = useMemo( () => {
		const values = roleElements.map( ( element ) => element.value );
		return values.length ? values : DEFAULT_ROLES;
	}, [ roleElements ] );

	const elementLabel = useMemo( () => {
		const map = {};
		for ( const element of roleElements ) {
			map[ element.value ] = element.label;
		}
		return map;
	}, [ roleElements ] );

	const roleCounts = useEntityElementCounts(
		'root',
		'user',
		'roles',
		roleValues
	);

	const { deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => {
			const roleSlugs = Array.isArray( record.roles ) ? record.roles : [];
			const avatars = record.avatar_urls || {};
			return {
				id: record.id,
				name: decodeEntities( record.name || '' ),
				email: record.email || '',
				username: decodeEntities( record.username || '' ),
				roleSlugs,
				// `roles` stays a translated, comma-joined string so global
				// search / sort over the column reads naturally; the cell
				// renderer reads `roleSlugs` for the localized join.
				roles: roleSlugs
					.map( ( slug ) => roleDisplayName( slug, elementLabel ) )
					.join( ', ' ),
				avatarUrl: avatars[ '48' ] || avatars[ '96' ] || '',
				registered_date: record.registered_date,
				rawRecord: record,
			};
		} );
	}, [ records, elementLabel ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers( elementLabel ),
				elementCounts: {
					roles: roleCounts,
				},
			} ),
		[ dataViewConfig, roleCounts, elementLabel ]
	);

	const actions = useMemo( () => {
		const currentUserId = window.wpAdminWorkspaces?.userId;

		const deleteModal = createBulkConfirmModal( {
			filterItems: ( items ) =>
				items.filter( ( i ) => i.id !== currentUserId ),
			isConfirmDisabled: ( targets ) => targets.length === 0,
			getMessage: ( items, targets ) => {
				const skipped = items.length - targets.length;
				let body;
				if ( targets.length === 0 ) {
					body = __(
						'You cannot delete your own account.',
						'wp-admin-workspaces'
					);
				} else if ( targets.length === 1 ) {
					body = __(
						'Delete this user permanently? Their content will be reassigned to you.',
						'wp-admin-workspaces'
					);
				} else {
					body = __(
						'Delete these users permanently? Their content will be reassigned to you.',
						'wp-admin-workspaces'
					);
				}
				return (
					<>
						{ body }
						{ skipped > 0 && targets.length > 0 && (
							<>
								{ ' ' }
								{ __(
									'(Your own account will be skipped.)',
									'wp-admin-workspaces'
								) }
							</>
						) }
					</>
				);
			},
			confirmLabel: __( 'Delete', 'wp-admin-workspaces' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'root', 'user', item.id, {
					force: true,
					reassign: currentUserId,
				} ),
			onSettled: ( { targets, results, failed } ) => {
				invalidateResolution( 'getEntityRecords', [
					'root',
					'user',
					queryArgs,
				] );
				// Deletes shrink role buckets, so the per-role count
				// queries the filter labels read from need to refresh too.
				invalidateEntityElementCounts(
					invalidateResolution,
					'root',
					'user',
					'roles',
					roleValues
				);
				if ( ! targets.length ) {
					return;
				}
				if ( failed === 0 ) {
					createSuccessNotice(
						__( 'User(s) deleted.', 'wp-admin-workspaces' ),
						{ type: 'snackbar' }
					);
				} else if ( failed < targets.length ) {
					createErrorNotice(
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d user failed to delete.',
								'%1$d of %2$d users failed to delete.',
								failed,
								'wp-admin-workspaces'
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
								'wp-admin-workspaces'
							),
						{ isDismissible: true }
					);
				}
			},
		} );

		// "Change role to…" — a single-field bulk edit. The `role` field is an
		// `elements`-backed select seeded to the "— No change —" sentinel; the
		// pure `computeBulkPayload` only emits `roles` when the admin picks a
		// real role. Per target: REST `PUT /wp/v2/users/{id} { roles:[role] }`
		// (roles-only update needs only `promote_users`).
		const roleField = {
			id: 'role',
			label: __( 'Role', 'wp-admin-workspaces' ),
			Edit: 'select',
			elements: roleValues.map( ( value ) => ( {
				value,
				label: roleDisplayName( value, elementLabel ),
			} ) ),
		};
		const changeRoleModal = createBulkEditModal( {
			entity: [ 'root', 'user' ],
			fields: fieldsWithNoChange( [ roleField ], { ids: [ 'role' ] } ),
			form: {
				layout: { type: 'regular', labelPosition: 'top' },
				fields: [ 'role' ],
			},
			// Self-demote guard: strip the acting user from the write set before
			// the batch fans out (mirrors the bulk-delete self-exclusion + the
			// server-side `check_role_update` rejection). They stay selected; only
			// others are written. An all-self selection short-circuits to an info
			// notice in the shared host rather than a phantom "0 users" success.
			filterItems: ( items ) =>
				items.filter( ( i ) => i.id !== currentUserId ),
			// Map the changed-field payload to the per-item REST body.
			toRecord: ( payload ) => ( { roles: [ payload.role ] } ),
			messages: {
				applyLabel: __( 'Change role', 'wp-admin-workspaces' ),
				saved: ( ok ) =>
					sprintf(
						/* translators: %d: number of users updated. */
						_n(
							'Role changed for %d user.',
							'Role changed for %d users.',
							ok,
							'wp-admin-workspaces'
						),
						ok
					),
				partial: ( ok, failed ) =>
					sprintf(
						/* translators: 1: number updated, 2: number that failed. */
						__(
							'%1$d updated, %2$d failed.',
							'wp-admin-workspaces'
						),
						ok,
						failed
					),
				error: __( 'Failed to change role.', 'wp-admin-workspaces' ),
				noTargets: __(
					'You cannot change your own role.',
					'wp-admin-workspaces'
				),
			},
			onApplied: () => {
				invalidateResolution( 'getEntityRecords', [
					'root',
					'user',
					queryArgs,
				] );
				// Role changes move users between buckets, so the filter counts
				// must refresh too.
				invalidateEntityElementCounts(
					invalidateResolution,
					'root',
					'user',
					'roles',
					roleValues
				);
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				edit: ( items ) => navigate( editHref( items[ 0 ].id ) ),
				view: ( items ) => navigate( viewPostsHref( items[ 0 ].id ) ),
			},
			modals: {
				delete: deleteModal,
				'change-role': changeRoleModal,
			},
		} );
	}, [
		dataViewConfig,
		deleteEntityRecord,
		invalidateResolution,
		queryArgs,
		roleValues,
		elementLabel,
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
		<div className="wp-admin-workspaces-app-users wp-admin-workspaces-app--fill">
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
		</div>
	);
}
