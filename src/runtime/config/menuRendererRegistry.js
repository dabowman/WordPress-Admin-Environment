/**
 * Kernel menu-renderer registry.
 *
 * Design-system agnostic. The kernel knows about menu-renderer *id*
 * strings only; whoever owns a renderer (the bundled `core:navigation`
 * app, an engine module, or a third-party plugin) registers its React
 * component under an id at module-load time via `registerMenuRenderer()`.
 *
 * An engine declares which renderer it wants through the `menu-renderer`
 * field in its `engine.json` (e.g. `"sidebar-drilldown"` or
 * `"plugin:my/breadcrumb-menu"`). `core:navigation` reads the resolved
 * value off the runtime config and looks the component up here, so the
 * id is the single seam between "engine names a strategy" and "someone
 * supplies the implementation". Built-in and plugin renderers resolve
 * through the exact same path — that uniformity is what lets a
 * third-party engine plug in a menu without touching kernel code.
 *
 * Renderer component contract — every renderer receives the same props:
 *   - `items`          Pruned + ordered menu tree (array of entries).
 *   - `currentPrimary` Active URL primary path (e.g. `/posts`).
 *   - `navConfig`      The per-region nav config block (title, collapsed…).
 *
 * Registration contract (mirrors `iconMap` — engines register at module
 * load alongside their icon table):
 *   import { registerMenuRenderer } from '../../config/menuRendererRegistry';
 *   registerMenuRenderer( 'drawer', DrawerRenderer );
 *
 * Lookup contract:
 *   import { resolveMenuRenderer } from '../../runtime/config/menuRendererRegistry';
 *   const Renderer = resolveMenuRenderer( 'sidebar-drilldown' );
 *
 * Published surface for loose plugin scripts: `src/index.js` mirrors the
 * default-registry `registerMenuRenderer` onto
 * `window.wpAdminWorkspaces.registerMenuRenderer` so a third-party renderer
 * shipped as a standalone script (no bundler access to this module) can
 * still register. NOTE: that loose-script path can race the kernel's
 * synchronous first mount — see the kernel-import-surface gap tracked in
 * `docs/feedback.md`. Renderers that register via a direct ESM import
 * (the bundled engines + any engine the workspace webpack builds) are
 * race-free because they execute before the kernel module runs.
 *
 * Tests construct an isolated registry via `createMenuRendererRegistry()`
 * so per-suite state does not bleed across test files.
 *
 * DS-neutral: this module holds opaque component references and imports
 * nothing design-system-specific, so it lives in the kernel without
 * tightening it to WPDS.
 */

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Build an isolated menu-renderer registry with the standard
 * register/resolve API. The module-level `registerMenuRenderer` /
 * `resolveMenuRenderer` exports are thin facades over a default instance.
 *
 * @return {{registerMenuRenderer: Function, resolveMenuRenderer: Function}} Isolated registry handle.
 */
export function createMenuRendererRegistry() {
	const registry = {};
	const warned = new Set();

	function registerMenuRenderer( id, Component ) {
		if ( typeof id !== 'string' || id === '' || ! Component ) {
			return;
		}
		// First registration wins — matches the manifest registries'
		// boot-order semantics. A second registration under the same id is
		// ignored so an engine can't be silently clobbered by a plugin.
		if ( registry[ id ] ) {
			if ( IS_DEV ) {
				// eslint-disable-next-line no-console
				console.warn(
					`wp-admin-workspaces menuRendererRegistry: duplicate id "${ id }" ignored (first registration wins).`
				);
			}
			return;
		}
		registry[ id ] = Component;
	}

	function resolveMenuRenderer( id ) {
		if ( ! id ) {
			return null;
		}
		const Component = registry[ id ];
		if ( Component ) {
			return Component;
		}
		if ( IS_DEV && ! warned.has( id ) ) {
			warned.add( id );
			// eslint-disable-next-line no-console
			console.warn(
				`wp-admin-workspaces menuRendererRegistry: unknown menu-renderer id "${ id }". Known: ${ Object.keys(
					registry
				)
					.sort()
					.join( ', ' ) }`
			);
		}
		return null;
	}

	return { registerMenuRenderer, resolveMenuRenderer };
}

const defaultRegistry = createMenuRendererRegistry();

/**
 * Register a menu-renderer component against the default kernel-wide
 * registry. Engines / apps / plugins call this at module load. First
 * registration wins on a duplicate id.
 *
 * @param {string} id        Renderer id (`sidebar-drilldown`, `drawer`,
 *                           `plugin:{slug}/{name}`, …).
 * @param {*}      Component React component rendered with
 *                           `{ items, currentPrimary, navConfig }`.
 */
export const registerMenuRenderer = defaultRegistry.registerMenuRenderer;

/**
 * Resolve a menu-renderer id against the default kernel-wide registry.
 *
 * Returns `null` when the id misses (or is empty). In dev mode the first
 * miss per id emits a console warning so an engine author sees a typo or
 * an unregistered plugin renderer immediately. Callers render nothing (or
 * their own fallback) on `null`.
 *
 * @param {string|undefined|null} id
 * @return {*} Renderer component, or `null`.
 */
export const resolveMenuRenderer = defaultRegistry.resolveMenuRenderer;
