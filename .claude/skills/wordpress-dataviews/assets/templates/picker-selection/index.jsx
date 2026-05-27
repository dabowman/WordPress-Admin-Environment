/**
 * DataViewsPicker — Item Selection Flow
 *
 * Use for: Media pickers, page selectors, link inserters, any item chooser.
 *
 * Key differences from DataViews:
 * - Click selects (no ctrl/cmd needed)
 * - Uses listbox/option ARIA roles
 * - Selection persists across pages
 * - Only pickerGrid and pickerTable layouts
 * - Actions appear as footer buttons (callback only, no RenderModal)
 *
 * This template demonstrates:
 * - Single and multi selection patterns
 * - Footer action buttons
 * - Wrapping in a Modal dialog
 * - pickerGrid and pickerTable layouts
 */

import {
	DataViewsPicker,
	filterSortAndPaginate,
} from '@wordpress/dataviews/wp';
import { useState, useMemo } from '@wordpress/element';
import { Modal } from '@wordpress/components';

// --- Multi-Selection Picker ---

export function MultiSelectPicker( { items, onConfirm, onCancel } ) {
	const [ selection, setSelection ] = useState( [] );

	const fields = [
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			enableGlobalSearch: true,
			enableHiding: false,
		},
		{
			id: 'type',
			type: 'text',
			label: 'Type',
			elements: [
				{ value: 'page', label: 'Page' },
				{ value: 'post', label: 'Post' },
			],
			filterBy: { operators: [ 'isAny' ], isPrimary: true },
		},
		{
			id: 'thumbnail',
			type: 'media',
			label: 'Thumbnail',
			render: ( { item } ) =>
				item.thumbnailUrl ? (
					<img
						src={ item.thumbnailUrl }
						alt=""
						style={ {
							width: '100%',
							height: 120,
							objectFit: 'cover',
						} }
					/>
				) : null,
		},
	];

	const [ view, setView ] = useState( {
		type: 'pickerGrid',
		search: '',
		filters: [],
		page: 1,
		perPage: 12,
		sort: { field: 'title', direction: 'asc' },
		fields: [ 'title', 'type' ],
		titleField: 'title',
		mediaField: 'thumbnail',
		layout: {},
	} );

	const { data, paginationInfo } = useMemo(
		() => filterSortAndPaginate( items, view, fields ),
		[ items, view, fields ]
	);

	const actions = [
		{
			id: 'confirm',
			label:
				selection.length > 0
					? `Select ${ selection.length } item${
							selection.length > 1 ? 's' : ''
					  }`
					: 'Select items',
			isPrimary: true,
			supportsBulk: true,
			disabled: selection.length === 0,
			callback: () => {
				const selectedItems = items.filter( ( item ) =>
					selection.includes( item.id.toString() )
				);
				onConfirm( selectedItems );
			},
		},
		{
			id: 'cancel',
			label: 'Cancel',
			supportsBulk: true,
			callback: () => onCancel(),
		},
	];

	return (
		<DataViewsPicker
			data={ data }
			fields={ fields }
			view={ view }
			onChangeView={ setView }
			actions={ actions }
			paginationInfo={ paginationInfo }
			selection={ selection }
			onChangeSelection={ setSelection }
			defaultLayouts={ { pickerGrid: {}, pickerTable: {} } }
			itemListLabel="Select items"
		/>
	);
}

// --- Single-Selection Picker ---

export function SingleSelectPicker( { items, onSelect, onCancel } ) {
	const [ selection, setSelection ] = useState( [] );

	const fields = [
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			enableGlobalSearch: true,
		},
		{
			id: 'date',
			type: 'datetime',
			label: 'Date',
		},
	];

	const [ view, setView ] = useState( {
		type: 'pickerTable',
		search: '',
		filters: [],
		page: 1,
		perPage: 10,
		sort: { field: 'title', direction: 'asc' },
		fields: [ 'title', 'date' ],
		titleField: 'title',
		layout: {},
	} );

	const { data, paginationInfo } = useMemo(
		() => filterSortAndPaginate( items, view, fields ),
		[ items, view, fields ]
	);

	return (
		<DataViewsPicker
			data={ data }
			fields={ fields }
			view={ view }
			onChangeView={ setView }
			actions={ [
				{
					id: 'select',
					label: 'Select',
					isPrimary: true,
					supportsBulk: true,
					disabled: selection.length === 0,
					callback: () => {
						const item = items.find(
							( i ) => i.id.toString() === selection[ 0 ]
						);
						onSelect( item );
					},
				},
				{
					id: 'cancel',
					label: 'Cancel',
					supportsBulk: true,
					callback: () => onCancel(),
				},
			] }
			paginationInfo={ paginationInfo }
			selection={ selection }
			// Force single selection — only keep the latest selection
			onChangeSelection={ ( ids ) => setSelection( ids.slice( -1 ) ) }
			defaultLayouts={ { pickerTable: {} } }
			itemListLabel="Select an item"
		/>
	);
}

// --- Picker in a Modal ---

export function PickerModal( { isOpen, onClose, items, onSelect } ) {
	if ( ! isOpen ) {
		return null;
	}

	return (
		<Modal
			title="Select Content"
			onRequestClose={ onClose }
			size="large"
			style={ { maxWidth: 800, height: '80vh' } }
		>
			<MultiSelectPicker
				items={ items }
				onConfirm={ ( selected ) => {
					onSelect( selected );
					onClose();
				} }
				onCancel={ onClose }
			/>
		</Modal>
	);
}
