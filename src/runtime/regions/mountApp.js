/**
 * Shared region helper: render a single contained app instance.
 *
 * `appRef` is either:
 *   - a namespaced id string (`core:posts`, `plugin:foo/bar`) — the
 *     v2-canonical reference. The id is the source; the registry
 *     resolves it. Optional inline config is supplied by the caller.
 *   - a fully-formed app instance object (`{ id, source, config?,
 *     capability? }`) — the runtime path the kernel uses when it
 *     pre-resolves regions, and the path region renderers use to mount
 *     route-matched apps with interpolated config.
 *
 * Regions delegate to this helper to keep the resolution path uniform.
 */
import { useKernel } from '../kernel-context';
import { userCan } from '../capabilities/userCan';
import { ScopedThemeProvider } from '../styles/ShellThemeProvider';

export function MountedApp( { appRef, regionId, segments, fallback = null } ) {
	const { registry, config } = useKernel();

	const appInstance = resolveAppInstance( appRef );
	if ( ! appInstance ) {
		return null;
	}
	// Per-app theme override. `styles.applications[appId]` may declare
	// `theme` seeds (Tier 1) or direct slot overrides (Tier 3); when
	// present, wrap the app in a nested provider so its subtree carries
	// the override. Zero-cost when no overrides authored.
	const appStyles = config?.styles?.applications?.[ appInstance.id ];

	// Spec §8 layer 2 — apps with `capability` are hidden from rendering.
	if ( appInstance.capability && ! userCan( appInstance.capability ) ) {
		return fallback;
	}

	const sourceDef = registry.get( appInstance.source, 'app' );
	if ( ! sourceDef ) {
		return (
			<div className="wp-admin-shell-region__empty">
				Unknown source: { appInstance.source }
			</div>
		);
	}

	// Spec §8 layer 3 — source-declared capability floor. Even if the
	// shell config omits `capability`, the source's required caps still
	// apply.
	const sourceCaps = Array.isArray( sourceDef.capabilities ) ? sourceDef.capabilities : [];
	for ( const cap of sourceCaps ) {
		if ( ! userCan( cap ) ) {
			return fallback;
		}
	}

	const Component = sourceDef.Component;
	const mergedConfig = { ...( sourceDef.defaults || {} ), ...( appInstance.config || {} ) };

	return (
		<ScopedThemeProvider styles={ appStyles }>
			<div
				data-app-id={ appInstance.id }
				data-app-source={ appInstance.source }
				style={ { display: 'contents' } }
			>
				<Component
					app={ appInstance }
					config={ mergedConfig }
					regionId={ regionId }
					segments={ segments || [] }
				/>
			</div>
		</ScopedThemeProvider>
	);
}

function resolveAppInstance( appRef ) {
	if ( ! appRef ) {
		return null;
	}
	if ( typeof appRef === 'string' ) {
		// Namespaced ids (core:* / plugin:*) are self-identifying — the id
		// is the source. Anything else is invalid in v2.
		if ( appRef.startsWith( 'core:' ) || appRef.startsWith( 'plugin:' ) ) {
			return { id: appRef, source: appRef };
		}
		return null;
	}
	return appRef;
}
