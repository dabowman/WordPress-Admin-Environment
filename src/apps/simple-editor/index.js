import './index.css';
import {
	useState,
	useEffect,
	useMemo,
	useCallback,
	useRef,
} from '@wordpress/element';
import { useEntityRecord } from '@wordpress/core-data';
import { Button, Icon } from '@wordpress/ui';
import { Spinner, Slot } from '@wordpress/components';
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
import { navigate } from '../../runtime/routing/router';
import { useDirtyState } from '../../runtime/dirty-state/useDirtyState';
import { autosaveTarget } from './autosave.mjs';

function SaveStatus( { status, hasEdits, isSaving, error } ) {
	let label;
	if ( status === 'error' ) {
		label = error || __( 'Save failed', 'wp-admin-shell' );
	} else if ( isSaving || status === 'saving' ) {
		label = __( 'Saving…', 'wp-admin-shell' );
	} else if ( status === 'autosaved' ) {
		// Published/scheduled posts route autosaves to a per-user revision;
		// the live record is intentionally untouched, so distinguish it from
		// a real "Saved" of the live record.
		label = __( 'Auto-saved', 'wp-admin-shell' );
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
 * @param {Object} root0
 * @param {*}      root0.config
 * @param {*}      root0.regionId
 */
export default function SimpleEditorApp( { config = {}, regionId } ) {
	// V2 routing: postType comes from the route's config block; the
	// `{id}` placeholder is interpolated by the route matcher into
	// `config.id` when the URL pattern captures an id (e.g.
	// `/posts/{id}/edit`). The `/posts/new` pattern omits `{id}` —
	// `config.id` is undefined and the app creates a draft.
	const postType = config.postType || 'post';
	const postIdRaw = config.id;
	const isNew =
		postIdRaw === undefined || postIdRaw === '' || postIdRaw === 'new';

	const [ postId, setPostId ] = useState(
		isNew ? null : Number( postIdRaw )
	);
	const [ isCreating, setIsCreating ] = useState( isNew );
	const [ error, setError ] = useState( null );

	const segment = postType === 'page' ? 'pages' : 'posts';
	const backHref = `#/${ segment }`;

	// MountedApp doesn't remount across same-route hash navs
	// (`/posts/A/edit` → `/posts/B/edit` share one route pattern), so the
	// `postId` initializer above only runs for the first post. Re-sync when
	// the route points at a different post. The `createDraft` path uses
	// `replaceState` (no navigation event), so `postIdRaw` stays at its
	// 'new'/undefined value there and this guard is a no-op — the draft id
	// set below survives.
	const prevRawRef = useRef( postIdRaw );
	useEffect( () => {
		if ( prevRawRef.current === postIdRaw ) {
			return;
		}
		prevRawRef.current = postIdRaw;
		setError( null );
		if ( isNew ) {
			setPostId( null );
			setIsCreating( true );
		} else {
			setPostId( Number( postIdRaw ) );
			setIsCreating( false );
		}
	}, [ postIdRaw, isNew ] );

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
						content:
							'<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->',
					},
				} );

				if ( ! cancelled ) {
					setPostId( result.id );
					setIsCreating( false );
					window.history.replaceState(
						null,
						'',
						`#/${ segment }/${ result.id }/edit`
					);
				}
			} catch ( err ) {
				// eslint-disable-next-line no-console
				console.error( 'SimpleEditorApp createDraft failed:', err );
				if ( ! cancelled ) {
					setError(
						err?.message ||
							__( 'Failed to create draft.', 'wp-admin-shell' )
					);
					setIsCreating( false );
				}
			}
		}

		createDraft();

		return () => {
			cancelled = true;
		};
	}, [ isNew, postType, segment ] );

	if ( error ) {
		return (
			<div className="wp-admin-shell-app-simple-editor">
				<div className="wp-admin-shell-app-simple-editor__toolbar">
					<Button
						onClick={ () => navigate( backHref ) }
						variant="minimal"
					>
						<Icon icon={ arrowLeft } size={ 16 } />
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

	return (
		// `key={ postId }` remounts the editor when the route points at a
		// different post, resetting the `hydrated` latch + `blocks` state so
		// the autosave can't write post A's content against post B's record.
		<SimpleEditor
			key={ postId }
			postType={ postType }
			postId={ postId }
			backHref={ backHref }
			regionId={ regionId }
		/>
	);
}

function SimpleEditor( { postType, postId, backHref, regionId } ) {
	useEffect( () => {
		ensureBlocksRegistered();
	}, [] );

	const {
		record,
		editedRecord,
		edit,
		save,
		hasEdits,
		isSaving,
		isResolving,
	} = useEntityRecord( 'postType', postType, postId );

	useDirtyState( regionId, hasEdits, { blocksNavigation: true } );

	const [ saveStatus, setSaveStatus ] = useState( 'idle' );
	const [ saveError, setSaveError ] = useState( null );
	const autoSaveTimerRef = useRef( null );

	const segment = postType === 'page' ? 'pages' : 'posts';

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

	// Published / private / scheduled posts: route the debounced autosave to
	// the per-user autosaves endpoint instead of PUTting the live record, so an
	// in-progress autosave can never clobber the public post (issue #101). The
	// edits stay accumulated in `editedRecord` (hasEdits remains true) until the
	// author explicitly flushes them live via the Update button.
	const runAutosave = useCallback( async () => {
		setSaveStatus( 'saving' );
		try {
			const readRaw = ( field ) =>
				typeof field === 'string' ? field : field?.raw ?? '';
			await apiFetch( {
				path: `/wp/v2/${ segment }/${ postId }/autosaves`,
				method: 'POST',
				data: {
					id: postId,
					title: readRaw( editedRecord?.title ),
					content: readRaw( editedRecord?.content ),
					excerpt: readRaw( editedRecord?.excerpt ),
				},
			} );
			setSaveStatus( 'autosaved' );
			setSaveError( null );
		} catch ( err ) {
			setSaveStatus( 'error' );
			setSaveError(
				err?.message || __( 'Save failed.', 'wp-admin-shell' )
			);
		}
	}, [ editedRecord, postId, segment ] );

	useEffect( () => {
		if ( ! hasEdits ) {
			return;
		}
		autoSaveTimerRef.current = setTimeout( () => {
			autoSaveTimerRef.current = null;
			if ( autosaveTarget( record?.status ) === 'parent' ) {
				runSave();
			} else {
				runAutosave();
			}
		}, 2000 );

		return () => {
			if ( autoSaveTimerRef.current ) {
				clearTimeout( autoSaveTimerRef.current );
				autoSaveTimerRef.current = null;
			}
		};
	}, [ hasEdits, editedRecord, runSave, runAutosave, record?.status ] );

	useEffect( () => {
		if ( saveStatus !== 'saved' && saveStatus !== 'autosaved' ) {
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
		const raw = editedRecord?.content?.raw ?? record?.content?.raw ?? '';
		setBlocks( parse( raw ) );
		setHydrated( true );
	}, [ record?.id, hydrated, record, editedRecord ] );

	const bodyRef = useRef( null );

	const onTitleChange = useCallback(
		( e ) => {
			edit( { title: e.target.value } );
		},
		[ edit ]
	);

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

	// Safe to read editedRecord/record fields below — guard above ensures
	// `record` is non-null and `hydrated` is true.
	const titleValue =
		typeof editedRecord.title === 'string'
			? editedRecord.title
			: editedRecord.title?.raw ?? record?.title?.raw ?? '';

	const isPublished = record?.status === 'publish';

	return (
		<div className="wp-admin-shell-app-simple-editor">
			<div className="wp-admin-shell-app-simple-editor__toolbar">
				<Button
					onClick={ () => navigate( backHref ) }
					variant="minimal"
					size="compact"
				>
					<Icon icon={ arrowLeft } size={ 16 } />
					{ __( 'Back to list', 'wp-admin-shell' ) }
				</Button>
				<SaveStatus
					status={ saveStatus }
					hasEdits={ hasEdits }
					isSaving={ isSaving }
					error={ saveError }
				/>
				<Button
					tone="brand"
					variant="solid"
					size="compact"
					onClick={ handlePublish }
					disabled={ isSaving }
					loading={ isSaving }
				>
					{ isPublished
						? __( 'Update', 'wp-admin-shell' )
						: __( 'Publish', 'wp-admin-shell' ) }
				</Button>
			</div>
			<div
				className="wp-admin-shell-app-simple-editor__body"
				ref={ bodyRef }
			>
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
			<Slot
				name="core:editor.sidebar"
				fillProps={ {
					postId: record?.id,
					postType,
					status: record?.status,
				} }
			/>
		</div>
	);
}
