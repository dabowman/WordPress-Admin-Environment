/**
 * WpdsThemeProvider — platform-default ThemeProvider backed by
 * `@wordpress/theme.ThemeProvider`.
 *
 * Used by `core:default` and `core:single-pane` engines, and by
 * ThemeProviderHost as the fallback when an engine declines to ship its
 * own provider.
 *
 * Unlocks the real `@wordpress/theme` private API by piggybacking on
 * `@wordpress/edit-site`'s allowlist entry — the package's
 * `__dangerousOptInToUnstableAPIsOnlyForCoreModules` does string-match-
 * only verification. Stable until WP core adds caller verification
 * (unlikely without breaking many existing intra-package uses).
 *
 * Renders only the seed-driven WPDS surface (color ramps, density,
 * cursor, compat aliases). Tier-3 slot overrides + chrome → WPDS bridge
 * + region/app scoped overrides are emitted by ThemeProviderHost as a
 * sibling `<style>` block — this provider is intentionally simple and
 * mirrors the public `ThemeProvider` prop contract.
 */

import { createElement, useId } from '@wordpress/element';
import { Popover } from '@wordpress/components';

const PRIVATE_API_CONSENT =
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.';

const ALLOWLIST_PROXY_MODULE = '@wordpress/edit-site';

// WPDS-specific density vocabulary. Unknown values fall back to
// 'default' silently — keeps the WPDS provider's contract clean even
// when an upstream cascade produces a non-WPDS density value (e.g.
// shell-switching from a Material engine that authored 'dense').
const WPDS_DENSITIES = [ 'default', 'compact', 'comfortable' ];

const RealThemeProvider = ( () => {
	if ( typeof window === 'undefined' || ! window.wp ) {
		return null;
	}
	try {
		const wpPrivateApis = window.wp.privateApis;
		const wpTheme = window.wp.theme;
		if ( ! wpPrivateApis || ! wpTheme || ! wpTheme.privateApis ) {
			return null;
		}

		const optIn =
			wpPrivateApis.__dangerousOptInToUnstableAPIsOnlyForCoreModules;
		if ( typeof optIn !== 'function' ) {
			return null;
		}
		const { unlock } = optIn( PRIVATE_API_CONSENT, ALLOWLIST_PROXY_MODULE );
		const unlocked = unlock( wpTheme.privateApis );
		return unlocked?.ThemeProvider || null;
	} catch ( e ) {
		// eslint-disable-next-line no-console
		console.warn(
			'wp-admin-shell: @wordpress/theme.ThemeProvider unavailable. ' +
				'Shell will render empty. Ensure the Gutenberg plugin is active. ' +
				( e?.message || e )
		);
		return null;
	}
} )();

export const wpdsThemeProviderAvailable = !! RealThemeProvider;

/**
 * Tier-1 seed extraction. `styles.theme` is the canonical seed source —
 * its shape is identical to `<ThemeProvider>`'s prop interface, so the
 * mapping is direct. Legacy `styles.branding.accentColor` is read as a
 * one-cycle fallback for `theme.color.primary`.
 * @param {*} styles
 */
function pickColor( styles ) {
	const primary =
		styles?.theme?.color?.primary || styles?.branding?.accentColor;
	const bg = styles?.theme?.color?.bg;
	const out = {};
	if ( primary ) {
		out.primary = primary;
	}
	if ( bg ) {
		out.bg = bg;
	}
	return Object.keys( out ).length > 0 ? out : null;
}

function pickCursor( styles ) {
	const control = styles?.theme?.cursor?.control;
	if ( control === 'pointer' || control === 'default' ) {
		return { control };
	}
	return null;
}

/**
 * Wraps a NON-root region/app themed subtree with the two things the real
 * `@wordpress/theme.ThemeProvider` doesn't provide on its own:
 *
 * 1. **Inherited foreground.** The real provider emits only custom properties
 *    on a `display:contents` element — it never sets the `color` property. The
 *    engine paints `color` at the layout root (canvas foreground = the shell
 *    *root* ramp), and `color` inherits. A nested light region that doesn't
 *    re-set `color` therefore leaks the root's dark-theme foreground
 *    (`#f0f0f0`) into its text. Components that set their own color from a
 *    token (`@wordpress/ui` Text / InputControl) look right; ones that rely on
 *    inherited `color` (`@wordpress/components` Items, icons via `currentColor`)
 *    render light-on-light. Re-establish this region's ramp foreground here.
 *    `color` inherits through `display:contents`, so layout is untouched and
 *    the overlay Slot below is covered too. Background is NOT set — it isn't
 *    inherited; each surface paints its own from its tokens.
 *
 * 2. **Overlay routing.** `@wordpress/components` `Popover` reads
 *    `slotNameContext`; with a matching named `Popover.Slot` mounted it renders
 *    as a Fill at the Slot's tree position instead of body-portaling, so
 *    dropdowns / select menus / DataViews filter comboboxes resolve their
 *    tokens against this region's ramp. Per-instance slot name (`useId`);
 *    nested `slotNameContext` overrides pick the nearest region.
 *
 * Root/chrome popovers keep body-portaling (already correctly root-themed).
 * NOTE: `@wordpress/components` `Modal` uses its own body portal independent of
 * the Popover slot, so Modal-based overlays (DataViews action `RenderModal`)
 * are NOT covered by this seam — see docs/feedback.md.
 *
 * @param {Object} root0
 * @param {*}      root0.children
 */
function RegionThemedSubtree( { children } ) {
	const slotName = `wp-admin-shell-overlays-${ useId() }`;
	return createElement(
		'div',
		{
			style: {
				display: 'contents',
				color: 'var(--wpds-color-fg-content-neutral)',
			},
		},
		createElement(
			Popover.__unstableSlotNameProvider,
			{ value: slotName },
			children,
			createElement( Popover.Slot, { name: slotName } )
		)
	);
}

export function WpdsThemeProvider( { styles, density, isRoot, children } ) {
	if ( ! RealThemeProvider ) {
		// eslint-disable-next-line no-console
		console.error(
			'wp-admin-shell: @wordpress/theme.ThemeProvider not reachable. Activate the Gutenberg plugin.'
		);
		return null;
	}

	const color = pickColor( styles );
	const cursor = pickCursor( styles );

	const props = {
		isRoot: !! isRoot,
		density: WPDS_DENSITIES.includes( density ) ? density : 'default',
	};
	if ( color ) {
		props.color = color;
	}
	if ( cursor ) {
		props.cursor = cursor;
	}

	const inner = isRoot
		? children
		: createElement( RegionThemedSubtree, null, children );

	return createElement( RealThemeProvider, props, inner );
}
