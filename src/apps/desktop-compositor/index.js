/**
 * core:desktop-compositor — headless controller (P2.T2 MVP).
 *
 * Mounted in the `core:desktop-workspace` region by `core:desktop`.
 * Reads the live window stack from `WindowManagerProvider` (mounted at
 * the engine layout root) and mirrors it into the kernel's
 * dynamic-children store: each open window becomes a runtime-mutated
 * child region whose declaration nests two static grandchildren — a
 * `frame` region carrying the chrome app and a `body` region carrying
 * the user's target app.
 *
 * Visual DOM comes through `<Region>` recursion against those dynamic
 * children. The compositor itself renders `null` — it is purely a
 * controller that drives the dynamic-children store + owns the
 * WindowManager via context.
 *
 * Layout: position via `transform: translate(...)`, sizes inline,
 * z-index from the stack. Drag is wired in `desktop-window-frame` —
 * pointer-move mutates `style.transform` imperatively, pointer-up
 * commits the final rect via `WindowManager.setRect()`. Resize + snap
 * follow the same pattern.
 */

import { useEffect, useRef } from '@wordpress/element';

import { useDynamicChildren } from '../../runtime/kernel-context';
import {
	useWindowManager,
	useWindowStack,
} from '../../runtime/engines/core-desktop/windowing/WindowManagerContext';

function buildWindowDecl( win, parentId ) {
	const maximized = win.state === 'maximized';
	const minimized = win.state === 'minimized';
	const windowRegionId = `${ parentId }/${ win.id }`;
	return {
		role: 'region',
		style: {
			position: 'absolute',
			transform: maximized
				? 'translate(0, 0)'
				: `translate(${ win.rect.x }px, ${ win.rect.y }px)`,
			'inline-size': maximized ? '100%' : `${ win.rect.w }px`,
			'block-size': maximized ? '100%' : `${ win.rect.h }px`,
			'z-index': String( win.zIndex ),
			display: minimized ? 'none' : 'flex',
			'flex-direction': 'column',
		},
		regions: {
			frame: {
				role: 'presentation',
				style: { 'flex-shrink': '0' },
				app: 'core:desktop-window-frame',
				config: {
					windowId: win.id,
					windowRegionId,
					title: win.title,
				},
			},
			body: {
				role: 'region',
				style: {
					flex: '1 1 0',
					'min-block-size': '0',
					overflow: 'auto',
				},
				app: win.app,
				config: win.config,
			},
		},
	};
}

/**
 * Cheap structural diff used to decide whether `add()` needs to fire
 * for an existing window. The store mutates on every `add()` call, so
 * naive "always re-add" pushes the dynamic-children snapshot reference
 * forward and re-runs the effect — an infinite render loop. We sign
 * each window with the four fields that drive the decl (rect, z,
 * state, title), and only re-add when the signature changes.
 *
 * @param {Object} win A WindowEntry snapshot from WindowManager.
 * @return {string} Pipe-joined signature for the window.
 */
function signatureFor( win ) {
	return [
		win.app,
		win.title,
		win.state,
		win.zIndex,
		win.rect.x,
		win.rect.y,
		win.rect.w,
		win.rect.h,
	].join( '|' );
}

export default function DesktopCompositorApp( { regionId } ) {
	const parentId = regionId || 'workspace';
	const { add, remove } = useDynamicChildren( parentId );
	const stack = useWindowStack();
	// Touched so the manager instantiates on first compositor mount, even
	// before any dispatcher reaches it.
	useWindowManager();

	const lastSyncedRef = useRef( new Map() );

	useEffect( () => {
		const stackIds = new Set( stack.map( ( w ) => w.id ) );
		const synced = lastSyncedRef.current;

		// Add or update.
		for ( const win of stack ) {
			const sig = signatureFor( win );
			if ( synced.get( win.id ) === sig ) {
				continue;
			}
			add( win.id, buildWindowDecl( win, parentId ) );
			synced.set( win.id, sig );
		}

		// Remove windows that left the stack.
		for ( const key of Array.from( synced.keys() ) ) {
			if ( ! stackIds.has( key ) ) {
				remove( key );
				synced.delete( key );
			}
		}
	}, [ stack, add, remove, parentId ] );

	return null;
}
