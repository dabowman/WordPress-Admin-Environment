#!/usr/bin/env node
/**
 * Static-analysis regression guard for the kernel DS-neutrality
 * contract (CLAUDE.md "Key rules" — first bullet).
 *
 * The kernel — `src/runtime/*` outside `src/runtime/engines/` — owns
 * the cascade resolver, routing, capability gating, region rendering,
 * `ThemeProviderHost` seam, bindings, dirty-state, icon registry, and
 * dynamic-children store. None of it consumes a design system. A
 * hypothetical Material Design engine plugin loading alongside this
 * plugin must still work.
 *
 * This file scans kernel source files as strings and regex-rejects any
 * `import` statement that pulls in a DS-specific package (or the
 * relocated `WpdsThemeProvider` path). Future regressions surface
 * immediately — if you find yourself wanting to add an
 * `@wordpress/components` import to one of these files, the right
 * answer is to push the import into an engine's directory instead.
 *
 * Allowed DS-adjacent imports in kernel: `@wordpress/element` (React
 * primitive — no DS opinions), `@wordpress/i18n` (translation —
 * DS-neutral), `@wordpress/compose` (low-level React hooks — no DS
 * opinions). The deny list focuses on packages that carry a specific
 * design system's tokens or visual contract.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

/**
 * Files that constitute "the kernel" — anything under
 * `src/runtime/` outside `src/runtime/engines/` that runtime code
 * paths flow through.
 */
const KERNEL_FILES = [
	// Top-level mount + provider context.
	'src/runtime/kernel.js',
	'src/runtime/kernel-context.js',
	// Theme-scope seam (host + pure helpers).
	'src/runtime/styles/ThemeProviderHost.js',
	'src/runtime/styles/themeScope.mjs',
	'src/runtime/styles/deepMergeUnder.mjs',
	// Region rendering primitive + helpers.
	'src/runtime/regions/Region.js',
	'src/runtime/regions/mountApp.js',
	'src/runtime/regions/regionKind.js',
	'src/runtime/regions/resolveRegion.mjs',
	'src/runtime/regions/validateRegion.mjs',
	'src/runtime/regions/platformServices.mjs',
	'src/runtime/regions/dynamicChildren.mjs',
	// Capability gating.
	'src/runtime/capabilities/userCan.js',
	'src/runtime/capabilities/shouldRenderRegion.mjs',
	// Bindings + dirty-state — runtime services.
	'src/runtime/bindings/BindingsConsumer.js',
	'src/runtime/dirty-state/NavigationGuard.js',
	// Routing.
	'src/runtime/routing/router.js',
	'src/runtime/routing/useRoute.js',
	'src/runtime/routing/matchRoute.mjs',
	// Registry — must stay DS-neutral; engines/apps add DS-flavored
	// fields only on their own EngineSource/AppSource entries.
	'src/runtime/registry/createRegistry.js',
	'src/runtime/registry/source-types.js',
	// Icon registry — DS-neutral name → React component map.
	// Engines populate at module load; the registry itself doesn't
	// import @wordpress/icons.
	'src/runtime/config/iconMap.js',
];

/**
 * Imports that mark the file as DS-flavored.
 *
 * `@wordpress/components` and `@wordpress/ui` carry specific design
 * tokens and visual contracts (WPDS). `@wordpress/icons` ships a
 * specific icon set. `@wordpress/dataviews` ships a specific
 * data-grid DS. The relocated `WpdsThemeProvider` is core-default's
 * contribution — kernel never imports it directly.
 *
 * Imports listed here are FORBIDDEN in the kernel files above. If
 * you have a legitimate need for one, the file probably belongs in
 * `src/runtime/engines/<name>/` instead.
 */
const FORBIDDEN_PATTERNS = [
	{
		label: '@wordpress/components',
		regex: /from\s+['"]@wordpress\/components['"]/,
	},
	{
		label: '@wordpress/components subpath',
		regex: /from\s+['"]@wordpress\/components\/.*?['"]/,
	},
	{
		label: '@wordpress/ui',
		regex: /from\s+['"]@wordpress\/ui['"]/,
	},
	{
		label: '@wordpress/ui subpath',
		regex: /from\s+['"]@wordpress\/ui\/.*?['"]/,
	},
	{
		label: '@wordpress/icons',
		regex: /from\s+['"]@wordpress\/icons['"]/,
	},
	{
		label: '@wordpress/dataviews',
		regex: /from\s+['"]@wordpress\/dataviews(?:\/.*)?['"]/,
	},
	{
		label: 'relocated WpdsThemeProvider (sibling path)',
		regex: /from\s+['"]\.\/WpdsThemeProvider['"]/,
	},
	{
		label: 'relocated WpdsThemeProvider (kernel-side relative path)',
		regex: /from\s+['"]\.\.\/styles\/WpdsThemeProvider['"]/,
	},
	{
		label: 'relocated WpdsThemeProvider (legacy kernel path)',
		regex: /from\s+['"]\.\.\/\.\.\/styles\/WpdsThemeProvider['"]/,
	},
];

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
		if ( detail ) {
			console.log( `      ${ detail }` );
		}
	}
}

console.log( '\n— kernel DS-neutrality (static scan) —' );

ok(
	'kernel file list is non-empty',
	KERNEL_FILES.length > 0,
	`KERNEL_FILES has ${ KERNEL_FILES.length } entries`
);

let unreachable = 0;
for ( const file of KERNEL_FILES ) {
	const abs = resolve( projectRoot, file );
	let src;
	try {
		src = readFileSync( abs, 'utf8' );
	} catch ( e ) {
		unreachable++;
		ok(
			`kernel file unreadable: ${ file }`,
			false,
			`fs error: ${ e?.message || e }`
		);
		continue;
	}

	for ( const { label, regex } of FORBIDDEN_PATTERNS ) {
		const matched = regex.test( src );
		ok(
			`${ file }: no import of ${ label }`,
			! matched,
			matched
				? `regex matched: ${ regex } — push the import into an engine module instead`
				: ''
		);
	}
}

ok(
	'every listed kernel file was readable',
	unreachable === 0,
	`${ unreachable } file(s) failed to load`
);

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
