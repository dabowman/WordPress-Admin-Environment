import { Icon, wordpress } from '@wordpress/icons';

/**
 * Site icon — renders the branding logo from config, or falls back to the WordPress icon.
 */
export default function SiteIcon( { config } ) {
	if ( config.branding.logo ) {
		const src = config.branding.logo.startsWith( 'http' )
			? config.branding.logo
			: window.wpAdminShell.pluginUrl +
			  config.branding.logo.replace( /^\.\//, '' );

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
