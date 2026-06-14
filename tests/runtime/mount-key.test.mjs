#!/usr/bin/env node
/**
 * Tests for the region mount-key helper (`src/runtime/regions/mountKey.mjs`).
 *
 * `mountKey` derives the React `key` for a region's mounted-app wrapper so
 * navigating between two routes that share a source (e.g. two `iframe:` refs →
 * `core:iframe-fallback`) forces an unmount + remount instead of a `src`
 * mutation that would pollute iframe session history. Region.js itself is a
 * JSDOM gap, so the pure key derivation — the part most likely to silently
 * regress — is pinned here.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { mountKey } = await import(
	resolve( projectRoot, 'src/runtime/regions/mountKey.mjs' )
);

let passed = 0;
const check = ( name, fn ) => {
	fn();
	passed += 1;
	process.stdout.write( `  ✓ ${ name }\n` );
};

check( 'source with no config normalizes to null', () => {
	assert.equal( mountKey( { source: 'core:posts' } ), 'core:posts:null' );
} );

check( 'undefined config collapses to the missing-config key', () => {
	assert.equal(
		mountKey( { source: 'core:posts', config: undefined } ),
		mountKey( { source: 'core:posts' } )
	);
} );

check( 'config is serialized into the key', () => {
	assert.equal(
		mountKey( { source: 'core:iframe-fallback', config: { url: '/a' } } ),
		'core:iframe-fallback:{"url":"/a"}'
	);
} );

check( 'same source + differing config → distinct keys', () => {
	const a = mountKey( {
		source: 'core:iframe-fallback',
		config: { url: '/a' },
	} );
	const b = mountKey( {
		source: 'core:iframe-fallback',
		config: { url: '/b' },
	} );
	assert.notEqual( a, b );
} );

check( 'same source + identical config → identical key', () => {
	const ref = { source: 'core:iframe-fallback', config: { url: '/a' } };
	assert.equal( mountKey( ref ), mountKey( { ...ref } ) );
} );

check( 'differing source + identical config → distinct keys', () => {
	assert.notEqual(
		mountKey( { source: 'core:posts', config: { id: 1 } } ),
		mountKey( { source: 'core:pages', config: { id: 1 } } )
	);
} );

check( 'missing source falls back to empty string, never throws', () => {
	assert.equal( mountKey( {} ), ':null' );
	assert.equal( mountKey( { config: { x: 1 } } ), ':{"x":1}' );
} );

process.stdout.write( `\nmountKey helper: ${ passed } checks passed\n` );
