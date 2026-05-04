import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { DataViews } from '@wordpress/dataviews';
import {
	Button,
	__experimentalText as Text,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { trash, pencil, external } from '@wordpress/icons';
import { navigate } from '../routing/router';

const ROLE_LABELS = {
	administrator: __( 'Administrator', 'wp-admin-shell' ),
	editor: __( 'Editor', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
	contributor: __( 'Contributor', 'wp-admin-shell' ),
	subscriber: __( 'Subscriber', 'wp-admin-shell' ),
};

export default function UsersApp( { config = {} } ) {
	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'registered_date', direction: 'desc' },
		fields: [ 'name', 'email', 'roles', 'posts' ],
		layout: {},
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'desc',
			orderby: view.sort?.field || 'registered_date',
			context: 'edit',
		};
		if ( view.search ) {
			args.search = view.search;
		}
		for ( const filter of view.filters ) {
			if ( filter.field === 'roles' ) {
				if ( filter.operator === 'isAny' && Array.isArray( filter.value ) ) {
					args.roles = filter.value.join( ',' );
				} else if ( filter.operator === 'is' ) {
					args.roles = filter.value;
				}
			}
		}
		if ( config.role ) {
			args.roles = config.role;
		}
		return args;
	}, [ view, config.role ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'root',
		'user',
		queryArgs
	);

	const { deleteEntityRecord } = useDispatch( coreStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( u ) => ( {
			id: u.id,
			name: u.name,
			username: u.username,
			email: u.email,
			roles: u.roles || [],
			posts: u.post_count ?? 0,
			avatar: u.avatar_urls?.[ 48 ] || u.avatar_urls?.[ 96 ] || '',
			rawRecord: u,
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
					<HStack spacing={ 2 } expanded={ false } alignment="left">
						{ item.avatar && (
							<img
								src={ item.avatar }
								alt=""
								width={ 28 }
								height={ 28 }
								style={ { borderRadius: '50%' } }
							/>
						) }
						<VStack spacing={ 0 }>
							<Text weight={ 600 }>{ item.name }</Text>
							{ item.username && item.username !== item.name && (
								<Text variant="muted" size={ 12 }>
									@{ item.username }
								</Text>
							) }
						</VStack>
					</HStack>
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
				label: __( 'Role', 'wp-admin-shell' ),
				elements: Object.entries( ROLE_LABELS ).map(
					( [ value, label ] ) => ( { value, label } )
				),
				render: ( { item } ) => (
					<Text>
						{ item.roles
							.map( ( r ) => ROLE_LABELS[ r ] || r )
							.join( ', ' ) }
					</Text>
				),
				filterBy: { operators: [ 'isAny' ] },
			},
			{
				id: 'posts',
				type: 'integer',
				label: __( 'Posts', 'wp-admin-shell' ),
				render: ( { item } ) => <Text>{ item.posts }</Text>,
			},
		],
		[]
	);

	const actions = useMemo(
		() => [
			{
				id: 'edit',
				label: __( 'Edit', 'wp-admin-shell' ),
				icon: pencil,
				isPrimary: true,
				callback: ( items ) => {
					navigate( 'user-edit', items[ 0 ].id );
				},
			},
			{
				id: 'view-posts',
				label: __( 'View posts', 'wp-admin-shell' ),
				icon: external,
				isEligible: ( item ) => item.posts > 0,
				callback: ( items ) => {
					navigate( 'posts', { author: items[ 0 ].id } );
				},
			},
			{
				id: 'delete',
				label: __( 'Delete', 'wp-admin-shell' ),
				icon: trash,
				isDestructive: true,
				supportsBulk: true,
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<VStack spacing={ 4 } style={ { padding: '16px' } }>
						<Text>
							{ items.length === 1
								? __(
										'Delete this user? Their content will be reassigned to the network admin or removed depending on site policy.',
										'wp-admin-shell'
								  )
								: __(
										'Delete these users? Their content will be reassigned or removed.',
										'wp-admin-shell'
								  ) }
						</Text>
						<HStack justify="right">
							<Button variant="tertiary" onClick={ closeModal }>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<Button
								variant="primary"
								isDestructive
								onClick={ async () => {
									await Promise.all(
										items.map( ( item ) =>
											deleteEntityRecord(
												'root',
												'user',
												item.id,
												{ force: true, reassign: 0 }
											)
										)
									);
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Delete', 'wp-admin-shell' ) }
							</Button>
						</HStack>
					</VStack>
				),
			},
		],
		[ deleteEntityRecord ]
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
