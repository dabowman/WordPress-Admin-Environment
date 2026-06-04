/**
 * Iframe chromeless-bridge parent-side listener (W6).
 *
 * The PHP chromeless bridge (`includes/engines/core-desktop/chromeless-
 * bridge.php`) injects a script into every same-origin admin iframe — its
 * gate (`wp_admin_workspaces_is_chromeless_request()`) keys off the browser's
 * `Sec-Fetch-Dest: iframe` header, so it fires for ANY iframe-mounted
 * admin page, not just the desktop engine. Among other things it
 * intercepts in-iframe link clicks (which don't bubble to the parent
 * document) and posts them up as `wp-admin-workspaces-admin-link` /
 * `wp-admin-workspaces-external-link` messages.
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
 * @return {{ type: 'navigate'|'iframe'|'external'|'dirty'|'ignore', hashRoute?: string, href?: string, dirty?: boolean }} Action.
 */
export function classifyBridgeMessage( data, { adminUrl, routes } = {} ) {
	if ( ! data || typeof data !== 'object' || typeof data.type !== 'string' ) {
		return { type: 'ignore' };
	}
	const url = typeof data.url === 'string' ? data.url : '';

	// Unsaved-changes signal from the embedded editor. The iframe-side
	// chromeless bridge subscribes to `core/editor`'s
	// `isEditedPostDirty()` and posts this on every transition; the
	// parent maps it onto the shell's dirty-state service so a sidebar
	// click is guarded the same way a native app's `useDirtyState` is.
	// No URL — only the boolean matters; the origin/source pins in
	// `installIframeBridge` still gate who may send it.
	if ( 'wp-admin-workspaces-dirty-state' === data.type ) {
		return { type: 'dirty', dirty: !! data.dirty };
	}

	if ( 'wp-admin-workspaces-admin-link' === data.type ) {
		if ( ! url ) {
			return { type: 'ignore' };
		}
		// `target=_parent` / `target=_top` is WP's "break out of modal"
		// idiom (plugin-install Replace / cancel, etc.). In our workspace
		// the iframe-fallback IS the modal — the equivalent behavior is to
		// navigate the iframe itself, so the action URL (including
		// `_wpnonce`) is preserved and the user stays in the workspace.
		// Bypass classifyAdminLink for this case — its `_wpnonce` guard
		// would otherwise return 'pass' and the click would do nothing.
		if ( '_parent' === data.target || '_top' === data.target ) {
			// Defense in depth: only iframe-navigate same-origin admin URLs
			// (the bridge inside the iframe already filters to wp-admin
			// paths, but mirror the check here so a tampered payload can't
			// point the iframe at an arbitrary origin).
			try {
				const base = new URL( adminUrl );
				const target = new URL( url, adminUrl );
				if ( base.origin !== target.origin ) {
					return { type: 'ignore' };
				}
				// Mirror the rest of the bridge's wp-admin path floor: a
				// same-origin but non-admin path (e.g. /wp-content/uploads/x.html)
				// must not become an iframe.src navigation sink.
				if ( ! target.pathname.startsWith( base.pathname ) ) {
					return { type: 'ignore' };
				}
			} catch ( e ) {
				return { type: 'ignore' };
			}
			return { type: 'iframe', href: url };
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
		// Only a genuine same-origin admin MISS keeps the user embedded by
		// pointing the iframe at the classic page. A `'pass'` (RPC, the
		// classic-mode toggle, cross-origin, in-page hash) must NOT reach
		// `iframe.src` — treat it as ignore so the URL can't become an
		// unvalidated navigation sink.
		if ( 'iframe' === decision.action ) {
			return { type: 'iframe', href: url };
		}
		return { type: 'ignore' };
	}

	if ( 'wp-admin-workspaces-external-link' === data.type ) {
		// Defense in depth: only hand http(s) / mailto to window.open, never
		// a `javascript:` / `data:` URL a compromised same-origin embed might
		// post (the origin/source pins already gate who can reach here).
		if ( url && /^(https?:|mailto:)/i.test( url ) ) {
			return { type: 'external', href: url };
		}
		return { type: 'ignore' };
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
 * @param {Function} [options.onDirty]          `(dirty: boolean) => void` the embedded editor's unsaved-changes state changed.
 * @param {Function} options.getIframeWindow    `() => Window` the bound iframe's contentWindow. REQUIRED — the source pin; messages are refused without it.
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
		onDirty,
		getIframeWindow,
		win,
	} = options;

	const w = win || ( typeof window !== 'undefined' ? window : null );
	if ( ! w ) {
		return () => {};
	}

	// Resolve the expected origin, falling back to the page origin when
	// `adminUrl` is relative (e.g. the iframe-fallback default `/wp-admin/`).
	// If it still can't be determined, REFUSE all messages rather than
	// silently disabling the origin pin.
	let expectedOrigin = null;
	try {
		expectedOrigin = new URL( adminUrl ).origin;
	} catch ( e ) {
		try {
			const base =
				w.location && w.location.href ? w.location.href : undefined;
			expectedOrigin = new URL( adminUrl, base ).origin;
		} catch ( e2 ) {
			expectedOrigin = null;
		}
	}

	const handler = ( event ) => {
		if ( ! expectedOrigin || event.origin !== expectedOrigin ) {
			return;
		}
		// Source pin is mandatory — without a bound iframe window to compare
		// `event.source` against, any same-origin frame/popup could spoof the
		// message, so refuse rather than fall back to origin-only.
		if ( typeof getIframeWindow !== 'function' ) {
			return;
		}
		const iframeWindow = getIframeWindow();
		if ( ! iframeWindow || event.source !== iframeWindow ) {
			return;
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
		} else if ( 'dirty' === action.type && typeof onDirty === 'function' ) {
			onDirty( action.dirty );
		}
	};

	w.addEventListener( 'message', handler );
	return () => w.removeEventListener( 'message', handler );
}
