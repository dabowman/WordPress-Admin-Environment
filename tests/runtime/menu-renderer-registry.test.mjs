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

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
