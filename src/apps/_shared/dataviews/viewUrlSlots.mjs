/**
 * Pure view ⇄ URL-slot mapping for the entity-CRUD list apps.
 *
 * The shared `view` state owned by `useEntityDataView` keeps the *transient*
 * axes (page + filters) in `useState` — they are deliberately NOT persisted to
 * user-prefs (only the durable axes are; see `dataViewPrefs.mjs`). That makes
 * them lost on refresh / un-deep-linkable. This module is the opt-in bridge
 * that lets an app mirror NavigationApp's `?screen=` pattern: declare which
 * transient axes live in named URL query slots, and refresh / deep-link /
 * browser-back survive.
 *
 * Kept pure + node-importable (`.mjs`, no `window`, no React) so the mapping
 * is unit-tested in isolation (`tests/runtime/dataviews-shared.test.mjs`); the
 * `window`/router wiring lives in `useEntityDataView`.
 *
 * The slot spec shape (per app):
 *
 *   {
 *     // view.page ⇄ ?<param>=N (a positive integer; omitted when === 1).
 *     page: 'paged',
 *     // Single-value `is`-operator filters ⇄ ?<param>=<value>.
 *     filters: [ { field: 'type', param: 'media_type', operator: 'is' } ],
 *   }
 *
 * Only single-value filters are slotted — multi-value / range operators stay in
 * `useState` (they don't round-trip cleanly through one query param and aren't
 * the parity gap #136 targets).
 */

/** Default page when the URL omits the `page` slot. */
const DEFAULT_PAGE = 1;

/**
 * Read URL query params → a normalized slot state `{ page, filters }`.
 *
 * `page` is always present (defaults to {@link DEFAULT_PAGE} when the param is
 * absent or non-positive); `filters` carries only the slotted filters that are
 * present + non-empty in the URL, each as a DataViews `{ field, operator, value }`.
 *
 * @param {Object} params URL query params (`useRoute().params`).
 * @param {Object} spec   Slot spec (see module docblock).
 * @return {{ page: number, filters: Array }} Normalized slot state.
 */
export function readViewSlots( params, spec ) {
	const safeParams = params && typeof params === 'object' ? params : {};
	const safeSpec = spec && typeof spec === 'object' ? spec : {};

	let page = DEFAULT_PAGE;
	if ( safeSpec.page && safeParams[ safeSpec.page ] !== undefined ) {
		const parsed = parseInt( safeParams[ safeSpec.page ], 10 );
		if ( Number.isInteger( parsed ) && parsed > 0 ) {
			page = parsed;
		}
	}

	const filters = [];
	for ( const slot of Array.isArray( safeSpec.filters )
		? safeSpec.filters
		: [] ) {
		const raw = safeParams[ slot.param ];
		if ( raw !== undefined && raw !== '' ) {
			filters.push( {
				field: slot.field,
				operator: slot.operator || 'is',
				value: raw,
			} );
		}
	}

	return { page, filters };
}

/**
 * Overlay normalized slot state onto a base view: `page` is replaced, and every
 * slotted *field* is rebuilt from the slot state (URL is authoritative for those
 * fields — a field absent from the URL is cleared). Non-slotted filters and all
 * other view axes are preserved untouched.
 *
 * @param {Object} view  Base view.
 * @param {Object} slots Normalized slot state (from {@link readViewSlots}).
 * @param {Object} spec  Slot spec (to know which fields are slotted).
 * @return {Object} A new view with the slotted axes applied.
 */
export function applyViewSlots( view, slots, spec ) {
	const base = view && typeof view === 'object' ? view : {};
	const safeSlots = slots && typeof slots === 'object' ? slots : {};
	const safeSpec = spec && typeof spec === 'object' ? spec : {};

	const slottedFields = new Set(
		( Array.isArray( safeSpec.filters ) ? safeSpec.filters : [] ).map(
			( slot ) => slot.field
		)
	);
	const preserved = ( Array.isArray( base.filters ) ? base.filters : [] ).filter(
		( filter ) => ! slottedFields.has( filter.field )
	);

	return {
		...base,
		page:
			safeSlots.page !== undefined && safeSlots.page !== null
				? safeSlots.page
				: base.page ?? DEFAULT_PAGE,
		filters: [
			...preserved,
			...( Array.isArray( safeSlots.filters ) ? safeSlots.filters : [] ),
		],
	};
}

/**
 * Project a view down to the flat URL-param map for its slotted axes. A value of
 * `null` means "remove the param" (page === default, or filter absent / empty).
 *
 * @param {Object} view View to read.
 * @param {Object} spec Slot spec.
 * @return {Object} `{ [param]: string|null }` for every param in the spec.
 */
export function viewSlotParams( view, spec ) {
	const base = view && typeof view === 'object' ? view : {};
	const safeSpec = spec && typeof spec === 'object' ? spec : {};
	const out = {};

	if ( safeSpec.page ) {
		const page = Number( base.page );
		out[ safeSpec.page ] =
			Number.isInteger( page ) && page > DEFAULT_PAGE
				? String( page )
				: null;
	}

	const filters = Array.isArray( base.filters ) ? base.filters : [];
	for ( const slot of Array.isArray( safeSpec.filters )
		? safeSpec.filters
		: [] ) {
		const match = filters.find(
			( filter ) =>
				filter.field === slot.field &&
				filter.value !== null &&
				filter.value !== undefined &&
				filter.value !== ''
		);
		out[ slot.param ] = match ? String( match.value ) : null;
	}

	return out;
}

/**
 * Merge a flat param map (from {@link viewSlotParams}) into an existing query
 * string, returning the new query string. `null`/`undefined` values delete the
 * param; everything else is set. Params NOT named in `paramMap` are preserved,
 * so the slot write never clobbers an unrelated slot (`?screen=`, `?detail=`).
 *
 * @param {string} search   Current query string (without leading `?`).
 * @param {Object} paramMap `{ [param]: string|null }`.
 * @return {string} The merged query string (without leading `?`).
 */
export function mergeSlotParams( search, paramMap ) {
	const params = new URLSearchParams(
		typeof search === 'string' ? search : ''
	);
	for ( const [ key, value ] of Object.entries( paramMap || {} ) ) {
		if ( value === null || value === undefined ) {
			params.delete( key );
		} else {
			params.set( key, value );
		}
	}
	return params.toString();
}

/**
 * Stable serialization of a view's slot params for cheap equality checks
 * (effect dependencies, "did the slotted axes actually change?" guards).
 *
 * @param {Object} view View to read.
 * @param {Object} spec Slot spec.
 * @return {string} Deterministic string keyed by param name.
 */
export function serializeSlotParams( view, spec ) {
	const map = viewSlotParams( view, spec );
	return Object.keys( map )
		.sort()
		.map( ( key ) => `${ key }=${ map[ key ] === null ? '' : map[ key ] }` )
		.join( '&' );
}
