#!/usr/bin/env node
/**
 * Tests for the bindings runtime: parseShortcut + triggerStore.
 */
import { parseShortcut } from '../../src/runtime/bindings/parseShortcut.mjs';
import {
	registerTrigger,
	trigger,
	hasTrigger,
	reset,
} from '../../src/runtime/bindings/triggerStore.mjs';

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

function evt( overrides = {} ) {
	return {
		key: '',
		shiftKey: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		...overrides,
	};
}

console.log( '\n— parseShortcut: macOS Mod = Meta —' );
{
	const match = parseShortcut( 'Mod+K', { mac: true } );
	ok( 'Cmd+K matches', match( evt( { key: 'k', metaKey: true } ) ) );
	ok( 'plain k does not match', ! match( evt( { key: 'k' } ) ) );
	ok( 'Ctrl+K does NOT match on mac', ! match( evt( { key: 'k', ctrlKey: true } ) ) );
}

console.log( '\n— parseShortcut: non-mac Mod = Ctrl —' );
{
	const match = parseShortcut( 'Mod+K', { mac: false } );
	ok( 'Ctrl+K matches', match( evt( { key: 'k', ctrlKey: true } ) ) );
	ok( 'Cmd+K does NOT match off-mac', ! match( evt( { key: 'k', metaKey: true } ) ) );
}

console.log( '\n— parseShortcut: case-insensitive single char —' );
{
	const match = parseShortcut( 'Mod+K', { mac: true } );
	ok( 'capital K matches', match( evt( { key: 'K', metaKey: true } ) ) );
	ok( 'lowercase k matches', match( evt( { key: 'k', metaKey: true } ) ) );
}

console.log( '\n— parseShortcut: Shift modifier required —' );
{
	const match = parseShortcut( 'Shift+Mod+P', { mac: true } );
	ok( 'Shift+Cmd+P matches', match( evt( { key: 'P', metaKey: true, shiftKey: true } ) ) );
	ok( 'Cmd+P alone does not match', ! match( evt( { key: 'p', metaKey: true } ) ) );
	ok( 'Shift+P alone does not match', ! match( evt( { key: 'P', shiftKey: true } ) ) );
}

console.log( '\n— parseShortcut: named keys —' );
{
	const match = parseShortcut( 'Alt+ArrowDown', { mac: false } );
	ok( 'Alt+ArrowDown matches', match( evt( { key: 'ArrowDown', altKey: true } ) ) );
	ok( 'plain ArrowDown does not match', ! match( evt( { key: 'ArrowDown' } ) ) );
	ok( 'Alt+ArrowUp does not match', ! match( evt( { key: 'ArrowUp', altKey: true } ) ) );
}

console.log( '\n— parseShortcut: extra modifiers reject —' );
{
	const match = parseShortcut( 'Mod+K', { mac: true } );
	ok( 'Cmd+Shift+K does NOT match (no shift declared)', ! match( evt( { key: 'k', metaKey: true, shiftKey: true } ) ) );
	ok( 'Cmd+Alt+K does NOT match', ! match( evt( { key: 'k', metaKey: true, altKey: true } ) ) );
}

console.log( '\n— parseShortcut: malformed inputs —' );
{
	ok( 'empty string returns null', parseShortcut( '' ) === null );
	ok( 'non-string returns null', parseShortcut( null ) === null );
	ok( 'modifier without key returns null', parseShortcut( 'Mod+' ) === null );
	ok( 'only modifiers returns null', parseShortcut( 'Mod+Shift' ) === null );
}

console.log( '\n— triggerStore —' );
{
	reset();
	let calls = 0;
	const dispose = registerTrigger( 'core:command-palette', () => calls++ );
	ok( 'hasTrigger after register', hasTrigger( 'core:command-palette' ) );
	ok( 'trigger returns true on hit', trigger( 'core:command-palette' ) === true );
	ok( 'callback fired', calls === 1 );
	ok( 'trigger missing id returns false', trigger( 'core:nope' ) === false );
	dispose();
	ok( 'after dispose hasTrigger false', ! hasTrigger( 'core:command-palette' ) );
}

console.log( '\n— triggerStore: replace + dispose-only-self —' );
{
	reset();
	let aCalls = 0;
	let bCalls = 0;
	const disposeA = registerTrigger( 'core:x', () => aCalls++ );
	registerTrigger( 'core:x', () => bCalls++ );
	trigger( 'core:x' );
	ok( 'second registration replaces first', aCalls === 0 && bCalls === 1 );
	disposeA(); // disposer for the older handler must not remove the active one
	ok( 'stale disposer leaves replacement intact', hasTrigger( 'core:x' ) );
}

console.log( '\n— triggerStore: handler throw is contained —' );
{
	reset();
	registerTrigger( 'core:bad', () => { throw new Error( 'boom' ); } );
	const origError = console.error;
	console.error = () => {};
	const result = trigger( 'core:bad' );
	console.error = origError;
	ok( 'throw returns false instead of propagating', result === false );
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
