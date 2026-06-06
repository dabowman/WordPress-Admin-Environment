/**
 * ThemeProviderHost — single seam between the kernel and whichever
 * ThemeProvider the active engine ships. DS-neutral: this module
 * never imports a design-system package; the kernel-DS-neutrality
 * contract is verified by `tests/runtime/kernel-no-ds-import.test.mjs`.
 *
 * Responsibilities:
 *   1. Pick the inner ThemeProvider — engine's `ThemeProvider` field if
 *      declared, otherwise a neutral pass-through wrapper. Engines opt
 *      into workspace theming by shipping a `ThemeProvider`; absence leaves
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
 *      pass-through wrapper with a console warning. Workspace stays usable
 *      when an extension engine ships a broken ThemeProvider — but it
 *      paints without any DS-specific styling until the engine fixes
 *      its provider.
 *
 * Pure helpers (density extraction, scope-content detection,
 * `compileStyles` → CSS serialization) live alongside this module in
 * `themeScope.mjs` so `tests/runtime/*` can `import()` them directly.
 *
 * Two public components:
 *   - `<ThemeProviderHost>`: top-level, takes the engine source directly.
 *   - `<ScopedThemeProvider>`: nested, reads the engine source via
 *     `useKernel()`. Used by `<Region>` and `<MountedApp>` to scope token
 *     overrides to a region or application subtree.
 */

import {
	useId,
	useMemo,
	useContext,
	createContext,
	createElement,
	Component,
} from '@wordpress/element';

import { useKernel } from '../kernel-context';
import {
	pickDensity,
	hasThemeContent,
	appendScopedStyles,
	buildScopedDetailCss,
	THEME_SCOPE_ATTRIBUTE,
	THEME_SCOPE_DETAIL_ATTRIBUTE,
} from './themeScope.mjs';

const EMPTY_TOKENS = Object.freeze( {} );
const EMPTY_STYLES_STACK = Object.freeze( [] );

/**
 * Carries the stack of scoped `styles` seeds (region, then app, …) that
 * `<ScopedThemeProvider>` has applied above the current node, outermost
 * first. DS-neutral — the value is an array of opaque `workspace.json.styles`
 * objects; this context never references a design system.
 *
 * React context propagates through portals, so a body-portaled overlay
 * (`@wordpress/components` `Modal`) still reads the originating region/app
 * seeds even though its DOM escapes the region's `--wpds-*` scope.
 * `<PortalThemeScope>` consumes this to replay those providers inside the
 * portal — the residual gap the per-instance Popover.Slot fix in
 * `WpdsThemeProvider` doesn't cover (Modal owns a separate body portal).
 */
const ScopedStylesContext = createContext( EMPTY_STYLES_STACK );

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
 * Per-subtree host. Used by `<Region>` and `<MountedApp>` to scope token
 * overrides to a region or application via a nested provider. Returns
 * `children` unchanged when the subtree has no `styles` declared.
 *
 * Subtree styles share the top-level `styles` shape (color / border /
 * dimension / etc., plus `theme`), minus the `regions` / `applications` /
 * `chrome` blocks which only make sense at workspace scope.
 * @param {Object} root0
 * @param {*}      root0.styles
 * @param {*}      root0.children
 */
export function ScopedThemeProvider( { styles, children } ) {
	const { engineSource } = useKernel();
	const inheritedStack = useContext( ScopedStylesContext );
	// Publish this seed onto the stack so a body-portaled overlay rendered
	// anywhere below can replay it (see `<PortalThemeScope>`). Computed
	// before the early return to keep hook order stable; identity-stable
	// when this subtree has no theme content (returns the inherited array).
	const nextStack = useMemo(
		() => appendScopedStyles( inheritedStack, styles ),
		[ inheritedStack, styles ]
	);
	if ( ! hasThemeContent( styles ) ) {
		return children;
	}
	const tokens =
		( typeof window !== 'undefined' && window.wpAdminWorkspaces?.tokens ) ||
		EMPTY_TOKENS;
	const density = pickDensity( styles );
	return createElement(
		ScopedStylesContext.Provider,
		{ value: nextStack },
		createElement(
			ProviderShell,
			{
				engineSource,
				styles,
				tokens,
				density,
				isRoot: false,
			},
			children
		)
	);
}

/**
 * Re-applies the active region/app theme seeds inside a body-portaled
 * overlay so it inherits the originating region's theme instead of the
 * workspace *root* theme.
 *
 * The kernel scopes a region's `--wpds-*` CSS variables to that region's
 * DOM subtree (via `<ScopedThemeProvider>`). `@wordpress/components`
 * `Modal` portals its content to `document.body`, escaping that DOM scope
 * — so a Modal opened from a region that themes away from root (e.g. a
 * light content region over a dark developer-admin shell) would otherwise
 * paint with the root theme on both background and foreground.
 *
 * React context propagates through portals, so the modal content still
 * reads `ScopedStylesContext` and we replay each scoped provider here,
 * outermost first, re-establishing the region's tokens + foreground at the
 * portal's DOM location. No `regionId` threading is required.
 *
 * Wrap the *content inside* the overlay, never the overlay itself:
 *   - App-owned Modal:     `<Modal><PortalThemeScope>…</PortalThemeScope></Modal>`
 *   - DataViews RenderModal (DataViews supplies the `<Modal>`): return
 *     `<PortalThemeScope>…</PortalThemeScope>` as the body.
 *
 * No-op (renders children unchanged) when no region/app above declared a
 * theme — the overlay already inherits the root theme correctly.
 *
 * @param {Object} root0
 * @param {*}      root0.children
 */
export function PortalThemeScope( { children } ) {
	const stack = useContext( ScopedStylesContext );
	if ( ! stack || stack.length === 0 ) {
		return children;
	}
	// Reset the inherited stack to empty around the replay so the replayed
	// providers rebuild it identically — a Modal opened from within this
	// Modal then replays the same seeds once, not twice.
	return createElement(
		ScopedStylesContext.Provider,
		{ value: EMPTY_STYLES_STACK },
		stack.reduceRight(
			( acc, styles ) =>
				createElement( ScopedThemeProvider, { styles }, acc ),
			children
		)
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
			[ THEME_SCOPE_ATTRIBUTE ]: id,
			className: 'wp-admin-workspaces-theme-root',
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
		? createElement(
				'style',
				{ [ THEME_SCOPE_DETAIL_ATTRIBUTE ]: id },
				detailCss
		  )
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
 * `wp_admin_workspaces_register_engine`); a thrown render here would crash
 * the entire workspace. Catch + log + fall back to the neutral wrapper so
 * the workspace still paints — though without engine-specific DS theming
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
			'wp-admin-workspaces: engine ThemeProvider threw during render. ' +
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
		return createElement( NeutralProvider, { detailStyleNode }, wrapper );
	}
}
