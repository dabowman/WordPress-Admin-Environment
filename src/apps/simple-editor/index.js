import './index.css';
import {
	useState,
	useEffect,
	useMemo,
	useCallback,
	useRef,
} from '@wordpress/element';
import { useEntityRecord, store as coreStore } from '@wordpress/core-data';
import { useSelect } from '@wordpress/data';
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
import { userCan } from '../../runtime/capabilities/userCan';
import {
	useEntityAutosave,
	useRestBase,
} from '../_shared/forms/useEntityAutosave';
import DocumentSettingsSidebar from './DocumentSettingsSidebar';

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
 * Scope: title + a constrained block tree + a native document-settings sidebar
 * (status/visibility, schedule, slug, categories, tags, excerpt, featured image,
 * author, discussion). Deliberately no Block tab / page attributes / meta.
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

	// `undefined` while a CPT's entity is still resolving; built-in types
	// resolve synchronously so they never produce `undefined` here.
	const postTypeRestBase = useRestBase( postType );
	const restBase = postTypeRestBase ?? 'posts';

	const backHref = `#/${ restBase }`;

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
		// Wait until the post-type entity resolves so we know the correct REST
		// base. For built-in types (post/page) this is always immediately
		// available via the fallback ternary, so there is no extra tick for the
		// common case. For CPTs, firing before resolution would use the `posts`
		// fallback and create a stray `post` draft before the correct route
		// is known.
		if ( postTypeRestBase === undefined ) {
			return;
		}

		let cancelled = false;

		async function createDraft() {
			try {
				const result = await apiFetch( {
					path: `/wp/v2/${ restBase }`,
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
						`#/${ restBase }/${ result.id }/edit`
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
	}, [ isNew, postTypeRestBase, restBase ] );

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

	// Shared autosave-on-change: debounces a 2s save, routing draft/auto-draft
	// to the live record and pending/published/private/scheduled to a per-user
	// autosave revision (issue #101). Extracted to `_shared/forms` so the
	// document-settings sidebar commits through the same path (issue #119).
	const {
		saveStatus,
		saveError,
		isBusy: isSaveBusy,
		flush,
	} = useEntityAutosave( {
		postType,
		postId,
		editedRecord,
		status: record?.status,
		save,
		hasEdits,
	} );

	// Resolved post-type entity: drives the sidebar's per-type panel gating
	// (taxonomies / supports) and the author-reassign capability check.
	const postTypeObject = useSelect(
		( select ) => select( coreStore ).getPostType( postType ),
		[ postType ]
	);
	const canAssignAuthor = userCan(
		postTypeObject?.capabilities?.edit_others_posts || 'edit_others_posts'
	);

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
		// A scheduled (future-dated) post should publish as `future`, not go
		// live immediately; core flips `draft`/`pending` + future date →
		// `future` server-side, but set it explicitly so the toolbar reflects
		// intent. A private post stays private. Otherwise publish goes live now.
		const futureDate =
			editedRecord?.date && new Date( editedRecord.date ) > new Date();
		let nextStatus = 'publish';
		if ( record?.status === 'private' ) {
			nextStatus = 'private';
		} else if ( futureDate ) {
			nextStatus = 'future';
		}
		edit( { status: nextStatus } );
		// Cancel any pending debounce, then flush the buffered edits live.
		await flush();
	}, [ edit, flush, editedRecord?.date, record?.status ] );

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

	const isPublished =
		record?.status === 'publish' || record?.status === 'private';

	// `useEntityRecord`'s `isSaving` only flips for the parent `save()` PUT, so
	// it stays false during a published-post autosave (which goes through
	// `apiFetch` to `.../autosaves`). `useEntityAutosave`'s `isSaveBusy` mirrors
	// `saveStatus === 'saving'` — set by both save paths — so the Update button
	// is disabled for the whole in-flight window regardless of which path runs.
	const isBusy = isSaving || isSaveBusy;

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
					disabled={ isBusy }
					loading={ isBusy }
				>
					{ isPublished
						? __( 'Update', 'wp-admin-shell' )
						: __( 'Publish', 'wp-admin-shell' ) }
				</Button>
			</div>
			<div className="wp-admin-shell-app-simple-editor__main">
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
				{ /* Native document-settings panels, rendered as a Fill into
				     the shared editor sidebar Slot. Plugins fill the SAME slot;
				     their panels render alongside (after) these. */ }
				<DocumentSettingsSidebar
					editedRecord={ editedRecord }
					edit={ edit }
					postTypeObject={ postTypeObject }
					canAssignAuthor={ canAssignAuthor }
				/>
				<aside
					className="wp-admin-shell-app-simple-editor__sidebar"
					aria-label={ __( 'Document settings', 'wp-admin-shell' ) }
				>
					<Slot
						name="core:editor.sidebar"
						fillProps={ {
							postId: record?.id,
							postType,
							status: record?.status,
						} }
					/>
				</aside>
			</div>
		</div>
	);
}
