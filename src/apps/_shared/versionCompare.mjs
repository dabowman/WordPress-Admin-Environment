/**
 * Dotted-version comparison helpers, mirroring PHP's `version_compare` closely
 * enough for the read-side "requires" checks the list apps need (Plugins'
 * PHP/WordPress incompatibility warning). Pure + side-effect-free so node test
 * scripts can import it directly.
 *
 * Only the numeric dotted form is handled (e.g. `8.1`, `6.7.1`); pre-release
 * suffixes are stripped before comparison — `6.7-beta1` is treated as `6.7`.
 * That matches what core's `is_wp_version_compatible()` / a plugin header's
 * `Requires PHP` realistically carry, and avoids dragging in a full semver
 * parser the kernel-adjacent app layer doesn't otherwise need.
 */

/**
 * Normalize a version string to an array of integer segments. Non-numeric
 * leading chars + any pre-release suffix (`-beta`, `+build`, `RC1`) are dropped.
 *
 * @param {*} value Raw version (string / number / nullish).
 * @return {number[]} Integer segments, e.g. `'6.7.1' → [ 6, 7, 1 ]`.
 */
function segments( value ) {
	const match = String( value ?? '' ).match( /\d+(?:\.\d+)*/ );
	if ( ! match ) {
		return [];
	}
	return match[ 0 ].split( '.' ).map( ( part ) => parseInt( part, 10 ) );
}

/**
 * Compare two dotted-version strings.
 *
 * @param {*} a First version.
 * @param {*} b Second version.
 * @return {number} `-1` when a < b, `1` when a > b, `0` when equal.
 */
export function compareVersions( a, b ) {
	const left = segments( a );
	const right = segments( b );
	const len = Math.max( left.length, right.length );
	for ( let i = 0; i < len; i++ ) {
		const l = left[ i ] ?? 0;
		const r = right[ i ] ?? 0;
		if ( l !== r ) {
			return l < r ? -1 : 1;
		}
	}
	return 0;
}

/**
 * Whether the running `current` version satisfies the `required` minimum.
 *
 * An empty / absent `required` means "no minimum declared" → always compatible
 * (mirrors core, where a missing `Requires PHP` / `Requires at least` header is
 * not a constraint). An empty / absent `current` is treated as compatible too —
 * we never want a missing environment global to nag the user with a false
 * warning.
 *
 * @param {*} current  Running version (e.g. `window.wpAdminWorkspaces.phpVersion`).
 * @param {*} required Declared minimum (e.g. plugin `requires_php`).
 * @return {boolean} `true` when `current >= required` (or no constraint applies).
 */
export function meetsMinVersion( current, required ) {
	if ( ! required || ! segments( required ).length ) {
		return true;
	}
	if ( ! current || ! segments( current ).length ) {
		return true;
	}
	return compareVersions( current, required ) >= 0;
}
