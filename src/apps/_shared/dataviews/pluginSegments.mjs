/**
 * Pure helpers for the plugins status-tab strip (`ViewTabs`).
 *
 * Plugins arrive in a single unpaginated `wp/v2/plugins` fetch, so per-status
 * counts come for free off the records (no extra count requests like the
 * server-paginated list apps need). These helpers turn that `{ status: count }`
 * tally into the segment descriptors `ViewTabs` renders, and derive the active
 * segment id from the controlled DataViews `view`.
 *
 * Lives in app space (`_shared/dataviews/`) alongside the other DataViews
 * scaffolding — NOT in `src/runtime/` (the kernel stays DS-neutral and free of
 * DataViews concepts). Pure (no imports) so `tests/runtime/*` can `import()` it
 * directly without a DOM or React; the `__()`-translated labels are injected by
 * the caller.
 */

/**
 * The REST `status` values the plugins endpoint reports. `network-active` only
 * occurs on multisite installs.
 */
export const PLUGIN_STATUS_VALUES = [ 'active', 'inactive', 'network-active' ];

/**
 * Build the plugins status-tab segment list for `ViewTabs`.
 *
 * "All" is always present (the unfiltered base, no count). "Active" and
 * "Inactive" are always shown — they mirror the classic Plugins screen's
 * `subsubsub` row and read fine at zero. "Network active" is surfaced ONLY when
 * the count tally actually carries that key: single-site installs never have a
 * network-active plugin, so the tab would otherwise filter to an empty list.
 *
 * The `filter.value` is the REST `status` arg the view applies when the segment
 * is active AND the key `useEntityElementCounts`-style tallies are keyed on, so
 * it doubles as the count lookup key in `mergeSegmentCounts`.
 *
 * @param {Object} root0          Options.
 * @param {Object} [root0.counts] `{ [status]: number }` tally off the records.
 * @param {Object} root0.labels   `{ all, active, inactive, 'network-active' }`
 *                                 translated segment labels.
 * @return {Array} Segment descriptors `[{ id, label, filter }]`.
 */
export function buildPluginStatusSegments( { counts = {}, labels } ) {
	const segments = [
		{ id: 'all', label: labels.all, filter: null },
		{
			id: 'active',
			label: labels.active,
			filter: { field: 'status', value: 'active' },
		},
		{
			id: 'inactive',
			label: labels.inactive,
			filter: { field: 'status', value: 'inactive' },
		},
	];
	if ( counts && counts[ 'network-active' ] !== undefined ) {
		segments.push( {
			id: 'network-active',
			label: labels[ 'network-active' ],
			filter: { field: 'status', value: 'network-active' },
		} );
	}
	return segments;
}

/**
 * Derive the active segment id from the controlled DataViews `view`. A single
 * `status` filter (`is`/`isAny` on one value) maps to the matching segment; an
 * absent or multi-value status filter falls back to "all".
 *
 * @param {Object} view     DataViews controlled view shape.
 * @param {Array}  segments Segments from `buildPluginStatusSegments`.
 * @return {string} The active segment id.
 */
export function activePluginSegment( view, segments ) {
	const statusFilter = ( view?.filters ?? [] ).find(
		( f ) => f.field === 'status'
	);
	if ( ! statusFilter ) {
		return 'all';
	}
	const { value } = statusFilter;
	const single = Array.isArray( value ) ? value : [ value ];
	if ( single.length !== 1 ) {
		return 'all';
	}
	const match = ( segments ?? [] ).find(
		( seg ) => seg.filter && seg.filter.value === single[ 0 ]
	);
	return match ? match.id : 'all';
}
