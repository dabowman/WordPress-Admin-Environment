/**
 * Snap-to-edge geometry for the desktop window engine.
 *
 * Pure functions — no DOM, no React. The frame app calls these during
 * pointermove with the live pointer position + workspace bounds, draws
 * an overlay matching the returned target rect, and on pointerup
 * commits the snapped rect to the WindowManager. This module stays
 * framework-agnostic so the snap math is unit-testable in isolation.
 *
 * Scope (P2.T2):
 *   - top edge → full-screen
 *   - left edge → left half
 *   - right edge → right half
 *
 * Bottom edge + corner-quadrants (top-left/top-right/bottom-left/
 * bottom-right quarter snaps) defer to a follow-up — upstream desktop
 * mode supports them but the MVP three are the common case (Windows
 * Snap + macOS Stage Manager baseline).
 */

import type { WindowRect } from './WindowManager';

export type SnapZone = 'full' | 'left' | 'right' | null;

export interface Bounds {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Pixel proximity from a workspace edge that triggers a snap. */
export const SNAP_THRESHOLD = 12;

/**
 * Determine which (if any) snap zone the pointer is currently in.
 * Pointer coordinates are in the same coordinate space as
 * `workspaceBounds` (typically viewport pixels via `getBoundingClientRect()`).
 * @param pointerX
 * @param pointerY
 * @param workspaceBounds
 * @param threshold
 */
export function detectSnapZone(
	pointerX: number,
	pointerY: number,
	workspaceBounds: Bounds,
	threshold: number = SNAP_THRESHOLD
): SnapZone {
	// Outside workspace entirely → no snap.
	if (
		pointerX < workspaceBounds.x - threshold ||
		pointerX > workspaceBounds.x + workspaceBounds.w + threshold ||
		pointerY < workspaceBounds.y - threshold ||
		pointerY > workspaceBounds.y + workspaceBounds.h + threshold
	) {
		return null;
	}
	const fromTop = pointerY - workspaceBounds.y;
	const fromLeft = pointerX - workspaceBounds.x;
	const fromRight = workspaceBounds.x + workspaceBounds.w - pointerX;
	// Top wins over horizontal edges (a single threshold-radius corner
	// otherwise maps to two zones).
	if ( fromTop <= threshold ) {
		return 'full';
	}
	if ( fromLeft <= threshold ) {
		return 'left';
	}
	if ( fromRight <= threshold ) {
		return 'right';
	}
	return null;
}

/**
 * Resolve the target rect for a snap zone, expressed in the
 * workspace's local coordinate space (i.e. the same space the
 * WindowManager stores `WindowEntry.rect` in — origin at workspace
 * top-left).
 * @param zone
 * @param workspace
 */
export function snapRect(
	zone: SnapZone,
	workspace: Bounds
): WindowRect | null {
	if ( zone === null ) {
		return null;
	}
	if ( zone === 'full' ) {
		return { x: 0, y: 0, w: workspace.w, h: workspace.h };
	}
	if ( zone === 'left' ) {
		return {
			x: 0,
			y: 0,
			w: Math.floor( workspace.w / 2 ),
			h: workspace.h,
		};
	}
	// zone === 'right' — width = remainder so left + right exactly cover
	// odd widths (left gets floor(w/2), right gets the rest).
	const halfW = Math.floor( workspace.w / 2 );
	return {
		x: halfW,
		y: 0,
		w: workspace.w - halfW,
		h: workspace.h,
	};
}
