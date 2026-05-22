/**
 * ThemeProviderHost — single seam between the kernel and whichever
 * ThemeProvider the active engine ships. DS-neutral: this module
 * never imports a design-system package; the kernel-DS-neutrality
 * contract is verified by `tests/runtime/kernel-no-ds-import.test.mjs`.
 *
 * Responsibilities:
 *   1. Pick the inner ThemeProvider — engine's `ThemeProvider` field if
 *      declared, otherwise a neutral pass-through wrapper. Engines opt
 *      into shell theming by shipping a `ThemeProvider`; absence leaves
 *      children rendered un-themed inside a bare scoped wrapper.
 *   2. Mount it with seed/density/cursor inputs. Wrap children in a
 *      `<div data-theme-scope-id={id}>` so scoped detail CSS has
 *      a stable target. (Pre-v3 the attribute was named
 *      `data-wpds-theme-provider-id`; renamed to drop the DS-specific
 *      prefix since this attribute is the cross-engine scope hook.)
 *   3. Emit engine-supplied scoped overrides (engine's `compileStyles`
 *      hook returns `{top, scoped, subtrees}`) as a sibling `<style>`
 *      block. Engines that omit the hook get zero scoped overrides —
 *      their `ThemeProvider` owns all token plumbing directly.
 *   4. Catch render errors from the engine-supplied provider via an
 *      error boundary; on failure fall back to the same neutral
 *      pass-through wrapper with a console warning. Shell stays usable
 *      when an extension engine ships a broken ThemeProvider — but it
 *      paints without any DS-specific styling until the engine fixes
 *      its provider.
 *
 * Two public components:
 *   - `<ThemeProviderHost>`: top-level, takes the engine source directly.
 *   - `<ScopedThemeProvider>`: nested, reads the engine source via
 *     `useKernel()`. Used by `<Region>` and `<MountedApp>` to scope token
 *     overrides to a region or application subtree.
 */

import { useId, useMemo, createElement, Component } from '@wordpress/element';

import { useKernel } from '../kernel-context';

const EMPTY_COMPILED = Object.freeze( {
	top: Object.freeze( {} ),
	scoped: Object.freeze( [] ),
	subtrees: Object.freeze( {} ),
} );

const EMPTY_TOKENS = Object.freeze( {} );

/**
 * Top-level host. Mounted by the kernel.
 *
 * @param {Object}  props
 * @param {Object}  [props.engineSource] Active engine source. When absent
 *                                       (or when its `ThemeProvider` is
 *                                       missing), falls back to a neutral
 *                                       pass-through wrapper.
 * @param {Object}  props.styles
 * @param {Object}  props.tokens
 * @param {boolean} [props.isRoot]
 * @param {*}       props.children
 */
export function ThemeProviderHost( props ) {
	const density = pickDensity( props.styles );
	return createElement( ProviderShell, { ...props, density } );
}

/**
 * Extract a density value from a styles tree. Returns whatever string the
 * author authored (tier-1 `styles.theme.density`, tier-4 legacy
 * `styles.density`) or `undefined`. Validation of the value against a DS-
 * specific vocabulary is the engine's ThemeProvider's responsibility —
 * the kernel does not enforce a fixed enum here so engines built on
 * design systems with different density names (Material's `dense`,
 * Tailwind's `sm/md/lg`, etc.) can interpret their own values.
 * @param {*} styles
 */
function pickDensity( styles ) {
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
 * Per-subtree host. Used by `<Region>` and `<MountedApp>` to scope token
 * overrides to a region or application via a nested provider. Returns
 * `children` unchanged when the subtree has no `styles` declared.
 *
 * Subtree styles share the top-level `styles` shape (color / border /
 * dimension / etc., plus `theme`), minus the `regions` / `applications` /
 * `chrome` blocks which only make sense at shell scope.
 * @param {Object} root0
 * @param {*}      root0.styles
 * @param {*}      root0.children
 */
export function ScopedThemeProvider( { styles, children } ) {
	const { engineSource } = useKernel();
	if (
		! styles ||
		typeof styles !== 'object' ||
		! hasThemeContent( styles )
	) {
		return children;
	}
	const tokens =
		( typeof window !== 'undefined' && window.wpAdminShell?.tokens ) ||
		EMPTY_TOKENS;
	const density = pickDensity( styles );
	return createElement(
		ProviderShell,
		{
			engineSource,
			styles,
			tokens,
			density,
			isRoot: false,
		},
		children
	);
}

/**
 * Shared internal renderer. Picks inner provider, emits scoped detail
 * `<style>`, wraps in error boundary.
 * @param {Object} root0
 * @param {*}      root0.engineSource
 * @param {*}      root0.styles
 * @param {*}      root0.tokens
 * @param {*}      root0.density
 * @param {*}      root0.isRoot
 * @param {*}      root0.children
 */
function ProviderShell( {
	engineSource,
	styles,
	tokens,
	density,
	isRoot,
	children,
} ) {
	const id = useId();
	const detailCss = useMemo(
		() =>
			buildScopedDetailCss( {
				engineSource,
				styles: styles || {},
				tokens: tokens || EMPTY_TOKENS,
				providerId: id,
			} ),
		[ engineSource, styles, tokens, id ]
	);

	const wrapper = createElement(
		'div',
		{
			'data-theme-scope-id': id,
			className: 'wp-admin-shell-theme-root',
			style: { display: 'contents' },
		},
		children
	);

	const innerProps = {
		isRoot: !! isRoot,
		styles: styles || {},
		tokens: tokens || EMPTY_TOKENS,
		density,
	};

	const detailStyleNode = detailCss
		? createElement( 'style', { 'data-theme-scope-detail': id }, detailCss )
		: null;

	return createElement(
		ThemeProviderErrorBoundary,
		{ engineSource, innerProps, wrapper, detailStyleNode },
		// children prop unused — boundary renders the engine provider
		// internally so it can swap to the neutral wrapper on error.
		null
	);
}

/**
 * Neutral pass-through wrapper used when an engine declines to ship a
 * `ThemeProvider`, or when its provider throws during render. Renders
 * `detailStyleNode` (if any) plus the wrapped children unchanged. No DS
 * package is imported here — engines that need design-system theming
 * MUST ship their own `ThemeProvider`; the kernel's contract is render
 * children un-themed, never silently inject a WPDS (or any other DS)
 * fallback.
 *
 * The DOM-attribute contract on the wrapper (`data-theme-scope-id`)
 * still holds in this path so engine-supplied `compileStyles` output
 * — which scopes its CSS under that attribute — still applies even
 * when the inner provider is absent or broken.
 * @param {Object} root0
 * @param {*}      root0.detailStyleNode
 * @param {*}      root0.children
 */
function NeutralProvider( { detailStyleNode, children } ) {
	return createElement(
		'div',
		{ style: { display: 'contents' } },
		detailStyleNode || null,
		children
	);
}

/**
 * Wraps the active engine's ThemeProvider in a render-error boundary.
 * Engine-supplied providers ship outside the kernel's review process
 * (extensions can register their own engines via
 * `wp_admin_shell_register_engine`); a thrown render here would crash
 * the entire shell. Catch + log + fall back to the neutral wrapper so
 * the shell still paints — though without engine-specific DS theming
 * until the engine ships a working provider.
 */
class ThemeProviderErrorBoundary extends Component {
	constructor( props ) {
		super( props );
		this.state = { failed: false };
	}

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch( error ) {
		// eslint-disable-next-line no-console
		console.error(
			'wp-admin-shell: engine ThemeProvider threw during render. ' +
				'Falling back to a neutral pass-through wrapper; engine ' +
				'theming will not apply until the provider is fixed. ' +
				( error?.message || error )
		);
	}

	render() {
		const { engineSource, innerProps, wrapper, detailStyleNode } =
			this.props;
		if ( ! this.state.failed && engineSource?.ThemeProvider ) {
			const Provider = engineSource.ThemeProvider;
			return createElement(
				Provider,
				innerProps,
				detailStyleNode,
				wrapper
			);
		}
		return createElement(
			NeutralProvider,
			{ detailStyleNode },
			wrapper
		);
	}
}

/**
 * Build the slot-override CSS layered on top of the engine's
 * ThemeProvider. No `:root` writes — the engine's provider already
 * covers that layer. Shell-level + chrome + region/app overrides
 * emit scoped to the provider id we attach to our wrapping `<div>`.
 *
 * Delegates the actual styles → CSS-variable compilation to the
 * engine's optional `compileStyles` hook. When the engine omits the
 * hook, no scoped CSS is emitted — the engine's ThemeProvider owns
 * all token plumbing directly.
 *
 * @param {Object} root0
 * @param {*}      root0.engineSource
 * @param {*}      root0.styles
 * @param {*}      root0.tokens
 * @param {*}      root0.providerId
 */
function buildScopedDetailCss( { engineSource, styles, tokens, providerId } ) {
	const compile = engineSource?.compileStyles;
	const compiled = compile ? compile( styles, tokens ) : EMPTY_COMPILED;
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

function scopedSelector( scopeKey, scopeSel ) {
	if ( scopeKey.startsWith( 'region:' ) ) {
		return `${ scopeSel } [data-region-id="${ scopeKey.slice( 7 ) }"]`;
	}
	if ( scopeKey.startsWith( 'app:' ) ) {
		return `${ scopeSel } [data-app-id="${ scopeKey.slice( 4 ) }"]`;
	}
	return null;
}

function hasThemeContent( styles ) {
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
