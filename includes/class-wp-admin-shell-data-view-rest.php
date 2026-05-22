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
 * Permission floor:
 *   - Screen-keyed requests (`?screen=<id>`) gate against the screen's
 *     resolved `permissions` block via WP_Admin_Shell_Permissions. 401
 *     for logged-out, 404 for unknown screen, 403 for known-but-denied.
 *   - Triple-keyed requests (`?kind=X&name=Y&variant=Z`) keep the
 *     `is_user_logged_in()` floor — triples aren't screen-scoped, no
 *     cap floor to gate against.
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
	 * Permission gate.
	 *
	 * Logged-out → 401 floor. For screen-keyed requests, additionally
	 * resolve the requested screen's `permissions` block + `appFloor` and
	 * route through `WP_Admin_Shell_Permissions::user_passes()` — 404 on
	 * unknown screen id, 403 on known-but-denied. Triple-keyed requests
	 * (kind/name/variant without a screen) keep the logged-in floor only
	 * — they aren't screen-scoped, and the underlying registry entries
	 * don't carry per-screen cap declarations.
	 *
	 * @param WP_REST_Request $request
	 * @return bool|WP_Error
	 */
	public static function permission_check( $request ) {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_not_logged_in',
				__( 'You must be logged in to access this endpoint.', 'wp-admin-shell' ),
				array( 'status' => 401 )
			);
		}

		$screen = $request instanceof WP_REST_Request ? (string) $request->get_param( 'screen' ) : '';
		if ( $screen === '' ) {
			return true;
		}

		$config  = wp_admin_shell_get_active_config();
		$screens = isset( $config['screens'] ) && is_array( $config['screens'] ) ? $config['screens'] : array();
		if ( ! isset( $screens[ $screen ] ) || ! is_array( $screens[ $screen ] ) ) {
			return new WP_Error(
				'wp_admin_shell_data_view_unknown_screen',
				__( 'Unknown screen id.', 'wp-admin-shell' ),
				array( 'status' => 404 )
			);
		}
		$screen_entry = $screens[ $screen ];
		$perms        = $screen_entry['permissions'] ?? null;
		$app_floor    = WP_Admin_Shell_Permissions::app_floor_for( $screen_entry );
		$resolved     = WP_Admin_Shell_Permissions::resolve( $perms, $app_floor );

		if ( ! WP_Admin_Shell_Permissions::user_passes( get_current_user_id(), $resolved ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You are not allowed to read this screen view.', 'wp-admin-shell' ),
				array( 'status' => 403 )
			);
		}
		return true;
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
	 * Triple-identity surfacing for screen responses. Delegates to the
	 * resolver's `infer_kind_name_variant` so all three priority layers
	 * stay in sync — `dataViewRef`, explicit `dataViewKind/Name/Variant`,
	 * and manifest inference (`screen.app` → manifest `dataView` +
	 * `screen.config.{postType,taxonomy,variant}` overrides).
	 *
	 * Empty strings for kind/name when nothing resolves so the client
	 * can detect a screen with no registry binding.
	 *
	 * @param array|null $screen Resolved screen entry.
	 * @return array{ kind:string, name:string, variant:string }
	 */
	private static function screen_identity( $screen ) {
		if ( ! is_array( $screen ) ) {
			return array( 'kind' => '', 'name' => '', 'variant' => '_default' );
		}
		list( $kind, $name, $variant ) = WP_Admin_Shell_Data_View_Config::infer_kind_name_variant( $screen );
		return array(
			'kind'    => (string) $kind,
			'name'    => (string) $name,
			'variant' => $variant !== '' ? (string) $variant : '_default',
		);
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Data_View_REST', 'register' ) );
