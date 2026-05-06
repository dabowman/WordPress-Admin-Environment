/**
 * ShellThemeProvider — DOM-cascade theme override for the shell.
 *
 * Architectural goal: emit token overrides scoped to a wrapping
 * `<div data-wpds-theme-provider-id>` so shell tokens cascade down the
 * DOM tree, not up through `:root`. Authors override by re-defining
 * tokens at the relevant subtree, not by modifying global defaults.
 *
 * Two-tier implementation:
 *
 *   1. **Real `@wordpress/theme.ThemeProvider`** — preferred. The package
 *      gates the component behind `privateApis` w/ an allowlist that
 *      excludes plugins. We push our plugin's name onto the allowlist
 *      (via `wp.privateApis.allowCoreModule`) at module load, then
 *      `unlock(themePrivateApis).ThemeProvider`. This gives us
 *      seed-color → color-ramp generation, density-tuned dimension
 *      tokens, the canonical legacy compat aliases, and automatic
 *      portal coverage (overlay components re-mount the same provider
 *      across portal boundaries via the same private API).
 *
 *      Caveat: `allowCoreModule` is intended by the package authors
 *      "for unit tests" — using it in production-plugin code is
 *      explicitly off-piste. The consent string and the allowlist
 *      mechanism may break in any WordPress release, per the warning
 *      in `@wordpress/private-apis`. This shell aims to become a core
 *      feature, so the coupling is acceptable.
 *
 *   2. **Hand-rolled fallback** — used when real ThemeProvider can't be
 *      reached (Gutenberg plugin missing, private-apis API surface
 *      changed, allowlist hardened). Mirrors the public contract: same
 *      data attribute names, same `display: contents` layout neutrality.
 *      Authors author slot values directly; no ramp generation.
 *
 * Compat bridge: `--wp-admin-theme-color` and `--wp-components-color-*`
 * aliases stay at `:root` so legacy WordPress code outside `#wp-admin-shell`
 * still resolves them. Real ThemeProvider emits these too; the fallback
 * uses our `compatBridge.js` shim.
 */

import { useId, useMemo, createElement, Fragment } from '@wordpress/element';
import { compileStyles } from './compileStyles';
import { buildCompatBridge } from './compatBridge';

const SHELL_MODULE_NAME = '@wordpress/wp-admin-shell';
const PRIVATE_API_CONSENT =
	'I acknowledge private features are not for use in themes or plugins and doing so will break in the next version of WordPress.';

/**
 * Resolve the real ThemeProvider once at module load. Returns `null` on
 * any failure (Gutenberg plugin missing, allowlist push refused,
 * privateApis surface changed). Module-level memo — opting-in is a
 * one-shot operation per page load.
 */
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

		// Push the shell's module name onto the consent allowlist before
		// opting in. `allowCoreModule` is exported from
		// `@wordpress/private-apis`; its presence on the runtime global
		// depends on the externalized package preserving all exports.
		// When absent, the opt-in below will throw and we fall back.
		if ( typeof wpPrivateApis.allowCoreModule === 'function' ) {
			wpPrivateApis.allowCoreModule( SHELL_MODULE_NAME );
		}

		const optIn =
			wpPrivateApis.__dangerousOptInToUnstableAPIsOnlyForCoreModules;
		if ( typeof optIn !== 'function' ) {
			return null;
		}
		const { unlock } = optIn( PRIVATE_API_CONSENT, SHELL_MODULE_NAME );
		const unlocked = unlock( wpTheme.privateApis );
		return unlocked?.ThemeProvider || null;
	} catch ( e ) {
		// eslint-disable-next-line no-console
		console.warn(
			'wp-admin-shell: real @wordpress/theme.ThemeProvider unavailable; using fallback. ' +
				( e?.message || e )
		);
		return null;
	}
} )();

/**
 * Public entry point. Picks real ThemeProvider when reachable, fallback
 * otherwise. The hand-rolled fallback emits compileStyles + chrome
 * scoped overrides + region/app scoped overrides; the real one only
 * accepts seed colors + density and generates the rest. To get the
 * "subtree of detailed slot overrides" semantics with the real provider,
 * we layer it: real ThemeProvider for seed-driven defaults, then the
 * hand-rolled `<style>` for explicit slot overrides authored by the
 * shell.
 */
export function ShellThemeProvider( props ) {
	if ( RealThemeProvider ) {
		return createElement( WrappedRealProvider, props );
	}
	return createElement( FallbackProvider, props );
}

function WrappedRealProvider( { styles, tokens, density, isRoot, children } ) {
	// Seed extraction. ThemeProvider accepts:
	//   color: { primary, bg }     — both optional, hex/rgb strings.
	//   density: 'default'|'compact'|'comfortable'
	//   cursor:  { control: 'pointer'|'default' }
	//
	// We pull these from the resolved styles. When admin.json doesn't
	// declare them, we omit the prop and ThemeProvider inherits from its
	// parent (or core defaults at root).
	const color = pickThemeProviderColor( styles );
	const cursor = pickThemeProviderCursor( styles );

	// Detailed slot overrides (full `--wpds-*` matrix authored by the
	// shell, plus chrome extensions, chrome→WPDS bridge, region/app
	// scopes) layer on top of ThemeProvider's seed-derived output via a
	// scoped `<style>` block. This preserves slot-level authoring while
	// gaining seed-color ramp generation for free.
	const id = useId();
	const detailCss = useMemo(
		() =>
			buildScopedDetailCss( {
				styles: styles || {},
				tokens: tokens || {},
				providerId: id,
			} ),
		[ styles, tokens, id ]
	);

	const themeProviderProps = {
		isRoot: !! isRoot,
		density,
	};
	if ( color ) {
		themeProviderProps.color = color;
	}
	if ( cursor ) {
		themeProviderProps.cursor = cursor;
	}

	return createElement(
		RealThemeProvider,
		themeProviderProps,
		// Wrap children in a `<div>` carrying our provider id so the
		// scoped detail CSS can target this subtree without colliding
		// with ThemeProvider's own scoping.
		detailCss
			? createElement(
					Fragment,
					null,
					createElement( 'style', { 'data-wpds-shell-detail': id }, detailCss )
			  )
			: null,
		createElement(
			'div',
			{
				'data-wpds-theme-provider-id': id,
				className: 'wp-admin-shell-theme-root',
				style: { display: 'contents' },
			},
			children
		)
	);
}

function FallbackProvider( { styles, tokens, density, isRoot, children } ) {
	const id = useId();
	const css = useMemo(
		() =>
			buildFallbackCss( {
				styles: styles || {},
				tokens: tokens || {},
				providerId: id,
				isRoot,
			} ),
		[ styles, tokens, id, isRoot ]
	);

	return createElement(
		Fragment,
		null,
		css ? createElement( 'style', { 'data-wpds-shell-theme': id }, css ) : null,
		createElement(
			'div',
			{
				'data-wpds-theme-provider-id': id,
				'data-wpds-density': density || undefined,
				'data-wpds-root-provider': isRoot ? 'true' : undefined,
				className: 'wp-admin-shell-theme-root',
				style: { display: 'contents' },
			},
			children
		)
	);
}

/**
 * Tier-1 seed extraction. `styles.theme` is the canonical seed source —
 * its shape is identical to `<ThemeProvider>`'s prop interface, so the
 * mapping is direct. Legacy `styles.branding.accentColor` is read as a
 * one-cycle fallback for `theme.color.primary` since a few demo shells
 * still ship it; remove after the next beta cut.
 */
function pickThemeProviderColor( styles ) {
	const primary =
		styles?.theme?.color?.primary ||
		styles?.branding?.accentColor;
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

function pickThemeProviderCursor( styles ) {
	const control = styles?.theme?.cursor?.control;
	if ( control === 'pointer' || control === 'default' ) {
		return { control };
	}
	return null;
}

/**
 * Fallback path can't run colorjs.io ramp generation. Best-effort
 * projection: any seed authored under `styles.theme` lands on the
 * closest `--wpds-*` slot directly. No ramp; hover / active / disabled
 * states keep upstream defaults. Visual degradation is the cost of
 * Gutenberg-plugin-missing operation.
 */
function projectThemeSeedsToWpdsSlots( styles ) {
	const out = {};
	const primary =
		styles?.theme?.color?.primary || styles?.branding?.accentColor;
	if ( primary ) {
		out[ '--wpds-color-bg-interactive-brand-strong' ] = primary;
		out[ '--wpds-color-fg-interactive-brand' ] = primary;
		out[ '--wpds-color-stroke-focus-brand' ] = primary;
		out[ '--wpds-color-stroke-interactive-brand' ] = primary;
	}
	const bg = styles?.theme?.color?.bg;
	if ( bg ) {
		out[ '--wpds-color-bg-surface-neutral' ] = bg;
	}
	return out;
}

/**
 * Build the slot-override CSS layered on top of the real ThemeProvider.
 * No `:root` writes here — ThemeProvider already covers that layer.
 * Shell-level + chrome + region/app overrides emit scoped to the
 * provider id we attach to our wrapping `<div>`.
 */
function buildScopedDetailCss( { styles, tokens, providerId } ) {
	const compiled = compileStyles( styles, tokens );
	const lines = [];
	const scopeSel = `[data-wpds-theme-provider-id="${ providerId }"]`;

	const topVars = { ...compiled.wpds, ...compiled.chrome };
	if ( Object.keys( topVars ).length > 0 ) {
		lines.push( `${ scopeSel } {` );
		for ( const [ name, value ] of Object.entries( topVars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	for ( const { selector, vars } of compiled.chromeScopedWpds || [] ) {
		lines.push( `${ scopeSel } ${ selector } {` );
		for ( const [ name, value ] of Object.entries( vars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	for ( const [ scopeKey, vars ] of Object.entries( compiled.scoped ) ) {
		const sel = scopedSelector( scopeKey, scopeSel );
		if ( ! sel ) {
			continue;
		}
		lines.push( `${ sel } {` );
		for ( const [ name, value ] of Object.entries( vars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	return lines.join( '\n' );
}

/**
 * Hand-rolled fallback that mirrors the public ThemeProvider contract
 * but writes a hand-rolled compat bridge at `:root` (the real component
 * emits its own compat bridge, so the bridge stays exclusive to the
 * fallback path).
 */
function buildFallbackCss( { styles, tokens, providerId, isRoot } ) {
	const compiled = compileStyles( styles, tokens );
	const compat = buildCompatBridge( compiled.wpds );
	// Best-effort: when ThemeProvider is unavailable, project tier-1
	// seeds onto the closest `--wpds-*` slots so brand/bg overrides
	// still affect the rendered output. Tier-3 slot overrides
	// (compiled.wpds) win where they overlap.
	const seedSlots = projectThemeSeedsToWpdsSlots( styles );
	const lines = [];
	const scopeSel = `[data-wpds-theme-provider-id="${ providerId }"]`;

	const topVars = { ...seedSlots, ...compiled.wpds, ...compiled.chrome };
	if ( Object.keys( topVars ).length > 0 ) {
		lines.push( `${ scopeSel } {` );
		for ( const [ name, value ] of Object.entries( topVars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	if ( Object.keys( compat ).length > 0 ) {
		if ( isRoot ) {
			lines.push( ':root {' );
			for ( const [ name, value ] of Object.entries( compat ) ) {
				lines.push( `\t${ name }: ${ value };` );
			}
			lines.push( '}' );
		}
		lines.push( `${ scopeSel } {` );
		for ( const [ name, value ] of Object.entries( compat ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	for ( const { selector, vars } of compiled.chromeScopedWpds || [] ) {
		lines.push( `${ scopeSel } ${ selector } {` );
		for ( const [ name, value ] of Object.entries( vars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	for ( const [ scopeKey, vars ] of Object.entries( compiled.scoped ) ) {
		const sel = scopedSelector( scopeKey, scopeSel );
		if ( ! sel ) {
			continue;
		}
		lines.push( `${ sel } {` );
		for ( const [ name, value ] of Object.entries( vars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	return lines.join( '\n' );
}

function scopedSelector( scopeKey, scopeSel ) {
	if ( scopeKey.startsWith( 'region:' ) ) {
		return `${ scopeSel } [data-region-id="${ scopeKey.slice( 7 ) }"]`;
	}
	if ( scopeKey.startsWith( 'app:' ) ) {
		return `${ scopeSel } [data-app-id="${ scopeKey.slice( 4 ) }"]`;
	}
	return null;
}

/**
 * Test-visible flag. `true` when the real `@wordpress/theme.ThemeProvider`
 * was reached at module load, `false` when the fallback path is active.
 */
export const usingRealThemeProvider = !! RealThemeProvider;

/**
 * Per-subtree theme provider. Used by `<Region>` and `<MountedApp>` to
 * scope token overrides to a region or application via a nested
 * `<ShellThemeProvider>`. Returns `children` unchanged when the subtree
 * has no `styles` declared, so the wrapper is zero-cost in the common
 * case.
 *
 * Subtree styles share the top-level `styles` shape (color / border /
 * dimension / etc., plus `theme`), minus the `regions` / `applications` /
 * `chrome` blocks which only make sense at shell scope.
 */
export function ScopedThemeProvider( { styles, children } ) {
	if ( ! styles || typeof styles !== 'object' || ! hasThemeContent( styles ) ) {
		return children;
	}
	const tokens =
		( typeof window !== 'undefined' && window.wpAdminShell?.tokens ) || {};
	return createElement(
		ShellThemeProvider,
		{ styles, tokens, isRoot: false, density: styles?.theme?.density },
		children
	);
}

function hasThemeContent( styles ) {
	if ( styles.theme && typeof styles.theme === 'object' ) {
		return true;
	}
	// Tier-3 slot overrides (color/border/dimension/elevation/font) at
	// region/app scope warrant a nested provider too — they need a
	// scoped wrapper for compileStyles' output to attach to.
	for ( const key of [ 'color', 'border', 'dimension', 'elevation', 'font' ] ) {
		if ( styles[ key ] && typeof styles[ key ] === 'object' ) {
			return true;
		}
	}
	return false;
}
