/**
 * Pure decision for "should this region render at all?"
 *
 * Spec §8 layer 1: a region the user lacks capability for is dropped
 * before mounting, so its `app` + `regions[]` subtree never evaluates.
 * The decision is the same at every level of the region tree — the
 * kernel applies it once at top-level, then `<Region>` re-applies it
 * for each child via the same code path so nested children inherit
 * the deny without coordination.
 *
 * Pulling the decision into a pure-fn module lets the kernel + render
 * paths share one implementation and lets tests cover the branches
 * without standing up React.
 *
 * Caller passes a `capMap` snapshot — the same map the kernel ships to
 * JS via `window.wpAdminShell.capabilities`. The decision mirrors
 * `userCan(cap)`'s optimistic policy (`src/runtime/capabilities/userCan.js`):
 *
 *   - region with no `capability`           → render
 *   - cap declared, map missing the key     → render (optimistic; REST
 *                                              is the authority)
 *   - cap declared, map says `true`         → render
 *   - cap declared, map says falsy          → do NOT render
 *
 * @param {*}                          region
 * @param {Object<string,boolean>|null} capMap
 * @return {boolean}
 */
export function shouldRenderRegion( region, capMap ) {
	if ( ! region || typeof region !== 'object' ) {
		return false;
	}
	const cap = region.capability;
	if ( ! cap || typeof cap !== 'string' ) {
		return true;
	}
	if ( ! capMap || typeof capMap !== 'object' ) {
		return true;
	}
	if ( ! ( cap in capMap ) ) {
		return true;
	}
	return !! capMap[ cap ];
}
