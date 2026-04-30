import { createContext, useState, useEffect, useContext } from '@wordpress/element';

/**
 * v1 hash router.
 *
 * Public surface:
 *   - <RouterProvider>            — listens to hashchange, exposes parsed route.
 *   - useRoute()                   — { appId, segments, hash }.
 *   - navigate(appId, ...segs)     — sets the hash. (Backwards-compatible signature.)
 *   - navigateRoute(route)         — sets the hash to a literal route string.
 *
 * The router parses `#/<appId>/<segments...>`. The first path segment is
 * the routable app id; remaining segments are forwarded to the app via
 * `segments`. This matches the MVP's v0 hash format so existing in-app
 * links keep working.
 *
 * Multi-routable regions are explicitly out of scope for v1 (master spec
 * §6.2 v2 item). The router places the matched app into the single active
 * routable region.
 */

const RouteContext = createContext( {
	appId: null,
	segments: [],
	hash: '',
} );

export function RouterProvider( { children } ) {
	const [ hash, setHash ] = useState(
		typeof window !== 'undefined' ? window.location.hash : ''
	);

	useEffect( () => {
		const handler = () => setHash( window.location.hash );
		window.addEventListener( 'hashchange', handler );
		return () => window.removeEventListener( 'hashchange', handler );
	}, [] );

	const parsed = parseHash( hash );

	return (
		<RouteContext.Provider value={ parsed }>
			{ children }
		</RouteContext.Provider>
	);
}

export function useRoute() {
	return useContext( RouteContext );
}

export function navigate( appId, ...segments ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	window.location.hash = '#/' + [ appId, ...segments ].filter( Boolean ).join( '/' );
}

export function navigateRoute( route ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	const trimmed = String( route ).replace( /^#?\/?/, '' );
	window.location.hash = '#/' + trimmed;
}

function parseHash( hash ) {
	const segments = String( hash || '' )
		.replace( /^#\/?/, '' )
		.split( '/' )
		.filter( Boolean );
	return {
		appId: segments[ 0 ] || null,
		segments: segments.slice( 1 ),
		hash: hash || '',
	};
}
