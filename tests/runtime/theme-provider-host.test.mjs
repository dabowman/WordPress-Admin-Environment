#!/usr/bin/env node
/**
 * Tests for the kernel's theme-scope contract. The host
 * (`ThemeProviderHost.js`) consumes pure helpers from `themeScope.mjs`;
 * this file exercises those helpers without mounting React. The
 * React-side behavior (engine `ThemeProvider` priority, error-boundary
 * fallback to the neutral wrapper) requires a JSDOM mount and lives in
 * the pending JSDOM smoke suite (issue #30); the static-analysis test
 * `kernel-no-ds-import.test.mjs` separately asserts that the host has
 * no DS-flavored imports.
 *
 * What's covered here:
 *   1. `pickDensity` — tier-1 (`styles.theme.density`) wins over
 *      raw string passes through unchanged;
 *      undefined/null returns undefined.
 *   2. `hasThemeContent` — recognizes `theme` block + every top-level
 *      override key; returns false for empty / non-object / null input.
 *   3. `scopedSelector` — region: / app: prefixes produce expected
 *      descendant selectors; unknown prefix returns null.
 *   4. `buildScopedDetailCss` — emits the renamed `data-theme-scope-id`
 *      attribute, calls the engine's `compileStyles` hook with
 *      (styles, tokens), serializes all three buckets (top, scoped,
 *      subtrees), and emits empty string when the engine has no
 *      compiler.
 *   5. `THEME_SCOPE_ATTRIBUTE` constant matches the public contract
 *      (regression guard against an accidental rename).
 */
import {
	pickDensity,
	hasThemeContent,
	appendScopedStyles,
	scopedSelector,
	buildScopedDetailCss,
	THEME_SCOPE_ATTRIBUTE,
	THEME_SCOPE_DETAIL_ATTRIBUTE,
} from '../../src/runtime/styles/themeScope.mjs';

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

function eq( label, actual, expected ) {
	const equal = JSON.stringify( actual ) === JSON.stringify( expected );
	ok( label, equal, equal ? '' : `expected ${ JSON.stringify( expected ) }, got ${ JSON.stringify( actual ) }` );
}

console.log( '\n— pickDensity —' );

eq( 'undefined input returns undefined', pickDensity( undefined ), undefined );
eq( 'null input returns undefined', pickDensity( null ), undefined );
eq( 'empty object returns undefined', pickDensity( {} ), undefined );
eq(
	'tier-1 styles.theme.density string returns as-is',
	pickDensity( { theme: { density: 'compact' } } ),
	'compact'
);
eq(
	'top-level styles.density is ignored (theme.density is the only source)',
	pickDensity( { density: 'comfortable' } ),
	undefined
);
eq(
	'non-WPDS density string passes through unchanged (e.g. Material "dense")',
	pickDensity( { theme: { density: 'dense' } } ),
	'dense'
);
eq(
	'non-string density value returns undefined',
	pickDensity( { theme: { density: 42 } } ),
	undefined
);

console.log( '\n— hasThemeContent —' );

eq( 'null returns false', hasThemeContent( null ), false );
eq( 'undefined returns false', hasThemeContent( undefined ), false );
eq( 'non-object returns false', hasThemeContent( 'string' ), false );
eq( 'empty object returns false', hasThemeContent( {} ), false );
eq(
	'tier-1 styles.theme block triggers true',
	hasThemeContent( { theme: {} } ),
	true
);
eq(
	'styles.color block triggers true',
	hasThemeContent( { color: { primary: '#000' } } ),
	true
);
eq(
	'styles.border block triggers true',
	hasThemeContent( { border: {} } ),
	true
);
eq(
	'styles.dimension block triggers true',
	hasThemeContent( { dimension: {} } ),
	true
);
eq(
	'styles.elevation block triggers true',
	hasThemeContent( { elevation: {} } ),
	true
);
eq( 'styles.font block triggers true', hasThemeContent( { font: {} } ), true );
eq(
	'orphan unknown key returns false',
	hasThemeContent( { unrelated: 'foo' } ),
	false
);
eq(
	'non-object value at theme key returns false',
	hasThemeContent( { theme: 'oops' } ),
	false
);

console.log( '\n— appendScopedStyles —' );

// Empty/contentless seed returns the inherited stack unchanged (same
// identity) — the no-op path PortalThemeScope relies on for zero-cost
// when a region doesn't theme away from root.
{
	const base = [ { theme: {} } ];
	ok(
		'contentless seed returns the SAME array identity',
		appendScopedStyles( base, {} ) === base
	);
	ok(
		'null seed returns the same array identity',
		appendScopedStyles( base, null ) === base
	);
	ok(
		'undefined seed returns the same array identity',
		appendScopedStyles( base, undefined ) === base
	);
}

// A seed with theme content is appended (outermost-first order preserved),
// producing a NEW array so React memoization sees a changed reference.
{
	const region = { color: { primary: '#abc' } };
	const app = { theme: { density: 'compact' } };
	const afterRegion = appendScopedStyles( [], region );
	eq( 'first seed appended', afterRegion, [ region ] );
	const afterApp = appendScopedStyles( afterRegion, app );
	eq(
		'second seed appended after the first (region, then app)',
		afterApp,
		[ region, app ]
	);
	ok(
		'append produces a new array (not mutating the inherited one)',
		afterApp !== afterRegion && afterRegion.length === 1
	);
}

// Non-array inherited input is tolerated (treated as empty base).
eq(
	'non-array inherited treated as empty base',
	appendScopedStyles( undefined, { theme: {} } ),
	[ { theme: {} } ]
);

console.log( '\n— scopedSelector —' );

const ROOT = '[data-theme-scope-id="abc123"]';
eq(
	'region:<id> produces descendant data-region-id selector',
	scopedSelector( 'region:sidebar', ROOT ),
	`${ ROOT } [data-region-id="sidebar"]`
);
eq(
	'app:<id> produces descendant data-app-id selector',
	scopedSelector( 'app:core:posts', ROOT ),
	`${ ROOT } [data-app-id="core:posts"]`
);
eq(
	'unknown prefix returns null',
	scopedSelector( 'window:main', ROOT ),
	null
);
eq( 'non-string key returns null', scopedSelector( 123, ROOT ), null );
eq(
	'empty key returns null',
	scopedSelector( '', ROOT ),
	null
);

console.log( '\n— buildScopedDetailCss —' );

// 1. No engine.compileStyles → empty string.
{
	const css = buildScopedDetailCss( {
		engineSource: {},
		styles: { color: { primary: '#abc' } },
		tokens: {},
		providerId: 'pid1',
	} );
	eq( 'no compileStyles hook returns empty string', css, '' );
}

// 2. engine.compileStyles returns empty buckets → empty string.
{
	const engineSource = {
		compileStyles: () => ( { top: {}, scoped: [], subtrees: {} } ),
	};
	const css = buildScopedDetailCss( {
		engineSource,
		styles: {},
		tokens: {},
		providerId: 'pid2',
	} );
	eq( 'empty buckets return empty string', css, '' );
}

// 3. top bucket emits a single scope rule.
{
	const calls = [];
	const engineSource = {
		compileStyles: ( styles, tokens ) => {
			calls.push( { styles, tokens } );
			return {
				top: { '--theme-color': '#3858e9' },
				scoped: [],
				subtrees: {},
			};
		},
	};
	const css = buildScopedDetailCss( {
		engineSource,
		styles: { foo: 'bar' },
		tokens: { 'tokens.x': '1' },
		providerId: 'pid3',
	} );
	ok(
		'top bucket emits the renamed data-theme-scope-id selector',
		css.includes( '[data-theme-scope-id="pid3"] {' ),
		`css = ${ css }`
	);
	ok(
		'top bucket emits the variable line',
		css.includes( '--theme-color: #3858e9;' ),
		`css = ${ css }`
	);
	ok(
		'old wpds-prefixed attribute name is NOT present',
		! css.includes( 'data-wpds-theme-provider-id' ),
		`css = ${ css }`
	);
	eq(
		'compileStyles is called with (styles, tokens) verbatim',
		calls[ 0 ],
		{ styles: { foo: 'bar' }, tokens: { 'tokens.x': '1' } }
	);
}

// 4. scoped bucket emits one rule per entry under the wrapper selector.
{
	const engineSource = {
		compileStyles: () => ( {
			top: {},
			scoped: [
				{
					selector: '.wp-admin-workspaces-nav',
					vars: { '--nav-bg': 'navy' },
				},
				{
					selector: '.wp-admin-workspaces-toolbar',
					vars: { '--tb-bg': 'slate' },
				},
			],
			subtrees: {},
		} ),
	};
	const css = buildScopedDetailCss( {
		engineSource,
		styles: {},
		tokens: {},
		providerId: 'pid4',
	} );
	ok(
		'scoped bucket emits first scoped selector prefixed with the scope wrapper',
		css.includes( '[data-theme-scope-id="pid4"] .wp-admin-workspaces-nav {' ),
		`css = ${ css }`
	);
	ok(
		'scoped bucket emits second scoped selector prefixed with the scope wrapper',
		css.includes(
			'[data-theme-scope-id="pid4"] .wp-admin-workspaces-toolbar {'
		),
		`css = ${ css }`
	);
}

// 5. subtrees bucket routes through scopedSelector.
{
	const engineSource = {
		compileStyles: () => ( {
			top: {},
			scoped: [],
			subtrees: {
				'region:sidebar': { '--side': 'red' },
				'app:core:posts': { '--posts': 'blue' },
				'unknown:scope': { '--ignored': 'yes' },
			},
		} ),
	};
	const css = buildScopedDetailCss( {
		engineSource,
		styles: {},
		tokens: {},
		providerId: 'pid5',
	} );
	ok(
		'subtrees emits region selector',
		css.includes(
			'[data-theme-scope-id="pid5"] [data-region-id="sidebar"] {'
		),
		`css = ${ css }`
	);
	ok(
		'subtrees emits app selector',
		css.includes(
			'[data-theme-scope-id="pid5"] [data-app-id="core:posts"] {'
		),
		`css = ${ css }`
	);
	ok(
		'subtrees skips unknown prefix silently',
		! css.includes( '--ignored: yes' ),
		`css = ${ css }`
	);
}

// 6. Stable scope selector across calls with same providerId.
{
	const engineSource = {
		compileStyles: () => ( {
			top: { '--a': '1' },
			scoped: [],
			subtrees: {},
		} ),
	};
	const a = buildScopedDetailCss( {
		engineSource,
		styles: {},
		tokens: {},
		providerId: 'stableId',
	} );
	const b = buildScopedDetailCss( {
		engineSource,
		styles: {},
		tokens: {},
		providerId: 'stableId',
	} );
	eq( 'same providerId emits identical CSS across calls', a, b );
}

// 7. Compiler that throws is NOT caught here — the React-side error
//    boundary handles render errors. Pure compiler errors should bubble.
{
	const engineSource = {
		compileStyles: () => {
			throw new Error( 'pure compiler failed' );
		},
	};
	let thrown = null;
	try {
		buildScopedDetailCss( {
			engineSource,
			styles: {},
			tokens: {},
			providerId: 'pid7',
		} );
	} catch ( e ) {
		thrown = e;
	}
	ok(
		'compileStyles errors bubble up to the host',
		thrown !== null && /pure compiler failed/.test( thrown.message ),
		thrown ? `caught: ${ thrown.message }` : 'no error thrown'
	);
}

console.log( '\n— attribute constants —' );

eq(
	'THEME_SCOPE_ATTRIBUTE is data-theme-scope-id (no wpds prefix)',
	THEME_SCOPE_ATTRIBUTE,
	'data-theme-scope-id'
);
eq(
	'THEME_SCOPE_DETAIL_ATTRIBUTE is data-theme-scope-detail (no wpds prefix)',
	THEME_SCOPE_DETAIL_ATTRIBUTE,
	'data-theme-scope-detail'
);

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
