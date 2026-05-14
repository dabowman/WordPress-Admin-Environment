import './index.css';
import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __, sprintf, _n } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { navigate } from '../../runtime/routing/router';
import { resolveIcon } from '../../runtime/config/iconMap';
import { useViewConfig } from '../../runtime/viewConfig/useViewConfig';
import { POSTS_VIEW_CONFIG_FALLBACK } from './viewConfigFallback';

/**
 * Map a post type id to the URL hash that opens its editor route.
 * Routes are bundled in shells that surface PostsApp + the native
 * editor (developer-admin / content-author / single-pane-demo /
 * v2-demo). The `post` / `page` post types get their own pluralized
 * paths (`/posts/{id}/edit`, `/pages/{id}/edit`) — site-editor post
 * types (`wp_template`, `wp_block`, `wp_navigation`) need their own
 * edit canvas + URL-encoding (slug-shaped ids); defer until those
 * screens land.
 * @param {*} postType
 * @param {*} id
 */
function editHref( postType, id ) {
	const segment = postType === 'page' ? 'pages' : 'posts';
	return `#/${ segment }/${ id }/edit`;
}

const STATUS_LABELS = {
	publish: __( 'Published', 'wp-admin-shell' ),
	draft: __( 'Draft', 'wp-admin-shell' ),
	pending: __( 'Pending', 'wp-admin-shell' ),
	private: __( 'Private', 'wp-admin-shell' ),
	future: __( 'Scheduled', 'wp-admin-shell' ),
	trash: __( 'Trash', 'wp-admin-shell' ),
};

/**
 * Sane defaults for the DataViews `view` state shape. View-configs
 * authored in admin.json typically omit empty-list fields like
 * `filters: []` and `search: ''` — those keys must always exist or
 * downstream code iterating them crashes (the queryArgs `for (... of
 * view.filters )` loop is the canonical victim).
 */
const VIEW_DEFAULTS = {
	type: 'table',
	search: '',
	filters: [],
	page: 1,
	perPage: 20,
	sort: { field: 'date', direction: 'desc' },
	fields: [],
	layout: {},
};

/**
 * Field id → render callback. View-config declares the *shape* (id,
 * type, label, hide/sort/search flags); the React layer supplies the
 * row renderer. Unknown ids fall through to DataViews' default
 * renderer for the declared field type.
 * @param {string} postType Active post type id from app config.
 */
function buildFieldRenderers( postType ) {
	return {
		title: ( { item } ) => (
			<Button
				variant="minimal"
				onClick={ () => navigate( editHref( postType, item.id ) ) }
			>
				{ item.title }
			</Button>
		),
		status: ( { item } ) => (
			<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
		),
		author: ( { item } ) => <Text>{ item.author }</Text>,
	};
}

/**
 * Compile a declarative `eligibleWhen` predicate into a DataViews
 * `isEligible(item)` callback. Supports `{ field: value | [values] }`
 * shape; absent → no eligibility filter (always shown).
 * @param {Object} eligibleWhen Eligibility map.
 */
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

function buildActions(
	actions,
	{ postType, deleteEntityRecord, createNotice }
) {
	const callbacks = {
		edit: ( items ) => navigate( editHref( postType, items[ 0 ].id ) ),
		view: ( items ) => {
			window.open( items[ 0 ].link, '_blank', 'noopener,noreferrer' );
		},
	};

	return actions
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				label: spec.label,
				isPrimary: !! spec.isPrimary,
				isDestructive: !! spec.isDestructive,
				supportsBulk: !! spec.supportsBulk,
				icon: spec.icon ? resolveIcon( spec.icon ) : undefined,
				isEligible: compileEligibility( spec.eligibleWhen ),
			};

			if ( spec.id === 'trash' ) {
				compiled.RenderModal = ( {
					items,
					closeModal,
					onActionPerformed,
				} ) => (
					<Stack
						direction="column"
						gap="md"
						style={ {
							padding: 'var(--wpds-dimension-padding-lg)',
						} }
					>
						<Text>
							{ items.length === 1
								? __(
										'Are you sure you want to move this item to the trash?',
										'wp-admin-shell'
								  )
								: __(
										'Are you sure you want to move these items to the trash?',
										'wp-admin-shell'
								  ) }
						</Text>
						<Stack direction="row" justify="flex-end" gap="sm">
							<Button variant="minimal" onClick={ closeModal }>
								{ __( 'Cancel', 'wp-admin-shell' ) }
							</Button>
							<DestructiveButton
								variant="primary"
								isDestructive
								onClick={ async () => {
									// `allSettled` so one failure doesn't
									// collapse the rest of a bulk action.
									// Surface partial-success via a
									// snackbar notice.
									const results = await Promise.allSettled(
										items.map( ( item ) =>
											deleteEntityRecord(
												'postType',
												postType,
												item.id
											)
										)
									);
									const failed = results.filter(
										( r ) => r.status === 'rejected'
									).length;
									if ( failed > 0 ) {
										createNotice(
											'error',
											sprintf(
												/* translators: 1: failed item count, 2: total item count */
												_n(
													'%1$d of %2$d item failed to move to trash.',
													'%1$d of %2$d items failed to move to trash.',
													items.length,
													'wp-admin-shell'
												),
												failed,
												items.length
											),
											{ type: 'snackbar' }
										);
									}
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Move to Trash', 'wp-admin-shell' ) }
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

function buildFields( fieldSpecs, fieldRenderers ) {
	return fieldSpecs
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				type: spec.type,
				label: spec.label,
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
				// Fallback: derive elements from STATUS_LABELS for the
				// status column when none are declared in the spec.
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

export default function PostsApp( { config } ) {
	const postType = config.postType || 'post';
	const variant = config.variant || null;

	const { config: viewConfig } = useViewConfig(
		'postType',
		postType,
		variant,
		{
			fallback: POSTS_VIEW_CONFIG_FALLBACK,
		}
	);

	const [ view, setView ] = useState( () => {
		const merged = {
			...VIEW_DEFAULTS,
			...( viewConfig.defaultView ||
				POSTS_VIEW_CONFIG_FALLBACK.defaultView ),
		};
		// DataViews renders `titleField` as its own special cell — if
		// the same id is also in `view.fields`, the column renders twice.
		// Authoring data tends to include it (intuitive: "list every
		// visible column"); strip it here so the gotcha is one-sided.
		if ( merged.titleField && Array.isArray( merged.fields ) ) {
			merged.fields = merged.fields.filter(
				( id ) => id !== merged.titleField
			);
		}
		return merged;
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'desc',
			orderby: view.sort?.field || 'date',
			status: config.status || 'any',
			context: 'edit',
			_embed: 'author',
		};

		if ( view.search ) {
			args.search = view.search;
		}

		for ( const filter of view.filters ) {
			if ( filter.field === 'status' ) {
				if (
					filter.operator === 'isAny' &&
					Array.isArray( filter.value )
				) {
					args.status = filter.value.join( ',' );
				} else if ( filter.operator === 'is' ) {
					args.status = filter.value;
				}
			}
			if ( filter.field === 'author' && filter.operator === 'is' ) {
				args.author = filter.value;
			}
		}

		return args;
	}, [ view, config.status ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'postType',
		postType,
		queryArgs
	);

	const { deleteEntityRecord } = useDispatch( coreStore );
	const { createNotice } = useDispatch( noticesStore );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => ( {
			id: record.id,
			title: decodeEntities(
				record.title?.rendered ||
					record.title?.raw ||
					__( '(no title)', 'wp-admin-shell' )
			),
			status: record.status,
			date: record.date,
			author: record._embedded?.author?.[ 0 ]?.name || '',
			link: record.link,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo( () => {
		const specs = Array.isArray( viewConfig.fields )
			? viewConfig.fields
			: POSTS_VIEW_CONFIG_FALLBACK.fields;
		return buildFields( specs, buildFieldRenderers( postType ) );
	}, [ viewConfig, postType ] );

	const actions = useMemo( () => {
		const specs = Array.isArray( viewConfig.actions )
			? viewConfig.actions
			: POSTS_VIEW_CONFIG_FALLBACK.actions;
		return buildActions( specs, {
			postType,
			deleteEntityRecord,
			createNotice,
		} );
	}, [ viewConfig, postType, deleteEntityRecord, createNotice ] );

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	const [ selection, setSelection ] = useState( [] );

	return (
		<div className="wp-admin-shell-app-posts">
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isResolving }
				defaultLayouts={
					viewConfig.defaultLayouts ||
					POSTS_VIEW_CONFIG_FALLBACK.defaultLayouts
				}
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>
		</div>
	);
}
