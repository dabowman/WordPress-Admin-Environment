import './index.css';
import { useState, useMemo, useCallback, useRef } from '@wordpress/element';
import { useEntityRecords, store as coreStore } from '@wordpress/core-data';
import { useDispatch } from '@wordpress/data';
import { store as noticesStore } from '@wordpress/notices';
import apiFetch from '@wordpress/api-fetch';
import { Button, Icon, InputControl, Stack, Text } from '@wordpress/ui';
import {
	Button as DestructiveButton,
	Spinner,
	SelectControl,
	Modal,
	TextareaControl,
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

	const { deleteEntityRecord, saveEntityRecord, invalidateResolution } =
		useDispatch( coreStore );
	const { createSuccessNotice, createErrorNotice } =
		useDispatch( noticesStore );

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
			invalidateResolution( 'getEntityRecords', [
				'root',
				'media',
				queryArgs,
			] );
			setSelectedItem( null );
		},
		[ deleteEntityRecord, invalidateResolution, queryArgs ]
	);

	const handleCopyUrl = useCallback(
		async ( url ) => {
			try {
				await navigator.clipboard.writeText( url );
				createSuccessNotice(
					__( 'URL copied to clipboard.', 'wp-admin-shell' ),
					{ type: 'snackbar' }
				);
			} catch ( err ) {
				createErrorNotice(
					err?.message ||
						__( 'Failed to copy URL.', 'wp-admin-shell' ),
					{ isDismissible: true }
				);
			}
		},
		[ createSuccessNotice, createErrorNotice ]
	);

	return (
		<div className="wp-admin-shell-app-media">
			<Stack
				direction="row"
				align="center"
				justify="space-between"
				className="wp-admin-shell-app-media__toolbar"
			>
				<Text variant="heading-lg" render={ <h2 /> }>
					{ __( 'Media', 'wp-admin-shell' ) }
				</Text>

				<Stack direction="row" gap="md" align="center">
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
						tone="brand"
						variant="solid"
						onClick={ () => fileInputRef.current?.click() }
						loading={ isUploading }
						disabled={ isUploading }
						size="compact"
					>
						<Icon icon={ upload } size={ 16 } />
						{ __( 'Upload', 'wp-admin-shell' ) }
					</Button>
					<input
						ref={ fileInputRef }
						type="file"
						multiple
						onChange={ handleUpload }
						style={ { display: 'none' } }
					/>
				</Stack>
			</Stack>

			{ ( () => {
				if ( isResolving && ! records?.length ) {
					return (
						<div className="wp-admin-shell-app-media__loading">
							<Spinner />
						</div>
					);
				}
				if ( ! records?.length ) {
					return (
						<div className="wp-admin-shell-app-media__empty">
							<Stack direction="column" align="center" gap="md">
								<Text
									variant="body-sm"
									className="wp-admin-shell-app-media__muted"
								>
									{ __(
										'No media items found.',
										'wp-admin-shell'
									) }
								</Text>
								<Button
									tone="neutral"
									variant="outline"
									onClick={ () =>
										fileInputRef.current?.click()
									}
								>
									<Icon icon={ upload } size={ 16 } />
									{ __(
										'Upload your first file',
										'wp-admin-shell'
									) }
								</Button>
							</Stack>
						</div>
					);
				}
				return (
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
							<Stack
								className="wp-admin-shell-app-media__pagination"
								direction="row"
								align="center"
								justify="center"
								gap="md"
							>
								<Button
									tone="neutral"
									variant="outline"
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
									tone="neutral"
									variant="outline"
									disabled={ page >= totalPages }
									onClick={ () => setPage( page + 1 ) }
									size="compact"
								>
									{ __( 'Next', 'wp-admin-shell' ) }
								</Button>
							</Stack>
						) }
					</>
				);
			} )() }

			{ selectedItem && (
				<MediaDetailModal
					key={ selectedItem.id }
					item={ selectedItem }
					onClose={ () => setSelectedItem( null ) }
					onDelete={ handleDelete }
					onCopyUrl={ handleCopyUrl }
					onSave={ saveEntityRecord }
					invalidateResolution={ invalidateResolution }
					queryArgs={ queryArgs }
				/>
			) }
		</div>
	);
}

function MediaDetailModal( {
	item,
	onClose,
	onDelete,
	onCopyUrl,
	onSave,
	invalidateResolution,
	queryArgs,
} ) {
	const eventValue = ( e ) => e.target.value;
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
			invalidateResolution( 'getEntityRecords', [
				'root',
				'media',
				queryArgs,
			] );
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
			<Stack direction="row" align="flex-start" gap="xl">
				<div className="wp-admin-shell-app-media__preview">
					{ item.media_type === 'image' ? (
						<img
							src={
								item.media_details?.sizes?.medium?.source_url ||
								item.source_url
							}
							alt={ item.alt_text || '' }
						/>
					) : (
						<Text>{ item.mime_type }</Text>
					) }
				</div>

				<Stack direction="column" gap="md" style={ { flex: 1 } }>
					<InputControl
						label={ __( 'Title', 'wp-admin-shell' ) }
						value={ title }
						onChange={ ( e ) => setTitle( eventValue( e ) ) }
					/>
					{ item.media_type === 'image' && (
						<InputControl
							label={ __( 'Alt Text', 'wp-admin-shell' ) }
							value={ altText }
							onChange={ ( e ) => setAltText( eventValue( e ) ) }
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
					<Text
						variant="body-sm"
						className="wp-admin-shell-app-media__muted"
					>
						{ item.source_url }
					</Text>
				</Stack>
			</Stack>

			<Stack
				direction="row"
				justify="space-between"
				style={ { marginTop: 'var(--wpds-dimension-padding-lg)' } }
			>
				<Stack direction="row" gap="sm">
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ () => onCopyUrl( item.source_url ) }
						size="compact"
					>
						<Icon icon={ copy } size={ 16 } />
						{ __( 'Copy URL', 'wp-admin-shell' ) }
					</Button>
					<DestructiveButton
						icon={ trash }
						variant="tertiary"
						isDestructive
						onClick={ () => onDelete( item ) }
						size="compact"
					>
						{ __( 'Delete', 'wp-admin-shell' ) }
					</DestructiveButton>
				</Stack>
				<Stack direction="row" gap="sm">
					<Button
						tone="neutral"
						variant="minimal"
						onClick={ onClose }
					>
						{ __( 'Cancel', 'wp-admin-shell' ) }
					</Button>
					<Button
						tone="brand"
						variant="solid"
						onClick={ handleSave }
						loading={ isSaving }
						disabled={ isSaving }
					>
						{ __( 'Save', 'wp-admin-shell' ) }
					</Button>
				</Stack>
			</Stack>
		</Modal>
	);
}
