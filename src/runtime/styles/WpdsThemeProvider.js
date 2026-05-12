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

import { createElement } from '@wordpress/element';

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

	return createElement( RealThemeProvider, props, children );
}
