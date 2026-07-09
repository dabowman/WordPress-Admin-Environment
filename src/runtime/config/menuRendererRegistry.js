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
 * default-registry register/resolve functions onto
 * `window.wpAdminWorkspaces.kernel` so a
 * third-party renderer shipped as a standalone script (no bundler access
 * to this module) can still register. This registry is subscribable
 * (`subscribeMenuRenderers` + `getMenuRendererEpoch`), so even a truly
 * async registration re-renders `core:navigation` — that subscription is
 * the load-order guarantee. (The kernel mount in `src/index.js` is also
 * deferred one microtask as belt-and-suspenders, but that defer does not
 * win the race on its own; see the note there.) Renderers that register
 * via a direct ESM import (the bundled engines + any engine the workspace
 * webpack builds) are present before the kernel module runs and never need
 * either path.
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
 * @return {{registerMenuRenderer: Function, resolveMenuRenderer: Function, subscribeMenuRenderers: Function, getMenuRendererEpoch: Function}} Isolated registry handle.
 */
export function createMenuRendererRegistry() {
	const registry = {};
	const warned = new Set();
	const listeners = new Set();
	// Monotonic registration epoch OWNED by the registry. Bumped before the
	// listener loop on every successful registration, so it's the canonical
	// `getSnapshot` source for a `useSyncExternalStore` consumer: whichever
	// listener React schedules reads the already-incremented value, with no
	// dependence on listener insertion order. See `getMenuRendererEpoch`.
	let epoch = 0;

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
		// Bump the epoch BEFORE notifying so any `useSyncExternalStore`
		// listener (which reads `getMenuRendererEpoch` in its
		// `getSnapshot`) sees the new value regardless of which listener
		// fires first — no insertion-order side-channel.
		epoch++;
		// Notify subscribers so a consumer mounted before this (late /
		// async) registration re-resolves. This is what lets a loose
		// plugin renderer script that loaded AFTER the kernel mounted
		// still paint — see the published-surface note below.
		for ( const listener of listeners ) {
			listener();
		}
	}

	/**
	 * Subscribe to renderer registrations. The listener fires after every
	 * successful (first-wins) `registerMenuRenderer` call. Returns an
	 * unsubscribe function. Shaped for `useSyncExternalStore`.
	 *
	 * @param {Function} listener Called with no args on each registration.
	 * @return {Function} Unsubscribe.
	 */
	function subscribeMenuRenderers( listener ) {
		if ( typeof listener !== 'function' ) {
			return () => {};
		}
		listeners.add( listener );
		return () => listeners.delete( listener );
	}

	/**
	 * Read the current registration epoch. Shaped for
	 * `useSyncExternalStore`'s `getSnapshot` — a monotonic count that only
	 * changes when a new renderer registers. Because the registry bumps it
	 * before the listener loop, a consumer reads the post-registration value
	 * no matter which listener React runs first.
	 *
	 * @return {number} Current epoch.
	 */
	function getMenuRendererEpoch() {
		return epoch;
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

	return {
		registerMenuRenderer,
		resolveMenuRenderer,
		subscribeMenuRenderers,
		getMenuRendererEpoch,
	};
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

/**
 * Subscribe to default-registry renderer registrations.
 *
 * `core:navigation` subscribes through this so a renderer registered
 * AFTER the kernel mounted (a loose plugin script that loaded after the
 * `wp-admin-workspaces` bundle, or any async-injected script) re-renders
 * the nav and the renderer paints. Renderers registered before mount —
 * the bundled engines via direct ESM import, plus anything synchronously
 * enqueued ahead of the microtask-deferred mount in `src/index.js` — are
 * already present at first paint and never need the notification.
 *
 * @param {Function} listener Called with no args on each registration.
 * @return {Function} Unsubscribe.
 */
export const subscribeMenuRenderers = defaultRegistry.subscribeMenuRenderers;

/**
 * Read the default-registry registration epoch.
 *
 * `core:navigation` pairs this with `subscribeMenuRenderers` as the
 * `getSnapshot` source of a `useSyncExternalStore` so a renderer
 * registered AFTER the kernel mounted repaints the nav. The registry owns
 * the counter and increments it before notifying, so the value is correct
 * regardless of listener order — the consumer keeps no local epoch mirror.
 *
 * @return {number} Current epoch.
 */
export const getMenuRendererEpoch = defaultRegistry.getMenuRendererEpoch;
