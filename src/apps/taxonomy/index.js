import { useMemo, useState } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews, DataForm } from '@wordpress/dataviews/wp';
import { Button, Icon, Stack, Text } from '@wordpress/ui';
import { Modal } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { plus } from '@wordpress/icons';
import { useDataView } from '../../runtime/dataView/useDataView';
import { buildFields } from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';

const DEFAULT_TAXONOMY_LABEL = {
	category: __( 'Categories', 'wp-admin-shell' ),
	post_tag: __( 'Tags', 'wp-admin-shell' ),
};

// Locale tables for the ids this app authors — see buildFields/buildActions.
const FIELD_LABELS = {
	name: __( 'Name', 'wp-admin-shell' ),
	slug: __( 'Slug', 'wp-admin-shell' ),
	count: __( 'Count', 'wp-admin-shell' ),
	description: __( 'Description', 'wp-admin-shell' ),
};

const ACTION_LABELS = {
	edit: __( 'Edit', 'wp-admin-shell' ),
	delete: __( 'Delete', 'wp-admin-shell' ),
};

const VIEW_DEFAULTS = {
	type: 'table',
	search: '',
	filters: [],
	page: 1,
	perPage: 20,
	sort: { field: 'name', direction: 'asc' },
	fields: [],
	layout: {},
};

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

/**
 * Field id → render callback.
 *
 * @param {Object}   deps
 * @param {Function} deps.onEditTerm Open the edit modal for a raw term record.
 */
function buildFieldRenderers( { onEditTerm } ) {
	return {
		name: ( { item } ) => (
			<Button
				variant="minimal"
				onClick={ () => onEditTerm( item.rawRecord ) }
			>
				{ item.name }
			</Button>
		),
		slug: ( { item } ) => <Text>{ item.slug }</Text>,
		count: ( { item } ) => <Text>{ item.count }</Text>,
		description: ( { item } ) => (
			<Text>{ stripTags( item.description ) }</Text>
		),
	};
}

export default function TaxonomyApp( { config = {} } ) {
	const taxonomy = config.taxonomy || 'category';
	const screenId = config.screenId || null;
	const heading =
		config.title || DEFAULT_TAXONOMY_LABEL[ taxonomy ] || taxonomy;

	const { config: dataViewConfig } = useDataView( screenId );

	const { view, setView, selection, setSelection } = useEntityDataView( {
		screenId,
		dataViewConfig,
		viewDefaults: VIEW_DEFAULTS,
		resyncKeys: [ taxonomy ],
	} );

	const queryArgs = useMemo( () => {
		const args = {
			per_page: view.perPage,
			page: view.page,
			order: view.sort?.direction || 'asc',
			orderby: view.sort?.field || 'name',
			context: 'edit',
			hide_empty: false,
		};
		if ( view.search ) {
			args.search = view.search;
		}
		return args;
	}, [ view ] );

	const { records, isResolving, totalItems, totalPages } = useEntityRecords(
		'taxonomy',
		taxonomy,
		queryArgs
	);

	const { saveEntityRecord, deleteEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

	const [ editTerm, setEditTerm ] = useState( null );
	const [ isCreating, setIsCreating ] = useState( false );

	const data = useMemo( () => {
		if ( ! records ) {
			return [];
		}
		return records.map( ( t ) => ( {
			id: t.id,
			name: decodeEntities( t.name || '' ),
			slug: t.slug,
			count: t.count,
			description: t.description || '',
			parent: t.parent || 0,
			rawRecord: t,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers( { onEditTerm: setEditTerm } ),
			} ),
		[ dataViewConfig ]
	);

	const actions = useMemo( () => {
		const deleteModal = createBulkConfirmModal( {
			getMessage: ( items ) =>
				items.length === 1
					? __( 'Delete this term?', 'wp-admin-shell' )
					: __(
							'Delete these terms? Posts assigned to them will lose this term.',
							'wp-admin-shell'
					  ),
			confirmLabel: __( 'Delete', 'wp-admin-shell' ),
			// Terms have no trash — `force: true` is required or the request
			// 400s.
			mutate: ( item ) =>
				deleteEntityRecord( 'taxonomy', taxonomy, item.id, {
					force: true,
				} ),
			onSettled: ( { results, failed } ) => {
				invalidateResolution( 'getEntityRecords', [
					'taxonomy',
					taxonomy,
				] );
				if ( failed > 0 ) {
					const first = results.find(
						( r ) => r.status === 'rejected'
					);
					createErrorNotice(
						first?.reason?.message ||
							__( 'Failed to delete term.', 'wp-admin-shell' ),
						{ isDismissible: true }
					);
				} else {
					createSuccessNotice(
						__( 'Term deleted.', 'wp-admin-shell' ),
						{ type: 'snackbar' }
					);
				}
			},
		} );

		return buildActions( dataViewConfig.actions, {
			labels: ACTION_LABELS,
			callbacks: {
				edit: ( items ) => setEditTerm( items[ 0 ].rawRecord ),
			},
			modals: { delete: deleteModal },
		} );
	}, [
		dataViewConfig,
		taxonomy,
		deleteEntityRecord,
		invalidateResolution,
		createSuccessNotice,
		createErrorNotice,
	] );

	const paginationInfo = useMemo(
		() => ( {
			totalItems: totalItems || 0,
			totalPages: totalPages || 0,
		} ),
		[ totalItems, totalPages ]
	);

	return (
		<div className="wp-admin-shell-app-taxonomy">
			<Stack
				direction="row"
				align="center"
				justify="space-between"
				className="wp-admin-shell-app-taxonomy__toolbar"
			>
				<Text variant="heading-md" render={ <h2 /> }>
					{ heading }
				</Text>
				<Button
					tone="brand"
					variant="solid"
					onClick={ () => setIsCreating( true ) }
					size="compact"
				>
					<Icon icon={ plus } size={ 16 } />
					{ __( 'Add new', 'wp-admin-shell' ) }
				</Button>
			</Stack>

			<DataViews
				data={ data }
				fields={ fields }
				view={ view }
				onChangeView={ setView }
				actions={ actions }
				paginationInfo={ paginationInfo }
				isLoading={ isResolving }
				defaultLayouts={
					dataViewConfig.defaultLayouts ?? { table: {} }
				}
				selection={ selection }
				onChangeSelection={ setSelection }
				getItemId={ ( item ) => item.id.toString() }
			/>

			{ ( editTerm || isCreating ) && (
				<TermEditModal
					term={ editTerm }
					taxonomy={ taxonomy }
					onClose={ () => {
						setEditTerm( null );
						setIsCreating( false );
					} }
					onSave={ saveEntityRecord }
					onSaved={ () => {
						invalidateResolution( 'getEntityRecords', [
							'taxonomy',
							taxonomy,
						] );
						createSuccessNotice(
							__( 'Term saved.', 'wp-admin-shell' ),
							{ type: 'snackbar' }
						);
					} }
					onError={ ( err ) =>
						createErrorNotice(
							err?.message ||
								__( 'Failed to save term.', 'wp-admin-shell' ),
							{ isDismissible: true }
						)
					}
				/>
			) }
		</div>
	);
}

const TERM_FIELDS = [
	{
		id: 'name',
		type: 'text',
		label: __( 'Name', 'wp-admin-shell' ),
		isValid: { required: true },
	},
	{
		id: 'slug',
		type: 'text',
		label: __( 'Slug', 'wp-admin-shell' ),
	},
	{
		id: 'description',
		type: 'text',
		label: __( 'Description', 'wp-admin-shell' ),
		Edit: { control: 'textarea', rows: 4 },
	},
];

const TERM_FORM = {
	layout: { type: 'regular', labelPosition: 'top' },
	fields: [ 'name', 'slug', 'description' ],
};

function TermEditModal( {
	term,
	taxonomy,
	onClose,
	onSave,
	onSaved,
	onError,
} ) {
	const isNew = ! term;
	const [ data, setData ] = useState( {
		name: term?.name || '',
		slug: term?.slug || '',
		description: term?.description || '',
	} );
	const [ isSaving, setIsSaving ] = useState( false );

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const payload = { ...data };
			if ( ! isNew ) {
				payload.id = term.id;
			}
			await onSave( 'taxonomy', taxonomy, payload );
			onSaved?.();
			onClose();
		} catch ( err ) {
			onError?.( err );
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<Modal
			title={
				isNew
					? __( 'Add term', 'wp-admin-shell' )
					: __( 'Edit term', 'wp-admin-shell' )
			}
			onRequestClose={ onClose }
		>
			<Stack direction="column" gap="md">
				<DataForm
					data={ data }
					fields={ TERM_FIELDS }
					form={ TERM_FORM }
					onChange={ ( edits ) =>
						setData( ( prev ) => ( { ...prev, ...edits } ) )
					}
				/>
				<Stack direction="row" justify="flex-end" gap="sm">
					<Button variant="minimal" onClick={ onClose }>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						loading={ isSaving }
						disabled={ ! data.name || isSaving }
					>
						{ isNew
							? __( 'Add term', 'wp-admin-shell' )
							: __( 'Save', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</Modal>
	);
}
