<?php
/**
 * core:desktop engine — PHP entry.
 *
 * Loaded unconditionally when the plugin boots; bridge hooks only fire
 * for requests carrying the `wp_admin_workspaces_chromeless=1` query var. The
 * engine's React side decides whether to emit the query flag (the
 * `core:desktop-iframe` app appends it on every URL it loads); the PHP
 * side just sees the flag and emits the bridge.
 *
 * Parallels `includes/cascade/` and `includes/origins/` — this is the
 * convention path for engine-specific PHP. A non-desktop engine would
 * live under `includes/engines/core-default/` (currently empty; the
 * default engine has no server-side hooks).
 *
 * @package WP_Admin_Workspaces
 * @since   2.x
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/chromeless-bridge.php';

/**
 * Detect a chromeless admin request.
 *
 * Two signals, either suffices:
 *
 *   1. Explicit `?wp_admin_workspaces_chromeless=1` query var the shell adds
 *      when opening iframe windows.
 *   2. `Sec-Fetch-Site: same-origin` + `Sec-Fetch-Dest: iframe` —
 *      same-origin iframe load. Catches admin navigations that drop
 *      the query flag (Gutenberg `window.location` assignments,
 *      meta-refresh redirects, missed inline-rewrites). Browser-set
 *      headers, immune to JS spoofing.
 *
 * @return bool
 */
function wp_admin_workspaces_is_chromeless_request() {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only request flag, no state change.
	if ( ! empty( $_GET['wp_admin_workspaces_chromeless'] ) && '1' === sanitize_text_field( wp_unslash( $_GET['wp_admin_workspaces_chromeless'] ) ) ) {
		return true;
	}

	$site = isset( $_SERVER['HTTP_SEC_FETCH_SITE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_SEC_FETCH_SITE'] ) ) : '';
	$dest = isset( $_SERVER['HTTP_SEC_FETCH_DEST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_SEC_FETCH_DEST'] ) ) : '';
	if ( 'same-origin' === $site && 'iframe' === $dest ) {
		return true;
	}

	return false;
}

/**
 * Mark chromeless requests on the body so other plugins can scope CSS
 * to them. Matches upstream desktop-mode's body-class signal.
 */
add_filter( 'admin_body_class', function ( $classes ) {
	if ( wp_admin_workspaces_is_chromeless_request() ) {
		$classes .= ' wp-admin-workspaces-chromeless';
	}
	return $classes;
} );

/**
 * Emit the bridge script in chromeless admin pages. Late priority so
 * the iframe sees everything the page is going to load.
 */
add_action( 'admin_footer', 'wp_admin_workspaces_chromeless_bridge_script', 1000 );
