import { useState, useMemo, useCallback, useRef } from '@wordpress/element';
import { useEntityRecords } from '@wordpress/core-data';
import { useDispatch, useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import apiFetch from '@wordpress/api-fetch';
import {
	Button,
	Spinner,
	SelectControl,
	Modal,
	TextControl,
	TextareaControl,
	__experimentalHStack as HStack,
	__experimentalVStack as VStack,
	__experimentalText as Text,
	__experimentalHeading as Heading,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { upload, trash, copy } from '@wordpress/icons';

const MEDIA_TYPE_OPTIONS = [
	{ value: '', label: __( 'All', 'wp-admin-shell' ) },
	{ value: 'image', label: __( 'Images', 'wp-admin-shell' ) },
	{ value: 'video', label: __( 'Video', 'wp-admin-shell' ) },
	{ value: 'audio', label: __( 'Audio', 'wp-admin-shell' ) },
	{ value: 'application', label: __( 'Documents', 'wp-admin-shell' ) },
];

export default function MediaApp() {
	const [ mediaType, setMediaType ] = useState( '' );
	const [ page, setPage ] = useState( 1 );
	const [ selectedItem, setSelectedItem ] = useState( null );
	const [ isUploading, setIsUploading ] = useState( false );
	const fileInputRef = useRef();

	const queryArgs = useMemo( () => {
		const args = {
			per_page: 40,
			page,
			context: 'edit',
		};
		if ( mediaType ) {
			args.media_type = mediaType;
		}
		return args;
	}, [ mediaType, page ] );

	const { records, isResolving, totalPages } = useEntityRecords(
		'root',
		'media',
		queryArgs
	);

	const {
		deleteEntityRecord,
		saveEntityRecord,
		invalidateResolution,
	} = useDispatch( coreStore );

	const handleUpload = useCallback(
		async ( event ) => {
			const files = event.target.files;
			if ( ! files?.length ) {
				return;
			}

			setIsUploading( true );
			try {
				for ( const file of files ) {
					const formData = new FormData();
					formData.append( 'file', file );
					await apiFetch( {
						path: '/wp/v2/media',
						method: 'POST',
						body: formData,
					} );
				}
				invalidateResolution( 'getEntityRecords', [
					'root',
					'media',
					queryArgs,
				] );
			} finally {
				setIsUploading( false );
				if ( fileInputRef.current ) {
					fileInputRef.current.value = '';
				}
			}
		},
		[ queryArgs, invalidateResolution ]
	);

	const handleDelete = useCallback(
		async ( item ) => {
			await deleteEntityRecord( 'root', 'media', item.id, {
				force: true,
			} );
			setSelectedItem( null );
		},
		[ deleteEntityRecord ]
	);

	const handleCopyUrl = useCallback( ( url ) => {
		navigator.clipboard.writeText( url );
	}, [] );

	return (
		<div className="wp-admin-shell-app-media">
			<HStack alignment="center" className="wp-admin-shell-app-media__toolbar">
				<Heading level={ 2 } size={ 20 }>
					{ __( 'Media', 'wp-admin-shell' ) }
				</Heading>

				<HStack spacing={ 3 } expanded={ false }>
					<SelectControl
						value={ mediaType }
						options={ MEDIA_TYPE_OPTIONS }
						onChange={ ( val ) => {
							setMediaType( val );
							setPage( 1 );
						} }
						__nextHasNoMarginBottom
						size="compact"
					/>
					<Button
						variant="primary"
						icon={ upload }
						onClick={ () => fileInputRef.current?.click() }
						isBusy={ isUploading }
						disabled={ isUploading }
						size="compact"
					>
						{ __( 'Upload', 'wp-admin-shell' ) }
					</Button>
					<input
						ref={ fileInputRef }
						type="file"
						multiple
						onChange={ handleUpload }
						style={ { display: 'none' } }
					/>
				</HStack>
			</HStack>

			{ isResolving && ! records?.length ? (
				<div className="wp-admin-shell-app-media__loading">
					<Spinner />
				</div>
			) : ! records?.length ? (
				<div className="wp-admin-shell-app-media__empty">
					<VStack alignment="center" spacing={ 3 }>
						<Text variant="muted">
							{ __( 'No media items found.', 'wp-admin-shell' ) }
						</Text>
						<Button
							variant="secondary"
							icon={ upload }
							onClick={ () => fileInputRef.current?.click() }
						>
							{ __( 'Upload your first file', 'wp-admin-shell' ) }
						</Button>
					</VStack>
				</div>
			) : (
				<>
					<div className="wp-admin-shell-app-media__grid">
						{ ( records || [] ).map( ( item ) => (
							<button
								key={ item.id }
								className={ `wp-admin-shell-app-media__item${
									selectedItem?.id === item.id
										? ' is-selected'
										: ''
								}` }
								onClick={ () => setSelectedItem( item ) }
								type="button"
							>
								{ item.media_type === 'image' ? (
									<img
										src={
											item.media_details?.sizes
												?.thumbnail?.source_url ||
											item.source_url
										}
										alt={ item.alt_text || '' }
									/>
								) : (
									<div className="wp-admin-shell-app-media__file-icon">
										<Text>
											{ item.mime_type
												?.split( '/' )
												.pop()
												?.toUpperCase() || 'FILE' }
										</Text>
									</div>
								) }
							</button>
						) ) }
					</div>

					{ totalPages > 1 && (
						<HStack
							className="wp-admin-shell-app-media__pagination"
							alignment="center"
						>
							<Button
								variant="secondary"
								disabled={ page <= 1 }
								onClick={ () => setPage( page - 1 ) }
								size="compact"
							>
								{ __( 'Previous', 'wp-admin-shell' ) }
							</Button>
							<Text>
								{ page } / { totalPages }
							</Text>
							<Button
								variant="secondary"
								disabled={ page >= totalPages }
								onClick={ () => setPage( page + 1 ) }
								size="compact"
							>
								{ __( 'Next', 'wp-admin-shell' ) }
							</Button>
						</HStack>
					) }
				</>
			) }

			{ selectedItem && (
				<MediaDetailModal
					item={ selectedItem }
					onClose={ () => setSelectedItem( null ) }
					onDelete={ handleDelete }
					onCopyUrl={ handleCopyUrl }
					onSave={ saveEntityRecord }
				/>
			) }
		</div>
	);
}

function MediaDetailModal( { item, onClose, onDelete, onCopyUrl, onSave } ) {
	const [ title, setTitle ] = useState( item.title?.raw || '' );
	const [ altText, setAltText ] = useState( item.alt_text || '' );
	const [ caption, setCaption ] = useState( item.caption?.raw || '' );
	const [ description, setDescription ] = useState(
		item.description?.raw || ''
	);
	const [ isSaving, setIsSaving ] = useState( false );

	const handleSave = async () => {
		setIsSaving( true );
		try {
			await onSave( 'root', 'media', {
				id: item.id,
				title,
				alt_text: altText,
				caption,
				description,
			} );
			onClose();
		} finally {
			setIsSaving( false );
		}
	};

	return (
		<Modal
			title={ __( 'Media Details', 'wp-admin-shell' ) }
			onRequestClose={ onClose }
			size="large"
		>
			<HStack alignment="top" spacing={ 6 }>
				<div className="wp-admin-shell-app-media__preview">
					{ item.media_type === 'image' ? (
						<img
							src={
								item.media_details?.sizes?.medium
									?.source_url || item.source_url
							}
							alt={ item.alt_text || '' }
						/>
					) : (
						<Text>{ item.mime_type }</Text>
					) }
				</div>

				<VStack spacing={ 3 } style={ { flex: 1 } }>
					<TextControl
						label={ __( 'Title', 'wp-admin-shell' ) }
						value={ title }
						onChange={ setTitle }
						__nextHasNoMarginBottom
					/>
					{ item.media_type === 'image' && (
						<TextControl
							label={ __( 'Alt Text', 'wp-admin-shell' ) }
							value={ altText }
							onChange={ setAltText }
							__nextHasNoMarginBottom
						/>
					) }
					<TextareaControl
						label={ __( 'Caption', 'wp-admin-shell' ) }
						value={ caption }
						onChange={ setCaption }
						__nextHasNoMarginBottom
					/>
					<TextareaControl
						label={ __( 'Description', 'wp-admin-shell' ) }
						value={ description }
						onChange={ setDescription }
						__nextHasNoMarginBottom
					/>
					<Text variant="muted" size={ 12 }>
						{ item.source_url }
					</Text>
				</VStack>
			</HStack>

			<HStack justify="space-between" style={ { marginTop: '16px' } }>
				<HStack spacing={ 2 } expanded={ false }>
					<Button
						icon={ copy }
						variant="tertiary"
						onClick={ () => onCopyUrl( item.source_url ) }
						size="compact"
					>
						{ __( 'Copy URL', 'wp-admin-shell' ) }
					</Button>
					<Button
						icon={ trash }
						variant="tertiary"
						isDestructive
						onClick={ () => onDelete( item ) }
						size="compact"
					>
						{ __( 'Delete', 'wp-admin-shell' ) }
					</Button>
				</HStack>
				<HStack spacing={ 2 } expanded={ false }>
					<Button variant="tertiary" onClick={ onClose }>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						variant="primary"
						onClick={ handleSave }
						isBusy={ isSaving }
						disabled={ isSaving }
					>
						{ __( 'Save', 'wp-admin-shell' ) }
					</Button>
				</HStack>
			</HStack>
		</Modal>
	);
}
