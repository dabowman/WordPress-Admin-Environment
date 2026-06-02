/**
 * buildQueryArgs — declarative DataViews `view` → REST query-args mapper.
 *
 * Translates a DataViews `view` object (search / filters / sort / pagination)
 * into a plain REST query-args object, driven entirely by a declarative
 * `mapping` config. No entity-specific logic lives here; each app supplies
 * its own mapping and optionally merges static args on top.
 *
 * ## Mapping shape
 *
 * ```js
 * const MAPPING = {
 *   // Search: REST param name for `view.search` (default: 'search').
 *   search: 'search',
 *
 *   // Sort: how to render `view.sort`.
 *   sort: {
 *     // REST param for the sort field (default: 'orderby').
 *     orderby: 'orderby',
 *     // REST param for the sort direction (default: 'order').
 *     order: 'order',
 *     // Optional field-id → REST orderby alias map.
 *     // When the DataViews field id differs from the REST `orderby` value,
 *     // declare it here. Unknown ids pass through as-is.
 *     aliases: { registered_date: 'registered_date', date: 'date_gmt' },
 *     // Default value for the orderby param when view.sort is absent.
 *     defaultField: 'date',
 *     // Default value for the order param when view.sort is absent.
 *     defaultDirection: 'desc',
 *   },
 *
 *   // Pagination: REST param names. `view.perPage` → `per_page`,
 *   // `view.page` → `page` (the REST defaults). A `null`/`undefined`
 *   // `perPage`/`page` omits the key entirely rather than emitting an
 *   // undefined value — functionally equivalent at the REST layer (the
 *   // server falls back to its own default), and in practice `view` always
 *   // carries both from VIEW_DEFAULTS so the guard is rarely hit.
 *   pagination: {
 *     perPage: 'per_page',  // default
 *     page: 'page',         // default
 *   },
 *
 *   // Filters: per-field config keyed by DataViews field id. The value at
 *   // each operator key (`is` / `isAny`) is the REST param name to emit —
 *   // this matches what posts/users/comments REST expect: `is` → a single
 *   // scalar param (e.g. `status=draft`, `author=5`), `isAny` → the same
 *   // param carrying a CSV of the selected values (e.g. `status=draft,pending`,
 *   // `roles=editor,author`). DataViews' multi-select filters surface as
 *   // `isAny`; single-select as `is`.
 *   filters: {
 *     status: {
 *       // 'is' operator → REST param = filter.value (scalar).
 *       is: 'status',
 *       // 'isAny' operator → REST param = filter.value.join(',') (CSV).
 *       isAny: 'status',
 *     },
 *     author: {
 *       is: 'author',
 *     },
 *     roles: {
 *       is: 'roles',
 *       // `isAny` on the same param collapses the array to CSV.
 *       isAny: 'roles',
 *     },
 *   },
 * };
 * ```
 *
 * ### Operator semantics
 *
 * | Operator | Behaviour |
 * |----------|-----------|
 * | `is`     | Sets `restParam = filter.value` (scalar). Skipped when the value
 * |          | is empty string, null, or undefined — but `0` and `false` are
 * |          | kept (a numeric `author: 0` or a boolean filter must pass
 * |          | through). NOT a blanket falsy check. |
 * | `isAny`  | Joins `filter.value[]` as CSV into `restParam`. Empty-string /
 * |          | null / undefined members are dropped before joining (`0` and
 * |          | `false` are kept). Skipped when the normalised array is empty.
 * |          | Non-array value is wrapped. |
 *
 * Unrecognised operators are silently ignored — this matches the current
 * hand-rolled behavior (`isAll` is explicitly unhandled everywhere).
 *
 * ## Usage (app-side `useMemo`)
 *
 * ```js
 * const QUERY_MAPPING = {
 *   sort: { defaultField: 'date', defaultDirection: 'desc' },
 *   filters: {
 *     status: { is: 'status', isAny: 'status' },
 *     author: { is: 'author' },
 *   },
 * };
 *
 * const queryArgs = useMemo( () => buildQueryArgs( view, QUERY_MAPPING, {
 *   context: 'edit',
 *   _embed: 'author',
 *   status: config.status || 'any',  // static default overridden by view filters
 * } ), [ view, config.status ] );
 * ```
 *
 * Note: `staticArgs` are applied FIRST; filter-derived values override them.
 * This lets each app declare entity-specific REST params (context, _embed,
 * post_type, etc.) that the generic mapper has no knowledge of.
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly.
 *
 * @param {Object} view         DataViews view object.
 * @param {Object} [mapping]    Declarative mapping config (see above).
 * @param {Object} [staticArgs] Static REST args merged in before filter
 *                              translation (filter values win on conflict).
 * @return {Object} REST query-args object.
 */
export function buildQueryArgs( view, mapping = {}, staticArgs = {} ) {
	if ( ! view || typeof view !== 'object' ) {
		return { ...staticArgs };
	}

	const args = { ...staticArgs };

	// --- Pagination ----------------------------------------------------------
	const paginationMap = mapping.pagination ?? {};
	const perPageParam = paginationMap.perPage ?? 'per_page';
	const pageParam = paginationMap.page ?? 'page';

	if ( view.perPage !== null && view.perPage !== undefined ) {
		args[ perPageParam ] = view.perPage;
	}
	if ( view.page !== null && view.page !== undefined ) {
		args[ pageParam ] = view.page;
	}

	// --- Sort ----------------------------------------------------------------
	const sortMap = mapping.sort ?? {};
	const orderbyParam = sortMap.orderby ?? 'orderby';
	const orderParam = sortMap.order ?? 'order';
	const aliases = sortMap.aliases ?? {};
	const defaultField = sortMap.defaultField ?? 'date';
	const defaultDirection = sortMap.defaultDirection ?? 'desc';

	const rawSortField = view.sort?.field ?? defaultField;
	const sortField = aliases[ rawSortField ] ?? rawSortField;
	args[ orderbyParam ] = sortField;
	args[ orderParam ] = view.sort?.direction ?? defaultDirection;

	// --- Search --------------------------------------------------------------
	const searchParam =
		typeof mapping.search === 'string' ? mapping.search : 'search';
	if ( view.search ) {
		args[ searchParam ] = view.search;
	}

	// --- Filters -------------------------------------------------------------
	const filtersMap = mapping.filters ?? {};
	const filters = Array.isArray( view.filters ) ? view.filters : [];

	for ( const filter of filters ) {
		const fieldMap = filtersMap[ filter.field ];
		if ( ! fieldMap ) {
			// No mapping declared for this field — silently skip.
			continue;
		}

		const { operator, value } = filter;

		if ( operator === 'is' ) {
			const restParam = fieldMap.is;
			if (
				restParam &&
				value !== null &&
				value !== undefined &&
				value !== ''
			) {
				args[ restParam ] = value;
			}
		} else if ( operator === 'isAny' ) {
			const restParam = fieldMap.isAny;
			if ( restParam ) {
				const values = Array.isArray( value ) ? value : [ value ];
				const defined = values.filter(
					( v ) => v !== null && v !== undefined && v !== ''
				);
				if ( defined.length ) {
					args[ restParam ] = defined.join( ',' );
				}
			}
		}
		// isAll and unknown operators are intentionally not handled — the REST
		// API has no AND-multi equivalent; callers needing isAll must stay
		// hand-rolled.
	}

	return args;
}
