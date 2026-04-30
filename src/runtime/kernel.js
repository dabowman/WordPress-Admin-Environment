import { __ } from '@wordpress/i18n';

import { createRegistry } from './registry/createRegistry';
import { registerBuiltins } from './registry/builtins';
import { normalizeV0 } from './config/normalizeV0';
import { KernelProvider } from './kernel-context';
import { RouterProvider } from './routing/router';
import { SlotFillProvider } from './slots/Slot';
import { ensureSelectionStore } from './selection/store';
import { bootstrapSelections } from './selection/persist';
import { injectTokens } from './styles/emitTokens';
import { resolveDensity, applyDensity } from './styles/density';
import { userCan } from './capabilities/userCan';
import { attachShellSwitcherToWindow } from './shell-switching';

/**
 * Mount the v1 kernel against a raw config.
 *
 * Flow:
 *   1. Build a registry instance and register all built-in sources.
 *   2. Normalize v0 (MVP flat) input through `normalizeV0` (M1 shim).
 *   3. Resolve the active engine and the region source for each declared
 *      region, returning a tree the engine can render.
 *   4. Wrap the engine output in the kernel/router/slot providers.
 *
 * Returns a React element that the entry script renders into the DOM.
 */
export function kernel( rawConfig ) {
	if ( ! rawConfig ) {
		return (
			<div style={ { padding: 32 } }>
				{ __( 'Shell configuration not found.', 'wp-admin-shell' ) }
			</div>
		);
	}

	const registry = createRegistry();
	registerBuiltins( registry );

	const config = normalizeV0( rawConfig );

	// Token emission (§4.3.2): write `<style id="wp-admin-shell-tokens">`
	// with the WPDS surface, chrome extensions, compat bridge, and any
	// per-region/per-app scoped overrides. Density is an attribute, not
	// a CSS variable — applied to #wp-admin-shell directly.
	injectTokens( config.styles || {} );
	if ( typeof document !== 'undefined' ) {
		const root = document.getElementById( 'wp-admin-shell' );
		applyDensity( root, resolveDensity( config.styles || {} ) );
	}

	ensureSelectionStore();
	// Fire-and-forget; UI never blocks on persisted-selection hydration.
	bootstrapSelections();
	// Shell-switching plumbing (no UI surface in v1; v2 prefs UI).
	attachShellSwitcherToWindow();

	const engineId =
		config.settings?.shell?.layoutEngine || 'core:site-editor-layout';
	const engineSource = registry.get( engineId, 'engine' );

	if ( ! engineSource ) {
		return (
			<div style={ { padding: 32 } }>
				{ __( 'Unknown layout engine: ', 'wp-admin-shell' ) }
				{ engineId }
			</div>
		);
	}

	const regionsMap = config.settings?.regions || {};
	const regions = {};
	const regionSources = {};
	Object.entries( regionsMap ).forEach( ( [ id, regionInstance ] ) => {
		// Spec §8 layer 1 — region capability fast-path. A region the
		// user lacks capability for is dropped before its source is
		// looked up, so contains[] never evaluates.
		if ( regionInstance.capability && ! userCan( regionInstance.capability ) ) {
			return;
		}
		const sourceDef = registry.get( regionInstance.source, 'region' );
		if ( ! sourceDef ) {
			return;
		}
		regions[ id ] = { id, ...regionInstance };
		regionSources[ regionInstance.source ] = sourceDef;
	} );

	const Engine = engineSource.Component;

	return (
		<KernelProvider value={ { registry, config } }>
			<SlotFillProvider>
				<RouterProvider>
					<Engine
						config={ config }
						regions={ regions }
						regionSources={ regionSources }
					/>
				</RouterProvider>
			</SlotFillProvider>
		</KernelProvider>
	);
}
