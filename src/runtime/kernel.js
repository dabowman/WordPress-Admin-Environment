import { __ } from '@wordpress/i18n';

import { createRegistry } from './registry/createRegistry';
import { registerBuiltins } from './registry/builtins';
import { KernelProvider } from './kernel-context';
import { RouterProvider } from './routing/router';
import { SlotFillProvider } from '@wordpress/components';
import { ThemeProviderHost } from './styles/ThemeProviderHost';
import { resolveDensity } from './styles/density';
import { userCan } from './capabilities/userCan';
import { attachShellSwitcherToWindow } from './shell-switching';
import { getEngine as getEngineManifest } from './manifests';
import { resolveRegion } from './regions/resolveRegion.mjs';
import { validateRegion, sanitizeRegion } from './regions/validateRegion.mjs';
import { NavigationGuard } from './dirty-state/NavigationGuard';
import { BindingsConsumer } from './bindings/BindingsConsumer';

/**
 * Deep-merge plain-object trees with `over` winning on overlapping keys.
 * Used to fold engine `default-styles` UNDER admin.json `styles` when
 * the kernel is mounted with raw config (tests, Storybook). The PHP
 * resolver normally does this server-side; the JS path is defensive.
 *
 * Arrays are replaced wholesale (no positional merge) — matches the
 * PHP merge's behavior for indexed arrays.
 * @param {*} over
 * @param {*} under
 */
function deepMergeUnder( over, under ) {
	if ( under === null || under === undefined ) {
		return over;
	}
	if ( over === null || over === undefined ) {
		return under;
	}
	if (
		typeof over !== 'object' ||
		typeof under !== 'object' ||
		Array.isArray( over ) ||
		Array.isArray( under )
	) {
		return over;
	}
	const out = { ...under };
	for ( const [ key, value ] of Object.entries( over ) ) {
		out[ key ] = deepMergeUnder( value, under[ key ] );
	}
	return out;
}

/**
 * Mount the v1 kernel against a resolved config.
 *
 * Flow:
 *   1. Build a registry instance and register all built-in sources.
 *   2. Resolve the active engine and the region source for each declared
 *      region, returning a tree the engine can render.
 *   3. Wrap the engine output in the kernel/router/slot providers.
 *
 * v0 (MVP flat) → v1 normalization runs server-side in
 * `WP_Admin_Shell_Origin_Core::normalize_v0`. The kernel never sees the
 * legacy shape regardless of source. The MVP-era JS-side `normalizeV0`
 * shim retired with this commit; if a future config-delivery path
 * bypasses PHP, restore it.
 *
 * Returns a React element that the entry script renders into the DOM.
 * @param {*} config
 */
export function kernel( config ) {
	if ( ! config ) {
		return (
			<div style={ { padding: 32 } }>
				{ __( 'Shell configuration not found.', 'wp-admin-shell' ) }
			</div>
		);
	}

	const registry = createRegistry();
	registerBuiltins( registry );

	// Token cascade: `<ThemeProviderHost>` mounts the active engine's
	// `ThemeProvider` (or the WPDS-backed default when the engine
	// declines to ship one), wraps children in a scoped
	// `<div data-wpds-theme-provider-id>`, and emits tier-3 slot
	// overrides + chrome → WPDS bridge + region/app scoped overrides as
	// a sibling `<style>` block. Engines pluggable here; kernel agnostic.
	const shellTokens =
		( typeof window !== 'undefined' && window.wpAdminShell?.tokens ) || {};

	// Shell-switching plumbing (no UI surface in v1; v2 prefs UI).
	attachShellSwitcherToWindow();

	const engineId = config.engine || 'core:default';
	const engineSource = registry.get( engineId, 'engine' );

	// Engine `default-styles` deep-merged UNDER admin.json `styles`.
	// PHP resolver already does this in `WP_Admin_Shell_Resolver::engine_origin`,
	// so the kernel is normally a no-op. Defensive: covers tests and
	// Storybook stories that mount the kernel with raw fixture config
	// bypassing the PHP resolver.
	const engineManifest = getEngineManifest( engineId );
	const engineDefaults =
		( engineManifest && engineManifest[ 'default-styles' ] ) || null;
	const shellStyles = engineDefaults
		? deepMergeUnder( config.styles || {}, engineDefaults )
		: config.styles || {};
	const density = resolveDensity( shellStyles );

	if ( ! engineSource ) {
		return (
			<div style={ { padding: 32 } }>
				{ __( 'Unknown layout engine:', 'wp-admin-shell' ) }
				{ engineId }
			</div>
		);
	}

	// Regions may declare `template` referencing a shape shipped by the
	// active engine's manifest. `resolveRegion` merges defaults (role,
	// platform, default-style, nested children) with per-region
	// overrides and recurses into nested children. `app` xor
	// `routing.route-key` is enforced post-merge: violations log a
	// `console.warn`; sanitization drops `app` so URL routing wins.
	const regionsMap = config.regions || {};
	const regions = {};
	Object.entries( regionsMap ).forEach( ( [ id, regionInstance ] ) => {
		// Spec §8 layer 1 — region capability fast-path. A region the
		// user lacks capability for is dropped before mounting, so
		// contains[] never evaluates.
		if (
			regionInstance.capability &&
			! userCan( regionInstance.capability )
		) {
			return;
		}
		const resolved = resolveRegion( regionInstance, engineManifest );
		const decorated = { id, ...resolved };
		const violations = validateRegion( decorated, id );
		if ( violations.length && typeof console !== 'undefined' ) {
			for ( const v of violations ) {
				// eslint-disable-next-line no-console
				console.warn( `[wp-admin-shell] ${ v.message }` );
			}
		}
		regions[ id ] = sanitizeRegion( decorated );
	} );

	const Engine = engineSource.Component;

	return (
		<KernelProvider value={ { registry, config, engineSource } }>
			<SlotFillProvider>
				<RouterProvider defaultRoute={ config[ 'default-route' ] }>
					<ThemeProviderHost
						engineSource={ engineSource }
						isRoot
						styles={ shellStyles }
						tokens={ shellTokens }
						density={ density }
					>
						<NavigationGuard />
						<BindingsConsumer />
						<Engine config={ config } regions={ regions } />
					</ThemeProviderHost>
				</RouterProvider>
			</SlotFillProvider>
		</KernelProvider>
	);
}
