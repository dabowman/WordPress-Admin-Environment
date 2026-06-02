import '../_shared/app.css';
import { Modal, Spinner } from '@wordpress/components';
import { useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { Button, Icon, Notice, Stack, Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { plus } from '@wordpress/icons';
import { useDataView } from '../../runtime/dataView/useDataView';
import {
	buildFields,
	elementsFromLabels,
} from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';
import { createEntityFormModal } from '../_shared/dataviews/EntityFormModal';
import { UnavailableViaApi } from '../_shared/fallback/UnavailableViaApi';
import { Page } from '../_shared/Page';

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

// Install-by-slug DataForm. `slug` is the wordpress.org directory slug the REST
// `POST /wp/v2/plugins` create endpoint accepts; `activate` maps to the
// endpoint's `status` (`active` when checked, `inactive` otherwise) in
// `toRecord` below.
const INSTALL_FIELDS = [
	{
		id: 'slug',
		type: 'text',
		label: __( 'Plugin slug', 'wp-admin-shell' ),
		description: __(
			'The wordpress.org directory slug, e.g. "hello-dolly" or "akismet".',
			'wp-admin-shell'
		),
		// `required: true` passes any non-empty string, including whitespace-only
		// input like "   " — `toRecord` then trims it to "" and the POST fires
		// empty. Reject whitespace-only here so the disabled-button guard catches
		// it client-side instead of surfacing the generic install-failed notice.
		isValid: {
			required: true,
			custom: ( item, field ) =>
				( field.getValue( { item } ) || '' ).trim()
					? null
					: __( 'Plugin slug is required.', 'wp-admin-shell' ),
		},
	},
	{
		id: 'activate',
		type: 'boolean',
		label: __( 'Activate after install', 'wp-admin-shell' ),
	},
];

const INSTALL_FORM = {
	layout: { type: 'regular', labelPosition: 'top' },
	fields: [ 'slug', 'activate' ],
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
	const [ isInstalling, setIsInstalling ] = useState( false );
	const [ isUploading, setIsUploading ] = useState( false );

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

	// DataViews is controlled and won't sort or slice the `data` it's handed
	// (search + status filter are already applied in the `data` memo above, and
	// it intentionally also searches the description that's rendered inside the
	// name cell). Apply the column sort, then the page slice — otherwise page 1
	// shows every plugin and "Next" re-renders the same list, and clicking a
	// column header does nothing. All sortable columns are strings; `numeric`
	// collation keeps version segments (1.2.10 > 1.2.9) in order.
	const paginatedData = useMemo( () => {
		let rows = data;
		const sortField = view.sort?.field;
		if ( sortField ) {
			const dir = view.sort?.direction === 'desc' ? -1 : 1;
			rows = [ ...data ].sort(
				( a, b ) =>
					dir *
					String( a[ sortField ] ?? '' ).localeCompare(
						String( b[ sortField ] ?? '' ),
						undefined,
						{ numeric: true }
					)
			);
		}
		// Clamp the page against the current row count: a bulk delete +
		// `refresh()` shrinks `data` without going through a controlled view
		// edit, so `view.page` can outrun the data (page 2 of a now-single-page
		// list). Slicing from the stale page would return `[]` and the list
		// renders empty even though the (hidden) paginator collapsed to 1 page.
		const totalPages = Math.max(
			1,
			Math.ceil( rows.length / view.perPage )
		);
		const page = Math.min( view.page, totalPages );
		const start = ( page - 1 ) * view.perPage;
		return rows.slice( start, start + view.perPage );
	}, [ data, view.sort, view.page, view.perPage ] );

	const paginationInfo = useMemo(
		() => ( {
			totalItems: data.length,
			totalPages: Math.max( 1, Math.ceil( data.length / view.perPage ) ),
		} ),
		[ data.length, view.perPage ]
	);

	// Install-by-slug modal body. `createEntityFormModal` create mode seeds a
	// local draft from `toData(undefined)`, then `POST`s `toRecord(data)` via
	// `saveEntityRecord( 'root', 'plugin', … )` — which targets the same
	// `POST /wp/v2/plugins { slug, status }` create endpoint the list reads
	// from. It returns a BARE body (no `<Modal>`), so we host it in our own
	// `<Modal>` below (DataViews' `ActionModal` isn't in play for a header
	// action). `onSaved` invalidates the list so the new plugin appears.
	const InstallBody = useMemo(
		() =>
			createEntityFormModal( {
				entity: [ 'root', 'plugin' ],
				mode: 'create',
				fields: INSTALL_FIELDS,
				form: INSTALL_FORM,
				toData: () => ( { slug: '', activate: false } ),
				toRecord: ( { slug, activate } ) => ( {
					slug: ( slug || '' ).trim(),
					status: activate ? 'active' : 'inactive',
				} ),
				messages: {
					saved: __( 'Plugin installed.', 'wp-admin-shell' ),
					error: __( 'Failed to install plugin.', 'wp-admin-shell' ),
					createLabel: __( 'Install', 'wp-admin-shell' ),
				},
				// `CreateBody.onSubmit` already calls `closeModal()` on success,
				// which our host wires to `setIsInstalling( false )` — so the
				// close is the modal host's job. Just invalidate the list here.
				onSaved: () => refresh(),
			} ),
		[ refresh ]
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
		<Page
			title={ __( 'Plugins', 'wp-admin-shell' ) }
			actions={
				<>
					<Button
						tone="neutral"
						variant="outline"
						size="compact"
						onClick={ () => setIsUploading( true ) }
					>
						{ __( 'Upload plugin (.zip)', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						size="compact"
						onClick={ () => setIsInstalling( true ) }
					>
						<Icon icon={ plus } size={ 16 } />
						{ __( 'Add New Plugin', 'wp-admin-shell' ) }
					</Button>
				</>
			}
		>
			{ ! records ? (
				<div className="wp-admin-shell-app__center">
					<Spinner />
				</div>
			) : (
				<DataViews
					data={ paginatedData }
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

			{ isInstalling && (
				<Modal
					title={ __( 'Add New Plugin', 'wp-admin-shell' ) }
					onRequestClose={ () => setIsInstalling( false ) }
				>
					{ /* `createEntityFormModal` create mode ignores `items`; it
					     renders its own DataForm + Install / Cancel footer and
					     POSTs `{ slug, status }`. `closeModal` flips our state. */ }
					<InstallBody
						items={ [] }
						closeModal={ () => setIsInstalling( false ) }
					/>
				</Modal>
			) }

			{ isUploading && (
				<Modal
					title={ __( 'Upload plugin (.zip)', 'wp-admin-shell' ) }
					onRequestClose={ () => setIsUploading( false ) }
				>
					{ /* No REST surface for zip upload — `create_item` accepts a
					     wordpress.org slug only. Fall back to the classic upload
					     screen via the shared no-API affordance. */ }
					<UnavailableViaApi
						kind="action"
						classicPath="plugin-install.php?tab=upload"
						label={ __(
							'Open the classic Upload Plugin screen',
							'wp-admin-shell'
						) }
						command="wp plugin install /path/to/plugin.zip --activate"
						agentPrompt={ __(
							'Install a WordPress plugin from a local .zip archive using `wp plugin install <path-to-zip>`.',
							'wp-admin-shell'
						) }
					/>
				</Modal>
			) }
		</Page>
	);
}
