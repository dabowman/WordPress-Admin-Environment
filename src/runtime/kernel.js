import { __ } from '@wordpress/i18n';

import { createRegistry } from './registry/createRegistry';
import { registerBuiltins } from './registry/builtins';
import { normalizeV0 } from './config/normalizeV0';
import { KernelProvider } from './kernel-context';
import { RouterProvider } from './routing/router';
import { SlotFillProvider } from './slots/Slot';
import { ensureSelectionStore } from './selection/store';
import { bootstrapSelections } from './selection/persist';

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

	ensureSelectionStore();
	// Fire-and-forget; UI never blocks on persisted-selection hydration.
	bootstrapSelections();

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
