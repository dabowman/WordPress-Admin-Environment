import '../_shared/app.css';
import { Spinner } from '@wordpress/components';
import { useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { Notice, Stack, Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { useDataView } from '../../runtime/dataView/useDataView';
import {
	buildFields,
	elementsFromLabels,
} from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';

const STATUS_LABELS = {
	active: __( 'Active', 'wp-admin-shell' ),
	inactive: __( 'Inactive', 'wp-admin-shell' ),
	'network-active': __( 'Network active', 'wp-admin-shell' ),
};

const FIELD_LABELS = {
	name: __( 'Plugin', 'wp-admin-shell' ),
	status: __( 'Status', 'wp-admin-shell' ),
	version: __( 'Version', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	activate: __( 'Activate', 'wp-admin-shell' ),
	deactivate: __( 'Deactivate', 'wp-admin-shell' ),
	visit: __( 'Visit plugin site', 'wp-admin-shell' ),
	delete: __( 'Delete', 'wp-admin-shell' ),
};

const VIEW_DEFAULTS = {
	type: 'table',
	search: '',
	filters: [],
	page: 1,
	perPage: 50,
	sort: { field: 'name', direction: 'asc' },
	fields: [],
	layout: {},
};

function buildFieldRenderers() {
	return {
		name: ( { item } ) => (
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
		status: ( { item } ) => (
			<Text variant="body-sm">
				{ STATUS_LABELS[ item.status ] || item.status }
			</Text>
		),
		version: ( { item } ) => (
			<Text variant="body-sm">{ item.version }</Text>
		),
		author: ( { item } ) => <Text variant="body-sm">{ item.author }</Text>,
	};
}

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

/**
 * @param {Object} root0          Mount-supplied props.
 * @param {Object} [root0.config] App config — `config.screenId` keys the per-screen view lookup.
 */
export default function PluginsApp( { config = {} } = {} ) {
	const screenId = config.screenId || null;
	const { config: dataViewConfig } = useDataView( screenId );

	const pluginsQuery = useMemo( () => ( { context: 'edit' } ), [] );
	const { records, isResolving } = useEntityRecords(
		'root',
		'plugin',
		pluginsQuery
	);
	const { invalidateResolution } = useDispatch( coreStore );

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

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
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

	// Plugins arrive in a single unpaginated fetch, so status counts come for
	// free off the records — no extra count requests like the server-paginated
	// list apps need.
	const statusCounts = useMemo( () => {
		const counts = {};
		for ( const record of records ?? [] ) {
			counts[ record.status ] = ( counts[ record.status ] || 0 ) + 1;
		}
		return counts;
	}, [ records ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers(),
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
		const deleteModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Permanently delete this plugin? This cannot be undone.',
							'wp-admin-shell'
					  )
					: __(
							'Permanently delete these plugins? This cannot be undone.',
							'wp-admin-shell'
					  ),
			confirmLabel: __( 'Delete', 'wp-admin-shell' ),
			mutate: ( item ) =>
				apiFetch( {
					path: `/wp/v2/plugins/${ encodeURIComponent(
						item.plugin
					) }`,
					method: 'DELETE',
				} ),
			onSettled: ( { results, failed } ) => {
				refresh();
				if ( failed > 0 ) {
					const first = results.find(
						( r ) => r.status === 'rejected'
					);
					setError(
						first?.reason?.message ||
							__( 'Failed to delete plugin.', 'wp-admin-shell' )
					);
				}
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				activate: ( items ) => setPluginStatus( items, 'active' ),
				deactivate: ( items ) => setPluginStatus( items, 'inactive' ),
				visit: ( items ) => {
					window.open(
						items[ 0 ].pluginUri,
						'_blank',
						'noopener,noreferrer'
					);
				},
			},
			modals: { delete: deleteModal },
			// `eligibleWhen` JSON only handles equality / membership; a presence
			// check (plugin URI exists) needs code.
			eligibilityOverrides: {
				visit: ( item ) => !! item.pluginUri,
			},
		} );
	}, [ dataViewConfig, setPluginStatus, refresh ] );

	const paginationInfo = useMemo(
		() => ( {
			totalItems: data.length,
			totalPages: Math.max( 1, Math.ceil( data.length / view.perPage ) ),
		} ),
		[ data.length, view.perPage ]
	);

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
		<div className="wp-admin-shell-app-plugins wp-admin-shell-app--fill">
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
					defaultLayouts={
						dataViewConfig.defaultLayouts ?? { table: {} }
					}
					selection={ selection }
					onChangeSelection={ setSelection }
					getItemId={ ( item ) => item.id }
				/>
			) }
		</div>
	);
}
