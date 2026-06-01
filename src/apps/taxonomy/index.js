import { useMemo, useState } from '@wordpress/element';
import {
	useEntityRecord,
	useEntityRecords,
	store as coreStore,
} from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews, DataForm } from '@wordpress/dataviews/wp';
import { Badge, Button, Icon, Stack, Text } from '@wordpress/ui';
import { Modal, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { plus } from '@wordpress/icons';
import { useDataView } from '../../runtime/dataView/useDataView';
import { buildFields } from '../_shared/dataviews/buildFields.mjs';
import { buildActions } from '../_shared/dataviews/buildActions';
import { useEntityDataView } from '../_shared/dataviews/useEntityDataView';
import { createBulkConfirmModal } from '../_shared/dataviews/createBulkConfirmModal';
import { buildTermTree, indentLabel } from './termTree.mjs';

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

// Upper bound on the all-terms fetch used to build the hierarchy tree + the
// parent-picker option list. The REST `per_page` cap is 100; trees larger than
// this degrade gracefully (deeper terms simply fall outside the indented set).
const TREE_FETCH_PER_PAGE = 100;

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
}

/**
 * Field id → render callback.
 *
 * @param {Object}      deps
 * @param {Function}    deps.onEditTerm   Open the edit modal for a raw term record.
 * @param {boolean}     deps.hierarchical Whether the taxonomy nests terms.
 * @param {Object}      deps.depthById    term id → depth (0-based) for indentation.
 * @param {number|null} deps.defaultId    Default-category term id, or null.
 * @return {Object} id → render callback.
 */
function buildFieldRenderers( {
	onEditTerm,
	hierarchical,
	depthById,
	defaultId,
} ) {
	return {
		name: ( { item } ) => {
			const depth = hierarchical ? depthById[ item.id ] || 0 : 0;
			const isDefault = defaultId !== null && item.id === defaultId;
			return (
				<Stack
					direction="row"
					align="center"
					gap="xs"
					// Indent nested terms; aria-level (1-based) announces the
					// tree depth to assistive tech. Flat taxonomies omit both.
					style={
						depth > 0
							? { paddingInlineStart: `${ depth * 1.5 }em` }
							: undefined
					}
					{ ...( hierarchical
						? { role: 'treeitem', 'aria-level': depth + 1 }
						: {} ) }
				>
					{ depth > 0 && <span aria-hidden="true">&#8212;</span> }
					<Button
						variant="minimal"
						onClick={ () => onEditTerm( item.rawRecord ) }
					>
						{ item.name }
					</Button>
					{ isDefault && (
						<Badge intent="neutral">
							{ __( 'Default', 'wp-admin-shell' ) }
						</Badge>
					) }
				</Stack>
			);
		},
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

	// The taxonomy record carries the `hierarchical` flag (category → true,
	// post_tag → false). Loading returns `record: null`; default to flat so the
	// table renders without waiting on this secondary fetch.
	const { record: taxonomyRecord } = useEntityRecord(
		'root',
		'taxonomy',
		taxonomy
	);
	const hierarchical = !! taxonomyRecord?.hierarchical;

	// Default-category protection is category-only: `default_category` lives in
	// site settings and identifies the one term WordPress refuses to delete.
	const { record: site } = useEntityRecord( 'root', 'site' );
	const defaultCategoryId =
		taxonomy === 'category' &&
		site &&
		Number.isInteger( site.default_category )
			? site.default_category
			: null;

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

	// For hierarchical taxonomies, fetch the full flat term set (independent of
	// the paged/sorted/searched list) so the tree depth + the parent picker see
	// every term, not just the current page. Skipped for flat taxonomies.
	const { records: allTerms } = useEntityRecords(
		'taxonomy',
		taxonomy,
		{
			per_page: TREE_FETCH_PER_PAGE,
			hide_empty: false,
			orderby: 'name',
			order: 'asc',
			_fields: 'id,name,parent',
			context: 'edit',
		},
		{ enabled: hierarchical }
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

	// id → depth map for indentation + aria-level, derived from the full term
	// set. Empty for flat taxonomies (renderer falls back to depth 0).
	const depthById = useMemo( () => {
		if ( ! hierarchical || ! allTerms ) {
			return {};
		}
		const map = {};
		buildTermTree( allTerms ).forEach( ( node ) => {
			map[ node.id ] = node.depth;
		} );
		return map;
	}, [ hierarchical, allTerms ] );

	// Indented parent-picker options ("None" + every term, depth-prefixed),
	// matching wp-admin's `wp_dropdown_categories` rendering.
	const parentElements = useMemo( () => {
		if ( ! hierarchical || ! allTerms ) {
			return null;
		}
		return [
			{ value: 0, label: __( 'None', 'wp-admin-shell' ) },
			...buildTermTree( allTerms ).map( ( node ) => ( {
				value: node.id,
				label: indentLabel(
					decodeEntities( node.name || '' ),
					node.depth
				),
			} ) ),
		];
	}, [ hierarchical, allTerms ] );

	const fields = useMemo(
		() =>
			buildFields( dataViewConfig.fields, {
				labels: FIELD_LABELS,
				renderers: buildFieldRenderers( {
					onEditTerm: setEditTerm,
					hierarchical,
					depthById,
					defaultId: defaultCategoryId,
				} ),
			} ),
		[ dataViewConfig, hierarchical, depthById, defaultCategoryId ]
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
				// Must match the exact 3-element key the live useEntityRecords
				// resolved under — core-data invalidates by deep-equal args,
				// not prefix, so a 2-element key never hits the active query.
				invalidateResolution( 'getEntityRecords', [
					'taxonomy',
					taxonomy,
					queryArgs,
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
			// The default category cannot be deleted (WordPress rejects it
			// server-side). Pre-disable Delete on that row so a bulk select +
			// delete doesn't fail mid-batch with an opaque 500.
			eligibilityOverrides:
				defaultCategoryId !== null
					? { delete: ( item ) => item.id !== defaultCategoryId }
					: {},
		} );
	}, [
		dataViewConfig,
		taxonomy,
		queryArgs,
		defaultCategoryId,
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
					defaultLayouts={
						dataViewConfig.defaultLayouts ?? { table: {} }
					}
					selection={ selection }
					onChangeSelection={ setSelection }
					getItemId={ ( item ) => item.id.toString() }
				/>
			) }

			{ ( editTerm || isCreating ) && (
				<TermEditModal
					term={ editTerm }
					taxonomy={ taxonomy }
					hierarchical={ hierarchical }
					parentElements={ parentElements }
					onClose={ () => {
						setEditTerm( null );
						setIsCreating( false );
					} }
					onSave={ saveEntityRecord }
					onSaved={ () => {
						invalidateResolution( 'getEntityRecords', [
							'taxonomy',
							taxonomy,
							queryArgs,
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

const BASE_TERM_FIELDS = [
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

function TermEditModal( {
	term,
	taxonomy,
	hierarchical,
	parentElements,
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
		parent: term?.parent || 0,
	} );
	const [ isSaving, setIsSaving ] = useState( false );

	// The parent field is hierarchical-only and integer-typed. Its `elements`
	// are the async indented term list; while they're still loading the field
	// stays out of the form (added once `parentElements` resolves). The edited
	// term excludes itself as a parent option to prevent a trivial self-parent
	// cycle.
	const fields = useMemo( () => {
		if ( ! hierarchical || ! parentElements ) {
			return BASE_TERM_FIELDS;
		}
		const elements = isNew
			? parentElements
			: parentElements.filter( ( el ) => el.value !== term.id );
		return [
			...BASE_TERM_FIELDS,
			{
				id: 'parent',
				type: 'integer',
				label: __( 'Parent', 'wp-admin-shell' ),
				elements,
			},
		];
	}, [ hierarchical, parentElements, isNew, term ] );

	const form = useMemo(
		() => ( {
			layout: { type: 'regular', labelPosition: 'top' },
			fields: fields.map( ( f ) => f.id ),
		} ),
		[ fields ]
	);

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const payload = {
				name: data.name,
				slug: data.slug,
				description: data.description,
			};
			if ( hierarchical ) {
				payload.parent = Number( data.parent ) || 0;
			}
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
					fields={ fields }
					form={ form }
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
