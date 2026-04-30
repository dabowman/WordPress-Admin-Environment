import { useState, useEffect, useMemo, useCallback, useRef } from '@wordpress/element';
import { useEntityRecord } from '@wordpress/core-data';
import { Button, Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { arrowLeft } from '@wordpress/icons';
import apiFetch from '@wordpress/api-fetch';
import { registerCoreBlocks } from '@wordpress/block-library';
import { getBlockTypes, parse, serialize } from '@wordpress/blocks';
import {
	BlockEditorProvider,
	BlockList,
	BlockTools,
	WritingFlow,
	ObserveTyping,
	BlockEditorKeyboardShortcuts,
} from '@wordpress/block-editor';
import { navigate } from '../runtime/routing/router';

function SaveStatus( { status, hasEdits, isSaving, error } ) {
	let label;
	if ( status === 'error' ) {
		label = error || __( 'Save failed', 'wp-admin-shell' );
	} else if ( isSaving || status === 'saving' ) {
		label = __( 'Saving…', 'wp-admin-shell' );
	} else if ( status === 'saved' ) {
		label = __( 'Saved', 'wp-admin-shell' );
	} else if ( hasEdits ) {
		label = __( 'Unsaved changes', 'wp-admin-shell' );
	} else {
		label = '';
	}

	if ( ! label ) {
		return null;
	}

	return (
		<span
			className={ `wp-admin-shell-app-simple-editor__status wp-admin-shell-app-simple-editor__status--${ status }` }
		>
			{ label }
		</span>
	);
}

const ALLOWED_BLOCKS = [
	'core/paragraph',
	'core/heading',
	'core/image',
	'core/quote',
	'core/list',
	'core/list-item',
	'core/code',
	'core/separator',
	'core/embed',
];

let blocksRegistered = false;
function ensureBlocksRegistered() {
	if ( blocksRegistered ) {
		return;
	}
	if ( getBlockTypes().length === 0 ) {
		registerCoreBlocks();
	}
	blocksRegistered = true;
}

/**
 * Substack-style simplified block editor.
 *
 * Routes:
 *   #/{appId}/{postType}/{postId}  — edit existing post
 *   #/{appId}/{postType}/new       — create draft, then edit
 *
 * MVP scope: title + content only. Featured image, taxonomy, excerpt, etc.
 * are deferred to a future post settings panel.
 */
export default function SimpleEditorApp( { app, params } ) {
	const appId = app?.id || 'simple-editor';
	const postType = params[ 0 ] || 'post';
	const postIdParam = params[ 1 ];
	const isNew = postIdParam === 'new';

	const [ postId, setPostId ] = useState( isNew ? null : Number( postIdParam ) );
	const [ isCreating, setIsCreating ] = useState( isNew );
	const [ error, setError ] = useState( null );

	useEffect( () => {
		if ( ! isNew ) {
			return;
		}

		let cancelled = false;

		async function createDraft() {
			try {
				const result = await apiFetch( {
					path: `/wp/v2/${ postType === 'page' ? 'pages' : 'posts' }`,
					method: 'POST',
					data: {
						status: 'draft',
						content: '<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->',
					},
				} );

				if ( ! cancelled ) {
					setPostId( result.id );
					setIsCreating( false );
					window.history.replaceState(
						null,
						'',
						`#/${ appId }/${ postType }/${ result.id }`
					);
				}
			} catch ( err ) {
				// eslint-disable-next-line no-console
				console.error(
					'SimpleEditorApp createDraft failed:',
					JSON.stringify( err, null, 2 ),
					err
				);
				if ( ! cancelled ) {
					setError(
						( err?.message ||
							__( 'Failed to create draft.', 'wp-admin-shell' ) ) +
							' — ' +
							JSON.stringify( err )
					);
					setIsCreating( false );
				}
			}
		}

		createDraft();

		return () => {
			cancelled = true;
		};
	}, [ isNew, postType, appId ] );

	const backRoute = postType === 'page' ? 'pages' : 'posts';

	if ( error ) {
		return (
			<div className="wp-admin-shell-app-simple-editor">
				<div className="wp-admin-shell-app-simple-editor__toolbar">
					<Button
						icon={ arrowLeft }
						onClick={ () => navigate( backRoute ) }
						variant="tertiary"
					>
						{ __( 'Back to list', 'wp-admin-shell' ) }
					</Button>
				</div>
				<div className="wp-admin-shell-content__empty">{ error }</div>
			</div>
		);
	}

	if ( isCreating || ! postId ) {
		return (
			<div className="wp-admin-shell-app-simple-editor">
				<div className="wp-admin-shell-app-simple-editor__loading">
					<Spinner />
				</div>
			</div>
		);
	}

	return <SimpleEditor postType={ postType } postId={ postId } backRoute={ backRoute } />;
}

function SimpleEditor( { postType, postId, backRoute } ) {
	useEffect( () => {
		ensureBlocksRegistered();
	}, [] );

	const { record, editedRecord, edit, save, hasEdits, isSaving, isResolving } =
		useEntityRecord( 'postType', postType, postId );

	const [ saveStatus, setSaveStatus ] = useState( 'idle' );
	const [ saveError, setSaveError ] = useState( null );
	const autoSaveTimerRef = useRef( null );

	const runSave = useCallback( async () => {
		setSaveStatus( 'saving' );
		try {
			await save();
			setSaveStatus( 'saved' );
			setSaveError( null );
		} catch ( err ) {
			setSaveStatus( 'error' );
			setSaveError(
				err?.message || __( 'Save failed.', 'wp-admin-shell' )
			);
		}
	}, [ save ] );

	useEffect( () => {
		if ( ! hasEdits ) {
			return;
		}
		autoSaveTimerRef.current = setTimeout( () => {
			autoSaveTimerRef.current = null;
			runSave();
		}, 2000 );

		return () => {
			if ( autoSaveTimerRef.current ) {
				clearTimeout( autoSaveTimerRef.current );
				autoSaveTimerRef.current = null;
			}
		};
	}, [ hasEdits, editedRecord, runSave ] );

	useEffect( () => {
		if ( saveStatus !== 'saved' ) {
			return;
		}
		const handle = setTimeout( () => setSaveStatus( 'idle' ), 2000 );
		return () => clearTimeout( handle );
	}, [ saveStatus ] );

	const [ blocks, setBlocks ] = useState( [] );
	const [ hydrated, setHydrated ] = useState( false );

	useEffect( () => {
		if ( hydrated || ! record?.id ) {
			return;
		}
		const raw =
			editedRecord?.content?.raw ?? record?.content?.raw ?? '';
		setBlocks( parse( raw ) );
		setHydrated( true );
	}, [ record?.id, hydrated, record, editedRecord ] );

	const bodyRef = useRef( null );

	const titleValue =
		typeof editedRecord.title === 'string'
			? editedRecord.title
			: editedRecord.title?.raw ?? record?.title?.raw ?? '';

	const onTitleChange = useCallback(
		( e ) => {
			edit( { title: e.target.value } );
		},
		[ edit ]
	);

	const isPublished = record?.status === 'publish';

	const handlePublish = useCallback( async () => {
		if ( autoSaveTimerRef.current ) {
			clearTimeout( autoSaveTimerRef.current );
			autoSaveTimerRef.current = null;
		}
		edit( { status: 'publish' } );
		await runSave();
	}, [ edit, runSave ] );

	const onTitleKeyDown = useCallback( ( e ) => {
		if ( e.key === 'Enter' || ( e.key === 'Tab' && ! e.shiftKey ) ) {
			e.preventDefault();
			const firstBlock = bodyRef.current?.querySelector(
				'[contenteditable="true"]'
			);
			if ( firstBlock ) {
				firstBlock.focus();
			}
		}
	}, [] );

	const onInput = useCallback( ( newBlocks ) => {
		setBlocks( newBlocks );
	}, [] );

	const onChange = useCallback(
		( newBlocks ) => {
			setBlocks( newBlocks );
			edit( { content: serialize( newBlocks ) } );
		},
		[ edit ]
	);

	const settings = useMemo(
		() => ( {
			allowedBlockTypes: ALLOWED_BLOCKS,
			bodyPlaceholder: __( 'Tell your story…', 'wp-admin-shell' ),
			__experimentalBlockPatterns: [],
			__experimentalBlockPatternCategories: [],
			__experimentalReusableBlocks: [],
			__experimentalFeatures: {
				appearanceTools: true,
				layout: { contentSize: '680px' },
			},
		} ),
		[]
	);

	if ( isResolving || ! record || ! hydrated ) {
		return (
			<div className="wp-admin-shell-app-simple-editor">
				<div className="wp-admin-shell-app-simple-editor__loading">
					<Spinner />
				</div>
			</div>
		);
	}

	return (
		<div className="wp-admin-shell-app-simple-editor">
			<div className="wp-admin-shell-app-simple-editor__toolbar">
				<Button
					icon={ arrowLeft }
					onClick={ () => navigate( backRoute ) }
					variant="tertiary"
					size="compact"
				>
					{ __( 'Back to list', 'wp-admin-shell' ) }
				</Button>
				<SaveStatus
					status={ saveStatus }
					hasEdits={ hasEdits }
					isSaving={ isSaving }
					error={ saveError }
				/>
				<Button
					variant="primary"
					size="compact"
					onClick={ handlePublish }
					disabled={ isSaving }
					isBusy={ isSaving }
				>
					{ isPublished
						? __( 'Update', 'wp-admin-shell' )
						: __( 'Publish', 'wp-admin-shell' ) }
				</Button>
			</div>
			<div className="wp-admin-shell-app-simple-editor__body" ref={ bodyRef }>
				<div className="wp-admin-shell-app-simple-editor__column">
					<input
						type="text"
						className="wp-admin-shell-app-simple-editor__title"
						value={ titleValue }
						onChange={ onTitleChange }
						onKeyDown={ onTitleKeyDown }
						placeholder={ __( 'Title', 'wp-admin-shell' ) }
						aria-label={ __( 'Post title', 'wp-admin-shell' ) }
					/>
					<BlockEditorProvider
						value={ blocks }
						onInput={ onInput }
						onChange={ onChange }
						settings={ settings }
					>
						<BlockEditorKeyboardShortcuts.Register />
						<BlockTools>
							<WritingFlow>
								<ObserveTyping>
									<BlockList />
								</ObserveTyping>
							</WritingFlow>
						</BlockTools>
					</BlockEditorProvider>
				</div>
			</div>
		</div>
	);
}
