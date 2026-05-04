<?php
/**
 * Per-role / per-user shell selection tests (plan §M2.9).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-selection-tests.php`
 *
 * Hits real options + user-meta against the wp-env DB; the harness
 * snapshots and restores values around each test so the run is idempotent.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Selection_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;
	public static $snapshot;

	public static function snapshot() {
		self::$snapshot = array(
			'active_shell'  => get_option( 'wp_admin_shell_active_shell', '__missing__' ),
			'active_config' => get_option( 'wp_admin_shell_active_config', '__missing__' ),
			'role_config'   => get_option( 'wp_admin_shell_role_config', '__missing__' ),
		);
	}

	public static function restore() {
		foreach ( self::$snapshot as $key_short => $value ) {
			$key = 'wp_admin_shell_' . $key_short;
			if ( $value === '__missing__' ) {
				delete_option( $key );
			} else {
				update_option( $key, $value );
			}
		}
	}

	public static function assert_eq( $label, $actual, $expected ) {
		if ( $actual === $expected ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			echo "      expected: " . var_export( $expected, true ) . "\n";
			echo "      actual:   " . var_export( $actual, true ) . "\n";
		}
	}
}

WPAS_Selection_Test_Runner::snapshot();
$T = 'WPAS_Selection_Test_Runner';

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-shell.php';

// Use the admin user wp-env always provisions.
$user = get_user_by( 'login', 'admin' );
if ( ! $user ) {
	$user = get_user_by( 'id', 1 );
}
wp_set_current_user( $user->ID );

echo "\n— Active-shell resolver —\n";

// 1. Site default reads from wp_admin_shell_active_shell first.
update_option( 'wp_admin_shell_active_shell', 'content-author' );
update_option( 'wp_admin_shell_active_config', 'developer-admin' );
$T::assert_eq(
	'site default: new key wins over legacy',
	WP_Admin_Shell_Resolver::active_shell_slug(),
	'content-author'
);

// 2. Falls back to legacy key when new key absent.
delete_option( 'wp_admin_shell_active_shell' );
update_option( 'wp_admin_shell_active_config', 'client-portal' );
$T::assert_eq(
	'site default: legacy fallback when new key missing',
	WP_Admin_Shell_Resolver::active_shell_slug(),
	'client-portal'
);

// 3. Role override picks up wp_admin_shell_role_config[<role>][shell].
update_option( 'wp_admin_shell_active_shell', 'developer-admin' );
update_option( 'wp_admin_shell_role_config', array(
	'administrator' => array( 'shell' => 'content-author' ),
) );
$T::assert_eq(
	'role override applies for matching role',
	WP_Admin_Shell_Resolver::active_shell_slug(),
	'content-author'
);

// 4. User override only applies when the active shell is userSwitchable.
//    Default fixtures don't set it; verify role wins.
update_user_meta( $user->ID, 'wp_admin_shell_user_prefs', array(
	'shell' => 'client-portal',
) );
$T::assert_eq(
	'user override blocked when shell is not userSwitchable',
	WP_Admin_Shell_Resolver::active_shell_slug(),
	'content-author'
);

// 5. With userSwitchable shell on disk, user override wins.
$switchable_path = $plugin_dir . 'shells/test-switchable.json';
file_put_contents( $switchable_path, json_encode( array(
	'name'           => 'test-switchable',
	'title'          => 'Test (switchable)',
	'description'    => 'Test fixture for userSwitchable.',
	'userSwitchable' => true,
	'version'        => 1,
	'applications'   => array(),
) ) );
update_user_meta( $user->ID, 'wp_admin_shell_user_prefs', array(
	'shell' => 'test-switchable',
) );
$T::assert_eq(
	'user override applies when target shell is userSwitchable',
	WP_Admin_Shell_Resolver::active_shell_slug(),
	'test-switchable'
);
@unlink( $switchable_path );

// Reset.
delete_user_meta( $user->ID, 'wp_admin_shell_user_prefs' );

WPAS_Selection_Test_Runner::restore();

echo "\n— Summary —\n";
echo 'PASS: ' . WPAS_Selection_Test_Runner::$pass . '  FAIL: ' . WPAS_Selection_Test_Runner::$fail . "\n";
if ( WPAS_Selection_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
