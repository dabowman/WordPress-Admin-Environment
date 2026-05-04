import { Stack, Text } from '@wordpress/ui';
import { __experimentalItemGroup as ItemGroup } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { isRTL } from '@wordpress/i18n';
import { chevronRight, chevronLeft } from '@wordpress/icons';

import SidebarButton from './SidebarButton';
import { useSidebarNavigation } from './SidebarNavigationContext';

/**
 * A navigation screen in the sidebar — modeled after the site editor's
 * SidebarNavigationScreen. Shows a back button (or dashboard link at root),
 * title, optional description, and content (usually an ItemGroup of nav items).
 *
 * The chrome-text color is driven by a CSS custom property
 * (`--wp-admin-shell--chrome--text-secondary`) instead of a hardcoded hex,
 * so dark/light chrome variants emitted from the cascade pick it up.
 *
 * `ItemGroup` stays from `@wordpress/components` — no WPDS port in 0.12.
 */
export default function SidebarNavigationScreen( {
	isRoot,
	title,
	description,
	content,
	footer,
	onBack,
} ) {
	const navState = useSidebarNavigation();
	const icon = isRTL() ? chevronRight : chevronLeft;

	return (
		<>
			<Stack
				className="wp-admin-shell-sidebar-screen__main"
				direction="column"
				justify="flex-start"
			>
				<Stack
					direction="row"
					gap="md"
					align="flex-start"
					className="wp-admin-shell-sidebar-screen__title-bar"
				>
					{ ! isRoot && (
						<SidebarButton
							onClick={ () => {
								if ( navState ) {
									navState.navigate( 'back' );
								}
								onBack?.();
							} }
							icon={ icon }
							label={ __( 'Back', 'wp-admin-shell' ) }
						/>
					) }
					{ isRoot && (
						<SidebarButton
							icon={ icon }
							label={ __( 'Go to the Dashboard', 'wp-admin-shell' ) }
							href={ window.wpAdminShell?.dashboardUrl }
						/>
					) }
					<Text
						variant="heading-lg"
						render={ <h1 /> }
						className="wp-admin-shell-sidebar-screen__title"
						style={ {
							color:
								'var(--wp-admin-shell--chrome--text-secondary, #e0e0e0)',
						} }
					>
						{ title }
					</Text>
				</Stack>

				<div className="wp-admin-shell-sidebar-screen__content">
					{ description && (
						<p className="wp-admin-shell-sidebar-screen__description">
							{ description }
						</p>
					) }
					{ content }
				</div>
			</Stack>

			{ footer && (
				<footer className="wp-admin-shell-sidebar-screen__footer">
					{ footer }
				</footer>
			) }
		</>
	);
}

// Re-export ItemGroup for callers that compose this screen with grouped items.
export { ItemGroup };
