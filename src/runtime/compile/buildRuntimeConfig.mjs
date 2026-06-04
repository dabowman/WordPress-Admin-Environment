import { synthesizeRoutes } from './synthesizeRoutes.mjs';
import { synthesizeRegions } from './synthesizeRegions.mjs';
import { synthesizeDefaultRoute } from './synthesizeDefaultRoute.mjs';
import { compileCommands } from './compileCommands.mjs';

/**
 * Build the runtime config the kernel consumes from the resolved v3
 * admin.json doc + the active engine manifest.
 *
 * The cascade resolver hands the kernel the author-shape v3 doc
 * (`workspace` / `screens` / `menu` / `settings` / `commands`). The kernel
 * is the single place that derives the runtime surfaces from it:
 *
 *   - `engine`        ← `workspace.engine`
 *   - `menu-renderer` ← engine manifest `menu-renderer` (strategy id)
 *   - `routes`        ← synthesized from `screens` (+ `routes` escape hatch)
 *   - `regions`       ← engine `defaultRegions` merged under `regions` escape hatch
 *   - `default-route` ← `workspace.default-screen` → screen path
 *   - `commands`      ← deduped by id
 *
 * The v3 author blocks pass through unchanged so apps (navigation,
 * dataView consumers, dashboard host, …) read them directly. Downstream
 * runtime consumers (`<Region>`, `<BindingsConsumer>`, `RouterProvider`)
 * read the derived surfaces exactly as before.
 *
 * @param {Object} config         Resolved v3 admin.json doc.
 * @param {Object} engineManifest Active engine manifest (carries
 *                                `defaultRegions`).
 * @return {Object} Runtime config.
 */
export function buildRuntimeConfig( config, engineManifest ) {
	if ( ! config || typeof config !== 'object' ) {
		return config;
	}

	const engineId =
		config.engine || config.workspace?.engine || 'core:default';
	const screens = config.screens || {};
	const defaultRegions =
		engineManifest && engineManifest.defaultRegions
			? engineManifest.defaultRegions
			: {};

	const routes = synthesizeRoutes( screens, config.routes || {} );
	const regions = synthesizeRegions( defaultRegions, config.regions || {} );
	const defaultRoute =
		config[ 'default-route' ] ||
		synthesizeDefaultRoute(
			screens,
			config[ 'default-screen' ] || config.workspace?.[ 'default-screen' ] || ''
		);
	const commands = compileCommands( config.commands || [] );

	// Surface the engine's chosen menu-rendering strategy on the runtime
	// config so the `core:navigation` app can dispatch on it without
	// reaching back into the engine manifest. Absent on the manifest →
	// leave the key off so navigation falls back to its default renderer.
	const menuRenderer =
		engineManifest && typeof engineManifest[ 'menu-renderer' ] === 'string'
			? engineManifest[ 'menu-renderer' ]
			: undefined;

	const runtimeConfig = {
		...config,
		engine: engineId,
		routes,
		regions,
		'default-route': defaultRoute,
		commands,
	};
	if ( menuRenderer !== undefined ) {
		runtimeConfig[ 'menu-renderer' ] = menuRenderer;
	}
	return runtimeConfig;
}
