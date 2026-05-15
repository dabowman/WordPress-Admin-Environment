import { useEffect, useMemo, useState } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import { DataViews } from '@wordpress/dataviews/wp';
import { Button, Icon, InputControl, Stack, Text } from '@wordpress/ui';
import {
	Button as DestructiveButton,
	Modal,
	TextareaControl,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { decodeEntities } from '@wordpress/html-entities';
import { plus } from '@wordpress/icons';
import { resolveIcon } from '../../runtime/config/iconMap';
import { useViewConfig } from '../../runtime/viewConfig/useViewConfig';

const DEFAULT_TAXONOMY_LABEL = {
	category: __( 'Categories', 'wp-admin-shell' ),
	post_tag: __( 'Tags', 'wp-admin-shell' ),
};

// View-config primitives ship as locale-agnostic JSON (spec §13 #7). Recover
// translation for the ids the app authors by mapping known field/action ids
// to `__()`-wrapped strings at module load. Unknown ids (plugin extension
// columns / actions) fall through to `spec.label`.
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
 * Field id → render callback. View-config declares the shape; the React
 * layer owns the row renderer. Unknown ids fall through to DataViews'
 * default renderer for the declared field type.
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

function compileEligibility( eligibleWhen ) {
	if ( ! eligibleWhen || typeof eligibleWhen !== 'object' ) {
		return undefined;
	}
	const entries = Object.entries( eligibleWhen );
	if ( entries.length === 0 ) {
		return undefined;
	}
	return ( item ) =>
		entries.every( ( [ field, expected ] ) => {
			const actual = item?.[ field ];
			if ( Array.isArray( expected ) ) {
				return expected.includes( actual );
			}
			return actual === expected;
		} );
}

function buildFields( fieldSpecs, fieldRenderers ) {
	return fieldSpecs
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				type: spec.type,
				label: FIELD_LABELS[ spec.id ] ?? spec.label,
			};
			if ( spec.enableGlobalSearch !== undefined ) {
				compiled.enableGlobalSearch = !! spec.enableGlobalSearch;
			}
			if ( spec.enableHiding !== undefined ) {
				compiled.enableHiding = !! spec.enableHiding;
			}
			if ( spec.enableSorting !== undefined ) {
				compiled.enableSorting = !! spec.enableSorting;
			}
			if ( Array.isArray( spec.elements ) ) {
				compiled.elements = spec.elements;
			}
			if ( spec.filterBy ) {
				compiled.filterBy = spec.filterBy;
			}
			if ( fieldRenderers[ spec.id ] ) {
				compiled.render = fieldRenderers[ spec.id ];
			}
			return compiled;
		} );
}

function buildActions(
	actions,
	{
		taxonomy,
		onEditTerm,
		deleteEntityRecord,
		invalidateResolution,
		createSuccessNotice,
		createErrorNotice,
	}
) {
	const callbacks = {
		edit: ( items ) => onEditTerm( items[ 0 ].rawRecord ),
	};

	return actions
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				label: ACTION_LABELS[ spec.id ] ?? spec.label,
				isPrimary: !! spec.isPrimary,
				isDestructive: !! spec.isDestructive,
				supportsBulk: !! spec.supportsBulk,
				icon: spec.icon ? resolveIcon( spec.icon ) : undefined,
				isEligible: compileEligibility( spec.eligibleWhen ),
			};

			if ( spec.id === 'delete' ) {
				compiled.RenderModal = ( {
					items,
					closeModal,
					onActionPerformed,
				} ) => (
					<Stack
						direction="column"
						gap="md"
						style={ {
							padding: 'var(--wpds-dimension-padding-lg)',
						} }
					>
						<Text>
							{ items.length === 1
								? __( 'Delete this term?', 'wp-admin-shell' )
								: __(
										'Delete these terms? Posts assigned to them will lose this term.',
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
									try {
										// Terms have no trash — `force: true`
										// is required or the request 400s.
										await Promise.all(
											items.map( ( item ) =>
												deleteEntityRecord(
													'taxonomy',
													taxonomy,
													item.id,
													{ force: true }
												)
											)
										);
										invalidateResolution(
											'getEntityRecords',
											[ 'taxonomy', taxonomy ]
										);
										createSuccessNotice(
											__(
												'Term deleted.',
												'wp-admin-shell'
											),
											{ type: 'snackbar' }
										);
										onActionPerformed?.( items );
									} catch ( err ) {
										createErrorNotice(
											err?.message ||
												__(
													'Failed to delete term.',
													'wp-admin-shell'
												),
											{ isDismissible: true }
										);
									}
									closeModal();
								} }
							>
								{ __( 'Delete', 'wp-admin-shell' ) }
							</DestructiveButton>
						</Stack>
					</Stack>
				);
			} else if ( callbacks[ spec.id ] ) {
				compiled.callback = callbacks[ spec.id ];
			}

			return compiled;
		} );
}

export default function TaxonomyApp( { config = {} } ) {
	const taxonomy = config.taxonomy || 'category';
	const variant = config.variant || null;
	const heading =
		config.title || DEFAULT_TAXONOMY_LABEL[ taxonomy ] || taxonomy;

	const { config: viewConfig } = useViewConfig(
		'taxonomy',
		taxonomy,
		variant
	);

	const [ view, setView ] = useState( () => ( {
		...VIEW_DEFAULTS,
		...viewConfig.defaultView,
	} ) );

	// Resync `view` when the underlying triple flips on the same hook
	// instance (e.g. config.taxonomy `category` → `post_tag`). The useState
	// initializer runs once, so without this effect the second triple
	// inherits the first triple's perPage / sort / filters. Keyed only on
	// the triple — not viewConfig — to avoid clobbering in-session view
	// edits whenever the cascade re-resolves the doc shape.
	useEffect( () => {
		setView( {
			...VIEW_DEFAULTS,
			...( viewConfig.defaultView || {} ),
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ taxonomy, variant ] );

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
			buildFields(
				viewConfig.fields ?? [],
				buildFieldRenderers( { onEditTerm: setEditTerm } )
			),
		[ viewConfig ]
	);

	const actions = useMemo(
		() =>
			buildActions( viewConfig.actions ?? [], {
				taxonomy,
				onEditTerm: setEditTerm,
				deleteEntityRecord,
				invalidateResolution,
				createSuccessNotice,
				createErrorNotice,
			} ),
		[
			viewConfig,
			taxonomy,
			deleteEntityRecord,
			invalidateResolution,
			createSuccessNotice,
			createErrorNotice,
		]
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
				defaultLayouts={ viewConfig.defaultLayouts ?? { table: {} } }
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

function TermEditModal( {
	term,
	taxonomy,
	onClose,
	onSave,
	onSaved,
	onError,
} ) {
	const isNew = ! term;
	const [ name, setName ] = useState( term?.name || '' );
	const [ slug, setSlug ] = useState( term?.slug || '' );
	const [ description, setDescription ] = useState( term?.description || '' );
	const [ isSaving, setIsSaving ] = useState( false );

	const handleSave = async () => {
		setIsSaving( true );
		try {
			const payload = {
				name,
				slug,
				description,
			};
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
				<InputControl
					label={ __( 'Name', 'wp-admin-shell' ) }
					value={ name }
					onChange={ ( e ) => setName( e.target.value ) }
				/>
				<InputControl
					label={ __( 'Slug', 'wp-admin-shell' ) }
					value={ slug }
					onChange={ ( e ) => setSlug( e.target.value ) }
					description={ __(
						'URL-friendly version of the name. Auto-generated if blank.',
						'wp-admin-shell'
					) }
				/>
				<TextareaControl
					label={ __( 'Description', 'wp-admin-shell' ) }
					value={ description }
					onChange={ setDescription }
					rows={ 4 }
					__nextHasNoMarginBottom
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
						disabled={ ! name || isSaving }
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
