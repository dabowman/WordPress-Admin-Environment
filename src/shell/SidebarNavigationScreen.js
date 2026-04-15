import {
	__experimentalHStack as HStack,
	__experimentalHeading as Heading,
	__experimentalVStack as VStack,
	__experimentalItemGroup as ItemGroup,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { isRTL } from '@wordpress/i18n';
import { chevronRight, chevronLeft } from '@wordpress/icons';

import SidebarButton from './SidebarButton';
import { useSidebarNavigation } from './SidebarNavigationContext';

/**
 * A navigation screen in the sidebar — modeled after the site editor's
 * SidebarNavigationScreen. Shows a back button (or dashboard link at root),
 * title, optional description, and content (usually an ItemGroup of nav items).
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
			<VStack
				className="wp-admin-shell-sidebar-screen__main"
				spacing={ 0 }
				justify="flex-start"
			>
				<HStack
					spacing={ 3 }
					alignment="flex-start"
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
							showTooltip={ false }
						/>
					) }
					{ isRoot && (
						<SidebarButton
							icon={ icon }
							label={ __( 'Go to the Dashboard', 'wp-admin-shell' ) }
							href={ window.wpAdminShell?.dashboardUrl }
						/>
					) }
					<Heading
						className="wp-admin-shell-sidebar-screen__title"
						color="#e0e0e0"
						level={ 1 }
						size={ 20 }
					>
						{ title }
					</Heading>
				</HStack>

				<div className="wp-admin-shell-sidebar-screen__content">
					{ description && (
						<p className="wp-admin-shell-sidebar-screen__description">
							{ description }
						</p>
					) }
					{ content }
				</div>
			</VStack>

			{ footer && (
				<footer className="wp-admin-shell-sidebar-screen__footer">
					{ footer }
				</footer>
			) }
		</>
	);
}
