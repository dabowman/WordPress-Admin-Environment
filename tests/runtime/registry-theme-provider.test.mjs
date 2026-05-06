#!/usr/bin/env node
/**
 * Registry validation for the optional engine `ThemeProvider` field
 * introduced in Phase B of the theme-provider overhaul.
 *
 * The full React-side behavior (engine.ThemeProvider takes priority,
 * error-boundary fallback to WPDS default) requires a JSDOM mount and
 * lives in the pending JSDOM smoke suite (issue #30). This file only
 * verifies the registry's validation contract: optional, must be a
 * function when supplied, ignored on non-engine kinds.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { createRegistry } = await import(
	resolve( projectRoot, 'src/runtime/registry/createRegistry.js' )
);

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

function throws( fn ) {
	try {
		fn();
		return null;
	} catch ( e ) {
		return e;
	}
}

const Component = () => null;

console.log( '\n— engine ThemeProvider: registry validation —' );

// 1. Engine with no ThemeProvider — accepted.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'engine',
			id: 'test:no-tp',
			Component,
		} )
	);
	ok( 'engine without ThemeProvider accepts', err === null );
}

// 2. Engine with valid ThemeProvider — accepted, retained on lookup.
{
	const r = createRegistry();
	const TP = () => null;
	const err = throws( () =>
		r.register( {
			kind: 'engine',
			id: 'test:with-tp',
			Component,
			ThemeProvider: TP,
		} )
	);
	ok( 'engine with function ThemeProvider accepts', err === null );

	const got = r.get( 'test:with-tp', 'engine' );
	ok(
		'engine ThemeProvider retained on lookup',
		got && got.ThemeProvider === TP
	);
}

// 3. Engine with non-function ThemeProvider — rejected.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'engine',
			id: 'test:bad-tp',
			Component,
			ThemeProvider: 'not a function',
		} )
	);
	ok(
		'engine with non-function ThemeProvider throws',
		err !== null && /ThemeProvider must be a React component/.test( err.message )
	);
}

// 4. Engine with object-shaped ThemeProvider — rejected.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'engine',
			id: 'test:object-tp',
			Component,
			ThemeProvider: {},
		} )
	);
	ok(
		'engine with object ThemeProvider throws',
		err !== null && /ThemeProvider must be a React component/.test( err.message )
	);
}

// 5. App source with a ThemeProvider field — IGNORED (not validated).
//    Apps don't render a ThemeProvider; the field is meaningless on
//    apps. Registry must not reject.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'app',
			id: 'test:app-with-tp',
			Component,
			ThemeProvider: 'should not be checked',
		} )
	);
	ok( 'app with ThemeProvider field is ignored (no validation)', err === null );
}

// 6. Engine with explicit `undefined` ThemeProvider — accepted.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'engine',
			id: 'test:undef-tp',
			Component,
			ThemeProvider: undefined,
		} )
	);
	ok( 'engine with explicit undefined ThemeProvider accepts', err === null );
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
