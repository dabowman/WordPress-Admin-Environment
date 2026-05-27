/**
 * DataViews with Server-Side REST API Data Fetching
 *
 * Use for: Large datasets, WordPress REST API integration, real-time data.
 * Import: Use '/wp' suffix for WordPress plugins.
 *
 * This template demonstrates:
 * - Translating view state to REST API query params
 * - Server-side filtering, sorting, and pagination
 * - Loading states
 * - useEntityRecords integration
 * - Actions with REST API calls
 */

import { DataViews } from '@wordpress/dataviews/wp';
import { useState, useMemo } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { Icon, external, pencil } from '@wordpress/icons';
import apiFetch from '@wordpress/api-fetch';

export default function ServerSideDataView() {
	const fields = [
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			enableGlobalSearch: true,
			enableHiding: false,
			// For REST API entities, title is often an object { rendered: '...' }
			getValue: ( { item } ) =>
				typeof item.title === 'object'
					? item.title.rendered
					: item.title,
			render: ( { item } ) => (
				<span
					dangerouslySetInnerHTML={ {
						__html:
							typeof item.title === 'object'
								? item.title.rendered
								: item.title,
					} }
				/>
			),
		},
		{
			id: 'status',
			type: 'text',
			label: 'Status',
			elements: [
				{ value: 'publish', label: 'Published' },
				{ value: 'draft', label: 'Draft' },
				{ value: 'pending', label: 'Pending Review' },
				{ value: 'future', label: 'Scheduled' },
			],
			filterBy: { operators: [ 'isAny' ], isPrimary: true },
		},
		{
			id: 'author',
			type: 'text',
			label: 'Author',
			getValue: ( { item } ) =>
				item._embedded?.author?.[ 0 ]?.name || '',
			render: ( { item } ) => {
				const author = item._embedded?.author?.[ 0 ];
				if ( ! author ) return '—';
				return (
					<span
						style={ {
							display: 'flex',
							alignItems: 'center',
							gap: 8,
						} }
					>
						{ author.avatar_urls?.[ '24' ] && (
							<img
								src={ author.avatar_urls[ '24' ] }
								alt=""
								width={ 24 }
								height={ 24 }
								style={ { borderRadius: '50%' } }
							/>
						) }
						{ author.name }
					</span>
				);
			},
		},
		{
			id: 'date',
			type: 'datetime',
			label: 'Date',
			filterBy: { operators: [ 'after', 'before' ] },
		},
	];

	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'title', 'author', 'status', 'date' ],
		titleField: 'title',
		layout: {},
	} );

	// Translate view state → REST API query args
	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'desc',
			orderby: view.sort?.field || 'date',
			search: view.search || undefined,
			_embed: 'author',
			context: 'edit',
		};

		// Translate each filter to its REST API equivalent
		for ( const filter of view.filters || [] ) {
			switch ( filter.field ) {
				case 'status':
					if (
						filter.operator === 'isAny' &&
						Array.isArray( filter.value )
					) {
						args.status = filter.value.join( ',' );
					} else if ( filter.operator === 'is' ) {
						args.status = filter.value;
					}
					break;
				case 'author':
					if ( filter.operator === 'is' ) {
						args.author = filter.value;
					}
					break;
				case 'date':
					if ( filter.operator === 'after' ) {
						args.after = filter.value;
					}
					if ( filter.operator === 'before' ) {
						args.before = filter.value;
					}
					break;
			}
		}

		// Default status if no status filter is set
		if ( ! args.status ) {
			args.status = 'publish,draft,pending,future';
		}

		return args;
	}, [ view ] );

	// Fetch data using WordPress entity system
	const { records, totalItems, totalPages, isResolving } = useEntityRecords(
		'postType',
		'post', // Change to 'page', custom post type slug, etc.
		queryArgs
	);

	const actions = [
		{
			id: 'view',
			label: 'View',
			isPrimary: true,
			icon: <Icon icon={ external } />,
			isEligible: ( item ) => item.status === 'publish',
			callback: ( items ) => {
				window.open( items[ 0 ].link, '_blank' );
			},
		},
		{
			id: 'edit',
			label: 'Edit',
			isPrimary: true,
			icon: <Icon icon={ pencil } />,
			callback: ( items ) => {
				window.location.href = `/wp-admin/post.php?post=${ items[ 0 ].id }&action=edit`;
			},
		},
		{
			id: 'trash',
			label: 'Move to Trash',
			supportsBulk: true,
			callback: async ( items, { onActionPerformed } ) => {
				await Promise.all(
					items.map( ( item ) =>
						apiFetch( {
							path: `/wp/v2/posts/${ item.id }`,
							method: 'DELETE',
						} )
					)
				);
				onActionPerformed?.( items );
			},
		},
	];

	const [ selection, setSelection ] = useState( [] );

	return (
		<DataViews
			data={ records || [] }
			fields={ fields }
			view={ view }
			onChangeView={ setView }
			actions={ actions }
			paginationInfo={ {
				totalItems: totalItems || 0,
				totalPages: totalPages || 0,
			} }
			isLoading={ isResolving }
			selection={ selection }
			onChangeSelection={ setSelection }
			defaultLayouts={ { table: {}, grid: {} } }
			getItemId={ ( item ) => item.id.toString() }
		/>
	);
}
