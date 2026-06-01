/**
 * Pure helpers for `EntityFormModal`'s commit step. Kept in a `.mjs` so the
 * node test harness (`tests/runtime/dataviews-shared.test.mjs`) can import them
 * without a webpack/jest harness, and so the REST-payload shaping the modal
 * relies on is pinned by a unit test (full JSDOM mount is a known repo gap).
 */

/**
 * Shape the REST payload `saveEntityRecord( kind, name, payload )` receives.
 *
 * Both modes funnel `data` through the caller-supplied `toRecord` mapper. On an
 * EDIT the entity id is stamped onto the result so core-data routes the request
 * to `PATCH .../<id>` rather than `POST` (a create). A `toRecord` that already
 * carries the id wins — we never clobber an explicit value, but we backfill the
 * common case where the form data has no id of its own.
 *
 * `toRecord` defaults to identity so a caller whose `DataForm` data already
 * matches the REST shape can omit it.
 *
 * @param {Object}             params
 * @param {'edit'|'create'}    params.mode       Commit mode.
 * @param {Object}             params.data       The (edited) `DataForm` data.
 * @param {Function}           [params.toRecord] `(data) => payload` REST mapper.
 * @param {number|string|null} [params.id]       Entity id (edit mode only).
 * @return {Object} The REST payload.
 */
export function buildSubmitPayload( { mode, data, toRecord, id } ) {
	const map = typeof toRecord === 'function' ? toRecord : ( d ) => d;
	const payload = { ...( map( data ?? {} ) ?? {} ) };
	if (
		mode === 'edit' &&
		id !== undefined &&
		id !== null &&
		payload.id === undefined
	) {
		payload.id = id;
	}
	return payload;
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
