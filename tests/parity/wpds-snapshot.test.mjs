#!/usr/bin/env node
/**
 * WPDS slot-list parity test (plan §M3.8).
 *
 * Run: `node tests/parity/wpds-snapshot.test.mjs`
 *
 * Loads the pinned WPDS snapshot under `src/runtime/styles/wpds-defaults/`
 * and parses the same upstream CSS at runtime. Fails (exit 1) on:
 *
 *   - Added slot:    upstream has a `--wpds-*` the snapshot doesn't.
 *   - Removed slot:  snapshot has a `--wpds-*` upstream no longer ships.
 *   - Renamed slot:  surfaces as one removed + one added.
 *
 * Drift is the signal that a WordPress release needs a coordinated bump
 * downstream (new snapshot file, `$wpds` constant updates, compat-shim
 * decisions per spec §13 #8). Until that bump is intentional, the build
 * blocks here.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { wpdsSlotPattern } from '../../src/runtime/styles/wpds-defaults/_slot-pattern.mjs';

const __dirname    = dirname( fileURLToPath( import.meta.url ) );
const projectRoot  = resolve( __dirname, '..', '..' );

const SNAPSHOT_PATH = resolve( projectRoot, 'src/runtime/styles/wpds-defaults/6.9.json' );
const UPSTREAM_PATH = resolve( projectRoot, 'node_modules/@wordpress/theme/src/prebuilt/css/design-tokens.css' );

let pass = 0;
let fail = 0;

function eq( label, actual, expected ) {
	const ok = JSON.stringify( actual ) === JSON.stringify( expected );
	if ( ok ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
		console.log( `      expected: ${ JSON.stringify( expected ) }` );
		console.log( `      actual:   ${ JSON.stringify( actual ) }` );
	}
}

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

if ( ! existsSync( SNAPSHOT_PATH ) ) {
	console.error( `Missing snapshot: ${ SNAPSHOT_PATH }` );
	process.exit( 2 );
}
if ( ! existsSync( UPSTREAM_PATH ) ) {
	console.error( `Missing upstream CSS: ${ UPSTREAM_PATH }` );
	process.exit( 2 );
}

const snapshot = JSON.parse( readFileSync( SNAPSHOT_PATH, 'utf8' ) );
const upstream = readFileSync( UPSTREAM_PATH, 'utf8' );

const re = wpdsSlotPattern();
const upstreamSlots = {};
let match;
while ( ( match = re.exec( upstream ) ) !== null ) {
	upstreamSlots[ match[ 1 ] ] = match[ 2 ].trim();
}

console.log( '— WPDS parity —' );

const snapshotKeys = Object.keys( snapshot.slots ).sort();
const upstreamKeys = Object.keys( upstreamSlots ).sort();

ok(
	`slot count matches (${ snapshotKeys.length } snapshot vs ${ upstreamKeys.length } upstream)`,
	snapshotKeys.length === upstreamKeys.length
);

const added   = upstreamKeys.filter( ( k ) => ! ( k in snapshot.slots ) );
const removed = snapshotKeys.filter( ( k ) => ! ( k in upstreamSlots ) );
const valueDrifts = upstreamKeys
	.filter( ( k ) => k in snapshot.slots && upstreamSlots[ k ] !== snapshot.slots[ k ] )
	.slice( 0, 10 );

ok( 'no slots added upstream', added.length === 0,   added.length ? `+${ added.length }: ${ added.slice( 0, 5 ).join( ', ' ) }` : '' );
ok( 'no slots removed upstream', removed.length === 0, removed.length ? `-${ removed.length }: ${ removed.slice( 0, 5 ).join( ', ' ) }` : '' );
ok(
	'no value drift on common slots',
	valueDrifts.length === 0,
	valueDrifts.length
		? valueDrifts.map( ( k ) => `${ k }: ${ snapshot.slots[ k ] } → ${ upstreamSlots[ k ] }` ).join( '\n      ' )
		: ''
);

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
