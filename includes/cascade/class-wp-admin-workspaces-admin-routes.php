<?php
/**
 * Admin-routes registry — programmatic URL→app registration.
 *
 * Plugins call `wp_admin_workspaces_register_admin_route( $path, $args )` to
 * declare URL routes at runtime. The registry contributes them to the
 * cascade through the synthetic `plugin` origin so admin.json can still
 * override per-path.
 *
 * Args: `( $path, [ 'app' => …, 'config' => […], 'static_data' => […],
 * 'gc_time' => … ] )` — `app` names the app to mount, `config` carries
 * route configuration, `static_data` is folded into `config` for forward
 * compatibility, and `gc_time` is accepted but ignored (no shell
 * equivalent — emits a one-time `WP_DEBUG` notice).
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Admin_Routes {

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
	 *     @type array|null $static_data  Folded into `config`.
	 *     @type int|null   $gc_time      Accepted but ignored; dev-warns.
	 * }
	 *
	 * @return string|WP_Error Path on success, WP_Error on failure.
	 */
	public static function register( $path, $args ) {
		if ( ! is_string( $path ) || $path === '' ) {
			return new WP_Error(
				'wp_admin_workspaces_admin_route_invalid_path',
				__( 'Admin route path must be a non-empty string.', 'wp-admin-workspaces' )
			);
		}
		if ( ! preg_match( self::PATH_PATTERN, $path ) ) {
			return new WP_Error(
				'wp_admin_workspaces_admin_route_invalid_path',
				/* translators: %s: route path */
				sprintf( __( 'Admin route path %s does not match the route pattern (leading slash, alnum/underscore/hyphen/curly-brace/asterisk segments).', 'wp-admin-workspaces' ), $path )
			);
		}
		if ( ! is_array( $args ) ) {
			return new WP_Error(
				'wp_admin_workspaces_admin_route_invalid_args',
				__( 'Admin route args must be an array.', 'wp-admin-workspaces' )
			);
		}
		if ( ! isset( $args['app'] ) || ! is_string( $args['app'] ) || $args['app'] === '' ) {
			return new WP_Error(
				'wp_admin_workspaces_admin_route_invalid_app',
				__( 'Admin route requires a non-empty "app" arg.', 'wp-admin-workspaces' )
			);
		}
		if ( isset( self::$registry[ $path ] ) ) {
			return new WP_Error(
				'wp_admin_workspaces_admin_route_duplicate_path',
				/* translators: %s: route path */
				sprintf( __( 'Admin route %s is already registered. Use a different path.', 'wp-admin-workspaces' ), $path )
			);
		}

		$route = array( 'app' => $args['app'] );

		$config = array();
		if ( isset( $args['config'] ) ) {
			if ( ! is_array( $args['config'] ) ) {
				return new WP_Error(
					'wp_admin_workspaces_admin_route_invalid_config',
					__( 'Admin route "config" must be an array when provided.', 'wp-admin-workspaces' )
				);
			}
			$config = $args['config'];
		}
		if ( isset( $args['static_data'] ) ) {
			if ( ! is_array( $args['static_data'] ) ) {
				return new WP_Error(
					'wp_admin_workspaces_admin_route_invalid_static_data',
					__( 'Admin route "static_data" must be an array when provided.', 'wp-admin-workspaces' )
				);
			}
			// Fold `static_data` into `config` so the route schema (which
			// only allows `app` + `config`) accepts it. `config` wins on
			// collision — explicit overrides the preloaded route state.
			$config = array_merge( $args['static_data'], $config );
		}
		if ( ! empty( $config ) ) {
			$route['config'] = $config;
		}

		// Legacy classic-URL mapping (W4/W5). `legacy_path` names the
		// classic admin script (`edit.php`), `legacy_query` the query
		// equalities that must match (`[ 'post_type' => 'page' ]`), and
		// `legacy_params` maps route tokens to query keys
		// (`[ 'id' => 'post' ]` → `{id}` ← `?post=`). Used both to
		// intercept workspace→classic clicks and to redirect classic→
		// workspace navigations.
		if ( isset( $args['legacy_path'] ) && is_string( $args['legacy_path'] ) && $args['legacy_path'] !== '' ) {
			$route['legacy_path'] = $args['legacy_path'];
		}
		if ( isset( $args['legacy_query'] ) && is_array( $args['legacy_query'] ) ) {
			$route['legacy_query'] = $args['legacy_query'];
		}
		if ( isset( $args['legacy_params'] ) && is_array( $args['legacy_params'] ) ) {
			$route['legacy_params'] = $args['legacy_params'];
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
	 * Build the classic→workspace legacy-route map from a resolved config.
	 *
	 * Walks resolved `screens` (each screen may declare `legacy_path` +
	 * optional `legacy_query` / `legacy_params`) and the programmatic
	 * registry, keyed by the workspace route path. Shared by the JS admin-
	 * link interceptor (W4, emitted as `window.wpAdminWorkspaces.adminRoutes`)
	 * and the classic→workspace redirect (W5).
	 *
	 * Keyed by workspace route path; a programmatic route sharing a path
	 * with a screen overwrites the screen entry (last-write-wins). When two
	 * entries share a `legacy_path` with equal-or-zero `legacy_query`
	 * specificity, `match_legacy_hash` / `matchLegacyRoute` break the tie by
	 * map iteration order (first wins on equal score).
	 *
	 * @param array $config Resolved admin.json doc.
	 * @return array<string, array{legacy_path:string,legacy_query?:array,legacy_params?:array}>
	 */
	public static function legacy_map( $config ) {
		$map = array();

		if ( isset( $config['screens'] ) && is_array( $config['screens'] ) ) {
			foreach ( $config['screens'] as $screen ) {
				if ( ! is_array( $screen ) || empty( $screen['legacy_path'] ) || empty( $screen['path'] ) ) {
					continue;
				}
				$map[ (string) $screen['path'] ] = self::legacy_entry( $screen );
			}
		}

		foreach ( self::$registry as $path => $route ) {
			if ( ! empty( $route['legacy_path'] ) ) {
				$map[ $path ] = self::legacy_entry( $route );
			}
		}

		return $map;
	}

	/**
	 * Normalize a screen/route into a legacy-map entry.
	 *
	 * @param array $src Screen or route doc carrying `legacy_*` keys.
	 * @return array
	 */
	private static function legacy_entry( $src ) {
		$entry = array( 'legacy_path' => (string) $src['legacy_path'] );
		if ( ! empty( $src['legacy_query'] ) && is_array( $src['legacy_query'] ) ) {
			$entry['legacy_query'] = $src['legacy_query'];
		}
		if ( ! empty( $src['legacy_params'] ) && is_array( $src['legacy_params'] ) ) {
			$entry['legacy_params'] = $src['legacy_params'];
		}
		return $entry;
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
			__( 'Admin route %s declared "gc_time". The shell does not implement TanStack Router cache GC; the value is accepted and ignored.', 'wp-admin-workspaces' ),
			$path
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

add_filter( 'wp_admin_workspaces_data_plugin', array( 'WP_Admin_Workspaces_Admin_Routes', 'contribute' ), 5 );

// Registry state lives in static class memory — invisible to the
// default cache-signal map. Hook into the cache layer's filter so a
// route registration delta forces a fresh resolver run cross-request.
add_filter( 'wp_admin_workspaces_cache_signals', function ( $signals ) {
	$registry = WP_Admin_Workspaces_Admin_Routes::all();
	if ( ! empty( $registry ) ) {
		$signals['admin_routes'] = md5( wp_json_encode( $registry ) );
	}
	return $signals;
} );
