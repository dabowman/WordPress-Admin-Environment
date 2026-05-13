/**
 * core:desktop-compositor — P2.T1 scaffolding.
 *
 * Mounted in the `core:desktop-workspace` region by `core:desktop`. Renders
 * `null` for now — visual smoke test that the engine + region resolve
 * without errors. P2.T2 fills this with:
 *   - WindowManager state class port from `desktop-mode/src/window-manager/*`
 *   - `useDynamicChildren('workspace')` subscription
 *   - per-window `add(winKey, { regions: { frame, body } })` calls
 *   - imperative drag/resize via DOM refs to `[data-region-id]`
 *   - `WindowManagerContext` for dock + frame chrome to dispatch
 *     `openWindow` / `close` / `minimize` / `maximize` / `focus`
 *
 * Wrapping the placeholder in a no-op subscriber to `useDynamicChildren`
 * keeps the hook on the React tree, so the kernel store gets one
 * subscriber the moment the engine mounts. T2 swaps the subscriber body
 * for the WindowManager wiring without re-plumbing the hook.
 */

import { useDynamicChildren } from '../../runtime/kernel-context';

export default function DesktopCompositorApp( { regionId } ) {
	const parentId = regionId || 'workspace';
	// Subscribe early so P2.T2 has the subscription seam in place.
	useDynamicChildren( parentId );
	return null;
}
