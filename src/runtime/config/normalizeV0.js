/**
 * normalizeV0 — pure function that maps a v0 (MVP flat) admin.json shape
 * into the v1 partitioned shape the kernel expects.
 *
 * v0 fields handled:
 *   - branding         → settings.styles.branding (legacy mirror at config.branding kept)
 *   - layout           → drives implicit regions config
 *   - applications[]   → settings.applications (array form retained for v1 lookup)
 *   - navigation[]     → core:navigation app config.items
 *   - toolbar          → core:toolbar-actions app config (left/right)
 *   - defaultApp       → defaultRoute (`/<app>`)
 *
 * v1 emits:
 *   - shell.layoutEngine = 'core:site-editor-layout'
 *   - regions: toolbar (if v0 layout.toolbar !== false), sidebar (if !== 'hidden'),
 *     content (router:true, selectionScope:'content'), preview, command-palette
 *   - applications: array of v0 applications + system apps (nav, site-hub, command-picker, toolbar-actions, preview-pane)
 *
 * The shim is intentionally narrow — it bridges enough of the v0 surface
 * for all four bundled shells to render through the new kernel without
 * touching their JSON. M2's cascade resolver subsumes this shim into the
 * `core` origin loader; kept here in M1 to unblock kernel testing.
 */

const ENGINE_ID = 'core:site-editor-layout';

export function normalizeV0( raw ) {
	if ( ! raw || typeof raw !== 'object' ) {
		return emptyConfig();
	}

	// Already-v1 detection: v1 shape has `settings.shell.layoutEngine`.
	if ( raw.settings?.shell?.layoutEngine ) {
		return raw;
	}

	const branding = {
		logo: null,
		title: null,
		accentColor: '#3858e9',
		...( raw.branding || {} ),
	};

	const layout = {
		navigation: 'left',
		navigationCollapsed: false,
		toolbar: true,
		navigationWidth: 300,
		...( raw.layout || {} ),
	};

	const applications = ( raw.applications || [] ).map( ( app ) => ( {
		hidden: false,
		config: {},
		...app,
	} ) );

	const navigation = Array.isArray( raw.navigation )
		? raw.navigation
		: applications
			.filter( ( a ) => ! a.hidden )
			.map( ( a ) => ( { app: a.id } ) );

	const toolbar =
		typeof raw.toolbar === 'object' && raw.toolbar !== null
			? { left: raw.toolbar.left || [], right: raw.toolbar.right || [] }
			: { left: [], right: [] };

	const showSidebar = layout.navigation !== 'hidden';
	const showToolbar = layout.toolbar !== false;
	const hasToolbarActions = toolbar.left.length > 0 || toolbar.right.length > 0;

	const defaultApp =
		raw.defaultApp || applications.find( ( a ) => ! a.hidden )?.id || null;

	const systemApps = buildSystemApps( {
		branding,
		navigation,
		layout,
		toolbar,
		hasToolbarActions,
	} );

	const regions = buildRegions( {
		showSidebar,
		showToolbar: showToolbar && hasToolbarActions,
		layout,
		systemApps,
	} );

	return {
		// Top-level identity carries forward.
		name: raw.name,
		title: raw.title,
		description: raw.description,
		version: 1,

		// Backwards-compatible mirrors so any code still reading the v0
		// surface during M1 keeps working until M2 fully retires the shim.
		branding,
		layout,
		applications: [ ...applications, ...systemApps ],
		navigation,
		toolbar,
		defaultApp,

		// v1 partitioned settings.
		settings: {
			shell: {
				layoutEngine: ENGINE_ID,
				config: {
					regions: Object.keys( regions ),
				},
			},
			regions,
			applications: [ ...applications, ...systemApps ],
			defaultRoute: defaultApp ? `/${ defaultApp }` : null,
		},
		styles: stylesFromBranding( branding ),
		defaultRoute: defaultApp ? `/${ defaultApp }` : null,
	};
}

function stylesFromBranding( branding ) {
	const accent = branding?.accentColor || '#3858e9';
	return {
		branding,
		color: {
			bg: {
				interactive: {
					brand: { strong: accent, 'strong-active': accent },
				},
				surface: {
					neutral: { strong: '#ffffff' },
				},
			},
			fg: {
				content: {
					neutral: { default: '#1e1e1e' },
				},
			},
			stroke: {
				focus: { brand: accent },
			},
		},
		border: { width: { focus: '2px' } },
		chrome: {
			sidebar: {
				background: '#1e1e1e',
				foreground: '#949494',
				'foreground-active': '#e0e0e0',
				border: '#2f2f2f',
				item: {
					background: 'transparent',
					'background-hover': '#2f2f2f',
					'background-active': accent,
					foreground: '#e0e0e0',
					'foreground-active': '#ffffff',
				},
				width: '300px',
			},
			toolbar: {
				background: '#1e1e1e',
				foreground: '#e0e0e0',
				border: '#2f2f2f',
				height: '48px',
			},
			'site-hub': {
				background: '#1e1e1e',
				foreground: '#ffffff',
				'icon-size': '32px',
				padding: '12px',
			},
			content: {
				background: '#1e1e1e',
				'card-background': '#ffffff',
				'card-radius': '4px',
				'card-padding': '16px',
				'card-max-width': '1200px',
			},
		},
	};
}

function buildSystemApps( { navigation, layout, toolbar, hasToolbarActions } ) {
	const apps = [
		{
			id: '__site-hub',
			source: 'core:site-hub',
			hidden: true,
			config: {},
		},
		{
			id: '__nav',
			source: 'core:navigation',
			hidden: true,
			config: {
				items: navigation,
				collapsed: !! layout.navigationCollapsed,
			},
		},
		{
			id: '__command-picker',
			source: 'core:command-picker',
			hidden: true,
			config: {},
		},
	];

	if ( hasToolbarActions ) {
		apps.push( {
			id: '__toolbar-actions',
			source: 'core:toolbar-actions',
			hidden: true,
			config: { left: toolbar.left, right: toolbar.right },
		} );
	}

	return apps;
}

function buildRegions( { showSidebar, showToolbar, layout, systemApps } ) {
	const regions = {};

	if ( showToolbar ) {
		regions.toolbar = {
			id: 'toolbar',
			source: 'core:toolbar-region',
			kind: 'persistent',
			config: { height: 48 },
			contains: [ '__toolbar-actions' ].filter( ( id ) =>
				systemApps.some( ( a ) => a.id === id )
			),
		};
	}

	if ( showSidebar ) {
		regions.sidebar = {
			id: 'sidebar',
			source: 'core:sidebar-region',
			kind: 'persistent',
			config: {
				position: 'left',
				width: layout.navigationWidth || 300,
				collapsed: !! layout.navigationCollapsed,
			},
			contains: layout.navigationCollapsed
				? [ '__nav' ]
				: [ '__site-hub', '__nav' ],
		};
	}

	regions.content = {
		id: 'content',
		source: 'core:content-region',
		kind: 'persistent',
		config: { router: true, selectionScope: 'content' },
		contains: [],
	};

	regions[ 'command-palette' ] = {
		id: 'command-palette',
		source: 'core:overlay-region',
		kind: 'overlay',
		config: {},
		contains: [ '__command-picker' ],
	};

	return regions;
}

function emptyConfig() {
	return {
		name: 'empty',
		title: 'Empty',
		version: 1,
		branding: { accentColor: '#3858e9' },
		layout: { toolbar: false, navigation: 'hidden' },
		applications: [],
		navigation: [],
		toolbar: { left: [], right: [] },
		settings: {
			shell: { layoutEngine: ENGINE_ID, config: { regions: [ 'content' ] } },
			regions: {
				content: {
					id: 'content',
					source: 'core:content-region',
					kind: 'persistent',
					config: { router: true },
					contains: [],
				},
			},
			applications: [],
		},
		styles: { branding: { accentColor: '#3858e9' } },
		defaultRoute: null,
	};
}
