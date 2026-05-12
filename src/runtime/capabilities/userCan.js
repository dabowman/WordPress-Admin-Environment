import apiFetch from '@wordpress/api-fetch';

/**
 * userCan — synchronous capability check.
 *
 * Reads from the pre-computed map at `window.wpAdminShell.capabilities`
 * which the PHP enqueue layer populates by walking the resolved config
 * for every declared `capability` field plus the built-in source floors.
 *
 * Returns `true` for caps not in the map — the runtime renders
 * optimistically; the REST API is the authority. This matches spec §8
 * layer 4: shell UI checks are advisory; core-data's 403 responses
 * surface as inline errors in the consuming app.
 *
 * For caps the runtime can't pre-compute (plugin-driven, dynamic, etc.),
 * use `checkCan(cap)` async — it goes through /wp-admin-shell/v1/can/{cap}.
 * @param {*} capability
 */
export function userCan( capability ) {
	if ( ! capability || typeof capability !== 'string' ) {
		return true;
	}
	const map = window.wpAdminShell?.capabilities;
	if ( ! map || ! ( capability in map ) ) {
		return true;
	}
	return !! map[ capability ];
}

const cache = new Map();

export async function checkCan( capability ) {
	if ( ! capability ) {
		return true;
	}
	if ( cache.has( capability ) ) {
		return cache.get( capability );
	}
	if (
		window.wpAdminShell?.capabilities &&
		capability in window.wpAdminShell.capabilities
	) {
		const result = !! window.wpAdminShell.capabilities[ capability ];
		cache.set( capability, result );
		return result;
	}
	try {
		const response = await apiFetch( {
			path: `/wp-admin-shell/v1/can/${ encodeURIComponent(
				capability
			) }`,
		} );
		const allowed = !! response?.can;
		cache.set( capability, allowed );
		return allowed;
	} catch {
		// Treat fetch failure as "no" — the REST API will return 403 if
		// the user really lacks the cap, and the consuming app surfaces
		// that error inline.
		cache.set( capability, false );
		return false;
	}
}

/**
 * Test helper — reset the in-memory cache. Plugin code shouldn't need
 * this; tests do.
 */
export function _resetCanCache() {
	cache.clear();
}
