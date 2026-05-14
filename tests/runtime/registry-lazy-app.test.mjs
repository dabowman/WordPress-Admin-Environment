#!/usr/bin/env node
/**
 * Registry contract for the C5 lazy-app shape.
 *
 * The registry accepts two shapes for `kind: 'app'`:
 *   - eager: `{ Component }` — synchronously available
 *   - lazy:  `{ load: () => Promise<{ default: Component } | Component> }`
 *
 * `resolveComponent(id)` is the single read path that paves over the
 * difference: it returns a Promise either way, caches the resolved
 * component per id, and hydrates the registry entry so subsequent
 * `get()` calls see `Component` directly.
 *
 * This file isolates that contract from React/mount machinery. The
 * React side (Suspense boundary, error fallback) is covered by manual
 * smoke + the pending JSDOM mount suite (issue #30).
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

const EagerComponent = function EagerComponent() {
	return null;
};
const LazyComponent = function LazyComponent() {
	return null;
};

console.log( '\n— registry: lazy app shape —' );

// 1. Eager registration accepted (parity with pre-C5 behavior).
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'app',
			id: 'test:eager',
			Component: EagerComponent,
		} )
	);
	ok( 'eager Component shape accepts', err === null );
	const got = r.get( 'test:eager', 'app' );
	ok( 'eager entry retains Component reference', got?.Component === EagerComponent );
}

// 2. Lazy registration with a load thunk accepted.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'app',
			id: 'test:lazy',
			load: () => Promise.resolve( { default: LazyComponent } ),
		} )
	);
	ok( 'lazy load shape accepts', err === null );
	const got = r.get( 'test:lazy', 'app' );
	ok( 'lazy entry retains load function', typeof got?.load === 'function' );
	ok( 'lazy entry has no Component yet', got?.Component === undefined );
}

// 3. Both Component + load — contradictory, rejected.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'app',
			id: 'test:both',
			Component: EagerComponent,
			load: () => Promise.resolve( { default: LazyComponent } ),
		} )
	);
	ok(
		'both Component + load throws',
		err !== null && /both Component and load/.test( err.message )
	);
}

// 4. load not a function — rejected.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'app',
			id: 'test:bad-load',
			load: 'not a function',
		} )
	);
	ok(
		'non-function load throws',
		err !== null && /load must be a function/.test( err.message )
	);
}

// 5. Lazy engine — rejected. Engines must be eager.
{
	const r = createRegistry();
	const err = throws( () =>
		r.register( {
			kind: 'engine',
			id: 'test:lazy-engine',
			load: () => Promise.resolve( { default: LazyComponent } ),
		} )
	);
	ok(
		'lazy engine throws',
		err !== null && /cannot be lazy/.test( err.message )
	);
}

// 6. resolveComponent resolves an eager registration synchronously
//    (Promise resolves to the same component reference).
{
	const r = createRegistry();
	r.register( {
		kind: 'app',
		id: 'test:eager-resolve',
		Component: EagerComponent,
	} );
	const p = r.resolveComponent( 'test:eager-resolve' );
	ok( 'resolveComponent returns a Promise', p && typeof p.then === 'function' );
	const Component = await p;
	ok( 'eager resolves to registered Component', Component === EagerComponent );
}

// 7. resolveComponent on a lazy registration invokes load() once,
//    caches the resolved component, and unwraps `{ default }`.
{
	const r = createRegistry();
	let loadCalls = 0;
	r.register( {
		kind: 'app',
		id: 'test:lazy-resolve',
		load: () => {
			loadCalls += 1;
			return Promise.resolve( { default: LazyComponent } );
		},
	} );

	const a = await r.resolveComponent( 'test:lazy-resolve' );
	const b = await r.resolveComponent( 'test:lazy-resolve' );
	ok( 'lazy resolves to module.default', a === LazyComponent );
	ok( 'subsequent resolve returns same identity', a === b );
	ok( 'load() called exactly once across two resolves', loadCalls === 1 );

	// And the Promise identity is stable so consumers using
	// `React.lazy` get the same wrapper across renders.
	const p1 = r.resolveComponent( 'test:lazy-resolve' );
	const p2 = r.resolveComponent( 'test:lazy-resolve' );
	ok( 'cached Promise identity stable', p1 === p2 );
}

// 8. resolveComponent accepts a bare-function module (no `default`).
{
	const r = createRegistry();
	r.register( {
		kind: 'app',
		id: 'test:bare',
		load: () => Promise.resolve( LazyComponent ),
	} );
	const Component = await r.resolveComponent( 'test:bare' );
	ok( 'lazy resolves to bare-function module', Component === LazyComponent );
}

// 9. resolveComponent rejects when the module is not a component.
{
	const r = createRegistry();
	r.register( {
		kind: 'app',
		id: 'test:bad-module',
		load: () => Promise.resolve( { default: 'not a component' } ),
	} );
	let caught = null;
	try {
		await r.resolveComponent( 'test:bad-module' );
	} catch ( e ) {
		caught = e;
	}
	ok(
		'lazy rejects when module.default is not a function',
		caught !== null && /did not resolve to a React component/.test( caught.message )
	);
}

// 10. resolveComponent on unknown id returns null.
{
	const r = createRegistry();
	const result = r.resolveComponent( 'test:nonexistent' );
	ok( 'resolveComponent returns null for unknown id', result === null );
}

// 11. resolveComponent on an engine returns null (apps only).
{
	const r = createRegistry();
	const TP = () => null;
	r.register( {
		kind: 'engine',
		id: 'test:engine-resolve',
		Component: EagerComponent,
		ThemeProvider: TP,
	} );
	const result = r.resolveComponent( 'test:engine-resolve' );
	ok( 'resolveComponent returns null for engines', result === null );
}

// 12. After lazy resolve, the registry entry has Component populated so
//     synchronous consumers (the legacy `sourceDef.Component` read path
//     in mountApp) hit the eager path on subsequent renders.
{
	const r = createRegistry();
	r.register( {
		kind: 'app',
		id: 'test:hydrate',
		load: () => Promise.resolve( { default: LazyComponent } ),
	} );
	await r.resolveComponent( 'test:hydrate' );
	const got = r.get( 'test:hydrate', 'app' );
	ok( 'lazy entry hydrates Component after first resolve', got?.Component === LazyComponent );
}

// 13. Duplicate id rejected (parity with eager path).
{
	const r = createRegistry();
	r.register( {
		kind: 'app',
		id: 'test:dup',
		load: () => Promise.resolve( { default: LazyComponent } ),
	} );
	const err = throws( () =>
		r.register( {
			kind: 'app',
			id: 'test:dup',
			load: () => Promise.resolve( { default: EagerComponent } ),
		} )
	);
	ok(
		'duplicate lazy id throws',
		err !== null && /duplicate source id/.test( err.message )
	);
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
