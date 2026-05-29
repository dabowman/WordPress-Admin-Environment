import './index.css';
import { useState, useEffect, useRef, useCallback } from '@wordpress/element';
import { Button, Icon } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { arrowLeft } from '@wordpress/icons';
import apiFetch from '@wordpress/api-fetch';
import { navigate } from '../../runtime/routing/router';
import { injectChromeHide } from '../_shared/iframe/chromeHide.mjs';

/**
 * Block editor via iframe. Handles existing posts and new post (auto-draft) flow.
 *
 * Driven by `config` (the screen's route config, with `{id}` captures already
 * interpolated). The screen — not this app — owns the URL pattern:
 *   `config.id` is a number  → edit that post (e.g. screen `/posts/{id}/edit`)
 *   `config.id` is undefined  → create an auto-draft, then edit (e.g. screen
 *                               `/posts/new`, whose config carries only
 *                               `postType`); `"new"`/`""` are also treated as
 *                               the create flow.
 * After creating a draft the URL is rewritten to the canonical edit route
 * `#/{posts|pages}/{id}/edit`.
 * @param {Object} root0
 * @param {Object} root0.config
 */
export default function EditorApp( { config = {} } ) {
	const postType = config.postType || 'post';
	const postIdParam = config.id;
	// The "add new" screens (`/posts/new`, `/pages/new`) route here with no
	// `{id}` capture, so `config.id` is undefined — treat that (and the
	// explicit `new` sentinel) as the draft-creation flow. Mirrors
	// SimpleEditorApp; without this, undefined → NaN postId → stuck spinner.
	const isNew =
		postIdParam === undefined ||
		postIdParam === '' ||
		postIdParam === 'new';

	const [ postId, setPostId ] = useState(
		isNew ? null : Number( postIdParam )
	);
	const [ isCreating, setIsCreating ] = useState( isNew );
	const [ error, setError ] = useState( null );
	const [ iframeLoading, setIframeLoading ] = useState( true );

	// MountedApp doesn't remount across same-route hash navs
	// (`/posts/A/edit` → `/posts/B/edit` share one route pattern), so the
	// `postId` initializer above only runs for the first post — the iframe
	// would keep loading the previous post. Re-sync when the route points at a
	// different post, resetting `iframeLoading` so the spinner shows while the
	// new post paints. The auto-draft path uses `replaceState` (no navigation
	// event), so `postIdParam` stays at its 'new'/undefined value there and
	// this guard is a no-op — the draft id set below survives. Mirrors
	// SimpleEditorApp.
	const prevRawRef = useRef( postIdParam );
	useEffect( () => {
		if ( prevRawRef.current === postIdParam ) {
			return;
		}
		prevRawRef.current = postIdParam;
		setError( null );
		setIframeLoading( true );
		if ( isNew ) {
			setPostId( null );
			setIsCreating( true );
		} else {
			setPostId( Number( postIdParam ) );
			setIsCreating( false );
		}
	}, [ postIdParam, isNew ] );

	// Create auto-draft for new posts.
	useEffect( () => {
		if ( ! isNew ) {
			return;
		}

		let cancelled = false;

		async function createAutoDraft() {
			try {
				const result = await apiFetch( {
					path: `/wp/v2/${ postType === 'page' ? 'pages' : 'posts' }`,
					method: 'POST',
					data: {
						status: 'draft',
						title: '',
						// REST rejects fully-empty posts with
						// "Content, title, and excerpt are empty". Seed a
						// blank paragraph block so the auto-draft saves
						// even before the user types a title. SimpleEditorApp
						// uses the same placeholder.
						content:
							'<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->',
					},
				} );

				if ( ! cancelled ) {
					setPostId( result.id );
					setIsCreating( false );
					// Update the URL without triggering a re-render loop.
					// Write the shell's canonical edit route
					// (`/posts/{id}/edit` | `/pages/{id}/edit`) so a refresh
					// after creation lands on a real route — `#/editor/...`
					// matches nothing in the bundled shells. Mirrors
					// SimpleEditorApp's createDraft.
					window.history.replaceState(
						null,
						'',
						`#/${ postType === 'page' ? 'pages' : 'posts' }/${
							result.id
						}/edit`
					);
				}
			} catch ( err ) {
				if ( ! cancelled ) {
					setError(
						err?.message ||
							__( 'Failed to create draft.', 'wp-admin-shell' )
					);
					setIsCreating( false );
				}
			}
		}

		createAutoDraft();

		return () => {
			cancelled = true;
		};
	}, [ isNew, postType ] );

	const onIframeLoad = useCallback( ( event ) => {
		setIframeLoading( false );
		injectChromeHide( event.target );
	}, [] );

	// Determine which post list to go back to.
	const backRoute = postType === 'page' ? 'pages' : 'posts';

	if ( error ) {
		return (
			<div className="wp-admin-shell-app-editor">
				<div className="wp-admin-shell-app-editor__toolbar">
					<Button
						onClick={ () => navigate( backRoute ) }
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
			<div className="wp-admin-shell-app-editor">
				<div className="wp-admin-shell-app-editor__loading">
					<Spinner />
				</div>
			</div>
		);
	}

	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	const editorUrl = `${ adminUrl }post.php?post=${ postId }&action=edit`;

	return (
		<div className="wp-admin-shell-app-editor">
			<div className="wp-admin-shell-app-editor__toolbar">
				<Button
					onClick={ () => navigate( backRoute ) }
					variant="minimal"
					size="compact"
				>
					<Icon icon={ arrowLeft } size={ 16 } />
					{ __( 'Back to list', 'wp-admin-shell' ) }
				</Button>
			</div>
			{ iframeLoading && (
				<div className="wp-admin-shell-app-editor__loading">
					<Spinner />
				</div>
			) }
			<iframe
				src={ editorUrl }
				title={ __( 'Editor', 'wp-admin-shell' ) }
				className="wp-admin-shell-app-editor__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
