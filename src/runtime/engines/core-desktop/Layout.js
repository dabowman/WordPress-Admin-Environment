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
 *      windows here as runtime-mutated child regions. P2.T2 fills.
 *   dock (role: navigation) — desktop-dock-app reads admin.json nav and
 *      dispatches `openWindow` to the compositor. P2.T3 fills.
 *
 * Layout is intentionally simple: the engine paints chrome layers, the
 * kernel paints regions inside them. Multi-region role classification is
 * not needed — shells using this engine declare exactly three regions
 * (`wallpaper`, `workspace`, `dock`), and the layout positions them by
 * id. Other declared regions render in document order at z=3 for now;
 * MVP doesn't formalize a slot vocabulary beyond the three persistent
 * surfaces.
 */

import { Region } from '../../regions/Region';

const PERSISTENT_IDS = new Set( [ 'wallpaper', 'workspace', 'dock' ] );

export default function CoreDesktopLayout( { regions } ) {
	const wallpaper = regions.wallpaper || null;
	const workspace = regions.workspace || null;
	const dock = regions.dock || null;
	const overlays = Object.values( regions ).filter(
		( r ) => ! PERSISTENT_IDS.has( r.id )
	);

	return (
		<div
			className="wp-admin-shell-layout wp-admin-shell-layout--desktop"
			data-engine="core:desktop"
		>
			{ wallpaper && (
				<div className="wp-admin-shell-desktop__wallpaper-slot">
					<Region region={ wallpaper } />
				</div>
			) }
			{ workspace && (
				<div className="wp-admin-shell-desktop__workspace-slot">
					<Region region={ workspace } />
				</div>
			) }
			{ dock && (
				<div className="wp-admin-shell-desktop__dock-slot">
					<Region region={ dock } />
				</div>
			) }
			{ overlays.map( ( region ) => (
				<Region key={ region.id } region={ region } />
			) ) }
		</div>
	);
}
