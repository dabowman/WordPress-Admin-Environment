<?php
/**
 * /wp-admin-shell/v1/can/{capability} — runtime capability check.
 *
 * Companion to the inline pre-computed map at `window.wpAdminShell.capabilities`.
 * Authors call this when they need a cap that isn't part of the declared
 * config surface (custom plugin caps, dynamic resource-bound checks).
 *
 * Per-request caching via WP_Object_Cache so repeat calls within the same
 * request are free even when the user holds the cap.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Can_REST {

	const NAMESPACE = 'wp-admin-shell/v1';
	const CACHE_GROUP = 'wp_admin_shell_caps';

	public static function register() {
		register_rest_route(
			self::NAMESPACE,
			'/can/(?P<capability>[a-zA-Z0-9_:-]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'check' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array( 'capability' => array( 'type' => 'string' ) ),
				),
			)
		);
	}

	public static function permission_check() {
		return is_user_logged_in();
	}

	public static function check( $request ) {
		$capability = $request->get_param( 'capability' );
		$user_id    = get_current_user_id();
		$cache_key  = "user_{$user_id}_cap_{$capability}";

		$found  = false;
		$cached = wp_cache_get( $cache_key, self::CACHE_GROUP, false, $found );
		if ( $found ) {
			return rest_ensure_response( array( 'capability' => $capability, 'can' => $cached ) );
		}

		$can = current_user_can( $capability );
		wp_cache_set( $cache_key, $can, self::CACHE_GROUP );
		return rest_ensure_response( array( 'capability' => $capability, 'can' => $can ) );
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Can_REST', 'register' ) );
