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
// script that runs *after* the bundle is handled by the subscribable
// kernel registries: even a truly async (dynamically-injected)
// registration re-renders its consumer (`core:navigation` subscribes via
// `subscribeMenuRenderers`). That subscription is the actual load-order
// fix and closes the race documented in the kernel-import-surface item in
// `docs/feedback.md` (issue #73), unblocking extraction of the bundled
// engines to standalone plugins.
//
// The microtask-deferred mount below is belt-and-suspenders, NOT the
// guarantee: a microtask checkpoint already runs between consecutive
// external `<script>` executions, and React 18's `createRoot().render()`
// is itself async (reconciliation is scheduled, not synchronous), so a
// renderer script enqueued synchronously after the bundle registers
// before `NavigationApp`'s body runs with or without the defer. The
// subscription is what makes the late/async case correct.
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
	// Belt-and-suspenders: defer the first render one microtask. This does
	// NOT win the load-order race on its own (the HTML spec already drains a
	// microtask checkpoint between external `<script>` tags, and React 18's
	// render is async anyway) — the subscribable registries are the real
	// guarantee. See the kernel-surface note above.
	queueMicrotask( () => {
		root.render( kernel( window.wpAdminWorkspaces?.config ) );
	} );
}
