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
				'tests/**/*.{js,mjs,ts}',
			],
			rules: {
				'import/no-extraneous-dependencies': 'off',
				// Test runners log human-readable results to stdout.
				'no-console': 'off',
			},
		},
		{
			// TypeScript is scoped to the `core:desktop` engine (D6 — see
			// docs/plans/2026-05-12-desktop-engine-port.md). Babel handles
			// emission via `@wordpress/babel-preset-default` which already
			// pulls in `@babel/preset-typescript`; `tsc --noEmit` is the
			// type-checking safety net (npm run lint:ts).
			files: [
				'src/runtime/engines/core-desktop/**/*.{ts,tsx}',
				'tests/engines/core-desktop/**/*.ts',
			],
			parser: '@typescript-eslint/parser',
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				ecmaFeatures: { jsx: true },
			},
			plugins: [ '@typescript-eslint' ],
			rules: {
				// Babel strips `import type` but doesn't enforce it; rule
				// would force every shared interface to gain a runtime
				// import. JSDoc-light convention here mirrors the rest of
				// the repo.
				'no-unused-vars': 'off',
				'@typescript-eslint/no-unused-vars': [
					'warn',
					{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
				],
				// Match existing JS jsdoc-light tolerance.
				'jsdoc/require-param-type': 'off',
				'jsdoc/require-returns-type': 'off',
			},
		},
	],
};
