<?php
/**
 * Selection-bus REST endpoint.
 *
 * Reads/writes per-user selection state under
 * `user_meta[wp_admin_shell_user_prefs][selection][<scope>]`. This is
 * the dedicated high-frequency path used by the runtime selection bus;
 * the cascade resolver (M2) consumes the same sub-tree for diagnostics
 * but the runtime never goes through the cascade for selection traffic.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Selection_REST {

	const NAMESPACE     = 'wp-admin-shell/v1';
	const ROUTE_BASE    = '/selection';
	const META_KEY      = 'wp_admin_shell_user_prefs';
	const SELECTION_KEY = 'selection';

	public static function register() {
		register_rest_route(
			self::NAMESPACE,
			self::ROUTE_BASE,
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_all' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
			)
		);

		register_rest_route(
			self::NAMESPACE,
			self::ROUTE_BASE . '/(?P<scope>[A-Za-z0-9._-]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_one' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array( 'scope' => array( 'type' => 'string' ) ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'set_one' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array( 'scope' => array( 'type' => 'string' ) ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'delete_one' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array( 'scope' => array( 'type' => 'string' ) ),
				),
			)
		);
	}

	public static function permission_check() {
		return is_user_logged_in();
	}

	public static function get_all() {
		$prefs = self::read_prefs();
		return rest_ensure_response( isset( $prefs[ self::SELECTION_KEY ] ) ? $prefs[ self::SELECTION_KEY ] : (object) array() );
	}

	public static function get_one( $request ) {
		$scope = $request->get_param( 'scope' );
		$prefs = self::read_prefs();
		$value = isset( $prefs[ self::SELECTION_KEY ][ $scope ] ) ? $prefs[ self::SELECTION_KEY ][ $scope ] : null;
		return rest_ensure_response( array( 'scope' => $scope, 'value' => $value ) );
	}

	public static function set_one( $request ) {
		$scope = $request->get_param( 'scope' );
		$value = $request->get_param( 'value' );
		$prefs = self::read_prefs();
		if ( ! isset( $prefs[ self::SELECTION_KEY ] ) || ! is_array( $prefs[ self::SELECTION_KEY ] ) ) {
			$prefs[ self::SELECTION_KEY ] = array();
		}
		$prefs[ self::SELECTION_KEY ][ $scope ] = $value;
		self::write_prefs( $prefs );
		return rest_ensure_response( array( 'scope' => $scope, 'value' => $value ) );
	}

	public static function delete_one( $request ) {
		$scope = $request->get_param( 'scope' );
		$prefs = self::read_prefs();
		if ( isset( $prefs[ self::SELECTION_KEY ][ $scope ] ) ) {
			unset( $prefs[ self::SELECTION_KEY ][ $scope ] );
			self::write_prefs( $prefs );
		}
		return rest_ensure_response( array( 'scope' => $scope, 'deleted' => true ) );
	}

	private static function read_prefs() {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return array();
		}
		$prefs = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $prefs ) ) {
			return array();
		}
		return $prefs;
	}

	private static function write_prefs( $prefs ) {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return;
		}
		update_user_meta( $user_id, self::META_KEY, $prefs );
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Selection_REST', 'register' ) );
