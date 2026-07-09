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
 * `region.platform` and `region.role`
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

// NOTE: `core:trigger` (e.g. `{ shortcut: "Mod+K" }`) is a declarative
// hint only — per spec §5.3 the actual key binding lives in
// workspace.json's `bindings` block, consumed by `<BindingsConsumer>`
// through the triggerStore. There is intentionally no `triggerShortcut`
// accessor here: a kernel-side consumer would double-fire alongside
// `bindings` (the bundled workspaces wire Mod+K → palette that way). The
// region renderer registers only the `core:triggerable` open handler;
// the shortcut that flips it open comes from `bindings`. See issue #71.

export function wantsDirtyState( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:dirty-state' ] === true );
}

export function blocksNavigationOnDirty( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:block-navigation-on-dirty' ] === true );
}

/**
 * Spec §5.5 — `core:dynamic-children` service. When `true`, the region's
 * mounted app may add/remove child regions at runtime via
 * `useDynamicChildren(regionId)`. The kernel renders dynamic children
 * through the same `<Region>` recursion as static `region.regions[]`, so
 * they inherit every kernel service keyed by region ID. Engines without
 * the service declared see the request as a no-op (with a dev-mode
 * `unhonored-platform-service` warning in `kernel.js`).
 * @param {*} region
 */
export function hostsDynamicChildren( region ) {
	const platform = platformBlock( region );
	return !! ( platform && platform[ 'core:dynamic-children' ] === true );
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
		wantsDirtyState: wantsDirtyState( region ),
		blocksNavigationOnDirty: blocksNavigationOnDirty( region ),
		hostsDynamicChildren: hostsDynamicChildren( region ),
		placement: placement( region ),
	};
}
