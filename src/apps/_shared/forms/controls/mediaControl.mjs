/**
 * Pure value-mapping helpers for the media-library-picker DataForm `Edit`
 * control (`MediaPicker.js`). Side-effect-free so node tests can import them
 * directly (`tests/runtime/form-controls.test.mjs`) without a React/webpack
 * harness.
 *
 * The picker stores an **attachment id** (the shape WordPress settings like
 * `site_icon` / `site_logo` use), not a URL — so these helpers normalize ids
 * and derive a preview URL from either a `MediaUpload` selection object or a
 * `@wordpress/core-data` media record.
 */

/**
 * Coerce a raw stored value to a positive integer attachment id, or `0`
 * ("no attachment"). Mirrors the REST `integer`/`minimum: 0` schema the
 * `site_icon` setting enforces server-side.
 *
 * @param {*} raw Raw value (number or string).
 * @return {number} Positive integer id, or 0.
 */
export function normalizeMediaId( raw ) {
	const n = parseInt( raw, 10 );
	return Number.isInteger( n ) && n > 0 ? n : 0;
}

/**
 * Extract the chosen attachment id from a `MediaUpload` `onSelect` payload.
 * `onSelect` hands back a single media object for single-select and an array
 * for `multiple` — this picker is single-select, so it reads the first entry
 * of an array.
 *
 * @param {Object|Array} selection `MediaUpload` selection payload.
 * @return {number} Positive integer id, or 0.
 */
export function mediaIdFromSelection( selection ) {
	if ( Array.isArray( selection ) ) {
		return normalizeMediaId( selection[ 0 ]?.id );
	}
	return normalizeMediaId( selection?.id );
}

/**
 * Derive a preview image URL from a media object. Accepts both shapes the
 * picker sees: a `MediaUpload` selection (`sizes[size].url` / `url`) and a
 * `@wordpress/core-data` media record (`media_details.sizes[size].source_url`
 * / `source_url`). Falls through size → full image so a thumbnail-less
 * attachment still previews.
 *
 * @param {Object} media            Media object (selection or core-data record).
 * @param {string} [size=thumbnail] Preferred registered image size.
 * @return {string} A URL, or '' when none resolvable.
 */
export function pickMediaPreviewUrl( media, size = 'thumbnail' ) {
	if ( ! media ) {
		return '';
	}
	const sized =
		media?.media_details?.sizes?.[ size ]?.source_url ||
		media?.sizes?.[ size ]?.url;
	return sized || media?.source_url || media?.url || '';
}
