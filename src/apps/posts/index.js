import './index.css';
import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Stack, Text } from '@wordpress/ui';
import { Button as DestructiveButton } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { pencil, external, trash } from '@wordpress/icons';
import { navigate } from '../../runtime/routing/router';

/**
 * Map a post type id to the URL hash that opens its editor route.
 * Routes are bundled in shells that surface PostsApp + the native
 * editor (developer-admin / content-author / single-pane-demo /
 * v1-demo). The `post` / `page` post types get their own pluralized
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

export default function PostsApp( { config } ) {
	const postType = config.postType || 'post';

	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'title', 'status', 'author', 'date' ],
		titleField: 'title',
		layout: {},
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

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( record ) => ( {
			id: record.id,
			title:
				record.title?.rendered ||
				record.title?.raw ||
				__( '(no title)', 'wp-admin-shell' ),
			status: record.status,
			date: record.date,
			author: record._embedded?.author?.[ 0 ]?.name || '',
			link: record.link,
			rawRecord: record,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() => [
			{
				id: 'title',
				type: 'text',
				label: __( 'Title', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				enableHiding: false,
				// Site-editor post types (wp_template / wp_block / wp_navigation)
				// still need a separate edit pattern + URL-encoding for slug-shaped
				// IDs like "theme//slug"; defer until those screens get a v2 route.
				render: ( { item } ) => (
					<Button
						variant="minimal"
						onClick={ () =>
							navigate( editHref( postType, item.id ) )
						}
					>
						{ item.title }
					</Button>
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
					<Text>{ STATUS_LABELS[ item.status ] || item.status }</Text>
				),
				filterBy: {
					operators: [ 'isAny' ],
				},
			},
			{
				id: 'author',
				type: 'text',
				label: __( 'Author', 'wp-admin-shell' ),
				render: ( { item } ) => <Text>{ item.author }</Text>,
			},
			{
				id: 'date',
				type: 'datetime',
				label: __( 'Date', 'wp-admin-shell' ),
			},
		],
		[ postType ]
	);

	const actions = useMemo(
		() => [
			{
				id: 'edit',
				label: __( 'Edit', 'wp-admin-shell' ),
				isPrimary: true,
				icon: pencil,
				callback: ( items ) => {
					const item = items[ 0 ];
					navigate( editHref( postType, item.id ) );
				},
			},
			{
				id: 'view',
				label: __( 'View', 'wp-admin-shell' ),
				icon: external,
				isEligible: ( item ) => item.status === 'publish',
				callback: ( items ) => {
					window.open( items[ 0 ].link, '_blank' );
				},
			},
			{
				id: 'trash',
				label: __( 'Move to Trash', 'wp-admin-shell' ),
				isDestructive: true,
				supportsBulk: true,
				icon: trash,
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
					<Stack
						direction="column"
						gap="md"
						style={ { padding: '16px' } }
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
									await Promise.all(
										items.map( ( item ) =>
											deleteEntityRecord(
												'postType',
												postType,
												item.id
											)
										)
									);
									onActionPerformed?.( items );
									closeModal();
								} }
							>
								{ __( 'Move to Trash', 'wp-admin-shell' ) }
							</DestructiveButton>
						</Stack>
					</Stack>
				),
			},
		],
		[ postType, deleteEntityRecord ]
	);

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
				defaultLayouts={ { table: {}, grid: {} } }
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>
		</div>
	);
}
