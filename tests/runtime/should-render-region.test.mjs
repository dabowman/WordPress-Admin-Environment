#!/usr/bin/env node
/**
 * shouldRenderRegion — pure capability-gate decision.
 *
 * The decision sits between the kernel's top-level region walk
 * (`src/runtime/kernel.js`) and the React `<Region>` recursive renderer
 * (`src/runtime/regions/Region.js`). Both call into the same pure
 * function so the rule lives in one place.
 *
 * Covers: missing region, no-capability fast-path, missing capMap,
 * unknown capability (optimistic default-allow), explicit allow/deny.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { shouldRenderRegion } = await import(
	resolve( projectRoot, 'src/runtime/capabilities/shouldRenderRegion.mjs' )
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

console.log( '\n— shouldRenderRegion: input validation —' );
ok( 'null region: false', shouldRenderRegion( null, {} ) === false );
ok( 'undefined region: false', shouldRenderRegion( undefined, {} ) === false );
ok( 'non-object region: false', shouldRenderRegion( 'x', {} ) === false );

console.log( '\n— shouldRenderRegion: no capability declared → render —' );
ok(
	'region without capability: true',
	shouldRenderRegion( { id: 'r1' }, { read: true } ) === true
);
ok(
	'region with empty-string capability: true',
	shouldRenderRegion( { id: 'r1', capability: '' }, { read: true } ) === true
);
ok(
	'region with non-string capability: true (defensive)',
	shouldRenderRegion( { id: 'r1', capability: 42 }, { read: true } ) === true
);

console.log( '\n— shouldRenderRegion: optimistic default-allow paths —' );
ok(
	'capability declared, capMap missing: true (optimistic)',
	shouldRenderRegion( { capability: 'manage_options' }, null ) === true
);
ok(
	'capability declared, capMap undefined: true (optimistic)',
	shouldRenderRegion( { capability: 'manage_options' }, undefined ) === true
);
ok(
	'capability declared, capMap is array (not object): true (defensive)',
	shouldRenderRegion( { capability: 'manage_options' }, [] ) === true
);
ok(
	'capability declared, key absent from capMap: true (optimistic)',
	shouldRenderRegion( { capability: 'manage_options' }, { read: true } ) ===
		true
);

console.log( '\n— shouldRenderRegion: explicit allow / deny —' );
ok(
	'capMap[cap] === true: render',
	shouldRenderRegion(
		{ capability: 'manage_options' },
		{ manage_options: true }
	) === true
);
ok(
	'capMap[cap] === false: do NOT render',
	shouldRenderRegion(
		{ capability: 'manage_options' },
		{ manage_options: false }
	) === false
);
ok(
	'capMap[cap] === 0: falsy → do NOT render',
	shouldRenderRegion( { capability: 'manage_options' }, { manage_options: 0 } ) ===
		false
);

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
