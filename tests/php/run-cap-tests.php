<?php
/**
 * Capability gating tests — server-side surface (plan §M5).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cap-tests.php`
 *
 * Coverage:
 *   - `wp_admin_workspaces_resolve_capabilities()` returns correct booleans
 *     per WP role (subscriber / contributor / author / editor /
 *     administrator). This is the map shipped on
 *     `window.wpAdminWorkspaces.capabilities` that feeds the JS-side
 *     userCan() helper.
 *   - `WP_Admin_Workspaces_Can_REST::check()` returns correct booleans for
 *     the same roles.
 *
 * Out-of-scope (React, manual verification):
 *   - MountedApp / ContentRegion 403 view gating.
 *   - NavigationApp recursive screen prune.
 *
 * The harness creates four temporary users (one per non-admin role),
 * runs the assertions as each, then deletes them. Idempotent.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Cap_Test_Runner {
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

	public static function ensure_user( $login, $role ) {
		$user = get_user_by( 'login', $login );
		if ( $user ) {
			$user->set_role( $role );
			return $user;
		}
		$id = wp_create_user( $login, wp_generate_password( 16 ), $login . '@example.test' );
		if ( is_wp_error( $id ) ) {
			throw new RuntimeException( 'Could not create user: ' . $id->get_error_message() );
		}
		$user = get_user_by( 'id', $id );
		$user->set_role( $role );
		self::$created_user_ids[] = $id;
		return $user;
	}

	public static function cleanup() {
		foreach ( self::$created_user_ids as $id ) {
			wp_delete_user( $id, 1 );
		}
	}
}

$T = 'WPAS_Cap_Test_Runner';

$plugin_dir = dirname( __DIR__, 2 ) . '/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

// Force the workspace to wp-admin-default for predictable cap surface.
update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );

$expectations = array(
	'subscriber' => array(
		'read'             => true,
		'edit_posts'       => false,
		'edit_pages'       => false,
		'manage_options'   => false,
		'list_users'       => false,
	),
	'contributor' => array(
		'read'             => true,
		'edit_posts'       => true,
		'edit_pages'       => false,
		'manage_options'   => false,
	),
	'author' => array(
		'read'             => true,
		'edit_posts'       => true,
		'upload_files'     => true,
		'edit_pages'       => false,
		'manage_options'   => false,
	),
	'editor' => array(
		'read'             => true,
		'edit_posts'       => true,
		'upload_files'     => true,
		'edit_pages'       => true,
		'moderate_comments' => true,
		'manage_options'   => false,
	),
	'administrator' => array(
		'read'             => true,
		'edit_posts'       => true,
		'edit_pages'       => true,
		'moderate_comments' => true,
		'manage_options'   => true,
		'list_users'       => true,
		'edit_theme_options' => true,
	),
);

echo "\n— Cap-precompute per role —\n";

foreach ( $expectations as $role => $caps ) {
	$user = $T::ensure_user( "wpas_test_$role", $role );
	wp_set_current_user( $user->ID );
	WP_Admin_Workspaces_Cache::flush();

	$config = wp_admin_workspaces_get_active_config();
	$map    = wp_admin_workspaces_resolve_capabilities( $config );

	foreach ( $caps as $cap => $expected ) {
		$actual = isset( $map[ $cap ] ) ? (bool) $map[ $cap ] : null;
		$T::assert_eq( "$role: $cap", $actual, $expected );
	}
}

echo "\n— /wp-admin-workspaces/v1/can/{cap} per role —\n";

foreach ( $expectations as $role => $caps ) {
	$user = $T::ensure_user( "wpas_test_$role", $role );
	wp_set_current_user( $user->ID );

	foreach ( $caps as $cap => $expected ) {
		$req = new WP_REST_Request( 'GET', "/wp-admin-workspaces/v1/can/$cap" );
		$req->set_url_params( array( 'capability' => $cap ) );
		$resp   = WP_Admin_Workspaces_Can_REST::check( $req );
		$actual = $resp instanceof WP_REST_Response
			? (bool) $resp->get_data()['can']
			: null;
		$T::assert_eq( "REST $role: can($cap)", $actual, $expected );
	}
}

$T::cleanup();
update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );
WP_Admin_Workspaces_Cache::flush();

echo "\n— Summary —\n";
echo 'PASS: ' . $T::$pass . '  FAIL: ' . $T::$fail . "\n";
if ( $T::$fail > 0 ) {
	exit( 1 );
}
