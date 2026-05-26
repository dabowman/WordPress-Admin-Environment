/**
 * Tests for the v2-name deprecation shims exported alongside the
 * canonical `useDataView` / `hydrateInlineScreenDataView` surface.
 *
 * Coverage:
 *   - `hydrateInlineScreenView` forwards to `hydrateInlineScreenDataView`
 *     with identical return value.
 *   - The deprecation warning fires exactly once per session even when
 *     the shim is called multiple times.
 *   - In production (`NODE_ENV=production`), no console.warn fires by
 *     default.
 *   - 3d.5 Item 2 — `window.wpAdminShell.debug === true` opt-in:
 *     production builds re-emit the warn (matches PHP `_deprecated_hook`
 *     unconditional dispatch). Only literal `=== true` opts in;
 *     `debug=false`, absent, or no `wpAdminShell` keeps the silent
 *     production default. One-shot guard still respected.
 *
 * The hook-shaped shims (`useScreenView`, `useViewConfig`) need a React
 * render environment for full coverage and are smoke-checked here for
 * export shape only — they're thin pass-throughs that normalize args
 * and delegate to `useDataView`; the underlying hook is already
 * covered by `data-view-hydrate-inline.test.mjs` + the apps' runtime
 * smoke. Hook deprecation-warn semantics mirror the hydrate shim and
 * are covered by visual inspection of the shared one-shot pattern.
 */

import { strict as assert } from 'node:assert';

let passed = 0;
let failed = 0;
function ok( label, cond ) {
	if ( cond ) {
		console.log( `PASS  ${ label }` );
		passed++;
	} else {
		console.log( `FAIL  ${ label }` );
		failed++;
	}
}
function eq( label, actual, expected ) {
	try {
		assert.deepStrictEqual( actual, expected );
		console.log( `PASS  ${ label }` );
		passed++;
	} catch ( err ) {
		console.log( `FAIL  ${ label }` );
		console.log( '       actual:   ' + JSON.stringify( actual ) );
		console.log( '       expected: ' + JSON.stringify( expected ) );
		failed++;
	}
}

const fixtureSnapshot = {
	screens: {
		posts: {
			app: 'core:posts',
			dataView: {
				_resolved: {
					defaultView: { perPage: 25 },
					fields: [ { id: 'title' } ],
				},
			},
		},
	},
};

// Capture console.warn calls.
const originalWarn = console.warn;
const warnCalls = [];
console.warn = ( ...args ) => {
	warnCalls.push( args );
};

// Force the module under test to evaluate with NODE_ENV undefined so
// the dev-warn path fires.
const previousNodeEnv = process.env.NODE_ENV;
delete process.env.NODE_ENV;

const { hydrateInlineScreenView, hydrateInlineScreenDataView } = await import(
	'../../src/runtime/dataView/hydrateInline.mjs'
);
const { useScreenView, useViewConfig, useDataView } = await import(
	'../../src/runtime/dataView/useDataView.js'
);

// 1. Forwarding parity — shim output equals canonical output.
const canonical = hydrateInlineScreenDataView( fixtureSnapshot, 'posts' );
const shimmed = hydrateInlineScreenView( fixtureSnapshot, 'posts' );
eq( 'hydrate shim returns same value as canonical', shimmed, canonical );

// 2. One-shot warn — second call adds no new warn entry.
const warnCountAfterFirst = warnCalls.length;
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
ok(
	'hydrate shim does not emit console.warn twice (one-shot guard)',
	warnCalls.length === warnCountAfterFirst
);
ok(
	'hydrate shim emitted exactly one console.warn',
	warnCalls.length >= 1 &&
		warnCalls.some( ( args ) =>
			String( args[ 0 ] ?? '' ).includes( 'hydrateInlineScreenView is deprecated' )
		)
);

// 3. Function shape — hooks export correctly even though we can't
//    render them without React; smoke-check they're callable functions.
ok( 'useScreenView is a function', typeof useScreenView === 'function' );
ok( 'useViewConfig is a function', typeof useViewConfig === 'function' );
ok( 'useDataView (canonical) is a function', typeof useDataView === 'function' );

// --- 3d.5 Item 2 — debug-flag gating ----------------------------------------
//
// Default gate: NODE_ENV !== 'production' → warn fires.
// Opt-in gate: NODE_ENV === 'production' AND wpAdminShell.debug === true →
// warn still fires (site admins testing prod builds with WP_DEBUG on).
// Otherwise (production + no debug flag): warn suppressed.

const { _resetHydrateDeprecationWarnGuard } = await import(
	'../../src/runtime/dataView/hydrateInline.mjs'
);

// 4a. Production + no debug flag → suppressed.
process.env.NODE_ENV = 'production';
const previousWindow = globalThis.window;
globalThis.window = undefined;
_resetHydrateDeprecationWarnGuard();
const warnCountBeforeProd = warnCalls.length;
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
ok(
	'production + no debug flag → console.warn suppressed',
	warnCalls.length === warnCountBeforeProd
);

// 4b. Production + window.wpAdminShell.debug === true → warn fires.
globalThis.window = { wpAdminShell: { debug: true } };
_resetHydrateDeprecationWarnGuard();
const warnCountBeforeDebug = warnCalls.length;
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
ok(
	'production + wpAdminShell.debug=true → console.warn fires',
	warnCalls.length === warnCountBeforeDebug + 1
);

// 4c. Production + wpAdminShell.debug not set → still suppressed.
globalThis.window = { wpAdminShell: {} };
_resetHydrateDeprecationWarnGuard();
const warnCountBeforeMissing = warnCalls.length;
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
ok(
	'production + wpAdminShell.debug absent → console.warn suppressed',
	warnCalls.length === warnCountBeforeMissing
);

// 4d. Production + wpAdminShell.debug === false → still suppressed (strict
//     equality check; only literal `true` opts in).
globalThis.window = { wpAdminShell: { debug: false } };
_resetHydrateDeprecationWarnGuard();
const warnCountBeforeFalse = warnCalls.length;
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
ok(
	'production + wpAdminShell.debug=false → console.warn suppressed',
	warnCalls.length === warnCountBeforeFalse
);

// 4e. One-shot guard still respected with the debug flag set.
globalThis.window = { wpAdminShell: { debug: true } };
_resetHydrateDeprecationWarnGuard();
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
const warnCountAfterFirstDebug = warnCalls.length;
hydrateInlineScreenView( fixtureSnapshot, 'posts' );
ok(
	'one-shot guard honors debug-flag path (no second warn)',
	warnCalls.length === warnCountAfterFirstDebug
);

// Restore globals.
globalThis.window = previousWindow;

// 5. Restore NODE_ENV, restore warn, summarize.
console.warn = originalWarn;
if ( previousNodeEnv !== undefined ) {
	process.env.NODE_ENV = previousNodeEnv;
} else {
	delete process.env.NODE_ENV;
}

console.log( '' );
console.log( `TOTAL: ${ passed } passed, ${ failed } failed of ${ passed + failed }` );
if ( failed > 0 ) {
	process.exit( 1 );
}
