#!/usr/bin/env node
/**
 * filterReachableTools tests (issue #207).
 *
 * Pure-ESM helper that hides Tools landing cards whose target screen the
 * server pruned out of `config.screens` for the current user — so a card
 * renders iff `navigate( tool.path )` will resolve, instead of falling
 * through to the default route (the silent dead route).
 *
 * Run: `node tests/runtime/tools-filter-reachable.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { filterReachableTools } = await import(
	resolve( projectRoot, 'src/apps/tools/filterReachableTools.mjs' )
);

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	ok( label, a === e, `expected ${ e } got ${ a }` );
}

const TOOLS = [
	{ id: 'site-health', path: '/tools/site-health' },
	{ id: 'import', path: '/tools/import' },
	{ id: 'export', path: '/tools/export' },
	{ id: 'export-personal-data', path: '/tools/export-personal-data' },
	{ id: 'erase-personal-data', path: '/tools/erase-personal-data' },
];

console.log( '— filterReachableTools: admin keeps every card —\n' );

const adminScreens = {};
for ( const t of TOOLS ) {
	adminScreens[ t.id ] = { path: t.path };
}
eq(
	'all five screens present → all five cards',
	filterReachableTools( TOOLS, adminScreens ).map( ( t ) => t.id ),
	[
		'site-health',
		'import',
		'export',
		'export-personal-data',
		'erase-personal-data',
	]
);

console.log( '\n— filterReachableTools: editor (no import/export/privacy) —\n' );

// Editor reaches the loosely-gated Tools landing but the server pruned the
// import/export/privacy screens — only site-health (if cap-met) survives.
// Model the harder case: editor lacks site-health too → zero tools.
eq(
	'editor with only site-health reachable → one card',
	filterReachableTools( TOOLS, {
		'site-health': { path: '/tools/site-health' },
	} ).map( ( t ) => t.id ),
	[ 'site-health' ]
);

eq(
	'editor with no reachable tool screens → empty',
	filterReachableTools( TOOLS, {} ),
	[]
);

console.log( '\n— filterReachableTools: matches on path, not id —\n' );

// A screen whose id differs from the card id but whose path matches still
// keeps the card (the helper keys on `path`, the string navigate() uses).
eq(
	'screen id differs but path matches → card kept',
	filterReachableTools(
		[ { id: 'import', path: '/tools/import' } ],
		{ 'ingested-import': { path: '/tools/import' } }
	).map( ( t ) => t.id ),
	[ 'import' ]
);

// A screen present under the same id but a different path does NOT keep the
// card — the route navigate() targets wouldn't resolve.
eq(
	'same id but different path → card dropped',
	filterReachableTools(
		[ { id: 'import', path: '/tools/import' } ],
		{ import: { path: '/somewhere/else' } }
	),
	[]
);

console.log( '\n— filterReachableTools: optimistic fallbacks —\n' );

eq(
	'undefined screens map → render all (optimistic)',
	filterReachableTools( TOOLS, undefined ).map( ( t ) => t.id ),
	TOOLS.map( ( t ) => t.id )
);

eq(
	'null screens map → render all (optimistic)',
	filterReachableTools( TOOLS, null ).map( ( t ) => t.id ),
	TOOLS.map( ( t ) => t.id )
);

eq(
	'non-array tools → empty',
	filterReachableTools( null, adminScreens ),
	[]
);

console.log( '\n— filterReachableTools: malformed screen entries —\n' );

eq(
	'null / non-object / path-less screen entries are skipped safely',
	filterReachableTools( TOOLS, {
		a: null,
		b: 'nope',
		c: { path: 42 },
		'site-health': { path: '/tools/site-health' },
	} ).map( ( t ) => t.id ),
	[ 'site-health' ]
);

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
