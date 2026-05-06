import './site-hub/index.css';
import { Button, IconButton, Stack } from '@wordpress/ui';
import { VisuallyHidden } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { search } from '@wordpress/icons';
import { useDispatch } from '@wordpress/data';
import { store as commandsStore } from '@wordpress/commands';
import { displayShortcut } from '@wordpress/keycodes';
import { decodeEntities } from '@wordpress/html-entities';
import { useEntityRecord } from '@wordpress/core-data';
import { filterURLForDisplay } from '@wordpress/url';
import { memo, forwardRef } from '@wordpress/element';

import SiteIcon from './_components/SiteIcon';
import { useKernel } from '../runtime/kernel-context';

/**
 * core:site-hub — sidebar header app.
 *
 * Reads branding from the resolved kernel config (during M1, the v0
 * normalizer maps `branding.*` into the same place); after M2 styles
 * the SiteHub will read `styles.branding.*` from the cascade.
 *
 * Site title source-of-truth: `useEntityRecord('root','site')` (the
 * REST `/wp/v2/settings.title` value via core-data). Falls back to
 * `window.wpAdminShell.siteName` only when core-data has not yet
 * hydrated. Fixes the prior bug where the toolbar showed a stale
 * title on first paint.
 */
const SiteHubApp = memo(
	forwardRef( function SiteHubApp( { config: appConfig }, ref ) {
		const { config } = useKernel();
		const branding = config.styles?.branding || {};
		const isTransparent = !! appConfig?.isTransparent;
		const { open: openCommandCenter } = useDispatch( commandsStore );
		const { record: site } = useEntityRecord( 'root', 'site' );

		const resolvedTitle =
			! site?.title && !! site?.url
				? filterURLForDisplay( site.url )
				: site?.title || window.wpAdminShell?.siteName || '';
		const siteTitle = decodeEntities( resolvedTitle );
		const homeUrl = window.wpAdminShell?.homeUrl || window.wpAdminShell?.siteUrl;
		const dashboardUrl = window.wpAdminShell?.dashboardUrl;

		return (
			<div className="wp-admin-shell-site-hub">
				<Stack direction="row" gap="xs" justify="flex-start" align="center" style={ { minWidth: 0, flex: 1 } }>
					<div
						className={
							'wp-admin-shell-site-hub__icon-container' +
							( isTransparent ? ' has-transparent-background' : '' )
						}
					>
						<Button
							ref={ ref }
							tone="neutral"
							variant="minimal"
							render={ <a href={ dashboardUrl } /> }
							aria-label={ __( 'Go to the Dashboard', 'wp-admin-shell' ) }
							className="wp-admin-shell-site-hub__icon-button"
						>
							<SiteIcon config={ { branding } } />
						</Button>
					</div>

					<Stack direction="row" gap="xs" align="center" style={ { minWidth: 0, flex: 1 } }>
						<div className="wp-admin-shell-site-hub__title">
							<Button
								tone="neutral"
								variant="minimal"
								render={ <a href={ homeUrl } target="_blank" rel="noopener noreferrer" /> }
							>
								{ siteTitle }
								<VisuallyHidden as="span">
									{ __( '(opens in a new tab)', 'wp-admin-shell' ) }
								</VisuallyHidden>
							</Button>
						</div>
						<Stack
							direction="row"
							gap="xs"
							className="wp-admin-shell-site-hub__actions"
						>
							<IconButton
								tone="neutral"
								variant="minimal"
								size="compact"
								className="wp-admin-shell-site-hub__command-toggle"
								icon={ search }
								onClick={ () => openCommandCenter() }
								label={ __( 'Open command palette', 'wp-admin-shell' ) }
								shortcut={ {
									displayShortcut: displayShortcut.primary( 'k' ),
									ariaKeyShortcut: 'Meta+K',
								} }
							/>
						</Stack>
					</Stack>
				</Stack>
			</div>
		);
	} )
);

export default SiteHubApp;
