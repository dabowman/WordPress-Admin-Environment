<?php
/**
 * Alpha routing / hijack test runner (W2 + W3 + W5 + W7).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-alpha-routing-tests.php`
 *
 * Covers the workspace-as-primary-entry decision logic:
 *   - is_root_entry(): which admin URLs the render hijack takes over
 *     (dashboard + bare admin.php; NOT `?page=` plugin pages or other
 *     classic screens).
 *   - is_allowlisted_endpoint(): the never-hijack list + the
 *     `wp_admin_shell_hijack_allowlist` extension filter + network admin.
 *   - is_active_request(): the context guard short-circuits under
 *     non-page contexts (including WP-CLI, where this runs).
 *
 * The render-and-exit path itself (admin-header.php → container →
 * admin-footer.php → exit) needs a real browser request — `is_admin()`
 * is false under WP-CLI — so it lives on the manual smoke checklist, not
 * here. The W3 classic-mode cookie flow + W5 classic→workspace redirect
 * + W7 allowlist matrix extend this file as those workstreams land.
 *
 * Class-scoped state because `wp eval-file` wraps the file in `eval()`.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Alpha_Routing_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function ok( $label, $condition, $detail = '' ) {
		if ( $condition ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label";
			if ( $detail ) {
				echo "\n      $detail";
			}
			echo "\n";
		}
	}

	/** Set the routing globals the hijack reads. */
	public static function request( $pagenow, $page = null ) {
		$GLOBALS['pagenow'] = $pagenow;
		if ( null === $page ) {
			unset( $_GET['page'] );
		} else {
			$_GET['page'] = $page;
		}
		WP_Admin_Shell_Hijack::reset();
	}
}

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
if ( ! file_exists( $plugin_dir . 'wp-admin-shell.php' ) ) {
	$plugin_dir = WP_PLUGIN_DIR . '/wp-admin-shell/';
}
require_once $plugin_dir . 'wp-admin-shell.php';

$user = get_user_by( 'login', 'admin' ) ?: get_user_by( 'id', 1 );
if ( $user ) {
	wp_set_current_user( $user->ID );
}

$T = 'WPAS_Alpha_Routing_Runner';

$ref          = new ReflectionClass( 'WP_Admin_Shell_Hijack' );
$is_root      = $ref->getMethod( 'is_root_entry' );
$is_allowed   = $ref->getMethod( 'is_allowlisted_endpoint' );
$is_root->setAccessible( true );
$is_allowed->setAccessible( true );

// ── is_root_entry(): the render-hijack targets ─────────────────────

echo "\n— is_root_entry —\n";

$T::request( 'index.php' );
$T::ok( 'dashboard (index.php) is a root entry', $is_root->invoke( null ) === true );

$T::request( 'admin.php' );
$T::ok( 'bare admin.php is a root entry', $is_root->invoke( null ) === true );

$T::request( 'admin.php', 'acme-thing' );
$T::ok( 'admin.php?page=acme-thing is NOT a root entry (plugin page)', $is_root->invoke( null ) === false );

$T::request( 'edit.php' );
$T::ok( 'edit.php is NOT a root entry (W5 redirect territory)', $is_root->invoke( null ) === false );

$T::request( 'upload.php' );
$T::ok( 'upload.php is NOT a root entry', $is_root->invoke( null ) === false );

// ── is_allowlisted_endpoint(): never-hijack list ───────────────────

echo "\n— is_allowlisted_endpoint —\n";

foreach ( array( 'admin-ajax.php', 'admin-post.php', 'async-upload.php', 'update.php', 'update-core.php', 'plugin-install.php', 'theme-install.php', 'customize.php', 'load-scripts.php', 'load-styles.php' ) as $slug ) {
	$T::request( $slug );
	$T::ok( "allowlisted: $slug", $is_allowed->invoke( null ) === true );
}

$T::request( 'index.php' );
$T::ok( 'index.php is NOT allowlisted', $is_allowed->invoke( null ) === false );

$T::request( 'edit.php' );
$T::ok( 'edit.php is NOT allowlisted', $is_allowed->invoke( null ) === false );

// Extension filter.
$extend = function ( $list ) {
	$list[] = 'edit.php';
	return $list;
};
add_filter( 'wp_admin_shell_hijack_allowlist', $extend );
$T::request( 'edit.php' );
$T::ok( 'wp_admin_shell_hijack_allowlist extends the list', $is_allowed->invoke( null ) === true );
remove_filter( 'wp_admin_shell_hijack_allowlist', $extend );
$T::request( 'edit.php' );
$T::ok( 'allowlist filter removal restores default', $is_allowed->invoke( null ) === false );

// ── is_active_request(): context guard ─────────────────────────────

echo "\n— is_active_request context guard —\n";

// Under WP-CLI is_admin() is false, so the takeover never fires here —
// this asserts the guard, not the positive path (which is manual-smoke).
$T::request( 'index.php' );
$T::ok( 'is_active_request false under non-admin (CLI) context', WP_Admin_Shell_Hijack::is_active_request() === false );

// ── Summary ────────────────────────────────────────────────────────

echo "\n────────────────────────────\n";
echo 'PASS: ' . WPAS_Alpha_Routing_Runner::$pass . '  FAIL: ' . WPAS_Alpha_Routing_Runner::$fail . "\n";
echo ( WPAS_Alpha_Routing_Runner::$fail > 0 ? "RESULT: FAIL\n" : "RESULT: PASS\n" );
