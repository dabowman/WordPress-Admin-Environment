import './index.css';
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { Spinner } from '@wordpress/components';

import { navigate } from '../../runtime/routing/router';
import { installIframeBridge } from '../../runtime/platform/iframeBridge.mjs';
import { CHROME_HIDE_CSS } from '../_shared/iframe/chromeHide.mjs';

/**
 * Renders a wp-admin page inside an iframe with the default chrome
 * hidden. The iframe URL resolves relative to the WordPress admin URL.
 *
 * Visibility contract: the iframe is rendered `visibility: hidden` and
 * a Spinner is shown over the region UNTIL `onIframeLoad` has either
 *
 *   - injected the chrome-hide CSS into the loaded admin document (no
 *     more flash of un-hidden wp-admin chrome between load and inject), or
 *   - given up because the iframe is cross-origin (rare; reveal anyway), or
 *   - detected that WordPress rendered its login form inside the iframe
 *     (session expired) — in which case the iframe stays hidden and we
 *     force a heartbeat poll so the shell-level wp-auth-check modal
 *     appears immediately instead of after the next ~15s scheduled tick.
 *
 * A `heartbeat-tick` listener watches for a false→true transition on
 * `wp-auth-check` and reloads the iframe so it re-fetches the real page
 * once the user has re-authenticated.
 *
 * Source: `config.url` (the v2-canonical placement). Absolute URLs
 * pass through; relative URLs resolve under `window.wpAdminShell.adminUrl`.
 * @param {Object} root0
 * @param {*}      root0.app
 * @param {*}      root0.config
 */
export default function IframeApp( { app, config = {} } ) {
	const rawUrl = config.url || '';
	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	const src = /^https?:\/\//.test( rawUrl ) ? rawUrl : adminUrl + rawUrl;

	// `isReady` gates the iframe's visibility. Inverted from the old
	// `isLoading`: it's true only AFTER onIframeLoad has confirmed the
	// loaded document is a real admin page and the chrome-hide CSS is in.
	const [ isReady, setIsReady ] = useState( false );
	const iframeRef = useRef( null );

	// Navigating to a different URL (or a re-fetch via src reset) starts
	// a fresh load — hide the iframe again until the next onIframeLoad
	// inspects it.
	useEffect( () => {
		setIsReady( false );
	}, [ src ] );

	// Parent-side chromeless-bridge listener (W6). In-iframe admin-link
	// clicks the bridge posts up route into the workspace when they map to
	// a workspace screen, navigate the iframe itself otherwise, and open
	// external links in a new tab. Origin- + source-pinned.
	useEffect( () => {
		const shell =
			typeof window !== 'undefined' ? window.wpAdminShell : null;
		const bridgeAdminUrl = ( shell && shell.adminUrl ) || '/wp-admin/';
		const routes = ( shell && shell.adminRoutes ) || {};
		return installIframeBridge( {
			adminUrl: bridgeAdminUrl,
			routes,
			navigate,
			onIframeNavigate: ( href ) => {
				if ( iframeRef.current ) {
					setIsReady( false );
					iframeRef.current.src = href;
				}
			},
			getIframeWindow: () =>
				iframeRef.current ? iframeRef.current.contentWindow : null,
		} );
	}, [] );

	// Re-auth recovery. The shell-level wp-auth-check modal polls
	// heartbeat; when the user finishes re-authenticating
	// (`wp-auth-check` flips false→true), reload the iframe so it
	// re-fetches the real admin page now that the session is restored.
	// WordPress core ships heartbeat events on the jQuery document.
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
			if ( wasUnauthed && authed ) {
				const iframe = iframeRef.current;
				if ( iframe ) {
					setIsReady( false );
					// Reset src to itself to force a re-fetch — the iframe
					// is currently showing the WordPress login form from
					// the prior unauth'd request.
					// eslint-disable-next-line no-self-assign
					iframe.src = iframe.src;
				}
			}
			wasUnauthed = ! authed;
		};
		$( document ).on( 'heartbeat-tick', onTick );
		return () => $( document ).off( 'heartbeat-tick', onTick );
	}, [] );

	const onIframeLoad = useCallback( ( event ) => {
		try {
			const iframe = event.target;
			const iframeWin = iframe.contentWindow;
			const iframeDoc = iframeWin?.document;
			if ( ! iframeDoc ) {
				// Cross-origin — can't inspect or inject. Reveal anyway;
				// blocking forever is worse than showing whatever loaded.
				setIsReady( true );
				return;
			}

			// Session-expiry detection: WordPress renders wp-login.php
			// inside the iframe when the session is gone. Don't let the
			// user authenticate inside the iframe — keep it hidden and
			// force a heartbeat poll so the shell-level wp-auth-check
			// modal pops at once instead of waiting for the next ~15s tick.
			const href = iframeWin.location?.href || '';
			const isLoginPage =
				/\/wp-login\.php(\?|$)/.test( href ) ||
				!! iframeDoc.getElementById( 'loginform' ) ||
				!! iframeDoc.body?.classList?.contains( 'login' );
			if ( isLoginPage ) {
				setIsReady( false );
				try {
					if ( window.wp?.heartbeat?.connectNow ) {
						window.wp.heartbeat.connectNow();
					}
				} catch ( _e ) {
					// wp.heartbeat may not be available; the next
					// scheduled tick will still surface the modal.
				}
				return;
			}

			// Authenticated admin page — inject the chrome-hide CSS BEFORE
			// revealing the iframe, so the user never sees the full
			// wp-admin chrome flash through.
			const style = iframeDoc.createElement( 'style' );
			style.textContent = CHROME_HIDE_CSS;
			iframeDoc.head.appendChild( style );
			setIsReady( true );

			// Hide again at the START of the next in-iframe navigation
			// (form submit / link click). Without this, isReady stays
			// true while the new page loads and the user sees a flash
			// of un-styled wp-admin chrome before our chrome-hide CSS
			// runs again on the next onIframeLoad.
			try {
				iframeWin.addEventListener(
					'beforeunload',
					() => setIsReady( false ),
					{ once: true }
				);
			} catch ( _e ) {
				// Same-origin attach should succeed; cross-origin throws.
			}
		} catch ( e ) {
			// Same as cross-origin path — reveal anyway.
			setIsReady( true );
		}
	}, [] );

	if ( ! rawUrl ) {
		return null;
	}

	return (
		<div className="wp-admin-shell-app-iframe">
			{ ! isReady && (
				<div className="wp-admin-shell-app-iframe__loading">
					<Spinner />
				</div>
			) }
			<iframe
				ref={ iframeRef }
				src={ src }
				title={ app?.title }
				className="wp-admin-shell-app-iframe__frame"
				style={ { visibility: isReady ? 'visible' : 'hidden' } }
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
