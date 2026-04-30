import apiFetch from '@wordpress/api-fetch';
import { dispatch } from '@wordpress/data';
import { STORE_NAME, ensureSelectionStore } from './store';

ensureSelectionStore();

/**
 * Persisted-scope bridge: the selection bus stores in-memory; opt-in
 * `persist: true` scopes round-trip through `wp_admin_shell_user_prefs[selection]`
 * via a small dedicated REST endpoint:
 *
 *   GET  /wp-admin-shell/v1/selection         — bulk fetch (all scopes for current user)
 *   POST /wp-admin-shell/v1/selection/{scope} — write a single scope
 *   DEL  /wp-admin-shell/v1/selection/{scope} — clear a single scope
 *
 * The cascade (M2) reads the same user-meta key for diagnostics; the
 * runtime's high-frequency reads/writes go through this endpoint to
 * bypass cascade resolution overhead.
 */

const BASE = '/wp-admin-shell/v1/selection';

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function devWarn( label, err ) {
	if ( ! IS_DEV ) {
		return;
	}
	// eslint-disable-next-line no-console
	console.warn( `wp-admin-shell selection bus: ${ label }`, err );
}

let bootstrapped = false;

export async function bootstrapSelections() {
	if ( bootstrapped ) {
		return;
	}
	bootstrapped = true;
	try {
		const result = await apiFetch( { path: BASE } );
		if ( ! result || typeof result !== 'object' ) {
			return;
		}
		const byScope = {};
		Object.entries( result ).forEach( ( [ scope, value ] ) => {
			byScope[ scope ] = {
				value,
				persist: true,
				updatedAt: Date.now(),
			};
		} );
		dispatch( STORE_NAME ).hydrateSelection( byScope );
	} catch ( err ) {
		// Endpoint absence (pre-M1 install) or auth failure should never
		// block shell mount. Silent failure is acceptable here — the
		// in-memory bus continues to work for ephemeral scopes. Dev mode
		// surfaces the cause for debugging.
		devWarn( 'bootstrap fetch failed', err );
	}
}

export async function writeSelection( scope, value ) {
	if ( ! scope ) {
		return;
	}
	try {
		await apiFetch( {
			path: `${ BASE }/${ encodeURIComponent( scope ) }`,
			method: 'POST',
			data: { value },
		} );
	} catch ( err ) {
		// Best-effort: persistence failures don't break the in-memory bus.
		devWarn( `write '${ scope }' failed`, err );
	}
}

export async function clearPersistedSelection( scope ) {
	if ( ! scope ) {
		return;
	}
	try {
		await apiFetch( {
			path: `${ BASE }/${ encodeURIComponent( scope ) }`,
			method: 'DELETE',
		} );
	} catch ( err ) {
		// Same logic as writeSelection.
		devWarn( `delete '${ scope }' failed`, err );
	}
}
