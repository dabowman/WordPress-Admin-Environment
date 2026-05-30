<?php
/**
 * Settings REST shim tests — issue #106.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-settings-shims-tests.php`
 *
 * Coverage:
 *   - The five core options the Settings apps render but core never
 *     `show_in_rest`-registers — `home`, `users_can_register`, `default_role`
 *     (general, non-multisite) and `posts_per_rss`, `rss_use_excerpt`
 *     (reading) — are exposed via the plugin's `register_setting` shims so
 *     `/wp/v2/settings` can read + write them.
 *   - The `rest_pre_update_setting` filter routes a manual `UTC±X` timezone
 *     write to `gmt_offset` (clearing `timezone_string`), and an IANA zone
 *     write to `timezone_string` (clearing `gmt_offset`) — mirroring
 *     `wp-admin/options.php` so the manual-offset option no longer reverts
 *     silently.
 *
 * Class-scoped state — `wp eval-file` wraps in eval() and breaks `global`.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Settings_Shim_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

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

	public static function assert_true( $label, $condition ) {
		self::assert_eq( $label, (bool) $condition, true );
	}
}

// --- register_setting / show_in_rest exposure -------------------------------

$registered = get_registered_settings();

$expected_keys = array( 'posts_per_rss', 'rss_use_excerpt' );
if ( ! is_multisite() ) {
	$expected_keys = array_merge( array( 'home', 'users_can_register', 'default_role' ), $expected_keys );
}

foreach ( $expected_keys as $key ) {
	WPAS_Settings_Shim_Test_Runner::assert_true(
		"option `$key` is registered",
		isset( $registered[ $key ] )
	);
	WPAS_Settings_Shim_Test_Runner::assert_true(
		"option `$key` carries show_in_rest",
		isset( $registered[ $key ] ) && ! empty( $registered[ $key ]['show_in_rest'] )
	);
}

// The settings controller exposes registered options under their REST name —
// `home` keeps its own name; verify it surfaces in the controller's option map.
$controller_options = ( new WP_REST_Settings_Controller() )->get_registered_options();
if ( ! is_multisite() ) {
	WPAS_Settings_Shim_Test_Runner::assert_true(
		'`home` reachable via /wp/v2/settings option map',
		isset( $controller_options['home'] )
	);
}
WPAS_Settings_Shim_Test_Runner::assert_true(
	'`posts_per_rss` reachable via /wp/v2/settings option map',
	isset( $controller_options['posts_per_rss'] )
);
WPAS_Settings_Shim_Test_Runner::assert_true(
	'`rss_use_excerpt` reachable via /wp/v2/settings option map',
	isset( $controller_options['rss_use_excerpt'] )
);

// --- rest_pre_update_setting timezone offset routing ------------------------

// Snapshot so the test leaves the site's timezone untouched.
$saved_offset = get_option( 'gmt_offset' );
$saved_tz     = get_option( 'timezone_string' );

/**
 * Drive the filter the way WP_REST_Settings_Controller::update_item does.
 *
 * @param string $value Incoming `timezone` REST value.
 * @return bool Whether the filter handled the write.
 */
$run_filter = function ( $value ) {
	$request = new WP_REST_Request( 'PUT', '/wp/v2/settings' );
	$request->set_param( 'timezone', $value );
	$args = array(
		'option_name'  => 'timezone_string',
		'show_in_rest' => array( 'name' => 'timezone' ),
	);
	return apply_filters( 'rest_pre_update_setting', false, 'timezone', $request, $args );
};

// Manual positive offset.
$handled = $run_filter( 'UTC+5' );
WPAS_Settings_Shim_Test_Runner::assert_true( 'UTC+5 write handled by filter', $handled );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC+5 → gmt_offset 5.0', (float) get_option( 'gmt_offset' ), 5.0 );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC+5 → timezone_string cleared', get_option( 'timezone_string' ), '' );

// Manual fractional negative offset.
$run_filter( 'UTC-3.5' );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC-3.5 → gmt_offset -3.5', (float) get_option( 'gmt_offset' ), -3.5 );

// IANA city zone clears the offset and stores the zone.
$run_filter( 'America/New_York' );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'IANA zone → timezone_string set', get_option( 'timezone_string' ), 'America/New_York' );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'IANA zone → gmt_offset cleared', get_option( 'gmt_offset' ), '' );

// Bare `UTC` is a valid IANA-ish zone, not a manual offset — must NOT be
// parsed as an offset (no sign after `UTC`).
$run_filter( 'UTC' );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'bare UTC → timezone_string = UTC', get_option( 'timezone_string' ), 'UTC' );

// Unrelated option writes are passed through untouched (filter returns the
// incoming $updated, not true).
$other_request = new WP_REST_Request( 'PUT', '/wp/v2/settings' );
$other_request->set_param( 'title', 'x' );
$passthrough = apply_filters(
	'rest_pre_update_setting',
	false,
	'title',
	$other_request,
	array( 'option_name' => 'blogname' )
);
WPAS_Settings_Shim_Test_Runner::assert_eq( 'non-timezone option passes through', $passthrough, false );

// Restore.
update_option( 'gmt_offset', $saved_offset );
update_option( 'timezone_string', $saved_tz );

// --- summary ----------------------------------------------------------------

echo "\n";
echo 'PASS: ' . WPAS_Settings_Shim_Test_Runner::$pass . '  FAIL: ' . WPAS_Settings_Shim_Test_Runner::$fail . "\n";
if ( WPAS_Settings_Shim_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
