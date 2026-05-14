#!/usr/bin/env node
/**
 * Kernel icon registry contract test.
 *
 * The registry is DS-neutral. Engines populate it at module load via
 * `registerIcons(table, {fallback})`; apps look up via `resolveIcon`
 * regardless of which engine is active. This suite verifies the
 * registry's public contract — registration, lookup, fallback,
 * dev-mode miss warning, multi-register merge.
 *
 * Each scenario constructs a fresh registry via `createIconRegistry()`
 * so state never leaks between tests.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { createIconRegistry } = await import(
	resolve( projectRoot, 'src/runtime/config/iconMap.js' )
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

// Suppress dev-warn noise by capturing console.warn during specific tests.
function withSilentWarn( fn ) {
	const original = console.warn;
	const captured = [];
	console.warn = ( ...args ) => captured.push( args.join( ' ' ) );
	try {
		fn();
	} finally {
		console.warn = original;
	}
	return captured;
}

console.log( '\n— registry returns engine-registered icon by name —' );
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons( { post: 'POST_ICON', edit: 'EDIT_ICON' } );
	eq( 'post lookup', resolveIcon( 'post' ), 'POST_ICON' );
	eq( 'edit lookup', resolveIcon( 'edit' ), 'EDIT_ICON' );
}

console.log( '\n— unknown name falls back to engine fallback —' );
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons( { post: 'POST' }, { fallback: 'FB' } );
	withSilentWarn( () => {
		eq(
			'unknown name returns fallback',
			resolveIcon( 'totally-unknown' ),
			'FB'
		);
	} );
}

console.log( '\n— empty / null name returns fallback without warning —' );
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons( { post: 'POST' }, { fallback: 'FB' } );
	const captured = withSilentWarn( () => {
		eq( 'empty string → fallback', resolveIcon( '' ), 'FB' );
		eq( 'null → fallback', resolveIcon( null ), 'FB' );
		eq( 'undefined → fallback', resolveIcon( undefined ), 'FB' );
	} );
	eq( 'no warnings for empty lookups', captured.length, 0 );
}

console.log( '\n— no engine registered → resolveIcon returns null fallback —' );
{
	const { resolveIcon } = createIconRegistry();
	eq( 'empty registry, known-look returns null', resolveIcon( '' ), null );
	withSilentWarn( () => {
		eq(
			'empty registry, unknown returns null',
			resolveIcon( 'post' ),
			null
		);
	} );
}

console.log( '\n— dev-mode emits one warning per unknown name —' );
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons( { post: 'POST' }, { fallback: 'FB' } );
	const captured = withSilentWarn( () => {
		resolveIcon( 'mystery' );
		resolveIcon( 'mystery' ); // second lookup of same name must not re-warn
		resolveIcon( 'other' ); // distinct name, warns separately
	} );
	eq( 'two warnings for two distinct unknown names', captured.length, 2 );
	ok(
		'first warning mentions "mystery"',
		captured[ 0 ] && captured[ 0 ].includes( 'mystery' )
	);
	ok(
		'second warning mentions "other"',
		captured[ 1 ] && captured[ 1 ].includes( 'other' )
	);
}

console.log(
	'\n— multiple registerIcons calls merge with last-wins on overlap —'
);
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons( { post: 'POST_v1', page: 'PAGE' } );
	registerIcons( { post: 'POST_v2', media: 'MEDIA' } );
	eq( 'overlapping key takes last value', resolveIcon( 'post' ), 'POST_v2' );
	eq( 'first-only key preserved', resolveIcon( 'page' ), 'PAGE' );
	eq( 'second-only key added', resolveIcon( 'media' ), 'MEDIA' );
}

console.log( '\n— fallback can be replaced by a later registerIcons call —' );
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons( { post: 'POST' }, { fallback: 'OLD_FB' } );
	registerIcons( {}, { fallback: 'NEW_FB' } );
	eq( 'fallback updates on re-registration', resolveIcon( '' ), 'NEW_FB' );
}

console.log( '\n— registerIcons tolerates missing args gracefully —' );
{
	const { registerIcons, resolveIcon } = createIconRegistry();
	registerIcons(); // no args
	registerIcons( null ); // null table
	registerIcons( 'not an object' ); // wrong type
	registerIcons( { post: 'POST' } ); // valid follow-up
	eq( 'valid follow-up still registers', resolveIcon( 'post' ), 'POST' );
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
