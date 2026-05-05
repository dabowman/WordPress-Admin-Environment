/**
 * resolveRegion — merge a region declaration with its engine template
 * (V2.M2 task 3 + task 4 recursion).
 *
 * When admin.json declares `"sidebar": { "template": "core:sidebar", ... }`,
 * the kernel looks up the template in the engine manifest and produces a
 * resolved declaration that carries the template's defaults plus any
 * per-region overrides. Children declared under `regions: { ... }` are
 * resolved recursively (task 4) so deep nesting + per-child templates
 * compose without further coordination from the kernel.
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
 *               replaces kind-based dispatch. For now, emit `style` with
 *               the merged token-aliased defaults so consumers continue
 *               reading one map.
 *   - regions:  child regions merge by name; declaration's child wins
 *               whole-child (no nested merge — children that want
 *               template inheritance instantiate a template themselves
 *               via their own `template` field). Each merged child is
 *               then recursively resolved against the engine manifest.
 *
 * Pure: takes (declaration, engineManifest), returns a new object.
 * Declarations without a `template` field still recurse into their
 * `regions` so deeply-templated children resolve regardless of where
 * they sit in the tree.
 *
 * The engine manifest's `templates[id]` entries follow `admin-engine-v2.json`
 * — `role`, `platform`, `default-style`, optional nested `regions`.
 */

export function resolveRegion( declaration, engineManifest ) {
	if ( ! declaration || typeof declaration !== 'object' ) {
		return declaration;
	}

	const templateId = declaration.template;
	const template =
		templateId && engineManifest?.templates
			? engineManifest.templates[ templateId ] || null
			: null;

	const resolved = { ...declaration };

	if ( template ) {
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
	}

	const mergedChildren = mergeNestedRegions(
		template?.regions,
		declaration.regions,
		engineManifest
	);
	if ( mergedChildren ) {
		resolved.regions = mergedChildren;
	}

	return resolved;
}

/**
 * Per spec §5.5: child regions declared in both the template and the
 * declaration merge by name. Declaration's child takes the entire
 * declaration outright (no nested merge — a child that wants template
 * inheritance instantiates a template itself via its own `template`
 * field). Template-only children carry through unchanged.
 *
 * V2.M2 task 4: each merged child runs through `resolveRegion` again so
 * a child that declares its own `template` gets resolved against the
 * engine manifest. Recursion is unbounded — spec §5.5 permits arbitrary
 * nesting; convention discourages going more than two levels deep.
 */
function mergeNestedRegions( templateChildren, declarationChildren, engineManifest ) {
	const t = templateChildren && typeof templateChildren === 'object' ? templateChildren : null;
	const d = declarationChildren && typeof declarationChildren === 'object' ? declarationChildren : null;
	if ( ! t && ! d ) {
		return null;
	}
	const merged = { ...( t || {} ) };
	if ( d ) {
		Object.assign( merged, d );
	}
	const resolvedChildren = {};
	for ( const [ key, child ] of Object.entries( merged ) ) {
		resolvedChildren[ key ] = resolveRegion( child, engineManifest );
	}
	return resolvedChildren;
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
