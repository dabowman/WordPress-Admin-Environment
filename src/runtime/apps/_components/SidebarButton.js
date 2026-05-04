import { Button } from '@wordpress/components';

/**
 * Compact button styled for the dark sidebar — matches the site editor's SidebarButton.
 */
export default function SidebarButton( props ) {
	return (
		<Button
			{ ...props }
			className={ `wp-admin-shell-sidebar-button ${ props.className || '' }`.trim() }
			size="compact"
		/>
	);
}
