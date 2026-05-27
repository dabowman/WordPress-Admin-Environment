/**
 * Admin-link interceptor (W4).
 *
 * Keeps clicks on classic `/wp-admin/...` links inside the workspace. A
 * capture-phase document listener resolves each anchor against the admin-
 * route registry (exposed at `window.wpAdminShell.adminRoutes`):
 *
 *   - A registry HIT (the link maps to a workspace route via the route's
 *     `legacy_path` / `legacy_query`) → preventDefault + hash-navigate.
 *   - A same-origin admin MISS (no workspace equivalent) → handed to the
 *     optional `onUnmatched(href)` callback (e.g. open in an iframe-
 *     fallback region); with no handler the browser navigates normally to
 *     the classic page.
 *   - Everything else (cross-origin, hash links, RPC endpoints, the
 *     classic-mode toggle, modifier-clicks, target=_blank, downloads,
 *     external rel) passes straight through.
 *
 * The classification logic is pure and node-testable; only
 * installAdminLinkInterceptor touches the DOM, and only when invoked.
 *
 * @package
 */

/**
 * Same-origin admin scripts that are RPC / asset endpoints, never
 * navigations. Matched against the path under the admin URL.
 */
export const RPC_SCRIPTS = new Set( [
	'admin-ajax.php',
	'admin-post.php',
	'async-upload.php',
	'load-scripts.php',
	'load-styles.php',
] );

/**
 * Whether a click event is a plain primary-button click (no modifiers,
 * not already handled).
 *
 * @param {Object} e Event-like `{ defaultPrevented, button, metaKey, ctrlKey, shiftKey, altKey }`.
 * @return {boolean} True when interceptable.
 */
export function isInterceptableClick( e ) {
	if ( ! e ) {
		return false;
	}
	if ( e.defaultPrevented ) {
		return false;
	}
	if ( e.button !== undefined && e.button !== null && e.button !== 0 ) {
		return false;
	}
	if ( e.metaKey || e.ctrlKey || e.shiftKey || e.altKey ) {
		return false;
	}
	return true;
}

/**
 * Whether an anchor opts into interception (in-page, downloadable, and
 * external links opt out).
 *
 * @param {Object} a Anchor-like `{ target, hasDownload, rel }`.
 * @return {boolean} True when interceptable.
 */
export function isInterceptableAnchor( a ) {
	if ( ! a ) {
		return false;
	}
	if ( a.target && a.target !== '_self' ) {
		return false;
	}
	if ( a.hasDownload ) {
		return false;
	}
	if ( a.rel && /\bexternal\b/.test( a.rel ) ) {
		return false;
	}
	return true;
}

/**
 * Find the workspace route whose legacy mapping matches a classic admin
 * script + query, or null.
 *
 * @param {string}          script Path under the admin URL, e.g. `edit.php`.
 * @param {URLSearchParams} query  Parsed query string.
 * @param {Object}          routes Admin-route registry `{ path: { legacy_path, legacy_query, legacy_params } }`.
 * @return {?string} The workspace route path (with tokens interpolated) or null.
 */
export function matchLegacyRoute( script, query, routes ) {
	if ( ! routes || typeof routes !== 'object' ) {
		return null;
	}
	// Among entries sharing a legacy_path, the most SPECIFIC one wins —
	// the one whose legacy_query constraints are all satisfied AND most
	// numerous. So `edit.php?post_type=page` (1 constraint) beats a bare
	// `edit.php` entry (0 constraints) that also vacuously matches, while
	// bare `edit.php` still wins when no post_type is present.
	let best = null;
	let bestScore = -1;
	for ( const [ path, route ] of Object.entries( routes ) ) {
		if ( ! route || route.legacy_path !== script ) {
			continue;
		}
		const legacyQuery = route.legacy_query || {};
		let matches = true;
		for ( const key of Object.keys( legacyQuery ) ) {
			// Absent param compares as '' (matches the PHP `'' === $got`
			// semantics) so a literal `'null'` constraint can't be matched
			// by an omitted param.
			const got = query.has( key ) ? query.get( key ) : '';
			if ( String( got ) !== String( legacyQuery[ key ] ) ) {
				matches = false;
				break;
			}
		}
		if ( ! matches ) {
			continue;
		}
		const score = Object.keys( legacyQuery ).length;
		if ( score <= bestScore ) {
			continue;
		}
		const params = route.legacy_params || {};
		const interpolated = path.replace( /\{(\w+)\}/g, ( token, name ) => {
			const queryKey = params[ name ] || name;
			const value = query.get( queryKey );
			return value !== null && value !== undefined && value !== ''
				? encodeURIComponent( value )
				: token;
		} );
		// Skip entries whose tokens didn't resolve (stray `{...}`) or that
		// collapse to the root — mirrors the PHP guard so a tokened route
		// (e.g. `/posts/{id}/edit`) hit with no id doesn't yield a bogus
		// `/posts/{id}/edit` or `/posts//edit`.
		if (
			'' === interpolated ||
			'/' === interpolated ||
			interpolated.includes( '{' ) ||
			interpolated.includes( '//' )
		) {
			continue;
		}
		best = interpolated;
		bestScore = score;
	}
	return best;
}

/**
 * Classify an admin link into an interception action.
 *
 * @param {Object} args              Inputs.
 * @param {string} args.rawHref      The anchor's literal `href` attribute.
 * @param {string} args.resolvedHref The anchor's resolved absolute URL.
 * @param {string} args.adminUrl     The admin base URL (e.g. `https://site/wp-admin/`).
 * @param {Object} args.routes       Admin-route registry.
 * @return {{ action: 'pass'|'route'|'iframe', hashRoute?: string, href?: string }} Decision.
 */
export function classifyAdminLink( {
	rawHref,
	resolvedHref,
	adminUrl,
	routes,
} ) {
	if ( ! resolvedHref ) {
		return { action: 'pass' };
	}
	// In-shell hash navigation — the router owns it.
	if ( typeof rawHref === 'string' && rawHref.trim().startsWith( '#' ) ) {
		return { action: 'pass' };
	}

	let base;
	let url;
	try {
		base = new URL( adminUrl );
		url = new URL( resolvedHref, base );
	} catch ( e ) {
		return { action: 'pass' };
	}

	if ( url.origin !== base.origin ) {
		return { action: 'pass' };
	}
	if ( ! url.pathname.startsWith( base.pathname ) ) {
		return { action: 'pass' };
	}

	const script = url.pathname
		.slice( base.pathname.length )
		.replace( /^\/+/, '' );
	if ( RPC_SCRIPTS.has( script ) ) {
		return { action: 'pass' };
	}
	// Classic-mode toggle is a server-handled full navigation (W3).
	const classic = url.searchParams.get( 'classic' );
	if ( classic === '0' || classic === '1' ) {
		return { action: 'pass' };
	}
	// Nonce-protected actions (e.g. `plugins.php?action=deactivate&_wpnonce=…`)
	// must complete in classic — intercepting would drop `action`/`_wpnonce`
	// and silently void the operation.
	if ( url.searchParams.has( '_wpnonce' ) ) {
		return { action: 'pass' };
	}

	const hashRoute = matchLegacyRoute( script, url.searchParams, routes );
	if ( hashRoute ) {
		return { action: 'route', hashRoute };
	}
	return { action: 'iframe', href: resolvedHref };
}

/**
 * Walk up from a click target to the nearest anchor element.
 *
 * @param {*} target Event target.
 * @return {?Element} The anchor, or null.
 */
function closestAnchor( target ) {
	if ( target && typeof target.closest === 'function' ) {
		return target.closest( 'a' );
	}
	let node = target;
	while ( node ) {
		if ( node.tagName === 'A' ) {
			return node;
		}
		node = node.parentNode || node.parentElement || null;
	}
	return null;
}

/**
 * Install the capture-phase admin-link interceptor on `document`.
 *
 * @param {string}   adminUrl              The admin base URL.
 * @param {Object}   options               Wiring.
 * @param {Object}   [options.routes]      Admin-route registry.
 * @param {Function} [options.navigate]    `(hashRoute) => void` workspace navigation.
 * @param {Function} [options.onUnmatched] `(href) => void` for same-origin admin misses.
 * @param {Object}   [options.doc]         Document to bind to (defaults to global `document`).
 * @return {Function} Uninstall callback.
 */
export function installAdminLinkInterceptor( adminUrl, options = {} ) {
	const { routes = {}, navigate, onUnmatched, doc } = options;
	const target = doc || ( typeof document !== 'undefined' ? document : null );
	if ( ! target ) {
		return () => {};
	}

	const handler = ( event ) => {
		if ( ! isInterceptableClick( event ) ) {
			return;
		}
		const anchor = closestAnchor( event.target );
		if ( ! anchor ) {
			return;
		}
		const info = {
			target: anchor.getAttribute
				? anchor.getAttribute( 'target' )
				: anchor.target,
			hasDownload: anchor.hasAttribute
				? anchor.hasAttribute( 'download' )
				: !! anchor.download,
			rel:
				( anchor.getAttribute
					? anchor.getAttribute( 'rel' )
					: anchor.rel ) || '',
		};
		if ( ! isInterceptableAnchor( info ) ) {
			return;
		}

		const decision = classifyAdminLink( {
			rawHref: anchor.getAttribute
				? anchor.getAttribute( 'href' )
				: anchor.href,
			resolvedHref: anchor.href,
			adminUrl,
			routes,
		} );

		if ( decision.action === 'route' ) {
			event.preventDefault();
			if ( typeof navigate === 'function' ) {
				navigate( decision.hashRoute );
			}
			return;
		}
		if (
			decision.action === 'iframe' &&
			typeof onUnmatched === 'function'
		) {
			event.preventDefault();
			onUnmatched( decision.href );
		}
		// 'pass' (or an admin miss with no onUnmatched) → browser navigates.
	};

	target.addEventListener( 'click', handler, { capture: true } );
	return () =>
		target.removeEventListener( 'click', handler, { capture: true } );
}
