import { Button, IconButton } from '@wordpress/ui';

/**
 * Compact button styled for the dark sidebar — matches the site editor's SidebarButton.
 *
 * `tone="neutral"` + `variant="minimal"` produces the borderless, transparent
 * background the dark chrome needs; the `wp-admin-shell-sidebar-button`
 * className still drives the chrome-token color overrides in index.css.
 *
 * Two call shapes are supported to match the legacy
 * `@wordpress/components` Button API used across the sidebar:
 *
 *   - icon + label  → renders an `IconButton` (label drives tooltip + a11y)
 *   - children      → renders a regular `Button`
 *
 * **href + render prop.** `@wordpress/ui` Button is built on `@base-ui/react`
 * Button which always renders a native `<button>` and silently drops `href`.
 * To get an actual link, the underlying element must be replaced via the
 * `render` prop. When an `href` prop is passed, swap the rendered element
 * for `<a href=...>` so clicks navigate.
 *
 * `showTooltip` from the legacy API is silently dropped — `IconButton`
 * always shows a tooltip from `label`, so the prop is no longer needed.
 * @param {Object} root0
 * @param {*}      root0.icon
 * @param {*}      root0.label
 * @param {*}      root0.showTooltip
 * @param {*}      root0.className
 * @param {*}      root0.children
 * @param {*}      root0.href
 * @param {*}      root0.target
 * @param {*}      root0.rel
 */
export default function SidebarButton( {
	icon,
	label,
	// eslint-disable-next-line no-unused-vars
	showTooltip,
	className,
	children,
	href,
	target,
	rel,
	...props
} ) {
	const mergedClass = `wp-admin-shell-sidebar-button ${
		className || ''
	}`.trim();

	const renderAs = href ? (
		<a href={ href } target={ target } rel={ rel } />
	) : undefined;

	if ( icon ) {
		return (
			<IconButton
				tone="neutral"
				variant="minimal"
				size="compact"
				icon={ icon }
				label={ label || '' }
				className={ mergedClass }
				{ ...( renderAs ? { render: renderAs } : {} ) }
				{ ...props }
			/>
		);
	}

	return (
		<Button
			tone="neutral"
			variant="minimal"
			size="compact"
			className={ mergedClass }
			aria-label={ label }
			{ ...( renderAs ? { render: renderAs } : {} ) }
			{ ...props }
		>
			{ children }
		</Button>
	);
}
