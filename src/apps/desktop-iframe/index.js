/**
 * core:desktop-iframe — engine-owned iframe app.
 *
 * Renders a wp-admin URL with `?wp_admin_workspaces_chromeless=1` so the
 * PHP-side chromeless bridge (P2.T4) suppresses the parent admin's
 * chrome and exposes observability hooks via postMessage. Until the
 * full bridge ships, the iframe also injects a CSS-hide fallback so
 * windows look chromeless even without the server-side handler.
 *
 * Why fork `core:iframe-fallback`: that app stays put for `core:default`
 * consumers (`core:editor`, `core:site-editor`) which use injected CSS
 * exclusively. Desktop windows want observable iframes (link
 * interception, auth-check recovery, command-palette harvest, …) and
 * the chromeless query var is the contract that opts every page in to
 * those handlers. Mixing both behaviors into one app would couple the
 * default engine to bridge details it doesn't use.
 *
 * Bridge surface for MVP: a postMessage listener stub that logs
 * unrecognized message types in dev. Sub-systems 1–14 land in P2.T4-A
 * through T4-C; this app is the mount point they wire into.
 */

import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { Spinner } from '@wordpress/components';

import {
	useWindowManager,
	useWindowEntry,
} from '../../runtime/engines/core-desktop/windowing/WindowManagerContext';
import { getAppWindowBlock } from '../../runtime/engines/core-desktop/windowing/appWindowBlock';
import { injectChromeHide } from '../_shared/iframe/chromeHide.mjs';

import './index.css';

/**
 * Append `wp_admin_workspaces_chromeless=1` to the URL. The PHP bridge hooks
 * `admin_footer` when this query var is present and emits the
 * postMessage protocol + chrome-hide CSS.
 *
 * @param {string} rawUrl Authored URL (relative or absolute).
 * @return {string} Final src for the iframe.
 */
function buildChromelessSrc( rawUrl ) {
	const adminUrl = window.wpAdminWorkspaces?.adminUrl || '/wp-admin/';
	const base = /^https?:\/\//.test( rawUrl ) ? rawUrl : adminUrl + rawUrl;
	const join = base.includes( '?' ) ? '&' : '?';
	return `${ base }${ join }wp_admin_workspaces_chromeless=1`;
}

/**
 * @param {Object} root0
 * @param {*}      root0.app
 * @param {*}      root0.config
 */
export default function DesktopIframeApp( { app, config = {} } ) {
	const rawUrl = config.url || '';
	const src = rawUrl ? buildChromelessSrc( rawUrl ) : '';
	const [ isLoading, setIsLoading ] = useState( true );
	const iframeRef = useRef( null );
	const manager = useWindowManager();
	const windowId =
		config && typeof config.windowId === 'string' ? config.windowId : null;
	// Watch the window entry just so the frame's parent re-renders are
	// observable here. Subscription is incidental — the bridge handlers
	// reach the manager imperatively.
	useWindowEntry( windowId || '' );

	const onIframeLoad = useCallback( ( event ) => {
		setIsLoading( false );
		// Best-effort CSS hide so the window looks chromeless even before the
		// PHP bridge lands; the server-side handler emits the same rules once
		// it ships. Cross-origin frames just no-op here.
		injectChromeHide( event.target );
	}, [] );

	// Bridge message handlers (P2.T4-A/B observability + T4-B routing).
	useEffect( () => {
		const onMessage = ( e ) => {
			const data = e.data;
			if ( ! data || typeof data !== 'object' ) {
				return;
			}
			const type = data.type;
			if ( typeof type !== 'string' ) {
				return;
			}
			if ( ! type.startsWith( 'wp-admin-workspaces-' ) ) {
				return;
			}
			// Iframe must originate the message (otherwise drop —
			// other windows on the page could spoof).
			const iframe = iframeRef.current;
			if ( ! iframe || e.source !== iframe.contentWindow ) {
				return;
			}

			if ( type === 'wp-admin-workspaces-iframe-ready' ) {
				// Handshake hello → ack flow (sub-system 8). Posting
				// from parent after iframe-ready guarantees the iframe
				// has its listener attached.
				try {
					iframe.contentWindow.postMessage(
						{ type: 'wp-admin-workspaces-bridge-hello' },
						window.location.origin
					);
				} catch ( _err ) {
					/* swallow */
				}
				return;
			}

			if ( type === 'wp-admin-workspaces-focus-request' ) {
				if ( windowId ) {
					manager.focusWindow( windowId );
				}
				return;
			}

			if ( type === 'wp-admin-workspaces-admin-link' ) {
				// Open the admin link as a new iframe window inside the
				// workspace so the user stays in the desktop metaphor.
				const url = typeof data.url === 'string' ? data.url : '';
				if ( ! url ) {
					return;
				}
				const block = getAppWindowBlock( 'core:desktop-iframe' );
				manager.openWindow( {
					app: 'core:desktop-iframe',
					config: { url },
					title:
						typeof data.label === 'string' && data.label
							? data.label
							: url,
					size: block.defaultSize,
				} );
				return;
			}

			if ( type === 'wp-admin-workspaces-external-link' ) {
				// External destinations leave the iframe sandbox — hand
				// to the browser. Future: spawn a generic-iframe window
				// so the user stays in-workspace. For MVP, native new tab.
				const url = typeof data.url === 'string' ? data.url : '';
				if ( url ) {
					window.open( url, '_blank', 'noopener,noreferrer' );
				}
				return;
			}

			if ( process.env.NODE_ENV !== 'production' ) {
				// Unhandled types still log so future sub-systems are
				// easy to spot in dev.
				// eslint-disable-next-line no-console
				console.debug(
					'[core:desktop-iframe] unhandled bridge message',
					type,
					data
				);
			}
		};
		window.addEventListener( 'message', onMessage );
		return () => window.removeEventListener( 'message', onMessage );
	}, [ manager, windowId ] );

	if ( ! rawUrl ) {
		return null;
	}

	return (
		<div className="wp-admin-workspaces-desktop-iframe">
			{ isLoading && (
				<div className="wp-admin-workspaces-desktop-iframe__loading">
					<Spinner />
				</div>
			) }
			<iframe
				ref={ iframeRef }
				src={ src }
				title={ app?.title || 'WordPress page' }
				className="wp-admin-workspaces-desktop-iframe__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
