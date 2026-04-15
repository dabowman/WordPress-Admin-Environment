const path = require( 'path' );
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const CopyPlugin = require( 'copy-webpack-plugin' );

module.exports = {
	...defaultConfig,
	plugins: [
		...defaultConfig.plugins,
		new CopyPlugin( {
			patterns: [
				{
					from: path.resolve(
						__dirname,
						'node_modules/@wordpress/dataviews/build-style/style.css'
					),
					to: path.resolve( __dirname, 'build/dataviews.css' ),
				},
			],
		} ),
	],
};
