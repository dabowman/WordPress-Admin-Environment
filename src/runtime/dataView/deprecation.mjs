/**
 * Shared deprecation-warning gate for the dataView shim re-exports.
 *
 * Default — dev builds warn, production builds stay silent (preserves
 * the no-console-spam-for-end-users guarantee).
 *
 * Opt-in — site admins running a production build with `WP_DEBUG`
 * defined true see the warning regardless of build mode. PHP injects
 * `window.wpAdminShell.debug` mirroring `WP_DEBUG` (3d.5 Item 2).
 * Aligns the JS surface with PHP `_deprecated_hook`, which fires
 * unconditionally once `WP_DEBUG_LOG` is on. Removed in v3.1 alongside
 * the shims themselves.
 *
 * Imported by `useDataView.js` (`useScreenView` + `useViewConfig`
 * shims) and `hydrateInline.mjs` (`hydrateInlineScreenView` shim).
 *
 * @return {boolean} True when the shim should `console.warn`.
 */
export function shouldWarnDeprecation() {
	if (
		typeof process === 'undefined' ||
		process?.env?.NODE_ENV !== 'production'
	) {
		return true;
	}
	if (
		typeof window !== 'undefined' &&
		window.wpAdminShell?.debug === true
	) {
		return true;
	}
	return false;
}
