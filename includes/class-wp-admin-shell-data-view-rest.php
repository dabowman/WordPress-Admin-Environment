<?php
/**
 * /wp-admin-shell/v1/data-view — resolved DataView config (3-axis registry + screen overlay).
 *
 * v3 restoration replacement for the post-3b `/screen-view` single
 * endpoint. Three routes:
 *
 *   GET /data-view?screen=<id>
 *       Resolve via `resolve_screen_data_view($id)`. Returns the
 *       resolved doc + the triple identity (`kind`, `name`, `variant`)
 *       the resolver inferred so client-side code can cross-reference
 *       the registry.
 *
 *   GET /data-view?kind=<X>&name=<Y>[&variant=<Z>]
 *       Direct triple lookup via `resolve_data_view_triple()`. Variant
 *       defaults to `_default`. Useful for command-palettes, sidebar
 *       generators, or any UI enumerating registry entries directly
 *       without going through a screen.
 *
 *   GET /data-view/variants?kind=<X>&name=<Y>
 *       Variant discovery — returns the list of registered variant ids
 *       under `(kind, name)`. Reads `settings.dataViews[kind][name]`
 *       keys after baselines have been injected.
 *
 * Plus a deprecation alias kept one release cycle:
 *
 *   GET /screen-view?screen=<id>
 *       Maps to `/data-view?screen=<id>` semantics. Attaches an
 *       `X-WP-Deprecated` header on the response. Removed in v3.1.
 *
 * Permission floor: `is_user_logged_in()`. Screen-level capability
 * gating happens elsewhere; reading the resolved config doc itself is
 * information-only.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Data_View_REST {

	const REST_NAMESPACE = 'wp-admin-shell/v1';

	/**
	 * Register all four routes.
	 */
	public static function register() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/data-view',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_data_view' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'screen'  => array(
							'type'              => 'string',
							'required'          => false,
							'sanitize_callback' => 'sanitize_key',
						),
						'kind'    => array(
							'type'              => 'string',
							'required'          => false,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_Field_Collections', 'sanitize_segment' ),
						),
						'name'    => array(
							'type'              => 'string',
							'required'          => false,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_Field_Collections', 'sanitize_segment' ),
						),
						'variant' => array(
							'type'              => 'string',
							'required'          => false,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_View_Config', 'sanitize_variant_segment' ),
						),
					),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/data-view/variants',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_variants' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'kind' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_Field_Collections', 'sanitize_segment' ),
						),
						'name' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_Field_Collections', 'sanitize_segment' ),
						),
					),
				),
			)
		);

		// Deprecation alias — one release cycle.
		register_rest_route(
			self::REST_NAMESPACE,
			'/screen-view',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_screen_view_deprecated' ),
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
	 * Permission floor: must be logged in.
	 */
	public static function permission_check() {
		return is_user_logged_in();
	}

	/**
	 * GET /data-view dispatcher. Routes between screen lookup and
	 * triple lookup based on which params are present. Rejects requests
	 * carrying neither or both with HTTP 400.
	 */
	public static function get_data_view( $request ) {
		$screen = (string) $request->get_param( 'screen' );
		$kind   = (string) $request->get_param( 'kind' );
		$name   = (string) $request->get_param( 'name' );

		$has_screen = $screen !== '';
		$has_triple = $kind !== '' && $name !== '';

		if ( $has_screen && $has_triple ) {
			return new WP_Error(
				'wp_admin_shell_data_view_ambiguous_query',
				__( 'Pass either `screen` OR `kind`+`name`, not both.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}
		if ( ! $has_screen && ! $has_triple ) {
			return new WP_Error(
				'wp_admin_shell_data_view_missing_query',
				__( 'Pass `screen=<id>` for per-screen resolution or `kind=<X>&name=<Y>[&variant=<Z>]` for direct triple lookup.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}

		if ( $has_screen ) {
			$config = wp_admin_shell_get_active_config();
			$doc    = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( $screen, $config );

			// Surface the resolved identity for client-side cross-ref.
			$screen_entry = isset( $config['screens'][ $screen ] ) && is_array( $config['screens'][ $screen ] )
				? $config['screens'][ $screen ]
				: null;
			$identity = self::screen_identity( $screen_entry );

			return rest_ensure_response( array(
				'screen'  => $screen,
				'kind'    => $identity['kind'],
				'name'    => $identity['name'],
				'variant' => $identity['variant'],
				'view'    => $doc,
			) );
		}

		// Triple lookup.
		$variant = (string) $request->get_param( 'variant' );
		if ( $variant === '' ) {
			$variant = '_default';
		}
		$doc = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( $kind, $name, $variant );

		return rest_ensure_response( array(
			'kind'    => $kind,
			'name'    => $name,
			'variant' => $variant,
			'view'    => $doc,
		) );
	}

	/**
	 * GET /data-view/variants — enumerate registered variants for `(kind, name)`.
	 */
	public static function get_variants( $request ) {
		$kind = (string) $request->get_param( 'kind' );
		$name = (string) $request->get_param( 'name' );

		if ( $kind === '' || $name === '' ) {
			return new WP_Error(
				'wp_admin_shell_data_view_variants_invalid_segment',
				__( 'kind and name must contain at least one [A-Za-z0-9_-] character after sanitization.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}

		$variants = WP_Admin_Shell_Data_View_Config::list_variants( $kind, $name );

		return rest_ensure_response( array(
			'kind'     => $kind,
			'name'     => $name,
			'variants' => $variants,
		) );
	}

	/**
	 * GET /screen-view — deprecation alias for `/data-view?screen=<id>`.
	 * Adds an `X-WP-Deprecated` header on the response.
	 */
	public static function get_screen_view_deprecated( $request ) {
		$screen = $request->get_param( 'screen' );

		if ( ! is_string( $screen ) || $screen === '' ) {
			return new WP_Error(
				'wp_admin_shell_screen_view_invalid_id',
				__( 'screen must be a non-empty kebab-case identifier.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}

		$config       = wp_admin_shell_get_active_config();
		$doc          = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( $screen, $config );
		$screen_entry = isset( $config['screens'][ $screen ] ) && is_array( $config['screens'][ $screen ] )
			? $config['screens'][ $screen ]
			: null;
		$identity     = self::screen_identity( $screen_entry );

		$response = rest_ensure_response( array(
			'screen'  => $screen,
			'kind'    => $identity['kind'],
			'name'    => $identity['name'],
			'variant' => $identity['variant'],
			'view'    => $doc,
		) );

		if ( $response instanceof WP_REST_Response ) {
			$response->header(
				'X-WP-Deprecated',
				'GET /wp-admin-shell/v1/screen-view is deprecated; use GET /wp-admin-shell/v1/data-view?screen=<id>. Removed in v3.1.'
			);
		}

		return $response;
	}

	/**
	 * Best-effort triple-identity surfacing for screen responses.
	 * Re-uses the resolver's identity logic by walking the same priority
	 * order; returns empty strings when nothing resolves so the client
	 * can detect a screen with no registry binding.
	 *
	 * @param array|null $screen Resolved screen entry.
	 * @return array{ kind:string, name:string, variant:string }
	 */
	private static function screen_identity( $screen ) {
		$default = array( 'kind' => '', 'name' => '', 'variant' => '_default' );
		if ( ! is_array( $screen ) ) {
			return $default;
		}

		if ( isset( $screen['dataViewRef'] ) && is_string( $screen['dataViewRef'] ) && $screen['dataViewRef'] !== '' ) {
			$parsed = WP_Admin_Shell_Data_View_Config::parse_data_view_ref( $screen['dataViewRef'] );
			if ( $parsed !== null ) {
				return array(
					'kind'    => $parsed[0],
					'name'    => $parsed[1],
					'variant' => $parsed[2],
				);
			}
		}

		if (
			isset( $screen['dataViewKind'] ) && is_string( $screen['dataViewKind'] ) &&
			isset( $screen['dataViewName'] ) && is_string( $screen['dataViewName'] )
		) {
			$variant = isset( $screen['dataViewVariant'] ) && is_string( $screen['dataViewVariant'] ) && $screen['dataViewVariant'] !== ''
				? $screen['dataViewVariant']
				: '_default';
			return array(
				'kind'    => WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $screen['dataViewKind'] ),
				'name'    => WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $screen['dataViewName'] ),
				'variant' => WP_Admin_Shell_Data_View_Config::sanitize_variant_segment( $variant ),
			);
		}

		return $default;
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Data_View_REST', 'register' ) );
