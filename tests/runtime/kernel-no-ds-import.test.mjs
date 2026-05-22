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
 * This file walks every kernel source file (auto-discovery via the
 * filesystem, excluding `src/runtime/engines/`) as strings and
 * regex-rejects any reference that pulls in a DS-specific package
 * (or the relocated `WpdsThemeProvider` path). Future regressions
 * surface immediately — if you find yourself wanting to add an
 * `@wordpress/components` import to one of these files, the right
 * answer is to push the import into an engine's directory instead.
 *
 * Patterns intentionally cover four import shapes — adding a kernel
 * file that smuggles a DS dependency via any of them fails the test:
 *   1. `import … from '<pkg>'`         — named/default/namespace import
 *   2. `import '<pkg>'`                — side-effect import (CSS, etc.)
 *   3. `import('<pkg>')`               — dynamic import expression
 *   4. `require('<pkg>')`              — CommonJS (defensive)
 *
 * Allowed DS-adjacent imports in kernel: `@wordpress/element` (React
 * primitive — no DS opinions), `@wordpress/i18n` (translation —
 * DS-neutral), `@wordpress/compose` (low-level React hooks — no DS
 * opinions). The deny list focuses on packages that carry a specific
 * design system's tokens or visual contract.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

/**
 * Walk `src/runtime/` and collect every `.js` / `.mjs` file outside
 * `src/runtime/engines/`. Dynamic discovery — new kernel files pick
 * up the DS-neutrality check automatically without remembering to
 * append them to a hardcoded list.
 *
 * @return {string[]} Repo-relative POSIX-style paths.
 */
function discoverKernelFiles() {
	const root = resolve( projectRoot, 'src', 'runtime' );
	const enginesDir = resolve( root, 'engines' );
	const out = [];

	function walk( dir ) {
		for ( const entry of readdirSync( dir ) ) {
			const abs = resolve( dir, entry );
			// Skip the engines/ subtree wholesale — DS-flavored code lives
			// there by design.
			if ( abs === enginesDir ) {
				continue;
			}
			const st = statSync( abs );
			if ( st.isDirectory() ) {
				walk( abs );
				continue;
			}
			if ( ! st.isFile() ) {
				continue;
			}
			if ( ! /\.(?:js|mjs)$/.test( entry ) ) {
				continue;
			}
			const rel = relative( projectRoot, abs ).split( sep ).join( '/' );
			out.push( rel );
		}
	}

	walk( root );
	out.sort();
	return out;
}

const KERNEL_FILES = discoverKernelFiles();

/**
 * Imports that mark the file as DS-flavored.
 *
 * `@wordpress/components` and `@wordpress/ui` carry specific design
 * tokens and visual contracts (WPDS). `@wordpress/icons` ships a
 * specific icon set. `@wordpress/dataviews` ships a specific
 * data-grid DS. The relocated `WpdsThemeProvider` is core-default's
 * contribution — kernel never imports it directly.
 *
 * Each entry covers four import shapes in one regex via the
 * `(?:…)` alternation: `from "<spec>"`, bare side-effect `import
 * "<spec>"`, dynamic `import("<spec>")`, and CommonJS
 * `require("<spec>")`. Quote char is captured loosely (single or
 * double) — JS sources use either.
 *
 * @param {string} spec Forbidden import specifier as a regex-safe
 *                      string (escape `/` and `\` if you ever add a
 *                      regex special). Trailing `(?:\/[^'"]*)?` is
 *                      tacked on by `makePattern` when needed for
 *                      subpaths.
 * @param {boolean} matchSubpaths True to also flag `<spec>/anything`.
 * @return {RegExp}
 */
function makePattern( spec, matchSubpaths = false ) {
	// Escape any regex specials in the package specifier. We expect
	// only forward slashes / hyphens / at-signs / dots today, but be
	// defensive in case a future entry adds something exotic.
	const escaped = spec.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	const tail = matchSubpaths ? '(?:\\/[^\'"]*)?' : '';
	const inside = `${ escaped }${ tail }`;
	// `from "<x>"` | `import "<x>"` (side-effect) | `import("<x>")`
	// (dynamic) | `require("<x>")` (CommonJS).
	return new RegExp(
		`(?:` +
			`from\\s+['"]${ inside }['"]` +
			`|import\\s+['"]${ inside }['"]` +
			`|import\\s*\\(\\s*['"]${ inside }['"]\\s*\\)` +
			`|require\\s*\\(\\s*['"]${ inside }['"]\\s*\\)` +
		`)`
	);
}

const FORBIDDEN_PATTERNS = [
	{
		label: '@wordpress/components (incl. subpaths)',
		regex: makePattern( '@wordpress/components', true ),
	},
	{
		label: '@wordpress/ui (incl. subpaths)',
		regex: makePattern( '@wordpress/ui', true ),
	},
	{
		label: '@wordpress/icons (incl. subpaths)',
		regex: makePattern( '@wordpress/icons', true ),
	},
	{
		label: '@wordpress/dataviews (incl. subpaths)',
		regex: makePattern( '@wordpress/dataviews', true ),
	},
	{
		label: 'relocated WpdsThemeProvider (sibling path)',
		regex: makePattern( './WpdsThemeProvider', false ),
	},
	{
		label: 'relocated WpdsThemeProvider (kernel-side relative path)',
		regex: makePattern( '../styles/WpdsThemeProvider', false ),
	},
	{
		label: 'relocated WpdsThemeProvider (legacy kernel path)',
		regex: makePattern( '../../styles/WpdsThemeProvider', false ),
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
	`discovered ${ KERNEL_FILES.length } kernel file(s)`
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
	'every kernel file was readable',
	unreachable === 0,
	`${ unreachable } file(s) failed to load`
);

// ---------------------------------------------------------------------------
// Self-tests for FORBIDDEN_PATTERNS: each regex must detect every import
// shape. Without these the test could silently regress to "regex catches
// nothing" while still emitting PASS for every kernel file (false negative
// risk). Pair a positive corpus + a negative corpus per package.
// ---------------------------------------------------------------------------

console.log( '\n— pattern self-tests —' );

const POSITIVE_SAMPLES = {
	'@wordpress/components': [
		`import { Button } from '@wordpress/components';`,
		`import { Button } from "@wordpress/components";`,
		`import Button from '@wordpress/components';`,
		`import * as components from '@wordpress/components';`,
		`import '@wordpress/components';`,
		`import '@wordpress/components/build-style/style.css';`,
		`const mod = await import( '@wordpress/components' );`,
		`const { Button } = require( '@wordpress/components' );`,
	],
	'@wordpress/ui': [
		`import { Notice } from '@wordpress/ui';`,
		`import '@wordpress/ui/build-module/notice/style.css';`,
		`const mod = await import('@wordpress/ui');`,
		`require( '@wordpress/ui' );`,
	],
	'@wordpress/icons': [
		`import { wordpress } from '@wordpress/icons';`,
		`import '@wordpress/icons/build/index.css';`,
		`import( '@wordpress/icons' );`,
		`require('@wordpress/icons');`,
	],
	'@wordpress/dataviews': [
		`import { DataViews } from '@wordpress/dataviews/wp';`,
		`import '@wordpress/dataviews/build-style/style.css';`,
		`import('@wordpress/dataviews');`,
		`require( '@wordpress/dataviews' );`,
	],
	'./WpdsThemeProvider': [
		`import { WpdsThemeProvider } from './WpdsThemeProvider';`,
		`import './WpdsThemeProvider';`,
		`import( './WpdsThemeProvider' );`,
		`require('./WpdsThemeProvider');`,
	],
	'../styles/WpdsThemeProvider': [
		`import { WpdsThemeProvider } from '../styles/WpdsThemeProvider';`,
		`import '../styles/WpdsThemeProvider';`,
	],
	'../../styles/WpdsThemeProvider': [
		`import { WpdsThemeProvider } from '../../styles/WpdsThemeProvider';`,
		`import '../../styles/WpdsThemeProvider';`,
	],
};

const NEGATIVE_SAMPLES = [
	// Allowed @wordpress/* packages.
	`import { useState } from '@wordpress/element';`,
	`import { __ } from '@wordpress/i18n';`,
	`import { useDebounce } from '@wordpress/compose';`,
	// Allowed @wordpress/* in CommonJS shape.
	`require( '@wordpress/element' );`,
	// Adjacent package names that should NOT match each other.
	`import { foo } from '@wordpress/components-extra';`,
	`import { foo } from '@wordpress/icons-extra';`,
	// Plain prose mentioning the package name (no import syntax).
	`// uses @wordpress/components under the hood`,
	`/* see @wordpress/icons for the icon names */`,
];

// Map each pattern label to its positive-sample key for self-test.
const SELF_TEST_KEY = {
	'@wordpress/components (incl. subpaths)': '@wordpress/components',
	'@wordpress/ui (incl. subpaths)': '@wordpress/ui',
	'@wordpress/icons (incl. subpaths)': '@wordpress/icons',
	'@wordpress/dataviews (incl. subpaths)': '@wordpress/dataviews',
	'relocated WpdsThemeProvider (sibling path)': './WpdsThemeProvider',
	'relocated WpdsThemeProvider (kernel-side relative path)':
		'../styles/WpdsThemeProvider',
	'relocated WpdsThemeProvider (legacy kernel path)':
		'../../styles/WpdsThemeProvider',
};

for ( const { label, regex } of FORBIDDEN_PATTERNS ) {
	const samples = POSITIVE_SAMPLES[ SELF_TEST_KEY[ label ] ] || [];
	if ( samples.length === 0 ) {
		ok(
			`pattern self-test: ${ label } has at least one positive sample`,
			false,
			`no positive samples mapped — update POSITIVE_SAMPLES`
		);
		continue;
	}
	for ( const sample of samples ) {
		ok(
			`pattern catches: ${ label } / ${ sample.slice( 0, 60 ) }${
				sample.length > 60 ? '…' : ''
			}`,
			regex.test( sample )
		);
	}
}

// Negative samples must NOT trigger any pattern.
for ( const sample of NEGATIVE_SAMPLES ) {
	for ( const { label, regex } of FORBIDDEN_PATTERNS ) {
		ok(
			`pattern does NOT match allowed code (${ label }): ${ sample.slice(
				0,
				60
			) }${ sample.length > 60 ? '…' : '' }`,
			! regex.test( sample )
		);
	}
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
