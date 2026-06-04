/**
 * core:desktop-window-frame — window chrome (P2.T2).
 *
 * Mounted in each window's `frame` sub-region by the compositor. Reads
 * the window's live state via `useWindowEntry(windowId)` and dispatches
 * close / minimize / maximize back through `useWindowManager()`.
 *
 * Visual surface: titlebar + three traffic-light controls + 8 resize
 * handles positioned absolutely on the window's edges and corners.
 * Frame region is `position: static` so the handles' `position:
 * absolute` resolves against the window region (which IS positioned).
 *
 * Drag + resize share the imperative-pointer pattern: pointerdown
 * captures starting state, pointermove mutates the window region's
 * inline `style.transform`/`inline-size`/`block-size` directly (no
 * React re-render), pointerup commits a single rect to the
 * WindowManager via `setRect`. The compositor's signature diff then
 * fires one regen of the dynamic-children decl with the new style.
 *
 * The window region's DOM node is found via the `windowRegionId` config
 * value the compositor passes down (`${parentId}/${windowId}` —
 * typically `workspace/win-N`). Selecting by `[data-region-id]` survives
 * portal-style mounts because Region.js always paints that attribute.
 */

import { useEffect, useRef } from '@wordpress/element';

import {
	useWindowManager,
	useWindowEntry,
} from '../../runtime/engines/core-desktop/windowing/WindowManagerContext';
import {
	detectSnapZone,
	snapRect,
} from '../../runtime/engines/core-desktop/windowing/snap';

/** Minimum window size in CSS pixels (fallback when manifest doesn't specify). */
const DEFAULT_MIN_W = 320;
const DEFAULT_MIN_H = 200;

const RESIZE_HANDLES = [
	{ dir: 'n', mutates: { y: 1, h: -1 } },
	{ dir: 's', mutates: { h: 1 } },
	{ dir: 'e', mutates: { w: 1 } },
	{ dir: 'w', mutates: { x: 1, w: -1 } },
	{ dir: 'ne', mutates: { y: 1, h: -1, w: 1 } },
	{ dir: 'nw', mutates: { y: 1, h: -1, x: 1, w: -1 } },
	{ dir: 'se', mutates: { h: 1, w: 1 } },
	{ dir: 'sw', mutates: { h: 1, x: 1, w: -1 } },
];

function applyResize( startRect, dx, dy, mutates, minW, minH ) {
	let { x, y, w, h } = startRect;
	if ( mutates.x ) {
		x = startRect.x + dx;
		w = startRect.w - dx;
	}
	if ( mutates.y ) {
		y = startRect.y + dy;
		h = startRect.h - dy;
	}
	if ( mutates.w && ! mutates.x ) {
		w = startRect.w + dx;
	}
	if ( mutates.h && ! mutates.y ) {
		h = startRect.h + dy;
	}
	// Clamp to min size, holding the opposite edge stable.
	if ( w < minW ) {
		if ( mutates.x ) {
			x = startRect.x + startRect.w - minW;
		}
		w = minW;
	}
	if ( h < minH ) {
		if ( mutates.y ) {
			y = startRect.y + startRect.h - minH;
		}
		h = minH;
	}
	return { x, y, w, h };
}

function findWindowEl( windowRegionId ) {
	if ( ! windowRegionId ) {
		return null;
	}
	return document.querySelector( `[data-region-id="${ windowRegionId }"]` );
}

/**
 * Create a translucent overlay inside the workspace that previews the
 * snap target rect during drag. Returns the element so the caller can
 * `.remove()` it on pointerup. Returns null if the workspace element
 * is missing or not positioned (the overlay relies on absolute
 * positioning resolving against the workspace).
 *
 * @param {Element|null} workspaceEl Workspace region DOM node.
 * @return {HTMLDivElement|null} The mounted ghost element.
 */
function createSnapGhost( workspaceEl ) {
	if ( ! workspaceEl ) {
		return null;
	}
	const el = document.createElement( 'div' );
	el.className = 'wp-admin-workspaces-desktop-snap-ghost';
	el.style.position = 'absolute';
	el.style.pointerEvents = 'none';
	el.style.display = 'none';
	workspaceEl.appendChild( el );
	return el;
}

function positionGhost( ghost, zone, workspace ) {
	if ( ! ghost ) {
		return;
	}
	if ( ! zone ) {
		ghost.style.display = 'none';
		return;
	}
	const rect = snapRect( zone, workspace );
	if ( ! rect ) {
		ghost.style.display = 'none';
		return;
	}
	ghost.style.display = 'block';
	ghost.style.transform = `translate(${ rect.x }px, ${ rect.y }px)`;
	ghost.style.inlineSize = `${ rect.w }px`;
	ghost.style.blockSize = `${ rect.h }px`;
}

export default function DesktopWindowFrameApp( { config } ) {
	const windowId =
		config && typeof config.windowId === 'string' ? config.windowId : null;
	const windowRegionId =
		config && typeof config.windowRegionId === 'string'
			? config.windowRegionId
			: null;
	const manager = useWindowManager();
	const win = useWindowEntry( windowId || '' );

	// Imperative drag state. Refs avoid re-rendering on pointer events;
	// the React tree only re-renders once on pointerup when we commit
	// the final rect to the manager. Without refs, every pointermove
	// would trigger React reconciliation against the entire window
	// subtree (frame + body + nested apps), making drag stutter.
	const dragRef = useRef( null );

	useEffect( () => {
		// Cleanup any lingering captures + listeners if the frame
		// unmounts mid-drag (window closed during drag, etc.).
		return () => {
			const state = dragRef.current;
			if ( state ) {
				const { handle, onMove, onUp, pointerId } = state;
				if ( handle ) {
					handle.removeEventListener( 'pointermove', onMove );
					handle.removeEventListener( 'pointerup', onUp );
					handle.removeEventListener( 'pointercancel', onUp );
					try {
						handle.releasePointerCapture( pointerId );
					} catch ( _err ) {
						/* already released */
					}
				}
				dragRef.current = null;
			}
		};
	}, [] );

	if ( ! windowId || ! win ) {
		return null;
	}

	const title = win.title;
	const focus = () => manager.focusWindow( windowId );
	const onClose = () => {
		focus();
		manager.closeWindow( windowId );
	};
	const onMinimize = () => {
		focus();
		manager.minimizeWindow( windowId );
	};
	const onMaximize = () => {
		focus();
		if ( win.state !== 'normal' ) {
			// Un-pinning via the maximize button (vs. dragging the
			// titlebar) centers the restored floating rect in the
			// workspace — the cursor isn't necessarily near where the
			// window should land, so the natural default is "put it
			// somewhere I can see it." Drag-to-unpin uses a different
			// path that places the rect under the cursor instead.
			const el = findWindowEl( windowRegionId );
			const workspaceEl = el ? el.parentElement : null;
			const ws = workspaceEl ? workspaceEl.getBoundingClientRect() : null;
			if ( ws ) {
				const r = win.restoreRect;
				const centered = {
					x: Math.round( Math.max( 0, ( ws.width - r.w ) / 2 ) ),
					y: Math.round( Math.max( 0, ( ws.height - r.h ) / 2 ) ),
					w: r.w,
					h: r.h,
				};
				manager.restoreFromPinned( windowId, centered );
				return;
			}
		}
		manager.maximizeWindow( windowId );
	};

	const minW =
		config && typeof config.minW === 'number' ? config.minW : DEFAULT_MIN_W;
	const minH =
		config && typeof config.minH === 'number' ? config.minH : DEFAULT_MIN_H;

	const startPointerOp = ( event, makeApply ) => {
		const el = findWindowEl( windowRegionId );
		if ( ! el ) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		focus();
		// Suppress the engine's transition while the pointer drives
		// transform / size directly. Cleared on pointerup so the
		// post-commit React re-render animates.
		el.dataset.dragging = 'true';
		const startX = event.clientX;
		const startY = event.clientY;
		const startRect = { ...win.rect };
		const apply = makeApply( startRect );

		// setPointerCapture on the originating handle reroutes every
		// pointermove/pointerup to it regardless of which document the
		// cursor enters. Without it, a cursor that hits the iframe
		// content during drag/resize moves into the iframe's document;
		// pointer events fire inside the iframe and never reach the
		// parent's window listener — the drag/resize gets "stuck" and
		// keeps running after the pointer is released because the
		// release happened in a document we weren't listening on.
		const handle = event.currentTarget;
		const pointerId = event.pointerId;
		try {
			handle.setPointerCapture( pointerId );
		} catch ( _err ) {
			/* setPointerCapture can fail if the element is detached
			 * before this runs (rare). Fall back to window listeners
			 * so drag still mostly works. */
		}

		const onMove = ( e ) => {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const next = apply( dx, dy );
			el.style.transform = `translate(${ next.x }px, ${ next.y }px)`;
			el.style.inlineSize = `${ next.w }px`;
			el.style.blockSize = `${ next.h }px`;
		};
		const onUp = ( e ) => {
			handle.removeEventListener( 'pointermove', onMove );
			handle.removeEventListener( 'pointerup', onUp );
			handle.removeEventListener( 'pointercancel', onUp );
			try {
				handle.releasePointerCapture( pointerId );
			} catch ( _err ) {
				/* already released or detached */
			}
			delete el.dataset.dragging;
			dragRef.current = null;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			manager.setRect( windowId, apply( dx, dy ) );
		};
		dragRef.current = { onMove, onUp, handle, pointerId };
		handle.addEventListener( 'pointermove', onMove );
		handle.addEventListener( 'pointerup', onUp );
		handle.addEventListener( 'pointercancel', onUp );
	};

	const onResizePointerDown = ( mutates ) => ( event ) => {
		// Block resize on any pinned state — user expects to drag-to-
		// unpin first, then resize. Without the block the snapped
		// window would resize but stay flagged as snapped, and the
		// restoreRect would no longer be useful.
		if ( win.state !== 'normal' ) {
			return;
		}
		startPointerOp(
			event,
			( startRect ) => ( dx, dy ) =>
				applyResize( startRect, dx, dy, mutates, minW, minH )
		);
	};

	const onTitlebarPointerDown = ( event ) => {
		// Skip if the pointer landed on a control button — clicking
		// close/min/max should never start a drag.
		if (
			event.target instanceof Element &&
			event.target.closest( 'button' )
		) {
			return;
		}
		const el = findWindowEl( windowRegionId );
		if ( ! el ) {
			return;
		}
		const workspaceEl = el.parentElement;
		const workspaceBounds = workspaceEl
			? workspaceEl.getBoundingClientRect()
			: null;
		event.preventDefault();
		event.stopPropagation();
		focus();

		const handle = event.currentTarget;
		const pointerId = event.pointerId;
		try {
			handle.setPointerCapture( pointerId );
		} catch ( _err ) {
			/* fall through */
		}

		const startX = event.clientX;
		const startY = event.clientY;
		const wasPinned = win.state !== 'normal';
		// Pixel threshold before pointerdown turns into a drag. Without
		// the threshold, a simple click on the titlebar of a pinned
		// window would un-pin it under the cursor (jarring) — with it,
		// the click → up-no-move path centers via the maximize-button
		// handler instead.
		const DRAG_THRESHOLD = 4;
		let dragStarted = false;
		let startRect = wasPinned ? null : { ...win.rect };
		let activeZone = null;
		let ghost = null;

		const beginDrag = ( e ) => {
			dragStarted = true;
			el.dataset.dragging = 'true';
			if ( wasPinned ) {
				const restored = win.restoreRect;
				const newRect = {
					x: Math.round( e.clientX - restored.w / 2 ),
					y: Math.round( e.clientY - 16 ),
					w: restored.w,
					h: restored.h,
				};
				manager.restoreFromPinned( windowId, newRect );
				el.style.transform = `translate(${ newRect.x }px, ${ newRect.y }px)`;
				el.style.inlineSize = `${ newRect.w }px`;
				el.style.blockSize = `${ newRect.h }px`;
				startRect = newRect;
			}
			ghost = createSnapGhost( workspaceEl );
		};

		const onMove = ( e ) => {
			if ( ! dragStarted ) {
				const dx0 = e.clientX - startX;
				const dy0 = e.clientY - startY;
				if (
					Math.abs( dx0 ) < DRAG_THRESHOLD &&
					Math.abs( dy0 ) < DRAG_THRESHOLD
				) {
					return;
				}
				beginDrag( e );
			}
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			el.style.transform = `translate(${ startRect.x + dx }px, ${
				startRect.y + dy
			}px)`;
			if ( ! workspaceBounds || ! ghost ) {
				return;
			}
			const zone = detectSnapZone( e.clientX, e.clientY, {
				x: workspaceBounds.x,
				y: workspaceBounds.y,
				w: workspaceBounds.width,
				h: workspaceBounds.height,
			} );
			if ( zone !== activeZone ) {
				activeZone = zone;
				positionGhost( ghost, zone, {
					x: 0,
					y: 0,
					w: workspaceBounds.width,
					h: workspaceBounds.height,
				} );
			}
		};
		const onUp = ( e ) => {
			handle.removeEventListener( 'pointermove', onMove );
			handle.removeEventListener( 'pointerup', onUp );
			handle.removeEventListener( 'pointercancel', onUp );
			try {
				handle.releasePointerCapture( pointerId );
			} catch ( _err ) {
				/* already released */
			}
			delete el.dataset.dragging;
			dragRef.current = null;
			if ( ghost ) {
				ghost.remove();
				ghost = null;
			}
			if ( ! dragStarted ) {
				// Click without drag. On pinned windows this centers
				// the restored rect (same as the maximize button). On
				// normal-state windows it's a no-op — focus already
				// happened on pointerdown.
				if ( wasPinned && workspaceBounds ) {
					const r = win.restoreRect;
					const centered = {
						x: Math.round(
							Math.max( 0, ( workspaceBounds.width - r.w ) / 2 )
						),
						y: Math.round(
							Math.max( 0, ( workspaceBounds.height - r.h ) / 2 )
						),
						w: r.w,
						h: r.h,
					};
					manager.restoreFromPinned( windowId, centered );
				}
				return;
			}
			if ( activeZone && workspaceBounds ) {
				const snapped = snapRect( activeZone, {
					x: 0,
					y: 0,
					w: workspaceBounds.width,
					h: workspaceBounds.height,
				} );
				if ( snapped ) {
					manager.snapWindow( windowId, activeZone, snapped );
					return;
				}
			}
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			manager.setRect( windowId, {
				x: startRect.x + dx,
				y: startRect.y + dy,
			} );
		};
		dragRef.current = { onMove, onUp, handle, pointerId };
		handle.addEventListener( 'pointermove', onMove );
		handle.addEventListener( 'pointerup', onUp );
		handle.addEventListener( 'pointercancel', onUp );
	};

	const resizable = win.state !== 'maximized';

	return (
		<div className="wp-admin-workspaces-desktop-window-frame">
			{ resizable &&
				RESIZE_HANDLES.map( ( { dir, mutates } ) => (
					// eslint-disable-next-line jsx-a11y/no-static-element-interactions -- resize handle; not a navigation/control target.
					<div
						key={ dir }
						className={ `wp-admin-workspaces-desktop-window-frame__resize wp-admin-workspaces-desktop-window-frame__resize--${ dir }` }
						data-resize={ dir }
						onPointerDown={ onResizePointerDown( mutates ) }
					/>
				) ) }
			{ /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- titlebar is a drag handle; controls inside are buttons. */ }
			<div
				className="wp-admin-workspaces-desktop-window-frame__titlebar"
				onPointerDown={ onTitlebarPointerDown }
				onDoubleClick={ onMaximize }
			>
				<div
					className="wp-admin-workspaces-desktop-window-frame__controls"
					role="group"
					aria-label="Window controls"
				>
					<button
						type="button"
						className="wp-admin-workspaces-desktop-window-frame__control wp-admin-workspaces-desktop-window-frame__control--close"
						aria-label="Close window"
						onClick={ onClose }
					/>
					<button
						type="button"
						className="wp-admin-workspaces-desktop-window-frame__control wp-admin-workspaces-desktop-window-frame__control--minimize"
						aria-label="Minimize window"
						onClick={ onMinimize }
					/>
					<button
						type="button"
						className="wp-admin-workspaces-desktop-window-frame__control wp-admin-workspaces-desktop-window-frame__control--maximize"
						aria-label={
							win.state === 'maximized'
								? 'Restore window'
								: 'Maximize window'
						}
						onClick={ onMaximize }
					/>
				</div>
				<span className="wp-admin-workspaces-desktop-window-frame__title">
					{ title }
				</span>
			</div>
		</div>
	);
}
