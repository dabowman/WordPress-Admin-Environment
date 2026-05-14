/**
 * Manifest-driven registration of every shell-bundled app and engine.
 *
 * V2.M4 task 6: imperative `register({ ... configSchema ... })` calls
 * are gone. The single source of truth is each app's `app.json` /
 * engine's `engine.json`, validated PHP-side at boot and shipped to
 * the browser via `window.wpAdminShell.manifests`. This bootstrap
 * pairs each manifest id with its imported React component and folds
 * the manifest's intrinsic fields (`title`, `role`, `capabilities`,
 * `config-schema`, `platform`) onto the registry entry the kernel
 * already consumes.
 *
 * Adding a new shell-bundled app: create `src/apps/{name}/` with
 * `index.js`, `app.json`, and (optionally) `index.css`. Add the
 * id → Component pair to `APP_COMPONENTS` below. Discovery scans the
 * convention path and the manifest registry handles the rest.
 */

import PostsApp from '../../apps/posts';
import EditorApp from '../../apps/editor';
import SimpleEditorApp from '../../apps/simple-editor';
import MediaApp from '../../apps/media';
import ProfileApp from '../../apps/profile';
import SettingsGeneralApp from '../../apps/settings-general';
import IframeApp from '../../apps/iframe-fallback';
import UsersApp from '../../apps/users';
import CommentsApp from '../../apps/comments';
import SettingsApp from '../../apps/settings';
import SiteEditorApp from '../../apps/site-editor';
import DashboardApp from '../../apps/dashboard';
import PluginsApp from '../../apps/plugins';
import ThemesApp from '../../apps/themes';
import ToolsApp from '../../apps/tools';
import SiteHealthApp from '../../apps/site-health';
import TaxonomyApp from '../../apps/taxonomy';

import NavigationApp from '../../apps/navigation';
import SiteHubApp from '../../apps/site-hub';
import ToolbarActionsApp from '../../apps/toolbar-actions';
import CommandPaletteApp from '../../apps/command-palette';
import PreviewPaneApp from '../../apps/preview-pane';
import NoticesBannerApp from '../../apps/notices-banner';
import NoticesSnackbarApp from '../../apps/notices-snackbar';
import AppearanceApp from '../../apps/appearance';
import UserMenuApp from '../../apps/user-menu';

import DesktopCompositorApp from '../../apps/desktop-compositor';
import DesktopDockApp from '../../apps/desktop-dock-app';
import DesktopWindowFrameApp from '../../apps/desktop-window-frame';
import DesktopIframeApp from '../../apps/desktop-iframe';

import coreDefault from '../engines/core-default';
import coreSinglePane from '../engines/core-single-pane';
import coreDesktop from '../engines/core-desktop';

const APP_COMPONENTS = {
	'core:posts': PostsApp,
	'core:editor': EditorApp,
	'core:simple-editor': SimpleEditorApp,
	'core:media': MediaApp,
	'core:profile': ProfileApp,
	'core:settings-general': SettingsGeneralApp,
	'core:iframe-fallback': IframeApp,
	'core:users': UsersApp,
	'core:comments': CommentsApp,
	'core:settings': SettingsApp,
	'core:site-editor': SiteEditorApp,
	'core:dashboard': DashboardApp,
	'core:plugins': PluginsApp,
	'core:themes': ThemesApp,
	'core:tools': ToolsApp,
	'core:site-health': SiteHealthApp,
	'core:taxonomy': TaxonomyApp,
	'core:navigation': NavigationApp,
	'core:site-hub': SiteHubApp,
	'core:toolbar-actions': ToolbarActionsApp,
	'core:command-palette': CommandPaletteApp,
	'core:preview-pane': PreviewPaneApp,
	'core:notices-banner': NoticesBannerApp,
	'core:notices-snackbar': NoticesSnackbarApp,
	'core:appearance': AppearanceApp,
	'core:user-menu': UserMenuApp,
	'core:desktop-compositor': DesktopCompositorApp,
	'core:desktop-dock-app': DesktopDockApp,
	'core:desktop-window-frame': DesktopWindowFrameApp,
	'core:desktop-iframe': DesktopIframeApp,
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
		const Component = APP_COMPONENTS[ id ];
		if ( ! Component ) {
			continue;
		}
		registry.register( {
			kind: 'app',
			id,
			title: manifest.title,
			role: manifest.role,
			Component,
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

	const expected = Object.keys( APP_COMPONENTS );
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
