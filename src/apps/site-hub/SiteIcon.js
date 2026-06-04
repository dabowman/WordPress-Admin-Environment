import { Icon, wordpress } from '@wordpress/icons';
import { useSelect } from '@wordpress/data';
import { store as coreStore } from '@wordpress/core-data';
import { __ } from '@wordpress/i18n';

/**
 * Site icon — resolves the icon in priority order:
 *   1. Author-declared `branding.logo` from the admin.json styles cascade.
 *   2. The site's REST `site_icon_url` (from `root/__unstableBase`) — the
 *      Site Icon a user sets in Settings → General, matching the Site
 *      Editor's SiteIcon behavior.
 *   3. The default WordPress mark.
 *
 * Hardening notes:
 *   - `config?.branding` is null-guarded so callers that pass an empty
 *     config (or the resolver hands back a missing branding tree) don't
 *     trip a `Cannot read properties of undefined (reading 'logo')` bomb
 *     before React mounts.
 *   - URL detection accepts protocol-absolute (`http://…`, `https://…`)
 *     *and* protocol-relative absolute paths (`/wp-content/uploads/…`).
 *     Anything else is treated as plugin-relative and prefixed with
 *     `wpAdminWorkspaces.pluginUrl`.
 *   - While `__unstableBase` is still resolving and no icon URL is known
 *     yet, an empty sized placeholder renders so the fallback mark doesn't
 *     flash before a configured site icon paints (mirrors edit-site).
 * @param {Object} root0
 * @param {*}      root0.config
 */
export default function SiteIcon( { config } ) {
	const branding = config?.branding || {};

	const { isRequestingSite, siteIconUrl } = useSelect( ( select ) => {
		const siteData = select( coreStore ).getEntityRecord(
			'root',
			'__unstableBase',
			undefined
		);
		return {
			isRequestingSite: ! siteData,
			siteIconUrl: siteData?.site_icon_url,
		};
	}, [] );

	if ( branding.logo ) {
		const isAbsolute = /^(https?:|\/)/.test( branding.logo );
		const src = isAbsolute
			? branding.logo
			: ( window.wpAdminWorkspaces?.pluginUrl || '' ) +
			  branding.logo.replace( /^\.\//, '' );

		return (
			<img
				src={ src }
				alt={ __( 'Site Icon', 'wp-admin-workspaces' ) }
				className="wp-admin-workspaces-site-icon__image"
			/>
		);
	}

	if ( isRequestingSite && ! siteIconUrl ) {
		return <div className="wp-admin-workspaces-site-icon__image" />;
	}

	if ( siteIconUrl ) {
		return (
			<img
				src={ siteIconUrl }
				alt={ __( 'Site Icon', 'wp-admin-workspaces' ) }
				className="wp-admin-workspaces-site-icon__image"
			/>
		);
	}

	return (
		<div className="wp-admin-workspaces-site-icon__default">
			<Icon icon={ wordpress } size={ 48 } />
		</div>
	);
}
