/**
 * core:desktop-window-frame — window chrome (P2.T2).
 *
 * Mounted in each window's `frame` sub-region by the compositor. Reads
 * the window's live state via `useWindowEntry(windowId)` and dispatches
 * close / minimize / maximize back through `useWindowManager()`.
 *
 * Visual surface: titlebar + three traffic-light controls.
 *
 * Drag: pointerdown on the titlebar (skipping clicks on control buttons)
 * captures the pointer and mutates the window region's
 * `style.transform` imperatively during pointermove — the React tree is
 * NOT re-rendered per pointer event. On pointerup, the final rect is
 * committed to the WindowManager via `setRect`, which triggers exactly
 * one React render with the new style baked into the dynamic-children
 * decl. This keeps drag at native pointer-event cadence even with many
 * subscribers attached to the window stack.
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
		const el = findWindowEl( windowRegionId );
		if ( ! el ) {
			return;
		}
		event.preventDefault();
		focus();

		const startX = event.clientX;
		const startY = event.clientY;
		const startRect = { ...win.rect };

		const onMove = ( e ) => {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			el.style.transform = `translate(${ startRect.x + dx }px, ${
				startRect.y + dy
			}px)`;
		};
		const onUp = ( e ) => {
			window.removeEventListener( 'pointermove', onMove );
			window.removeEventListener( 'pointerup', onUp );
			window.removeEventListener( 'pointercancel', onUp );
			dragRef.current = null;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			manager.setRect( windowId, {
				x: startRect.x + dx,
				y: startRect.y + dy,
			} );
		};
		dragRef.current = { onMove, onUp };
		window.addEventListener( 'pointermove', onMove );
		window.addEventListener( 'pointerup', onUp );
		window.addEventListener( 'pointercancel', onUp );
	};

	return (
		<div className="wp-admin-shell-desktop-window-frame">
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
