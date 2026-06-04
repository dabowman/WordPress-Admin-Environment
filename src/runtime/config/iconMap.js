/**
 * Kernel icon registry.
 *
 * Design-system agnostic. The kernel knows about icon-name strings only;
 * engines populate the registry with their own DS-appropriate icon
 * components at module-load time via `registerIcons()`.
 *
 * Apps look up icons by name via `resolveIcon(name)` regardless of which
 * engine is active. Unknown names fall back to whichever icon the active
 * engine registered as the fallback (typically a generic "logo" mark).
 *
 * Engine contract:
 *   import { registerIcons } from '../../config/iconMap';
 *   import { iconTable, fallbackIcon } from './icons';
 *   registerIcons( iconTable, { fallback: fallbackIcon } );
 *
 * App contract (unchanged):
 *   import { resolveIcon } from '../../runtime/config/iconMap';
 *   const Icon = resolveIcon( 'post' );
 *
 * Published surface for out-of-tree engines: `src/index.js` mirrors
 * `registerIcons` + `resolveIcon` onto `window.wpAdminWorkspaces.kernel`
 * so an engine shipped as a standalone script (no bundler access to this
 * module) can populate the registry. The registry is subscribable
 * (`subscribeIcons`) so a consumer can re-resolve when a late / async
 * engine registration arrives, mirroring `menuRendererRegistry`.
 *
 * Tests construct an isolated registry via `createIconRegistry()` so
 * per-suite state does not bleed across test files.
 */

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Build an isolated icon registry with the standard register/resolve API.
 * The module-level `registerIcons` / `resolveIcon` exports are thin
 * facades over a default instance.
 *
 * @return {{registerIcons: Function, resolveIcon: Function, subscribeIcons: Function}} Isolated registry handle.
 */
export function createIconRegistry() {
	const registry = {};
	let fallbackIcon = null;
	const warned = new Set();
	const listeners = new Set();

	function registerIcons( table, options = {} ) {
		const hadTable = table && typeof table === 'object';
		if ( hadTable ) {
			Object.assign( registry, table );
		}
		if ( options.fallback ) {
			fallbackIcon = options.fallback;
		}
		// Notify subscribers so a consumer rendered before this (late /
		// async) icon registration re-resolves. Mirrors the menu-renderer
		// registry — engines normally register at module load before the
		// kernel mounts, but an out-of-tree engine loaded as a loose
		// script can arrive afterward.
		if ( hadTable || options.fallback ) {
			for ( const listener of listeners ) {
				listener();
			}
		}
	}

	/**
	 * Subscribe to icon registrations. The listener fires after every
	 * `registerIcons` call that added a table or a fallback. Returns an
	 * unsubscribe function. Shaped for `useSyncExternalStore`.
	 *
	 * @param {Function} listener Called with no args on each registration.
	 * @return {Function} Unsubscribe.
	 */
	function subscribeIcons( listener ) {
		if ( typeof listener !== 'function' ) {
			return () => {};
		}
		listeners.add( listener );
		return () => listeners.delete( listener );
	}

	function resolveIcon( name ) {
		if ( ! name ) {
			return fallbackIcon;
		}
		const icon = registry[ name ];
		if ( icon ) {
			return icon;
		}
		if ( IS_DEV && ! warned.has( name ) ) {
			warned.add( name );
			// eslint-disable-next-line no-console
			console.warn(
				`wp-admin-workspaces iconMap: unknown icon name "${ name }"; falling back to engine default. Known: ${ Object.keys(
					registry
				)
					.sort()
					.join( ', ' ) }`
			);
		}
		return fallbackIcon;
	}

	return { registerIcons, resolveIcon, subscribeIcons };
}

const defaultRegistry = createIconRegistry();

/**
 * Register icons against the default kernel-wide registry. Engines call
 * this at module load. Multiple calls merge — last-write-wins on
 * overlapping keys.
 *
 * @param {Object<string,*>} table              Icon-name → component map.
 * @param {Object}           [options]
 * @param {*}                [options.fallback] Component returned when a
 *                                              name misses or is empty.
 *                                              Overwrites prior fallback.
 */
export const registerIcons = defaultRegistry.registerIcons;

/**
 * Resolve an icon name against the default kernel-wide registry.
 *
 * Returns the engine-registered fallback when the name misses or is
 * empty. In dev mode, the first miss per name emits a console warning
 * so authors see typos without needing a dedicated lint pass.
 * Production stays silent — visual fallback is acceptable.
 *
 * @param {string|undefined|null} name
 * @return {*} Icon component (or `null` when no fallback registered).
 */
export const resolveIcon = defaultRegistry.resolveIcon;

/**
 * Subscribe to default-registry icon registrations.
 *
 * Mirrors `subscribeMenuRenderers`. A consumer that wants to re-resolve
 * its icons when an out-of-tree engine registers its table after the
 * kernel mounted (loose-script load order) subscribes through this.
 * Engines registering before mount — the bundled engines via direct ESM
 * import — are already present at first paint.
 *
 * @param {Function} listener Called with no args on each registration.
 * @return {Function} Unsubscribe.
 */
export const subscribeIcons = defaultRegistry.subscribeIcons;
