/**
 * DataViews in a Standalone React App (Non-WordPress)
 *
 * Use for: React apps not running inside WordPress admin.
 * Import: Use bare '@wordpress/dataviews' (no /wp suffix).
 *
 * IMPORTANT: You must import component styles manually.
 *
 * Install:
 *   npm install @wordpress/dataviews @wordpress/components @wordpress/element @wordpress/icons
 *
 * This template demonstrates:
 * - Correct imports for non-WP context
 * - Required CSS imports
 * - Integration with any data source (fetch, GraphQL, etc.)
 */

// Required style imports for non-WordPress contexts
import '@wordpress/components/build-style/style.css';
import '@wordpress/theme/design-tokens.css';

// Note: NO /wp suffix for standalone usage
import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews';
import { useState, useMemo, useEffect } from 'react';

export default function StandaloneDataView() {
	const [ records, setRecords ] = useState( [] );
	const [ isLoading, setIsLoading ] = useState( true );

	const fields = [
		{
			id: 'name',
			type: 'text',
			label: 'Name',
			enableGlobalSearch: true,
			enableHiding: false,
		},
		{
			id: 'email',
			type: 'email',
			label: 'Email',
		},
		{
			id: 'role',
			type: 'text',
			label: 'Role',
			elements: [
				{ value: 'admin', label: 'Admin' },
				{ value: 'user', label: 'User' },
				{ value: 'viewer', label: 'Viewer' },
			],
			filterBy: { operators: [ 'isAny' ], isPrimary: true },
			Edit: 'select',
		},
		{
			id: 'active',
			type: 'boolean',
			label: 'Active',
			filterBy: { operators: [ 'is' ] },
		},
		{
			id: 'createdAt',
			type: 'datetime',
			label: 'Created',
		},
	];

	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 25,
		sort: { field: 'createdAt', direction: 'desc' },
		fields: [ 'name', 'email', 'role', 'active', 'createdAt' ],
		titleField: 'name',
		layout: {},
	} );

	// Fetch data from any source
	useEffect( () => {
		async function loadData() {
			setIsLoading( true );
			try {
				const response = await fetch( '/api/users' );
				const data = await response.json();
				setRecords( data );
			} catch ( error ) {
				console.error( 'Failed to load data:', error );
			} finally {
				setIsLoading( false );
			}
		}
		loadData();
	}, [] );

	const { data, paginationInfo } = useMemo(
		() => filterSortAndPaginate( records, view, fields ),
		[ records, view, fields ]
	);

	const actions = [
		{
			id: 'edit',
			label: 'Edit',
			isPrimary: true,
			icon: '✏️', // Use @wordpress/icons for proper icons
			callback: ( items ) => {
				console.log( 'Edit:', items[ 0 ] );
			},
		},
	];

	return (
		<div
			style={ {
				// DataViews uses this CSS custom property for background
				'--wp-dataviews-color-background': '#ffffff',
				maxWidth: 1200,
				margin: '0 auto',
				padding: 24,
			} }
		>
			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isLoading }
				defaultLayouts={ { table: {}, grid: {} } }
			/>
		</div>
	);
}
