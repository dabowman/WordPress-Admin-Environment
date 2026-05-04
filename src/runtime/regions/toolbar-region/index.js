import { MountedApp } from '../mountApp';

/**
 * core:toolbar-region — horizontal strip, persistent, top of layout.
 */
function ToolbarRegion( { region } ) {
	return (
		<div
			className="wp-admin-shell-toolbar"
			data-region-id={ region.id }
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
const toolbarRegion = {
	kind: 'region',
	id: 'core:toolbar-region',
	title: 'Toolbar region',
	regionKind: 'persistent',
	Component: ToolbarRegion,
};

export default toolbarRegion;
