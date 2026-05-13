#!/usr/bin/env node
/**
 * dynamicChildren store tests (P1.T1).
 *
 * Covers `src/runtime/regions/dynamicChildren.mjs` — the runtime
 * mutation store backing the `core:dynamic-children` platform service
 * (spec §5.5). The store is framework-agnostic; this test exercises
 * add/remove/list/subscribe + validation + snapshot stability. React
 * surface (`useDynamicChildren`) is covered indirectly because the hook
 * is a thin `useSyncExternalStore` wrapper.
 *
 * Run: `node tests/runtime/dynamic-children.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { createDynamicChildrenStore } = await import(
	resolve( projectRoot, 'src/runtime/regions/dynamicChildren.mjs' )
);
const { validateRegion } = await import(
	resolve( projectRoot, 'src/runtime/regions/validateRegion.mjs' )
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

function threw( fn ) {
	try {
		fn();
		return false;
	} catch ( _e ) {
		return true;
	}
}

console.log( '— dynamicChildren: empty store —\n' );

{
	const store = createDynamicChildrenStore();
	ok( 'list(unknown) returns empty array', store.list( 'workspace' ).length === 0 );
	ok(
		'list returns stable empty reference',
		store.list( 'workspace' ) === store.list( 'workspace' )
	);
	ok( 'remove(unknown) returns false', store.remove( 'workspace', 'x' ) === false );
}

console.log( '\n— dynamicChildren: add / list / remove —\n' );

{
	const store = createDynamicChildrenStore();
	store.add( 'workspace', 'win-1', {
		role: 'region',
		app: 'core:posts',
		config: { postType: 'post' },
	} );
	const list1 = store.list( 'workspace' );
	ok( 'add → list has one entry', list1.length === 1 );
	ok( 'entry key preserved', list1[ 0 ].key === 'win-1' );
	ok(
		'entry decl preserved',
		list1[ 0 ].decl.app === 'core:posts' &&
			list1[ 0 ].decl.config.postType === 'post'
	);

	store.add( 'workspace', 'win-2', {
		role: 'region',
		app: 'core:media',
	} );
	const list2 = store.list( 'workspace' );
	ok( 'second add → list has two entries', list2.length === 2 );
	ok(
		'insertion order preserved',
		list2[ 0 ].key === 'win-1' && list2[ 1 ].key === 'win-2'
	);

	ok( 'remove existing returns true', store.remove( 'workspace', 'win-1' ) === true );
	ok( 'after remove, list has one entry', store.list( 'workspace' ).length === 1 );
	ok(
		'remaining entry is win-2',
		store.list( 'workspace' )[ 0 ].key === 'win-2'
	);
	ok(
		'remove same key twice: second call returns false',
		store.remove( 'workspace', 'win-1' ) === false
	);
}

console.log( '\n— dynamicChildren: parent scoping —\n' );

{
	const store = createDynamicChildrenStore();
	store.add( 'workspace', 'a', { app: 'core:posts' } );
	store.add( 'sidebar', 'b', { app: 'core:nav' } );
	ok(
		'workspace list scoped to workspace',
		store.list( 'workspace' ).length === 1 &&
			store.list( 'workspace' )[ 0 ].key === 'a'
	);
	ok(
		'sidebar list scoped to sidebar',
		store.list( 'sidebar' ).length === 1 &&
			store.list( 'sidebar' )[ 0 ].key === 'b'
	);
	ok(
		'remove on one parent does not affect another',
		store.remove( 'workspace', 'a' ) === true &&
			store.list( 'sidebar' ).length === 1
	);
}

console.log( '\n— dynamicChildren: snapshot stability —\n' );

{
	const store = createDynamicChildrenStore();
	store.add( 'workspace', 'win-1', { app: 'core:posts' } );
	const snap1 = store.list( 'workspace' );
	const snap2 = store.list( 'workspace' );
	ok(
		'list returns same reference between mutations',
		snap1 === snap2,
		'useSyncExternalStore loops if reference is unstable'
	);
	store.add( 'workspace', 'win-2', { app: 'core:media' } );
	const snap3 = store.list( 'workspace' );
	ok(
		'list returns new reference after mutation',
		snap3 !== snap1
	);
	store.remove( 'workspace', 'win-2' );
	const snap4 = store.list( 'workspace' );
	ok( 'remove also produces new reference', snap4 !== snap3 );
}

console.log( '\n— dynamicChildren: subscribe / notify —\n' );

{
	const store = createDynamicChildrenStore();
	let calls = 0;
	const unsub = store.subscribe( 'workspace', () => {
		calls++;
	} );
	store.add( 'workspace', 'win-1', { app: 'core:posts' } );
	ok( 'subscriber notified on add', calls === 1 );

	store.add( 'workspace', 'win-2', { app: 'core:media' } );
	ok( 'subscriber notified on second add', calls === 2 );

	store.remove( 'workspace', 'win-1' );
	ok( 'subscriber notified on remove', calls === 3 );

	store.remove( 'workspace', 'nonexistent' );
	ok( 'no-op remove does NOT notify', calls === 3 );

	unsub();
	store.add( 'workspace', 'win-3', { app: 'core:posts' } );
	ok( 'after unsubscribe, no further notifications', calls === 3 );

	store.add( 'sidebar', 'x', { app: 'core:nav' } );
	ok(
		'subscriber for one parent does not fire for another',
		calls === 3
	);
}

console.log( '\n— dynamicChildren: validation via validateRegion —\n' );

{
	const store = createDynamicChildrenStore( { validate: validateRegion } );
	ok(
		'valid decl: add succeeds',
		! threw( () =>
			store.add( 'workspace', 'win-1', {
				role: 'region',
				app: 'core:posts',
			} )
		)
	);
	ok(
		'invalid decl (app + route-key): add throws',
		threw( () =>
			store.add( 'workspace', 'bad', {
				role: 'region',
				app: 'core:posts',
				routing: { 'route-key': 'detail' },
			} )
		)
	);
	ok(
		'after failed add, list unchanged',
		store.list( 'workspace' ).length === 1
	);
}

console.log( '\n— dynamicChildren: argument validation —\n' );

{
	const store = createDynamicChildrenStore();
	ok(
		'add: missing parentId throws',
		threw( () => store.add( '', 'k', { app: 'x' } ) )
	);
	ok(
		'add: missing key throws',
		threw( () => store.add( 'p', '', { app: 'x' } ) )
	);
	ok(
		'add: non-object decl throws',
		threw( () => store.add( 'p', 'k', null ) )
	);
	ok(
		'subscribe: non-function listener throws',
		threw( () => store.subscribe( 'p', 'not a function' ) )
	);
}

console.log( '\n— dynamicChildren: replacement on same key —\n' );

{
	const store = createDynamicChildrenStore();
	store.add( 'workspace', 'win-1', { app: 'core:posts' } );
	store.add( 'workspace', 'win-1', { app: 'core:media' } );
	const list = store.list( 'workspace' );
	ok( 'same-key add replaces in place', list.length === 1 );
	ok( 'replaced decl wins', list[ 0 ].decl.app === 'core:media' );
}

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
