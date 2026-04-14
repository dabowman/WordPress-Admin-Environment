import { useCallback } from '@wordpress/element';
import { Spinner } from '@wordpress/components';
import { useState } from '@wordpress/element';

/**
 * Renders a wp-admin page inside an iframe with the default chrome hidden.
 * The iframe URL resolves relative to the WordPress admin URL.
 */
export default function IframeApp( { app } ) {
	const rawUrl = app.source.replace( 'iframe:', '' );
	const src = rawUrl.startsWith( 'http' )
		? rawUrl
		: window.wpAdminShell.adminUrl + rawUrl;

	const [ isLoading, setIsLoading ] = useState( true );

	const onIframeLoad = useCallback( ( event ) => {
		setIsLoading( false );
		try {
			const doc = event.target.contentDocument;
			if ( ! doc ) {
				return;
			}
			const style = doc.createElement( 'style' );
			style.textContent = `
				#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter {
					display: none !important;
				}
				#wpcontent { margin-left: 0 !important; }
				html.wp-toolbar { padding-top: 0 !important; }
				#wpbody-content { padding-top: 0; }
			`;
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
