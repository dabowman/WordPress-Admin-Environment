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
 */

const registry = {};
let fallbackIcon = null;

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

const warned = new Set();

/**
 * Register an icon-name → component map. Engines call this at module
 * load. Multiple calls merge — last-write-wins on overlapping keys.
 *
 * @param {Object<string,*>} table              Icon-name → component map.
 * @param {Object}           [options]
 * @param {*}                [options.fallback] Component returned when a
 *                                              name misses or is empty.
 *                                              Overwrites prior fallback.
 */
export function registerIcons( table, options = {} ) {
	if ( table && typeof table === 'object' ) {
		Object.assign( registry, table );
	}
	if ( options.fallback ) {
		fallbackIcon = options.fallback;
	}
}

/**
 * Resolve an icon name string to a component supplied by the active
 * engine.
 *
 * Returns the engine-registered fallback when the name misses or is
 * empty. In dev mode, the first miss per name emits a console warning
 * so authors see typos without needing a dedicated lint pass.
 * Production stays silent — visual fallback is acceptable.
 *
 * @param {string|undefined|null} name
 * @return {*} Icon component (or `null` when no fallback registered).
 */
export function resolveIcon( name ) {
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
			`wp-admin-shell iconMap: unknown icon name "${ name }"; falling back to engine default. Known: ${ Object.keys(
				registry
			)
				.sort()
				.join( ', ' ) }`
		);
	}
	return fallbackIcon;
}

/**
 * Test-only: clear the registry. Lets tests register a controlled icon
 * set without bleed-through from other test files. Not part of the
 * public API.
 */
export function _resetIconRegistry() {
	for ( const key of Object.keys( registry ) ) {
		delete registry[ key ];
	}
	fallbackIcon = null;
	warned.clear();
}
