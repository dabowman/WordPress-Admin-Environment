/**
 * Pure helpers for persisting a DataViews `view` to user preferences —
 * the Screen-Options-equivalent (column visibility, sort, per-page, layout).
 *
 * Storage lives in the shell's `wp_admin_shell_user_prefs` user-meta, written
 * through `POST /wp-admin-shell/v1/user-prefs` (partial deep-merge, `null`
 * tombstones a key). The blob lives under a top-level `dataViews` key, sub-
 * keyed by `screenId`:
 *
 *   { "dataViews": { "posts": { "fields": [...], "sort": {...}, ... } } }
 *
 * The cascade resolver's consumer-origin `customizable` walker only copies the
 * recognized admin.json blocks (`settings` / `styles` / the v3 top-level
 * blocks) into the merged doc, so a `dataViews` top-level key is **silently
 * dropped from the resolved config** — no pollution — while remaining stored in
 * the meta and readable via the `/user-prefs` GET endpoint (same pattern the
 * `shell` / `default-route` prefs already use). These helpers are side-effect
 * free so `tests/runtime/dataviews-shared.test.mjs` can import them directly.
 */

/** Top-level user-prefs key the view blobs live under. */
export const PREFS_KEY = 'dataViews';

/**
 * View axes that persist (the Screen-Options-equivalent durable state). These
 * survive navigation + reload. `search` / `filters` / `page` are deliberately
 * excluded — they're transient query state, not remembered preferences (this
 * matches what wp-admin Screen Options remembers: hidden columns + per-page,
 * not the current search/filter/page).
 */
export const DURABLE_AXES = [
	'type',
	'fields',
	'sort',
	'perPage',
	'layout',
	'titleField',
	'mediaField',
	'descriptionField',
	'showTitle',
	'showMedia',
	'showDescription',
];

/**
 * Project a full `view` down to only the durable axes worth persisting.
 *
 * @param {Object} view A DataViews `view` object.
 * @return {Object} A new object containing only present durable axes.
 */
export function pickDurableView( view ) {
	const out = {};
	if ( ! view || typeof view !== 'object' ) {
		return out;
	}
	for ( const axis of DURABLE_AXES ) {
		if ( view[ axis ] !== undefined ) {
			out[ axis ] = view[ axis ];
		}
	}
	return out;
}

/**
 * Read the saved durable view for a screen out of a full prefs blob.
 *
 * @param {Object} prefs    The full user-prefs object (from GET /user-prefs).
 * @param {string} screenId The active screen id.
 * @return {Object|null} The saved durable view, or null when none is stored.
 */
export function readSavedView( prefs, screenId ) {
	if ( ! prefs || typeof prefs !== 'object' || ! screenId ) {
		return null;
	}
	const bucket = prefs[ PREFS_KEY ];
	if ( ! bucket || typeof bucket !== 'object' ) {
		return null;
	}
	const saved = bucket[ screenId ];
	if ( ! saved || typeof saved !== 'object' ) {
		return null;
	}
	return saved;
}

/**
 * Build the partial POST body that persists a screen's durable view.
 *
 * The server deep-merges this onto the existing prefs, so only the touched
 * screen's bucket is written; sibling screens' saved views are untouched.
 *
 * @param {string} screenId The active screen id.
 * @param {Object} view     The full or durable `view` to persist.
 * @return {Object|null} The POST body, or null when there's nothing to write.
 */
export function buildSavePatch( screenId, view ) {
	if ( ! screenId ) {
		return null;
	}
	return { [ PREFS_KEY ]: { [ screenId ]: pickDurableView( view ) } };
}

/**
 * Merge a saved durable view over a freshly-seeded view. Saved durable axes
 * win (so the user's Screen-Options state beats the resolved `defaultView` for
 * the SAME screen), but only for the durable axes — transient axes (search /
 * filters / page) keep the seed so a deep-linked filter/search isn't clobbered.
 *
 * @param {Object}      seed  The `viewDefaults` + `defaultView` seed.
 * @param {Object|null} saved The saved durable view (or null).
 * @return {Object} The reconciled view.
 */
export function applySavedView( seed, saved ) {
	if ( ! saved || typeof saved !== 'object' ) {
		return seed;
	}
	return { ...seed, ...pickDurableView( saved ) };
}
