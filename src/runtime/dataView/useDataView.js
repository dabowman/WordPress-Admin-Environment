import { useEffect, useMemo, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';
import {
	hydrateInlineScreenDataView,
	hydrateInlineDataViewTriple,
} from './hydrateInline.mjs';

/**
 * Module-level cache for resolved DataView docs. Keyed independently
 * for screen lookups (`screen:<id>`) and triple lookups
 * (`triple:<kind>/<name>/<variant>`) so the two access paths never
 * collide. Survives across hook mounts.
 */
const cache = new Map();
const inflight = new Map();

/**
 * Build the cache key for a screen-keyed lookup.
 * @param {string} screenId
 */
function screenKey( screenId ) {
	return `screen:${ screenId }`;
}

/**
 * Build the cache key for a triple-keyed lookup.
 * @param {string} kind
 * @param {string} name
 * @param {string} variant
 */
function tripleKey( kind, name, variant ) {
	return `triple:${ kind }/${ name }/${ variant }`;
}

/**
 * Fetch the resolved doc for a screen via REST.
 * @param {string} screenId
 */
async function fetchScreenDataView( screenId ) {
	const path = addQueryArgs( '/wp-admin-shell/v1/data-view', {
		screen: screenId,
	} );
	const response = await apiFetch( { path } );
	// REST returns `{ view, kind, name, variant }`; the consumer wants `view`.
	return response?.view ?? {};
}

/**
 * Fetch the resolved doc for a (kind, name, variant) triple via REST.
 * @param {string} kind
 * @param {string} name
 * @param {string} variant
 */
async function fetchDataViewTriple( kind, name, variant ) {
	const path = addQueryArgs( '/wp-admin-shell/v1/data-view', {
		kind,
		name,
		variant,
	} );
	const response = await apiFetch( { path } );
	return response?.view ?? {};
}

/**
 * Synchronously read the screen's resolved doc from the inline snapshot.
 * @param {string} screenId
 */
function readInlineScreen( screenId ) {
	const key = screenKey( screenId );
	if ( cache.has( key ) ) {
		return cache.get( key );
	}
	const hydrated = hydrateInlineScreenDataView(
		typeof window !== 'undefined' ? window.wpAdminShell?.config : null,
		screenId
	);
	if ( hydrated ) {
		cache.set( key, hydrated );
		return hydrated;
	}
	return null;
}

/**
 * Synchronously read the triple's resolved doc from the inline snapshot.
 * @param {string} kind
 * @param {string} name
 * @param {string} variant
 */
function readInlineTriple( kind, name, variant ) {
	const key = tripleKey( kind, name, variant );
	if ( cache.has( key ) ) {
		return cache.get( key );
	}
	const inline =
		typeof window !== 'undefined' ? window.wpAdminShell?.config : null;
	if ( ! inline ) {
		return null;
	}
	const hydrated = hydrateInlineDataViewTriple( inline, kind, name, variant );
	if ( hydrated && Object.keys( hydrated ).length > 0 ) {
		cache.set( key, hydrated );
		return hydrated;
	}
	return null;
}

/**
 * useDataView — read the resolved DataView doc for a workspace screen
 * OR for a registry triple. Overloaded.
 *
 * - `useDataView( 'posts-drafts' )` — screen-keyed lookup. Walks the
 *   screen's `dataViewRef` / explicit `dataView*` fields / manifest
 *   inference, resolves the triple, layers the screen's inline
 *   `dataView` overlay on top.
 * - `useDataView( { kind: 'postType', name: 'post', variant: 'drafts' } )` —
 *   triple-keyed lookup. Hits `settings.dataViews[kind][name][variant]`
 *   directly with `extends` chain + `fieldsRef` resolution. Restores
 *   the v2 `useViewConfig` entry point.
 *
 * Hot path: synchronous read from `window.wpAdminShell.config`. Falls
 * through to `/wp-admin-shell/v1/data-view?screen=<id>` or
 * `/wp-admin-shell/v1/data-view?kind=X&name=Y&variant=Z` when the
 * snapshot doesn't carry the requested entry.
 *
 * @param {string|{kind:string,name:string,variant?:string}} arg                Screen id (string) or triple object.
 * @param {Object}                                           [options]
 * @param {Object}                                           [options.fallback] Default doc when nothing resolves.
 * @return {{ config: Object, isLoading: boolean }} Resolved DataView doc + loading flag.
 */
export function useDataView( arg, { fallback } = {} ) {
	const fallbackDoc = fallback || {};
	const shape = parseArg( arg );

	const initial = useMemo( () => {
		if ( ! shape ) {
			return null;
		}
		if ( shape.kind === 'screen' ) {
			return readInlineScreen( shape.id );
		}
		return readInlineTriple( shape.k, shape.n, shape.v );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ shape ? shape.cacheKey : null ] );

	const [ doc, setDoc ] = useState( initial );
	const [ isLoading, setIsLoading ] = useState(
		shape !== null && initial === null
	);

	useEffect( () => {
		setDoc( initial );
		setIsLoading( shape !== null && initial === null );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ shape ? shape.cacheKey : null, initial ] );

	useEffect( () => {
		if ( ! shape || initial !== null ) {
			return;
		}
		let cancelled = false;
		const key = shape.cacheKey;
		const promise =
			inflight.get( key ) ||
			( shape.kind === 'screen'
				? fetchScreenDataView( shape.id )
				: fetchDataViewTriple( shape.k, shape.n, shape.v )
			).finally( () => {
				inflight.delete( key );
			} );
		inflight.set( key, promise );

		promise
			.then( ( resolved ) => {
				if ( cancelled ) {
					return;
				}
				cache.set( key, resolved );
				setDoc( resolved );
				setIsLoading( false );
			} )
			.catch( () => {
				if ( cancelled ) {
					return;
				}
				// Don't cache empty on error — let next render retry.
				setDoc( {} );
				setIsLoading( false );
			} );

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ shape ? shape.cacheKey : null, initial ] );

	return { config: doc ?? fallbackDoc, isLoading };
}

/**
 * Normalize the call argument into a `{ kind, cacheKey, ... }` shape so
 * downstream React state can key off a stable string. Returns `null` for
 * unusable input (an empty / unrecognized arg should not trigger any
 * lookup or REST call).
 *
 * @param {*} arg
 * @return {Object|null} Normalized shape (`{kind, cacheKey, ...}`) or `null` for unusable input.
 */
function parseArg( arg ) {
	if ( typeof arg === 'string' ) {
		if ( arg === '' ) {
			return null;
		}
		return { kind: 'screen', id: arg, cacheKey: screenKey( arg ) };
	}
	if ( arg && typeof arg === 'object' ) {
		const k = typeof arg.kind === 'string' ? arg.kind : '';
		const n = typeof arg.name === 'string' ? arg.name : '';
		if ( ! k || ! n ) {
			devError(
				'useDataView({kind,name,variant?}) requires non-empty `kind` and `name` strings.'
			);
			return null;
		}
		const v =
			typeof arg.variant === 'string' && arg.variant !== ''
				? arg.variant
				: '_default';
		return {
			kind: 'triple',
			k,
			n,
			v,
			cacheKey: tripleKey( k, n, v ),
		};
	}
	if ( arg !== null && arg !== undefined ) {
		devError(
			'useDataView( arg ) expects a string screen id or `{kind, name, variant?}` object.'
		);
	}
	return null;
}

/**
 * Dev-only console.error. Silenced in production to honor the brief's
 * "don't throw at runtime in production" guidance.
 * @param {string} message
 */
function devError( message ) {
	if (
		typeof process === 'undefined' ||
		process?.env?.NODE_ENV === 'production'
	) {
		return;
	}
	if ( typeof console === 'undefined' ) {
		return;
	}
	// eslint-disable-next-line no-console
	console.error( message );
}

/**
 * Test helper — clear the module cache.
 */
export function _resetDataViewCache() {
	cache.clear();
	inflight.clear();
}

/**
 * Deprecation shim — v2 hook name. Removed in v3.1.0. Re-exports
 * `useDataView` with a one-shot dev `console.warn`. Production builds
 * are silent. Internal callers should use `useDataView` directly.
 *
 * @deprecated Use `useDataView` instead. Removed in v3.1.
 * @param {string|Object} arg
 * @param {Object}        [options]
 * @return {{ config: Object, isLoading: boolean }}
 */
let warnedUseScreenView = false;
export function useScreenView( arg, options ) {
	if (
		typeof process === 'undefined' ||
		process?.env?.NODE_ENV !== 'production'
	) {
		if ( ! warnedUseScreenView && typeof console !== 'undefined' ) {
			warnedUseScreenView = true;
			// eslint-disable-next-line no-console
			console.warn(
				'useScreenView is deprecated and will be removed in v3.1. Use useDataView from @wp-admin-shell/runtime/dataView/useDataView instead.'
			);
		}
	}
	return useDataView( arg, options );
}

/**
 * Deprecation shim — v2 hook name. Removed in v3.1.0. Identical to
 * `useDataView`; the v2 surface accepted `(kind, name, variant?)` so
 * callers using that positional shape are forwarded into the new
 * `({kind,name,variant})` object form here.
 *
 * @deprecated Use `useDataView` instead. Removed in v3.1.
 * @param {string|Object} kindOrArg
 * @param {string}        [name]
 * @param {string}        [variant]
 * @param {Object}        [options]
 * @return {{ config: Object, isLoading: boolean }}
 */
let warnedUseViewConfig = false;
export function useViewConfig( kindOrArg, name, variant, options ) {
	if (
		typeof process === 'undefined' ||
		process?.env?.NODE_ENV !== 'production'
	) {
		if ( ! warnedUseViewConfig && typeof console !== 'undefined' ) {
			warnedUseViewConfig = true;
			// eslint-disable-next-line no-console
			console.warn(
				'useViewConfig is deprecated and will be removed in v3.1. Use useDataView from @wp-admin-shell/runtime/dataView/useDataView instead.'
			);
		}
	}
	// Normalize call shape outside the hook call so React's rules-of-hooks
	// holds (useDataView is always called once, with a stable arg).
	let normalizedArg;
	let normalizedOptions;
	if ( typeof kindOrArg === 'string' && typeof name === 'string' ) {
		normalizedArg = { kind: kindOrArg, name, variant };
		normalizedOptions = options;
	} else {
		normalizedArg = kindOrArg;
		normalizedOptions = name;
	}
	return useDataView( normalizedArg, normalizedOptions );
}
