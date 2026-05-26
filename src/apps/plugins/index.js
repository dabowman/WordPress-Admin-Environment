import { useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { Button, Notice, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { resolveIcon } from '../../runtime/config/iconMap';
import { useDataView } from '../../runtime/dataView/useDataView';

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

function buildActions( actions, { setPluginStatus, deletePlugins } ) {
	const callbacks = {
		activate: ( items ) => setPluginStatus( items, 'active' ),
		deactivate: ( items ) => setPluginStatus( items, 'inactive' ),
		visit: ( items ) => {
			window.open(
				items[ 0 ].pluginUri,
				'_blank',
				'noopener,noreferrer'
			);
		},
	};

	// `eligibleWhen` JSON only handles equality / membership; presence
	// checks (e.g. `pluginUri` exists) need code. Per-id overrides win
	// over the declarative spec.
	const eligibilityOverrides = {
		visit: ( item ) => !! item.pluginUri,
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
				isEligible:
					eligibilityOverrides[ spec.id ] ??
					compileEligibility( spec.eligibleWhen ),
			};

			if ( spec.id === 'delete' ) {
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
				);
			} else if ( callbacks[ spec.id ] ) {
				compiled.callback = callbacks[ spec.id ];
			}

			return compiled;
		} );
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

	const [ view, setView ] = useState( () => {
		const seed = {
			...VIEW_DEFAULTS,
			...( dataViewConfig.defaultView || {} ),
		};
		// Title-dedup: when defaultView declares a `titleField`, drop it
		// from the visible-fields list so DataViews doesn't render the
		// title column twice.
		if ( seed.titleField ) {
			seed.fields = ( seed.fields || [] ).filter(
				( id ) => id !== seed.titleField
			);
		}
		return seed;
	} );

	// No variant axis on `(root, plugin)` today — the PostsApp resync
	// useEffect would be a same-tick noop. When a variant is wired in
	// (e.g. `mu-plugins` / `dropins`), add it back keyed on the variant
	// prop so a triple flip reseeds `view`.

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
		() => buildFields( dataViewConfig.fields ?? [], buildFieldRenderers() ),
		[ dataViewConfig ]
	);

	const actions = useMemo(
		() =>
			buildActions( dataViewConfig.actions ?? [], {
				setPluginStatus,
				deletePlugins,
			} ),
		[ dataViewConfig, setPluginStatus, deletePlugins ]
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
				defaultLayouts={
					dataViewConfig.defaultLayouts ?? { table: {} }
				}
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id }
			/>
		</div>
	);
}
