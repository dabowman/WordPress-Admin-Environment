/* eslint-disable @wordpress/no-unsafe-wp-apis -- __experimentalItemGroup has no @wordpress/ui 0.12 port. */
import { Stack, Text } from '@wordpress/ui';
import { __experimentalItemGroup as ItemGroup } from '@wordpress/components';
import { __, isRTL } from '@wordpress/i18n';
import { chevronRight, chevronLeft } from '@wordpress/icons';

import SidebarButton from './SidebarButton';
import { useSidebarNavigation } from './SidebarNavigationContext';

/**
 * A navigation screen in the sidebar — modeled after the site editor's
 * SidebarNavigationScreen. Shows a back button (or dashboard link at root),
 * title, optional description, and content (usually an ItemGroup of nav items).
 *
 * `ItemGroup` stays from `@wordpress/components` — no WPDS port in 0.12.
 * @param {Object} root0
 * @param {*}      root0.isRoot
 * @param {*}      root0.title
 * @param {*}      root0.description
 * @param {*}      root0.content
 * @param {*}      root0.actions
 * @param {*}      root0.footer
 * @param {*}      root0.onBack
 */
export default function SidebarNavigationScreen( {
	isRoot,
	title,
	description,
	content,
	actions,
	footer,
	onBack,
} ) {
	const navState = useSidebarNavigation();
	const icon = isRTL() ? chevronRight : chevronLeft;

	return (
		<>
			<Stack
				className={
					'wp-admin-workspaces-sidebar-navigation-screen__main' +
					( footer ? ' has-footer' : '' )
				}
				direction="column"
				justify="flex-start"
			>
				<Stack
					direction="row"
					gap="md"
					align="flex-start"
					className="wp-admin-workspaces-sidebar-navigation-screen__title-icon"
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
							label={ __( 'Back', 'wp-admin-workspaces' ) }
						/>
					) }
					{ isRoot && (
						<SidebarButton
							icon={ icon }
							label={ __(
								'Go to the Dashboard',
								'wp-admin-workspaces'
							) }
							href={ window.wpAdminWorkspaces?.dashboardUrl }
						/>
					) }
					<Text
						variant="heading-lg"
						render={ <h1 /> }
						className="wp-admin-workspaces-sidebar-navigation-screen__title"
					>
						{ title }
					</Text>
					{ actions && (
						<div className="wp-admin-workspaces-sidebar-navigation-screen__actions">
							{ actions }
						</div>
					) }
				</Stack>

				<div className="wp-admin-workspaces-sidebar-navigation-screen__content">
					{ description && (
						<div className="wp-admin-workspaces-sidebar-navigation-screen__description">
							{ description }
						</div>
					) }
					{ content }
				</div>
			</Stack>

			{ footer && (
				<footer className="wp-admin-workspaces-sidebar-navigation-screen__footer">
					{ footer }
				</footer>
			) }
		</>
	);
}

// Re-export ItemGroup for callers that compose this screen with grouped items.
export { ItemGroup };
