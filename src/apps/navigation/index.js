import './index.css';

import { useKernel } from '../../runtime/kernel-context';
import { useRoute } from '../../runtime/routing/router';
import { userCan } from '../../runtime/capabilities/userCan';
import { orderTree, pruneMenu } from '../../runtime/menu/menuTree.mjs';
import {
	registerMenuRenderer,
	resolveMenuRenderer,
} from '../../runtime/config/menuRendererRegistry';

import SidebarDrilldownRenderer from './_renderers/SidebarDrilldownRenderer';
import SidebarTreeRenderer from './_renderers/SidebarTreeRenderer';

// Register the renderers the bundled core engines ship through
// `core:navigation`. `sidebar-drilldown` is `core:default`'s strategy;
// `sidebar-tree` is available to any engine that names it. Engine-owned
// renderers that aren't part of core:navigation — `core:single-pane`'s
// `drawer` — register from their own engine module so they travel with
// the engine when it's extracted to a plugin. Third-party `plugin:*`
// renderers register the same way (see `menuRendererRegistry`).
registerMenuRenderer( 'sidebar-drilldown', SidebarDrilldownRenderer );
registerMenuRenderer( 'sidebar-tree', SidebarTreeRenderer );

// Renderer used when an engine ships no `menu-renderer` field (older
// engines predating the field). Preserves the historical behavior —
// core:navigation has always rendered a drilldown sidebar.
const DEFAULT_RENDERER = 'sidebar-drilldown';

/**
 * core:navigation — menu host + renderer dispatcher.
 *
 * Reads the resolved `menu` tree (nested, screen-bound by the PHP
 * `bind_screens` pass) from the kernel config, orders + prunes it once,
 * then hands the result to the renderer the active engine named via its
 * `engine.json` `menu-renderer` field (threaded onto the runtime config
 * by `buildRuntimeConfig`). The dispatch goes through the kernel
 * menu-renderer registry, so a `plugin:*` renderer resolves by the exact
 * same path as a built-in — that's the seam a non-WPDS engine plugs into.
 *
 * `menu-renderer` values:
 *   - `sidebar-drilldown` / `sidebar-tree` — bundled renderers.
 *   - `drawer` — registered by the `core:single-pane` engine module.
 *   - `none` — engine ignores `menu`; render nothing.
 *   - `plugin:{slug}/{name}` — looked up in the registry.
 *   - absent — falls back to `sidebar-drilldown`.
 *
 * The per-region `props.config` block carries navigation-app options that
 * aren't part of the engine-agnostic menu tree (`collapsed`, `title`,
 * `description`); it passes through to the renderer unchanged.
 *
 * @param {Object} root0
 * @param {*}      root0.config Per-region nav config block.
 */
export default function NavigationApp( { config: navConfig = {} } ) {
	const { config: kernelConfig } = useKernel();
	const route = useRoute();
	const currentPrimary = route.primary || '';

	const rendererId =
		typeof kernelConfig?.[ 'menu-renderer' ] === 'string'
			? kernelConfig[ 'menu-renderer' ]
			: DEFAULT_RENDERER;

	// Engine opts out of the menu block entirely.
	if ( rendererId === 'none' ) {
		return null;
	}

	// Unknown / unregistered renderer id → fall back to the default so a
	// typo or a not-yet-loaded plugin renderer never blanks the nav.
	const Renderer =
		resolveMenuRenderer( rendererId ) ||
		resolveMenuRenderer( DEFAULT_RENDERER );
	if ( ! Renderer ) {
		return null;
	}

	const rawMenu =
		kernelConfig &&
		typeof kernelConfig.menu === 'object' &&
		kernelConfig.menu !== null
			? kernelConfig.menu
			: {};

	// Sort siblings by `position`, then drop hidden + capability-denied
	// entries recursively. Done once in the host; renderers consume the
	// shaped tree and never re-prune.
	const items = pruneMenu( orderTree( rawMenu ), itemPassesPermissions );

	return (
		<Renderer
			items={ items }
			currentPrimary={ currentPrimary }
			navConfig={ navConfig }
		/>
	);
}

/**
 * v3 permissions are OR-semantic: pass if ANY capability holds OR ANY
 * role-membership check holds. For client-side prune the conservative
 * read is "user holds at least one declared cap" — role checks are
 * server-side only (no client-side role map). Server-side cap gating
 * still applies on top.
 *
 * Items without a `permissions` block are visible (admin.json fallback
 * to admin-only is enforced server-side and reflected in the cap map).
 *
 * Lives in the host (not the shared pure menu-tree module) because it
 * reads `window.wpAdminWorkspaces.capabilities` via `userCan` — keeping the
 * shared helpers node-importable.
 *
 * @param {Object} item Menu item.
 * @return {boolean} Whether the user passes the item's permissions.
 */
function itemPassesPermissions( item ) {
	const perms = item.permissions;
	if ( ! perms || typeof perms !== 'object' ) {
		return true;
	}
	const caps = Array.isArray( perms.capabilities ) ? perms.capabilities : [];
	const roles = Array.isArray( perms.roles ) ? perms.roles : [];
	if ( caps.length === 0 && roles.length === 0 ) {
		return true;
	}
	for ( const cap of caps ) {
		if ( typeof cap === 'string' && userCan( cap ) ) {
			return true;
		}
	}
	// No client-side role map, so role-only gates can't be evaluated here.
	// This is no longer the security boundary: the server prunes screens +
	// role-gated menu items the user can't reach BEFORE serializing the config
	// (`wp_admin_workspaces_prune_config_for_user`), so a `roles:[...]` item the
	// user fails never reaches this code. Rendering it when present is then
	// correct — the server already vouched for visibility (and 403s the route
	// regardless).
	if ( roles.length > 0 ) {
		return true;
	}
	return false;
}
