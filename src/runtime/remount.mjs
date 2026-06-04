/**
 * In-process workspace re-mount helpers (issue #28).
 *
 * Workspace switching used to hard-reload the page. The reload preserved the
 * URL hash (so the active route survived) but threw away every piece of
 * ephemeral UI state: DataViews sort/filter/selection, scroll position,
 * command-palette state, draft input.
 *
 * The remount path re-fetches the freshly resolved config from REST and
 * re-renders the kernel into the SAME React root. React reconciliation does
 * the region/app tree diff for us — regions whose ids (and engine/app types)
 * match across workspaces keep their mounted component instances and their
 * local state; regions only in the old tree unmount; regions only in the new
 * tree mount. Module-singleton stores (`@wordpress/data`, the kernel
 * `triggerStore`) persist across the re-render regardless.
 *
 * These two helpers are the pure, side-effect-free pieces so they can be
 * unit-tested under node without a React/DOM harness (see
 * `tests/runtime/remount.test.mjs`). The React wiring lives in
 * `src/index.js`; the fetch + option write lives in
 * `src/runtime/workspace-switching.js`.
 */

/**
 * Diff two resolved-config `screens` maps by id.
 *
 * Reported purely for diagnostics / telemetry (and for a future switcher UI
 * to react to) — React itself performs the authoritative tree
 * reconciliation. "Screen present in both" does NOT guarantee state is
 * preserved (the screen could mount a different app id across workspaces);
 * it's a coarse signal of what changed, not a contract.
 *
 * @param {Object} prevScreens Previous resolved `config.screens` (id-keyed).
 * @param {Object} nextScreens Next resolved `config.screens` (id-keyed).
 * @return {{ added: string[], removed: string[], retained: string[] }}
 *         Sorted id arrays.
 */
export function diffWorkspaceScreens( prevScreens, nextScreens ) {
	const prevIds = new Set(
		prevScreens && typeof prevScreens === 'object'
			? Object.keys( prevScreens )
			: []
	);
	const nextIds = new Set(
		nextScreens && typeof nextScreens === 'object'
			? Object.keys( nextScreens )
			: []
	);

	const added = [];
	const removed = [];
	const retained = [];

	for ( const id of nextIds ) {
		( prevIds.has( id ) ? retained : added ).push( id );
	}
	for ( const id of prevIds ) {
		if ( ! nextIds.has( id ) ) {
			removed.push( id );
		}
	}

	added.sort();
	removed.sort();
	retained.sort();

	return { added, removed, retained };
}

/**
 * Fold a REST `/config` payload into the live `window.wpAdminWorkspaces`
 * global ahead of a re-render.
 *
 * The kernel reads `config`, `capabilities`, `adminRoutes`, `tokens`, and
 * `engineModes` off this global at mount time (region cap-gating, the
 * admin-link interceptor, `ThemeProviderHost`'s token resolution, `useMode()`'s
 * modes-catalog fallback, and apps that read `window.wpAdminWorkspaces.config`
 * directly), so they must be swapped to the new workspace's values BEFORE
 * `root.render(kernel(config))` runs. `tokens` is config-gated server-side — an
 * alias-free workspace ships `{}`, one whose styles reference foreign aliases
 * ships the full DTCG tree — so it must be folded in here too or the new styles
 * resolve against the stale token tree. `engineModes` is engine-variant —
 * derived from the active engine manifest — so a cross-engine switch must fold
 * it in or `useMode()` resolves against the stale catalog. Only keys present on
 * the payload are written — the workspace-invariant fields (siteUrl, user,
 * nonce, …) are left untouched.
 *
 * @param {Object} target  The `window.wpAdminWorkspaces` global (mutated).
 * @param {Object} payload REST response: `{ config, capabilities?,
 *                          adminRoutes?, tokens?, engineModes? }`.
 * @return {Object} The resolved `config` from the payload.
 */
export function applyWorkspacePayload( target, payload ) {
	if ( ! target || typeof target !== 'object' ) {
		throw new Error( 'applyWorkspacePayload: target must be an object' );
	}
	if ( ! payload || typeof payload !== 'object' || ! payload.config ) {
		throw new Error(
			'applyWorkspacePayload: payload must carry a resolved `config`'
		);
	}

	target.config = payload.config;
	if ( payload.capabilities !== undefined ) {
		target.capabilities = payload.capabilities;
	}
	if ( payload.adminRoutes !== undefined ) {
		target.adminRoutes = payload.adminRoutes;
	}
	if ( payload.tokens !== undefined ) {
		target.tokens = payload.tokens;
	}
	if ( payload.engineModes !== undefined ) {
		target.engineModes = payload.engineModes;
	}

	return payload.config;
}
