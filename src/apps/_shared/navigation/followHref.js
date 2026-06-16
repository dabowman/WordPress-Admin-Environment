import { navigate } from '../../../runtime/routing/router';

/**
 * Follow an href from a non-anchor context (a DataViews action callback, a
 * post-save continuation) the same way a real link click would.
 *
 * Hash hrefs go through the router. Anything else rides a synthetic click on
 * a real (detached-after-use) `<a>` element so the capture-phase
 * `adminLinkInterceptor` governs it — the "workspace links never bypass the
 * admin-link interceptor" rule. A `window.location.assign()` here would skip
 * the interceptor entirely, so a site override that legacy-maps the target
 * back into the workspace would silently stop working.
 *
 * Prefer rendering a real `<a href>` when the UI has one (anchors get
 * middle-click / copy-link for free); this helper is only for flows with no
 * anchor to click.
 *
 * @param {string} href Hash href (`#/posts`) or admin-relative / absolute URL.
 */
export function followHref( href ) {
	if ( typeof href !== 'string' || href === '' ) {
		return;
	}
	if ( href.startsWith( '#' ) ) {
		navigate( href );
		return;
	}
	// DOM-bound by design (hence `.js`, not a pure `.mjs`): callers are
	// mounted app code, so `document.body` is always present here.
	const anchor = document.createElement( 'a' );
	anchor.href = href;
	anchor.style.display = 'none';
	document.body.appendChild( anchor );
	anchor.click();
	anchor.remove();
}
