<?php
/**
 * /wp-admin-workspaces/v1/site-health/{tests,info} REST tests.
 *
 * The endpoint wraps the wp-admin Site Health classes server-side (no REST
 * surface exists in core for the direct tests or the full debug report). Both
 * routes gate on `current_user_can( 'view_site_health_checks' )` — the same
 * capability `wp-admin/site-health.php` uses.
 *
 * Coverage (dispatched through `rest_do_request()` for real HTTP status codes):
 *   - Logged-out → 401 on both routes.
 *   - Subscriber (lacks `view_site_health_checks`) → 403 on both routes.
 *   - Admin → 200 on /tests, with `direct` (array) + `async` (registry) shape.
 *   - Admin → 200 on /info, with debug-data `sections` carrying `private` flags.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-site-health-rest-tests.php`
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

class WPAS_Site_Health_REST_Test_Runner {
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

	public static function dispatch( $route ) {
		$req = new WP_REST_Request( 'GET', $route );
		return rest_do_request( $req );
	}
}

$T = 'WPAS_Site_Health_REST_Test_Runner';
register_shutdown_function( array( $T, 'cleanup' ) );

// Ensure the REST routes are registered for `rest_do_request()`.
if ( ! did_action( 'rest_api_init' ) ) {
	do_action( 'rest_api_init' );
}

$admin_id      = $T::ensure_user( 'wpas_sh_rest_admin', 'administrator' );
$subscriber_id = $T::ensure_user( 'wpas_sh_rest_subscriber', 'subscriber' );

if ( $admin_id === null || $subscriber_id === null ) {
	echo "SKIP — could not provision admin + subscriber test users.\n";
	echo "TOTAL: 0 passed, 0 failed (skipped)\n";
	exit( 0 );
}

// ── 1. Logged-out → 401 on both routes ────────────────────────────────────

wp_set_current_user( 0 );

$res = $T::dispatch( '/wp-admin-workspaces/v1/site-health/tests' );
$T::assert_eq( 'logged-out → /tests → 401', $res->get_status(), 401 );

$res = $T::dispatch( '/wp-admin-workspaces/v1/site-health/info' );
$T::assert_eq( 'logged-out → /info → 401', $res->get_status(), 401 );

// ── 2. Subscriber (no view_site_health_checks) → 403 on both routes ───────

wp_set_current_user( $subscriber_id );

$res = $T::dispatch( '/wp-admin-workspaces/v1/site-health/tests' );
$T::assert_eq( 'subscriber → /tests → 403', $res->get_status(), 403 );

$res = $T::dispatch( '/wp-admin-workspaces/v1/site-health/info' );
$T::assert_eq( 'subscriber → /info → 403', $res->get_status(), 403 );

// ── 3. Admin → /tests → 200 with direct + async shape ─────────────────────

wp_set_current_user( $admin_id );

$res  = $T::dispatch( '/wp-admin-workspaces/v1/site-health/tests' );
$data = $res->get_data();

$T::assert_eq( 'admin → /tests → 200', $res->get_status(), 200 );
$T::assert_true(
	'admin → /tests → direct is array',
	is_array( $data ) && isset( $data['direct'] ) && is_array( $data['direct'] )
);
$T::assert_true(
	'admin → /tests → async registry is array',
	is_array( $data ) && isset( $data['async'] ) && is_array( $data['async'] )
);
$T::assert_true(
	'admin → /tests → ran at least one direct test',
	is_array( $data ) && ! empty( $data['direct'] )
);

// Direct results carry id + status (the core test-result shape).
$first_direct = ! empty( $data['direct'] ) ? $data['direct'][0] : array();
$T::assert_true(
	'admin → /tests → direct result has id + status',
	isset( $first_direct['id'] ) && isset( $first_direct['status'] )
);

// Async registry descriptors carry id + label + has_rest.
$T::assert_true(
	'admin → /tests → async registry not empty',
	! empty( $data['async'] )
);
$first_async = ! empty( $data['async'] ) ? $data['async'][0] : array();
$T::assert_true(
	'admin → /tests → async descriptor has id + label + has_rest',
	isset( $first_async['id'] )
		&& isset( $first_async['label'] )
		&& array_key_exists( 'has_rest', $first_async )
);

// ── 4. Admin → /info → 200 with sections carrying private flags ───────────

$res  = $T::dispatch( '/wp-admin-workspaces/v1/site-health/info' );
$data = $res->get_data();

$T::assert_eq( 'admin → /info → 200', $res->get_status(), 200 );
$T::assert_true(
	'admin → /info → sections is array',
	is_array( $data ) && isset( $data['sections'] ) && is_array( $data['sections'] )
);
$T::assert_true(
	'admin → /info → at least one section',
	is_array( $data ) && ! empty( $data['sections'] )
);

// Each section has id/label/fields; each field has id/label/value/private.
$section_ok = false;
$field_ok   = false;
$private_present = false;
foreach ( (array) ( $data['sections'] ?? array() ) as $section ) {
	if ( isset( $section['id'], $section['label'], $section['fields'] ) && is_array( $section['fields'] ) ) {
		$section_ok = true;
		foreach ( $section['fields'] as $field ) {
			if ( isset( $field['id'], $field['label'] ) && array_key_exists( 'private', $field ) ) {
				$field_ok = true;
			}
			if ( ! empty( $field['private'] ) ) {
				$private_present = true;
			}
		}
	}
}

$T::assert_true( 'admin → /info → section shape ok', $section_ok );
$T::assert_true( 'admin → /info → field shape ok (incl. private flag)', $field_ok );
// The WordPress section flags the install path / siteurl etc. private; assert
// at least one private field is present so the flag round-trips.
$T::assert_true( 'admin → /info → at least one private field flagged', $private_present );

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
