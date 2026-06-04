import apiFetch from '@wordpress/api-fetch';

/**
 * Programmatic workspace-switching plumbing (plan §M5.8).
 *
 * v1 ships the plumbing without a user-facing toggle per spec §6.4.1:
 *
 *   1. Caller invokes `switchWorkspace(slug)`.
 *   2. Function writes `wp_admin_workspaces_active_workspace` via the core
 *      settings REST (option is registered with show_in_rest).
 *   3. Cache invalidation runs server-side via the
 *      `update_option_wp_admin_workspaces_active_workspace` hook the cache
 *      class registered in M2.7.
 *   4. The page reloads. The browser preserves the URL hash, so the
 *      route the user was on survives the switch when the new workspace
 *      registers a matching app id.
 *
 * v2 will surface a switcher inside `core:appearance-preferences` and add a
 * mid-session in-place re-mount path that re-builds the registry's
 * region tree without a hard reload.
 *
 * Exposed on `window.wpAdminWorkspaces.switchWorkspace` so custom workspace
 * code (and the `core:command-palette` integration) can call it.
 */

export async function switchWorkspace( slug ) {
	if ( ! slug || typeof slug !== 'string' ) {
		throw new Error( 'switchWorkspace: slug must be a non-empty string' );
	}

	// A wp-content/workspace.json override wins over the active-workspace
	// option, so writing the option + reloading would be a silent no-op.
	// Fail loudly instead of pretending the switch took effect.
	if (
		typeof window !== 'undefined' &&
		window.wpAdminWorkspaces?.fileActive
	) {
		throw new Error(
			'switchWorkspace: a wp-content/workspace.json override is active and takes precedence over the active-workspace option. Edit or remove that file to change the workspace.'
		);
	}

	// Client-side pre-flight against the workspaces list PHP injected on
	// page load. Catches typos and stale slugs before the option write
	// puts the admin in a broken-on-next-load state. Server-side
	// sanitize_callback (registered in wp-admin-workspaces.php) is the
	// second line of defense — rejects unknown slugs with the option's
	// previous value preserved.
	const workspaces =
		( typeof window !== 'undefined' &&
			window.wpAdminWorkspaces?.workspaces ) ||
		[];
	if (
		workspaces.length > 0 &&
		! workspaces.some( ( w ) => w.slug === slug )
	) {
		throw new Error(
			`switchWorkspace: unknown workspace "${ slug }". Known: ${ workspaces
				.map( ( w ) => w.slug )
				.join( ', ' ) }`
		);
	}

	await apiFetch( {
		path: '/wp/v2/settings',
		method: 'POST',
		data: { wp_admin_workspaces_active_workspace: slug },
	} );

	if ( typeof window !== 'undefined' ) {
		// Hash survives reload, so the active route is preserved when
		// the new workspace carries an app of the same id.
		window.location.reload();
	}
}

export function attachWorkspaceSwitcherToWindow() {
	if ( typeof window === 'undefined' ) {
		return;
	}
	window.wpAdminWorkspaces = window.wpAdminWorkspaces || {};
	window.wpAdminWorkspaces.switchWorkspace = switchWorkspace;
}
