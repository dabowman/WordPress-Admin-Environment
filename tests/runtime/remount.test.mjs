#!/usr/bin/env node
/**
 * In-process workspace re-mount helper tests (issue #28).
 *
 * Covers the two pure pieces of the no-hard-reload switch path:
 *   - diffWorkspaceScreens — added/removed/retained screen ids across configs
 *   - applyWorkspacePayload — fold a REST `/config` payload into the global
 *
 * The React wiring (`root.render(kernel(config))`) lives in `src/index.js`
 * and is out of scope for a node test.
 *
 * Run: `node tests/runtime/remount.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { diffWorkspaceScreens, applyWorkspacePayload } = await import(
	resolve( projectRoot, 'src/runtime/remount.mjs' )
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
const eq = ( a, b ) => JSON.stringify( a ) === JSON.stringify( b );

// ── diffWorkspaceScreens ───────────────────────────────────────────

console.log( '— diffWorkspaceScreens —\n' );

{
	const prev = { dashboard: {}, posts: {}, media: {} };
	const next = { dashboard: {}, posts: {}, users: {} };
	const diff = diffWorkspaceScreens( prev, next );
	ok( 'added is new-only ids, sorted', eq( diff.added, [ 'users' ] ) );
	ok( 'removed is old-only ids, sorted', eq( diff.removed, [ 'media' ] ) );
	ok(
		'retained is shared ids, sorted',
		eq( diff.retained, [ 'dashboard', 'posts' ] )
	);
}

ok(
	'identical maps → all retained, none added/removed',
	( () => {
		const m = { a: {}, b: {} };
		const d = diffWorkspaceScreens( m, { ...m } );
		return (
			eq( d.added, [] ) &&
			eq( d.removed, [] ) &&
			eq( d.retained, [ 'a', 'b' ] )
		);
	} )()
);

ok(
	'missing prev (first switch) → everything added',
	( () => {
		const d = diffWorkspaceScreens( undefined, { x: {}, y: {} } );
		return eq( d.added, [ 'x', 'y' ] ) && eq( d.removed, [] );
	} )()
);

ok(
	'missing next → everything removed',
	( () => {
		const d = diffWorkspaceScreens( { x: {} }, null );
		return eq( d.removed, [ 'x' ] ) && eq( d.added, [] );
	} )()
);

ok(
	'non-object inputs treated as empty',
	( () => {
		const d = diffWorkspaceScreens( 'nope', 42 );
		return eq( d.added, [] ) && eq( d.removed, [] ) && eq( d.retained, [] );
	} )()
);

// ── applyWorkspacePayload ──────────────────────────────────────────

console.log( '\n— applyWorkspacePayload —\n' );

{
	const target = {
		config: { screens: { old: {} } },
		capabilities: { 'manage_options': true },
		adminRoutes: { '/old': {} },
		tokens: {},
		// Workspace-invariant fields that must be left untouched.
		siteUrl: 'https://site.test',
		nonce: 'abc123',
	};
	const payload = {
		config: { screens: { fresh: {} } },
		capabilities: { 'edit_posts': true },
		adminRoutes: { '/new': {} },
		tokens: { color: { brand: { 500: '#abc' } } },
	};
	const returned = applyWorkspacePayload( target, payload );

	ok( 'returns the resolved config', returned === payload.config );
	ok( 'swaps config', eq( target.config, payload.config ) );
	ok( 'swaps capabilities', eq( target.capabilities, payload.capabilities ) );
	ok( 'swaps adminRoutes', eq( target.adminRoutes, payload.adminRoutes ) );
	ok( 'swaps tokens', eq( target.tokens, payload.tokens ) );
	ok( 'leaves invariant siteUrl', target.siteUrl === 'https://site.test' );
	ok( 'leaves invariant nonce', target.nonce === 'abc123' );
}

ok(
	'partial payload only overwrites present keys',
	( () => {
		const target = {
			config: { a: 1 },
			capabilities: { keep: true },
			adminRoutes: { keep: true },
			tokens: { keep: true },
		};
		applyWorkspacePayload( target, { config: { a: 2 } } );
		return (
			eq( target.config, { a: 2 } ) &&
			eq( target.capabilities, { keep: true } ) &&
			eq( target.adminRoutes, { keep: true } ) &&
			eq( target.tokens, { keep: true } )
		);
	} )()
);

ok(
	'throws when target is not an object',
	( () => {
		try {
			applyWorkspacePayload( null, { config: {} } );
			return false;
		} catch ( e ) {
			return /target/.test( e.message );
		}
	} )()
);

ok(
	'throws when payload lacks a config',
	( () => {
		try {
			applyWorkspacePayload( {}, { capabilities: {} } );
			return false;
		} catch ( e ) {
			return /config/.test( e.message );
		}
	} )()
);

// ── summary ────────────────────────────────────────────────────────

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
