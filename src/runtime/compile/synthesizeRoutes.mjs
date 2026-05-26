import { translateIframeRef } from './translateIframeRef.mjs';

/**
 * Extract the primary app from a screen (shorthand `app` or long-form
 * `apps[0]`).
 *
 * @param {Object} screen Resolved screen entry.
 * @return {{app: string, config: Object}|null} Primary app + config, or null.
 */
export function primaryApp( screen ) {
	if ( ! screen || typeof screen !== 'object' ) {
		return null;
	}
	// Shorthand: screen.app + screen.config.
	if ( typeof screen.app === 'string' && screen.app !== '' ) {
		return {
			app: screen.app,
			config:
				screen.config && typeof screen.config === 'object'
					? screen.config
					: {},
		};
	}
	// Long form: first entry of apps[].
	if ( Array.isArray( screen.apps ) && screen.apps.length > 0 ) {
		const first = screen.apps[ 0 ];
		if (
			first &&
			typeof first === 'object' &&
			typeof first.app === 'string' &&
			first.app !== ''
		) {
			return {
				app: first.app,
				config:
					first.config && typeof first.config === 'object'
						? first.config
						: {},
			};
		}
	}
	return null;
}

/**
 * Synthesize the `routes` block from the v3 `screens` map.
 *
 * Each screen with a `path` (or a non-`_self` `slot`) becomes a route
 * entry, with the screen id injected into the config as `screenId`.
 * `_self`-slotted screens key on their `path`; other slots key under a
 * `@<slot>/<path>` namespace the kernel router reads via
 * `routing.route-key`. Non-primary `apps[]` entries that declare a `slot`
 * each emit their own slot-namespaced route so engine peer regions
 * (`detail`, `inspector`, …) can mount them; slot-less peers are
 * app-internal compositions (e.g. dashboard widgets) and get no route.
 *
 * `iframe:<slug>` app refs are rewritten to `core:iframe-fallback` here.
 * Existing route entries (the v3 `routes` escape hatch, plus admin-route
 * shim contributions) win on collision.
 *
 * @param {Object} screens        Resolved screens block.
 * @param {Object} existingRoutes Author-declared / contributed routes.
 * @return {Object} The synthesized routes block.
 */
export function synthesizeRoutes( screens, existingRoutes = {} ) {
	const routes = { ...( existingRoutes || {} ) };

	for ( const [ screenId, screen ] of Object.entries( screens || {} ) ) {
		if ( ! screen || typeof screen !== 'object' ) {
			continue;
		}
		const path =
			typeof screen.path === 'string' && screen.path !== ''
				? screen.path
				: '';
		const slot =
			typeof screen.slot === 'string' && screen.slot !== ''
				? screen.slot
				: '_self';

		// No path AND default slot → nothing to route.
		if ( path === '' && slot === '_self' ) {
			continue;
		}

		const primary = primaryApp( screen );
		if ( primary === null ) {
			continue;
		}

		// Canonical primary-route key — shared across the `_self`, slot,
		// and multi-app peer branches so each derives the same value.
		const primaryRouteKey = path !== '' ? path : '/' + screenId;

		const routeEntry = translateIframeRef( {
			app: primary.app,
			config: { ...primary.config, screenId: String( screenId ) },
		} );

		if ( slot === '_self' ) {
			if ( ! ( primaryRouteKey in routes ) ) {
				routes[ primaryRouteKey ] = routeEntry;
			}
		} else {
			const slotKey =
				'@' + slot + '/' + primaryRouteKey.replace( /^\/+/, '' );
			if ( ! ( slotKey in routes ) ) {
				routes[ slotKey ] = routeEntry;
			}
		}

		// Multi-app layout — every `apps[]` entry after the primary that
		// declares a `slot` gets a slot-namespaced route. Slot-less peers
		// are app-internal compositions (dashboard widgets) — no route.
		if ( Array.isArray( screen.apps ) ) {
			for ( let i = 1; i < screen.apps.length; i++ ) {
				const entry = screen.apps[ i ];
				if ( ! entry || typeof entry !== 'object' ) {
					continue;
				}
				const entrySlot =
					typeof entry.slot === 'string' && entry.slot !== ''
						? entry.slot
						: '';
				const entryApp =
					typeof entry.app === 'string' ? entry.app : '';
				if ( entrySlot === '' || entryApp === '' ) {
					continue;
				}
				// `_self` on a peer would clobber the primary; guard.
				if ( entrySlot === '_self' ) {
					continue;
				}
				const entryConfig =
					entry.config && typeof entry.config === 'object'
						? entry.config
						: {};
				const slotRouteKey =
					'@' +
					entrySlot +
					'/' +
					primaryRouteKey.replace( /^\/+/, '' );
				if ( ! ( slotRouteKey in routes ) ) {
					routes[ slotRouteKey ] = translateIframeRef( {
						app: entryApp,
						config: {
							...entryConfig,
							screenId: String( screenId ),
						},
					} );
				}
			}
		}
	}

	return routes;
}
