import { useMemo, useState } from '@wordpress/element';
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
import { plus, trash, pencil } from '@wordpress/icons';

const DEFAULT_TAXONOMY_LABEL = {
	category: __( 'Categories', 'wp-admin-shell' ),
	post_tag: __( 'Tags', 'wp-admin-shell' ),
};

export default function TaxonomyApp( { config = {} } ) {
	const taxonomy = config.taxonomy || 'category';
	const heading =
		config.title || DEFAULT_TAXONOMY_LABEL[ taxonomy ] || taxonomy;

	const [ view, setView ] = useState( {
		type: 'table',
		search: '',
		filters: [],
		page: 1,
		perPage: 20,
		sort: { field: 'name', direction: 'asc' },
		fields: [ 'name', 'slug', 'count', 'description' ],
		titleField: 'name',
		layout: {},
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
			name: t.name,
			slug: t.slug,
			count: t.count,
			description: t.description || '',
			parent: t.parent || 0,
			rawRecord: t,
		} ) );
	}, [ records ] );

	const fields = useMemo(
		() => [
			{
				id: 'name',
				type: 'text',
				label: __( 'Name', 'wp-admin-shell' ),
				enableGlobalSearch: true,
				enableHiding: false,
				render: ( { item } ) => (
					<Button
						variant="minimal"
						onClick={ () => setEditTerm( item.rawRecord ) }
					>
						{ item.name }
					</Button>
				),
			},
			{
				id: 'slug',
				type: 'text',
				label: __( 'Slug', 'wp-admin-shell' ),
				render: ( { item } ) => <Text>{ item.slug }</Text>,
			},
			{
				id: 'count',
				type: 'integer',
				label: __( 'Count', 'wp-admin-shell' ),
				render: ( { item } ) => <Text>{ item.count }</Text>,
			},
			{
				id: 'description',
				type: 'text',
				label: __( 'Description', 'wp-admin-shell' ),
				render: ( { item } ) => (
					<Text>{ stripTags( item.description ) }</Text>
				),
			},
		],
		[]
	);

	const actions = useMemo(
		() => [
			{
				id: 'edit',
				label: __( 'Edit', 'wp-admin-shell' ),
				icon: pencil,
				isPrimary: true,
				callback: ( items ) => setEditTerm( items[ 0 ].rawRecord ),
			},
			{
				id: 'delete',
				label: __( 'Delete', 'wp-admin-shell' ),
				icon: trash,
				isDestructive: true,
				supportsBulk: true,
				RenderModal: ( { items, closeModal, onActionPerformed } ) => (
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
				),
			},
		],
		[
			deleteEntityRecord,
			invalidateResolution,
			createSuccessNotice,
			createErrorNotice,
			taxonomy,
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
				defaultLayouts={ { table: {} } }
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

function stripTags( html ) {
	return ( html || '' ).replace( /<[^>]*>/g, '' ).trim();
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
