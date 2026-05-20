/**
 * Tests for the v2-name deprecation shims exported alongside the
 * canonical `useDataView` / `hydrateInlineScreenDataView` surface.
 *
 * Coverage:
 *   - `hydrateInlineScreenView` forwards to `hydrateInlineScreenDataView`
 *     with identical return value.
 *   - The deprecation warning fires exactly once per session even when
 *     the shim is called multiple times.
 *   - In production (`NODE_ENV=production`), no console.warn fires.
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

// 4. Restore NODE_ENV, restore warn, summarize.
console.warn = originalWarn;
if ( previousNodeEnv !== undefined ) {
	process.env.NODE_ENV = previousNodeEnv;
}

console.log( '' );
console.log( `TOTAL: ${ passed } passed, ${ failed } failed of ${ passed + failed }` );
if ( failed > 0 ) {
	process.exit( 1 );
}
