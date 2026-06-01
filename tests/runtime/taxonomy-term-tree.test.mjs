#!/usr/bin/env node
/**
 * Pure term-tree helper tests (`src/apps/taxonomy/termTree.mjs`).
 *
 * Pins the client-side hierarchy rebuild that drives the Categories indented
 * list + parent-picker (issue #115): depth-first ordering, depth annotation,
 * orphan-as-root recovery, self-/cyclic-parent guards, and the indent-label
 * prefix.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { buildTermTree, indentLabel } = await import(
	resolve( projectRoot, 'src/apps/taxonomy/termTree.mjs' )
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

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	ok( label, a === e, a === e ? '' : `expected ${ e }, got ${ a }` );
}

console.log( '\n— buildTermTree orders depth-first with depth annotation —' );
{
	// Jazz(1) → Bebop(2) → Big Band(3); Rock(4) sibling root.
	const terms = [
		{ id: 1, name: 'Jazz', parent: 0 },
		{ id: 4, name: 'Rock', parent: 0 },
		{ id: 2, name: 'Bebop', parent: 1 },
		{ id: 3, name: 'Big Band', parent: 2 },
	];
	eq(
		'ids in depth-first order',
		buildTermTree( terms ).map( ( n ) => [ n.id, n.depth ] ),
		[
			[ 1, 0 ],
			[ 2, 1 ],
			[ 3, 2 ],
			[ 4, 0 ],
		]
	);
}

console.log( '\n— orphan terms fall back to roots —' );
{
	// Parent 99 not in the set → child treated as a root (depth 0), not lost.
	const terms = [ { id: 5, name: 'Orphan', parent: 99 } ];
	const out = buildTermTree( terms );
	eq( 'orphan kept as root', out, [
		{ id: 5, name: 'Orphan', parent: 99, depth: 0 },
	] );
}

console.log( '\n— cyclic / self parents do not loop forever —' );
{
	const selfParent = [ { id: 7, name: 'Loop', parent: 7 } ];
	// parent === own id is not present as a *different* node, so it's a root.
	eq( 'self-parent kept once', buildTermTree( selfParent ), [
		{ id: 7, name: 'Loop', parent: 7, depth: 0 },
	] );

	// A ↔ B mutual parents: visited-set guard breaks the walk; both appear once.
	const mutual = [
		{ id: 10, name: 'A', parent: 11 },
		{ id: 11, name: 'B', parent: 10 },
	];
	const out = buildTermTree( mutual );
	ok( 'mutual cycle emits both nodes once', out.length === 2, JSON.stringify( out ) );
	ok(
		'mutual cycle has no duplicate ids',
		new Set( out.map( ( n ) => n.id ) ).size === 2
	);
}

console.log( '\n— empty / non-array input is safe —' );
{
	eq( 'undefined → []', buildTermTree( undefined ), [] );
	eq( 'empty → []', buildTermTree( [] ), [] );
}

console.log( '\n— indentLabel prefixes by depth —' );
{
	eq( 'depth 0 unchanged', indentLabel( 'Jazz', 0 ), 'Jazz' );
	eq( 'depth 1 one dash', indentLabel( 'Bebop', 1 ), '— Bebop' );
	eq( 'depth 2 two dashes', indentLabel( 'Big Band', 2 ), '— — Big Band' );
	eq( 'negative depth treated as 0', indentLabel( 'X', -1 ), 'X' );
}

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
