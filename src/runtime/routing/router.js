import {
	createContext,
	useState,
	useEffect,
	useContext,
	useMemo,
} from '@wordpress/element';

import { parseHash, readSlot, matchRoute, interpolate } from './matchRoute.mjs';

/**
 * URL-driven router (V2.M3 task 2 + 3 + 4 + 7).
 *
 * Spec §6: the URL is the full source of truth for shell state. The
 * router observes URL changes via `hashchange` (and the Navigation API
 * `navigate` event where supported) and decomposes the URL into a
 * primary path + named query parameters. Each routable region resolves
 * its `routing.route-key` slot value against the admin.json `routes`
 * block and mounts the matching app.
 *
 * Public surface:
 *   - <RouterProvider>            — listens to URL changes, exposes parsed URL.
 *   - useRoute()                  — { primary, params, hash, appId, segments }.
 *                                   New v2 fields (primary, params) plus
 *                                   legacy v1 fields (appId, segments) so
 *                                   v1 shells continue to work during the
 *                                   transition.
 *   - useRouteForRegion(region, routesBlock)
 *                                 — resolves a region's route-key slot
 *                                   against the routes block; returns
 *                                   { pattern, app, config, params } or null.
 *   - navigate(href)              — single-arg URL-decomposer style. Sets
 *                                   `location.hash` to the given href.
 *   - navigateRoute(route)        — sets the hash to a literal route string.
 *
 * Browser back/forward, middle-click "open in new tab", and right-click
 * "Copy link address" all work through the native URL bar — the router
 * never intercepts `<a>` clicks at the document level.
 */

const RouteContext = createContext( {
	primary: '',
	params: {},
	hash: '',
	appId: null,
	segments: [],
} );

export function RouterProvider( { children, defaultRoute } ) {
	const [ hash, setHash ] = useState(
		typeof window !== 'undefined' ? window.location.hash : ''
	);

	useEffect( () => {
		if ( typeof window === 'undefined' ) {
			return undefined;
		}
		const handler = () => setHash( window.location.hash );
		window.addEventListener( 'hashchange', handler );

		// Navigation API where supported (evergreen browsers). Fires for
		// programmatic same-document navigations the hashchange event
		// does not (e.g. `history.pushState`). Subscribe defensively —
		// older browsers or non-DOM hosts (SSR) skip this branch.
		const nav =
			typeof window.navigation === 'object' ? window.navigation : null;
		if ( nav && typeof nav.addEventListener === 'function' ) {
			nav.addEventListener( 'navigatesuccess', handler );
		}

		return () => {
			window.removeEventListener( 'hashchange', handler );
			if ( nav && typeof nav.removeEventListener === 'function' ) {
				nav.removeEventListener( 'navigatesuccess', handler );
			}
		};
	}, [] );

	// Spec §6.2: when the primary path matches no route and the URL is
	// the initial load, the runtime navigates to `default-route`.
	// Replace the history entry so the empty hash doesn't sit in the
	// back-button stack.
	useEffect( () => {
		if ( typeof window === 'undefined' || ! defaultRoute ) {
			return;
		}
		const current = parseHash( window.location.hash );
		if ( current.primary ) {
			return;
		}
		const trimmed = String( defaultRoute ).replace( /^#?\/?/, '' );
		const next = '#/' + trimmed;
		if ( typeof window.history?.replaceState === 'function' ) {
			window.history.replaceState( null, '', next );
			setHash( next );
		} else {
			window.location.hash = next;
		}
		// Run once on mount; ignore subsequent default-route changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const value = useMemo( () => decompose( hash ), [ hash ] );

	return (
		<RouteContext.Provider value={ value }>
			{ children }
		</RouteContext.Provider>
	);
}

export function useRoute() {
	return useContext( RouteContext );
}

/**
 * Resolve a region's `routing.route-key` slot against the routes block.
 *
 * Returns null when the region has no route-key, the slot is empty, or
 * no route pattern matches the slot value. Returns a fully-interpolated
 * route entry (config has `{name}` substitutions resolved) when matched.
 * @param {*} region
 * @param {*} routesBlock
 */
export function useRouteForRegion( region, routesBlock ) {
	const url = useRoute();
	return useMemo( () => {
		const key = region?.routing?.[ 'route-key' ];
		if ( ! key ) {
			return null;
		}
		// Default resolution mode is `query` — the slot value comes
		// from the URL query parameter of the same name. Multi-app
		// layout regions (3c.4) opt into `mirror` so the slot value
		// is `@<key>/<primary>`, matching the compiler's
		// `@<slot>/<primary>` route synthesis.
		const mode = region?.routing?.mode || 'query';
		const slot = readSlot( url, key, mode );
		if ( ! slot ) {
			return null;
		}
		const matched = matchRoute( routesBlock || {}, slot );
		if ( ! matched ) {
			return null;
		}
		return {
			...matched,
			config: interpolate( matched.config, matched.params ),
		};
	}, [ region, routesBlock, url ] );
}

/**
 * Programmatic navigation. Pass a single href string:
 *   navigate('#/posts')
 *   navigate('/posts')
 *   navigate('?detail=' + encodeURIComponent('/posts/42/edit'))
 *
 * @param {string} href
 */
export function navigate( href ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	if ( typeof href !== 'string' ) {
		return;
	}
	if ( href.startsWith( '#' ) ) {
		window.location.hash = href;
		return;
	}
	if ( href.startsWith( '?' ) ) {
		// Query-only nav: preserve current primary path.
		const current = parseHash( window.location.hash );
		const next = '#' + ( current.primary || '' ) + href;
		window.location.hash = next;
		return;
	}
	if ( href.startsWith( '/' ) ) {
		window.location.hash = '#' + href;
		return;
	}
	// Bare slug (e.g. `posts`): treat as a root-relative path.
	window.location.hash = '#/' + href;
}

export function navigateRoute( route ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	const trimmed = String( route ).replace( /^#?\/?/, '' );
	window.location.hash = '#/' + trimmed;
}

/**
 * Decompose a URL hash into both the v2 shape (primary + params) and
 * the legacy v1 shape (appId + segments). v1 shells consume appId +
 * segments; v2 shells consume primary + params via useRouteForRegion.
 * @param {*} hash
 */
function decompose( hash ) {
	const v2 = parseHash( hash );
	const segments = ( v2.primary || '' )
		.replace( /^\//, '' )
		.split( '/' )
		.filter( Boolean );
	return {
		primary: v2.primary,
		params: v2.params,
		hash: hash || '',
		appId: segments[ 0 ] || null,
		segments: segments.slice( 1 ),
	};
}
