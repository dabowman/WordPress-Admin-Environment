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
 * (and the `core:command-palette` integration) can call it.
 */

export async function switchShell( slug ) {
	if ( ! slug || typeof slug !== 'string' ) {
		throw new Error( 'switchShell: slug must be a non-empty string' );
	}

	// A wp-content/admin.json override wins over the active-shell option, so
	// writing the option + reloading would be a silent no-op. Fail loudly
	// instead of pretending the switch took effect.
	if (
		typeof window !== 'undefined' &&
		window.wpAdminShell?.workspaceFileActive
	) {
		throw new Error(
			'switchShell: a wp-content/admin.json override is active and takes precedence over the active-shell option. Edit or remove that file to change the workspace.'
		);
	}

	// Client-side pre-flight against the shells list PHP injected on
	// page load. Catches typos and stale slugs before the option write
	// puts the admin in a broken-on-next-load state. Server-side
	// sanitize_callback (registered in wp-admin-shell.php) is the
	// second line of defense — rejects unknown slugs with the option's
	// previous value preserved.
	const shells =
		( typeof window !== 'undefined' && window.wpAdminShell?.shells ) || [];
	if ( shells.length > 0 && ! shells.some( ( s ) => s.slug === slug ) ) {
		throw new Error(
			`switchShell: unknown shell "${ slug }". Known: ${ shells
				.map( ( s ) => s.slug )
				.join( ', ' ) }`
		);
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
