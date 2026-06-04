import { createRoot } from '@wordpress/element';
import { kernel } from './runtime/kernel';
import { registerMenuRenderer } from './runtime/config/menuRendererRegistry';
import {
	applyWorkspacePayload,
	diffWorkspaceScreens,
} from './runtime/remount.mjs';
import './index.css';

// Published kernel surface for loose plugin scripts. A third-party menu
// renderer shipped as a standalone script (no bundler access to the
// kernel modules) registers its component through this global. Built-in
// + engine-owned renderers register via a direct ESM import instead and
// don't need it. Assigned before mount so a renderer script that ran
// before this module can't be lost — though scripts enqueued after the
// bundle still race the synchronous mount below (see the
// kernel-import-surface gap in docs/feedback.md).
if ( window.wpAdminWorkspaces ) {
	window.wpAdminWorkspaces.registerMenuRenderer = registerMenuRenderer;
}

const container = document.getElementById( 'wp-admin-workspaces' );
if ( container ) {
	const root = createRoot( container );
	root.render( kernel( window.wpAdminWorkspaces?.config ) );

	// In-process workspace re-mount (issue #28). `switchWorkspace()` writes
	// the active-workspace option, re-fetches the freshly resolved config
	// from REST, then calls this to re-render the kernel into the SAME root
	// — no hard reload. React reconciliation diffs the region tree: regions
	// with matching ids (and engine/app types) keep their mounted component
	// instances + local state (DataViews sort/filter/selection, scroll,
	// command-palette state, draft input); the rest unmount/mount.
	// `@wordpress/data` + the kernel `triggerStore` are module singletons,
	// so their state survives regardless. The URL hash is untouched, so the
	// active route survives too.
	//
	// State preservation is per-engine: same engine ⇒ matching-id state
	// preserved; different engine ⇒ full remount. A cross-engine switch
	// (`core:default` ↔ `core:single-pane`/`core:desktop`) re-renders
	// `<Engine>` as a different component type, so React unmounts + remounts
	// the whole tree and no matching-id benefit applies. (Engine modules
	// register icons/menu-renderers/ThemeProvider as eager module
	// side-effects, so the target engine is already imported by then.)
	if ( window.wpAdminWorkspaces ) {
		window.wpAdminWorkspaces.remountWorkspace = ( payload ) => {
			const prevScreens = window.wpAdminWorkspaces.config?.screens;
			const nextConfig = applyWorkspacePayload(
				window.wpAdminWorkspaces,
				payload
			);
			const diff = diffWorkspaceScreens(
				prevScreens,
				nextConfig?.screens
			);
			root.render( kernel( nextConfig ) );
			// Let a switcher UI / telemetry observe what changed.
			window.dispatchEvent(
				new CustomEvent( 'wp-admin-workspaces:remounted', {
					detail: diff,
				} )
			);
			return diff;
		};
	}
}
