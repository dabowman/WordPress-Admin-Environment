import './index.css';
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';
import { Spinner } from '@wordpress/components';

import { navigate } from '../../runtime/routing/router';
import { installIframeBridge } from '../../runtime/platform/iframeBridge.mjs';

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
 * Renders a wp-admin page inside an iframe with the default chrome
 * hidden. The iframe URL resolves relative to the WordPress admin URL.
 *
 * Source: `config.url` (the v2-canonical placement). Absolute URLs
 * pass through; relative URLs resolve under `window.wpAdminShell.adminUrl`.
 * @param {Object} root0
 * @param {*}      root0.app
 * @param {*}      root0.config
 */
export default function IframeApp( { app, config = {} } ) {
	const rawUrl = config.url || '';
	const adminUrl = window.wpAdminShell?.adminUrl || '/wp-admin/';
	const src = /^https?:\/\//.test( rawUrl ) ? rawUrl : adminUrl + rawUrl;

	const [ isLoading, setIsLoading ] = useState( true );
	const iframeRef = useRef( null );

	// Parent-side chromeless-bridge listener (W6). In-iframe admin-link
	// clicks the bridge posts up route into the workspace when they map to
	// a workspace screen, navigate the iframe itself otherwise, and open
	// external links in a new tab. Origin- + source-pinned.
	useEffect( () => {
		const shell =
			typeof window !== 'undefined' ? window.wpAdminShell : null;
		const bridgeAdminUrl = ( shell && shell.adminUrl ) || '/wp-admin/';
		const routes = ( shell && shell.adminRoutes ) || {};
		return installIframeBridge( {
			adminUrl: bridgeAdminUrl,
			routes,
			navigate,
			onIframeNavigate: ( href ) => {
				if ( iframeRef.current ) {
					iframeRef.current.src = href;
				}
			},
			getIframeWindow: () =>
				iframeRef.current ? iframeRef.current.contentWindow : null,
		} );
	}, [] );

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

	if ( ! rawUrl ) {
		return null;
	}

	return (
		<div className="wp-admin-shell-app-iframe">
			{ isLoading && (
				<div className="wp-admin-shell-app-iframe__loading">
					<Spinner />
				</div>
			) }
			<iframe
				ref={ iframeRef }
				src={ src }
				title={ app?.title }
				className="wp-admin-shell-app-iframe__frame"
				onLoad={ onIframeLoad }
			/>
		</div>
	);
}
