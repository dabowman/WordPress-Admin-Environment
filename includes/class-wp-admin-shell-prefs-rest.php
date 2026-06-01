<?php
/**
 * /wp-admin-shell/v1/user-prefs — read + write the user-origin slice.
 *
 * Backs `core:appearance-preferences`. Returns the full `wp_admin_shell_user_prefs`
 * user-meta (a flat object) so the UI can render whatever
 * `customizable` paths the active shell exposes; writes are partial
 * (deep-merged onto the existing prefs) so multiple controls can save
 * independently without clobbering siblings.
 *
 * Server-side `customizable` enforcement still runs in the cascade
 * resolver — this endpoint is a transport. The resolver filters writes
 * the user shouldn't have set when it merges; this endpoint stores
 * what the UI sends so the user has a record of their attempt.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Prefs_REST {

	const NAMESPACE = 'wp-admin-shell/v1';
	const META_KEY  = 'wp_admin_shell_user_prefs';

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
			return new WP_Error( 'rest_forbidden', __( 'Login required.', 'wp-admin-shell' ), array( 'status' => 403 ) );
		}
		$existing = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $existing ) ) {
			$existing = array();
		}
		$patch = $request->get_json_params();
		if ( ! is_array( $patch ) ) {
			return new WP_Error( 'rest_invalid_param', __( 'Body must be an object.', 'wp-admin-shell' ), array( 'status' => 400 ) );
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
				__( 'Preferences payload too large.', 'wp-admin-shell' ),
				array( 'status' => 413 )
			);
		}
		if ( self::count_keys( $patch ) > self::MAX_KEYS ) {
			return new WP_Error(
				'rest_request_too_large',
				__( 'Preferences payload has too many keys.', 'wp-admin-shell' ),
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

	const MAX_MERGE_DEPTH = 10;

	/** Max serialized prefs payload — structural config, not a data file. */
	const MAX_BYTES = 262144;

	/** Max total keys (recursive) in a single prefs write. */
	const MAX_KEYS = 500;

	/**
	 * Count keys across a nested array, bounded by the merge depth so a
	 * pathological payload can't make the counter itself expensive.
	 *
	 * @param mixed $value Decoded JSON value.
	 * @param int   $depth Current depth.
	 * @return int
	 */
	private static function count_keys( $value, $depth = 0 ) {
		if ( ! is_array( $value ) || $depth >= self::MAX_MERGE_DEPTH ) {
			return 0;
		}
		$count = count( $value );
		foreach ( $value as $v ) {
			if ( is_array( $v ) ) {
				$count += self::count_keys( $v, $depth + 1 );
				if ( $count > self::MAX_KEYS ) {
					// Short-circuit — caller only cares whether we crossed it.
					return $count;
				}
			}
		}
		return $count;
	}

	private static function deep_merge( $base, $over, $depth = 0 ) {
		if ( $depth >= self::MAX_MERGE_DEPTH ) {
			// Cap recursion. Pathological nested payloads (legitimate or
			// adversarial) can't push past this, even though PHP's
			// memory_limit would catch true exhaustion. Replace at the
			// cap-depth boundary so the structure terminates predictably.
			return $over;
		}
		if ( ! is_array( $base ) ) {
			return $over;
		}
		if ( ! is_array( $over ) ) {
			return $over === null ? $base : $over;
		}
		$out = $base;
		foreach ( $over as $k => $v ) {
			if ( $v === null ) {
				unset( $out[ $k ] );
				continue;
			}
			$out[ $k ] = is_array( $v ) && is_array( $base[ $k ] ?? null )
				? self::deep_merge( $base[ $k ], $v, $depth + 1 )
				: $v;
		}
		return $out;
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Prefs_REST', 'register' ) );
