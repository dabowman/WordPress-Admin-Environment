/**
 * Iframe chromeless-bridge parent-side listener (W6).
 *
 * The PHP chromeless bridge (`includes/engines/core-desktop/chromeless-
 * bridge.php`) injects a script into every same-origin admin iframe — its
 * gate (`wp_admin_shell_is_chromeless_request()`) keys off the browser's
 * `Sec-Fetch-Dest: iframe` header, so it fires for ANY iframe-mounted
 * admin page, not just the desktop engine. Among other things it
 * intercepts in-iframe link clicks (which don't bubble to the parent
 * document) and posts them up as `wp-admin-shell-admin-link` /
 * `wp-admin-shell-external-link` messages.
 *
 * This module is the engine-neutral parent-side consumer. It mirrors the
 * desktop-iframe app's handler but routes generically:
 *
 *   - `admin-link` that maps to a workspace route (via the admin-route
 *     registry's legacy mappings) → hash-navigate the workspace.
 *   - `admin-link` with no workspace equivalent → navigate the iframe
 *     itself to the URL (stay embedded in the shell).
 *   - `external-link` → open in a new tab.
 *
 * Security: messages are accepted only from the bound iframe's window
 * (`event.source`) AND the admin origin (`event.origin`), so sibling
 * frames can't spoof navigation.
 *
 * @package
 */

import { classifyAdminLink } from '../navigation/adminLinkInterceptor.mjs';

/**
 * Classify a bridge postMessage payload into a parent-side action.
 *
 * @param {*}      data         The `event.data` payload.
 * @param {Object} ctx          Context.
 * @param {string} ctx.adminUrl Admin base URL.
 * @param {Object} ctx.routes   Admin-route registry (legacy map).
 * @return {{ type: 'navigate'|'iframe'|'external'|'ignore', hashRoute?: string, href?: string }} Action.
 */
export function classifyBridgeMessage( data, { adminUrl, routes } = {} ) {
	if ( ! data || typeof data !== 'object' || typeof data.type !== 'string' ) {
		return { type: 'ignore' };
	}
	const url = typeof data.url === 'string' ? data.url : '';

	if ( 'wp-admin-shell-admin-link' === data.type ) {
		if ( ! url ) {
			return { type: 'ignore' };
		}
		const decision = classifyAdminLink( {
			rawHref: url,
			resolvedHref: url,
			adminUrl,
			routes,
		} );
		if ( 'route' === decision.action ) {
			return { type: 'navigate', hashRoute: decision.hashRoute };
		}
		// No workspace equivalent — keep the user embedded by pointing the
		// iframe at the classic page.
		return { type: 'iframe', href: url };
	}

	if ( 'wp-admin-shell-external-link' === data.type ) {
		return url ? { type: 'external', href: url } : { type: 'ignore' };
	}

	return { type: 'ignore' };
}

/**
 * Install the parent-side bridge listener.
 *
 * @param {Object}   options                    Wiring.
 * @param {string}   options.adminUrl           Admin base URL (origin pin).
 * @param {Object}   [options.routes]           Admin-route registry.
 * @param {Function} [options.navigate]         `(hashRoute) => void` workspace nav.
 * @param {Function} [options.onIframeNavigate] `(href) => void` navigate the iframe.
 * @param {Function} [options.openExternal]     `(href) => void` open a new tab.
 * @param {Function} [options.getIframeWindow]  `() => Window` the bound iframe's contentWindow.
 * @param {Object}   [options.win]              Window to bind to (defaults to global).
 * @return {Function} Uninstall callback.
 */
export function installIframeBridge( options = {} ) {
	const {
		adminUrl,
		routes = {},
		navigate,
		onIframeNavigate,
		openExternal,
		getIframeWindow,
		win,
	} = options;

	const w = win || ( typeof window !== 'undefined' ? window : null );
	if ( ! w ) {
		return () => {};
	}

	let expectedOrigin = null;
	try {
		expectedOrigin = new URL( adminUrl ).origin;
	} catch ( e ) {
		expectedOrigin = null;
	}

	const handler = ( event ) => {
		if ( expectedOrigin && event.origin !== expectedOrigin ) {
			return;
		}
		if ( typeof getIframeWindow === 'function' ) {
			const iframeWindow = getIframeWindow();
			// Drop messages from any window other than the bound iframe.
			if ( ! iframeWindow || event.source !== iframeWindow ) {
				return;
			}
		}

		const action = classifyBridgeMessage( event.data, {
			adminUrl,
			routes,
		} );
		if ( 'navigate' === action.type && typeof navigate === 'function' ) {
			navigate( action.hashRoute );
		} else if (
			'iframe' === action.type &&
			typeof onIframeNavigate === 'function'
		) {
			onIframeNavigate( action.href );
		} else if ( 'external' === action.type ) {
			const open =
				typeof openExternal === 'function'
					? openExternal
					: ( href ) =>
							w.open( href, '_blank', 'noopener,noreferrer' );
			open( action.href );
		}
	};

	w.addEventListener( 'message', handler );
	return () => w.removeEventListener( 'message', handler );
}
