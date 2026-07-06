/**
 * Manifest-driven registration of every workspace-bundled app and engine.
 *
 * V2.M4 task 6: imperative `register({ ... configSchema ... })` calls
 * are gone. The single source of truth is each app's `app.json` /
 * engine's `engine.json`, validated PHP-side at boot and shipped to
 * the browser via `window.wpAdminWorkspaces.manifests`. This bootstrap
 * pairs each manifest id with its React component module and folds
 * the manifest's intrinsic fields (`title`, `role`, `capabilities`,
 * `config-schema`, `platform`) onto the registry entry the kernel
 * already consumes.
 *
 * **Lazy app loading (C5).** Each app exposes one of two shapes:
 *
 *   - `{ Component }` — eager; the module ships in the boot bundle.
 *     Reserved for always-mounted chrome apps (navigation, site-hub,
 *     toolbar-actions, notices-banner, notices-snackbar) where
 *     lazy-loading adds a flicker without saving bytes.
 *
 *   - `{ load: () => import(...) }` — lazy; webpack code-splits each
 *     `import()` into its own chunk (`build/app-<id>.js`). The
 *     registry caches the resolved component on first mount.
 *
 * Adding a new workspace-bundled app: create `src/apps/{name}/` with
 * `index.js`, `app.json`, and (optionally) `index.css`. Add an entry
 * to `APP_LOADERS` below — eager when the app is always mounted in
 * every workspace, lazy (the default) otherwise. The dynamic import's
 * `webpackChunkName` magic comment controls the emitted chunk name.
 */

// Always-eager chrome apps. Bundled into the boot chunk so the workspace
// paints chrome immediately without a Suspense flash. Keep this list
// tight — every entry here defeats code-splitting for that module.
import NavigationApp from '../../apps/navigation';
import SiteHubApp from '../../apps/site-hub';
import ToolbarActionsApp from '../../apps/toolbar-actions';
import NoticesBannerApp from '../../apps/notices-banner';
import NoticesSnackbarApp from '../../apps/notices-snackbar';

import coreDefault from '../engines/core-default';
import coreSinglePane from '../engines/core-single-pane';
import coreDesktop from '../engines/core-desktop';

/**
 * id → registry-registration descriptor.
 *
 * Eager entries:  `{ Component }` (always-mounted chrome).
 * Lazy entries:   `{ load: () => import(/* webpackChunkName: "app-<id>" *\/ '...') }`.
 *
 * The webpackChunkName magic comment names the emitted chunk
 * deterministically (`build/app-posts.js`, `build/app-editor.js`, …) —
 * makes the network panel + perf debugging readable. Without it
 * webpack hashes the chunk name.
 */
const APP_LOADERS = {
	// ─── always-eager (boot bundle) ────────────────────────────────
	'core:navigation': { Component: NavigationApp },
	'core:site-hub': { Component: SiteHubApp },
	'core:toolbar-actions': { Component: ToolbarActionsApp },
	'core:notices-banner': { Component: NoticesBannerApp },
	'core:notices-snackbar': { Component: NoticesSnackbarApp },

	// ─── lazy (code-split per app) ─────────────────────────────────
	'core:posts': {
		load: () =>
			import( /* webpackChunkName: "app-posts" */ '../../apps/posts' ),
	},
	'core:editor': {
		load: () =>
			import( /* webpackChunkName: "app-editor" */ '../../apps/editor' ),
	},
	'core:simple-editor': {
		load: () =>
			import(
				/* webpackChunkName: "app-simple-editor" */ '../../apps/simple-editor'
			),
	},
	'core:settings-workspace': {
		load: () =>
			import(
				/* webpackChunkName: "app-settings-workspace" */ '../../apps/settings-workspace'
			),
	},
	'core:iframe-fallback': {
		load: () =>
			import(
				/* webpackChunkName: "app-iframe-fallback" */ '../../apps/iframe-fallback'
			),
	},
	'core:site-editor': {
		load: () =>
			import(
				/* webpackChunkName: "app-site-editor" */ '../../apps/site-editor'
			),
	},
	'core:command-palette': {
		load: () =>
			import(
				/* webpackChunkName: "app-command-palette" */ '../../apps/command-palette'
			),
	},
	'core:user-menu': {
		load: () =>
			import(
				/* webpackChunkName: "app-user-menu" */ '../../apps/user-menu'
			),
	},
	'core:desktop-compositor': {
		load: () =>
			import(
				/* webpackChunkName: "app-desktop-compositor" */ '../../apps/desktop-compositor'
			),
	},
	'core:desktop-dock-app': {
		load: () =>
			import(
				/* webpackChunkName: "app-desktop-dock-app" */ '../../apps/desktop-dock-app'
			),
	},
	'core:desktop-window-frame': {
		load: () =>
			import(
				/* webpackChunkName: "app-desktop-window-frame" */ '../../apps/desktop-window-frame'
			),
	},
	'core:desktop-iframe': {
		load: () =>
			import(
				/* webpackChunkName: "app-desktop-iframe" */ '../../apps/desktop-iframe'
			),
	},

	// #134 — captured-HTML tile for bridged classic dashboard widgets. One
	// shared app the PHP harvest mounts once per surviving plugin widget.
};

const NON_ROUTABLE_APPS = new Set( [
	'core:navigation',
	'core:site-hub',
	'core:toolbar-actions',
	'core:command-palette',
	'core:notices-banner',
	'core:notices-snackbar',
	'core:user-menu',
	'core:desktop-compositor',
	'core:desktop-dock-app',
	'core:desktop-window-frame',
] );

export function registerBuiltins( registry ) {
	registry.register( coreDefault );
	registry.register( coreSinglePane );
	registry.register( coreDesktop );

	const manifests = window.wpAdminWorkspaces?.manifests?.apps || {};
	const seen = new Set();

	for ( const [ id, manifest ] of Object.entries( manifests ) ) {
		const loader = APP_LOADERS[ id ];
		if ( ! loader ) {
			continue;
		}
		registry.register( {
			kind: 'app',
			id,
			title: manifest.title,
			role: manifest.role,
			// One of Component / load comes from APP_LOADERS — the
			// registry rejects entries that set both.
			...loader,
			routable: ! NON_ROUTABLE_APPS.has( id ),
			capabilities: Array.isArray( manifest.capabilities )
				? manifest.capabilities
				: [],
			configSchema: manifest[ 'config-schema' ] || {
				type: 'object',
				additionalProperties: false,
			},
			platform: manifest.platform || {},
		} );
		seen.add( id );
	}

	const expected = Object.keys( APP_LOADERS );
	const missing = expected.filter( ( id ) => ! seen.has( id ) );
	if ( missing.length && process.env.NODE_ENV !== 'production' ) {
		// eslint-disable-next-line no-console
		console.warn(
			'[wp-admin-workspaces] expected app manifests not found in window.wpAdminWorkspaces.manifests:',
			missing
		);
	}

	return registry;
}
