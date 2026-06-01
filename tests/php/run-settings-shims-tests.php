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
 *   - End-to-end `PUT /wp/v2/settings` (real `rest_do_request` dispatch as an
 *     admin) lands the reading shims — `posts_per_rss` integer coercion +
 *     `>= 1` schema floor, `rss_use_excerpt` boolean (truthy and falsy) +
 *     exact stored-string shape (`'1'` / `''`, not `'1'` / `'0'`).
 *   - End-to-end `PUT` of the `timezone` setting routes a manual `UTC±X` value
 *     to `gmt_offset` (clearing `timezone_string`), and an IANA zone to
 *     `timezone_string` (leaving `gmt_offset` to core's read-time override) —
 *     via the `rest_pre_update_setting` filter firing inside the controller,
 *     mirroring `wp-admin/options.php` so the manual-offset option no longer
 *     reverts silently.
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

// `get_registered_settings()` is exactly what WP_REST_Settings_Controller
// iterates (filtering on `show_in_rest`) to build the /wp/v2/settings GET
// response + request schema, so the assertions above prove the keys are
// reachable via the endpoint. The shimmed `home` keeps its own REST name.
// The end-to-end PUTs below prove the writes actually land through the
// controller (integer / boolean coercion + the timezone filter).

// --- end-to-end /wp/v2/settings writes --------------------------------------

// Settings writes require manage_options; authenticate as an admin and
// bootstrap the REST server so the core settings routes are registered.
$admin_ids = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ids' ) );
if ( ! empty( $admin_ids ) ) {
	wp_set_current_user( (int) $admin_ids[0] );
}
rest_get_server();

/**
 * Dispatch a PUT /wp/v2/settings through the real REST stack.
 *
 * @param array $params Setting name → value pairs.
 * @return WP_REST_Response Response from the settings controller.
 */
$put_settings = function ( $params ) {
	$request = new WP_REST_Request( 'PUT', '/wp/v2/settings' );
	foreach ( $params as $key => $value ) {
		$request->set_param( $key, $value );
	}
	return rest_do_request( $request );
};

// Reading shims round-trip end-to-end — proves the integer + boolean writes
// land through the controller, not just that the options are registered.
$saved_ppr = get_option( 'posts_per_rss' );
$saved_rue = get_option( 'rss_use_excerpt' );

$res = $put_settings( array(
	'posts_per_rss'   => 25,
	'rss_use_excerpt' => true,
) );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'reading PUT → 200', $res->get_status(), 200 );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'posts_per_rss persisted', (int) get_option( 'posts_per_rss' ), 25 );
WPAS_Settings_Shim_Test_Runner::assert_true( 'rss_use_excerpt persisted truthy', (bool) get_option( 'rss_use_excerpt' ) );
// Pin the exact stored shape: WP's sanitize_option for boolean-type settings
// stores '1' for true and '' (empty string) for false — not '0'. This diverges
// from core's '1'/'0' pattern used by hand-rolled options. Feed templates call
// get_option('rss_use_excerpt') and do a truthy check, so '1' and '' are
// functionally equivalent to '1' and '0', but a regression (e.g. the shim
// 'type' changing to 'string') would alter the stored representation without
// breaking the truthy gate above. These assert_eq calls pin the actual shape
// so any such drift is caught immediately rather than silently passing.
WPAS_Settings_Shim_Test_Runner::assert_eq( 'rss_use_excerpt stored shape (true → "1")', get_option( 'rss_use_excerpt' ), '1' );

$put_settings( array( 'rss_use_excerpt' => false ) );
WPAS_Settings_Shim_Test_Runner::assert_true( 'rss_use_excerpt persisted falsy', ! get_option( 'rss_use_excerpt' ) );
// Empty string, not '0' — sanitize_option runs wp_validate_boolean() which
// casts to (bool), and update_option stores that as ''. Any change to the shim
// that switches storage to '0' would still pass the truthy gate above but would
// be caught here.
WPAS_Settings_Shim_Test_Runner::assert_eq( 'rss_use_excerpt stored shape (false → "")', get_option( 'rss_use_excerpt' ), '' );

// posts_per_rss minimum (>= 1) is enforced by the schema validator.
$res = $put_settings( array( 'posts_per_rss' => 0 ) );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'posts_per_rss = 0 rejected (400)', $res->get_status(), 400 );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'posts_per_rss unchanged after rejected write', (int) get_option( 'posts_per_rss' ), 25 );

update_option( 'posts_per_rss', $saved_ppr );
update_option( 'rss_use_excerpt', $saved_rue );

// Timezone offset routing — exercised through the real controller, so the
// rest_pre_update_setting filter fires inside update_item just as it does in
// production. Snapshot so the test leaves the site's timezone untouched.
$saved_offset = get_option( 'gmt_offset' );
$saved_tz     = get_option( 'timezone_string' );

// Manual positive offset → gmt_offset set, timezone_string cleared. With the
// zone empty, the pre_option_gmt_offset override does not fire, so the stored
// offset reads back directly.
$res = $put_settings( array( 'timezone' => 'UTC+5' ) );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC+5 PUT → 200', $res->get_status(), 200 );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC+5 → gmt_offset 5.0', (float) get_option( 'gmt_offset' ), 5.0 );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC+5 → timezone_string cleared', get_option( 'timezone_string' ), '' );

// Manual fractional negative offset.
$put_settings( array( 'timezone' => 'UTC-3.5' ) );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'UTC-3.5 → gmt_offset -3.5', (float) get_option( 'gmt_offset' ), -3.5 );

// IANA city zone: stores the zone. We do NOT assert gmt_offset here — core's
// wp_timezone_override_offset() (on the pre_option_gmt_offset read filter)
// makes get_option('gmt_offset') report the zone's *current* UTC offset while
// a zone is set, which is DST-dependent (-4 for America/New_York in summer, -5
// in winter). The meaningful, DST-independent invariant is the effective zone.
$put_settings( array( 'timezone' => 'America/New_York' ) );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'IANA zone → timezone_string set', get_option( 'timezone_string' ), 'America/New_York' );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'IANA zone → effective timezone is the zone', wp_timezone_string(), 'America/New_York' );

// Bare `UTC` is a valid zone, not a manual offset (no sign after `UTC`).
$put_settings( array( 'timezone' => 'UTC' ) );
WPAS_Settings_Shim_Test_Runner::assert_eq( 'bare UTC → timezone_string = UTC', get_option( 'timezone_string' ), 'UTC' );

// The filter only touches the timezone write — an unrelated setting passes
// through untouched (returns the incoming $updated, not true).
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
