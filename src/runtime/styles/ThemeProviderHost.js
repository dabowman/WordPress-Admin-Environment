/**
 * ThemeProviderHost — single seam between the kernel and whichever
 * ThemeProvider the active engine ships.
 *
 * Responsibilities:
 *   1. Pick the inner ThemeProvider — engine's `ThemeProvider` field if
 *      declared, otherwise the platform default (`WpdsThemeProvider`).
 *   2. Mount it with seed/density/cursor inputs. Wrap children in a
 *      `<div data-wpds-theme-provider-id={id}>` so scoped detail CSS has
 *      a stable target.
 *   3. Emit tier-3 slot overrides + chrome → WPDS bridge + region/app
 *      scoped overrides as a sibling `<style>` block. Engines never
 *      reimplement these.
 *   4. Catch renders errors from the inner provider via an error
 *      boundary; on failure fall back to the platform default with a
 *      console warning. Shell stays usable when an extension engine
 *      ships a broken ThemeProvider.
 *
 * Two public components:
 *   - `<ThemeProviderHost>`: top-level, takes the engine source directly.
 *   - `<ScopedThemeProvider>`: nested, reads the engine source via
 *     `useKernel()`. Used by `<Region>` and `<MountedApp>` to scope token
 *     overrides to a region or application subtree.
 */

import { useId, useMemo, createElement, Component } from '@wordpress/element';

import { WpdsThemeProvider } from './WpdsThemeProvider';
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
 *                                       (e.g. tests), falls back to WPDS.
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
			'data-wpds-theme-provider-id': id,
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
		? createElement( 'style', { 'data-wpds-shell-detail': id }, detailCss )
		: null;

	return createElement(
		ThemeProviderErrorBoundary,
		{ engineSource, innerProps, wrapper, detailStyleNode },
		// children prop unused — boundary renders the engine provider
		// internally so it can swap to the default on error.
		null
	);
}

/**
 * Wraps the active engine's ThemeProvider in a render-error boundary.
 * Engine-supplied providers ship outside the kernel's review process
 * (extensions can register their own engines via
 * `wp_admin_shell_register_engine`); a thrown render here would crash
 * the entire shell. Catch + log + fall back to WPDS so the shell still
 * paints.
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
				'Falling back to WPDS default. ' +
				( error?.message || error )
		);
	}

	render() {
		const { engineSource, innerProps, wrapper, detailStyleNode } =
			this.props;
		const Provider =
			! this.state.failed && engineSource?.ThemeProvider
				? engineSource.ThemeProvider
				: WpdsThemeProvider;
		return createElement( Provider, innerProps, detailStyleNode, wrapper );
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
	const scopeSel = `[data-wpds-theme-provider-id="${ providerId }"]`;

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
