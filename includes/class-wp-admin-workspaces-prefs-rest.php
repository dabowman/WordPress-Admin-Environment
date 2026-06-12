<?php
/**
 * /wp-admin-workspaces/v1/user-prefs — read + write the user-origin slice.
 *
 * Backs `core:appearance-preferences`. Returns the full `wp_admin_workspaces_user_prefs`
 * user-meta (a flat object) so the UI can render whatever
 * `customizable` paths the active workspace exposes; writes are partial
 * (deep-merged onto the existing prefs) so multiple controls can save
 * independently without clobbering siblings.
 *
 * Server-side `customizable` enforcement still runs in the cascade
 * resolver — this endpoint is a transport. The resolver filters writes
 * the user shouldn't have set when it merges; this endpoint stores
 * what the UI sends so the user has a record of their attempt.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Prefs_REST {

	const NAMESPACE = 'wp-admin-workspaces/v1';
	const META_KEY  = 'wp_admin_workspaces_user_prefs';

	public static function register() {
		register_rest_route(
			self::NAMESPACE,
			'/user-prefs',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_prefs' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'set_prefs' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'reset_prefs' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
			)
		);
	}

	public static function permission_check() {
		return is_user_logged_in();
	}

	public static function get_prefs() {
		$user_id = get_current_user_id();
		$prefs   = $user_id ? get_user_meta( $user_id, self::META_KEY, true ) : array();
		if ( ! is_array( $prefs ) ) {
			$prefs = array();
		}
		return rest_ensure_response( $prefs );
	}

	public static function set_prefs( $request ) {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return new WP_Error( 'rest_forbidden', __( 'Login required.', 'wp-admin-workspaces' ), array( 'status' => 403 ) );
		}
		$existing = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $existing ) ) {
			$existing = array();
		}
		$patch = $request->get_json_params();
		if ( ! is_array( $patch ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'Body must be an object.', 'wp-admin-workspaces' ), array( 'status' => 400 ) );
		}
		// Bound the write — prefs are structural UI state, not a data store.
		// Without this any logged-in user could POST a multi-MB object that is
		// then re-read, merged, filtered, and JSON-encoded on every admin page
		// load (self-inflicted DB bloat + CPU). Mirrors the file origin's
		// MAX_BYTES guard; the key cap stops a wide-but-shallow payload too.
		$body = $request->get_body();
		if ( is_string( $body ) && strlen( $body ) > self::MAX_BYTES ) {
			return new WP_Error(
				'rest_request_too_large',
				__( 'Preferences payload too large.', 'wp-admin-workspaces' ),
				array( 'status' => 413 )
			);
		}
		if ( self::count_keys( $patch ) > self::MAX_KEYS ) {
			return new WP_Error(
				'rest_request_too_large',
				__( 'Preferences payload has too many keys.', 'wp-admin-workspaces' ),
				array( 'status' => 413 )
			);
		}
		$merged = self::deep_merge( $existing, $patch );
		update_user_meta( $user_id, self::META_KEY, $merged );
		return rest_ensure_response( $merged );
	}

	public static function reset_prefs() {
		$user_id = get_current_user_id();
		if ( $user_id ) {
			delete_user_meta( $user_id, self::META_KEY );
		}
		return rest_ensure_response( (object) array() );
	}

	const MAX_MERGE_DEPTH = WP_Admin_Workspaces_Util::PATCH_MAX_DEPTH;

	/** Max serialized prefs payload — structural config, not a data file. */
	const MAX_BYTES = 262144;

	/** Max total keys (recursive) in a single prefs write. */
	const MAX_KEYS = 500;

	// Merge + key-count primitives live in WP_Admin_Workspaces_Util
	// (`deep_merge_patch` / `count_keys`) so this transport and the
	// customization abilities share one implementation.

	private static function count_keys( $value ) {
		return WP_Admin_Workspaces_Util::count_keys( $value, self::MAX_KEYS );
	}

	private static function deep_merge( $base, $over ) {
		// User-prefs semantics: null deletes the stored key.
		return WP_Admin_Workspaces_Util::deep_merge_patch( $base, $over, true );
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Workspaces_Prefs_REST', 'register' ) );
