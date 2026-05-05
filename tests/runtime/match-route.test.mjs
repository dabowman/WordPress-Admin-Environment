#!/usr/bin/env node
/**
 * URL routing primitives tests (V2.M3 task 2 + 5).
 *
 * Covers `src/runtime/routing/matchRoute.mjs`:
 *   - matchPattern   — single pattern → value, captures params
 *   - matchRoute     — most-specific-wins across the routes block
 *   - interpolate    — `{name}` substitution in route configs
 *   - parseHash      — decomposes `#/path?key=value` into primary+params
 *   - readSlot       — reads region's route-key slot from parsed URL
 *
 * Run: `node tests/runtime/match-route.test.mjs` (also chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const {
	matchPattern,
	matchRoute,
	interpolate,
	parseHash,
	readSlot,
	isValidRoutePattern,
} = await import(
	resolve( projectRoot, 'src/runtime/routing/matchRoute.mjs' )
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

function eq( a, b ) {
	return JSON.stringify( a ) === JSON.stringify( b );
}

console.log( '— matchPattern: literal + param + wildcard —\n' );

ok(
	'literal: exact match',
	eq( matchPattern( '/posts', '/posts' ), { params: {} } )
);
ok( 'literal: mismatch returns null', matchPattern( '/posts', '/pages' ) === null );

ok(
	'param: captures id',
	eq( matchPattern( '/posts/{id}', '/posts/42' ), { params: { id: '42' } } )
);

ok(
	'multi-param: captures all',
	eq(
		matchPattern( '/users/{user}/posts/{post}', '/users/3/posts/42' ),
		{ params: { user: '3', post: '42' } }
	)
);

ok(
	'wildcard: captures rest',
	eq(
		matchPattern( '/media/*', '/media/uploads/2026/05/img.jpg' ),
		{ params: { '*': 'uploads/2026/05/img.jpg' } }
	)
);

ok( 'invalid pattern returns null', matchPattern( 'no-leading-slash', '/x' ) === null );

ok(
	'no extra-segment match: /posts does not match /posts/42',
	matchPattern( '/posts', '/posts/42' ) === null
);

console.log( '\n— matchRoute: most-specific-wins —\n' );

const ROUTES = {
	'/posts/new':  { app: 'core:editor', config: { postType: 'post' } },
	'/posts/{id}': { app: 'core:editor', config: { 'post-id': '{id}' } },
	'/posts':      { app: 'core:posts',  config: { postType: 'post' } },
	'/media/*':    { app: 'core:media',  config: {} },
	'/users':      { app: 'core:users',  config: {} },
};

ok(
	'literal beats param for /posts/new',
	matchRoute( ROUTES, '/posts/new' ).pattern === '/posts/new'
);
ok(
	'param matches /posts/42',
	matchRoute( ROUTES, '/posts/42' ).pattern === '/posts/{id}'
);
ok(
	'literal /posts wins over /posts/{id}',
	matchRoute( ROUTES, '/posts' ).pattern === '/posts'
);
ok(
	'wildcard captures media path',
	matchRoute( ROUTES, '/media/2026/img.png' ).params[ '*' ] === '2026/img.png'
);
ok(
	'no match returns null',
	matchRoute( ROUTES, '/unknown' ) === null
);
ok(
	'returns app + config',
	matchRoute( ROUTES, '/posts/new' ).app === 'core:editor' &&
		matchRoute( ROUTES, '/posts/new' ).config.postType === 'post'
);
ok(
	'empty routes block returns null',
	matchRoute( {}, '/posts' ) === null
);
ok(
	'non-string value returns null',
	matchRoute( ROUTES, null ) === null
);

console.log( '\n— interpolate: {name} substitution —\n' );

ok(
	'string value: substitutes',
	interpolate( '{id}', { id: '42' } ) === '42'
);
ok(
	'string value: leaves unknown placeholders alone',
	interpolate( '{x}', { id: '42' } ) === '{x}'
);
ok(
	'object value: recurses',
	eq(
		interpolate( { 'post-id': '{id}', 'post-type': 'post' }, { id: '42' } ),
		{ 'post-id': '42', 'post-type': 'post' }
	)
);
ok(
	'array value: recurses',
	eq( interpolate( [ '{a}', 'b' ], { a: '1' } ), [ '1', 'b' ] )
);
ok(
	'numeric value: passthrough',
	interpolate( 42, { id: '99' } ) === 42
);
ok(
	'null value: passthrough',
	interpolate( null, { id: '1' } ) === null
);
ok(
	'no params: passthrough',
	interpolate( { x: '{a}' }, null ).x === '{a}'
);
ok(
	'unknown placeholder names ignored (only [a-z] names eligible)',
	interpolate( '/{*}/', { '*': 'rest' } ) === '/{*}/'
);

console.log( '\n— parseHash: primary + query params —\n' );

ok(
	'plain path',
	eq( parseHash( '#/posts' ), { primary: '/posts', params: {} } )
);
ok(
	'with query param',
	eq(
		parseHash( '#/posts?detail=%2Fposts%2F42' ),
		{ primary: '/posts', params: { detail: '/posts/42' } }
	)
);
ok(
	'multiple query params',
	eq(
		parseHash( '#/posts?detail=%2Fposts%2F42&inspector=%2Fusers%2F3' ),
		{ primary: '/posts', params: { detail: '/posts/42', inspector: '/users/3' } }
	)
);
ok(
	'no leading slash on path: normalized',
	parseHash( '#posts' ).primary === '/posts'
);
ok(
	'empty hash',
	eq( parseHash( '' ), { primary: '', params: {} } )
);
ok(
	'just question mark',
	eq( parseHash( '#?detail=%2Fposts' ), { primary: '', params: { detail: '/posts' } } )
);

console.log( '\n— readSlot: route-key resolution —\n' );

const url = parseHash( '#/posts?detail=%2Fposts%2F42&inspector=%2Fusers%2F3' );

ok( 'readSlot _self → primary path', readSlot( url, '_self' ) === '/posts' );
ok( 'readSlot detail → query value', readSlot( url, 'detail' ) === '/posts/42' );
ok( 'readSlot inspector → query value', readSlot( url, 'inspector' ) === '/users/3' );
ok( 'readSlot missing key → empty', readSlot( url, 'sidebar' ) === '' );
ok( 'readSlot null url → empty', readSlot( null, '_self' ) === '' );
ok( 'readSlot empty key → empty', readSlot( url, '' ) === '' );

console.log( '\n— isValidRoutePattern —\n' );

ok( 'valid: /posts', isValidRoutePattern( '/posts' ) );
ok( 'valid: /posts/{id}', isValidRoutePattern( '/posts/{id}' ) );
ok( 'valid: /media/*', isValidRoutePattern( '/media/*' ) );
ok( 'invalid: no leading slash', ! isValidRoutePattern( 'posts' ) );
ok( 'invalid: empty', ! isValidRoutePattern( '' ) );

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
