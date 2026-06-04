/**
 * core:desktop — windowed engine layout.
 *
 * Three persistent layers, painted bottom-up:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ wallpaper layer (z=0, decorative)           │
 *   │  ┌─────────────────────────────────────┐    │
 *   │  │ workspace (z=1, dynamic-children    │    │
 *   │  │   host; compositor owns)            │    │
 *   │  │                                     │    │
 *   │  └─────────────────────────────────────┘    │
 *   │  ┌─ dock ─ (z=2, persistent navigation)     │
 *   │  └───────                                   │
 *   └─────────────────────────────────────────────┘
 *
 *   wallpaper (role: presentation) — decorative gradient/canvas/widgets.
 *   workspace (role: main, core:dynamic-children) — compositor renders
 *      windows here as runtime-mutated child regions.
 *   dock (role: navigation) — desktop-dock-app reads admin.json nav and
 *      dispatches `openWindow` to the compositor.
 *
 * WindowManagerProvider wraps the entire engine tree so the dock app
 * (sibling of workspace) and the window-frame app (descendant of
 * dynamic-children inside workspace) both reach the same manager
 * instance via `useWindowManager()`.
 */

import { SlotFillProvider } from '@wordpress/components';

import { Region } from '../../regions/Region';
import { WindowManagerProvider } from './windowing/WindowManagerContext';

const PERSISTENT_IDS = new Set( [ 'wallpaper', 'workspace', 'dock' ] );

export default function CoreDesktopLayout( { regions } ) {
	const wallpaper = regions.wallpaper || null;
	const workspace = regions.workspace || null;
	const dock = regions.dock || null;
	const overlays = Object.values( regions ).filter(
		( r ) => ! PERSISTENT_IDS.has( r.id )
	);

	// `<SlotFillProvider>` lives in the engine layout (not the kernel)
	// to keep the kernel DS-neutral. Bundled apps mounted inside
	// windows still use `@wordpress/components` Slot/Fill (e.g.
	// `core:simple-editor`'s `core:editor.sidebar` slot), so the
	// substrate ships here too. `<SlotFillProvider>` lives outside
	// `<WindowManagerProvider>` so the substrate is also available
	// to any sibling chrome apps the engine may add in the future.
	return (
		<SlotFillProvider>
			<WindowManagerProvider>
				<div
					className="wp-admin-workspaces-layout wp-admin-workspaces-layout--desktop"
					data-engine="core:desktop"
				>
					{ wallpaper && (
						<div className="wp-admin-workspaces-desktop__wallpaper-slot">
							<Region region={ wallpaper } />
						</div>
					) }
					{ workspace && (
						<div className="wp-admin-workspaces-desktop__workspace-slot">
							<Region region={ workspace } />
						</div>
					) }
					{ dock && (
						<div className="wp-admin-workspaces-desktop__dock-slot">
							<Region region={ dock } />
						</div>
					) }
					{ overlays.map( ( region ) => (
						<Region key={ region.id } region={ region } />
					) ) }
				</div>
			</WindowManagerProvider>
		</SlotFillProvider>
	);
}
