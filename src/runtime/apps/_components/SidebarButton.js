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
 * `showTooltip` from the legacy API is silently dropped — `IconButton`
 * always shows a tooltip from `label`, so the prop is no longer needed.
 */
export default function SidebarButton( {
	icon,
	label,
	// eslint-disable-next-line no-unused-vars
	showTooltip,
	className,
	children,
	...props
} ) {
	const mergedClass = `wp-admin-shell-sidebar-button ${ className || '' }`.trim();

	if ( icon ) {
		return (
			<IconButton
				tone="neutral"
				variant="minimal"
				size="compact"
				icon={ icon }
				label={ label || '' }
				className={ mergedClass }
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
			{ ...props }
		>
			{ children }
		</Button>
	);
}
