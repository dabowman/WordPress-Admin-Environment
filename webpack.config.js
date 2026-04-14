const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const DependencyExtractionWebpackPlugin = require( '@wordpress/dependency-extraction-webpack-plugin' );

// Remove the default DependencyExtractionWebpackPlugin so we can add our own
// with custom configuration that externalizes @wordpress/dataviews.
const plugins = defaultConfig.plugins.filter(
	( plugin ) => plugin.constructor.name !== 'DependencyExtractionWebpackPlugin'
);

plugins.push(
	new DependencyExtractionWebpackPlugin( {
		requestToExternal( request ) {
			// Externalize @wordpress/dataviews — it ships with WordPress 6.7+
			// as wp-dataviews but the default config bundles it.
			if ( request === '@wordpress/dataviews' || request === '@wordpress/dataviews/wp' ) {
				return [ 'wp', 'dataviews' ];
			}
		},
		requestToHandle( request ) {
			if ( request === '@wordpress/dataviews' || request === '@wordpress/dataviews/wp' ) {
				return 'wp-dataviews';
			}
		},
	} )
);

module.exports = {
	...defaultConfig,
	plugins,
};
