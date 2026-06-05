#!/usr/bin/env node
/**
 * Tests for the shared DataForm custom-control value helpers
 * (`src/apps/_shared/forms/controls/{rangeControl,mediaControl}.mjs`).
 *
 * The React controls themselves (`RangeControl.js` / `MediaPicker.js`) can't
 * load under node — they import `@wordpress/components` / `@wordpress/ui` /
 * `@wordpress/media-utils`. Their pure value-mapping logic (clamp/normalize/
 * preview-URL) is factored into the `.mjs` siblings and pinned here.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );
const controlsDir = resolve(
	projectRoot,
	'src/apps/_shared/forms/controls'
);

const { clampRange, rangeDisplayValue } = await import(
	resolve( controlsDir, 'rangeControl.mjs' )
);
const { normalizeMediaId, mediaIdFromSelection, pickMediaPreviewUrl } =
	await import( resolve( controlsDir, 'mediaControl.mjs' ) );

let passed = 0;
const check = ( name, fn ) => {
	fn();
	passed += 1;
	process.stdout.write( `  ✓ ${ name }\n` );
};

// --- clampRange ---------------------------------------------------------

check( 'clampRange: clamps into [min, max]', () => {
	assert.equal( clampRange( 50, { min: 0, max: 100 } ), 50 );
	assert.equal( clampRange( -5, { min: 0, max: 100 } ), 0 );
	assert.equal( clampRange( 250, { min: 0, max: 100 } ), 100 );
} );

check( 'clampRange: non-finite collapses to min', () => {
	assert.equal( clampRange( undefined, { min: 0, max: 100 } ), 0 );
	assert.equal( clampRange( '', { min: 0, max: 100 } ), 0 );
	assert.equal( clampRange( NaN, { min: 0, max: 100 } ), 0 );
	assert.equal( clampRange( 'abc', { min: 5, max: 100 } ), 5 );
} );

check( 'clampRange: numeric strings coerce', () => {
	assert.equal( clampRange( '42', { min: 0, max: 100 } ), 42 );
} );

check( 'clampRange: defaults — min 0, no upper bound', () => {
	assert.equal( clampRange( 9999 ), 9999 );
	assert.equal( clampRange( -1 ), 0 );
} );

// --- rangeDisplayValue --------------------------------------------------

check( 'rangeDisplayValue: passes finite numbers', () => {
	assert.equal( rangeDisplayValue( 150 ), 150 );
	assert.equal( rangeDisplayValue( '300' ), 300 );
	assert.equal( rangeDisplayValue( 0 ), 0 );
} );

check( 'rangeDisplayValue: non-numeric → undefined', () => {
	assert.equal( rangeDisplayValue( undefined ), undefined );
	assert.equal( rangeDisplayValue( '' ), undefined );
	assert.equal( rangeDisplayValue( null ), undefined );
	assert.equal( rangeDisplayValue( 'x' ), undefined );
} );

// --- normalizeMediaId ---------------------------------------------------

check( 'normalizeMediaId: positive ints pass; else 0', () => {
	assert.equal( normalizeMediaId( 42 ), 42 );
	assert.equal( normalizeMediaId( '42' ), 42 );
	assert.equal( normalizeMediaId( 0 ), 0 );
	assert.equal( normalizeMediaId( -3 ), 0 );
	assert.equal( normalizeMediaId( undefined ), 0 );
	assert.equal( normalizeMediaId( null ), 0 );
	assert.equal( normalizeMediaId( 'abc' ), 0 );
} );

// --- mediaIdFromSelection -----------------------------------------------

check( 'mediaIdFromSelection: single object', () => {
	assert.equal( mediaIdFromSelection( { id: 7, url: 'x' } ), 7 );
} );

check( 'mediaIdFromSelection: array → first entry', () => {
	assert.equal( mediaIdFromSelection( [ { id: 9 }, { id: 10 } ] ), 9 );
} );

check( 'mediaIdFromSelection: empty / malformed → 0', () => {
	assert.equal( mediaIdFromSelection( [] ), 0 );
	assert.equal( mediaIdFromSelection( {} ), 0 );
	assert.equal( mediaIdFromSelection( undefined ), 0 );
} );

// --- pickMediaPreviewUrl ------------------------------------------------

check( 'pickMediaPreviewUrl: core-data record sized URL', () => {
	const record = {
		source_url: 'https://x/full.png',
		media_details: {
			sizes: { thumbnail: { source_url: 'https://x/thumb.png' } },
		},
	};
	assert.equal(
		pickMediaPreviewUrl( record, 'thumbnail' ),
		'https://x/thumb.png'
	);
} );

check( 'pickMediaPreviewUrl: MediaUpload selection shape', () => {
	const selection = {
		url: 'https://x/full.png',
		sizes: { thumbnail: { url: 'https://x/thumb.png' } },
	};
	assert.equal(
		pickMediaPreviewUrl( selection, 'thumbnail' ),
		'https://x/thumb.png'
	);
} );

check( 'pickMediaPreviewUrl: falls back to full when size absent', () => {
	assert.equal(
		pickMediaPreviewUrl(
			{ source_url: 'https://x/full.png' },
			'thumbnail'
		),
		'https://x/full.png'
	);
	assert.equal(
		pickMediaPreviewUrl( { url: 'https://x/full.png' }, 'medium' ),
		'https://x/full.png'
	);
} );

check( 'pickMediaPreviewUrl: nullish media → empty string', () => {
	assert.equal( pickMediaPreviewUrl( null ), '' );
	assert.equal( pickMediaPreviewUrl( undefined ), '' );
	assert.equal( pickMediaPreviewUrl( {} ), '' );
} );

process.stdout.write( `\nForm controls: ${ passed } checks passed\n` );
