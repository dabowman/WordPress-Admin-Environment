/**
 * DataViews Free Composition Mode
 *
 * Use for: Custom layout arrangements where default DataViews chrome doesn't fit.
 * Available since: WordPress 6.9+
 *
 * This template demonstrates:
 * - Using children prop to unlock subcomponents
 * - Custom arrangement of search, filters, layout, pagination
 * - Custom header with branding
 * - All nine available subcomponents
 */

import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews/wp';
import { useState, useMemo } from '@wordpress/element';
import { Button, Heading } from '@wordpress/components';

export default function FreeCompositionView( { records, onExport } ) {
	const fields = [
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			enableGlobalSearch: true,
			enableHiding: false,
		},
		{
			id: 'status',
			type: 'text',
			label: 'Status',
			elements: [
				{ value: 'active', label: 'Active' },
				{ value: 'inactive', label: 'Inactive' },
			],
			filterBy: { operators: [ 'isAny' ], isPrimary: true },
		},
		{
			id: 'date',
			type: 'datetime',
			label: 'Date',
		},
	];

	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'title', 'status', 'date' ],
		titleField: 'title',
		layout: {},
	} );

	const { data, paginationInfo } = useMemo(
		() => filterSortAndPaginate( records, view, fields ),
		[ records, view, fields ]
	);

	const [ selection, setSelection ] = useState( [] );

	return (
		<DataViews
			data={ data }
			fields={ fields }
			view={ view }
			onChangeView={ setView }
			paginationInfo={ paginationInfo }
			defaultLayouts={ { table: {}, grid: {} } }
			selection={ selection }
			onChangeSelection={ setSelection }
			actions={ [
				{
					id: 'export',
					label: 'Export Selected',
					supportsBulk: true,
					callback: ( items ) => onExport?.( items ),
				},
			] }
		>
			{ /* Custom header row */ }
			<div
				style={ {
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '16px 0',
					borderBottom: '1px solid #ddd',
					marginBottom: 16,
				} }
			>
				<div
					style={ {
						display: 'flex',
						alignItems: 'center',
						gap: 16,
					} }
				>
					<Heading level={ 2 } style={ { margin: 0 } }>
						My Custom View
					</Heading>
					<DataViews.Search />
				</div>
				<div
					style={ {
						display: 'flex',
						alignItems: 'center',
						gap: 8,
					} }
				>
					<Button variant="secondary" onClick={ onExport }>
						Export All
					</Button>
					<DataViews.LayoutSwitcher />
					<DataViews.ViewConfig />
				</div>
			</div>

			{ /* Filter bar */ }
			<div
				style={ {
					display: 'flex',
					gap: 8,
					marginBottom: 16,
				} }
			>
				<DataViews.FiltersToggle />
				<DataViews.Filters />
			</div>

			{ /* Toggled filters (expanded filter panel) */ }
			<DataViews.FiltersToggled />

			{ /* Main data display */ }
			<DataViews.Layout />

			{ /* Footer with pagination and bulk actions */ }
			<div
				style={ {
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					padding: '16px 0',
					borderTop: '1px solid #ddd',
					marginTop: 16,
				} }
			>
				<DataViews.BulkActionToolbar />
				<DataViews.Pagination />
			</div>
		</DataViews>
	);
}
