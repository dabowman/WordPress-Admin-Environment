/**
 * Platform service accessors for regions.
 *
 * Spec §5.3: a region's `platform` block requests browser-analog
 * services from the engine — modal/dismiss-on/autofocus-target/
 * triggerable/persists-across-navigation/dirty-state/
 * block-navigation-on-dirty/trigger. The engine consults these
 * requests when composing the region. This module gives the engine
 * and the generic Region renderer one place to read those services
 * from any region declaration.
 *
 * v2-shape declarations only — `region.platform` and `region.role`
 * are read directly. Engine templates pre-merge their own defaults
 * via `resolveRegion`.
 *
 * Pure ESM; no DOM, no React. Returns plain objects so the engine,
 * renderer, and tests share one source of truth.
 */

function platformBlock( region ) {
	const platform = region && region.platform;
	return platform && typeof platform === 'object' ? platform : null;
}

function isDialogRole( region ) {
	return region && ( region.role === 'dialog' || region.role === 'alertdialog' );
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
	return [];
}

export function autofocusSelector( region ) {
	const platform = platformBlock( region );
	if ( platform && typeof platform[ 'autofocus-target' ] === 'string' ) {
		return platform[ 'autofocus-target' ];
	}
	return null;
}

export function persistsAcrossNavigation( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'persists-across-navigation' ] === true );
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
 * `platform.modal: true` (or `role: dialog`) → overlay; otherwise
 * drawer if `role: complementary` and dismiss-on is declared (the
 * spec drawer pattern); else persistent.
 */
export function placement( region ) {
	if ( isModal( region ) ) {
		return 'overlay';
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
