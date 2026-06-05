/**
 * resolveRegion — merge a region declaration with its engine template
 * (V2.M2 task 3 + task 4 recursion).
 *
 * When workspace.json declares `"sidebar": { "template": "core:sidebar", ... }`,
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
 *               override per key, merged into a single applied `style`
 *               map. Spec §5.2 splits `layout` (geometry) from `style`
 *               (decoration) at the AUTHORING layer — the workspace.json
 *               schema constrains `layout` to a geometry allowlist while
 *               `style` is free decoration — but both ultimately become
 *               inline CSS on the same region element. The runtime
 *               therefore deliberately collapses them into one `style`
 *               map here (template `default-style` < decl `style` < decl
 *               `layout`, per-key); `Region.js` applies that one map via
 *               `toReactStyle`. There is no runtime geometry/decoration
 *               split to perform — the split lives in the schema, not the
 *               renderer. (Amends the prior "task 6 will split this"
 *               deferral; see issue #71.)
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

const MAX_REGION_DEPTH = 10;

export function resolveRegion( declaration, engineManifest, depth = 0, visitedTemplates = null ) {
	if ( ! declaration || typeof declaration !== 'object' ) {
		return declaration;
	}

	if ( depth >= MAX_REGION_DEPTH ) {
		if ( typeof console !== 'undefined' ) {
			// eslint-disable-next-line no-console
			console.warn(
				`[wp-admin-workspaces] resolveRegion: max depth ${ MAX_REGION_DEPTH } exceeded; returning declaration unresolved (likely a self-referential template chain).`
			);
		}
		return declaration;
	}

	const templateId = declaration.template;
	const seen = visitedTemplates || new Set();
	if ( templateId && seen.has( templateId ) ) {
		if ( typeof console !== 'undefined' ) {
			// eslint-disable-next-line no-console
			console.warn(
				`[wp-admin-workspaces] resolveRegion: template cycle detected on "${ templateId }"; returning declaration unresolved.`
			);
		}
		return declaration;
	}
	const template =
		templateId && engineManifest?.templates
			? engineManifest.templates[ templateId ] || null
			: null;
	if ( template && templateId ) {
		seen.add( templateId );
	}

	const resolved = { ...declaration };

	if ( template ) {
		if ( declaration.role === undefined && template.role !== undefined ) {
			resolved.role = template.role;
		}

		// `label` (accessible name) inherits from the template like `role`;
		// a per-region declaration overrides. Lets an engine ship a sensible
		// default name (e.g. "Command palette") so the region isn't named by
		// its raw id slug. See spec §5.1.
		if ( declaration.label === undefined && template.label !== undefined ) {
			resolved.label = template.label;
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
		engineManifest,
		depth + 1,
		seen
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
function mergeNestedRegions( templateChildren, declarationChildren, engineManifest, depth = 0, visitedTemplates = null ) {
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
		// Each child gets a fresh visited-templates set so siblings can
		// reuse the same template id; the cycle guard only fires inside
		// a single chain.
		resolvedChildren[ key ] = resolveRegion( child, engineManifest, depth, new Set( visitedTemplates ) );
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
