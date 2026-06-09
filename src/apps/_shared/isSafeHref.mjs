/**
 * Reject non-http(s) href values before rendering them as anchor `href`s.
 *
 * React does not strip `javascript:` / `data:` URIs the way PHP's `esc_url()`
 * does (it only warns in dev), so REST-supplied URLs — plugin/theme header URIs,
 * comment author URLs, etc. — must pass this guard before use. Protocol-relative
 * URIs (`//evil.test`) are rejected: `new URL( '//x' )` throws without a base, so
 * only explicit `https?:` schemes pass. Empty/absent/non-string values return
 * false.
 *
 * Pure + side-effect-free so a runtime test can pin the rejection cases.
 *
 * @param {string} href Candidate URL string.
 * @return {boolean} True when safe to render as a link.
 */
export function isSafeHref( href ) {
	if ( ! href || typeof href !== 'string' ) {
		return false;
	}
	try {
		const url = new URL( href );
		return url.protocol === 'https:' || url.protocol === 'http:';
	} catch {
		return false;
	}
}
