/**
 * Basic DataViews with Client-Side Filtering
 *
 * Use for: Small-to-medium datasets (< 1000 items) loaded upfront.
 * Import: Use '/wp' suffix for WordPress plugins.
 *
 * This template demonstrates:
 * - Field definitions with types, elements, and custom rendering
 * - Client-side filtering with filterSortAndPaginate
 * - Multiple layout support (table + grid)
 * - Primary and menu filters
 * - Custom sort behavior
 */

import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews/wp';
import { useState, useMemo } from '@wordpress/element';

// Sample data structure — replace with your own
const SAMPLE_DATA = [
	{
		id: 1,
		title: 'Getting Started with DataViews',
		author: 'admin',
		status: 'publish',
		date: '2024-11-15T10:30:00Z',
		category: 'tutorial',
	},
	{
		id: 2,
		title: 'Advanced Filtering Patterns',
		author: 'editor',
		status: 'draft',
		date: '2024-12-01T14:00:00Z',
		category: 'guide',
	},
];

export default function BasicDataView( { data = SAMPLE_DATA } ) {
	// Field definitions — these control display, filtering, sorting, and editing
	const fields = [
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			enableGlobalSearch: true, // included in search bar results
			enableHiding: false, // user cannot hide this column
		},
		{
			id: 'author',
			type: 'text',
			label: 'Author',
			elements: [
				{ value: 'admin', label: 'Administrator' },
				{ value: 'editor', label: 'Editor' },
				{ value: 'contributor', label: 'Contributor' },
			],
			filterBy: { operators: [ 'is', 'isNot' ] },
		},
		{
			id: 'status',
			type: 'text',
			label: 'Status',
			elements: [
				{ value: 'publish', label: 'Published' },
				{ value: 'draft', label: 'Draft' },
				{ value: 'pending', label: 'Pending' },
			],
			// isPrimary makes this filter always visible in the toolbar
			filterBy: { operators: [ 'isAny' ], isPrimary: true },
		},
		{
			id: 'category',
			type: 'text',
			label: 'Category',
			elements: [
				{ value: 'tutorial', label: 'Tutorial' },
				{ value: 'guide', label: 'Guide' },
				{ value: 'reference', label: 'Reference' },
			],
			filterBy: { operators: [ 'isAny', 'isNone' ] },
		},
		{
			id: 'date',
			type: 'datetime',
			label: 'Date',
			filterBy: { operators: [ 'after', 'before' ] },
		},
	];

	// View state — controlled by DataViews, stored in your component
	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'title', 'author', 'status', 'category', 'date' ],
		titleField: 'title',
		layout: {},
	} );

	// Client-side filtering — always wrap in useMemo
	const { data: visibleData, paginationInfo } = useMemo(
		() => filterSortAndPaginate( data, view, fields ),
		[ data, view, fields ]
	);

	return (
		<DataViews
			data={ visibleData }
			fields={ fields }
			view={ view }
			onChangeView={ setView }
			paginationInfo={ paginationInfo }
			defaultLayouts={ { table: {}, grid: {} } }
			getItemId={ ( item ) => item.id.toString() }
		/>
	);
}
