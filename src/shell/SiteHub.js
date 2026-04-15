import {
	Button,
	__experimentalHStack as HStack,
	VisuallyHidden,
} from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { search, wordpress } from '@wordpress/icons';
import { useDispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';
import { displayShortcut } from '@wordpress/keycodes';
import { decodeEntities } from '@wordpress/html-entities';

import SiteIcon from './SiteIcon';

/**
 * SiteHub — top region of the sidebar, modeled after the site editor's SiteHub.
 *
 * Contains: site icon (→ dashboard), site title (→ frontend), command palette button.
 */
export default function SiteHub( { config } ) {
	const { open: openCommandCenter } = useDispatch( commandsStore );
	const siteTitle =
		config.branding.title || window.wpAdminShell.siteName || '';
	const homeUrl = window.wpAdminShell.homeUrl || window.wpAdminShell.siteUrl;
	const dashboardUrl = window.wpAdminShell.dashboardUrl;

	return (
		<div className="wp-admin-shell-site-hub">
			<HStack justify="flex-start" spacing="0">
				<div className="wp-admin-shell-site-hub__icon-container">
					<Button
						href={ dashboardUrl }
						label={ __( 'Go to the Dashboard', 'wp-admin-shell' ) }
						className="wp-admin-shell-site-hub__icon-button"
					>
						<SiteIcon config={ config } />
					</Button>
				</div>

				<HStack>
					<div className="wp-admin-shell-site-hub__title">
						<Button
							variant="link"
							href={ homeUrl }
							target="_blank"
						>
							{ decodeEntities( siteTitle ) }
							<VisuallyHidden as="span">
								{ __( '(opens in a new tab)', 'wp-admin-shell' ) }
							</VisuallyHidden>
						</Button>
					</div>
					<HStack
						spacing={ 0 }
						expanded={ false }
						className="wp-admin-shell-site-hub__actions"
					>
						<Button
							size="compact"
							className="wp-admin-shell-site-hub__command-toggle"
							icon={ search }
							onClick={ () => openCommandCenter() }
							label={ __( 'Open command palette', 'wp-admin-shell' ) }
							shortcut={ displayShortcut.primary( 'k' ) }
						/>
					</HStack>
				</HStack>
			</HStack>
		</div>
	);
}
