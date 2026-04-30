import { MountedApp } from '../mountApp';
import { useSelection } from '../../selection/useSelection';

/**
 * core:preview-region — side panel that responds to a selection scope.
 *
 * `region.config.respondsTo` names a selection scope (e.g. `content.selection`).
 * The region subscribes to the bus; selection state is available to contained
 * apps via `useSelection()` directly. The region itself only renders contains.
 */
function PreviewRegion( { region } ) {
	const cfg = region.config || {};
	const respondsTo = cfg.respondsTo;
	// Subscribe so the region re-renders when the watched scope changes.
	useSelection( respondsTo ? scopeFromRespondsTo( respondsTo ) : null );

	return (
		<div
			className="wp-admin-shell-preview"
			data-region-id={ region.id }
		>
			{ ( region.contains || [] ).map( ( appRef, idx ) => (
				<div
					key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
					className="wp-admin-shell-content__app"
				>
					<MountedApp
						appRef={ appRef }
						regionId={ region.id }
					/>
				</div>
			) ) }
		</div>
	);
}

function scopeFromRespondsTo( respondsTo ) {
	// `content.selection` → scope name `content` (the bus stores per-scope).
	const idx = respondsTo.lastIndexOf( '.selection' );
	return idx > 0 ? respondsTo.slice( 0, idx ) : respondsTo;
}

/** @type {import('../../registry/source-types.js').RegionSource} */
const previewRegion = {
	kind: 'region',
	id: 'core:preview-region',
	title: 'Preview region',
	regionKind: 'persistent',
	Component: PreviewRegion,
};

export default previewRegion;
