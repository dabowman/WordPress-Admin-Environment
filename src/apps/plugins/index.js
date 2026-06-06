import '../_shared/app.css';
import { Modal, Spinner } from '@wordpress/components';
import { useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { DataViews } from '@wordpress/dataviews/wp';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { Button, Icon, Notice, Stack, Text } from '@wordpress/ui';
import { __, sprintf } from '@wordpress/i18n';
import { plus } from '@wordpress/icons';
import { useDataView } from '../../runtime/dataView/useDataView';
import { meetsMinVersion } from '../_shared/versionCompare.mjs';
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
import { PortalThemeScope } from '../../runtime/styles/ThemeProviderHost';

const STATUS_LABELS = {
	active: __( 'Active', 'wp-admin-workspaces' ),
	inactive: __( 'Inactive', 'wp-admin-workspaces' ),
	'network-active': __( 'Network active', 'wp-admin-workspaces' ),
};

const FIELD_LABELS = {
	name: __( 'Plugin', 'wp-admin-workspaces' ),
	status: __( 'Status', 'wp-admin-workspaces' ),
	version: __( 'Version', 'wp-admin-workspaces' ),
	author: __( 'Author', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
	activate: __( 'Activate', 'wp-admin-workspaces' ),
	deactivate: __( 'Deactivate', 'wp-admin-workspaces' ),
	visit: __( 'Visit plugin site', 'wp-admin-workspaces' ),
	delete: __( 'Delete', 'wp-admin-workspaces' ),
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

/**
 * Build the REST path id for a plugin. The `wp/v2/plugins` route matches a
 * LITERAL slash in the plugin id (`folder/file`, see the controller's
 * `[^.\/]+(?:\/[^.\/]+)?` PATTERN), so encode each path segment instead of
 * `encodeURIComponent`-ing the whole string — the latter turns the `/` into
 * `%2F`, which the route (and many web servers) reject with a 404. Folder-based
 * plugins like Gutenberg (`gutenberg/gutenberg`) hit this; single-file plugins
 * have no slash and happened to work.
 *
 * @param {string} plugin Plugin id from the list endpoint (e.g. `gutenberg/gutenberg`).
 * @return {string} Path-safe id with literal slashes preserved.
 */
const restPluginId = ( plugin ) =>
	String( plugin ).split( '/' ).map( encodeURIComponent ).join( '/' );

// Install-by-slug DataForm. `slug` is the wordpress.org directory slug the REST
// `POST /wp/v2/plugins` create endpoint accepts; `activate` maps to the
// endpoint's `status` (`active` when checked, `inactive` otherwise) in
// `toRecord` below.
const INSTALL_FIELDS = [
	{
		id: 'slug',
		type: 'text',
		label: __( 'Plugin slug', 'wp-admin-workspaces' ),
		description: __(
			'The wordpress.org directory slug, e.g. "hello-dolly" or "akismet".',
			'wp-admin-workspaces'
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
					: __( 'Plugin slug is required.', 'wp-admin-workspaces' ),
		},
	},
	{
		id: 'activate',
		type: 'boolean',
		label: __( 'Activate after install', 'wp-admin-workspaces' ),
	},
];

const INSTALL_FORM = {
	layout: { type: 'regular', labelPosition: 'top' },
	fields: [ 'slug', 'activate' ],
};

// Running environment versions, read once from the inline config global. Used
// to flag plugins whose declared `requires_php` / `requires_wp` exceed this
// install (mirrors core's PHP/WP-incompatibility inline row). Absent globals →
// `meetsMinVersion` treats every plugin as compatible (no false warnings).
const ENV_PHP =
	( typeof window !== 'undefined' && window.wpAdminWorkspaces?.phpVersion ) ||
	'';
const ENV_WP =
	( typeof window !== 'undefined' && window.wpAdminWorkspaces?.wpVersion ) ||
	'';

/**
 * Build the PHP/WP-incompatibility warning sentences for a plugin row, or `[]`
 * when the running environment satisfies both declared minimums. Mirrors the
 * "does not work with your version of PHP/WordPress" inline row wp-admin shows.
 *
 * @param {Object} item Mapped plugin row (carries `requiresPhp`/`requiresWp`).
 * @return {string[]} Zero, one, or two warning sentences.
 */
function incompatibilityWarnings( item ) {
	const warnings = [];
	if ( ! meetsMinVersion( ENV_PHP, item.requiresPhp ) ) {
		warnings.push(
			sprintf(
				/* translators: 1: required PHP version, 2: running PHP version */
				__(
					'Requires PHP %1$s — this site runs %2$s.',
					'wp-admin-workspaces'
				),
				item.requiresPhp,
				ENV_PHP
			)
		);
	}
	if ( ! meetsMinVersion( ENV_WP, item.requiresWp ) ) {
		warnings.push(
			sprintf(
				/* translators: 1: required WordPress version, 2: running WordPress version */
				__(
					'Requires WordPress %1$s — this site runs %2$s.',
					'wp-admin-workspaces'
				),
				item.requiresWp,
				ENV_WP
			)
		);
	}
	return warnings;
}

function buildFieldRenderers() {
	return {
		name: ( { item } ) => {
			const warnings = incompatibilityWarnings( item );
			return (
				<Stack direction="column" gap="xs">
					<Text variant="body-md">
						<strong>{ item.name }</strong>
					</Text>
					<Text variant="body-sm">
						{ item.description.length > 160
							? `${ item.description.slice( 0, 160 ) }…`
							: item.description }
					</Text>
					{ warnings.length > 0 && (
						<Notice.Root intent="error">
							<Notice.Description>
								{ warnings.join( ' ' ) }
							</Notice.Description>
						</Notice.Root>
					) }
				</Stack>
			);
		},
		status: ( { item } ) => (
			<Text variant="body-sm">
				{ STATUS_LABELS[ item.status ] || item.status }
			</Text>
		),
		version: ( { item } ) => (
			<Text variant="body-sm">{ item.version }</Text>
		),
		// Link the author to its `author_uri` when present (mirrors wp-admin's
		// "By {author}" link); fall back to plain text otherwise. The URI is
		// checked with `isSafeHref` — React does not strip `javascript:` URIs
		// the way PHP's `esc_url()` does, so only http(s) schemes are allowed.
		author: ( { item } ) =>
			isSafeHref( item.authorUri ) ? (
				<Text variant="body-sm">
					<a
						href={ item.authorUri }
						target="_blank"
						rel="noopener noreferrer"
					>
						{ item.author }
					</a>
				</Text>
			) : (
				<Text variant="body-sm">{ item.author }</Text>
			),
	};
}

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

/**
 * Reject non-http(s) href values. React does not strip `javascript:` URIs
 * (unlike PHP's `esc_url()`), so rendered anchor `href` values from REST
 * should pass this guard before use. Protocol-relative URIs are rejected;
 * only explicit `https?:` schemes pass. Empty/absent values return false.
 *
 * @param {string} href Candidate URL string.
 * @return {boolean} True when safe to render as a link.
 */
function isSafeHref( href ) {
	if ( ! href || typeof href !== 'string' ) {
		return false;
	}
	try {
		const url = new URL( href );
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
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
							path: `/wp/v2/plugins/${ restPluginId(
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
							'wp-admin-workspaces'
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
				requiresPhp: r.requires_php || '',
				requiresWp: r.requires_wp || '',
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
							'wp-admin-workspaces'
					  )
					: __(
							'Permanently delete these plugins? This cannot be undone.',
							'wp-admin-workspaces'
					  ),
			confirmLabel: __( 'Delete', 'wp-admin-workspaces' ),
			mutate: ( item ) =>
				apiFetch( {
					path: `/wp/v2/plugins/${ restPluginId( item.plugin ) }`,
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
							__(
								'Failed to delete plugin.',
								'wp-admin-workspaces'
							)
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
					const uri = items[ 0 ].pluginUri;
					if ( isSafeHref( uri ) ) {
						window.open( uri, '_blank', 'noopener,noreferrer' );
					}
				},
			},
			modals: { delete: deleteModal },
			// `eligibleWhen` JSON only handles equality / membership; a safe-href
			// check (plugin URI exists + is http(s)) needs code.
			eligibilityOverrides: {
				visit: ( item ) => isSafeHref( item.pluginUri ),
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
					saved: __( 'Plugin installed.', 'wp-admin-workspaces' ),
					error: __(
						'Failed to install plugin.',
						'wp-admin-workspaces'
					),
					createLabel: __( 'Install', 'wp-admin-workspaces' ),
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
			<div className="wp-admin-workspaces-app-plugins__error">
				<Notice.Root intent="error">
					<Notice.Description>{ error }</Notice.Description>
				</Notice.Root>
			</div>
		);
	}

	return (
		<Page
			title={ __( 'Plugins', 'wp-admin-workspaces' ) }
			actions={
				<>
					<Button
						tone="neutral"
						variant="outline"
						size="compact"
						onClick={ () => setIsUploading( true ) }
					>
						{ __( 'Upload plugin (.zip)', 'wp-admin-workspaces' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						size="compact"
						onClick={ () => setIsInstalling( true ) }
					>
						<Icon icon={ plus } size={ 16 } />
						{ __( 'Add New Plugin', 'wp-admin-workspaces' ) }
					</Button>
				</>
			}
		>
			{ ! records ? (
				<div className="wp-admin-workspaces-app__center">
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
					title={ __( 'Add New Plugin', 'wp-admin-workspaces' ) }
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
					title={ __(
						'Upload plugin (.zip)',
						'wp-admin-workspaces'
					) }
					onRequestClose={ () => setIsUploading( false ) }
				>
					<PortalThemeScope>
						{ /* No REST surface for zip upload — `create_item`
						     accepts a wordpress.org slug only. Fall back to the
						     classic upload screen via the shared no-API
						     affordance. */ }
						<UnavailableViaApi
							kind="action"
							classicPath="plugin-install.php?tab=upload"
							label={ __(
								'Open the classic Upload Plugin screen',
								'wp-admin-workspaces'
							) }
							command="wp plugin install /path/to/plugin.zip --activate"
							agentPrompt={ __(
								'Install a WordPress plugin from a local .zip archive using `wp plugin install <path-to-zip>`.',
								'wp-admin-workspaces'
							) }
						/>
					</PortalThemeScope>
				</Modal>
			) }
		</Page>
	);
}
