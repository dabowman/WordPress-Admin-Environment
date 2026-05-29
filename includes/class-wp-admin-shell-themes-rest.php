<?php
/**
 * /wp-admin-shell/v1/activate-theme — switch the active theme.
 *
 * Shell-side workaround: WordPress core ships no writable themes REST
 * endpoint (upstream parity ticket #143), so `core:themes` has no
 * canonical `/wp/v2/themes` mutation to call. This endpoint is a thin
 * transport over `switch_theme()`, gated on `switch_themes`.
 *
 * The previous client fallback navigated to a nonce-less
 * `themes.php?action=activate&...` link, which silently failed — so theme
 * activation was non-functional on a clean install. This route replaces
 * that fallback. apiFetch's `wp-api-fetch` middleware sends the REST
 * nonce automatically.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Themes_REST {

	const NAMESPACE = 'wp-admin-shell/v1';

	public static function register() {
		register_rest_route(
			self::NAMESPACE,
			'/activate-theme',
			array(
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'activate' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'stylesheet' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => 'sanitize_text_field',
						),
					),
				),
			)
		);
	}

	/**
	 * Switching the active theme is security-sensitive — gate on the same
	 * capability core's themes.php uses for activation.
	 *
	 * @return bool
	 */
	public static function permission_check() {
		return current_user_can( 'switch_themes' );
	}

	/**
	 * Validate the requested theme and switch to it.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function activate( $request ) {
		$stylesheet = $request->get_param( 'stylesheet' );
		if ( ! is_string( $stylesheet ) || '' === $stylesheet ) {
			return new WP_Error(
				'rest_invalid_param',
				__( 'A theme stylesheet is required.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}

		$theme = wp_get_theme( $stylesheet );
		if ( ! $theme->exists() ) {
			return new WP_Error(
				'rest_theme_not_found',
				__( 'The requested theme is not installed.', 'wp-admin-shell' ),
				array( 'status' => 404 )
			);
		}

		$errors = $theme->errors();
		if ( $errors instanceof WP_Error ) {
			return new WP_Error(
				'rest_theme_broken',
				/* translators: %s: theme error message. */
				sprintf( __( 'The theme cannot be activated: %s', 'wp-admin-shell' ), $errors->get_error_message() ),
				array( 'status' => 400 )
			);
		}

		switch_theme( $theme->get_stylesheet() );

		return rest_ensure_response(
			array(
				'stylesheet' => $theme->get_stylesheet(),
				'name'       => $theme->get( 'Name' ),
				'active'     => true,
			)
		);
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Themes_REST', 'register' ) );
