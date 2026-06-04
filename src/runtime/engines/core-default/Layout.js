/**
 * core:default — flagship engine.
 *
 * Arranges regions into the dark-chrome / elevated-card visual pattern the
 * MVP shipped (see `src/workspace/ShellLayout.js`):
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ toolbar (persistent, top)                   │
 *   ├──────────┬──────────────────────────────────┤
 *   │ sidebar  │ content (routable region — body) │
 *   │ (persi-  │                                  │
 *   │ stent,   ├──────────────────────────────────┤
 *   │ left)    │ preview (persistent, right when  │
 *   │          │ provided)                        │
 *   └──────────┴──────────────────────────────────┘
 *
 *   overlay regions  → floating layer over body
 *   dashboard-grid   → mounts inside the content (areas) row
 *
 * Slot assignment dispatches on region ROLE (id as tiebreaker), honoring the
 * engine's `specializes-roles`, so a workspace that names its main region
 * something other than `content` still lands in the content slot. The pure
 * dispatch logic lives in `slotRegions.mjs` (node-testable); this component
 * just renders the slotted refs through the generic `<Region>` renderer.
 */

import { SlotFillProvider } from '@wordpress/components';

import { Region } from '../../regions/Region';
import { useMode } from '../../modes/useMode';
import { slotRegions } from './slotRegions.mjs';

export default function CoreSiteEditorLayout( { regions } ) {
	const {
		toolbar,
		sidebar,
		content,
		detail,
		preview,
		bodyExtras,
		overlay,
		stragglers,
	} = slotRegions( regions );

	// Surface the active screen's mode on the layout root so engine CSS can
	// style the whole layout per-mode (not just per-region). E.g. takeover
	// drops the body gutter + content card radius for a full-bleed surface.
	const { modeId } = useMode();

	// `<SlotFillProvider>` lives in the engine layout (not the kernel)
	// to keep the kernel DS-neutral. Bundled apps using
	// `@wordpress/components` Slot/Fill (e.g. `core:simple-editor`'s
	// `core:editor.sidebar` slot) need this substrate, so every WPDS-
	// based engine ships it. A non-WPDS engine that doesn't use
	// `@wordpress/components` Slot/Fill can drop the wrap.
	return (
		<SlotFillProvider>
			<div
				className="wp-admin-workspaces-layout"
				data-engine="core:default"
				data-mode={ modeId }
			>
				{ toolbar && <Region key={ toolbar.id } region={ toolbar } /> }

				<div className="wp-admin-workspaces-layout__body">
					{ sidebar && (
						<Region key={ sidebar.id } region={ sidebar } />
					) }

					<div
						className={ `wp-admin-workspaces-areas${
							preview ? ' has-preview' : ''
						}` }
					>
						{ content && (
							<Region key={ content.id } region={ content } />
						) }
						{ bodyExtras.map( ( region ) => (
							<Region key={ region.id } region={ region } />
						) ) }
						{ detail && (
							<Region key={ detail.id } region={ detail } />
						) }
						{ preview && (
							<Region key={ preview.id } region={ preview } />
						) }
					</div>
				</div>

				{ stragglers.map( ( region ) => (
					<Region key={ region.id } region={ region } />
				) ) }

				{ overlay.map( ( region ) => (
					<Region key={ region.id } region={ region } />
				) ) }
			</div>
		</SlotFillProvider>
	);
}
