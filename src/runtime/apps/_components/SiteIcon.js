import { Icon, wordpress } from '@wordpress/icons';

/**
 * Site icon — renders the branding logo from config, or falls back to the
 * WordPress icon.
 *
 * Hardening notes:
 *   - `config?.branding` is null-guarded so callers that pass an empty
 *     config (or the resolver hands back a missing branding tree) don't
 *     trip a `Cannot read properties of undefined (reading 'logo')` bomb
 *     before React mounts.
 *   - URL detection accepts protocol-absolute (`http://…`, `https://…`)
 *     *and* protocol-relative absolute paths (`/wp-content/uploads/…`).
 *     Anything else is treated as plugin-relative and prefixed with
 *     `wpAdminShell.pluginUrl`.
 */
export default function SiteIcon( { config } ) {
	const branding = config?.branding || {};

	if ( branding.logo ) {
		const isAbsolute = /^(https?:|\/)/.test( branding.logo );
		const src = isAbsolute
			? branding.logo
			: ( window.wpAdminShell?.pluginUrl || '' ) +
			  branding.logo.replace( /^\.\//, '' );

		return (
			<img
				src={ src }
				alt=""
				className="wp-admin-shell-site-icon__image"
			/>
		);
	}

	return (
		<div className="wp-admin-shell-site-icon__default">
			<Icon icon={ wordpress } size={ 32 } />
		</div>
	);
}
