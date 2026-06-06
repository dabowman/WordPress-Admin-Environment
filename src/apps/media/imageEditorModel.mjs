/**
 * Pure transform model for the inline image editor (#125).
 *
 * Side-effect-free helpers shared by `ImageEditor.js` (the canvas + crop UI) and
 * pinned by `tests/runtime/image-editor-model.test.mjs`. Kept in a `.mjs` file
 * so the node test harness can `import()` it without a webpack/jest pass (see
 * CLAUDE.md "Pure-JS runtime modules go in `.mjs` files").
 *
 * The whole point of this module is the **REST contract**: it turns the editor's
 * UI state — a clockwise rotation, a horizontal/vertical flip, and an optional
 * crop rectangle — into the `modifiers[]` array that
 * `POST /wp/v2/media/{id}/edit` consumes. The endpoint applies modifiers in
 * array order, so the order this module emits them (rotate → flip → crop) is the
 * order the server composes them, and it is also the order `ImageEditor`'s canvas
 * preview composes them — guaranteeing the saved result matches the preview.
 *
 * Coordinate conventions:
 * - `rotation` is clockwise degrees, normalized to one of 0 / 90 / 180 / 270.
 *   The REST `rotate` modifier negates internally (`$rotate = 0 - angle`) before
 *   handing the angle to GD's counter-clockwise `imagerotate`, so passing the
 *   clockwise value straight through rotates the saved image clockwise to match.
 * - `crop` is `{ left, top, width, height }` expressed as **percentages**
 *   (0–100) of the post-rotation / post-flip image — exactly what the controller
 *   multiplies against the rotated image's pixel dimensions.
 */

/** Allowed clockwise rotation snap points, in degrees. */
export const ROTATION_STEPS = [ 0, 90, 180, 270 ];

/**
 * Normalize an arbitrary clockwise rotation to the [0, 360) range, snapped to
 * the nearest 90° step. Tolerates negatives and over-rotation.
 *
 * @param {number} current Current rotation in clockwise degrees.
 * @param {number} delta   Signed delta to apply (e.g. +90 right, -90 left).
 * @return {number} Normalized rotation in { 0, 90, 180, 270 }.
 */
export function rotateBy( current = 0, delta = 0 ) {
	const sum = Math.round( ( Number( current ) || 0 ) + ( Number( delta ) || 0 ) );
	const snapped = Math.round( sum / 90 ) * 90;
	return ( ( snapped % 360 ) + 360 ) % 360;
}

/**
 * Clamp a value to the 0–100 percentage range, coercing NaN to 0.
 *
 * @param {number} n Candidate percentage.
 * @return {number} Clamped percentage.
 */
export function clampPercent( n ) {
	const v = Number( n );
	if ( Number.isNaN( v ) ) {
		return 0;
	}
	return Math.min( 100, Math.max( 0, v ) );
}

/**
 * Normalize a crop rectangle: clamp every edge to 0–100 and pull the
 * width/height back inside the frame so `left + width` (and `top + height`)
 * never exceed 100. Returns `null` for a null/absent crop.
 *
 * @param {?Object} crop `{ left, top, width, height }` in percent, or null.
 * @return {?Object} Normalized crop, or null.
 */
export function normalizeCrop( crop ) {
	if ( ! crop ) {
		return null;
	}
	const left = clampPercent( crop.left );
	const top = clampPercent( crop.top );
	let width = clampPercent( crop.width );
	let height = clampPercent( crop.height );
	if ( left + width > 100 ) {
		width = 100 - left;
	}
	if ( top + height > 100 ) {
		height = 100 - top;
	}
	return { left, top, width, height };
}

// Tolerance (in percent) below which a crop is treated as "the whole image" and
// therefore a no-op — avoids POSTing a crop modifier that the controller would
// itself skip (it compares the cropped size to the full size) and avoids
// sub-pixel rounding from a drag that effectively selected everything.
const FULL_FRAME_EPSILON = 0.5;

/**
 * Whether a crop actually trims the image (vs. selecting ~the whole frame).
 *
 * @param {?Object} crop `{ left, top, width, height }` in percent, or null.
 * @return {boolean} True when the crop meaningfully reduces the image.
 */
export function isMeaningfulCrop( crop ) {
	const c = normalizeCrop( crop );
	if ( ! c ) {
		return false;
	}
	if ( c.width <= 0 || c.height <= 0 ) {
		return false;
	}
	const trimsLeft = c.left > FULL_FRAME_EPSILON;
	const trimsTop = c.top > FULL_FRAME_EPSILON;
	const trimsRight = c.left + c.width < 100 - FULL_FRAME_EPSILON;
	const trimsBottom = c.top + c.height < 100 - FULL_FRAME_EPSILON;
	return trimsLeft || trimsTop || trimsRight || trimsBottom;
}

/**
 * Build the `modifiers[]` array for `POST /wp/v2/media/{id}/edit` from the
 * editor's UI state. Emits in REST-apply order — rotate, then flip, then crop —
 * and omits any no-op modifier (no rotation, no flip, full-frame crop) so the
 * array is empty exactly when there is nothing to save.
 *
 * @param {Object}  [state]        Editor state.
 * @param {number}  [state.rotation] Clockwise degrees.
 * @param {boolean} [state.flipH]    Mirror horizontally.
 * @param {boolean} [state.flipV]    Mirror vertically.
 * @param {?Object} [state.crop]     Crop rect in percent, or null.
 * @return {Array<Object>} The `modifiers` payload (possibly empty).
 */
export function buildModifiers( {
	rotation = 0,
	flipH = false,
	flipV = false,
	crop = null,
} = {} ) {
	const modifiers = [];

	const angle = rotateBy( rotation, 0 );
	if ( angle !== 0 ) {
		modifiers.push( { type: 'rotate', args: { angle } } );
	}

	if ( flipH || flipV ) {
		modifiers.push( {
			type: 'flip',
			args: { horizontal: !! flipH, vertical: !! flipV },
		} );
	}

	if ( isMeaningfulCrop( crop ) ) {
		const c = normalizeCrop( crop );
		modifiers.push( {
			type: 'crop',
			args: {
				left: c.left,
				top: c.top,
				width: c.width,
				height: c.height,
			},
		} );
	}

	return modifiers;
}

/**
 * Whether the current editor state carries any edit worth saving.
 *
 * @param {Object} [state] Editor state (see `buildModifiers`).
 * @return {boolean} True when at least one modifier would be emitted.
 */
export function hasPendingEdits( state ) {
	return buildModifiers( state ).length > 0;
}

/** Minimum crop dimension (percent of the frame) a resize drag may shrink to. */
export const MIN_CROP_PERCENT = 5;

/**
 * Translate (move) a crop rectangle by a pointer delta expressed in percent of
 * the frame, clamping so the box stays fully inside 0–100 on both axes.
 *
 * @param {Object} start `{ left, top, width, height }` crop at drag start.
 * @param {number} dxPct Horizontal delta in percent.
 * @param {number} dyPct Vertical delta in percent.
 * @return {Object} The moved crop.
 */
export function moveCrop( start, dxPct, dyPct ) {
	const left = Math.min(
		100 - start.width,
		Math.max( 0, start.left + dxPct )
	);
	const top = Math.min(
		100 - start.height,
		Math.max( 0, start.top + dyPct )
	);
	return { left, top, width: start.width, height: start.height };
}

/**
 * Resize a crop rectangle by dragging one of its corner handles. `handle` is a
 * compass tag (`nw` / `ne` / `sw` / `se`); each letter pins the opposite edge
 * and moves the named edge by the pointer delta, never crossing the pinned edge
 * (a minimum size is enforced) nor leaving the 0–100 frame.
 *
 * @param {string} handle  Corner tag — any of n/s/e/w letters.
 * @param {Object} start   `{ left, top, width, height }` crop at drag start.
 * @param {number} dxPct   Horizontal delta in percent.
 * @param {number} dyPct   Vertical delta in percent.
 * @param {number} [minSize] Minimum width/height in percent.
 * @return {Object} The resized crop.
 */
export function resizeCrop(
	handle,
	start,
	dxPct,
	dyPct,
	minSize = MIN_CROP_PERCENT
) {
	let { left, top } = start;
	let { width, height } = start;
	const right = start.left + start.width;
	const bottom = start.top + start.height;

	if ( handle.includes( 'w' ) ) {
		left = Math.max( 0, Math.min( clampPercent( left + dxPct ), right - minSize ) );
		width = right - left;
	}
	if ( handle.includes( 'e' ) ) {
		const newRight = Math.min(
			100,
			Math.max( clampPercent( right + dxPct ), left + minSize )
		);
		width = newRight - left;
	}
	if ( handle.includes( 'n' ) ) {
		top = Math.max( 0, Math.min( clampPercent( top + dyPct ), bottom - minSize ) );
		height = bottom - top;
	}
	if ( handle.includes( 's' ) ) {
		const newBottom = Math.min(
			100,
			Math.max( clampPercent( bottom + dyPct ), top + minSize )
		);
		height = newBottom - top;
	}

	return { left, top, width, height };
}

/**
 * The post-rotation display dimensions of an image: width and height swap on a
 * 90°/270° rotation. Flip never changes the bounding box. Used to size the
 * canvas/frame so the crop overlay's percentages line up with the rotated image
 * the server will produce.
 *
 * @param {number} naturalWidth  Source pixel width.
 * @param {number} naturalHeight Source pixel height.
 * @param {number} rotation      Clockwise degrees (0/90/180/270).
 * @return {{ width: number, height: number }} Display dimensions.
 */
export function displayDimensions( naturalWidth, naturalHeight, rotation = 0 ) {
	const angle = rotateBy( rotation, 0 );
	const swap = angle === 90 || angle === 270;
	return {
		width: swap ? naturalHeight : naturalWidth,
		height: swap ? naturalWidth : naturalHeight,
	};
}
