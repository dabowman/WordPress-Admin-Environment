/**
 * Pure helpers for `EntityFormModal`'s commit step. Kept in a `.mjs` so the
 * node test harness (`tests/runtime/dataviews-shared.test.mjs`) can import them
 * without a webpack/jest harness, and so the REST-payload shaping the modal
 * relies on is pinned by a unit test (full JSDOM mount is a known repo gap).
 */

/**
 * Shape the CREATE REST payload `saveEntityRecord( kind, name, payload )`
 * receives.
 *
 * Funnels the create draft `data` through the caller-supplied `toRecord` mapper
 * (`toRecord` is **create-only** — edit commits through `useEntityRecord().save()`
 * in `EntityFormModal`, which buffers the record itself and never routes through
 * this helper). `toRecord` defaults to identity so a caller whose `DataForm`
 * data already matches the REST shape can omit it.
 *
 * @param {Object}   params
 * @param {Object}   params.data       The create draft `DataForm` data.
 * @param {Function} [params.toRecord] `(data) => payload` REST mapper.
 * @return {Object} The REST payload.
 */
export function buildSubmitPayload( { data, toRecord } ) {
	const map = typeof toRecord === 'function' ? toRecord : ( d ) => d;
	return { ...( map( data ?? {} ) ?? {} ) };
}

/**
 * Pull the single subject record out of a DataViews `RenderModal`'s `items`.
 *
 * DataViews hands actions an `items` array even for single-row actions; the
 * Modal Edit / Detail flows operate on `items[0]`. Returns `null` when the
 * array is empty/absent so the modal can guard instead of throwing.
 *
 * @param {Array} items The `RenderModal` `items` prop.
 * @return {Object|null} The first item, or `null`.
 */
export function firstItem( items ) {
	return Array.isArray( items ) && items.length ? items[ 0 ] : null;
}
