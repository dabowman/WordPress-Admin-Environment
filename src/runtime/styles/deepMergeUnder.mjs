/**
 * Deep-merge plain-object trees with `over` winning on overlapping keys.
 * Used to fold engine `default-styles` UNDER workspace.json `styles` when
 * the kernel is mounted with raw config (tests, Storybook). The PHP
 * resolver normally does this server-side; the JS path is defensive.
 *
 * Arrays are replaced wholesale (no positional merge) — matches the
 * PHP merge's behavior for indexed arrays.
 *
 * @param {*} over
 * @param {*} under
 */
export function deepMergeUnder( over, under ) {
	if ( under === null || under === undefined ) {
		return over;
	}
	if ( over === null || over === undefined ) {
		return under;
	}
	if (
		typeof over !== 'object' ||
		typeof under !== 'object' ||
		Array.isArray( over ) ||
		Array.isArray( under )
	) {
		return over;
	}
	const out = { ...under };
	for ( const [ key, value ] of Object.entries( over ) ) {
		out[ key ] = deepMergeUnder( value, under[ key ] );
	}
	return out;
}
