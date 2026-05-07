import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { trash } from '@wordpress/icons';

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
		fields: [ 'name', 'email', 'roles', 'registered_date' ],
		layout: {},
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

	const { deleteEntityRecord, invalidateResolution } = useDispatch( coreStore );
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
			registered_date: record.registered_date,
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
				id: 'registered_date',
				type: 'datetime',
				label: __( 'Registered', 'wp-admin-shell' ),
			},
		],
		[]
	);


	const actions = useMemo(
		() => [
			{
				id: 'delete',
				label: __( 'Delete', 'wp-admin-shell' ),
				isDestructive: true,
				supportsBulk: true,
				icon: trash,
				RenderModal: ( { items, closeModal, onActionPerformed } ) => {
					const currentUserId = window.wpAdminShell?.userId;
					const targets = items.filter(
						( i ) => i.id !== currentUserId
					);
					const skipped = items.length - targets.length;
					return (
						<Stack
							direction="column"
							gap="lg"
							style={ { padding: '16px' } }
						>
							<Text>
								{ targets.length === 0
									? __(
											'You cannot delete your own account.',
											'wp-admin-shell'
									  )
									: targets.length === 1
									? __(
											'Delete this user permanently? Their content will be reassigned to you.',
											'wp-admin-shell'
									  )
									: __(
											'Delete these users permanently? Their content will be reassigned to you.',
											'wp-admin-shell'
									  ) }
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
										try {
											await Promise.all(
												targets.map( ( item ) =>
													deleteEntityRecord(
														'root',
														'user',
														item.id,
														{
															force: true,
															reassign: currentUserId,
														}
													)
												)
											);
											invalidateResolution(
												'getEntityRecords',
												[ 'root', 'user', queryArgs ]
											);
											createSuccessNotice(
												__(
													'User(s) deleted.',
													'wp-admin-shell'
												),
												{ type: 'snackbar' }
											);
											onActionPerformed?.( targets );
										} catch ( err ) {
											createErrorNotice(
												err?.message ||
													__(
														'Failed to delete user(s).',
														'wp-admin-shell'
													),
												{ isDismissible: true }
											);
										}
										closeModal();
									} }
								>
									{ __( 'Delete', 'wp-admin-shell' ) }
								</DestructiveButton>
							</Stack>
						</Stack>
					);
				},
			},
			
		],
		[
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
