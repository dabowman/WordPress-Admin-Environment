/**
 * Compose the runtime region tree from the active engine's `defaultRegions`
 * and the workspace's explicit `regions` block (the v3 escape hatch).
 *
 * Workspace declarations win per-field over engine defaults — the same
 * deep-merge contract the cascade `wp_admin_shell_data_*` filters expect.
 *
 * @param {Object} engineDefaults   Engine manifest `defaultRegions`.
 * @param {Object} workspaceRegions Workspace `regions` block (escape hatch).
 * @return {Object} The composed region tree.
 */
export function synthesizeRegions( engineDefaults, workspaceRegions ) {
	const defaults = engineDefaults || {};
	const workspace = workspaceRegions || {};
	if ( Object.keys( defaults ).length === 0 ) {
		return workspace;
	}
	if ( Object.keys( workspace ).length === 0 ) {
		return defaults;
	}
	return deepMerge( defaults, workspace );
}

/**
 * Recursive deep-merge — `over` wins per-field. Associative maps recurse;
 * lists and scalars replace wholesale. Mirrors the PHP resolver's
 * `deep_merge` contract.
 *
 * @param {*} base
 * @param {*} over
 * @return {*}
 */
export function deepMerge( base, over ) {
	if ( ! isPlainObject( base ) ) {
		return over;
	}
	if ( ! isPlainObject( over ) ) {
		return base;
	}
	const result = { ...base };
	for ( const [ key, value ] of Object.entries( over ) ) {
		if (
			isPlainObject( value ) &&
			isPlainObject( result[ key ] )
		) {
			result[ key ] = deepMerge( result[ key ], value );
		} else {
			result[ key ] = value;
		}
	}
	return result;
}

function isPlainObject( value ) {
	return (
		value !== null &&
		typeof value === 'object' &&
		! Array.isArray( value )
	);
}
