/**
 * Mode resolver — v3.
 *
 * The PHP side has already flattened the engine's `modes` catalog: every
 * mode's `extends` chain is walked, deep-merged, and plugin-contributed
 * modes (via the `wp_admin_shell_engine_modes_{engineId}` filter) are
 * already in the catalog. This JS-side resolver does the per-screen step:
 *
 *   1. Look up the screen's mode (default: `'default'`).
 *   2. Resolve the mode in the catalog (with one extra safety pass for
 *      `extends` chains in case JS callers pass an unflattened catalog —
 *      e.g. tests, Storybook, or a future client-side flatten path).
 *   3. Modal modes short-circuit: `{ modal: true, regions: null }`.
 *   4. Deep-merge the screen's own `regions` override on top of the
 *      mode's resolved `regions`. Screen wins per-field.
 *
 * The returned `regions` map is region-id-keyed; each value is the
 * engine-defined region-state object (`{ hidden, compact, minimal,
 * fullWidth, ... }`). Region.js reads the map per-region at render time.
 *
 * Pure: no imports, no side effects. Mirrors the PHP semantics in
 * `WP_Admin_Shell_Modes::resolve_engine_modes` + per-screen merge.
 */

const MAX_EXTENDS_DEPTH = 10;

/**
 * Resolve the mode for a given screen.
 *
 * @param {string} screenId    Screen id (key under `screens`).
 * @param {Object} engineModes Flattened engine-modes catalog (from
 *                             `window.wpAdminShell.engineModes` in production
 *                             or a test-provided fixture).
 * @param {Object} screens     Map of screen id → screen doc.
 * @return {{ modal: boolean, regions: Object|null, modeId: string }}
 *         When `modal: true`, `regions: null` (chrome unchanged). Otherwise
 *         `regions` is the resolved region-state map.
 */
export function resolveMode( screenId, engineModes, screens ) {
	const catalog = engineModes && typeof engineModes === 'object' ? engineModes : {};
	const screen =
		screens && typeof screens === 'object' && screens[ screenId ]
			? screens[ screenId ]
			: null;
	const requestedMode =
		( screen && typeof screen.mode === 'string' && screen.mode ) || 'default';

	// Re-flatten in case the catalog hasn't been pre-flattened. In
	// production the PHP side flattens before serialization, so this is
	// effectively a no-op. Tests / Storybook bypass PHP and benefit.
	let modeDoc = flattenMode( requestedMode, catalog );

	if ( ! modeDoc ) {
		// Unknown mode — fall back to the default. Mirrors the PHP
		// resolver's policy: missing mode references degrade gracefully
		// rather than blocking the screen.
		modeDoc = flattenMode( 'default', catalog ) || { regions: {} };
	}

	// Modal modes ignore region state — the underlying screen keeps its
	// chrome and the modal layer renders above. Engine-managed LIFO
	// stacking happens above the resolver.
	if ( modeDoc.modal === true ) {
		return { modal: true, regions: null, modeId: requestedMode };
	}

	const modeRegions =
		modeDoc.regions && typeof modeDoc.regions === 'object'
			? modeDoc.regions
			: {};
	const screenRegions =
		screen && screen.regions && typeof screen.regions === 'object'
			? screen.regions
			: {};

	const mergedRegions = deepMerge( modeRegions, screenRegions );
	return { modal: false, regions: mergedRegions, modeId: requestedMode };
}

/**
 * Walk an extends chain for one mode entry — defensive duplicate of the
 * PHP path so callers passing an unflattened catalog still get a usable
 * result. Returns the flattened mode doc, or `null` when the mode is not
 * declared. Records `_extendsChainError` on the result for cycle / depth
 * violations.
 *
 * @param {string} modeId
 * @param {Object} catalog
 * @param {Set}    visited
 * @param {number} depth
 * @return {Object|null}
 */
function flattenMode( modeId, catalog, visited = null, depth = 0 ) {
	if ( ! modeId || ! catalog || typeof catalog[ modeId ] !== 'object' || catalog[ modeId ] === null ) {
		return null;
	}
	if ( depth >= MAX_EXTENDS_DEPTH ) {
		return {
			label: modeId,
			_extendsChainError: `Mode "${ modeId }" exceeded extends-chain depth limit (${ MAX_EXTENDS_DEPTH }).`,
			regions: {},
		};
	}
	const seen = visited || new Set();
	if ( seen.has( modeId ) ) {
		return {
			label: modeId,
			_extendsChainError: `Mode "${ modeId }" produced a circular extends chain.`,
			regions: {},
		};
	}
	const entry = catalog[ modeId ];
	const parentId =
		typeof entry.extends === 'string' && entry.extends !== ''
			? entry.extends
			: null;

	let resolved;
	if ( parentId ) {
		const nextSeen = new Set( seen );
		nextSeen.add( modeId );
		const parent = flattenMode( parentId, catalog, nextSeen, depth + 1 );
		if ( parent && parent._extendsChainError ) {
			// Propagate the diagnostic upward but still merge the local
			// fields so the partial result remains usable.
			resolved = deepMerge( parent, entry );
		} else if ( parent ) {
			resolved = deepMerge( parent, entry );
		} else {
			resolved = { ...entry, _extendsChainError: `Mode "${ parentId }" referenced via extends but not declared.` };
		}
	} else {
		resolved = { ...entry };
	}

	delete resolved.extends;
	if ( ! resolved.regions || typeof resolved.regions !== 'object' ) {
		resolved.regions = {};
	}
	if ( typeof resolved.label !== 'string' ) {
		resolved.label = modeId;
	}
	return resolved;
}

/**
 * Deep-merge two plain objects. `over` wins on overlapping leaves.
 * Associative subtrees merge recursively; non-object values (including
 * arrays — region-state values are scalars, so arrays are passed through
 * by reference replacement) are replaced wholesale. Matches the PHP
 * `deep_merge` semantics.
 *
 * @param {Object} base
 * @param {Object} over
 * @return {Object}
 */
function deepMerge( base, over ) {
	if ( ! base || typeof base !== 'object' ) {
		return over && typeof over === 'object' ? { ...over } : over;
	}
	if ( ! over || typeof over !== 'object' ) {
		return { ...base };
	}
	const result = { ...base };
	for ( const [ key, value ] of Object.entries( over ) ) {
		if (
			value &&
			typeof value === 'object' &&
			! Array.isArray( value ) &&
			result[ key ] &&
			typeof result[ key ] === 'object' &&
			! Array.isArray( result[ key ] )
		) {
			result[ key ] = deepMerge( result[ key ], value );
		} else {
			result[ key ] = value;
		}
	}
	return result;
}

/**
 * Look up the region-state for a single region inside a resolved mode.
 *
 * Returns `null` when the mode has no entry for the region (Region.js
 * treats this as "render normally"). Returns an empty object `{}` when the
 * region is listed but with no state keys set — same render-normally
 * behavior, but explicit so callers can distinguish "listed-but-empty"
 * from "absent."
 *
 * @param {string}      regionId
 * @param {Object|null} resolved  Result of `resolveMode()`.
 * @return {Object|null}
 */
export function readRegionState( regionId, resolved ) {
	if ( ! resolved || ! resolved.regions || typeof resolved.regions !== 'object' ) {
		return null;
	}
	const direct = resolved.regions[ regionId ];
	if ( direct && typeof direct === 'object' ) {
		return direct;
	}
	return null;
}

export const __test = { deepMerge, flattenMode, MAX_EXTENDS_DEPTH };
