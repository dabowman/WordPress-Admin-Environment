/**
 * Validates admin.json and applies defaults for omitted properties.
 *
 * @param {Object} raw - The raw admin.json configuration object.
 * @return {Object} The resolved configuration with all defaults applied.
 */
export function resolveConfig( raw ) {
	const config = { ...raw };

	config.branding = {
		logo: null,
		title: null,
		accentColor: '#3858e9',
		...config.branding,
	};

	config.layout = {
		navigation: 'left',
		navigationCollapsed: false,
		toolbar: true,
		navigationWidth: 300,
		...config.layout,
	};

	config.applications = ( config.applications || [] ).map( ( app ) => ( {
		hidden: false,
		config: {},
		...app,
	} ) );

	if ( ! config.navigation ) {
		config.navigation = config.applications
			.filter( ( app ) => ! app.hidden )
			.map( ( app ) => ( { app: app.id } ) );
	}

	if ( typeof config.toolbar === 'object' && config.toolbar !== null ) {
		config.toolbar.left = config.toolbar.left || [];
		config.toolbar.right = config.toolbar.right || [];
	} else {
		config.toolbar = { left: [], right: [] };
	}

	config.defaultApp =
		config.defaultApp ||
		config.applications.find( ( a ) => ! a.hidden )?.id;

	return config;
}
