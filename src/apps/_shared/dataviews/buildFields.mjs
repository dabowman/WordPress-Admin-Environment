/**
 * Shared DataViews field compiler for the entity-CRUD apps.
 *
 * View-config primitives ship as locale-agnostic JSON (spec §13 #7) — labels
 * reach DataViews in whatever locale the spec was authored in. Each app keeps
 * a `FIELD_LABELS` table mapping the ids it authors to `__()`-wrapped strings
 * and passes it as `labels`; unknown ids (plugin extension columns) fall
 * through to `spec.label` so third-party authors keep their own strings.
 *
 * The `render` callback comes from the React layer (`renderers`); view-config
 * only declares the field *shape*. `elementFallbacks` derives `elements` for a
 * field when the spec declares none — used for the `status` column, whose enum
 * is known to the app but usually omitted from the spec. `elementCounts`
 * augments the resolved elements with per-value totals so the filter UI can
 * surface status/role/type counts ("Published (12)") — DataViews has no native
 * count slot on elements, so the count rides the label.
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly.
 *
 * `getElements` forwards an async/lazy element provider (DataViews calls it to
 * resolve the option set for a categorical filter at filter-open time) for ids
 * whose options aren't known statically — e.g. a taxonomy filter that fetches
 * `/wp/v2/categories`. A `getElements[id]` wins over a static `elements`
 * spec/fallback for the same id.
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly.
 *
 * @param {Array}  fieldSpecs                 View-config field specs.
 * @param {Object} [options]
 * @param {Object} [options.labels]           id → translated label.
 * @param {Object} [options.renderers]        id → render callback.
 * @param {Object} [options.elementFallbacks] id → elements[] used when the spec omits `elements`.
 * @param {Object} [options.elementCounts]    id → { value: count } merged into the field's elements.
 * @param {Object} [options.getElements]      id → async element provider; sets the field's `getElements`.
 * @return {Array} Compiled DataViews fields.
 */
export function buildFields(
	fieldSpecs,
	{
		labels = {},
		renderers = {},
		elementFallbacks = {},
		elementCounts = {},
		getElements = {},
	} = {}
) {
	return ( fieldSpecs ?? [] )
		.filter( ( spec ) => spec && typeof spec === 'object' && spec.id )
		.map( ( spec ) => {
			const compiled = {
				id: spec.id,
				type: spec.type,
				label: labels[ spec.id ] ?? spec.label,
			};
			if ( spec.enableGlobalSearch !== undefined ) {
				compiled.enableGlobalSearch = !! spec.enableGlobalSearch;
			}
			if ( spec.enableHiding !== undefined ) {
				compiled.enableHiding = !! spec.enableHiding;
			}
			if ( spec.enableSorting !== undefined ) {
				compiled.enableSorting = !! spec.enableSorting;
			}
			let elements;
			if ( Array.isArray( spec.elements ) ) {
				elements = spec.elements;
			} else if ( elementFallbacks[ spec.id ] ) {
				elements = elementFallbacks[ spec.id ];
			}
			if ( elements ) {
				compiled.elements = withElementCounts(
					elements,
					elementCounts[ spec.id ]
				);
			}
			if ( typeof getElements[ spec.id ] === 'function' ) {
				compiled.getElements = getElements[ spec.id ];
			}
			if ( spec.filterBy ) {
				compiled.filterBy = spec.filterBy;
			}
			if ( renderers[ spec.id ] ) {
				compiled.render = renderers[ spec.id ];
			}
			return compiled;
		} );
}

/**
 * Build a DataViews `elements` array from an id → label table. Convenience for
 * the `status` element fallback: `{ publish: 'Published' }` → `[ { value:
 * 'publish', label: 'Published' } ]`.
 *
 * @param {Object} labels value → label map.
 * @return {Array} `[ { value, label } ]`.
 */
export function elementsFromLabels( labels ) {
	return Object.entries( labels ?? {} ).map( ( [ value, label ] ) => ( {
		value,
		label,
	} ) );
}

/**
 * Append per-value counts to element labels so a filter can read like the
 * classic wp-admin status tabs ("Published (12)"). DataViews has no dedicated
 * count slot on filter elements, so the count is folded into the label.
 *
 * An element is left untouched when its count is missing (`undefined`/`null`)
 * — counts resolve asynchronously, so the label shows plain until the total
 * lands. The matched filter `value` is never altered, so filtering keeps
 * working regardless of the displayed label.
 *
 * @param {Array}  elements `[ { value, label } ]`.
 * @param {Object} [counts] value → count.
 * @return {Array} Elements with counts merged into labels.
 */
export function withElementCounts( elements, counts ) {
	if ( ! counts ) {
		return elements;
	}
	return ( elements ?? [] ).map( ( element ) => {
		const count = counts[ element.value ];
		if ( count === undefined || count === null ) {
			return element;
		}
		return { ...element, label: `${ element.label } (${ count })` };
	} );
}
