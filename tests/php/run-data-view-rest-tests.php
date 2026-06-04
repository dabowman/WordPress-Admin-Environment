<?php
/**
 * /wp-admin-workspaces/v1/data-view permission floor tests.
 *
 * Pre-fix the endpoint gated against `is_user_logged_in()` only — any
 * authenticated user could read any screen's resolved DataView config,
 * even screens the user couldn't visit in the workspace. The fix routes
 * screen-keyed requests through the per-screen permissions block; triple-
 * keyed lookups (no screen) keep the logged-in floor.
 *
 * Coverage:
 *   - Logged-out → 401.
 *   - Subscriber requesting an admin-capability screen (`?screen=plugins`,
 *     `activate_plugins` floor) → 403.
 *   - Subscriber requesting a `read`-only screen (`?screen=profile`) → 200.
 *   - Admin requesting same admin screen → 200.
 *   - Unknown screen id → 404 (not 200 with empty doc).
 *   - Triple-keyed `?kind=root&name=user` (no screen param) → 200 — triples
 *     aren't screen-scoped.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-rest-tests.php`
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

class WPAS_Data_View_REST_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;
	public static $created_user_ids = array();

	public static function assert_eq( $label, $actual, $expected ) {
		if ( $actual === $expected ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			echo '      expected: ' . var_export( $expected, true ) . "\n";
			echo '      actual:   ' . var_export( $actual, true ) . "\n";
		}
	}

	public static function assert_true( $label, $actual ) {
		self::assert_eq( $label, (bool) $actual, true );
	}

	public static function ensure_user( $login, $role ) {
		$user = get_user_by( 'login', $login );
		if ( $user ) {
			$user->set_role( $role );
			return (int) $user->ID;
		}
		$id = wp_create_user( $login, wp_generate_password( 16 ), $login . '@example.test' );
		if ( is_wp_error( $id ) ) {
			return null;
		}
		$u = get_user_by( 'id', $id );
		$u->set_role( $role );
		self::$created_user_ids[] = (int) $id;
		return (int) $id;
	}

	public static function cleanup() {
		foreach ( self::$created_user_ids as $id ) {
			wp_delete_user( $id, 1 );
		}
		self::$created_user_ids = array();
	}
}

$T = 'WPAS_Data_View_REST_Test_Runner';
register_shutdown_function( array( $T, 'cleanup' ) );

// Pin workspace + flush caches so the resolver sees the test fixture.
update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );
WP_Admin_Workspaces_Cache::flush();
WP_Admin_Workspaces_Resolver::reset_request_memo();

$admin_id      = $T::ensure_user( 'wpas_data_view_rest_admin', 'administrator' );
$subscriber_id = $T::ensure_user( 'wpas_data_view_rest_subscriber', 'subscriber' );

if ( $admin_id === null || $subscriber_id === null ) {
	echo "SKIP — could not provision admin + subscriber test users.\n";
	echo "TOTAL: 0 passed, 0 failed (skipped)\n";
	exit( 0 );
}

// ── 1. Logged-out → 401 ───────────────────────────────────────────────

wp_set_current_user( 0 );
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'screen', 'profile' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );

$T::assert_true(
	'logged-out → WP_Error',
	is_wp_error( $result )
);
$T::assert_eq(
	'logged-out → status 401',
	is_wp_error( $result ) ? (int) $result->get_error_data()['status'] : null,
	401
);

// ── 2. Subscriber → admin-only screen (`plugins`) → 403 ───────────────

wp_set_current_user( $subscriber_id );
WP_Admin_Workspaces_Resolver::reset_request_memo();
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'screen', 'plugins' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );

$T::assert_true(
	'subscriber → ?screen=plugins is WP_Error',
	is_wp_error( $result )
);
$T::assert_eq(
	'subscriber → ?screen=plugins → status 403',
	is_wp_error( $result ) ? (int) $result->get_error_data()['status'] : null,
	403
);

// ── 3. Admin → same screen → 200 (true) ───────────────────────────────

wp_set_current_user( $admin_id );
WP_Admin_Workspaces_Resolver::reset_request_memo();
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'screen', 'plugins' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );

$T::assert_eq(
	'admin → ?screen=plugins → true (200 ok)',
	$result,
	true
);

// ── 4. Subscriber → `read`-only screen (`profile`) → 200 ──────────────

wp_set_current_user( $subscriber_id );
WP_Admin_Workspaces_Resolver::reset_request_memo();
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'screen', 'profile' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );

$T::assert_eq(
	'subscriber → ?screen=profile (read-only) → true (200 ok)',
	$result,
	true
);

// ── 5. Unknown screen → 404 (not 200 with empty doc) ──────────────────

wp_set_current_user( $admin_id );
WP_Admin_Workspaces_Resolver::reset_request_memo();
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'screen', 'this-screen-does-not-exist-xyz' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );

$T::assert_true(
	'unknown screen id → WP_Error',
	is_wp_error( $result )
);
$T::assert_eq(
	'unknown screen id → status 404',
	is_wp_error( $result ) ? (int) $result->get_error_data()['status'] : null,
	404
);

// ── 6. Triple-keyed lookup (no screen) → logged-in floor only ─────────

wp_set_current_user( $subscriber_id );
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'kind', 'root' );
$req->set_param( 'name', 'user' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );

$T::assert_eq(
	'subscriber → ?kind=root&name=user (no screen) → true (logged-in floor only)',
	$result,
	true
);

// Triple-keyed lookup logged-out → still 401.
wp_set_current_user( 0 );
$req = new WP_REST_Request( 'GET', '/wp-admin-workspaces/v1/data-view' );
$req->set_param( 'kind', 'root' );
$req->set_param( 'name', 'user' );
$result = WP_Admin_Workspaces_Data_View_REST::permission_check( $req );
$T::assert_eq(
	'logged-out triple lookup → 401',
	is_wp_error( $result ) ? (int) $result->get_error_data()['status'] : null,
	401
);

// Reset to admin for any downstream test harness.
wp_set_current_user( $admin_id );
WP_Admin_Workspaces_Cache::flush();
WP_Admin_Workspaces_Resolver::reset_request_memo();

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
