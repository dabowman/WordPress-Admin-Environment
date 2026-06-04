#!/usr/bin/env node
/**
 * mergeFields — pure ref-wins-inline-overrides merge.
 *
 * Mirrors the PHP `WP_Admin_Workspaces_Data_View_Config::merge_fields`
 * semantics on the JS side. The inline-hydration path in `useDataView`
 * reuses the same merge so first-paint renders against the inline
 * cascade snapshot without waiting on /data-view REST.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { mergeFields } = await import(
	resolve( projectRoot, 'src/runtime/dataView/mergeFields.mjs' )
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
	ok( label, a === e, a === e ? '' : `expected ${ e }, got ${ a }` );
}

// Base + inline both empty.
eq( 'empty base + empty inline → empty', mergeFields( [], [] ), [] );

// Inline-only fields append.
eq(
	'empty base → inline appended verbatim',
	mergeFields( [], [ { id: 'a', type: 'text', label: 'A' } ] ),
	[ { id: 'a', type: 'text', label: 'A' } ]
);

// Base passes through when inline is empty.
const base = [
	{ id: 'title', type: 'text', label: 'Title' },
	{ id: 'status', type: 'text', label: 'Status' },
];
eq( 'empty inline → base passes through', mergeFields( base, [] ), base );

// Per-field override (label) — base order preserved, override shallow-merged.
const merged = mergeFields( base, [ { id: 'status', label: 'Post Status' } ] );
eq(
	'inline override merges per-field shallow',
	merged,
	[
		{ id: 'title', type: 'text', label: 'Title' },
		{ id: 'status', type: 'text', label: 'Post Status' },
	]
);

// Inline-only id appended after base.
const appended = mergeFields( base, [
	{ id: 'status', label: 'Status!' },
	{ id: 'author', type: 'text', label: 'Author' },
] );
eq(
	'inline-only id appended after base',
	appended,
	[
		{ id: 'title', type: 'text', label: 'Title' },
		{ id: 'status', type: 'text', label: 'Status!' },
		{ id: 'author', type: 'text', label: 'Author' },
	]
);

// Override preserves base props not redeclared.
const overrideMerged = mergeFields(
	[ { id: 'title', type: 'text', label: 'Title', enableGlobalSearch: true } ],
	[ { id: 'title', label: 'Headline' } ]
);
ok(
	'override preserves base props not redeclared',
	overrideMerged[ 0 ].type === 'text' &&
		overrideMerged[ 0 ].enableGlobalSearch === true &&
		overrideMerged[ 0 ].label === 'Headline'
);

// Duplicate inline ids dedupe — first wins, rest dropped.
const dupMerged = mergeFields( [], [
	{ id: 'foo', type: 'text', label: 'First Foo' },
	{ id: 'foo', type: 'text', label: 'Second Foo' },
	{ id: 'bar', type: 'text', label: 'Bar' },
] );
eq(
	'duplicate inline ids dedupe — first wins',
	dupMerged,
	[
		{ id: 'foo', type: 'text', label: 'First Foo' },
		{ id: 'bar', type: 'text', label: 'Bar' },
	]
);

// Garbage entries skipped.
const dirty = mergeFields(
	[ null, { type: 'text' }, { id: 'a', type: 'text', label: 'A' } ],
	[ undefined, 'not-an-object', { id: 'b', type: 'text', label: 'B' } ]
);
eq(
	'malformed entries dropped',
	dirty,
	[
		{ id: 'a', type: 'text', label: 'A' },
		{ id: 'b', type: 'text', label: 'B' },
	]
);

console.log( `\nTOTAL: ${ pass } passed, ${ fail } failed of ${ pass + fail }\n` );
process.exit( fail > 0 ? 1 : 0 );
