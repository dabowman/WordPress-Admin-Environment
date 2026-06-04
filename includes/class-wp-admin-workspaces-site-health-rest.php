<?php
/**
 * /wp-admin-workspaces/v1/site-health/{tests,info} — server-side Site Health.
 *
 * Workspace-side workaround for two REST gaps in core Site Health:
 *
 *   1. The ~22 synchronous "direct" tests (WordPress version, PHP version,
 *      SQL server, scheduled events, etc.) are computed in PHP at page render
 *      and shipped to wp-admin via `wp_localize_script('site-health', …)`
 *      (`wp-admin/includes/class-wp-site-health.php`). Core's REST controller
 *      exposes only the per-id ASYNC tests — there is no `/wp-site-health/v1/tests`
 *      index and no endpoint that runs the direct set.
 *   2. `WP_Debug_Data::debug_data()` (the Info / debug tab) returns a PHP array
 *      rendered server-side in `site-health-info.php`; `class-wp-debug-data.php`
 *      registers no REST route.
 *
 * This controller wraps the public methods of both admin classes:
 *
 *   GET /wp-admin-workspaces/v1/site-health/tests
 *       Runs each `WP_Site_Health::get_tests()['direct']` callback and returns
 *       the results, plus the `['async']` registry (id / label / has_rest) so
 *       the app can enumerate async tests dynamically instead of hardcoding a
 *       list. The `site_status_tests` filter runs inside `get_tests()`, so
 *       plugin-contributed tests flow through.
 *
 *   GET /wp-admin-workspaces/v1/site-health/info
 *       Returns `WP_Debug_Data::debug_data()` with each field's `private`
 *       marker preserved, so the client can omit private fields from a copy.
 *
 * Both routes run on demand with NO caching, and both gate on
 * `current_user_can( 'view_site_health_checks' )` — the same capability
 * `wp-admin/site-health.php` uses.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Site_Health_REST {

	const NAMESPACE = 'wp-admin-workspaces/v1';

	public static function register() {
		register_rest_route(
			self::NAMESPACE,
			'/site-health/tests',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_tests' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			'/site-health/info',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_info' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
			)
		);
	}

	/**
	 * Site Health is sensitive diagnostic data — gate on the same capability
	 * `wp-admin/site-health.php` uses.
	 *
	 * @return bool|WP_Error
	 */
	public static function permission_check() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_not_logged_in',
				__( 'You are not currently logged in.', 'wp-admin-workspaces' ),
				array( 'status' => 401 )
			);
		}

		if ( ! current_user_can( 'view_site_health_checks' ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'Sorry, you are not allowed to view Site Health checks on this site.', 'wp-admin-workspaces' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * REST context doesn't autoload the wp-admin Site Health classes (or the
	 * update/misc/plugin includes the direct tests pull in). Load them on
	 * demand before touching `WP_Site_Health` / `WP_Debug_Data`.
	 *
	 * @return void
	 */
	private static function load_admin_includes() {
		// The direct tests call into update + misc + plugin helpers
		// (`get_plugin_updates()`, `get_core_updates()`, `wp_get_update_data()`,
		// `get_plugins()`, etc.). REST context loads none of these.
		require_once ABSPATH . 'wp-admin/includes/update.php';
		require_once ABSPATH . 'wp-admin/includes/misc.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-site-health.php';
		require_once ABSPATH . 'wp-admin/includes/class-wp-debug-data.php';
	}

	/**
	 * Run the synchronous "direct" Site Health tests and return their results,
	 * plus a registry of the async tests for the client to enumerate.
	 *
	 * Runs on demand; no caching.
	 *
	 * @return WP_REST_Response
	 */
	public static function get_tests() {
		self::load_admin_includes();

		$site_health = WP_Site_Health::get_instance();

		// `get_tests()` applies the `site_status_tests` filter, so any
		// plugin-contributed direct/async tests are included here.
		$tests = $site_health->get_tests();

		// ── Direct tests: invoke each callback synchronously. ─────────────
		$direct = array();
		foreach ( (array) ( $tests['direct'] ?? array() ) as $check_id => $test ) {
			$result = self::run_direct_test( $site_health, $test );
			if ( null === $result ) {
				continue;
			}

			// Key by the test's own `test` id when present, else the array key.
			$id = isset( $test['test'] ) && is_string( $test['test'] ) ? $test['test'] : (string) $check_id;

			$direct[] = array_merge(
				array( 'id' => $id ),
				$result
			);
		}

		// ── Async registry: descriptors only (the app runs them against
		// core's `/wp-site-health/v1/tests/{id}`). ────────────────────────
		$async = array();
		foreach ( (array) ( $tests['async'] ?? array() ) as $check_id => $test ) {
			$id = isset( $test['test'] ) && is_string( $test['test'] ) ? $test['test'] : (string) $check_id;

			$async[] = array(
				'id'       => $id,
				'label'    => isset( $test['label'] ) ? (string) $test['label'] : $id,
				'has_rest' => ! empty( $test['has_rest'] ),
			);
		}

		return rest_ensure_response(
			array(
				'direct' => $direct,
				'async'  => $async,
			)
		);
	}

	/**
	 * Invoke a single direct test's callback and normalize its result.
	 *
	 * Direct-test entries carry a `test` callback that is either a method name
	 * on `WP_Site_Health` (`'get_test_' . $test`) or an arbitrary callable
	 * (plugin-contributed). Mirror core's `WP_Site_Health::get_tests()` /
	 * site-health localization logic.
	 *
	 * @param WP_Site_Health $site_health Site Health instance.
	 * @param array          $test        Test descriptor.
	 * @return array|null Normalized result, or null when the callback is unusable.
	 */
	private static function run_direct_test( $site_health, $test ) {
		if ( ! isset( $test['test'] ) ) {
			return null;
		}

		$callback = $test['test'];

		// String `test` values name a `get_test_{slug}` method on the
		// instance (core convention); arbitrary callables are passed through.
		if ( is_string( $callback ) && ! is_callable( $callback ) ) {
			$method = 'get_test_' . $callback;
			if ( is_callable( array( $site_health, $method ) ) ) {
				$callback = array( $site_health, $method );
			}
		}

		if ( ! is_callable( $callback ) ) {
			return null;
		}

		$result = call_user_func( $callback );

		if ( ! is_array( $result ) ) {
			return null;
		}

		return $result;
	}

	/**
	 * Return the full Site Health Info / debug-data report.
	 *
	 * `WP_Debug_Data::debug_data()` returns an array of sections; each section
	 * has a `label`, optional `description`, and a `fields` map where every
	 * field may carry a `private` flag. The flag is preserved verbatim so the
	 * client can omit private fields from a "copy to clipboard" payload.
	 *
	 * Runs on demand; no caching.
	 *
	 * @return WP_REST_Response
	 */
	public static function get_info() {
		self::load_admin_includes();

		// `debug_data()` was introduced as a static method on WP_Debug_Data;
		// it calls `check_for_updates()` internally so update.php must be loaded
		// (handled by load_admin_includes()).
		$info = WP_Debug_Data::debug_data();

		return rest_ensure_response(
			array(
				'sections' => self::normalize_info( $info ),
			)
		);
	}

	/**
	 * Normalize the debug-data array for JSON transport, preserving each
	 * field's `private` marker.
	 *
	 * @param array $info Raw `WP_Debug_Data::debug_data()` output.
	 * @return array Section list keyed list with id/label/description/fields.
	 */
	private static function normalize_info( $info ) {
		$sections = array();

		foreach ( (array) $info as $section_id => $section ) {
			if ( ! is_array( $section ) ) {
				continue;
			}

			$fields = array();
			foreach ( (array) ( $section['fields'] ?? array() ) as $field_id => $field ) {
				if ( ! is_array( $field ) ) {
					$field = array( 'value' => $field );
				}

				$value = $field['value'] ?? '';

				// Some fields carry a `debug` value distinct from the display
				// value (e.g. raw bytes vs. a formatted size). Keep both; the
				// `debug` value is what core's clipboard format() uses.
				$fields[] = array(
					'id'      => (string) $field_id,
					'label'   => isset( $field['label'] ) ? (string) $field['label'] : (string) $field_id,
					'value'   => is_scalar( $value ) ? (string) $value : $value,
					'debug'   => array_key_exists( 'debug', $field ) ? $field['debug'] : null,
					'private' => ! empty( $field['private'] ),
				);
			}

			$sections[] = array(
				'id'          => (string) $section_id,
				'label'       => isset( $section['label'] ) ? (string) $section['label'] : (string) $section_id,
				'description' => isset( $section['description'] ) ? (string) $section['description'] : '',
				'show_count'  => ! empty( $section['show_count'] ),
				'private'     => ! empty( $section['private'] ),
				'fields'      => $fields,
			);
		}

		return $sections;
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Workspaces_Site_Health_REST', 'register' ) );
