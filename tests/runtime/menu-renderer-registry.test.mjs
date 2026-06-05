#!/usr/bin/env node
/**
 * Kernel menu-renderer registry contract test.
 *
 * The registry is DS-neutral and global (renderer-id keyed). Built-in,
 * engine-owned, and plugin renderers all register the same way and
 * resolve through the same path — that uniformity is what lets a
 * third-party engine plug a menu renderer in without kernel changes.
 * This suite verifies registration, lookup, first-wins dedup, the miss
 * fallback, and dev-warn behavior.
 *
 * Each scenario constructs a fresh registry via
 * `createMenuRendererRegistry()` so state never leaks between tests.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { createMenuRendererRegistry } = await import(
	resolve( projectRoot, 'src/runtime/config/menuRendererRegistry.js' )
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

function withSilentWarn( fn ) {
	const original = console.warn;
	const captured = [];
	console.warn = ( ...args ) => captured.push( args.join( ' ' ) );
	try {
		fn();
	} finally {
		console.warn = original;
	}
	return captured;
}

const RendererA = () => 'A';
const RendererB = () => 'B';

console.log( '\n— registry returns the registered renderer by id —' );
{
	const { registerMenuRenderer, resolveMenuRenderer } =
		createMenuRendererRegistry();
	registerMenuRenderer( 'sidebar-drilldown', RendererA );
	ok(
		'resolves a registered id to its component',
		resolveMenuRenderer( 'sidebar-drilldown' ) === RendererA
	);
}

console.log( '\n— unknown id resolves to null + warns once —' );
{
	const { resolveMenuRenderer } = createMenuRendererRegistry();
	const warnings = withSilentWarn( () => {
		ok(
			'unknown id → null',
			resolveMenuRenderer( 'plugin:acme/missing' ) === null
		);
		// Second miss on the same id must not re-warn.
		resolveMenuRenderer( 'plugin:acme/missing' );
	} );
	ok(
		'warns exactly once per unknown id',
		warnings.length === 1,
		`got ${ warnings.length } warnings`
	);
}

console.log( '\n— empty / missing id resolves to null —' );
{
	const { resolveMenuRenderer } = createMenuRendererRegistry();
	ok( 'empty id → null', resolveMenuRenderer( '' ) === null );
	ok( 'undefined id → null', resolveMenuRenderer( undefined ) === null );
}

console.log( '\n— first registration wins on a duplicate id —' );
{
	const { registerMenuRenderer, resolveMenuRenderer } =
		createMenuRendererRegistry();
	registerMenuRenderer( 'drawer', RendererA );
	const warnings = withSilentWarn( () => {
		registerMenuRenderer( 'drawer', RendererB );
	} );
	ok(
		'duplicate id keeps the first component',
		resolveMenuRenderer( 'drawer' ) === RendererA
	);
	ok(
		'duplicate registration warns',
		warnings.length === 1,
		`got ${ warnings.length } warnings`
	);
}

console.log( '\n— invalid registration args are ignored —' );
{
	const { registerMenuRenderer, resolveMenuRenderer } =
		createMenuRendererRegistry();
	registerMenuRenderer( '', RendererA );
	registerMenuRenderer( 'sidebar-tree', null );
	ok( 'empty id not registered', resolveMenuRenderer( '' ) === null );
	ok(
		'null component not registered',
		resolveMenuRenderer( 'sidebar-tree' ) === null
	);
}

console.log( '\n— registries are isolated —' );
{
	const r1 = createMenuRendererRegistry();
	const r2 = createMenuRendererRegistry();
	r1.registerMenuRenderer( 'dock', RendererA );
	ok(
		'registration in one registry does not leak to another',
		r2.resolveMenuRenderer( 'dock' ) === null
	);
}

console.log( '\n— subscribers fire on a (late) registration —' );
{
	const { registerMenuRenderer, subscribeMenuRenderers } =
		createMenuRendererRegistry();
	let calls = 0;
	const unsubscribe = subscribeMenuRenderers( () => {
		calls++;
	} );
	registerMenuRenderer( 'plugin:acme/menu', RendererA );
	ok( 'listener fires on registration', calls === 1 );

	// Duplicate (ignored) registration must NOT notify — nothing changed.
	withSilentWarn( () => {
		registerMenuRenderer( 'plugin:acme/menu', RendererB );
	} );
	ok( 'duplicate registration does not notify', calls === 1 );

	// Invalid registration must NOT notify either.
	registerMenuRenderer( '', RendererA );
	registerMenuRenderer( 'plugin:acme/other', null );
	ok( 'invalid registration does not notify', calls === 1 );

	// A second valid id notifies again.
	registerMenuRenderer( 'plugin:acme/two', RendererB );
	ok( 'second valid registration notifies', calls === 2 );

	// After unsubscribe, no more notifications.
	unsubscribe();
	registerMenuRenderer( 'plugin:acme/three', RendererA );
	ok( 'unsubscribed listener stops firing', calls === 2 );
}

console.log( '\n— registry owns a monotonic registration epoch —' );
{
	const { registerMenuRenderer, getMenuRendererEpoch } =
		createMenuRendererRegistry();
	ok( 'epoch starts at 0', getMenuRendererEpoch() === 0 );

	registerMenuRenderer( 'plugin:acme/menu', RendererA );
	ok(
		'epoch bumps on a valid registration',
		getMenuRendererEpoch() === 1,
		`got ${ getMenuRendererEpoch() }`
	);

	// Duplicate (ignored) registration must NOT bump.
	withSilentWarn( () => {
		registerMenuRenderer( 'plugin:acme/menu', RendererB );
	} );
	ok(
		'epoch does not bump on a duplicate registration',
		getMenuRendererEpoch() === 1
	);

	// Invalid registrations must NOT bump.
	registerMenuRenderer( '', RendererA );
	registerMenuRenderer( 'plugin:acme/null', null );
	ok( 'epoch does not bump on invalid args', getMenuRendererEpoch() === 1 );

	registerMenuRenderer( 'plugin:acme/two', RendererB );
	ok( 'epoch bumps again on a second valid id', getMenuRendererEpoch() === 2 );
}

console.log(
	'\n— epoch is incremented BEFORE listeners fire (no insertion-order dependence) —'
);
{
	const { registerMenuRenderer, subscribeMenuRenderers, getMenuRendererEpoch } =
		createMenuRendererRegistry();
	let observed = -1;
	// Subscribe a listener that reads the snapshot when notified — mirrors
	// React's `useSyncExternalStore` reading `getSnapshot` on a store change.
	subscribeMenuRenderers( () => {
		observed = getMenuRendererEpoch();
	} );
	registerMenuRenderer( 'plugin:acme/menu', RendererA );
	ok(
		'listener observes the post-increment epoch',
		observed === 1,
		`got ${ observed }`
	);
}

console.log( '\n— subscribe ignores a non-function listener —' );
{
	const { registerMenuRenderer, subscribeMenuRenderers } =
		createMenuRendererRegistry();
	const unsubscribe = subscribeMenuRenderers( null );
	ok(
		'non-function listener returns a no-op unsubscribe',
		typeof unsubscribe === 'function'
	);
	// Must not throw when a registration happens with a bogus listener.
	let threw = false;
	try {
		registerMenuRenderer( 'plugin:acme/safe', RendererA );
	} catch ( e ) {
		threw = true;
	}
	ok( 'registration with no real listener does not throw', ! threw );
}

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
