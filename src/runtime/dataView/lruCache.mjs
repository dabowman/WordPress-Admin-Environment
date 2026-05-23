/**
 * Default LRU cap for the dataView module's persistent `cache` Map.
 * Sized for ~2× working set (entity-CRUD apps × variants × screens).
 * Tune after telemetry if eviction-rate becomes observable. Exported
 * so the LRU test (and any future consumer that wants to size to the
 * same default) imports the canonical value instead of redeclaring it.
 *
 * Only the `cache` map is bounded — `inflight` is intentionally
 * unbounded, see `useDataView.js` for the rationale.
 */
export const LRU_CAP = 64;

/**
 * Insertion-order LRU cap for the dataView module's persistent `cache`
 * Map. ES Map preserves insertion order, so the oldest entry is always
 * `map.keys().next().value`. On overflow we evict that single oldest
 * entry, then insert the new one.
 *
 * By design — re-reading an entry doesn't promote it. dataView triples
 * are read-heavy and short-lived: the working-set churn is on shell-
 * switching and route navigation, not within-session re-access of stale
 * entries. That makes plain insertion-order the right policy and skips
 * the cost of re-inserting on every read.
 *
 * @param {Map<string, *>} map
 * @param {string}         key
 * @param {*}              value
 * @param {number}         cap
 * @return {Map<string, *>} The same map (chainable).
 */
export function lruSet( map, key, value, cap ) {
	// Updating an existing key never grows the map — keep its current
	// insertion-order slot. Map.set on an existing key updates in place
	// without moving the entry, which is exactly the no-promotion
	// semantics we want.
	if ( ! map.has( key ) && map.size >= cap ) {
		const oldestKey = map.keys().next().value;
		if ( oldestKey !== undefined ) {
			map.delete( oldestKey );
		}
	}
	map.set( key, value );
	return map;
}
