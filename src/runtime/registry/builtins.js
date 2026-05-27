/**
 * Manifest-driven registration of every shell-bundled app and engine.
 *
 * V2.M4 task 6: imperative `register({ ... configSchema ... })` calls
 * are gone. The single source of truth is each app's `app.json` /
 * engine's `engine.json`, validated PHP-side at boot and shipped to
 * the browser via `window.wpAdminShell.manifests`. This bootstrap
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
 * Adding a new shell-bundled app: create `src/apps/{name}/` with
 * `index.js`, `app.json`, and (optionally) `index.css`. Add an entry
 * to `APP_LOADERS` below — eager when the app is always mounted in
 * every shell, lazy (the default) otherwise. The dynamic import's
 * `webpackChunkName` magic comment controls the emitted chunk name.
 */

// Always-eager chrome apps. Bundled into the boot chunk so the shell
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
	'core:media': {
		load: () =>
			import( /* webpackChunkName: "app-media" */ '../../apps/media' ),
	},
	'core:profile': {
		load: () =>
			import(
				/* webpackChunkName: "app-profile" */ '../../apps/profile'
			),
	},
	'core:settings-general': {
		load: () =>
			import(
				/* webpackChunkName: "app-settings-general" */ '../../apps/settings-general'
			),
	},
	'core:settings-writing': {
		load: () =>
			import(
				/* webpackChunkName: "app-settings-writing" */ '../../apps/settings-writing'
			),
	},
	'core:settings-reading': {
		load: () =>
			import(
				/* webpackChunkName: "app-settings-reading" */ '../../apps/settings-reading'
			),
	},
	'core:settings-discussion': {
		load: () =>
			import(
				/* webpackChunkName: "app-settings-discussion" */ '../../apps/settings-discussion'
			),
	},
	'core:iframe-fallback': {
		load: () =>
			import(
				/* webpackChunkName: "app-iframe-fallback" */ '../../apps/iframe-fallback'
			),
	},
	'core:users': {
		load: () =>
			import( /* webpackChunkName: "app-users" */ '../../apps/users' ),
	},
	'core:comments': {
		load: () =>
			import(
				/* webpackChunkName: "app-comments" */ '../../apps/comments'
			),
	},
	'core:settings': {
		load: () =>
			import(
				/* webpackChunkName: "app-settings" */ '../../apps/settings'
			),
	},
	'core:site-editor': {
		load: () =>
			import(
				/* webpackChunkName: "app-site-editor" */ '../../apps/site-editor'
			),
	},
	'core:dashboard': {
		load: () =>
			import(
				/* webpackChunkName: "app-dashboard" */ '../../apps/dashboard'
			),
	},
	'core:plugins': {
		load: () =>
			import(
				/* webpackChunkName: "app-plugins" */ '../../apps/plugins'
			),
	},
	'core:themes': {
		load: () =>
			import( /* webpackChunkName: "app-themes" */ '../../apps/themes' ),
	},
	'core:tools': {
		load: () =>
			import( /* webpackChunkName: "app-tools" */ '../../apps/tools' ),
	},
	'core:site-health': {
		load: () =>
			import(
				/* webpackChunkName: "app-site-health" */ '../../apps/site-health'
			),
	},
	'core:taxonomy': {
		load: () =>
			import(
				/* webpackChunkName: "app-taxonomy" */ '../../apps/taxonomy'
			),
	},
	'core:command-palette': {
		load: () =>
			import(
				/* webpackChunkName: "app-command-palette" */ '../../apps/command-palette'
			),
	},
	'core:preview-pane': {
		load: () =>
			import(
				/* webpackChunkName: "app-preview-pane" */ '../../apps/preview-pane'
			),
	},
	'core:appearance': {
		load: () =>
			import(
				/* webpackChunkName: "app-appearance" */ '../../apps/appearance'
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

	// ─── C4 dashboard widget grid ──────────────────────────────────
	'core:dashboard-host': {
		load: () =>
			import(
				/* webpackChunkName: "app-dashboard-host" */ '../../apps/dashboard-host'
			),
	},
	'core:dashboard-widget-recent-posts': {
		load: () =>
			import(
				/* webpackChunkName: "app-dashboard-widget-recent-posts" */ '../../apps/dashboard-widget-recent-posts'
			),
	},
	'core:dashboard-widget-quick-draft': {
		load: () =>
			import(
				/* webpackChunkName: "app-dashboard-widget-quick-draft" */ '../../apps/dashboard-widget-quick-draft'
			),
	},
};

const NON_ROUTABLE_APPS = new Set( [
	'core:navigation',
	'core:site-hub',
	'core:toolbar-actions',
	'core:command-palette',
	'core:preview-pane',
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

	const manifests = window.wpAdminShell?.manifests?.apps || {};
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
			'[wp-admin-shell] expected app manifests not found in window.wpAdminShell.manifests:',
			missing
		);
	}

	return registry;
}
