/**
 * Pure value-mapping helpers for the range/slider DataForm `Edit` control
 * (`RangeControl.js`). Side-effect-free so node tests can import them directly
 * (`tests/runtime/form-controls.test.mjs`) without a React/webpack harness.
 */

/**
 * Clamp a control value into a `[min, max]` range.
 *
 * `@wordpress/components` `RangeControl` hands `onChange` either a finite number
 * or `undefined` (the reset affordance / an empty input field). Non-finite
 * input (empty string, `NaN`, `undefined`) collapses to `min` — the safe floor
 * for the image-dimension fields this backs, where a missing value means "do
 * not generate this size" (0).
 *
 * @param {*}      value             Raw control value.
 * @param {Object} [bounds]          Range bounds.
 * @param {number} [bounds.min=0]    Lower bound (also the invalid-input fallback).
 * @param {number} [bounds.max]      Upper bound (defaults to +Infinity).
 * @return {number} The clamped, finite number.
 */
export function clampRange(
	value,
	{ min = 0, max = Number.POSITIVE_INFINITY } = {}
) {
	const n = Number( value );
	if ( ! Number.isFinite( n ) ) {
		return min;
	}
	return Math.min( Math.max( n, min ), max );
}

/**
 * Resolve a field value to the number `RangeControl` expects, or `undefined`
 * when the stored value is non-numeric (so the slider renders unset rather than
 * snapping to a bogus position).
 *
 * @param {*} value Stored field value.
 * @return {number|undefined} Finite number, or `undefined`.
 */
export function rangeDisplayValue( value ) {
	const n = Number( value );
	return Number.isFinite( n ) ? n : undefined;
}
