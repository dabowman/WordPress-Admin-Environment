import apiFetch from '@wordpress/api-fetch';

/**
 * Programmatic shell-switching plumbing (plan §M5.8).
 *
 * v1 ships the plumbing without a user-facing toggle per spec §6.4.1:
 *
 *   1. Caller invokes `switchShell(slug)`.
 *   2. Function writes `wp_admin_shell_active_shell` via the core
 *      settings REST (option is registered with show_in_rest).
 *   3. Cache invalidation runs server-side via the
 *      `update_option_wp_admin_shell_active_shell` hook the cache
 *      class registered in M2.7.
 *   4. The page reloads. The browser preserves the URL hash, so the
 *      route the user was on survives the switch when the new shell
 *      registers a matching app id.
 *
 * v2 will surface a switcher inside `core:appearance` and add a
 * mid-session in-place re-mount path that re-builds the registry's
 * region tree without a hard reload.
 *
 * Exposed on `window.wpAdminShell.switchShell` so custom shell code
 * (and the `core:command-picker` integration) can call it.
 */

export async function switchShell( slug ) {
	if ( ! slug || typeof slug !== 'string' ) {
		throw new Error( 'switchShell: slug must be a non-empty string' );
	}
	await apiFetch( {
		path: '/wp/v2/settings',
		method: 'POST',
		data: { wp_admin_shell_active_shell: slug },
	} );

	if ( typeof window !== 'undefined' ) {
		// Hash survives reload, so the active route is preserved when
		// the new shell carries an app of the same id.
		window.location.reload();
	}
}

export function attachShellSwitcherToWindow() {
	if ( typeof window === 'undefined' ) {
		return;
	}
	window.wpAdminShell = window.wpAdminShell || {};
	window.wpAdminShell.switchShell = switchShell;
}
