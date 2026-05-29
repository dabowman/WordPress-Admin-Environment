import '../_shared/app.css';
import { Spinner } from '@wordpress/components';
import { useMemo } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Text } from '@wordpress/ui';
import { __, sprintf, _n } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { navigate } from '../../runtime/routing/router';
import { useDataView } from '../../runtime/dataView/useDataView';
import {
	buildFields,
	elementsFromLabels,
} from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import {
	useEntityElementCounts,
	invalidateEntityElementCounts,
} from '../_shared/dataviews/useEntityElementCounts';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';

/**
 * Map a post type id to the URL hash that opens its editor route.
 * Routes are bundled in shells that surface PostsApp + the native
 * editor (e.g. single-pane-demo). The `post` / `page` post types get their own pluralized
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

const STATUS_VALUES = Object.keys( STATUS_LABELS );

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	title: __( 'Title', 'wp-admin-shell' ),
	status: __( 'Status', 'wp-admin-shell' ),
	author: __( 'Author', 'wp-admin-shell' ),
	date: __( 'Date', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-shell' ),
	view: __( 'View', 'wp-admin-shell' ),
	trash: __( 'Move to Trash', 'wp-admin-shell' ),
};

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
 * Field id → render callback. View-config declares the *shape*; the React
 * layer supplies the row renderer. Unknown ids fall through to DataViews'
 * default renderer for the declared field type.
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

export default function PostsApp( { config } ) {
	const postType = config.postType || 'post';
	const screenId = config.screenId || null;

	const { config: dataViewConfig } = useDataView( screenId );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
		resyncKeys: [ postType ],
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

	const statusCounts = useEntityElementCounts(
		'postType',
		postType,
		'status',
		STATUS_VALUES
	);

	const { deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
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

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers( postType ),
				elementFallbacks: {
					status: elementsFromLabels( STATUS_LABELS ),
				},
				elementCounts: {
					status: statusCounts,
				},
			} ),
		[ dataViewConfig, postType, statusCounts ]
	);

	const actions = useMemo( () => {
		const trashModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __(
							'Are you sure you want to move this item to the trash?',
							'wp-admin-shell'
					  )
					: __(
							'Are you sure you want to move these items to the trash?',
							'wp-admin-shell'
					  ),
			confirmLabel: __( 'Move to Trash', 'wp-admin-shell' ),
			mutate: ( item ) =>
				deleteEntityRecord( 'postType', postType, item.id ),
			onSettled: ( { items, failed } ) => {
				invalidateResolution( 'getEntityRecords', [
					'postType',
					postType,
					queryArgs,
				] );
				// Trash moves rows between statuses, so the count queries
				// the filter labels read from need to refresh too.
				invalidateEntityElementCounts(
					invalidateResolution,
					'postType',
					postType,
					'status',
					STATUS_VALUES
				);
				if ( failed > 0 ) {
					createNotice(
						'error',
						sprintf(
							/* translators: 1: failed item count, 2: total item count */
							_n(
								'%1$d of %2$d item failed to move to trash.',
								'%1$d of %2$d items failed to move to trash.',
								failed,
								'wp-admin-shell'
							),
							failed,
							items.length
						),
						{ type: 'snackbar' }
					);
				}
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				edit: ( items ) =>
					navigate( editHref( postType, items[ 0 ].id ) ),
				view: ( items ) => {
					window.open(
						items[ 0 ].link,
						'_blank',
						'noopener,noreferrer'
					);
				},
			},
			modals: { trash: trashModal },
		} );
	}, [
		dataViewConfig,
		postType,
		deleteEntityRecord,
		invalidateResolution,
		queryArgs,
		createNotice,
	] );

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	return (
		<div className="wp-admin-shell-app-posts wp-admin-shell-app--fill">
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
					defaultLayouts={ dataViewConfig.defaultLayouts ?? {} }
					selection={ selection }
					onChangeSelection={ setSelection }
					getItemId={ ( item ) => item.id.toString() }
				/>
			) }
		</div>
	);
}
