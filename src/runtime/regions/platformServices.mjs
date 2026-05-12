/**
 * Platform service accessors for regions.
 *
 * Spec §5.3: a region's `platform` block requests browser-analog
 * services from the engine — `core:modal`, `core:dismiss-on`,
 * `core:autofocus-target`, `core:triggerable`,
 * `core:persists-across-navigation`, `core:dirty-state`,
 * `core:block-navigation-on-dirty`, `core:trigger`. The engine
 * consults these requests when composing the region. This module
 * gives the engine
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
	if ( platform && platform[ 'core:modal' ] === true ) {
		return true;
	}
	if ( platform && platform[ 'core:modal' ] === false ) {
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
	if ( platform && Array.isArray( platform[ 'core:dismiss-on' ] ) ) {
		return platform[ 'core:dismiss-on' ].slice();
	}
	return [];
}

export function autofocusSelector( region ) {
	const platform = platformBlock( region );
	if ( platform && typeof platform[ 'core:autofocus-target' ] === 'string' ) {
		return platform[ 'core:autofocus-target' ];
	}
	return null;
}

export function persistsAcrossNavigation( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:persists-across-navigation' ] === true );
}

export function isTriggerable( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:triggerable' ] === true );
}

export function triggerShortcut( region ) {
	const platform = platformBlock( region );
	const trigger = platform && platform[ 'core:trigger' ];
	if ( trigger && typeof trigger === 'object' && typeof trigger.shortcut === 'string' ) {
		return trigger.shortcut;
	}
	return null;
}

export function wantsDirtyState( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:dirty-state' ] === true );
}

export function blocksNavigationOnDirty( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:block-navigation-on-dirty' ] === true );
}

/**
 * Engine bucket placement:
 *   - 'overlay'    — modal-style (backdrop + focus trap + ARIA modal)
 *   - 'drawer'     — slides in from edge; dismiss-on attached
 *   - 'persistent' — fixed slot in the engine's default arrangement
 *
 * `platform[ 'core:modal' ]: true` (or `role: dialog`) → overlay; otherwise
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
