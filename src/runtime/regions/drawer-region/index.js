import { useState, useCallback, useEffect, useMemo, useId } from '@wordpress/element';
import {
	useFocusOnMount,
	useFocusReturn,
	useConstrainedTabbing,
	useMergeRefs,
} from '@wordpress/compose';
import { __ } from '@wordpress/i18n';
import { MountedApp } from '../mountApp';

/**
 * core:drawer-region — slides in from a configurable side.
 *
 * `region.config.position`  — `'left' | 'right'` (default `'right'`).
 * `region.config.dismissOn` — `'escape' | 'overlay-click' | string[]`.
 * `region.config.label`     — accessible name; falls back to "Drawer".
 *
 * The drawer is closed by default. Opening requires either an external
 * dispatch (a contained app's command) or a future trigger field. M1 ships
 * the closed-by-default container with the open/close primitive; v1 commands
 * + slot integration land later.
 *
 * A11y (M5 readiness checklist b): role="dialog", aria-modal, aria-labelledby,
 * focus-on-mount to first tabbable, focus return on close, constrained
 * tabbing (focus trap).
 */
function DrawerRegion( { region } ) {
	const cfg = region.config || {};
	const position = cfg.position === 'left' ? 'left' : 'right';
	const [ isOpen, setOpen ] = useState( false );

	const close = useCallback( () => setOpen( false ), [] );

	// Memoize the dismiss list so the effect deps stay stable when the
	// region instance re-renders. Otherwise `cfg.dismissOn` (object/array
	// identity) re-binds the keydown listener each render.
	const dismissOn = useMemo(
		() => normalizeDismiss( cfg.dismissOn ),
		[ cfg.dismissOn ]
	);
	const closeOnEscape  = dismissOn.includes( 'escape' );
	const closeOnOverlay = dismissOn.includes( 'overlay-click' );

	useEffect( () => {
		if ( ! isOpen || ! closeOnEscape ) {
			return;
		}
		const onKey = ( e ) => {
			if ( e.key === 'Escape' ) {
				close();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ isOpen, closeOnEscape, close ] );

	const labelId = useId();

	// A11y refs:
	//   - useFocusOnMount: focus first tabbable when drawer opens
	//   - useFocusReturn:  return focus to opener on close
	//   - useConstrainedTabbing: trap Tab inside the drawer
	const focusOnMountRef     = useFocusOnMount();
	const focusReturnRef      = useFocusReturn();
	const constrainTabbingRef = useConstrainedTabbing();
	const dialogRef = useMergeRefs( [
		focusOnMountRef,
		focusReturnRef,
		constrainTabbingRef,
	] );

	if ( ! isOpen ) {
		return null;
	}

	const accessibleLabel = cfg.label || __( 'Drawer', 'wp-admin-shell' );

	return (
		<>
			<div
				className="wp-admin-shell-drawer__overlay"
				onClick={ closeOnOverlay ? close : undefined }
			/>
			<aside
				ref={ dialogRef }
				role="dialog"
				aria-modal="true"
				aria-labelledby={ labelId }
				className={ `wp-admin-shell-drawer is-${ position }` }
				data-region-id={ region.id }
			>
				<span id={ labelId } className="screen-reader-text">
					{ accessibleLabel }
				</span>
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
