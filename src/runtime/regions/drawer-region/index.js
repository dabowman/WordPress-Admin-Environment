import { useState, useCallback, useEffect } from '@wordpress/element';
import { MountedApp } from '../mountApp';

/**
 * core:drawer-region — slides in from a configurable side.
 *
 * `region.config.position`  — `'left' | 'right'` (default `'right'`).
 * `region.config.dismissOn` — `'escape' | 'overlay-click' | string[]` of triggers.
 *
 * The drawer is closed by default. Opening requires either an external
 * dispatch (a contained app's command) or a future trigger field. M1 ships
 * the closed-by-default container with the open/close primitive; v1 commands
 * + slot integration land later.
 */
function DrawerRegion( { region } ) {
	const cfg = region.config || {};
	const position = cfg.position === 'left' ? 'left' : 'right';
	const [ isOpen, setOpen ] = useState( false );

	const close = useCallback( () => setOpen( false ), [] );

	useEffect( () => {
		if ( ! isOpen ) {
			return;
		}
		const dismissOn = normalizeDismiss( cfg.dismissOn );
		if ( ! dismissOn.includes( 'escape' ) ) {
			return;
		}
		const onKey = ( e ) => {
			if ( e.key === 'Escape' ) {
				close();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ isOpen, cfg.dismissOn, close ] );

	if ( ! isOpen ) {
		return null;
	}

	const dismissOn = normalizeDismiss( cfg.dismissOn );
	const closeOnOverlay = dismissOn.includes( 'overlay-click' );

	return (
		<>
			<div
				className="wp-admin-shell-drawer__overlay"
				onClick={ closeOnOverlay ? close : undefined }
			/>
			<aside
				className={ `wp-admin-shell-drawer is-${ position }` }
				data-region-id={ region.id }
			>
				{ ( region.contains || [] ).map( ( appRef, idx ) => (
					<MountedApp
						key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
						appRef={ appRef }
						regionId={ region.id }
					/>
				) ) }
			</aside>
		</>
	);
}

function normalizeDismiss( value ) {
	if ( ! value ) {
		return [];
	}
	if ( Array.isArray( value ) ) {
		return value;
	}
	return String( value )
		.split( /\s*\|\s*/ )
		.filter( Boolean );
}

/** @type {import('../../registry/source-types.js').RegionSource} */
const drawerRegion = {
	kind: 'region',
	id: 'core:drawer-region',
	title: 'Drawer region',
	regionKind: 'drawer',
	Component: DrawerRegion,
};

export default drawerRegion;
