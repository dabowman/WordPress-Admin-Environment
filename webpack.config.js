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
				// WPDS baseline: `@wordpress/theme/src/prebuilt/css/design-tokens.css`
				// ships the canonical `:root { --wpds-*: ... }` block (140 slots
				// for WP 6.9). Externals plugin maps `@wordpress/theme/design-tokens.css`
				// to a bogus `wp-theme/design-tokens.css` script handle; copying the
				// file out + enqueuing it as its own stylesheet handle bypasses the
				// externalization and guarantees the baseline lands at `:root` before
				// any shell / engine / app CSS rule references the tokens.
				{
					from: path.resolve(
						__dirname,
						'node_modules/@wordpress/theme/src/prebuilt/css/design-tokens.css'
					),
					to: path.resolve( __dirname, 'build/wpds-tokens.css' ),
				},
			],
		} ),
	],
};
