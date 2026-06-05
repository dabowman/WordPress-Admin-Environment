#!/usr/bin/env node
/**
 * Tests for the inline image editor's pure transform model
 * (`src/apps/media/imageEditorModel.mjs`).
 *
 * The model is the correctness-critical seam: it turns the editor's UI state
 * into the `modifiers[]` array that `POST /wp/v2/media/{id}/edit` consumes. The
 * canvas/crop React component (`ImageEditor.js`) can't load under node (it imports
 * `@wordpress/ui` + canvas), so its math is factored here and pinned by this test:
 * rotation snapping, crop normalization/clamping, the meaningful-crop gate, the
 * REST-order modifier build, and the post-rotation display dimensions.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const {
	ROTATION_STEPS,
	rotateBy,
	clampPercent,
	normalizeCrop,
	isMeaningfulCrop,
	buildModifiers,
	hasPendingEdits,
	displayDimensions,
	moveCrop,
	resizeCrop,
	MIN_CROP_PERCENT,
} = await import(
	resolve( projectRoot, 'src/apps/media/imageEditorModel.mjs' )
);

let passed = 0;
const check = ( name, fn ) => {
	fn();
	passed += 1;
	process.stdout.write( `  ✓ ${ name }\n` );
};

// --- rotateBy ------------------------------------------------------------

check( 'ROTATION_STEPS are the four 90° snap points', () => {
	assert.deepEqual( ROTATION_STEPS, [ 0, 90, 180, 270 ] );
} );

check( 'rotateBy: adds + normalizes to [0,360)', () => {
	assert.equal( rotateBy( 0, 90 ), 90 );
	assert.equal( rotateBy( 270, 90 ), 0 );
	assert.equal( rotateBy( 180, 180 ), 0 );
} );

check( 'rotateBy: negative delta (rotate left) wraps to 270', () => {
	assert.equal( rotateBy( 0, -90 ), 270 );
	assert.equal( rotateBy( 90, -90 ), 0 );
} );

check( 'rotateBy: snaps non-right-angle input to the nearest 90°', () => {
	assert.equal( rotateBy( 100, 0 ), 90 );
	assert.equal( rotateBy( 44, 0 ), 0 );
	assert.equal( rotateBy( 46, 0 ), 90 );
} );

check( 'rotateBy: defaults + non-numeric coerce to 0', () => {
	assert.equal( rotateBy(), 0 );
	assert.equal( rotateBy( 'x', 'y' ), 0 );
} );

// --- clampPercent --------------------------------------------------------

check( 'clampPercent: clamps to 0–100, NaN → 0', () => {
	assert.equal( clampPercent( -5 ), 0 );
	assert.equal( clampPercent( 150 ), 100 );
	assert.equal( clampPercent( 42 ), 42 );
	assert.equal( clampPercent( NaN ), 0 );
	assert.equal( clampPercent( 'nope' ), 0 );
} );

// --- normalizeCrop -------------------------------------------------------

check( 'normalizeCrop: null in → null out', () => {
	assert.equal( normalizeCrop( null ), null );
	assert.equal( normalizeCrop( undefined ), null );
} );

check( 'normalizeCrop: clamps edges and pulls size inside the frame', () => {
	// left 80 + width 50 would overflow → width pulled to 20.
	assert.deepEqual(
		normalizeCrop( { left: 80, top: 90, width: 50, height: 40 } ),
		{ left: 80, top: 90, width: 20, height: 10 }
	);
} );

check( 'normalizeCrop: out-of-range edges clamp before sizing', () => {
	assert.deepEqual(
		normalizeCrop( { left: -10, top: 0, width: 120, height: 50 } ),
		{ left: 0, top: 0, width: 100, height: 50 }
	);
} );

// --- isMeaningfulCrop ----------------------------------------------------

check( 'isMeaningfulCrop: null / full-frame / zero-size are no-ops', () => {
	assert.equal( isMeaningfulCrop( null ), false );
	assert.equal(
		isMeaningfulCrop( { left: 0, top: 0, width: 100, height: 100 } ),
		false
	);
	assert.equal(
		isMeaningfulCrop( { left: 10, top: 10, width: 0, height: 50 } ),
		false
	);
} );

check( 'isMeaningfulCrop: a real trim on any edge counts', () => {
	assert.equal(
		isMeaningfulCrop( { left: 10, top: 0, width: 90, height: 100 } ),
		true
	); // trims left
	assert.equal(
		isMeaningfulCrop( { left: 0, top: 0, width: 80, height: 100 } ),
		true
	); // trims right
	assert.equal(
		isMeaningfulCrop( { left: 0, top: 0, width: 100, height: 70 } ),
		true
	); // trims bottom
} );

check( 'isMeaningfulCrop: sub-epsilon trim is treated as full-frame', () => {
	assert.equal(
		isMeaningfulCrop( { left: 0.1, top: 0, width: 99.8, height: 100 } ),
		false
	);
} );

// --- buildModifiers ------------------------------------------------------

check( 'buildModifiers: empty when nothing changed', () => {
	assert.deepEqual( buildModifiers(), [] );
	assert.deepEqual(
		buildModifiers( {
			rotation: 0,
			flipH: false,
			flipV: false,
			crop: { left: 0, top: 0, width: 100, height: 100 },
		} ),
		[]
	);
} );

check( 'buildModifiers: rotate emits the clockwise angle straight through', () => {
	assert.deepEqual( buildModifiers( { rotation: 90 } ), [
		{ type: 'rotate', args: { angle: 90 } },
	] );
	// rotate-left state (normalized to 270) round-trips.
	assert.deepEqual( buildModifiers( { rotation: 270 } ), [
		{ type: 'rotate', args: { angle: 270 } },
	] );
} );

check( 'buildModifiers: flip carries both axes as booleans', () => {
	assert.deepEqual( buildModifiers( { flipH: true } ), [
		{ type: 'flip', args: { horizontal: true, vertical: false } },
	] );
	assert.deepEqual( buildModifiers( { flipV: true } ), [
		{ type: 'flip', args: { horizontal: false, vertical: true } },
	] );
} );

check( 'buildModifiers: crop is clamped + percentage-based', () => {
	assert.deepEqual(
		buildModifiers( { crop: { left: 10, top: 20, width: 50, height: 40 } } ),
		[
			{
				type: 'crop',
				args: { left: 10, top: 20, width: 50, height: 40 },
			},
		]
	);
} );

check( 'buildModifiers: emits in REST-apply order rotate → flip → crop', () => {
	const mods = buildModifiers( {
		rotation: 180,
		flipH: true,
		flipV: true,
		crop: { left: 5, top: 5, width: 50, height: 50 },
	} );
	assert.deepEqual(
		mods.map( ( m ) => m.type ),
		[ 'rotate', 'flip', 'crop' ]
	);
} );

// --- hasPendingEdits -----------------------------------------------------

check( 'hasPendingEdits: mirrors buildModifiers non-emptiness', () => {
	assert.equal( hasPendingEdits(), false );
	assert.equal( hasPendingEdits( { rotation: 90 } ), true );
	assert.equal( hasPendingEdits( { flipV: true } ), true );
	assert.equal(
		hasPendingEdits( { crop: { left: 0, top: 0, width: 100, height: 100 } } ),
		false
	);
} );

// --- displayDimensions ---------------------------------------------------

check( 'displayDimensions: unchanged at 0°/180°, swapped at 90°/270°', () => {
	assert.deepEqual( displayDimensions( 400, 300, 0 ), {
		width: 400,
		height: 300,
	} );
	assert.deepEqual( displayDimensions( 400, 300, 180 ), {
		width: 400,
		height: 300,
	} );
	assert.deepEqual( displayDimensions( 400, 300, 90 ), {
		width: 300,
		height: 400,
	} );
	assert.deepEqual( displayDimensions( 400, 300, 270 ), {
		width: 300,
		height: 400,
	} );
} );

// --- moveCrop ------------------------------------------------------------

check( 'moveCrop: translates and keeps the box inside the frame', () => {
	const start = { left: 10, top: 10, width: 40, height: 40 };
	assert.deepEqual( moveCrop( start, 20, 5 ), {
		left: 30,
		top: 15,
		width: 40,
		height: 40,
	} );
	// Drag past the right/bottom edge — clamps so left+width / top+height ≤ 100.
	assert.deepEqual( moveCrop( start, 200, 200 ), {
		left: 60,
		top: 60,
		width: 40,
		height: 40,
	} );
	// Drag past the top/left edge — clamps to 0.
	assert.deepEqual( moveCrop( start, -50, -50 ), {
		left: 0,
		top: 0,
		width: 40,
		height: 40,
	} );
} );

// --- resizeCrop ----------------------------------------------------------

check( 'resizeCrop: SE handle grows width/height, pins top-left', () => {
	const start = { left: 10, top: 10, width: 40, height: 40 };
	assert.deepEqual( resizeCrop( 'se', start, 10, 20 ), {
		left: 10,
		top: 10,
		width: 50,
		height: 60,
	} );
} );

check( 'resizeCrop: NW handle moves the top-left, pins bottom-right', () => {
	const start = { left: 20, top: 20, width: 40, height: 40 };
	// right=60, bottom=60. Drag NW by (-10,-10): left 10, top 10, w 50, h 50.
	assert.deepEqual( resizeCrop( 'nw', start, -10, -10 ), {
		left: 10,
		top: 10,
		width: 50,
		height: 50,
	} );
} );

check( 'resizeCrop: cannot cross the pinned edge (min size enforced)', () => {
	const start = { left: 10, top: 10, width: 40, height: 40 };
	// Drag SE far negative: width/height clamp to MIN_CROP_PERCENT, not below.
	const out = resizeCrop( 'se', start, -100, -100 );
	assert.equal( out.width, MIN_CROP_PERCENT );
	assert.equal( out.height, MIN_CROP_PERCENT );
	assert.equal( out.left, 10 );
	assert.equal( out.top, 10 );
} );

check( 'resizeCrop: edges clamp to the 0–100 frame', () => {
	const start = { left: 10, top: 10, width: 40, height: 40 };
	// Drag SE far positive: right/bottom clamp to 100.
	const out = resizeCrop( 'se', start, 200, 200 );
	assert.equal( out.left + out.width, 100 );
	assert.equal( out.top + out.height, 100 );
} );

process.stdout.write( `\nImage editor model: ${ passed } checks passed\n` );
