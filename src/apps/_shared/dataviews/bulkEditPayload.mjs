/**
 * Pure payload helper for `BulkEditModal`. Kept in a `.mjs` so the node test
 * harness (`tests/runtime/dataviews-shared.test.mjs`) can import it without a
 * webpack/jest harness, and so the payload-shaping the modal relies on is pinned
 * by a unit test (a full JSDOM mount is a known repo gap).
 */

/** Default per-field "— No change —" sentinel used by `BulkEditModal`. */
export const NO_CHANGE = '__wp_admin_shell_no_change__';

/**
 * Reduce a bulk-edit form's live `values` to just the fields the user actually
 * changed — the partial object spread onto each selected row's
 * `{ id, ...payload }` save.
 *
 * Bulk edit seeds every editable field to a per-field **"— No change —"**
 * sentinel; only fields whose value diverges from that sentinel should be
 * written. So `computeBulkPayload` keeps a key iff its value is **not** strictly
 * equal to `sentinel` (and not `undefined`).
 *
 * The sentinel is field-agnostic — the caller picks it (a string by default).
 * Any field whose real values could collide with the sentinel must use a
 * sentinel its domain never produces; the default `NO_CHANGE` is a namespaced
 * string safe for the string-valued fields bulk edit targets (status, role,
 * comment-status, etc.).
 *
 * Notes:
 * - Returns a NEW object; never mutates `values`.
 * - Keys equal to the sentinel are omitted entirely (vs. written `undefined`),
 *   so the REST PATCH body carries only intentional changes.
 * - `undefined` values are also omitted — a field DataForm never populated is
 *   not an edit. (`null` IS forwarded: clearing a field to `null` — e.g.
 *   unsetting a parent — is a real, intentional change.)
 *
 * @param {Object} values     Live DataForm values, keyed by field id.
 * @param {*}      [sentinel] The "no change" marker. Default `NO_CHANGE`.
 * @return {Object} Only the fields the user changed away from the sentinel.
 */
export function computeBulkPayload( values, sentinel = NO_CHANGE ) {
	if ( ! values || typeof values !== 'object' ) {
		return {};
	}
	const payload = {};
	for ( const key of Object.keys( values ) ) {
		const value = values[ key ];
		if ( value === sentinel || value === undefined ) {
			continue;
		}
		payload[ key ] = value;
	}
	return payload;
}
