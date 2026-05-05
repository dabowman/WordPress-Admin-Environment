/**
 * resolveRegion — merge a region declaration with its engine template
 * (V2.M2 task 3).
 *
 * When admin.json declares `"sidebar": { "template": "core:sidebar", ... }`,
 * the kernel looks up the template in the engine manifest and produces a
 * resolved declaration that carries the template's defaults plus any
 * per-region overrides.
 *
 * Merge precedence (per spec §5):
 *   - role:     declaration wins; template fills in.
 *   - platform: shallow merge {...template, ...declaration}.
 *   - layout:   template's `default-style` flows in as `layout`/`style`-
 *               adjacent defaults; declaration's `layout` and `style`
 *               override per key. Spec §5.2 splits `layout` (geometry)
 *               from `style` (decoration); v1 templates ship a single
 *               `default-style` that blends both — task 6 will split
 *               them at the dispatch layer once platform-service routing
 *               replaces kind-based dispatch. For task 3, emit `style`
 *               with the merged token-aliased defaults so consumers
 *               continue reading one map.
 *   - regions:  child regions merge by name; declaration's child wins
 *               outright (no recursive merge — children either inherit
 *               from a template themselves or are declared from scratch).
 *               Template-only children carry through.
 *
 * Pure: takes (declaration, engineManifest), returns a new object.
 * Returns the declaration unchanged when it has no `template`, or when
 * the engine doesn't ship a template by that id (caller logs).
 *
 * The engine manifest's `templates[id]` entries follow `admin-engine-v2.json`
 * — `role`, `platform`, `default-style`, optional nested `regions`.
 */

export function resolveRegion( declaration, engineManifest ) {
	if ( ! declaration || typeof declaration !== 'object' ) {
		return declaration;
	}
	const templateId = declaration.template;
	if ( ! templateId ) {
		return declaration;
	}
	const template = engineManifest?.templates?.[ templateId ];
	if ( ! template ) {
		return declaration;
	}

	const resolved = { ...declaration };

	if ( declaration.role === undefined && template.role !== undefined ) {
		resolved.role = template.role;
	}

	if ( template.platform || declaration.platform ) {
		resolved.platform = {
			...( template.platform || {} ),
			...( declaration.platform || {} ),
		};
	}

	const templateDefaults = template[ 'default-style' ] || {};
	if ( Object.keys( templateDefaults ).length || declaration.style || declaration.layout ) {
		resolved.style = {
			...templateDefaults,
			...( declaration.style || {} ),
			...( declaration.layout || {} ),
		};
	}

	const mergedRegions = mergeNestedRegions(
		template.regions,
		declaration.regions
	);
	if ( mergedRegions ) {
		resolved.regions = mergedRegions;
	}

	return resolved;
}

/**
 * Per spec §5.5: child regions declared in both the template and the
 * declaration merge by name. Declaration's child takes the entire
 * declaration outright (no nested merge — a child that wants template
 * inheritance instantiates a template itself via its own `template`
 * field). Template-only children carry through unchanged.
 */
function mergeNestedRegions( templateChildren, declarationChildren ) {
	const t = templateChildren && typeof templateChildren === 'object' ? templateChildren : null;
	const d = declarationChildren && typeof declarationChildren === 'object' ? declarationChildren : null;
	if ( ! t && ! d ) {
		return null;
	}
	const merged = { ...( t || {} ) };
	if ( d ) {
		Object.assign( merged, d );
	}
	return merged;
}

/**
 * Resolve every region in a `regionsMap` against the engine manifest.
 * Convenience for kernel.js so it doesn't repeat the iteration.
 *
 * Returns a new map; original input is not mutated.
 */
export function resolveRegions( regionsMap, engineManifest ) {
	if ( ! regionsMap || typeof regionsMap !== 'object' ) {
		return {};
	}
	const out = {};
	for ( const [ id, declaration ] of Object.entries( regionsMap ) ) {
		out[ id ] = resolveRegion( declaration, engineManifest );
	}
	return out;
}
