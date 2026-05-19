<?php
/**
 * /wp-admin-shell/v1/screen-view — resolved per-screen view doc.
 *
 * GET /screen-view?screen=<id>
 *   Returns the resolved view doc for the given screen: the global
 *   `settings.views.<kind>.<name>` definition merged with the screen's
 *   inline `screens.<id>.view` partial. `fieldsRef` is resolved against
 *   `settings.fields` (ref wins, inline overrides per-field). Runs
 *   `wp_admin_shell_view_config_{kind}_{name}` on the resolved global
 *   before deep-merging the screen overlay.
 *
 * v3 replacement for v2's `/view-config?kind=&name=&variant=` +
 * `/view-config/variants` endpoints. Variants no longer exist as a
 * registry concept; screen ids carry that role now.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_View_Config_REST {

	const REST_NAMESPACE = 'wp-admin-shell/v1';

	public static function register() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/screen-view',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_screen_view' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'screen' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_key',
						),
					),
				),
			)
		);
	}

	/**
	 * Permission floor: must be logged in. Individual screens may carry
	 * their own capability requirements; those gate the screen mount,
	 * not the view-doc read. Read-only access is information-only.
	 */
	public static function permission_check() {
		return is_user_logged_in();
	}

	public static function get_screen_view( $request ) {
		$screen = $request->get_param( 'screen' );

		if ( ! is_string( $screen ) || $screen === '' ) {
			return new WP_Error(
				'wp_admin_shell_screen_view_invalid_id',
				__( 'screen must be a non-empty kebab-case identifier.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}

		$doc = WP_Admin_Shell_View_Config::resolve_screen_view( $screen );

		return rest_ensure_response(
			array(
				'screen' => $screen,
				'view'   => $doc,
			)
		);
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_View_Config_REST', 'register' ) );
