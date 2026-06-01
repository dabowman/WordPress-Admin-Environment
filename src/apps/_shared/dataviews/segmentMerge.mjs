/**
 * Pure segment/count-merge utilities for the ViewTabs component.
 *
 * Lives in app space (`_shared/dataviews/`) because it ships alongside other
 * DataViews scaffolding — NOT in `src/runtime/` (the kernel must stay DS-neutral
 * and free of DataViews concepts).
 *
 * Pure (no imports) so `tests/runtime/*` can `import()` it directly.
 */

/**
 * Merge per-segment live counts from `useEntityElementCounts` into a segment
 * descriptor array. Each segment whose `filter.value` matches a key in
 * `counts` receives its total; segments without a match are returned as-is
 * so they render plain (counts resolve asynchronously — no "0" flash on load).
 *
 * The `filter.value` is the authoritative count key because that is the REST
 * query-arg value the view applies when the segment is active — it must stay
 * unchanged so filtering keeps working regardless of the displayed label.
 *
 * @param {Array}  segments `[{ id, label, filter: { field, value } }]`.
 * @param {Object} counts   `{ [filterValue]: number }` from `useEntityElementCounts`.
 * @return {Array} Segments enriched with a `count` property where resolved.
 *                 The original segment objects are not mutated.
 */
export function mergeSegmentCounts( segments, counts ) {
	if ( ! Array.isArray( segments ) || segments.length === 0 ) {
		return segments ?? [];
	}
	if ( ! counts || typeof counts !== 'object' ) {
		return segments;
	}
	return segments.map( ( segment ) => {
		const filterValue = segment?.filter?.value;
		const count =
			filterValue !== undefined ? counts[ filterValue ] : undefined;
		if ( count === undefined || count === null ) {
			return segment;
		}
		return { ...segment, count };
	} );
}

/**
 * Determine whether a segment is currently active by comparing its filter
 * against the active `currentValue`.
 *
 * `currentValue` is whatever the consumer tracks as the "selected" segment id.
 * If both `currentValue` and `segment.id` are undefined/null, the segment is
 * NOT considered active — callers should supply an explicit default.
 *
 * @param {Object} segment      `{ id, ... }` descriptor.
 * @param {*}      currentValue The currently selected segment id.
 * @return {boolean} True when this segment is the active one.
 */
export function isSegmentActive( segment, currentValue ) {
	if ( ! segment || currentValue === undefined || currentValue === null ) {
		return false;
	}
	return segment.id === currentValue;
}
