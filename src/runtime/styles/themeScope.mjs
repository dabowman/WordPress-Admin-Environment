/**
 * Pure-ESM helpers for the kernel's theme-scope contract — pulled out
 * of `ThemeProviderHost.js` so Node test scripts under `tests/runtime/*`
 * can `import()` them directly without a webpack/jest harness.
 *
 * These helpers underpin the DS-neutral kernel contract: they decide
 * what density value to pass to the engine's provider, what subtree
 * selectors to emit, and how to compile the engine's `compileStyles`
 * output into a sibling `<style>` block. None of them depend on a
 * specific design system — engines plug in their own `compileStyles`
 * hook to translate `admin.json.styles` into CSS variables; the kernel
 * just serializes the result.
 *
 * The React-side host (`ThemeProviderHost.js`) re-exports + consumes
 * these helpers. Pure side, single source of truth.
 */

/**
 * Extract a density value from a styles tree. Returns whatever string
 * the author authored (tier-1 `styles.theme.density`, tier-4 legacy
 * `styles.density`) or `undefined`. Validation of the value against a
 * DS-specific vocabulary is the engine's ThemeProvider's responsibility
 * — the kernel does not enforce a fixed enum here so engines built on
 * design systems with different density names (Material's `dense`,
 * Tailwind's `sm/md/lg`, etc.) can interpret their own values.
 *
 * @param {*} styles
 * @return {string|undefined}
 */
export function pickDensity( styles ) {
	if ( ! styles ) {
		return undefined;
	}
	if ( typeof styles.theme?.density === 'string' ) {
		return styles.theme.density;
	}
	if ( typeof styles.density === 'string' ) {
		return styles.density;
	}
	return undefined;
}

/**
 * Decide whether a `styles` block carries enough content to warrant
 * mounting a scoped provider. Used by `<ScopedThemeProvider>` to skip
 * wrapping when the subtree has no overrides — saves a layer of DOM +
 * a layer of React reconciliation.
 *
 * @param {*} styles
 * @return {boolean}
 */
export function hasThemeContent( styles ) {
	if ( ! styles || typeof styles !== 'object' ) {
		return false;
	}
	if ( styles.theme && typeof styles.theme === 'object' ) {
		return true;
	}
	for ( const key of [
		'color',
		'border',
		'dimension',
		'elevation',
		'font',
	] ) {
		if ( styles[ key ] && typeof styles[ key ] === 'object' ) {
			return true;
		}
	}
	return false;
}

/**
 * Translate a `subtrees` map key into a CSS selector that walks under
 * the kernel's scope wrapper. Two key shapes supported today:
 *   - `region:<id>` → `[data-region-id="<id>"]`
 *   - `app:<id>`    → `[data-app-id="<id>"]`
 *
 * Unknown key shapes return `null`; the host skips them silently rather
 * than emitting a broken selector.
 *
 * @param {string} scopeKey
 * @param {string} scopeSel Scope-wrapper selector
 *                          (e.g. `[data-theme-scope-id="abc"]`).
 * @return {string|null}
 */
export function scopedSelector( scopeKey, scopeSel ) {
	if ( typeof scopeKey !== 'string' ) {
		return null;
	}
	if ( scopeKey.startsWith( 'region:' ) ) {
		return `${ scopeSel } [data-region-id="${ scopeKey.slice( 7 ) }"]`;
	}
	if ( scopeKey.startsWith( 'app:' ) ) {
		return `${ scopeSel } [data-app-id="${ scopeKey.slice( 4 ) }"]`;
	}
	return null;
}

const EMPTY_COMPILED = Object.freeze( {
	top: Object.freeze( {} ),
	scoped: Object.freeze( [] ),
	subtrees: Object.freeze( {} ),
} );

const EMPTY_TOKENS = Object.freeze( {} );

/**
 * Build the slot-override CSS layered on top of the engine's
 * ThemeProvider. No `:root` writes — the engine's provider already
 * covers that layer. Shell-level + chrome + region/app overrides emit
 * scoped to the provider id we attach to the wrapping `<div>`.
 *
 * Delegates the actual styles → CSS-variable compilation to the
 * engine's optional `compileStyles` hook. When the engine omits the
 * hook, no scoped CSS is emitted — the engine's ThemeProvider owns
 * all token plumbing directly.
 *
 * @param {Object}      params
 * @param {*}           params.engineSource Engine source object (may be
 *                                          null/undefined).
 * @param {*}           params.styles       Resolved `admin.json.styles`.
 * @param {*}           params.tokens       Flattened DTCG tokens map.
 * @param {string|null} params.providerId   useId() value from the host,
 *                                          baked into the scope selector.
 * @return {string} Compiled CSS — empty string when the engine has no
 *                  compiler or its compiler returned empty buckets.
 */
export function buildScopedDetailCss( {
	engineSource,
	styles,
	tokens,
	providerId,
} ) {
	const compile = engineSource?.compileStyles;
	const compiled = compile
		? compile( styles || {}, tokens || EMPTY_TOKENS )
		: EMPTY_COMPILED;
	const lines = [];
	const scopeSel = `[data-theme-scope-id="${ providerId }"]`;

	const topVars = compiled.top || {};
	if ( Object.keys( topVars ).length > 0 ) {
		lines.push( `${ scopeSel } {` );
		for ( const [ name, value ] of Object.entries( topVars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	for ( const { selector, vars } of compiled.scoped || [] ) {
		lines.push( `${ scopeSel } ${ selector } {` );
		for ( const [ name, value ] of Object.entries( vars ) ) {
			lines.push( `\t${ name }: ${ value };` );
		}
		lines.push( '}' );
	}

	for ( const [ scopeKey, vars ] of Object.entries(
		compiled.subtrees || {}
	) ) {
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
 * DOM-attribute name for the scope wrapper that every `<ThemeProviderHost>`
 * + `<ScopedThemeProvider>` emits. Engines that ship a `compileStyles`
 * hook target the same attribute — keep this constant the single source
 * of truth.
 */
export const THEME_SCOPE_ATTRIBUTE = 'data-theme-scope-id';

/**
 * DOM-attribute name for the sibling `<style>` block carrying the
 * engine-compiled scoped CSS. Internal identifier only — tests + devtools
 * use it to locate the emitted CSS.
 */
export const THEME_SCOPE_DETAIL_ATTRIBUTE = 'data-theme-scope-detail';
