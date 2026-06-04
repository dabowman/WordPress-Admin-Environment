<?php
/**
 * REST preload — collects `preload[]` declarations from every cascade
 * origin, dedupes by `path+method`, hydrates them through
 * `rest_preload_api_request`, and ships the resulting cache as inline
 * script attached to the `wp-api-fetch` handle.
 *
 * Spec §13 #9. Schema: `docs/schemas/admin-v2.json#preload` +
 * `#/$defs/preloadEntry`.
 *
 * Cascade semantics differ from the rest of admin.json: the resolved
 * preload list is the *concatenation* of every origin's `preload[]`,
 * not a replacement. Site/role/user authors append their own paths;
 * the plugin/site/role/user precedence ladder doesn't apply here
 * because preload entries carry no user-meaningful identity (they're
 * inert cache primers — extra entries cost a server round-trip but
 * never change behavior). Duplicates by exact `path+method` are
 * dropped before serialization so a site author repeating a path the
 * plugin shell already declared doesn't double-fetch.
 *
 * Per-origin contribution rides the existing
 * `wp_admin_workspaces_data_{origin}` filters — no new filter added.
 *
 * Filter idempotence requirement.
 * The collector calls `wp_admin_workspaces_data_{origin}` against each raw
 * origin doc independently of `WP_Admin_Workspaces_Resolver::resolve_with`
 * (which also runs them). Two passes per render. Pure-functional
 * filters: harmless. Side-effecting filters (logging, registry
 * mutation, REST registration): fire twice. **Per-origin filter
 * callbacks MUST be idempotent.** If a callback's side effect would
 * be wrong to repeat, gate it with a static or hook a different
 * filter that runs once (e.g. `wp_admin_workspaces_data` post-merge).
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Preload {

	/** Verbs `rest_preload_api_request` actually dispatches. */
	const ALLOWED_METHODS = array( 'GET', 'OPTIONS' );

	/**
	 * Collect the deduped preload list from a pre-loaded origin map.
	 *
	 * Each origin's `preload[]` runs through
	 * `wp_admin_workspaces_data_{origin}` first — same filter the resolver
	 * uses — so plugin authors hooking those filters see their entries
	 * applied without writing a separate hook. The resolved list
	 * concatenates origins in cascade order (core → engine → plugin →
	 * site → role → user) and dedupes on `path|method`.
	 *
	 * Malformed entries (non-string, non-2-tuple, unknown verb, empty
	 * path) are skipped silently — schema validation catches the same
	 * cases at authoring time, so runtime warnings would be redundant
	 * noise. A single bad entry never poisons the whole list.
	 *
	 * @param array $origins Origin map: `[ 'core' => array, 'engine' => array, ... ]`.
	 * @return array<int, array{0:string,1:string}> List of `[ path, method ]` tuples.
	 */
	public static function collect_from_origins( $origins ) {
		$out  = array();
		$seen = array();

		foreach ( WP_Admin_Workspaces_Resolver::ORIGINS_ORDER as $origin ) {
			$doc = $origins[ $origin ] ?? null;
			if ( ! is_array( $doc ) ) {
				continue;
			}
			$doc      = apply_filters( "wp_admin_workspaces_data_{$origin}", $doc );
			$entries  = $doc['preload'] ?? null;
			if ( ! is_array( $entries ) ) {
				continue;
			}
			foreach ( $entries as $entry ) {
				$normalized = self::normalize_entry( $entry );
				if ( $normalized === null ) {
					continue;
				}
				$key = $normalized[0] . '|' . $normalized[1];
				if ( isset( $seen[ $key ] ) ) {
					continue;
				}
				$seen[ $key ] = true;
				$out[]        = $normalized;
			}
		}

		return $out;
	}

	/**
	 * Convenience: load origins via the resolver and return the deduped
	 * preload list. Use this on the enqueue path; tests call
	 * `collect_from_origins` directly with hand-rolled origin maps.
	 *
	 * @param array $context Same shape as `WP_Admin_Workspaces_Resolver::resolve`.
	 * @return array<int, array{0:string,1:string}>
	 */
	public static function collect( $context = array() ) {
		$origins = WP_Admin_Workspaces_Resolver::load_origins( $context );
		return self::collect_from_origins( $origins );
	}

	/**
	 * Hydrate the preload list into a `path => response` cache and
	 * attach it as inline script on the `wp-api-fetch` handle. No-op
	 * when the resolved list is empty or `wp-api-fetch` isn't
	 * registered (some test contexts skip the @wordpress/scripts
	 * registration).
	 *
	 * Each `rest_preload_api_request` call is wrapped in a try/catch
	 * (PHP 7+ `Throwable`) so a single failing entry — bad capability,
	 * unregistered route, server-side fatal — doesn't break the entire
	 * preload bundle. The successful entries still land in the cache;
	 * the failures simply round-trip from the client on first read.
	 *
	 * @param array $context Forwarded to `WP_Admin_Workspaces_Resolver::load_origins`.
	 */
	public static function inject( $context = array() ) {
		if ( ! function_exists( 'rest_preload_api_request' ) ) {
			return;
		}
		if ( ! wp_script_is( 'wp-api-fetch', 'registered' ) && ! wp_script_is( 'wp-api-fetch', 'enqueued' ) ) {
			return;
		}

		$entries = self::collect( $context );
		if ( empty( $entries ) ) {
			return;
		}

		$cache = self::hydrate( $entries );
		if ( empty( $cache ) ) {
			return;
		}

		wp_add_inline_script(
			'wp-api-fetch',
			sprintf(
				'wp.apiFetch.use( wp.apiFetch.createPreloadingMiddleware( %s ) );',
				wp_json_encode( $cache, JSON_HEX_TAG | JSON_UNESCAPED_SLASHES )
			),
			'after'
		);
	}

	/**
	 * Run the deduped list through `rest_preload_api_request`. GET
	 * paths use the path as the cache key; OPTIONS responses are
	 * keyed by the path under an `OPTIONS` sub-key, matching what
	 * `createPreloadingMiddleware` consumes (mirrors core's
	 * gutenberg + edit-site preload shape).
	 *
	 * @param array<int, array{0:string,1:string}> $entries
	 * @return array
	 */
	public static function hydrate( $entries ) {
		$cache = array();
		foreach ( $entries as $entry ) {
			list( $path, $method ) = $entry;
			try {
				if ( $method === 'OPTIONS' ) {
					// `rest_preload_api_request` accepts the OPTIONS form
					// when the path arrives as a `[ path, 'OPTIONS' ]`
					// tuple — same shape as the input slot.
					$cache = rest_preload_api_request( $cache, array( $path, 'OPTIONS' ) );
				} else {
					$cache = rest_preload_api_request( $cache, $path );
				}
			} catch ( Throwable $e ) {
				if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					/* translators: 1: preload path, 2: error message */
					$msg = sprintf(
						__( 'WP Admin Shell preload skipped %1$s: %2$s', 'wp-admin-workspaces' ),
						$path,
						$e->getMessage()
					);
					trigger_error( esc_html( $msg ), E_USER_NOTICE );
				}
			}
		}
		return $cache;
	}

	/**
	 * Coerce a raw entry into a `[ path, method ]` tuple. Returns null
	 * on anything malformed.
	 *
	 * @param mixed $entry
	 * @return array{0:string,1:string}|null
	 */
	public static function normalize_entry( $entry ) {
		if ( is_string( $entry ) ) {
			$path = trim( $entry );
			if ( $path === '' || $path[0] !== '/' ) {
				return null;
			}
			return array( $path, 'GET' );
		}
		if ( is_array( $entry ) && count( $entry ) === 2 ) {
			$path   = $entry[0] ?? null;
			$method = $entry[1] ?? null;
			if ( ! is_string( $path ) || $path === '' || $path[0] !== '/' ) {
				return null;
			}
			if ( ! is_string( $method ) ) {
				return null;
			}
			$method = strtoupper( $method );
			if ( ! in_array( $method, self::ALLOWED_METHODS, true ) ) {
				return null;
			}
			return array( $path, $method );
		}
		return null;
	}
}
