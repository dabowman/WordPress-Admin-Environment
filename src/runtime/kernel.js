import { __ } from '@wordpress/i18n';

import { createRegistry } from './registry/createRegistry';
import { registerBuiltins } from './registry/builtins';
import { KernelProvider } from './kernel-context';
import { RouterProvider } from './routing/router';
import { ThemeProviderHost } from './styles/ThemeProviderHost';
import { shouldRenderRegion } from './capabilities/shouldRenderRegion.mjs';
import { attachWorkspaceSwitcherToWindow } from './workspace-switching';
import { getEngine as getEngineManifest } from './manifests';
import { resolveRegion } from './regions/resolveRegion.mjs';
import { validateRegion, sanitizeRegion } from './regions/validateRegion.mjs';
import { createDynamicChildrenStore } from './regions/dynamicChildren.mjs';
import { NavigationGuard } from './dirty-state/NavigationGuard';
import { BindingsConsumer } from './bindings/BindingsConsumer';
import { AdminLinkInterceptor } from './navigation/AdminLinkInterceptor';
import { deepMergeUnder } from './styles/deepMergeUnder.mjs';
import { buildRuntimeConfig } from './compile/buildRuntimeConfig.mjs';

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
 * `WP_Admin_Workspaces_Origin_Core::normalize_v0`. The kernel never sees the
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
				{ __(
					'Workspace configuration not found.',
					'wp-admin-workspaces'
				) }
			</div>
		);
	}

	const registry = createRegistry();
	registerBuiltins( registry );

	// Per-mount dynamic-children store. Regions whose templates declare
	// `platform[ 'core:dynamic-children' ]: true` host runtime-mutated
	// child regions; their mounted apps consume the store via
	// `useDynamicChildren(parentRegionId)` from kernel-context.
	// `add()` runs `validateRegion` so spec §5.4 invariants
	// (`app` xor `routing.route-key`) are enforced for runtime regions
	// the same way they are for statically-declared ones.
	const dynamicChildrenStore = createDynamicChildrenStore( {
		validate: validateRegion,
	} );

	// Token cascade: `<ThemeProviderHost>` mounts the active engine's
	// `ThemeProvider` (or a neutral pass-through wrapper when the
	// engine declines to ship one), wraps children in a scoped
	// `<div data-theme-scope-id>`, and emits engine-supplied
	// scoped overrides (chrome bindings, region/app token overrides)
	// as a sibling `<style>` block. Engines pluggable here; kernel
	// agnostic — see `tests/runtime/kernel-no-ds-import.test.mjs`.
	const workspaceTokens =
		( typeof window !== 'undefined' && window.wpAdminWorkspaces?.tokens ) ||
		{};

	// Workspace-switching plumbing (no UI surface in v1; v2 prefs UI).
	attachWorkspaceSwitcherToWindow();

	const engineId =
		config.engine || config.workspace?.engine || 'core:default';
	const engineManifest = getEngineManifest( engineId );

	// Build the runtime config from the resolved v3 author doc + the active
	// engine manifest. The kernel is the single place that derives the
	// runtime surfaces (`engine`, `routes`, `regions`, `default-route`,
	// `commands`) from the v3 `workspace` / `screens` / `menu` / `commands`
	// blocks; the author blocks pass through unchanged for apps to read.
	const runtimeConfig = buildRuntimeConfig( config, engineManifest );

	const engineSource = registry.get( engineId, 'engine' );

	// Engine `default-styles` deep-merged UNDER workspace.json `styles`.
	// PHP resolver already does this in `WP_Admin_Workspaces_Resolver::engine_origin`,
	// so the kernel is normally a no-op. Defensive: covers tests and
	// Storybook stories that mount the kernel with raw fixture config
	// bypassing the PHP resolver.
	const engineDefaults =
		( engineManifest && engineManifest[ 'default-styles' ] ) || null;
	const workspaceStyles = engineDefaults
		? deepMergeUnder( runtimeConfig.styles || {}, engineDefaults )
		: runtimeConfig.styles || {};

	if ( ! engineSource ) {
		return (
			<div style={ { padding: 32 } }>
				{ __( 'Unknown layout engine:', 'wp-admin-workspaces' ) }
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
	const regionsMap = runtimeConfig.regions || {};
	const regions = {};
	const honoredServices = new Set(
		Array.isArray( engineManifest?.[ 'honored-platform' ] )
			? engineManifest[ 'honored-platform' ]
			: []
	);
	const unhonoredWarned = new Set();
	const capMap =
		typeof window !== 'undefined'
			? window.wpAdminWorkspaces?.capabilities
			: null;
	Object.entries( regionsMap ).forEach( ( [ id, regionInstance ] ) => {
		// Spec §8 layer 1 — region capability fast-path. A region the
		// user lacks capability for is dropped before mounting, so
		// contains[] never evaluates. Shared decision with `<Region>`
		// via `shouldRenderRegion` so the rule is one place.
		if ( ! shouldRenderRegion( regionInstance, capMap ) ) {
			return;
		}
		const resolved = resolveRegion( regionInstance, engineManifest );
		const decorated = { id, ...resolved };
		const violations = validateRegion( decorated, id );
		if ( violations.length && typeof console !== 'undefined' ) {
			for ( const v of violations ) {
				// eslint-disable-next-line no-console
				console.warn( `[wp-admin-workspaces] ${ v.message }` );
			}
		}
		// Dev-mode: warn once per service when a region declares a
		// platform service the active engine doesn't list in
		// `honored-platform`. Unhonored requests still mount silently,
		// they just no-op — author may have a typo or be targeting a
		// future engine.
		if (
			process.env?.NODE_ENV !== 'production' &&
			decorated.platform &&
			typeof decorated.platform === 'object'
		) {
			for ( const serviceName of Object.keys( decorated.platform ) ) {
				if (
					! honoredServices.has( serviceName ) &&
					! unhonoredWarned.has( serviceName )
				) {
					unhonoredWarned.add( serviceName );
					// eslint-disable-next-line no-console
					console.warn(
						`[wp-admin-workspaces] platform service "${ serviceName }" requested by region "${ id }" but engine "${ engineId }" does not list it in honored-platform. Request is a no-op.`
					);
				}
			}
		}
		regions[ id ] = sanitizeRegion( decorated );
	} );

	const Engine = engineSource.Component;

	// Slot/Fill substrate (when any) is provided by the engine's
	// `Layout` component — keeping the kernel DS-neutral. Bundled
	// engines that consume `@wordpress/components` Slot/Fill wrap
	// their layout in a `<SlotFillProvider>`; engines that don't need
	// the substrate (or that ship their own) skip the wrap.
	return (
		<KernelProvider
			value={ {
				registry,
				config: runtimeConfig,
				engineSource,
				dynamicChildrenStore,
			} }
		>
			<RouterProvider defaultRoute={ runtimeConfig[ 'default-route' ] }>
				<ThemeProviderHost
					engineSource={ engineSource }
					isRoot
					styles={ workspaceStyles }
					tokens={ workspaceTokens }
				>
					<NavigationGuard />
					<BindingsConsumer />
					<AdminLinkInterceptor />
					<Engine config={ runtimeConfig } regions={ regions } />
				</ThemeProviderHost>
			</RouterProvider>
		</KernelProvider>
	);
}
