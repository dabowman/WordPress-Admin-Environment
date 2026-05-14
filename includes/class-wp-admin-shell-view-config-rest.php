<?php
/**
 * /wp-admin-shell/v1/view-config — resolved view-config for `(kind, name, variant)`.
 * /wp-admin-shell/v1/view-config/variants — discovery: list variants for `(kind, name)`.
 *
 * GET /view-config?kind=postType&name=post[&variant=services]
 *   Returns the cascade-resolved view-config doc with `fieldsRef`
 *   resolved against `fieldCollections` (ref wins, inline overrides
 *   per-field). Runs `wp_admin_shell_view_config_{kind}_{name}` and the
 *   variant-qualified filter before responding.
 *
 * GET /view-config/variants?kind=postType&name=post
 *   Returns `{ kind, name, variants: [null, "services", ...] }` —
 *   `null` represents the base view-config; remaining entries are
 *   the registered named variants.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_View_Config_REST {

	const REST_NAMESPACE = 'wp-admin-shell/v1';

	public static function register() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/view-config',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_view_config' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'kind'    => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Field_Collections', 'sanitize_segment' ),
						),
						'name'    => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Field_Collections', 'sanitize_segment' ),
						),
						'variant' => array(
							'type'              => 'string',
							'required'          => false,
							'sanitize_callback' => array( 'WP_Admin_Shell_Field_Collections', 'sanitize_variant' ),
						),
					),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/view-config/variants',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_variants' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'kind' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Field_Collections', 'sanitize_segment' ),
						),
						'name' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Field_Collections', 'sanitize_segment' ),
						),
					),
				),
			)
		);
	}

	/**
	 * Permission floor: must be logged in. Individual view-configs may
	 * carry their own capability requirements via the consuming app's
	 * `capabilities[]` floor — those gate the shell mount, not the
	 * REST read. Read-only access is information-only.
	 */
	public static function permission_check() {
		return is_user_logged_in();
	}

	public static function get_view_config( $request ) {
		$kind    = $request->get_param( 'kind' );
		$name    = $request->get_param( 'name' );
		$variant = $request->get_param( 'variant' );
		$variant = $variant === '' ? null : $variant;

		$doc = WP_Admin_Shell_View_Config::resolve( $kind, $name, $variant );

		$response = array(
			'kind'   => $kind,
			'name'   => $name,
			'config' => $doc,
		);
		if ( $variant !== null ) {
			$response['variant'] = $variant;
		}

		return rest_ensure_response( $response );
	}

	public static function get_variants( $request ) {
		$kind = $request->get_param( 'kind' );
		$name = $request->get_param( 'name' );

		$variants = WP_Admin_Shell_View_Config::variants_for( $kind, $name );

		return rest_ensure_response(
			array(
				'kind'     => $kind,
				'name'     => $name,
				'variants' => $variants,
			)
		);
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_View_Config_REST', 'register' ) );
