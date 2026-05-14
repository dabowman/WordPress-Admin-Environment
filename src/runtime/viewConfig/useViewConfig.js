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
 * Tries the inline `window.wpAdminShell.config.viewConfigs` snapshot
 * synchronously; falls through to `/wp-admin-shell/v1/view-config` for
 * triples registered after page load.
 *
 * Returns `{ config, isLoading }`. The cascade always supplies a config
 * (admin.json declaration → manifest baseline → empty object).
 *
 * @param {string}      kind    Entity kind (`postType`, `root`, `taxonomy`).
 * @param {string}      name    Entity name (`post`, `user`, `comment`).
 * @param {string|null} variant Variant id, or null for base.
 */
export function useViewConfig( kind, name, variant = null ) {
	// `_default` is the in-tree base sentinel — not a user variant. Normalize.
	const normalizedVariant = variant === '_default' ? null : variant;
	const key = cacheKey( kind, name, normalizedVariant );

	const initial = useMemo(
		() => readInline( key, kind, name, normalizedVariant ),
		[ key, kind, name, normalizedVariant ]
	);

	const [ doc, setDoc ] = useState( initial );
	const [ isLoading, setIsLoading ] = useState( initial === null );

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
			fetchViewConfig( kind, name, normalizedVariant ).finally( () => {
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
				// Don't cache empty on error — let next render retry.
				setDoc( {} );
				setIsLoading( false );
			} );

		return () => {
			cancelled = true;
		};
	}, [ key, kind, name, normalizedVariant, initial ] );

	return { config: doc ?? {}, isLoading };
}

/**
 * Test helper — clear the module cache.
 */
export function _resetViewConfigCache() {
	cache.clear();
	inflight.clear();
}
