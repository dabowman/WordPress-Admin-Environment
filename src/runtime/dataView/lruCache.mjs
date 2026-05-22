/**
 * Insertion-order LRU cap for the dataView module's `cache` + `inflight`
 * Maps. ES Map preserves insertion order, so the oldest entry is always
 * `map.keys().next().value`. On overflow we evict that single oldest
 * entry, then insert the new one.
 *
 * NOT access-order — we don't re-insert on read. That trade-off matches
 * the actual usage pattern: dataView triples are read once and stay
 * hot, the working-set churn is shell-switching and route navigation,
 * not within-session re-access of stale entries.
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
