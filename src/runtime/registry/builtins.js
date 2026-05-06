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
 * Adding a new shell-bundled app: drop the JSX in `src/apps/{name}/`
 * (or `src/runtime/apps/{name}/`), drop an `app.json` next to it, add
 * the id → Component pair to `APP_COMPONENTS` below. Discovery scans
 * the convention path and the manifest registry handles the rest.
 */

import PostsApp from '../../apps/PostsApp';
import EditorApp from '../../apps/EditorApp';
import SimpleEditorApp from '../../apps/SimpleEditorApp';
import MediaApp from '../../apps/MediaApp';
import ProfileApp from '../../apps/ProfileApp';
import SettingsGeneralApp from '../../apps/SettingsGeneralApp';
import IframeApp from '../../apps/IframeApp';
import UsersApp from '../../apps/UsersApp';
import CommentsApp from '../../apps/CommentsApp';
import SettingsApp from '../../apps/SettingsApp';
import SiteEditorApp from '../apps/SiteEditorApp';

import NavigationApp from '../apps/NavigationApp';
import SiteHubApp from '../apps/SiteHubApp';
import ToolbarActionsApp from '../apps/ToolbarActionsApp';
import CommandPaletteApp from '../apps/CommandPaletteApp';
import PreviewPaneApp from '../apps/PreviewPaneApp';
import { NoticesBannerApp, NoticesSnackbarApp } from '../apps/NoticesApp';
import AppearanceApp from '../apps/AppearanceApp';

import coreDefault from '../engines/core-default';
import coreSinglePane from '../engines/core-single-pane';

const APP_COMPONENTS = {
	'core:posts':            PostsApp,
	'core:editor':           EditorApp,
	'core:simple-editor':    SimpleEditorApp,
	'core:media':            MediaApp,
	'core:profile':          ProfileApp,
	'core:settings-general': SettingsGeneralApp,
	'core:iframe-fallback':  IframeApp,
	'core:users':            UsersApp,
	'core:comments':         CommentsApp,
	'core:settings':         SettingsApp,
	'core:site-editor':      SiteEditorApp,
	'core:navigation':       NavigationApp,
	'core:site-hub':         SiteHubApp,
	'core:toolbar-actions':  ToolbarActionsApp,
	'core:command-palette':  CommandPaletteApp,
	'core:preview-pane':     PreviewPaneApp,
	'core:notices-banner':   NoticesBannerApp,
	'core:notices-snackbar': NoticesSnackbarApp,
	'core:appearance':       AppearanceApp,
};

const NON_ROUTABLE_APPS = new Set( [
	'core:navigation',
	'core:site-hub',
	'core:toolbar-actions',
	'core:command-palette',
	'core:preview-pane',
	'core:notices-banner',
	'core:notices-snackbar',
] );

export function registerBuiltins( registry ) {
	registry.register( coreDefault );
	registry.register( coreSinglePane );

	const manifests = window.wpAdminShell?.manifests?.apps || {};
	const seen      = new Set();

	for ( const [ id, manifest ] of Object.entries( manifests ) ) {
		const Component = APP_COMPONENTS[ id ];
		if ( ! Component ) {
			continue;
		}
		registry.register( {
			kind:         'app',
			id,
			title:        manifest.title,
			role:         manifest.role,
			Component,
			routable:     ! NON_ROUTABLE_APPS.has( id ),
			capabilities: Array.isArray( manifest.capabilities ) ? manifest.capabilities : [],
			configSchema: manifest[ 'config-schema' ] || { type: 'object', additionalProperties: false },
			platform:     manifest.platform || {},
		} );
		seen.add( id );
	}

	const expected = Object.keys( APP_COMPONENTS );
	const missing  = expected.filter( ( id ) => ! seen.has( id ) );
	if ( missing.length && process.env.NODE_ENV !== 'production' ) {
		// eslint-disable-next-line no-console
		console.warn(
			'[wp-admin-shell] expected app manifests not found in window.wpAdminShell.manifests:',
			missing
		);
	}

	return registry;
}
