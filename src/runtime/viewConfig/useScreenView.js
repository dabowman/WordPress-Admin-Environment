import { useEffect, useMemo, useState } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';
import { addQueryArgs } from '@wordpress/url';
import { hydrateInlineScreenView } from './hydrateInline.mjs';

/**
 * Module-level cache for resolved screen-view docs. Keyed by screen id.
 * Survives across hook mounts so a second consumer of the same screen
 * hits memory.
 */
const cache = new Map();
const inflight = new Map();

/**
 * @param {string} screenId
 */
async function fetchScreenView( screenId ) {
	const path = addQueryArgs( '/wp-admin-shell/v1/screen-view', {
		screen: screenId,
	} );
	const response = await apiFetch( { path } );
	return response?.view ?? {};
}

/**
 * @param {string} screenId
 */
function readInline( screenId ) {
	if ( cache.has( screenId ) ) {
		return cache.get( screenId );
	}
	const hydrated = hydrateInlineScreenView(
		typeof window !== 'undefined' ? window.wpAdminShell?.config : null,
		screenId
	);
	if ( hydrated ) {
		cache.set( screenId, hydrated );
		return hydrated;
	}
	return null;
}

/**
 * useScreenView — read the resolved view doc for a workspace screen.
 *
 * v3's per-screen replacement for the v2 `useViewConfig(kind, name,
 * variant)` triple lookup. Each screen now carries its own resolved view
 * (global `settings.views.<kind>.<name>` + optional `screens.<id>.view`
 * deep-merge overlay); the kernel resolves it once at boot and stamps
 * the result back into the inline `window.wpAdminShell.config` snapshot.
 *
 * Hot path: synchronous read from the snapshot. Falls through to
 * `/wp-admin-shell/v1/screen-view?screen=<id>` for late-registered
 * screens (e.g. plugin code that adds screens after boot).
 *
 * @param {string} screenId           Screen id.
 * @param {Object} [options]
 * @param {Object} [options.fallback] Default view doc returned
 *                                    when neither the snapshot
 *                                    nor the REST fallback
 *                                    yields a doc (e.g. screen
 *                                    id passed but undefined,
 *                                    or REST fails). Empty
 *                                    object by default.
 * @return {{ config: Object, isLoading: boolean }} Resolved view doc + loading flag — `config` is the per-screen merged doc; `isLoading` is true while the REST fallback is in flight.
 */
export function useScreenView( screenId, { fallback } = {} ) {
	const fallbackDoc = fallback || {};
	const usableId =
		typeof screenId === 'string' && screenId !== '' ? screenId : null;

	const initial = useMemo(
		() => ( usableId ? readInline( usableId ) : null ),
		[ usableId ]
	);

	const [ doc, setDoc ] = useState( initial );
	const [ isLoading, setIsLoading ] = useState(
		usableId !== null && initial === null
	);

	useEffect( () => {
		setDoc( initial );
		setIsLoading( usableId !== null && initial === null );
	}, [ usableId, initial ] );

	useEffect( () => {
		if ( ! usableId || initial !== null ) {
			return;
		}
		let cancelled = false;

		const pending =
			inflight.get( usableId ) ||
			fetchScreenView( usableId ).finally( () => {
				inflight.delete( usableId );
			} );
		inflight.set( usableId, pending );

		pending
			.then( ( resolved ) => {
				if ( cancelled ) {
					return;
				}
				cache.set( usableId, resolved );
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
	}, [ usableId, initial ] );

	return { config: doc ?? fallbackDoc, isLoading };
}

/**
 * Test helper — clear the module cache.
 */
export function _resetScreenViewCache() {
	cache.clear();
	inflight.clear();
}
