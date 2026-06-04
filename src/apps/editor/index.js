import './index.css';
import { useState, useEffect, useRef, useCallback } from '@wordpress/element';
import { Button, Icon } from '@wordpress/ui';
import { Spinner } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { arrowLeft } from '@wordpress/icons';
import apiFetch from '@wordpress/api-fetch';
import { navigate } from '../../runtime/routing/router';
import { installIframeBridge } from '../../runtime/platform/iframeBridge.mjs';
import { useDirtyState } from '../../runtime/dirty-state/useDirtyState';
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
 *
 * Integration seam with the embedded editor (the iframe runs the real
 * WordPress block editor + the chromeless bridge from
 * `includes/engines/core-desktop/chromeless-bridge.php`):
 *
 *   - **Dirty-state.** The bridge relays `core/editor`'s
 *     `isEditedPostDirty()` up as `wp-admin-workspaces-dirty-state`; we feed
 *     it into `useDirtyState` so a sidebar click is guarded like any
 *     native app's unsaved-changes state (the manifest declares
 *     `core:dirty-state` + `core:block-navigation-on-dirty`).
 *   - **In-iframe navigation.** `installIframeBridge` routes in-iframe
 *     link clicks (post-publish "View Post", the post-trash redirect to
 *     `edit.php`, "Manage Patterns") into the workspace or back into the
 *     iframe instead of letting them escape or break the shell.
 *   - **Session-expiry recovery.** If the session dies mid-edit the
 *     iframe would silently swap to the login form; we detect it, keep
 *     the frame masked, force a heartbeat poll so the shell-level
 *     `wp-auth-check` modal appears, and reload the frame on re-auth.
 * @param {Object} root0
 * @param {Object} root0.config
 * @param {*}      root0.regionId
 */
export default function EditorApp( { config = {}, regionId } ) {
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
	// Unsaved-changes state, fed by the chromeless bridge's dirty-state
	// relay (see effect below). Reset to clean whenever a fresh load
	// starts so a stale flag from the previous post can't block nav.
	const [ isDirty, setIsDirty ] = useState( false );
	const iframeRef = useRef( null );

	// Report the embedded editor's unsaved state to the shell so
	// NavigationGuard intercepts intra-shell navigation (a sidebar click)
	// the way the iframe's own `beforeunload` guards a full-page exit.
	useDirtyState( regionId, isDirty, { blocksNavigation: true } );

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
		setIsDirty( false );
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
							__(
								'Failed to create draft.',
								'wp-admin-workspaces'
							)
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

	// Parent-side chromeless-bridge listener. The bridge inside the
	// iframe (injected for any same-origin iframe admin page) posts
	// in-iframe link clicks up as `wp-admin-workspaces-admin-link` /
	// `-external-link`, and `core/editor` dirty transitions as
	// `wp-admin-workspaces-dirty-state`. Origin- + source-pinned to the
	// editor iframe.
	useEffect( () => {
		const shell =
			typeof window !== 'undefined' ? window.wpAdminWorkspaces : null;
		const bridgeAdminUrl = ( shell && shell.adminUrl ) || '/wp-admin/';
		const routes = ( shell && shell.adminRoutes ) || {};
		return installIframeBridge( {
			adminUrl: bridgeAdminUrl,
			routes,
			navigate,
			onIframeNavigate: ( href ) => {
				if ( iframeRef.current ) {
					// Navigate the frame, but do NOT optimistically
					// clear dirty or raise the spinner here. Gutenberg's
					// beforeunload guard can still cancel this nav
					// ("Stay"), and the dirty relay only re-emits on a
					// *transition* — an optimistic clear would leave the
					// parent stuck clean (the silent-discard this PR
					// closes) and the spinner stuck up. onIframeLoad
					// clears dirty once the new document actually loads.
					iframeRef.current.src = href;
				}
			},
			onDirty: ( dirty ) => setIsDirty( dirty ),
			getIframeWindow: () =>
				iframeRef.current ? iframeRef.current.contentWindow : null,
		} );
	}, [] );

	// Re-auth recovery. The shell-level wp-auth-check modal polls
	// heartbeat; when the user finishes re-authenticating
	// (`wp-auth-check` flips false→true) reload the iframe so it
	// re-fetches the real editor now that the session is restored.
	useEffect( () => {
		if ( typeof window === 'undefined' || ! window.jQuery ) {
			return undefined;
		}
		const $ = window.jQuery;
		let wasUnauthed = false;
		const onTick = ( _event, data ) => {
			if ( ! data || ! ( 'wp-auth-check' in data ) ) {
				return;
			}
			const authed = !! data[ 'wp-auth-check' ];
			if ( wasUnauthed && authed && iframeRef.current ) {
				setIframeLoading( true );
				// Reset src to itself to force a re-fetch — the iframe is
				// currently showing the WordPress login form (no editor,
				// so no beforeunload to cancel the reload). onIframeLoad
				// clears dirty once the real editor reloads.
				// eslint-disable-next-line no-self-assign
				iframeRef.current.src = iframeRef.current.src;
			}
			wasUnauthed = ! authed;
		};
		$( document ).on( 'heartbeat-tick', onTick );
		return () => $( document ).off( 'heartbeat-tick', onTick );
	}, [] );

	const onIframeLoad = useCallback( ( event ) => {
		const iframe = event.target;
		let iframeWin;
		let iframeDoc;
		try {
			iframeWin = iframe.contentWindow;
			iframeDoc = iframeWin ? iframeWin.document : null;
		} catch ( e ) {
			// Cross-origin — can't inspect; reveal anyway.
			setIframeLoading( false );
			return;
		}

		// Session-expiry detection: WordPress serves wp-login.php inside
		// the iframe when the session is gone. Keep the loading mask up so
		// the stripped login form never shows, and force a heartbeat poll
		// so the shell-level wp-auth-check modal pops at once instead of
		// after the next ~15s scheduled tick. The heartbeat-tick listener
		// above reloads the frame once the user re-authenticates.
		if ( iframeDoc ) {
			let isLoginPage = false;
			try {
				const href = iframeWin.location?.href || '';
				isLoginPage =
					/\/wp-login\.php(\?|$)/.test( href ) ||
					!! iframeDoc.getElementById( 'loginform' ) ||
					!! iframeDoc.body?.classList?.contains( 'login' );
			} catch ( e ) {
				isLoginPage = false;
			}
			if ( isLoginPage ) {
				setIframeLoading( true );
				setIsDirty( false );
				try {
					if ( window.wp?.heartbeat?.connectNow ) {
						window.wp.heartbeat.connectNow();
					}
				} catch ( e ) {
					// wp.heartbeat may be unavailable; the next scheduled
					// tick still surfaces the modal.
				}
				return;
			}
		}

		// A fresh document finished loading, so any unsaved state from
		// the previously loaded editor is gone (saved, discarded via a
		// confirmed in-iframe nav, or this is a different page). Clear
		// the parent flag here — NOT optimistically at nav time, so a
		// cancelled "Stay" can't strand it clean. The bridge relay then
		// re-asserts the new document's real dirty value if it is itself
		// an editor.
		setIsDirty( false );
		setIframeLoading( false );
		injectChromeHide( iframe );
	}, [] );

	// Determine which post list to go back to.
	const backRoute = postType === 'page' ? 'pages' : 'posts';

	if ( error ) {
		return (
			<div className="wp-admin-workspaces-app-editor">
				<div className="wp-admin-workspaces-app-editor__toolbar">
					<Button
						onClick={ () => navigate( backRoute ) }
						variant="minimal"
					>
						<Icon icon={ arrowLeft } size={ 16 } />
						{ __( 'Back to list', 'wp-admin-workspaces' ) }
					</Button>
				</div>
				<div className="wp-admin-workspaces-content__empty">
					{ error }
				</div>
			</div>
		);
	}

	if ( isCreating || ! postId ) {
		return (
			<div className="wp-admin-workspaces-app-editor">
				<div className="wp-admin-workspaces-app-editor__loading">
					<Spinner />
				</div>
			</div>
		);
	}

	const adminUrl = window.wpAdminWorkspaces?.adminUrl || '/wp-admin/';
	const editorUrl = `${ adminUrl }post.php?post=${ postId }&action=edit`;

	return (
		<div className="wp-admin-workspaces-app-editor">
			<div className="wp-admin-workspaces-app-editor__toolbar">
				<Button
					onClick={ () => navigate( backRoute ) }
					variant="minimal"
					size="compact"
				>
					<Icon icon={ arrowLeft } size={ 16 } />
					{ __( 'Back to list', 'wp-admin-workspaces' ) }
				</Button>
			</div>
			{ iframeLoading && (
				<div className="wp-admin-workspaces-app-editor__loading">
					<Spinner />
				</div>
			) }
			<iframe
				ref={ iframeRef }
				src={ editorUrl }
				title={ __( 'Editor', 'wp-admin-workspaces' ) }
				className="wp-admin-workspaces-app-editor__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
