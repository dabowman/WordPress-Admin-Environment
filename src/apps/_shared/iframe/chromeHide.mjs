/**
 * Shared wp-admin chrome-hide CSS for iframe-mounted admin pages.
 *
 * Three apps mount classic wp-admin (or the site editor) in an iframe and need
 * the default admin chrome hidden so only the page body shows through:
 * `core:editor`, `core:iframe-fallback`, and the desktop engine's
 * `core:desktop-iframe`. They previously each carried a byte-near copy of this
 * CSS + injection boilerplate; this is the single source.
 *
 * The CSS comes in two tiers:
 *
 *   - `BASE_CHROME_HIDE_CSS` hides the WP-admin shell (admin menu, admin bar,
 *     footer) so a classic wp-admin page or the site editor sits flush in the
 *     region. Always safe — a harmless no-op on a fullscreen `site-editor.php`
 *     that renders none of those nodes.
 *   - `EDITOR_CHROME_HIDE_CSS` additionally strips the *block editor's own*
 *     hub / navigation sidebar / header so the canvas reads as a chrome-less
 *     decoration. This is ONLY appropriate for preview / embed surfaces (the
 *     Design drill-down, a Styles preview). On the full takeover Editor screen
 *     it removes the editor's own affordances and prevents the user's
 *     persisted `core/preferences` view from expressing itself — see #253.
 *     It is therefore OPT-IN, never injected by default.
 *
 * TODO: the editor-chrome selectors are fragile — rev with each WP release.
 * Verify the Style Book / preview canvas layout after upgrades. Scoping them to
 * the one embed context that needs them (rather than every iframe) shrinks this
 * surface.
 */
export const BASE_CHROME_HIDE_CSS = `
	#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter {
		display: none !important;
	}
	#wpcontent { margin-left: 0 !important; }
	html.wp-toolbar { padding-top: 0 !important; }
	#wpbody-content { padding-top: 0; }
`;

export const EDITOR_CHROME_HIDE_CSS = `
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
 * Build the chrome-hide stylesheet text.
 *
 * Returns the base WP-admin shell hide by default. Pass `hideEditorChrome` to
 * additionally strip the block editor's own hub / sidebar / header — only
 * preview / embed surfaces should opt in (see #253).
 *
 * @param {Object}  [options]                  Options.
 * @param {boolean} [options.hideEditorChrome] Also hide the block editor's own
 *                                             chrome. Defaults to false.
 * @return {string} The stylesheet text.
 */
export function getChromeHideCss( { hideEditorChrome = false } = {} ) {
	return hideEditorChrome
		? BASE_CHROME_HIDE_CSS + EDITOR_CHROME_HIDE_CSS
		: BASE_CHROME_HIDE_CSS;
}

/**
 * Append the chrome-hide stylesheet to an iframe's document.
 *
 * Accesses `iframeEl.contentDocument` (which can throw a `SecurityError` on a
 * cross-origin frame) and appends the style — all inside one try/catch. A
 * `SecurityError` is expected and swallowed; any OTHER error is a real bug and
 * is surfaced in debug builds (sibling iframe code used to swallow these
 * silently).
 *
 * @param {HTMLIFrameElement} iframeEl                   The iframe element.
 * @param {Object}            [options]                  Options.
 * @param {boolean}           [options.hideEditorChrome] Also hide the block
 *                                                       editor's own chrome.
 * @return {boolean} True when the style was injected.
 */
export function injectChromeHide( iframeEl, { hideEditorChrome = false } = {} ) {
	try {
		const doc = iframeEl && iframeEl.contentDocument;
		if ( ! doc ) {
			return false;
		}
		const style = doc.createElement( 'style' );
		style.textContent = getChromeHideCss( { hideEditorChrome } );
		doc.head.appendChild( style );
		return true;
	} catch ( e ) {
		if (
			e &&
			e.name !== 'SecurityError' &&
			typeof window !== 'undefined' &&
			window.wpAdminWorkspaces &&
			window.wpAdminWorkspaces.debug
		) {
			// eslint-disable-next-line no-console
			console.warn( 'wp-admin-workspaces: chrome-hide injection failed:', e );
		}
		return false;
	}
}
