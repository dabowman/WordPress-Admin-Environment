/**
 * Shared wp-admin chrome-hide CSS for iframe-mounted admin pages.
 *
 * Three apps mount classic wp-admin (or the site editor) in an iframe and need
 * the default admin chrome hidden so only the page body shows through:
 * `core:editor`, `core:iframe-fallback`, and the desktop engine's
 * `core:desktop-iframe`. They previously each carried a byte-near copy of this
 * CSS + injection boilerplate; this is the single source.
 *
 * The site-editor selectors are a superset that's a harmless no-op on the
 * plain post/admin pages the other two apps mount.
 *
 * TODO: site-editor chrome-hiding selectors are fragile — rev with each WP
 * release. Verify the Style Book canvas layout after upgrades.
 */
export const CHROME_HIDE_CSS = `
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
 * Append the chrome-hide stylesheet to an iframe's document.
 *
 * Accesses `iframeEl.contentDocument` (which can throw a `SecurityError` on a
 * cross-origin frame) and appends the style — all inside one try/catch. A
 * `SecurityError` is expected and swallowed; any OTHER error is a real bug and
 * is surfaced in debug builds (sibling iframe code used to swallow these
 * silently).
 *
 * @param {HTMLIFrameElement} iframeEl The iframe element.
 * @return {boolean} True when the style was injected.
 */
export function injectChromeHide( iframeEl ) {
	try {
		const doc = iframeEl && iframeEl.contentDocument;
		if ( ! doc ) {
			return false;
		}
		const style = doc.createElement( 'style' );
		style.textContent = CHROME_HIDE_CSS;
		doc.head.appendChild( style );
		return true;
	} catch ( e ) {
		if (
			e &&
			e.name !== 'SecurityError' &&
			typeof window !== 'undefined' &&
			window.wpAdminShell &&
			window.wpAdminShell.debug
		) {
			// eslint-disable-next-line no-console
			console.warn( 'wp-admin-shell: chrome-hide injection failed:', e );
		}
		return false;
	}
}
