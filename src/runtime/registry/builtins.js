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
import UsersApp from '../../apps/UsersApp';
import CommentsApp from '../../apps/CommentsApp';
import SettingsApp from '../../apps/SettingsApp';
import SiteEditorApp from '../apps/SiteEditorApp';

// v1 system apps (sidebar / toolbar / overlay content).
import NavigationApp from '../apps/NavigationApp';
import SiteHubApp from '../apps/SiteHubApp';
import ToolbarActionsApp from '../apps/ToolbarActionsApp';
import CommandPickerApp from '../apps/CommandPickerApp';
import PreviewPaneApp from '../apps/PreviewPaneApp';
import { NoticesBannerApp, NoticesSnackbarApp } from '../apps/NoticesApp';
import AppearanceApp from '../apps/AppearanceApp';

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

	// MVP user apps. configSchemas describe the per-instance config; the
	// M2 validator cache (WP_Admin_Shell_Config_Validator) memoizes against
	// (sourceId, sha1(configJson)) once a real validator runtime lands.
	registry.register( {
		kind: 'app',
		id: 'core:posts',
		title: 'Posts',
		routable: true,
		Component: PostsApp,
		configSchema: {
			type: 'object',
			properties: {
				postType:     { type: 'string', default: 'post' },
				status:       { type: 'string' },
				contentWidth: { type: [ 'number', 'string' ] },
				preview:      { type: 'string' },
			},
			additionalProperties: false,
		},
	} );
	registry.register( {
		kind: 'app',
		id: 'core:editor',
		title: 'Editor (post)',
		routable: true,
		Component: EditorApp,
		configSchema: {
			type: 'object',
			properties: {
				postType: { type: 'string', default: 'post' },
			},
			additionalProperties: false,
		},
	} );
	registry.register( {
		kind: 'app',
		id: 'core:simple-editor',
		title: 'Simple editor',
		routable: true,
		Component: SimpleEditorApp,
		configSchema: {
			type: 'object',
			properties: {
				postType: { type: 'string', default: 'post' },
			},
			additionalProperties: false,
		},
	} );
	registry.register( {
		kind: 'app',
		id: 'core:media',
		title: 'Media',
		routable: true,
		Component: MediaApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:profile',
		title: 'Profile',
		routable: true,
		Component: ProfileApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:settings-general',
		title: 'Settings — General',
		routable: true,
		Component: SettingsGeneralApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:iframe-fallback',
		title: 'Iframe fallback',
		routable: true,
		Component: IframeApp,
		configSchema: { type: 'object', additionalProperties: true },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:users',
		title: 'Users',
		routable: true,
		Component: UsersApp,
		capabilities: [ 'list_users' ],
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:comments',
		title: 'Comments',
		routable: true,
		Component: CommentsApp,
		capabilities: [ 'moderate_comments' ],
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:settings',
		title: 'Settings',
		routable: true,
		Component: SettingsApp,
		capabilities: [ 'manage_options' ],
		configSchema: {
			type: 'object',
			properties: {
				panels: {
					type: 'array',
					items: { type: 'string' },
				},
			},
			additionalProperties: false,
		},
	} );
	registry.register( {
		kind: 'app',
		id: 'core:site-editor',
		title: 'Site editor',
		routable: true,
		Component: SiteEditorApp,
		capabilities: [ 'edit_theme_options' ],
		configSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', default: 'site-editor.php' },
			},
			additionalProperties: false,
		},
	} );

	// v1 system apps.
	registry.register( {
		kind: 'app',
		id: 'core:navigation',
		title: 'Navigation',
		Component: NavigationApp,
		configSchema: {
			type: 'object',
			properties: {
				items:     { type: 'array' },
				collapsed: { type: 'boolean' },
				title:     { type: 'string' },
				description: { type: 'string' },
			},
			additionalProperties: false,
		},
	} );
	registry.register( {
		kind: 'app',
		id: 'core:site-hub',
		title: 'Site hub',
		Component: SiteHubApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:toolbar-actions',
		title: 'Toolbar actions',
		Component: ToolbarActionsApp,
		configSchema: {
			type: 'object',
			properties: {
				left:  { type: 'array' },
				right: { type: 'array' },
			},
			additionalProperties: false,
		},
	} );
	registry.register( {
		kind: 'app',
		id: 'core:command-picker',
		title: 'Command picker',
		Component: CommandPickerApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:preview-pane',
		title: 'Preview pane',
		Component: PreviewPaneApp,
		configSchema: {
			type: 'object',
			properties: {
				follow: { type: 'string', default: 'content.selection' },
			},
			additionalProperties: false,
		},
	} );

	registry.register( {
		kind: 'app',
		id: 'core:notices-banner',
		title: 'Notices (banner)',
		Component: NoticesBannerApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:notices-snackbar',
		title: 'Notices (snackbar)',
		Component: NoticesSnackbarApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );
	registry.register( {
		kind: 'app',
		id: 'core:appearance',
		title: 'Appearance',
		routable: true,
		Component: AppearanceApp,
		configSchema: { type: 'object', additionalProperties: false },
	} );

	return registry;
}
