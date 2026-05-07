import { useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { Button, Notice, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { trash, external, check, closeSmall } from '@wordpress/icons';

const STATUS_LABELS = {
	active: __( 'Active', 'wp-admin-shell' ),
	inactive: __( 'Inactive', 'wp-admin-shell' ),
	'network-active': __( 'Network active', 'wp-admin-shell' ),
};

export default function PluginsApp() {
	const pluginsQuery = useMemo( () => ( { context: 'edit' } ), [] );
	const { records, isResolving } = useEntityRecords(
		'root',
		'plugin',
		pluginsQuery
	);
	const { invalidateResolution } = useDispatch( coreStore );

	const isLoading = isResolving;
	const [ error, setError ] = useState( null );

	const refresh = useCallback( () => {
		invalidateResolution( 'getEntityRecords', [
			'root',
			'plugin',
			pluginsQuery,
		] );
	}, [ invalidateResolution, pluginsQuery ] );

	const setPluginStatus = useCallback(
		async ( items, status ) => {
			try {
				await Promise.all(
					items.map( ( item ) =>
						apiFetch( {
							path: `/wp/v2/plugins/${ encodeURIComponent(
								item.plugin
							) }`,
							method: 'POST',
							data: { status },
						} )
					)
				);
				refresh();
			} catch ( err ) {
				setError(
					err.message ||
						__(
							'Failed to update plugin status.',
							'wp-admin-shell'
						)
				);
			}
		},
		[ refresh ]
	);

	const deletePlugins = useCallback(
		async ( items ) => {
			try {
				await Promise.all(
					items.map( ( item ) =>
						apiFetch( {
							path: `/wp/v2/plugins/${ encodeURIComponent(
								item.plugin
							) }`,
							method: 'DELETE',
						} )
					)
				);
				refresh();
			} catch ( err ) {
				setError(
					err.message ||
						__( 'Failed to delete plugin.', 'wp-admin-shell' )
				);
			}
		},
		[ refresh ]
	);

	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 50,
		sort: { field: 'name', direction: 'asc' },
		fields: [ 'name', 'status', 'version', 'author' ],
		layout: {},
	} );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		const search = view.search?.toLowerCase() || '';
		const statusFilter = view.filters.find( ( f ) => f.field === 'status' );
		return records
			.filter( ( r ) => {
				if (
					search &&
					! r.name?.toLowerCase().includes( search ) &&
					! stripTags( r.description?.raw || '' )
						.toLowerCase()
						.includes( search )
				) {
					return false;
				}
				if ( statusFilter ) {
					const list = Array.isArray( statusFilter.value )
						? statusFilter.value
						: [ statusFilter.value ];
					if ( ! list.includes( r.status ) ) {
						return false;
					}
				}
				return true;
			} )
			.map( ( r ) => ( {
				id: r.plugin,
				plugin: r.plugin,
				name: r.name,
				description: stripTags( r.description?.raw || '' ),
				status: r.status,
				version: r.version,
				author: stripTags( r.author || '' ),
				authorUri: r.author_uri,
				pluginUri: r.plugin_uri,
				rawRecord: r,
			} ) );
	}, [ records, view ] );

	const fields = useMemo(
		() => [
			{
				id: 'name',
				type: 'text',
				label: __( 'Plugin', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				enableHiding: false,
				render: ( { item } ) => (
					<Stack direction="column" gap="xs">
						<Text variant="body-md">
							<strong>{ item.name }</strong>
						</Text>
						<Text variant="body-sm">
							{ item.description.length > 160
								? `${ item.description.slice( 0, 160 ) }…`
								: item.description }
						</Text>
					</Stack>
				),
			},
			{
				id: 'status',
				type: 'text',
				label: __( 'Status', 'wp-admin-shell' ),
				elements: Object.entries( STATUS_LABELS ).map(
					( [ value, label ] ) => ( { value, label } )
				),
				render: ( { item } ) => (
					<Text variant="body-sm">
						{ STATUS_LABELS[ item.status ] || item.status }
					</Text>
				),
				filterBy: { operators: [ 'isAny' ] },
			},
			{
				id: 'version',
				type: 'text',
				label: __( 'Version', 'wp-admin-shell' ),
				render: ( { item } ) => (
					<Text variant="body-sm">{ item.version }</Text>
				),
			},
			{
				id: 'author',
				type: 'text',
				label: __( 'Author', 'wp-admin-shell' ),
				render: ( { item } ) => (
					<Text variant="body-sm">{ item.author }</Text>
				),
			},
		],
		[]
	);

	const actions = useMemo(
		() => [
			{
				id: 'activate',
				label: __( 'Activate', 'wp-admin-shell' ),
				icon: check,
				isPrimary: true,
				supportsBulk: true,
				isEligible: ( item ) => item.status === 'inactive',
				callback: ( items ) => setPluginStatus( items, 'active' ),
			},
			{
				id: 'deactivate',
				label: __( 'Deactivate', 'wp-admin-shell' ),
				icon: closeSmall,
				supportsBulk: true,
				isEligible: ( item ) =>
					item.status === 'active' ||
					item.status === 'network-active',
				callback: ( items ) => setPluginStatus( items, 'inactive' ),
			},
			{
				id: 'visit',
				label: __( 'Visit plugin site', 'wp-admin-shell' ),
				icon: external,
				isEligible: ( item ) => !! item.pluginUri,
				callback: ( items ) =>
					window.open( items[ 0 ].pluginUri, '_blank' ),
			},
			{
				id: 'delete',
				label: __( 'Delete', 'wp-admin-shell' ),
				icon: trash,
				isDestructive: true,
				supportsBulk: true,
				isEligible: ( item ) => item.status === 'inactive',
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<Stack
						direction="column"
						gap="lg"
						style={ { padding: '16px' } }
					>
						<Text variant="body-md">
							{ items.length === 1
								? __(
										'Permanently delete this plugin? This cannot be undone.',
										'wp-admin-shell'
								  )
								: __(
										'Permanently delete these plugins? This cannot be undone.',
										'wp-admin-shell'
								  ) }
						</Text>
						<Stack direction="row" justify="flex-end" gap="sm">
							<Button
								tone="neutral"
								variant="outline"
								onClick={ closeModal }
							>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<DestructiveButton
								variant="primary"
								isDestructive
								onClick={ async () => {
									await deletePlugins( items );
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Delete', 'wp-admin-shell' ) }
							</DestructiveButton>
						</Stack>
					</Stack>
				),
			},
		],
		[ deletePlugins, setPluginStatus ]
	);

	const paginationInfo = useMemo(
		() => ( {
			totalItems: data.length,
			totalPages: Math.max( 1, Math.ceil( data.length / view.perPage ) ),
		} ),
		[ data.length, view.perPage ]
	);

	const [ selection, setSelection ] = useState( [] );

	if ( error ) {
		return (
			<div className="wp-admin-shell-app-plugins__error">
				<Notice.Root intent="error">
					<Notice.Description>{ error }</Notice.Description>
				</Notice.Root>
			</div>
		);
	}

	return (
		<div className="wp-admin-shell-app-plugins">
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isLoading }
				defaultLayouts={ { table: {} } }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id }
			/>
		</div>
	);
}

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}
