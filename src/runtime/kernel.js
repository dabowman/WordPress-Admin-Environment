import { __ } from '@wordpress/i18n';

import { createRegistry } from './registry/createRegistry';
import { registerBuiltins } from './registry/builtins';
import { KernelProvider } from './kernel-context';
import { RouterProvider } from './routing/router';
import { SlotFillProvider } from '@wordpress/components';
import { injectTokens } from './styles/emitTokens';
import { resolveDensity, applyDensity } from './styles/density';
import { userCan } from './capabilities/userCan';
import { attachShellSwitcherToWindow } from './shell-switching';
import { getEngine as getEngineManifest } from './manifests';
import { resolveRegion } from './regions/resolveRegion.mjs';
import { validateRegion, sanitizeRegion } from './regions/validateRegion.mjs';

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

	// Token emission (§4.3.2): write `<style id="wp-admin-shell-tokens">`
	// with the WPDS surface, chrome extensions, compat bridge, and any
	// per-region/per-app scoped overrides. Density is an attribute, not
	// a CSS variable — applied to #wp-admin-shell directly.
	injectTokens( config.styles || {} );
	if ( typeof document !== 'undefined' ) {
		const root = document.getElementById( 'wp-admin-shell' );
		applyDensity( root, resolveDensity( config.styles || {} ) );
	}

	// Shell-switching plumbing (no UI surface in v1; v2 prefs UI).
	attachShellSwitcherToWindow();

	const engineId = config.engine || 'core:site-editor-layout';
	const engineSource = registry.get( engineId, 'engine' );

	if ( ! engineSource ) {
		return (
			<div style={ { padding: 32 } }>
				{ __( 'Unknown layout engine: ', 'wp-admin-shell' ) }
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
	const engineManifest = getEngineManifest( engineId );
	const regionsMap = config.regions || {};
	const regions = {};
	Object.entries( regionsMap ).forEach( ( [ id, regionInstance ] ) => {
		// Spec §8 layer 1 — region capability fast-path. A region the
		// user lacks capability for is dropped before mounting, so
		// contains[] never evaluates.
		if ( regionInstance.capability && ! userCan( regionInstance.capability ) ) {
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
		<KernelProvider value={ { registry, config } }>
			<SlotFillProvider>
				<RouterProvider defaultRoute={ config[ 'default-route' ] }>
					<Engine
						config={ config }
						regions={ regions }
					/>
				</RouterProvider>
			</SlotFillProvider>
		</KernelProvider>
	);
}
