/**
 * Filter the static Tools landing list down to the cards whose target
 * screen the current user can actually reach.
 *
 * The server prunes screens the user can't reach out of `config.screens`
 * BEFORE serializing the client config
 * (`wp_admin_workspaces_prune_config_for_user`), so a card's target route
 * resolving is exactly equivalent to its screen still being present in the
 * resolved doc. Matching on the screen `path` — the same string
 * `navigate()` consumes — therefore hides any card that would otherwise
 * fall through to the default route (the silent dead route from issue
 * #207) while staying authoritative for capabilities AND roles AND
 * theme-support gating, without re-deriving any of them here. This mirrors
 * how the left-nav is capability-pruned.
 *
 * Pure (no `window`) so it's node-importable for tests per the runtime
 * `.mjs` convention. The host passes `window.wpAdminWorkspaces.config.screens`.
 *
 * @param {Array}                 tools   The static TOOLS descriptors (each with a `path`).
 * @param {Object|null|undefined} screens The resolved `config.screens` map.
 * @return {Array} Tools whose target screen is reachable. When `screens`
 *                 is missing or not an object the list is returned
 *                 unchanged (optimistic render — the REST API stays the
 *                 authority, matching `userCan`'s default-true behavior).
 */
export function filterReachableTools( tools, screens ) {
	if ( ! Array.isArray( tools ) ) {
		return [];
	}
	if ( ! screens || typeof screens !== 'object' ) {
		return tools;
	}
	const paths = new Set();
	for ( const screen of Object.values( screens ) ) {
		if (
			screen &&
			typeof screen === 'object' &&
			typeof screen.path === 'string'
		) {
			paths.add( screen.path );
		}
	}
	return tools.filter( ( tool ) => tool && paths.has( tool.path ) );
}
