/**
 * Derive a stable React `key` for a region's mounted-app wrapper from the
 * resolved app reference.
 *
 * The key forces React to unmount + remount when the resolved app identity
 * changes. Without it, navigating between two routes that share a source
 * (e.g. two `iframe:` refs → `core:iframe-fallback`) causes React to reuse the
 * existing component and mutate only the `src` prop. Per the HTML spec,
 * mutating `src` on an already-inserted iframe pushes a joint session-history
 * entry — pressing Back then travels inside the iframe while the workspace URL
 * stays on the later screen, desyncing chrome (mode, nav state) from content. A
 * freshly inserted iframe's first src load replaces rather than pushes, so a
 * remount on every route change eliminates the stale entry entirely.
 *
 * Identity = `source` + the serialized `config` (two routes onto the same app
 * with different config — e.g. distinct iframe URLs — are distinct mounts).
 * `config` is normalized to `null` when absent so `undefined` and a missing key
 * collapse to the same string.
 *
 * @param {{ source?: string, config?: * }} ref Resolved app reference.
 * @return {string} A deterministic key for the mount wrapper.
 */
export function mountKey( ref ) {
	const source = ref?.source ?? '';
	return source + ':' + JSON.stringify( ref?.config ?? null );
}
