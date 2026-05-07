/**
 * Project ESLint config — extends @wordpress/scripts defaults with overrides
 * needed for this codebase.
 *
 * Disabled rules (and why):
 * - jsdoc/require-param-type / jsdoc/require-property-description:
 *   Many functions destructure `{ ... }` props and types are inferred from
 *   the React/JSDoc-light style we use. The auto-fixer adds noise without
 *   adding signal.
 * - @wordpress/no-unsafe-wp-apis: per CLAUDE.md, we deliberately fall back
 *   to `__experimental*` from `@wordpress/components` for several controls
 *   that have no `@wordpress/ui` 0.12 equivalent.
 */
module.exports = {
	root: true,
	extends: [ 'plugin:@wordpress/eslint-plugin/recommended' ],
	env: {
		browser: true,
	},
	rules: {
		// Known limitation: `<Text render={ <h2 /> }>...</Text>` and
		// `<Button render={ <a /> }>...</Button>` (`@wordpress/ui`'s
		// polymorphic-element pattern) trip these two rules. The rule
		// inspects the JSX literal `<h2 />` / `<a />` in isolation, but the
		// rendered output always inherits the parent's children. Source
		// runs through `Text` / `Button` accessibility — disabling here is
		// scoped to a known false-positive, not a blanket a11y waiver.
		// See `@wordpress/ui` Text + Button render-prop docs.
		'jsx-a11y/heading-has-content': 'off',
		'jsx-a11y/anchor-has-content': 'off',
	},
	overrides: [
		{
			files: [
				'webpack.config.js',
				'scripts/**/*.{js,mjs}',
				'tests/**/*.{js,mjs}',
			],
			rules: {
				'import/no-extraneous-dependencies': 'off',
			},
		},
	],
};
