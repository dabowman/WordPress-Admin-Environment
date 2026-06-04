/**
 * Pinned status-filter lock for dedicated list screens.
 *
 * Some screens dedicate a list to a single status — Posts → Trash / Drafts /
 * Pending, comments → Spam / Trash, and any future equivalent. They pin the
 * status two ways: `config.status` on the screen AND a `defaultView.filters`
 * seed in the DataView variant. But the inherited `status` field stays
 * user-changeable in the DataViews filter UI, so switching it makes the list
 * fetch a *different* status than the screen's label implies — and because row
 * actions are gated by `eligibleWhen: { status: [...] }`, gated actions
 * (edit / view / trash on a Trash screen) reappear on rows inside a screen
 * labelled for another status. Classic wp-admin locks each of these views to
 * its status.
 *
 * This module is the generic lock. Two complementary layers:
 *
 * 1. **Query pin** (`applyStatusPin`) — the authoritative guarantee. The REST
 *    query always sends the pinned status, overriding any filter-derived
 *    status, so the data (and therefore action eligibility) is always correct
 *    even if a stale filter chip lingers in `view.filters`.
 * 2. **UI lock** (`lockStatusField`) — strips the status field's `filterBy` so
 *    DataViews offers no affordance to change the pinned status, while keeping
 *    it as a display / sort column.
 *
 * `resolvePinnedStatus` decides whether a screen pins at all: a concrete status
 * pins; `'any'` / absent is the freely-filterable "All" screen and does NOT
 * pin (so All Posts keeps its changeable status filter — no regression).
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly. Reusable
 * across entity-CRUD list apps — pass the entity's status REST param / field id
 * when they differ from the `'status'` default.
 */

/**
 * Resolve the pinned status for a screen from its `config.status`.
 *
 * @param {*} configStatus The screen's `config.status` value.
 * @return {string|null} The pinned status, or null when the screen is freely
 *                       filterable (`'any'` / absent / non-string).
 */
export function resolvePinnedStatus( configStatus ) {
	return typeof configStatus === 'string' &&
		configStatus !== '' &&
		configStatus !== 'any'
		? configStatus
		: null;
}

/**
 * Force the pinned status onto already-built REST query args, overriding any
 * filter-derived value. No-op when nothing is pinned, so the caller can apply
 * it unconditionally.
 *
 * @param {Object}      args          REST query args (mutated + returned).
 * @param {string|null} pinnedStatus  Result of `resolvePinnedStatus`.
 * @param {string}      [statusParam] REST param name (default `'status'`).
 * @return {Object} `args`.
 */
export function applyStatusPin( args, pinnedStatus, statusParam = 'status' ) {
	if ( pinnedStatus ) {
		args[ statusParam ] = pinnedStatus;
	}
	return args;
}

/**
 * Strip the status field's `filterBy` so DataViews renders no filter control
 * for it (the pinned status can't be changed from the UI), keeping the field as
 * a display / sort column. No-op when nothing is pinned. Returns a new array
 * with a cloned status spec; other specs pass through by reference.
 *
 * @param {Array}       fieldSpecs    View-config field specs.
 * @param {string|null} pinnedStatus  Result of `resolvePinnedStatus`.
 * @param {string}      [fieldId]     Status field id (default `'status'`).
 * @return {Array} Field specs with the status field made non-filterable.
 */
export function lockStatusField( fieldSpecs, pinnedStatus, fieldId = 'status' ) {
	if ( ! pinnedStatus ) {
		return fieldSpecs ?? [];
	}
	return ( fieldSpecs ?? [] ).map( ( spec ) => {
		if ( ! spec || spec.id !== fieldId || ! spec.filterBy ) {
			return spec;
		}
		const next = { ...spec };
		delete next.filterBy;
		return next;
	} );
}
