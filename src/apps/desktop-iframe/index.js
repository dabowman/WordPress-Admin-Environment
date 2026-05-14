/**
 * core:desktop-iframe — engine-owned iframe app.
 *
 * Renders a wp-admin URL with `?wp_admin_shell_chromeless=1` so the
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

import './index.css';

/**
 * Append `wp_admin_shell_chromeless=1` to the URL. The PHP bridge hooks
 * `admin_footer` when this query var is present and emits the
 * postMessage protocol + chrome-hide CSS.
 *
 * @param {string} rawUrl Authored URL (relative or absolute).
 * @return {string} Final src for the iframe.
 */
function buildChromelessSrc( rawUrl ) {
	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	const base = /^https?:\/\//.test( rawUrl ) ? rawUrl : adminUrl + rawUrl;
	const join = base.includes( '?' ) ? '&' : '?';
	return `${ base }${ join }wp_admin_shell_chromeless=1`;
}

/**
 * Best-effort CSS injection so the iframe looks chromeless even before
 * the PHP bridge ships. Removed once the server-side handler emits the
 * same hide rules unconditionally.
 */
const CHROME_HIDE_CSS = `
	#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter {
		display: none !important;
	}
	#wpcontent { margin-left: 0 !important; }
	html.wp-toolbar { padding-top: 0 !important; }
	#wpbody-content { padding-top: 0; }
`;

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

	const onIframeLoad = useCallback( ( event ) => {
		setIsLoading( false );
		try {
			const doc = event.target.contentDocument;
			if ( ! doc ) {
				return;
			}
			const style = doc.createElement( 'style' );
			style.textContent = CHROME_HIDE_CSS;
			doc.head.appendChild( style );
		} catch ( e ) {
			// Cross-origin iframe — can't inject. The server-side
			// bridge takes over once it lands.
		}
	}, [] );

	// MVP postMessage listener stub. P2.T4-A/B/C extend this with
	// concrete handlers for the 14 bridge sub-systems (network /
	// menu-changed / external-link / auth-check / command-palette /
	// screen-meta / instrument-set / …).
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
			if ( ! type.startsWith( 'wp-admin-shell-' ) ) {
				return;
			}
			// Iframe must originate the message (otherwise drop —
			// other windows on the page could spoof).
			const iframe = iframeRef.current;
			if ( ! iframe || e.source !== iframe.contentWindow ) {
				return;
			}
			if ( process.env.NODE_ENV !== 'production' ) {
				// eslint-disable-next-line no-console
				console.debug(
					'[core:desktop-iframe] bridge message',
					type,
					data
				);
			}
		};
		window.addEventListener( 'message', onMessage );
		return () => window.removeEventListener( 'message', onMessage );
	}, [] );

	if ( ! rawUrl ) {
		return null;
	}

	return (
		<div className="wp-admin-shell-desktop-iframe">
			{ isLoading && (
				<div className="wp-admin-shell-desktop-iframe__loading">
					<Spinner />
				</div>
			) }
			<iframe
				ref={ iframeRef }
				src={ src }
				title={ app?.title || 'WordPress page' }
				className="wp-admin-shell-desktop-iframe__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
