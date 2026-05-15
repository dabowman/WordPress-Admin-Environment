import './index.css';
import { useEffect, useMemo, useState, useCallback } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { resolveIcon } from '../../runtime/config/iconMap';
import { useViewConfig } from '../../runtime/viewConfig/useViewConfig';

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

const STATUS_LABELS = {
	active: __( 'Active', 'wp-admin-shell' ),
	inactive: __( 'Inactive', 'wp-admin-shell' ),
};

// View-configs ship as locale-agnostic JSON primitives (spec §13 #7) — labels
// reach DataViews with raw English strings regardless of the user's locale.
// Recover translation by mapping known field/action ids to `__()`-wrapped
// strings at module load. Unknown ids fall through to `spec.label` so
// plugin-extension columns / actions keep their cascade-supplied strings.
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

function buildFieldRenderers() {
	return {
		name: ( { item } ) => <Text>{ item.name }</Text>,
		screenshot: ( { item } ) =>
			item.screenshot ? (
				<img
					src={ item.screenshot }
					alt={ item.name || '' }
					loading="lazy"
				/>
			) : null,
		status: ( { item } ) => (
			<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
		),
		description: ( { item } ) => (
			<Text>{ ( item.description || '' ).slice( 0, 140 ) }</Text>
		),
		version: ( { item } ) => <Text>{ item.version || '' }</Text>,
		author: ( { item } ) => <Text>{ item.author || '' }</Text>,
	};
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

function buildActions( actions, { activate, renderDetailsModal } ) {
	const callbacks = {
		activate: ( items ) => activate( items[ 0 ] ),
	};

	const renderers = {
		details: renderDetailsModal,
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
				isEligible: compileEligibility( spec.eligibleWhen ),
			};
			if ( renderers[ spec.id ] ) {
				compiled.RenderModal = renderers[ spec.id ];
			} else if ( callbacks[ spec.id ] ) {
				compiled.callback = callbacks[ spec.id ];
			}
			return compiled;
		} );
}

export default function ThemesApp( { config = {} } ) {
	const variant = config.variant || null;

	const { config: viewConfig } = useViewConfig( 'root', 'theme', variant );

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

	const [ view, setView ] = useState( () => ( {
		...VIEW_DEFAULTS,
		...( viewConfig.defaultView || {} ),
	} ) );

	// Resync `view` when the variant flips on the same hook instance —
	// useState initializer runs once, so without this effect a variant switch
	// inherits the prior triple's perPage / sort / filters. Keyed only on the
	// variant axis (this app's variable input) so cascade re-resolves don't
	// clobber in-session view edits.
	useEffect( () => {
		setView( {
			...VIEW_DEFAULTS,
			...( viewConfig.defaultView || {} ),
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ variant ] );

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
					{ item.screenshot && (
						<img src={ item.screenshot } alt="" />
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
		() => buildFields( viewConfig.fields ?? [], buildFieldRenderers() ),
		[ viewConfig ]
	);

	const actions = useMemo(
		() =>
			buildActions( viewConfig.actions ?? [], {
				activate,
				renderDetailsModal,
			} ),
		[ viewConfig, activate, renderDetailsModal ]
	);

	const paginationInfo = useMemo(
		() => ( {
			totalItems: data.length,
			totalPages: 1,
		} ),
		[ data.length ]
	);

	const [ selection, setSelection ] = useState( [] );

	return (
		<div className="wp-admin-shell-app-themes">
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isResolving }
				defaultLayouts={ viewConfig.defaultLayouts ?? {} }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id }
			/>
		</div>
	);
}
