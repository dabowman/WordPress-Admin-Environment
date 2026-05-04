import { useCallback, useState } from '@wordpress/element';
import { Spinner } from '@wordpress/components';

// TODO: site-editor chrome-hiding selectors are fragile —
// rev with each WP release. Verify Style Book canvas layout after upgrades.
const CHROME_HIDE_CSS = `
	#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter {
		display: none !important;
	}
	#wpcontent { margin-left: 0 !important; }
	html.wp-toolbar { padding-top: 0 !important; }
	#wpbody-content { padding-top: 0; }
	.edit-site-layout__sidebar-region,
	.edit-site-layout__sidebar,
	.edit-site-site-hub,
	.edit-site-layout__header-container {
		display: none !important;
	}
	.edit-site-layout__canvas-container,
	.edit-site-layout__canvas {
		inset: 0 !important;
		left: 0 !important;
	}
`;

/**
 * Renders a wp-admin page inside an iframe with the default chrome hidden.
 * The iframe URL resolves relative to the WordPress admin URL.
 */
export default function IframeApp( { app } ) {
	const rawUrl = app.source.replace( /^iframe:/, '' );
	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	const src = /^https?:\/\//.test( rawUrl ) ? rawUrl : adminUrl + rawUrl;

	const [ isLoading, setIsLoading ] = useState( true );

	const onIframeLoad = useCallback( ( event ) => {
		setIsLoading( false );
		try {
			const doc = event.target.contentDocument;
			if ( ! doc ) {
				return;
			}
			const style = doc.createElement( 'style' );
			style.textContent = CHROME_HIDE_CSS;
			doc.head.appendChild( style );
		} catch ( e ) {
			// Cross-origin iframe — can't inject styles.
		}
	}, [] );

	return (
		<div className="wp-admin-shell-app-iframe">
			{ isLoading && (
				<div className="wp-admin-shell-app-iframe__loading">
					<Spinner />
				</div>
			) }
			<iframe
				src={ src }
				title={ app.title }
				className="wp-admin-shell-app-iframe__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
