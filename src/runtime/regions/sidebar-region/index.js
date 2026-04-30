import { __ } from '@wordpress/i18n';
import { MountedApp } from '../mountApp';

/**
 * core:sidebar-region — vertical, full-height, persistent.
 *
 * Mounts every app id listed in `region.contains` in order. Width and
 * collapsed state come from `region.config`. `region.config.label`
 * supplies the accessible name on the `<nav>`; defaults to "Navigation".
 * The engine places the region into its sidebar slot.
 */
function SidebarRegion( { region } ) {
	const cfg = region.config || {};
	const isCollapsed = !! cfg.collapsed;
	const width = cfg.width || 300;

	const styleVars = {
		'--wp-admin-shell-nav-width': `${ width }px`,
	};

	return (
		<nav
			aria-label={ cfg.label || __( 'Navigation', 'wp-admin-shell' ) }
			className={ `wp-admin-shell-nav${ isCollapsed ? ' is-collapsed' : '' }` }
			data-region-id={ region.id }
			style={ styleVars }
		>
			{ ( region.contains || [] ).map( ( appRef, idx ) => (
				<MountedApp
					key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
					appRef={ appRef }
					regionId={ region.id }
				/>
			) ) }
		</nav>
	);
}

/** @type {import('../../registry/source-types.js').RegionSource} */
const sidebarRegion = {
	kind: 'region',
	id: 'core:sidebar-region',
	title: 'Sidebar region',
	regionKind: 'persistent',
	Component: SidebarRegion,
};

export default sidebarRegion;
