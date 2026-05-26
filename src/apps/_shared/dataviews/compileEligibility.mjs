/**
 * Compile a declarative `eligibleWhen` predicate into a DataViews
 * `isEligible(item)` callback. Supports the `{ field: value | [values] }`
 * shape; absent / empty → no eligibility filter (always shown).
 *
 * Shared by every entity-CRUD app (posts / taxonomy / users / comments /
 * plugins / themes) — the implementation was byte-identical across all six
 * before extraction. Presence checks that JSON can't express (e.g. "this
 * field is non-empty") need code: pass a per-id override in
 * `buildActions`'s `eligibilityOverrides` instead of widening this shape.
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly.
 *
 * @param {Object} [eligibleWhen] Eligibility map.
 * @return {((item: Object) => boolean) | undefined} Predicate, or undefined.
 */
export function compileEligibility( eligibleWhen ) {
	if ( ! eligibleWhen || typeof eligibleWhen !== 'object' ) {
		return undefined;
	}
	const entries = Object.entries( eligibleWhen );
	if ( entries.length === 0 ) {
		return undefined;
	}
	return ( item ) =>
		entries.every( ( [ field, expected ] ) => {
			const actual = item?.[ field ];
			if ( Array.isArray( expected ) ) {
				return expected.includes( actual );
			}
			return actual === expected;
		} );
}
