import { useEffect, useMemo, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';
import { hydrateInlineViewConfig } from './hydrateInline.mjs';

/**
 * Module-level cache for resolved view-configs. Keyed by
 * `${kind}/${name}/${variant ?? '_default'}`. Survives across hook
 * mounts so a second consumer of the same triple hits memory.
 */
const cache = new Map();
const inflight = new Map();

function cacheKey( kind, name, variant ) {
	return `${ kind }/${ name }/${ variant ?? '_default' }`;
}

/**
 * @param {string}      kind
 * @param {string}      name
 * @param {string|null} variant
 */
async function fetchViewConfig( kind, name, variant ) {
	const path = addQueryArgs( '/wp-admin-shell/v1/view-config', {
		kind,
		name,
		...( variant ? { variant } : {} ),
	} );
	const response = await apiFetch( { path } );
	return response?.config ?? {};
}

/**
 * Resolve the inline-snapshot doc for a triple, caching the result
 * module-side. Reads `window.wpAdminShell.config` lazily so tests can
 * mutate the snapshot between calls.
 *
 * @param {string}      key
 * @param {string}      kind
 * @param {string}      name
 * @param {string|null} variant
 */
function readInline( key, kind, name, variant ) {
	if ( cache.has( key ) ) {
		return cache.get( key );
	}
	const hydrated = hydrateInlineViewConfig(
		typeof window !== 'undefined' ? window.wpAdminShell?.config : null,
		kind,
		name,
		variant
	);
	if ( hydrated ) {
		cache.set( key, hydrated );
		return hydrated;
	}
	return null;
}

/**
 * useViewConfig — read the resolved view-config for an entity triple.
 *
 * Reads the cascade-resolved + filter-finalized doc for `(kind, name, variant?)`.
 * On every triple change, attempts a synchronous read from the inline
 * `window.wpAdminShell.config.viewConfigs` snapshot. If the triple
 * isn't pre-serialized (registered after page load, dynamic filter
 * output that depends on REST context, etc.), falls through to a
 * `/wp-admin-shell/v1/view-config` fetch.
 *
 * Triples can change on the same hook instance (e.g. a generic
 * entity-list app rebinds `postType` from `post` to `page`). The hook
 * resyncs `doc` whenever the cache key changes — no stale state.
 *
 * The consuming app supplies a `fallback` arg — its baked-in inline
 * view-config — used when the cascade has no entry for the triple.
 * This makes migration opt-in per app: PostsApp can read via the
 * hook from day one while still rendering correctly if a site hasn't
 * declared `viewConfigs.postType.post._default`.
 *
 * Returns: `{ config, isLoading }`. `config` is always an object;
 * empty when the triple is unknown and no `fallback` is provided.
 *
 * @param {string}      kind             Entity kind (`postType`, `root`, `taxonomy`).
 * @param {string}      name             Entity name (`post`, `user`, `comment`).
 * @param {string|null} variant          Variant id, or null for base.
 * @param {Object}      options
 * @param {Object}      options.fallback App-shipped fallback view-config.
 */
export function useViewConfig( kind, name, variant = null, options = {} ) {
	const { fallback = null } = options;
	const key = cacheKey( kind, name, variant );

	const initial = useMemo(
		() => readInline( key, kind, name, variant ),
		[ key, kind, name, variant ]
	);

	const [ doc, setDoc ] = useState( initial );
	const [ isLoading, setIsLoading ] = useState( initial === null );

	// Resync local state when the triple changes on the same hook
	// instance. Without this, the second triple's render reads the
	// first triple's `doc` until the REST fallback resolves (or
	// indefinitely when the second triple has an inline hit).
	useEffect( () => {
		setDoc( initial );
		setIsLoading( initial === null );
	}, [ key, initial ] );

	useEffect( () => {
		if ( initial !== null ) {
			return;
		}
		let cancelled = false;

		const pending =
			inflight.get( key ) ||
			fetchViewConfig( kind, name, variant ).finally( () => {
				inflight.delete( key );
			} );
		inflight.set( key, pending );

		pending
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
				cache.set( key, {} );
				setDoc( {} );
				setIsLoading( false );
			} );

		return () => {
			cancelled = true;
		};
	}, [ key, kind, name, variant, initial ] );

	const config = useMemo( () => {
		if ( doc && Object.keys( doc ).length > 0 ) {
			return doc;
		}
		return fallback ?? {};
	}, [ doc, fallback ] );

	return { config, isLoading };
}

/**
 * Test helper — clear the module cache.
 */
export function _resetViewConfigCache() {
	cache.clear();
	inflight.clear();
}
