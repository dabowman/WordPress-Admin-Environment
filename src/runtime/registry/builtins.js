/**
 * Imperatively register every built-in source against a fresh registry.
 *
 * Apps, regions, and engines all enter through `registry.register()`. The
 * shared identity envelope ({ kind, id, Component, ... }) lets the kernel
 * route consumers to the right look-up family.
 *
 * MVP user apps (`PostsApp`, `MediaApp`, etc.) register here as adapted
 * `AppSource` definitions. Component code is unchanged — these definitions
 * are pure registration shims.
 */

// MVP user apps (component code unchanged; registration shim only).
import PostsApp from '../../apps/PostsApp';
import EditorApp from '../../apps/EditorApp';
import SimpleEditorApp from '../../apps/SimpleEditorApp';
import MediaApp from '../../apps/MediaApp';
import ProfileApp from '../../apps/ProfileApp';
import SettingsGeneralApp from '../../apps/SettingsGeneralApp';
import IframeApp from '../../apps/IframeApp';

// v1 system apps (sidebar / toolbar / overlay content).
import NavigationApp from '../apps/NavigationApp';
import SiteHubApp from '../apps/SiteHubApp';
import ToolbarActionsApp from '../apps/ToolbarActionsApp';
import CommandPickerApp from '../apps/CommandPickerApp';
import PreviewPaneApp from '../apps/PreviewPaneApp';
import { NoticesBannerApp, NoticesSnackbarApp } from '../apps/NoticesApp';

// v1 engine + regions.
import coreSiteEditorLayout from '../engines/core-site-editor-layout';
import sidebarRegion from '../regions/sidebar-region';
import toolbarRegion from '../regions/toolbar-region';
import contentRegion from '../regions/content-region';
import previewRegion from '../regions/preview-region';
import overlayRegion from '../regions/overlay-region';
import drawerRegion from '../regions/drawer-region';

export function registerBuiltins( registry ) {
	// Engines.
	registry.register( coreSiteEditorLayout );

	// Regions.
	registry.register( sidebarRegion );
	registry.register( toolbarRegion );
	registry.register( contentRegion );
	registry.register( previewRegion );
	registry.register( overlayRegion );
	registry.register( drawerRegion );

	// MVP user apps.
	registry.register( {
		kind: 'app',
		id: 'core:posts',
		title: 'Posts',
		routable: true,
		Component: PostsApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:editor',
		title: 'Editor (post)',
		routable: true,
		Component: EditorApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:simple-editor',
		title: 'Simple editor',
		routable: true,
		Component: SimpleEditorApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:media',
		title: 'Media',
		routable: true,
		Component: MediaApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:profile',
		title: 'Profile',
		routable: true,
		Component: ProfileApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:settings-general',
		title: 'Settings — General',
		routable: true,
		Component: SettingsGeneralApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:iframe-fallback',
		title: 'Iframe fallback',
		routable: true,
		Component: IframeApp,
	} );

	// v1 system apps.
	registry.register( {
		kind: 'app',
		id: 'core:navigation',
		title: 'Navigation',
		Component: NavigationApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:site-hub',
		title: 'Site hub',
		Component: SiteHubApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:toolbar-actions',
		title: 'Toolbar actions',
		Component: ToolbarActionsApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:command-picker',
		title: 'Command picker',
		Component: CommandPickerApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:preview-pane',
		title: 'Preview pane',
		Component: PreviewPaneApp,
	} );

	registry.register( {
		kind: 'app',
		id: 'core:notices-banner',
		title: 'Notices (banner)',
		Component: NoticesBannerApp,
	} );
	registry.register( {
		kind: 'app',
		id: 'core:notices-snackbar',
		title: 'Notices (snackbar)',
		Component: NoticesSnackbarApp,
	} );

	return registry;
}
