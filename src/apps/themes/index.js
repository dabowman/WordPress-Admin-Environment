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
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { useDataView } from '../../runtime/dataView/useDataView';
import {
	buildFields,
	elementsFromLabels,
} from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

const STATUS_LABELS = {
	active: __( 'Active', 'wp-admin-shell' ),
	inactive: __( 'Inactive', 'wp-admin-shell' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-shell' ),
	screenshot: __( 'Screenshot', 'wp-admin-shell' ),
	status: __( 'Status', 'wp-admin-shell' ),
	description: __( 'Description', 'wp-admin-shell' ),
	version: __( 'Version', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	activate: __( 'Activate', 'wp-admin-shell' ),
	details: __( 'Details', 'wp-admin-shell' ),
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
		( typeof window !== 'undefined' && window.wpAdminShell?.siteUrl ) || '';
	return `${ siteUrl }/wp-content/themes/${ encodeURIComponent(
		item.stylesheet
	) }/screenshot.png`;
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

	const activate = useCallback(
		async ( theme ) => {
			try {
				await apiFetch( {
					path: '/wp-admin-shell/v1/activate-theme',
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
					__( 'Theme activated.', 'wp-admin-shell' ),
					{ type: 'snackbar' }
				);
			} catch ( err ) {
				const target =
					( window.wpAdminShell?.adminUrl || '/wp-admin/' ) +
					`themes.php?action=activate&stylesheet=${ encodeURIComponent(
						theme.stylesheet
					) }`;
				window.location.href = target;
			}
		},
		[ invalidateResolution, themesQuery, createNotice ]
	);

	const renderDetailsModal = useCallback(
		( { items, closeModal } ) => {
			const item = items[ 0 ];
			if ( ! item ) {
				return null;
			}
			const isActive = item.status === 'active';
			return (
				<Stack
					direction="column"
					gap="md"
					className="wp-admin-shell-app-themes__details-modal"
				>
					{ screenshotUrl( item ) && (
						<img src={ screenshotUrl( item ) } alt="" />
					) }
					<Text variant="heading-md" render={ <h2 /> }>
						{ item.name }
					</Text>
					<Text>{ item.description }</Text>
					<Text variant="body-sm">
						{ __( 'Version', 'wp-admin-shell' ) }: { item.version }
						{ item.author
							? ' · ' +
							  __( 'Author', 'wp-admin-shell' ) +
							  ': ' +
							  item.author
							: '' }
					</Text>
					<Stack direction="row" justify="flex-end" gap="sm">
						{ item.theme_uri && (
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
								{ __( 'Theme site', 'wp-admin-shell' ) }
							</Button>
						) }
						<Button variant="minimal" onClick={ closeModal }>
							{ __( 'Close', 'wp-admin-shell' ) }
						</Button>
						{ ! isActive && (
							<Button
								tone="brand"
								variant="solid"
								onClick={ async () => {
									await activate( item );
									closeModal();
								} }
							>
								{ __( 'Activate', 'wp-admin-shell' ) }
							</Button>
						) }
					</Stack>
				</Stack>
			);
		},
		[ activate ]
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
			rawRecord: record,
		} ) );
	}, [ themes ] );

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
		<div className="wp-admin-shell-app-themes wp-admin-shell-app--fill">
			{ ! themes ? (
				<div className="wp-admin-shell-app__center">
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
