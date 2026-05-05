/**
 * Platform service accessors for regions (V2.M2 task 6).
 *
 * Spec §5.3: a region's `platform` block requests browser-analog
 * services from the engine — modal/dismiss-on/autofocus-target/
 * triggerable/persists-across-navigation/dirty-state/
 * block-navigation-on-dirty/trigger. The engine consults these requests
 * when composing the region. This module gives the engine and the
 * generic Region renderer one place to read those services from any
 * region declaration, regardless of which shape it ships in.
 *
 * Two shapes need to be honored:
 *   - **v2 declarations** (post-task 7) carry `region.platform`
 *     directly (`{ modal: true, dismiss-on: ['Escape'] }`), plus
 *     `region.role` for ARIA. Engine templates pre-merge their own
 *     defaults via `resolveRegion`.
 *   - **v1 shells** (still on legacy `region.source` ids) carry no
 *     `platform`. This module bridges from the legacy source id +
 *     `region.config` so the engine and renderer get the same dispatch
 *     vocabulary across shapes. Bridge:
 *       - `core:overlay-region`  → { modal: true, dismiss-on: ['Escape', 'backdrop-click'] }
 *       - `core:drawer-region`   → { dismiss-on from config.dismissOn,
 *                                    autofocus-target: '[data-autofocus]' }
 *       - other legacy sources   → no overlay-style behaviors
 *
 * Pure ESM; no DOM, no React. Returns plain objects so the kernel,
 * engine, and tests share one source of truth.
 */

const LEGACY_BRIDGES = {
	'core:overlay-region': {
		modal: true,
		'dismiss-on': [ 'Escape', 'backdrop-click' ],
		role: 'dialog',
		placement: 'overlay',
	},
	'core:drawer-region': {
		role: 'complementary',
		placement: 'drawer',
		'autofocus-target': '[data-autofocus]',
	},
	'core:sidebar-region':  { placement: 'persistent' },
	'core:toolbar-region':  { placement: 'persistent' },
	'core:content-region':  { placement: 'persistent' },
	'core:preview-region':  { placement: 'persistent' },
};

function bridge( region ) {
	if ( ! region || typeof region !== 'object' ) {
		return null;
	}
	if ( typeof region.source !== 'string' ) {
		return null;
	}
	return LEGACY_BRIDGES[ region.source ] || null;
}

function platformBlock( region ) {
	const platform = region && region.platform;
	return platform && typeof platform === 'object' ? platform : null;
}

function isDialogRole( region ) {
	return region && ( region.role === 'dialog' || region.role === 'alertdialog' );
}

/**
 * Drawer's dismiss-on lived in `region.config.dismissOn` in v1; bring
 * it forward to the platform vocabulary.
 *
 * Accepts either an array of strings, or a single string, or a
 * pipe-delimited string (`escape | overlay-click`). Returns an array.
 */
function legacyDrawerDismiss( region ) {
	if ( region?.source !== 'core:drawer-region' ) {
		return null;
	}
	const value = region.config?.dismissOn;
	if ( ! value ) {
		return null;
	}
	if ( Array.isArray( value ) ) {
		return value;
	}
	return String( value )
		.split( /\s*\|\s*/ )
		.filter( Boolean );
}

/* ────────────────────── individual accessors ────────────────────── */

export function isModal( region ) {
	const platform = platformBlock( region );
	if ( platform && platform.modal === true ) {
		return true;
	}
	if ( platform && platform.modal === false ) {
		return false;
	}
	const b = bridge( region );
	if ( b && b.modal === true ) {
		return true;
	}
	return isDialogRole( region ) === true;
}

/**
 * @return {string[]} dismiss triggers; e.g. ['Escape', 'backdrop-click'].
 *                    Empty array if the region cannot be dismissed by a
 *                    declared trigger.
 */
export function dismissTriggers( region ) {
	const platform = platformBlock( region );
	if ( platform && Array.isArray( platform[ 'dismiss-on' ] ) ) {
		return platform[ 'dismiss-on' ].slice();
	}
	const drawer = legacyDrawerDismiss( region );
	if ( drawer ) {
		return drawer.map( ( t ) => normalizeDismissToken( t ) );
	}
	const b = bridge( region );
	if ( b && Array.isArray( b[ 'dismiss-on' ] ) ) {
		return b[ 'dismiss-on' ].slice();
	}
	return [];
}

/**
 * Legacy drawer values (`escape`, `overlay-click`) map to spec values
 * (`Escape`, `backdrop-click`).
 */
function normalizeDismissToken( token ) {
	switch ( token ) {
		case 'escape':
			return 'Escape';
		case 'overlay-click':
			return 'backdrop-click';
		default:
			return token;
	}
}

export function autofocusSelector( region ) {
	const platform = platformBlock( region );
	if ( platform && typeof platform[ 'autofocus-target' ] === 'string' ) {
		return platform[ 'autofocus-target' ];
	}
	const b = bridge( region );
	if ( b && typeof b[ 'autofocus-target' ] === 'string' ) {
		return b[ 'autofocus-target' ];
	}
	return null;
}

export function persistsAcrossNavigation( region ) {
	const platform = platformBlock( region );
	if ( platform && typeof platform[ 'persists-across-navigation' ] === 'boolean' ) {
		return platform[ 'persists-across-navigation' ];
	}
	// v1 chrome (sidebar/toolbar) implicitly persists.
	const source = region && region.source;
	return (
		source === 'core:sidebar-region' || source === 'core:toolbar-region'
	);
}

export function isTriggerable( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform.triggerable === true );
}

export function triggerShortcut( region ) {
	const platform = platformBlock( region );
	const trigger = platform && platform.trigger;
	if ( trigger && typeof trigger === 'object' && typeof trigger.shortcut === 'string' ) {
		return trigger.shortcut;
	}
	return null;
}

export function wantsDirtyState( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'dirty-state' ] === true );
}

export function blocksNavigationOnDirty( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'block-navigation-on-dirty' ] === true );
}

/**
 * Engine bucket placement:
 *   - 'overlay'    — modal-style (backdrop + focus trap + ARIA modal)
 *   - 'drawer'     — slides in from edge; dismiss-on attached
 *   - 'persistent' — fixed slot in the engine's default arrangement
 *
 * v2 declarations: `platform.modal: true` → overlay; otherwise drawer
 * if `role: complementary` and dismiss-on declared (the spec drawer
 * pattern); else persistent. v1 shells: bridged via legacy source id.
 */
export function placement( region ) {
	if ( isModal( region ) ) {
		return 'overlay';
	}
	const b = bridge( region );
	if ( b && b.placement ) {
		return b.placement;
	}
	if ( region?.role === 'complementary' && dismissTriggers( region ).length > 0 ) {
		return 'drawer';
	}
	return 'persistent';
}

/* ──────────────────────────── aggregate ──────────────────────────── */

export function getPlatformServices( region ) {
	return {
		isModal: isModal( region ),
		dismissTriggers: dismissTriggers( region ),
		autofocusSelector: autofocusSelector( region ),
		persistsAcrossNavigation: persistsAcrossNavigation( region ),
		isTriggerable: isTriggerable( region ),
		triggerShortcut: triggerShortcut( region ),
		wantsDirtyState: wantsDirtyState( region ),
		blocksNavigationOnDirty: blocksNavigationOnDirty( region ),
		placement: placement( region ),
	};
}
