import apiFetch from '@wordpress/api-fetch';

/**
 * Programmatic workspace-switching plumbing (plan §M5.8).
 *
 * `switchWorkspace(slug)` drives the option-based switching path:
 *
 *   1. Caller invokes `switchWorkspace(slug)`.
 *   2. Function writes `wp_admin_workspaces_active_workspace` via the core
 *      settings REST (option is registered with show_in_rest).
 *   3. Cache invalidation runs server-side via the
 *      `update_option_wp_admin_workspaces_active_workspace` hook the cache
 *      class registered in M2.7.
 *   4. When the in-process re-mount path is available
 *      (`window.wpAdminWorkspaces.remountWorkspace`, published by
 *      `src/index.js`), the freshly resolved config is re-fetched from REST
 *      and the kernel re-renders into the same React root — no hard reload,
 *      so ephemeral UI state (DataViews sort/filter/selection, scroll,
 *      command-palette state, draft input) survives. Falls back to a hard
 *      `window.location.reload()` when the remount surface is absent (older
 *      bundle, or the REST round-trip fails). Either way the browser
 *      preserves the URL hash, so the active route survives when the new
 *      workspace carries an app of the same id.
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

	if ( typeof window === 'undefined' ) {
		return;
	}

	// In-process re-mount (issue #28). Re-fetch the freshly resolved config
	// — the cascade cache was already invalidated server-side by the
	// `update_option_wp_admin_workspaces_active_workspace` hook — and hand it
	// to the kernel re-render published on the global. Preserves ephemeral UI
	// state by re-rendering into the same React root instead of reloading.
	const remount = window.wpAdminWorkspaces?.remountWorkspace;
	if ( typeof remount === 'function' ) {
		try {
			const payload = await apiFetch( {
				path: '/wp-admin-workspaces/v1/config',
			} );
			remount( payload );
			return;
		} catch ( err ) {
			// REST hiccup or a malformed payload — fall through to the hard
			// reload so the switch still takes effect (the option write above
			// already landed). Surface the cause for debugging.
			// eslint-disable-next-line no-console
			console.error(
				'[wp-admin-workspaces] in-process re-mount failed; falling back to reload.',
				err
			);
		}
	}

	// Fallback: hard reload. Hash survives, so the active route is preserved
	// when the new workspace carries an app of the same id.
	window.location.reload();
}

export function attachWorkspaceSwitcherToWindow() {
	if ( typeof window === 'undefined' ) {
		return;
	}
	window.wpAdminWorkspaces = window.wpAdminWorkspaces || {};
	window.wpAdminWorkspaces.switchWorkspace = switchWorkspace;
}
