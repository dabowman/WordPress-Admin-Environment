#!/usr/bin/env node
/**
 * Pure-store tests for the dirty-state platform service.
 */
import {
	setDirty,
	clearDirty,
	isDirty,
	hasBlockingDirty,
	listDirty,
	subscribe,
	reset,
} from '../../src/runtime/dirty-state/dirtyState.mjs';

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

console.log( '\n— setDirty / isDirty —' );
{
	reset();
	setDirty( 'editor', true );
	ok( 'isDirty editor true after setDirty', isDirty( 'editor' ) );
	ok( 'isDirty unrelated false', ! isDirty( 'sidebar' ) );
	setDirty( 'editor', false );
	ok( 'isDirty editor false after toggle', ! isDirty( 'editor' ) );
}

console.log( '\n— clearDirty —' );
{
	reset();
	setDirty( 'editor', true );
	clearDirty( 'editor' );
	ok( 'clearDirty wipes entry', ! isDirty( 'editor' ) );
	eq( 'listDirty empty after clear', listDirty(), [] );
}

console.log( '\n— hasBlockingDirty —' );
{
	reset();
	setDirty( 'editor', true, { blocksNavigation: false } );
	ok( 'hasBlockingDirty false when only flag is dirty without blocks', ! hasBlockingDirty() );
	setDirty( 'editor', true, { blocksNavigation: true } );
	ok( 'hasBlockingDirty true when blocking flag set', hasBlockingDirty() );
	setDirty( 'editor', false, { blocksNavigation: true } );
	ok( 'hasBlockingDirty false when not dirty even with block flag', ! hasBlockingDirty() );
}

console.log( '\n— multiple regions —' );
{
	reset();
	setDirty( 'editor', true, { blocksNavigation: true } );
	setDirty( 'sidebar', true );
	ok( 'editor isDirty', isDirty( 'editor' ) );
	ok( 'sidebar isDirty', isDirty( 'sidebar' ) );
	ok( 'hasBlockingDirty true (one of two blocks)', hasBlockingDirty() );
	clearDirty( 'editor' );
	ok( 'hasBlockingDirty false after clearing the blocking entry', ! hasBlockingDirty() );
	ok( 'sidebar still dirty', isDirty( 'sidebar' ) );
}

console.log( '\n— subscribe —' );
{
	reset();
	let calls = 0;
	const unsub = subscribe( () => calls++ );
	setDirty( 'editor', true );
	setDirty( 'editor', true ); // duplicate, no emit
	setDirty( 'editor', false );
	clearDirty( 'editor' );
	unsub();
	setDirty( 'editor', true ); // post-unsub, no emit
	eq( 'subscribe fired only on actual changes', calls, 3 );
}

console.log( '\n— invalid input is a no-op —' );
{
	reset();
	setDirty( '', true );
	setDirty( null, true );
	setDirty( undefined, true );
	eq( 'no entry recorded for falsy regionId', listDirty(), [] );
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
