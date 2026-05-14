<?php
/**
 * Admin-routes registry — CIAB-compatible URL→app shim.
 *
 * Plugins call `wp_admin_shell_register_admin_route( $path, $args )`
 * (the mechanical `s/next_admin_/wp_admin_shell_/g` rename of CIAB's
 * `next_admin_register_admin_route()`) to declare URL routes at runtime.
 * The registry contributes them to the cascade through the synthetic
 * `plugin` origin so admin.json can still override per-path.
 *
 * The arg shape differs from CIAB. CIAB's positional
 * `( $path, $content_module, $route_module, $before_load, $static_data, $gc_time )`
 * collapses into the shell's `( $path, [ 'app' => …, 'config' => […], 'static_data' => […], 'gc_time' => … ] )`
 * — `app` is the shell-side replacement for `content_module`, `config`
 * carries route configuration, `static_data` is folded into `config` for
 * forward compatibility, and `gc_time` is accepted but ignored
 * (TanStack-specific cache GC, no shell equivalent — emits a one-time
 * `WP_DEBUG` notice).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Admin_Routes {

	/**
	 * Registry: path → resolved route doc (`app` + `config`).
	 *
	 * @var array<string, array>
	 */
	private static $registry = array();

	/**
	 * Per-path `gc_time → ignored` warn-once map.
	 *
	 * @var array<string, bool>
	 */
	private static $warned_gc_time = array();

	/**
	 * Mirrors `docs/schemas/admin-v2.json#/properties/routes` pattern.
	 */
	const PATH_PATTERN = '#^/[A-Za-z0-9_/{}\-*]*$#';

	/**
	 * Register an admin route.
	 *
	 * @param string $path Route path (`/posts`, `/posts/{id}`, `/media/*`).
	 * @param array  $args {
	 *     @type string     $app          App id to mount. Required.
	 *     @type array|null $config       Configuration passed to the app. Optional.
	 *     @type array|null $static_data  CIAB pass-through. Folded into `config`.
	 *     @type int|null   $gc_time      CIAB pass-through. Ignored, dev-warns.
	 * }
	 *
	 * @return string|WP_Error Path on success, WP_Error on failure.
	 */
	public static function register( $path, $args ) {
		if ( ! is_string( $path ) || $path === '' ) {
			return new WP_Error(
				'wp_admin_shell_admin_route_invalid_path',
				__( 'Admin route path must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( ! preg_match( self::PATH_PATTERN, $path ) ) {
			return new WP_Error(
				'wp_admin_shell_admin_route_invalid_path',
				/* translators: %s: route path */
				sprintf( __( 'Admin route path %s does not match the route pattern (leading slash, alnum/underscore/hyphen/curly-brace/asterisk segments).', 'wp-admin-shell' ), $path )
			);
		}
		if ( ! is_array( $args ) ) {
			return new WP_Error(
				'wp_admin_shell_admin_route_invalid_args',
				__( 'Admin route args must be an array.', 'wp-admin-shell' )
			);
		}
		if ( ! isset( $args['app'] ) || ! is_string( $args['app'] ) || $args['app'] === '' ) {
			return new WP_Error(
				'wp_admin_shell_admin_route_invalid_app',
				__( 'Admin route requires a non-empty "app" arg.', 'wp-admin-shell' )
			);
		}
		if ( isset( self::$registry[ $path ] ) ) {
			return new WP_Error(
				'wp_admin_shell_admin_route_duplicate_path',
				/* translators: %s: route path */
				sprintf( __( 'Admin route %s is already registered. Use a different path.', 'wp-admin-shell' ), $path )
			);
		}

		$route = array( 'app' => $args['app'] );

		$config = array();
		if ( isset( $args['config'] ) ) {
			if ( ! is_array( $args['config'] ) ) {
				return new WP_Error(
					'wp_admin_shell_admin_route_invalid_config',
					__( 'Admin route "config" must be an array when provided.', 'wp-admin-shell' )
				);
			}
			$config = $args['config'];
		}
		if ( isset( $args['static_data'] ) ) {
			if ( ! is_array( $args['static_data'] ) ) {
				return new WP_Error(
					'wp_admin_shell_admin_route_invalid_static_data',
					__( 'Admin route "static_data" must be an array when provided.', 'wp-admin-shell' )
				);
			}
			// CIAB pass-through. Fold into `config` so the admin-v2 schema
			// (which only allows `app` + `config` on a route) accepts it.
			// `config` wins on collision — explicit overrides preloaded
			// route state, matching CIAB's static_data-as-base convention.
			$config = array_merge( $args['static_data'], $config );
		}
		if ( ! empty( $config ) ) {
			$route['config'] = $config;
		}

		if ( array_key_exists( 'gc_time', $args ) && $args['gc_time'] !== null ) {
			self::warn_gc_time( $path );
		}

		self::$registry[ $path ] = $route;
		return $path;
	}

	/**
	 * Read the full registry.
	 *
	 * @return array<string, array>
	 */
	public static function all() {
		return self::$registry;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$registry       = array();
		self::$warned_gc_time = array();
	}

	/**
	 * Cascade contribution — registered routes enter through the
	 * `plugin` origin. admin.json declarations win on per-path collision.
	 *
	 * @param array $doc Plugin-origin admin.json doc.
	 * @return array
	 */
	public static function contribute( $doc ) {
		if ( empty( self::$registry ) ) {
			return $doc;
		}
		if ( ! isset( $doc['routes'] ) || ! is_array( $doc['routes'] ) ) {
			$doc['routes'] = array();
		}
		foreach ( self::$registry as $path => $route ) {
			if ( ! isset( $doc['routes'][ $path ] ) ) {
				$doc['routes'][ $path ] = $route;
			}
		}
		return $doc;
	}

	private static function warn_gc_time( $path ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		if ( ! empty( self::$warned_gc_time[ $path ] ) ) {
			return;
		}
		self::$warned_gc_time[ $path ] = true;
		$message = sprintf(
			/* translators: %s: route path */
			__( 'Admin route %s declared "gc_time". The shell does not implement TanStack Router cache GC; the value is accepted and ignored.', 'wp-admin-shell' ),
			$path
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

add_filter( 'wp_admin_shell_data_plugin', array( 'WP_Admin_Shell_Admin_Routes', 'contribute' ), 5 );

// Registry state lives in static class memory — invisible to the
// default cache-signal map. Hook into the cache layer's filter so a
// route registration delta forces a fresh resolver run cross-request.
add_filter( 'wp_admin_shell_cache_signals', function ( $signals ) {
	$registry = WP_Admin_Shell_Admin_Routes::all();
	if ( ! empty( $registry ) ) {
		$signals['admin_routes'] = md5( wp_json_encode( $registry ) );
	}
	return $signals;
} );
