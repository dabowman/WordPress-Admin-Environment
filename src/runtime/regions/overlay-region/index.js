import { MountedApp } from '../mountApp';

/**
 * core:overlay-region — modal-style popup.
 *
 * For v1, this region is a thin pass-through: contained apps are
 * responsible for their own visibility (e.g. `core:command-picker` is
 * driven by the `@wordpress/commands` store and renders nothing until
 * opened via `Mod+K`). The kernel keeps the region mounted at all times
 * so triggers fire reliably; the wrapper element is `display: contents`
 * so it does not affect layout when contained apps render nothing.
 */
function OverlayRegion( { region } ) {
	return (
		<div
			className="wp-admin-shell-overlay"
			data-region-id={ region.id }
			style={ { display: 'contents' } }
		>
			{ ( region.contains || [] ).map( ( appRef, idx ) => (
				<MountedApp
					key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
					appRef={ appRef }
					regionId={ region.id }
				/>
			) ) }
		</div>
	);
}

/** @type {import('../../registry/source-types.js').RegionSource} */
const overlayRegion = {
	kind: 'region',
	id: 'core:overlay-region',
	title: 'Overlay region',
	regionKind: 'overlay',
	Component: OverlayRegion,
};

export default overlayRegion;
