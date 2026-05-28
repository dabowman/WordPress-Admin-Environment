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
import { useDataView } from '../../runtime/dataView/useDataView';
import { buildFields } from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import {
	useEntityElementCounts,
	invalidateEntityElementCounts,
} from '../_shared/dataviews/useEntityElementCounts';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-shell' ),
	email: __( 'Email', 'wp-admin-shell' ),
	roles: __( 'Roles', 'wp-admin-shell' ),
	registered_date: __( 'Registered', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	delete: __( 'Delete', 'wp-admin-shell' ),
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
 * Field id → render callback. View-config declares the *shape*; the React
 * layer supplies the row renderer.
 */
function buildFieldRenderers() {
	return {
		name: ( { item } ) => (
			<Stack direction="column" gap="xs">
				<Text>{ item.name }</Text>
				<Text className="wp-admin-shell-app__muted">
					{ item.username }
				</Text>
			</Stack>
		),
		email: ( { item } ) => <Text>{ item.email }</Text>,
		roles: ( { item } ) => <Text>{ item.roles }</Text>,
	};
}

/**
 * core:users — DataViews list of WordPress users.
 *
 * Reads its DataViews spec via `useDataView(screenId)`. Bulk delete uses
 * `deleteEntityRecord( 'root', 'user', id, { reassign, force: true } )` —
 * users have no trash, so deletion is permanent. The acting user is filtered
 * out of the target set (reassign-to-self fails server-side and would error
 * the bulk request mid-flight).
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

	// Role values come from the resolved spec (shell-authored `roles`
	// elements), so the count set tracks whatever roles the shell exposes.
	const roleValues = useMemo( () => {
		const roleField = ( dataViewConfig.fields ?? [] ).find(
			( field ) => field.id === 'roles'
		);
		return ( roleField?.elements ?? [] ).map(
			( element ) => element.value
		);
	}, [ dataViewConfig ] );

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
		return records.map( ( record ) => ( {
			id: record.id,
			name: decodeEntities( record.name || '' ),
			email: record.email || '',
			username: decodeEntities( record.username || '' ),
			roles: ( record.roles || [] ).join( ', ' ),
			registered_date: record.registered_date,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers(),
				elementCounts: {
					roles: roleCounts,
				},
			} ),
		[ dataViewConfig, roleCounts ]
	);

	const actions = useMemo( () => {
		const currentUserId = window.wpAdminShell?.userId;
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
						'wp-admin-shell'
					);
				} else if ( targets.length === 1 ) {
					body = __(
						'Delete this user permanently? Their content will be reassigned to you.',
						'wp-admin-shell'
					);
				} else {
					body = __(
						'Delete these users permanently? Their content will be reassigned to you.',
						'wp-admin-shell'
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
									'wp-admin-shell'
								) }
							</>
						) }
					</>
				);
			},
			confirmLabel: __( 'Delete', 'wp-admin-shell' ),
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
						__( 'User(s) deleted.', 'wp-admin-shell' ),
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
							__( 'Failed to delete user(s).', 'wp-admin-shell' ),
						{ isDismissible: true }
					);
				}
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			modals: { delete: deleteModal },
		} );
	}, [
		dataViewConfig,
		deleteEntityRecord,
		invalidateResolution,
		queryArgs,
		roleValues,
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
		<div className="wp-admin-shell-app-users wp-admin-shell-app--fill">
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
