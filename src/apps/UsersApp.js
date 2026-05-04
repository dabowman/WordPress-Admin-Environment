import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews';
import {
	Button,
	__experimentalText as Text,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { trash } from '@wordpress/icons';
import { useSlotItems } from '../runtime/slots/dataSlots';

/**
 * core:users — DataViews list of WordPress users.
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
	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'name', direction: 'asc' },
		fields: [ 'name', 'email', 'roles', 'registered' ],
		layout: {},
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'asc',
			orderby: view.sort?.field || 'name',
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

	const { deleteEntityRecord } = useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } = useDispatch( noticesStore );

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
			registered: record.registered_date,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() => [
			{
				id: 'name',
				type: 'text',
				label: __( 'Name', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				enableHiding: false,
				render: ( { item } ) => (
					<VStack spacing={ 0 }>
						<Text weight={ 500 }>{ item.name }</Text>
						<Text size={ 12 } variant="muted">{ item.username }</Text>
					</VStack>
				),
			},
			{
				id: 'email',
				type: 'text',
				label: __( 'Email', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				render: ( { item } ) => <Text>{ item.email }</Text>,
			},
			{
				id: 'roles',
				type: 'text',
				label: __( 'Roles', 'wp-admin-shell' ),
				render: ( { item } ) => <Text>{ item.roles }</Text>,
			},
			{
				id: 'registered',
				type: 'datetime',
				label: __( 'Registered', 'wp-admin-shell' ),
			},
		],
		[]
	);

	const slotActions = useSlotItems( 'core:users.row-actions' );

	const actions = useMemo(
		() => [
			{
				id: 'delete',
				label: __( 'Delete', 'wp-admin-shell' ),
				isDestructive: true,
				supportsBulk: true,
				icon: trash,
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<VStack spacing={ 4 } style={ { padding: '16px' } }>
						<Text>
							{ items.length === 1
								? __( 'Delete this user permanently? Their content will be reassigned to you.', 'wp-admin-shell' )
								: __( 'Delete these users permanently? Their content will be reassigned to you.', 'wp-admin-shell' ) }
						</Text>
						<HStack justify="right">
							<Button variant="tertiary" onClick={ closeModal }>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<Button
								variant="primary"
								isDestructive
								onClick={ async () => {
									try {
										await Promise.all(
											items.map( ( item ) =>
												deleteEntityRecord(
													'root',
													'user',
													item.id,
													{
														force: true,
														reassign: window.wpAdminShell?.userId,
													}
												)
											)
										);
										createSuccessNotice(
											__( 'User(s) deleted.', 'wp-admin-shell' ),
											{ type: 'snackbar' }
										);
										onActionPerformed?.( items );
									} catch ( err ) {
										createErrorNotice(
											err?.message || __( 'Failed to delete user(s).', 'wp-admin-shell' ),
											{ isDismissible: true }
										);
									}
									closeModal();
								} }
							>
								{ __( 'Delete', 'wp-admin-shell' ) }
							</Button>
						</HStack>
					</VStack>
				),
			},
			...slotActions,
		],
		[ deleteEntityRecord, createSuccessNotice, createErrorNotice, slotActions ]
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
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isResolving }
				defaultLayouts={ { table: {}, grid: {} } }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>
		</div>
	);
}
