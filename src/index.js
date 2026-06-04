import { createRoot } from '@wordpress/element';
import { kernel } from './runtime/kernel';
import {
	registerMenuRenderer,
	resolveMenuRenderer,
} from './runtime/config/menuRendererRegistry';
import { registerIcons, resolveIcon } from './runtime/config/iconMap';
import './index.css';

// Published kernel surface for out-of-tree plugin / engine code.
//
// In-tree code (the bundled engines, `core:navigation`) registers
// renderers + icons through direct ESM imports of the kernel registries
// — race-free, because those modules evaluate before the kernel mounts.
// Out-of-tree code shipped as a standalone script has no bundler access
// to those relative paths, so the kernel mirrors the registration +
// lookup functions onto a stable global it can reach:
//
//   window.wpAdminWorkspaces.kernel.registerMenuRenderer( id, Component )
//   window.wpAdminWorkspaces.kernel.registerIcons( table, { fallback } )
//   window.wpAdminWorkspaces.kernel.resolveMenuRenderer( id )
//   window.wpAdminWorkspaces.kernel.resolveIcon( name )
//
// Assigning before mount means a plugin script that ran *before* this
// module (e.g. enqueued ahead of the bundle) can't be lost. A plugin
// script that runs *after* the bundle is handled two ways: (1) the mount
// below is deferred one microtask, so any script enqueued synchronously
// after the bundle has executed its top-level registration before first
// paint; (2) the kernel registries are subscribable, so even a truly
// async (dynamically-injected) registration re-renders its consumer
// (`core:navigation` subscribes via `subscribeMenuRenderers`). Together
// these close the race documented in the kernel-import-surface item in
// `docs/feedback.md` (issue #73) and unblock extracting the bundled
// engines to standalone plugins.
if ( window.wpAdminWorkspaces ) {
	const kernelSurface = {
		registerMenuRenderer,
		resolveMenuRenderer,
		registerIcons,
		resolveIcon,
	};
	window.wpAdminWorkspaces.kernel = kernelSurface;

	// Back-compat: the flat `registerMenuRenderer` alias shipped before
	// the namespaced `kernel` surface existed. Keep it pointing at the
	// same function so existing loose renderer scripts don't break.
	window.wpAdminWorkspaces.registerMenuRenderer = registerMenuRenderer;
}

const container = document.getElementById( 'wp-admin-workspaces' );
if ( container ) {
	const root = createRoot( container );
	// Defer the first render one microtask so any plugin / engine script
	// enqueued synchronously after this bundle has registered its menu
	// renderer / icon table before first paint — no re-render needed in the
	// common case. Async-injected registrations are still covered by the
	// subscribable registries. See the kernel-surface note above.
	queueMicrotask( () => {
		root.render( kernel( window.wpAdminWorkspaces?.config ) );
	} );
}
