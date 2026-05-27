/**
 * CRUD Interface: DataViews + DataForm
 *
 * Use for: Full create/read/update/delete admin interfaces.
 *
 * This template demonstrates:
 * - Shared field definitions for display and editing
 * - DataForm with validation (useFormValidity)
 * - Form layout with panels and grouping
 * - Edit via primary action
 * - Delete with modal confirmation
 * - List ↔ edit mode switching
 */

import {
	DataViews,
	DataForm,
	filterSortAndPaginate,
	useFormValidity,
} from '@wordpress/dataviews/wp';
import { useState, useMemo, useCallback } from '@wordpress/element';
import { Button, Icon } from '@wordpress/components';
import { pencil, arrowLeft } from '@wordpress/icons';

export default function CrudInterface( { initialRecords } ) {
	const [ records, setRecords ] = useState( initialRecords );
	const [ editingItem, setEditingItem ] = useState( null );
	const [ selection, setSelection ] = useState( [] );

	// Shared fields — used by BOTH DataViews and DataForm
	const fields = [
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			enableGlobalSearch: true,
			enableHiding: false,
			isValid: { required: true },
			render: ( { item } ) => <strong>{ item.title }</strong>,
		},
		{
			id: 'description',
			type: 'text',
			label: 'Description',
			Edit: { control: 'textarea', rows: 4 },
			enableSorting: false,
		},
		{
			id: 'status',
			type: 'text',
			label: 'Status',
			Edit: 'select',
			elements: [
				{ value: 'active', label: 'Active' },
				{ value: 'inactive', label: 'Inactive' },
				{ value: 'archived', label: 'Archived' },
			],
			filterBy: { operators: [ 'isAny' ], isPrimary: true },
			isValid: { required: true, elements: true },
		},
		{
			id: 'priority',
			type: 'integer',
			label: 'Priority',
			isValid: {
				custom: ( item, field ) => {
					const val = field.getValue( { item } );
					if ( val === undefined || val === null || val === '' ) {
						return null;
					}
					if ( val < 1 || val > 10 ) {
						return 'Priority must be between 1 and 10';
					}
					return null;
				},
			},
		},
		{
			id: 'category',
			type: 'text',
			label: 'Category',
			Edit: 'select',
			elements: [
				{ value: 'general', label: 'General' },
				{ value: 'important', label: 'Important' },
				{ value: 'urgent', label: 'Urgent' },
			],
			filterBy: { operators: [ 'isAny', 'isNone' ] },
		},
		{
			id: 'date',
			type: 'datetime',
			label: 'Created',
			readOnly: true, // shown in DataForm but not editable
		},
	];

	// Form configuration for DataForm
	const form = {
		layout: { type: 'regular', labelPosition: 'top' },
		fields: [
			'title',
			'description',
			{
				id: 'settings',
				label: 'Settings',
				children: [ 'status', 'priority', 'category' ],
				layout: { type: 'panel' },
			},
			'date',
		],
	};

	// Actions for the list view
	const actions = [
		{
			id: 'edit',
			label: 'Edit',
			isPrimary: true,
			icon: <Icon icon={ pencil } />,
			callback: ( items ) => setEditingItem( { ...items[ 0 ] } ),
		},
		{
			id: 'delete',
			label: ( items ) =>
				`Delete ${ items.length } item${ items.length > 1 ? 's' : '' }`,
			supportsBulk: true,
			RenderModal: ( { items, closeModal, onActionPerformed } ) => (
				<div style={ { padding: 16 } }>
					<p>
						Are you sure you want to delete{ ' ' }
						<strong>{ items.length }</strong> item
						{ items.length > 1 ? 's' : '' }? This cannot be undone.
					</p>
					<div
						style={ {
							display: 'flex',
							justifyContent: 'flex-end',
							gap: 8,
							marginTop: 16,
						} }
					>
						<Button variant="tertiary" onClick={ closeModal }>
							Cancel
						</Button>
						<Button
							variant="primary"
							isDestructive
							onClick={ () => {
								const deleteIds = items.map( ( i ) => i.id );
								setRecords( ( prev ) =>
									prev.filter(
										( r ) => ! deleteIds.includes( r.id )
									)
								);
								onActionPerformed?.( items );
								closeModal();
							} }
						>
							Delete
						</Button>
					</div>
				</div>
			),
		},
	];

	// View state
	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'date', direction: 'desc' },
		fields: [ 'title', 'status', 'priority', 'category', 'date' ],
		titleField: 'title',
		layout: {},
	} );

	// Save handler
	const handleSave = useCallback(
		( item ) => {
			setRecords( ( prev ) =>
				prev.map( ( r ) => ( r.id === item.id ? item : r ) )
			);
			setEditingItem( null );
		},
		[]
	);

	// --- Edit Mode ---
	if ( editingItem ) {
		return (
			<EditView
				item={ editingItem }
				fields={ fields }
				form={ form }
				onSave={ handleSave }
				onChange={ setEditingItem }
				onCancel={ () => setEditingItem( null ) }
			/>
		);
	}

	// --- List Mode ---
	const { data, paginationInfo } = filterSortAndPaginate(
		records,
		view,
		fields
	);

	return (
		<DataViews
			data={ data }
			fields={ fields }
			view={ view }
			onChangeView={ setView }
			actions={ actions }
			paginationInfo={ paginationInfo }
			selection={ selection }
			onChangeSelection={ setSelection }
			defaultLayouts={ { table: {}, grid: {} } }
			isItemClickable={ () => true }
			onClickItem={ ( item ) => setEditingItem( { ...item } ) }
		/>
	);
}

// Separate edit component to use hooks properly
function EditView( { item, fields, form, onSave, onChange, onCancel } ) {
	const { isValid, validity } = useFormValidity( item, fields, form );

	return (
		<div style={ { maxWidth: 640 } }>
			<Button
				variant="tertiary"
				icon={ arrowLeft }
				onClick={ onCancel }
				style={ { marginBottom: 16 } }
			>
				Back to list
			</Button>

			<DataForm
				data={ item }
				fields={ fields }
				form={ form }
				validity={ validity }
				onChange={ ( edits ) =>
					onChange( ( prev ) => ( { ...prev, ...edits } ) )
				}
			/>

			<div
				style={ {
					display: 'flex',
					justifyContent: 'flex-end',
					gap: 8,
					marginTop: 24,
				} }
			>
				<Button variant="tertiary" onClick={ onCancel }>
					Cancel
				</Button>
				<Button
					variant="primary"
					disabled={ ! isValid }
					onClick={ () => onSave( item ) }
				>
					Save Changes
				</Button>
			</div>
		</div>
	);
}
