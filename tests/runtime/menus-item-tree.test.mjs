#!/usr/bin/env node
/**
 * Pure menu-item-tree helper tests (`src/apps/menus/menuItemTree.mjs`).
 *
 * Pins the client-side ordering the native classic-menu editor (issue #120,
 * Option B — no drag-and-drop) relies on for its Up / Down / Indent / Outdent
 * controls: depth-first ordering, depth annotation, orphan-as-root recovery,
 * cyclic-parent guards, the ordered sibling list, and the contiguous-order
 * recompute that backs every reorder.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { buildItemTree, siblingsOf, reorderSiblings, parentOf, orderOf } =
	await import( resolve( projectRoot, 'src/apps/menus/menuItemTree.mjs' ) );

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

console.log( '— parentOf / orderOf coercion —' );
{
	eq( 'parent defaults to 0', parentOf( {} ), 0 );
	eq( 'parent reads parent field', parentOf( { parent: 5 } ), 5 );
	eq(
		'parent reads menu_item_parent string fallback',
		parentOf( { menu_item_parent: '7' } ),
		7
	);
	eq( 'order defaults to 0', orderOf( {} ), 0 );
	eq( 'order reads menu_order', orderOf( { menu_order: 3 } ), 3 );
}

console.log( '\n— buildItemTree depth-first ordering —' );
{
	const items = [
		{ id: 1, parent: 0, menu_order: 1 },
		{ id: 2, parent: 1, menu_order: 1 },
		{ id: 3, parent: 1, menu_order: 2 },
		{ id: 4, parent: 0, menu_order: 2 },
	];
	const rows = buildItemTree( items ).map( ( r ) => ( {
		id: r.item.id,
		depth: r.depth,
	} ) );
	eq( 'depth-first with depth annotation', rows, [
		{ id: 1, depth: 0 },
		{ id: 2, depth: 1 },
		{ id: 3, depth: 1 },
		{ id: 4, depth: 0 },
	] );
}

console.log( '\n— sibling order respects menu_order then id —' );
{
	const items = [
		{ id: 10, parent: 0, menu_order: 2 },
		{ id: 11, parent: 0, menu_order: 1 },
		{ id: 12, parent: 0, menu_order: 1 },
	];
	const rows = buildItemTree( items ).map( ( r ) => r.item.id );
	// 11 and 12 both order 1 → tie broken by id; then 10 (order 2).
	eq( 'order then id tiebreak', rows, [ 11, 12, 10 ] );
}

console.log( '\n— orphan reparents to top level —' );
{
	const items = [
		{ id: 1, parent: 0, menu_order: 1 },
		{ id: 2, parent: 999, menu_order: 1 }, // parent off the set.
	];
	const rows = buildItemTree( items ).map( ( r ) => ( {
		id: r.item.id,
		depth: r.depth,
	} ) );
	ok(
		'orphan kept at depth 0, no row dropped',
		rows.length === 2 && rows.every( ( r ) => r.depth === 0 ),
		JSON.stringify( rows )
	);
}

console.log( '\n— cyclic parents never spin / drop —' );
{
	const items = [
		{ id: 1, parent: 2, menu_order: 1 },
		{ id: 2, parent: 1, menu_order: 1 },
	];
	const rows = buildItemTree( items );
	ok(
		'cycle: both items present, no infinite loop',
		rows.length === 2,
		JSON.stringify( rows.map( ( r ) => r.item.id ) )
	);
}

console.log( '\n— siblingsOf —' );
{
	const items = [
		{ id: 1, parent: 0, menu_order: 2 },
		{ id: 2, parent: 0, menu_order: 1 },
		{ id: 3, parent: 1, menu_order: 1 },
	];
	eq(
		'top-level siblings ordered',
		siblingsOf( items, 0 ).map( ( s ) => s.id ),
		[ 2, 1 ]
	);
	eq(
		'child siblings of 1',
		siblingsOf( items, 1 ).map( ( s ) => s.id ),
		[ 3 ]
	);
}

console.log( '\n— reorderSiblings emits only changed orders, contiguous —' );
{
	const ordered = [
		{ id: 1, menu_order: 1 }, // already 1 → unchanged.
		{ id: 2, menu_order: 5 }, // should become 2.
		{ id: 3, menu_order: 9 }, // should become 3.
	];
	eq( 'recompute contiguous, minimal diff', reorderSiblings( ordered ), [
		{ id: 2, menu_order: 2 },
		{ id: 3, menu_order: 3 },
	] );
}

console.log( '\n— empty / non-array inputs —' );
{
	eq( 'empty tree', buildItemTree( [] ), [] );
	eq( 'non-array tree', buildItemTree( null ), [] );
	eq( 'empty reorder', reorderSiblings( [] ), [] );
}

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
