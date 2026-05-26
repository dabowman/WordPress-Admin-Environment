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
 * is known to the app but usually omitted from the spec.
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly.
 *
 * @param {Array}  fieldSpecs                  View-config field specs.
 * @param {Object} [options]
 * @param {Object} [options.labels]            id → translated label.
 * @param {Object} [options.renderers]         id → render callback.
 * @param {Object} [options.elementFallbacks]  id → elements[] used when the spec omits `elements`.
 * @return {Array} Compiled DataViews fields.
 */
export function buildFields(
	fieldSpecs,
	{ labels = {}, renderers = {}, elementFallbacks = {} } = {}
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
			if ( Array.isArray( spec.elements ) ) {
				compiled.elements = spec.elements;
			} else if ( elementFallbacks[ spec.id ] ) {
				compiled.elements = elementFallbacks[ spec.id ];
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
