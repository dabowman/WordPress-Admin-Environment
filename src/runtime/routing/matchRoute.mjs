/**
 * URL route primitives (V2.M3 task 2 + 5).
 *
 * Spec §6.2: admin.json's `routes` block maps URL patterns to app +
 * config tuples. The runtime decomposes the URL, looks up each region's
 * `routing.route-key` slot value, and matches that value against the
 * routes block. Pattern syntax:
 *   - Static segment:    /posts        matches /posts exactly
 *   - Param segment:     /posts/{id}   matches /posts/42, captures id=42
 *   - Wildcard suffix:   /media/*      matches /media/anything/here
 *
 * Pattern resolution is most-specific-wins: `/posts/new` beats
 * `/posts/{id}` for `/posts/new`. "Specific" means literal segments
 * outweigh parameter segments; longer literal-prefix wins ties. The
 * scoring matches the PHP resolver in `WP_Admin_Shell_Manifest_Resolver`.
 *
 * Spec §6.3: route configs may reference captured params via `{name}`
 * curly braces. `interpolate(config, params)` substitutes string values
 * containing `{name}` in place. Substitution is lexical — the value is
 * replaced as-is, no type coercion (the app's `config-schema` handles
 * coercion downstream).
 *
 * Pure ESM. No DOM, no React, no PHP. Imported by the router and tests.
 */

const PARAM_RE = /\{([a-z][a-z0-9-]*)\}/g;
const PATTERN_VALID_RE = /^\/[A-Za-z0-9_/{}\-*]*$/;

export function isValidRoutePattern( pattern ) {
	return typeof pattern === 'string' && PATTERN_VALID_RE.test( pattern );
}

/**
 * Match `value` against `pattern`. Returns `{ params }` on success,
 * `null` on no match. `value` is the URL slot value (e.g. `/posts/42`),
 * not the URL itself.
 */
export function matchPattern( pattern, value ) {
	if ( ! isValidRoutePattern( pattern ) || typeof value !== 'string' ) {
		return null;
	}
	const paramNames = [];
	let regexBody = pattern.replace( PARAM_RE, ( _, name ) => {
		paramNames.push( name );
		return '__WPAS_PARAM__';
	} );

	regexBody = regexBody.replace( /[.+?^$()|[\]\\*]/g, '\\$&' );
	regexBody = regexBody.replace( /__WPAS_PARAM__/g, '([^/]+)' );

	if ( regexBody.endsWith( '/\\*' ) ) {
		regexBody = regexBody.slice( 0, -3 ) + '/(.*)';
		paramNames.push( '*' );
	}

	const re = new RegExp( '^' + regexBody + '$' );
	const m = re.exec( value );
	if ( ! m ) {
		return null;
	}
	const params = {};
	for ( let i = 0; i < paramNames.length; i++ ) {
		params[ paramNames[ i ] ] = m[ i + 1 ] ?? '';
	}
	return { params };
}

/**
 * Score a pattern for most-specific-wins ordering. Higher = more
 * specific.
 *
 *   - Each literal (non-param, non-wildcard) segment: +10
 *   - Each parameter segment:                          +1
 *   - Wildcard suffix (`/*`):                          -1
 */
function specificity( pattern ) {
	const segments = pattern.split( '/' ).filter( Boolean );
	let score = 0;
	for ( const seg of segments ) {
		if ( seg === '*' ) {
			score -= 1;
		} else if ( seg.startsWith( '{' ) && seg.endsWith( '}' ) ) {
			score += 1;
		} else {
			score += 10;
		}
	}
	return score;
}

/**
 * Find the most-specific matching route entry for the slot `value`.
 *
 * @param {Object<string, {app:string, config?:object}>} routesBlock
 * @param {string} value URL slot value (e.g. `/posts`, `/posts/42`).
 * @return {{pattern:string, app:string, config:object, params:object}|null}
 */
export function matchRoute( routesBlock, value ) {
	if ( ! routesBlock || typeof routesBlock !== 'object' ) {
		return null;
	}
	if ( typeof value !== 'string' ) {
		return null;
	}

	let best = null;
	let bestScore = -Infinity;

	for ( const [ pattern, entry ] of Object.entries( routesBlock ) ) {
		const m = matchPattern( pattern, value );
		if ( ! m ) {
			continue;
		}
		const score = specificity( pattern );
		if ( score > bestScore ) {
			bestScore = score;
			best = {
				pattern,
				app: entry?.app || null,
				config: entry?.config || {},
				params: m.params,
			};
		}
	}

	return best;
}

/**
 * Replace `{name}` substrings in any string value of `config` with the
 * captured `params[name]`. Recurses into plain object/array values.
 * Other value types (numbers, booleans, null) pass through unchanged.
 *
 * Lexical replacement only: `{id}` in `"post-id": "{id}"` becomes the
 * literal captured string. The app's `config-schema` does any type
 * coercion downstream.
 */
export function interpolate( config, params ) {
	if ( ! params || typeof params !== 'object' ) {
		return config;
	}
	if ( typeof config === 'string' ) {
		return config.replace( PARAM_RE, ( whole, name ) =>
			Object.prototype.hasOwnProperty.call( params, name )
				? String( params[ name ] )
				: whole
		);
	}
	if ( Array.isArray( config ) ) {
		return config.map( ( v ) => interpolate( v, params ) );
	}
	if ( config && typeof config === 'object' ) {
		const out = {};
		for ( const [ k, v ] of Object.entries( config ) ) {
			out[ k ] = interpolate( v, params );
		}
		return out;
	}
	return config;
}

/**
 * Decompose a URL hash into its routable parts.
 *
 *   #/posts                         → { primary: '/posts', params: {} }
 *   #/posts?detail=%2Fposts%2F42    → { primary: '/posts',
 *                                       params: { detail: '/posts/42' } }
 *   #?detail=%2Fposts%2F42          → { primary: '',
 *                                       params: { detail: '/posts/42' } }
 *
 * Only single-level query parameters are honored; the standard URL
 * grammar does not nest. Param values are URL-decoded before return so
 * the matcher receives raw route slot values.
 */
export function parseHash( hash ) {
	const raw = String( hash || '' ).replace( /^#/, '' );
	const queryIdx = raw.indexOf( '?' );
	const path = queryIdx === -1 ? raw : raw.slice( 0, queryIdx );
	const query = queryIdx === -1 ? '' : raw.slice( queryIdx + 1 );

	const primary = path
		? ( path.startsWith( '/' ) ? path : '/' + path )
		: '';

	const params = {};
	if ( query ) {
		for ( const part of query.split( '&' ) ) {
			if ( ! part ) {
				continue;
			}
			const eq = part.indexOf( '=' );
			const key = eq === -1 ? part : part.slice( 0, eq );
			const val = eq === -1 ? '' : part.slice( eq + 1 );
			try {
				params[ decodeURIComponent( key ) ] = decodeURIComponent( val );
			} catch {
				params[ key ] = val;
			}
		}
	}

	return { primary, params };
}

/**
 * Read the URL slot value addressed by a region's `routing.route-key`.
 *
 *   route-key === '_self' → URL primary path
 *   any other key         → URL query parameter of the same name
 *
 * Returns an empty string when the slot is unset; the matcher will then
 * return null (no route).
 */
export function readSlot( parsedUrl, routeKey ) {
	if ( ! parsedUrl ) {
		return '';
	}
	if ( routeKey === '_self' ) {
		return parsedUrl.primary || '';
	}
	if ( ! routeKey ) {
		return '';
	}
	return parsedUrl.params?.[ routeKey ] || '';
}
