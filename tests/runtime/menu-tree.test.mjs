#!/usr/bin/env node
/**
 * Pure menu-tree helper tests (`src/runtime/menu/menuTree.mjs`).
 *
 * These helpers are shared across every menu renderer (bundled,
 * engine-owned, plugin). They're DS-neutral and `window`-free so they
 * import directly in node. This suite pins ordering, the injected-
 * predicate prune, separator trimming, hash parsing, leaf flattening, and
 * the drilldown lookup helpers.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const {
	orderTree,
	pruneMenu,
	hashPrimary,
	flattenLeaves,
	findScreen,
	findContainerForPrimary,
} = await import( resolve( projectRoot, 'src/runtime/menu/menuTree.mjs' ) );

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

console.log( '\n— orderTree sorts by position then registration order —' );
{
	const tree = {
		c: { position: 30 },
		a: { position: 10 },
		b: {}, // no position → infinity → last, registration order among ties
		d: { position: 10 }, // ties with a → registration order (a before d)
	};
	eq(
		'sorted ids',
		orderTree( tree ).map( ( i ) => i.id ),
		[ 'a', 'd', 'c', 'b' ]
	);
}

console.log( '\n— orderTree recurses into items —' );
{
	const tree = {
		parent: { items: { y: { position: 2 }, x: { position: 1 } } },
	};
	const ordered = orderTree( tree );
	eq(
		'nested children ordered',
		ordered[ 0 ].items.map( ( i ) => i.id ),
		[ 'x', 'y' ]
	);
}

console.log( '\n— pruneMenu drops hidden + predicate-failed items —' );
{
	const items = [
		{ id: 'visible', href: '#/a' },
		{ id: 'hidden', href: '#/b', hidden: true },
		{ id: 'denied', href: '#/c' },
	];
	const passes = ( item ) => item.id !== 'denied';
	eq(
		'survivors',
		pruneMenu( items, passes ).map( ( i ) => i.id ),
		[ 'visible' ]
	);
}

console.log( '\n— pruneMenu default predicate prunes nothing —' );
{
	const items = [
		{ id: 'a', href: '#/a' },
		{ id: 'b', href: '#/b' },
	];
	eq(
		'all survive with default predicate',
		pruneMenu( items ).map( ( i ) => i.id ),
		[ 'a', 'b' ]
	);
}

console.log( '\n— pruneMenu drops empty containers without own href —' );
{
	const items = [
		{
			id: 'empty-group',
			items: [ { id: 'gone', href: '#/x', hidden: true } ],
		},
		{
			id: 'group-with-href',
			href: '#/grp',
			items: [ { id: 'gone2', href: '#/y', hidden: true } ],
		},
	];
	eq(
		'empty container dropped, container with own href kept',
		pruneMenu( items ).map( ( i ) => i.id ),
		[ 'group-with-href' ]
	);
}

console.log( '\n— pruneMenu trims orphaned edge separators —' );
{
	const items = [
		{ separator: true },
		{ id: 'a', href: '#/a' },
		{ separator: true },
		{ id: 'b', href: '#/b' },
		{ separator: true },
	];
	const out = pruneMenu( items );
	ok(
		'leading + trailing separators trimmed, interior kept',
		out.length === 3 &&
			out[ 0 ].id === 'a' &&
			out[ 1 ].separator === true &&
			out[ 2 ].id === 'b'
	);
}

console.log( '\n— hashPrimary parses in-shell hrefs —' );
{
	eq( 'strips query', hashPrimary( '#/posts?screen=x' ), '/posts' );
	eq( 'adds leading slash', hashPrimary( '#posts' ), '/posts' );
	eq( 'non-hash → null', hashPrimary( 'https://x' ), null );
	eq( 'non-string → null', hashPrimary( undefined ), null );
}

console.log(
	'\n— flattenLeaves pulls leaves up, skips containers/separators —'
);
{
	const items = [
		{ id: 'a', href: '#/a' },
		{ separator: true },
		{ id: 'grp', items: [ { id: 'b', href: '#/b' }, { id: 'noref' } ] },
		{ id: 'c', href: '#/c' },
	];
	eq(
		'flat leaf ids',
		flattenLeaves( items ).map( ( i ) => i.id ),
		[ 'a', 'b', 'c' ]
	);
}

console.log( '\n— findScreen + findContainerForPrimary —' );
{
	const items = [
		{ id: 'posts', items: [ { id: 'all', href: '#/posts' } ] },
		{ id: 'leaf', href: '#/leaf' },
	];
	ok(
		'findScreen returns the container',
		findScreen( items, 'posts' )?.id === 'posts'
	);
	ok(
		'findScreen misses non-container',
		findScreen( items, 'leaf' ) === null
	);
	eq(
		'findContainerForPrimary maps child path → container id',
		findContainerForPrimary( items, '/posts' ),
		'posts'
	);
	eq(
		'findContainerForPrimary returns null on no match',
		findContainerForPrimary( items, '/nope' ),
		null
	);
}

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
