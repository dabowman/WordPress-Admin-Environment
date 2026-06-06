import './index.css';
import { Spinner } from '@wordpress/components';
import '../_shared/app.css';
import { useMemo, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { __, sprintf } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { useDataView } from '../../runtime/dataView/useDataView';
import { PortalThemeScope } from '../../runtime/styles/ThemeProviderHost';
import {
	buildFields,
	elementsFromLabels,
} from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

/**
 * Reject non-http(s) href values. React does not strip `javascript:` URIs
 * (unlike PHP's `esc_url()`), so REST-supplied URLs must pass this guard
 * before being rendered as anchor `href` values.
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

const STATUS_LABELS = {
	active: __( 'Active', 'wp-admin-workspaces' ),
	inactive: __( 'Inactive', 'wp-admin-workspaces' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-workspaces' ),
	screenshot: __( 'Screenshot', 'wp-admin-workspaces' ),
	status: __( 'Status', 'wp-admin-workspaces' ),
	description: __( 'Description', 'wp-admin-workspaces' ),
	version: __( 'Version', 'wp-admin-workspaces' ),
	author: __( 'Author', 'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
	activate: __( 'Activate', 'wp-admin-workspaces' ),
	details: __( 'Details', 'wp-admin-workspaces' ),
};

const VIEW_DEFAULTS = {
	type: 'grid',
	search: '',
	filters: [],
	page: 1,
	perPage: 50,
	sort: { field: 'status', direction: 'asc' },
	fields: [],
	layout: {},
};

/**
 * Resolve a theme's screenshot URL. WordPress's `/wp/v2/themes` endpoint
 * returns `screenshot` only when the theme directory actually contains
 * `screenshot.{png|gif|jpg|jpeg|webp}`. When core's
 * `WP_Theme::get_screenshot()` can't find one (some installs / Playground
 * bundles ship slim themes without the asset, or the REST response is
 * otherwise missing it), fall back to the canonical theme-directory path.
 * Browsers silently drop a 404 — strictly an improvement over the empty
 * DataViews placeholder since at least the WordPress.org-shipped default
 * themes resolve.
 *
 * @param {Object} item Theme record (mapped data item).
 * @return {string} Absolute URL, or '' when neither path is available.
 */
function screenshotUrl( item ) {
	if ( item?.screenshot ) {
		return item.screenshot;
	}
	if ( ! item?.stylesheet ) {
		return '';
	}
	const siteUrl =
		( typeof window !== 'undefined' &&
			window.wpAdminWorkspaces?.siteUrl ) ||
		'';
	return `${ siteUrl }/wp-content/themes/${ encodeURIComponent(
		item.stylesheet
	) }/screenshot.png`;
}

/**
 * Build the Live Preview URL for a theme. Both block and classic themes use
 * the Customizer (`customize.php?theme={slug}`) — the Customizer is in the
 * hijack endpoint allowlist so the browser navigates to the classic surface
 * and correctly previews the chosen theme.
 *
 * Note: the block-theme native path is `site-editor.php?wp_theme_preview={slug}`,
 * but the kernel's admin-link interceptor routes `site-editor.php` to the
 * workspace `/site-editor` route and drops the `?wp_theme_preview` query
 * param, which would open the editor on the ACTIVE theme rather than the
 * previewed one. Until the Site Editor route supports a `wp_theme_preview`
 * pass-through, the Customizer path is used for all themes. The Customizer
 * supports block-theme preview natively.
 *
 * @param {Object} item Mapped theme row (carries `stylesheet`).
 * @return {string} Absolute admin URL.
 */
function livePreviewUrl( item ) {
	const adminUrl =
		( typeof window !== 'undefined' &&
			window.wpAdminWorkspaces?.adminUrl ) ||
		'/wp-admin/';
	const slug = encodeURIComponent( item.stylesheet );
	return `${ adminUrl }customize.php?theme=${ slug }`;
}

// Module-scoped — renderers are stateless and capture no props.
const FIELD_RENDERERS = {
	name: ( { item } ) => <Text>{ item.name }</Text>,
	screenshot: ( { item } ) => {
		const url = screenshotUrl( item );
		if ( ! url ) {
			return null;
		}
		return <img src={ url } alt={ item.name || '' } loading="lazy" />;
	},
	status: ( { item } ) => (
		<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
	),
	description: ( { item } ) => (
		<Text>{ ( item.description || '' ).slice( 0, 140 ) }</Text>
	),
	version: ( { item } ) => <Text>{ item.version || '' }</Text>,
	author: ( { item } ) => <Text>{ item.author || '' }</Text>,
};

export default function ThemesApp( { config = {} } ) {
	const screenId = config.screenId || null;

	const { config: dataViewConfig } = useDataView( screenId );

	const themesQuery = useMemo(
		() => ( { context: 'edit', status: 'active,inactive' } ),
		[]
	);
	const { records: themes, isResolving } = useEntityRecords(
		'root',
		'theme',
		themesQuery
	);
	const { invalidateResolution } = useDispatch( coreStore );
	const { createNotice } = useDispatch( noticesStore );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
	} );

	// Returns true on success / false on failure so callers (e.g. the details
	// modal) can keep themselves open when activation fails.
	const activate = useCallback(
		async ( theme ) => {
			try {
				await apiFetch( {
					path: '/wp-admin-workspaces/v1/activate-theme',
					method: 'POST',
					data: { stylesheet: theme.stylesheet },
				} );
				invalidateResolution( 'getEntityRecords', [
					'root',
					'theme',
					themesQuery,
				] );
				createNotice(
					'success',
					__( 'Theme activated.', 'wp-admin-workspaces' ),
					{ type: 'snackbar' }
				);
				return true;
			} catch ( err ) {
				createNotice(
					'error',
					err?.message ||
						__(
							'The theme could not be activated.',
							'wp-admin-workspaces'
						),
					{ type: 'snackbar', isDismissible: true }
				);
				return false;
			}
		},
		[ invalidateResolution, themesQuery, createNotice ]
	);

	const data = useMemo( () => {
		if ( ! themes ) {
			return [];
		}
		return themes.map( ( record ) => ( {
			id: record.stylesheet,
			stylesheet: record.stylesheet,
			name: decodeEntities(
				record.name?.rendered ||
					record.name?.raw ||
					record.stylesheet ||
					''
			),
			screenshot: record.screenshot || '',
			status: record.status,
			description: stripTags( record.description?.rendered || '' ),
			version: record.version || '',
			author: stripTags( record.author?.rendered || '' ),
			theme_uri: record.theme_uri || '',
			// Parent stylesheet for child themes (`''` for top-level themes).
			template: record.template || '',
			// Tags array (`tags.raw`); fall back to splitting the rendered string.
			tags: Array.isArray( record.tags?.raw )
				? record.tags.raw
				: ( record.tags?.rendered || '' )
						.split( ',' )
						.map( ( t ) => t.trim() )
						.filter( Boolean ),
			isBlockTheme: !! record.is_block_theme,
			rawRecord: record,
		} ) );
	}, [ themes ] );

	// stylesheet → display name, so a child theme's details modal can name its
	// parent rather than print the raw slug. Built from the loaded library.
	const themeNames = useMemo( () => {
		const map = {};
		for ( const item of data ) {
			map[ item.stylesheet ] = item.name;
		}
		return map;
	}, [ data ] );

	const renderDetailsModal = useCallback(
		( { items, closeModal } ) => {
			const item = items[ 0 ];
			if ( ! item ) {
				return null;
			}
			const isActive = item.status === 'active';
			// `template` is the parent theme's stylesheet. For non-child themes
			// the REST API sets `template` to the theme's own `stylesheet`
			// (not '') — so a truthy `template` alone can't distinguish a child
			// theme from a standalone one. The child-theme signal is
			// `template !== stylesheet`.
			const parentName =
				item.template && item.template !== item.stylesheet
					? themeNames[ item.template ] || item.template
					: '';
			return (
				<PortalThemeScope>
					<Stack
						direction="column"
						gap="md"
						className="wp-admin-workspaces-app-themes__details-modal"
					>
						{ screenshotUrl( item ) && (
							<img src={ screenshotUrl( item ) } alt="" />
						) }
						<Text variant="heading-md" render={ <h2 /> }>
							{ item.name }
						</Text>
						{ parentName && (
							<Text
								variant="body-sm"
								className="wp-admin-workspaces-app__muted"
							>
								{ sprintf(
									/* translators: %s: parent theme name. */
									__(
										'This is a child theme of %s.',
										'wp-admin-workspaces'
									),
									parentName
								) }
							</Text>
						) }
						<Text>{ item.description }</Text>
						<Text variant="body-sm">
							{ __( 'Version', 'wp-admin-workspaces' ) }:{ ' ' }
							{ item.version }
							{ item.author
								? ' · ' +
								  __( 'Author', 'wp-admin-workspaces' ) +
								  ': ' +
								  item.author
								: '' }
						</Text>
						{ item.tags.length > 0 && (
							<Text
								variant="body-sm"
								className="wp-admin-workspaces-app__muted"
							>
								{ __( 'Tags', 'wp-admin-workspaces' ) }:{ ' ' }
								{ item.tags.join( ', ' ) }
							</Text>
						) }
						<Stack direction="row" justify="flex-end" gap="sm">
							{ isSafeHref( item.theme_uri ) && (
								<Button
									tone="neutral"
									variant="outline"
									render={
										<a
											href={ item.theme_uri }
											target="_blank"
											rel="noopener noreferrer"
										/>
									}
								>
									{ __(
										'Theme site',
										'wp-admin-workspaces'
									) }
								</Button>
							) }
							{ ! isActive && (
								<Button
									tone="neutral"
									variant="outline"
									render={
										<a href={ livePreviewUrl( item ) } />
									}
								>
									{ __(
										'Live Preview',
										'wp-admin-workspaces'
									) }
								</Button>
							) }
							<Button variant="minimal" onClick={ closeModal }>
								{ __( 'Close', 'wp-admin-workspaces' ) }
							</Button>
							{ ! isActive && (
								<Button
									tone="brand"
									variant="solid"
									onClick={ async () => {
										const ok = await activate( item );
										if ( ok ) {
											closeModal();
										}
									} }
								>
									{ __( 'Activate', 'wp-admin-workspaces' ) }
								</Button>
							) }
						</Stack>
					</Stack>
				</PortalThemeScope>
			);
		},
		[ activate, themeNames ]
	);

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: FIELD_RENDERERS,
				elementFallbacks: {
					status: elementsFromLabels( STATUS_LABELS ),
				},
			} ),
		[ dataViewConfig ]
	);

	const actions = useMemo(
		() =>
			buildActions( dataViewConfig.actions, {
				labels: ACTION_LABELS,
				callbacks: { activate: ( items ) => activate( items[ 0 ] ) },
				modals: { details: renderDetailsModal },
			} ),
		[ dataViewConfig, activate, renderDetailsModal ]
	);

	// DataViews is controlled, so it doesn't filter/sort/paginate the `data` we
	// hand it — the consumer must. `filterSortAndPaginate` is the package's own
	// derivation (search across `enableGlobalSearch` fields, the status filter,
	// view.sort, and the page slice), so the search box / status filter /
	// column sort / pager all work on installs with >50 themes.
	const { data: shownData, paginationInfo } = useMemo(
		() => filterSortAndPaginate( data, view, fields ),
		[ data, view, fields ]
	);

	return (
		<div className="wp-admin-workspaces-app-themes wp-admin-workspaces-app--fill">
			{ ! themes ? (
				<div className="wp-admin-workspaces-app__center">
					<Spinner />
				</div>
			) : (
				<DataViews
					data={ shownData }
					fields={ fields }
					view={ view }
					onChangeView={ setView }
					actions={ actions }
					paginationInfo={ paginationInfo }
					isLoading={ isResolving }
					defaultLayouts={ dataViewConfig.defaultLayouts ?? {} }
					selection={ selection }
					onChangeSelection={ setSelection }
					getItemId={ ( item ) => item.id }
				/>
			) }
		</div>
	);
}
