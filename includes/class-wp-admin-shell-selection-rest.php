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
	const MAX_VALUE_BYTES = 65536; // 64 KiB cap on a single scope payload (pre-JSON encode).

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
			// Scope pattern allows `:` so namespaced scopes (`posts:selection`,
			// `nav:activeItem`) work alongside the dotted form. Keep the
			// pattern conservative — broad enough for common shapes, narrow
			// enough that unsanitized scope strings can't smuggle path
			// segments or query separators.
			self::ROUTE_BASE . '/(?P<scope>[A-Za-z0-9.:_-]+)',
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

	/**
	 * Permission check: any logged-in user can read/write their own
	 * selection-bus state. Selection writes target only the current
	 * user's user_meta, so isolation holds without an additional
	 * capability gate. M5's four-layer cap-gating pass leaves this
	 * intentionally permissive — every user with `read` (the WP
	 * subscriber-and-up floor) can use the bus for their own UI state.
	 */
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
		$scope    = $request->get_param( 'scope' );
		$value    = $request->get_param( 'value' );

		// Cap the per-scope payload before write. Selection state is
		// transient UI state; legitimate values fit in well under 64 KiB.
		// Without a cap, an authenticated user could fill their own
		// user_meta via repeated POSTs (self-DoS).
		$encoded  = wp_json_encode( $value );
		if ( $encoded !== false && strlen( $encoded ) > self::MAX_VALUE_BYTES ) {
			return new WP_Error(
				'rest_payload_too_large',
				sprintf(
					/* translators: %d: maximum payload size in bytes */
					__( 'Selection payload exceeds the %d-byte limit.', 'wp-admin-shell' ),
					self::MAX_VALUE_BYTES
				),
				array( 'status' => 413 )
			);
		}

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
