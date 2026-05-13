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
		// Cleanup any lingering global listeners if the frame unmounts
		// mid-drag (window closed during drag, etc.).
		return () => {
			const state = dragRef.current;
			if ( state ) {
				window.removeEventListener( 'pointermove', state.onMove );
				window.removeEventListener( 'pointerup', state.onUp );
				window.removeEventListener( 'pointercancel', state.onUp );
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
		const startX = event.clientX;
		const startY = event.clientY;
		const startRect = { ...win.rect };
		const apply = makeApply( startRect );

		const onMove = ( e ) => {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			const next = apply( dx, dy );
			el.style.transform = `translate(${ next.x }px, ${ next.y }px)`;
			el.style.inlineSize = `${ next.w }px`;
			el.style.blockSize = `${ next.h }px`;
		};
		const onUp = ( e ) => {
			window.removeEventListener( 'pointermove', onMove );
			window.removeEventListener( 'pointerup', onUp );
			window.removeEventListener( 'pointercancel', onUp );
			dragRef.current = null;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			manager.setRect( windowId, apply( dx, dy ) );
		};
		dragRef.current = { onMove, onUp };
		window.addEventListener( 'pointermove', onMove );
		window.addEventListener( 'pointerup', onUp );
		window.addEventListener( 'pointercancel', onUp );
	};

	const onResizePointerDown = ( mutates ) => ( event ) => {
		if ( win.state === 'maximized' ) {
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
		// Don't drag maximized windows — matches native OS behavior.
		if ( win.state === 'maximized' ) {
			return;
		}
		startPointerOp( event, ( startRect ) => ( dx, dy ) => ( {
			x: startRect.x + dx,
			y: startRect.y + dy,
			w: startRect.w,
			h: startRect.h,
		} ) );
	};

	const resizable = win.state !== 'maximized';

	return (
		<div className="wp-admin-shell-desktop-window-frame">
			{ resizable &&
				RESIZE_HANDLES.map( ( { dir, mutates } ) => (
					// eslint-disable-next-line jsx-a11y/no-static-element-interactions -- resize handle; not a navigation/control target.
					<div
						key={ dir }
						className={ `wp-admin-shell-desktop-window-frame__resize wp-admin-shell-desktop-window-frame__resize--${ dir }` }
						data-resize={ dir }
						onPointerDown={ onResizePointerDown( mutates ) }
					/>
				) ) }
			{ /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- titlebar is a drag handle; controls inside are buttons. */ }
			<div
				className="wp-admin-shell-desktop-window-frame__titlebar"
				onPointerDown={ onTitlebarPointerDown }
				onDoubleClick={ onMaximize }
			>
				<div
					className="wp-admin-shell-desktop-window-frame__controls"
					role="group"
					aria-label="Window controls"
				>
					<button
						type="button"
						className="wp-admin-shell-desktop-window-frame__control wp-admin-shell-desktop-window-frame__control--close"
						aria-label="Close window"
						onClick={ onClose }
					/>
					<button
						type="button"
						className="wp-admin-shell-desktop-window-frame__control wp-admin-shell-desktop-window-frame__control--minimize"
						aria-label="Minimize window"
						onClick={ onMinimize }
					/>
					<button
						type="button"
						className="wp-admin-shell-desktop-window-frame__control wp-admin-shell-desktop-window-frame__control--maximize"
						aria-label={
							win.state === 'maximized'
								? 'Restore window'
								: 'Maximize window'
						}
						onClick={ onMaximize }
					/>
				</div>
				<span className="wp-admin-shell-desktop-window-frame__title">
					{ title }
				</span>
			</div>
		</div>
	);
}
