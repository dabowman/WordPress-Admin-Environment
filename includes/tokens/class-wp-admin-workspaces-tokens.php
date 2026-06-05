<?php
/**
 * tokens.json discovery + merge (V2.M5 task 2).
 *
 * DTCG (W3C 2025.10) primitives layer for the design system. Loads
 * tokens from four origins and deep-merges them lowest-priority-first,
 * then ships the merged tree to the runtime alongside the resolved
 * workspace.json. `resolve()` builds the `$origins` array in priority
 * order HIGH → LOW for readability, but the merge loop walks it so each
 * later origin wins; the net effective precedence is:
 *
 *   1. Site origin    — `wp_admin_workspaces_site_tokens` option (highest)
 *   2. Theme origin   — `<stylesheet>/tokens.json`
 *   3. Plugin origin  — `wp_admin_workspaces_plugin_tokens` filter (extension point)
 *   4. Core baseline  — `core.tokens.json` shipped with this plugin (lowest)
 *
 * Merge semantics match the workspace.json cascade (`WP_Admin_Workspaces_Merge`):
 * scalar replace, object deep-merge. The DTCG `$value` / `$type`
 * structure fits naturally — group `$type` declarations cascade into
 * descendants client-side via the JS resolver
 * (`src/runtime/tokens/tokensResolver.mjs`).
 *
 * Cascade-ORDER deviation from the workspace.json cascade (documented in
 * spec §9.1): the workspace.json cascade is
 * `core → engine → plugin → site → role → user`, whereas tokens is
 * `core → plugin → theme → site`. Two intentional differences:
 *
 *   - Tokens inserts a `theme` origin between `plugin` and `site`. Tokens
 *     are a design-system primitive that the active block theme legitimately
 *     owns (a theme's `tokens.json` rebrands the admin to match the front
 *     end), so the theme sits above the plugin baseline but below explicit
 *     site choices. The workspace.json cascade has no theme origin because
 *     workspace *structure* (screens / menu / permissions) is not the
 *     theme's concern.
 *   - Tokens drop the `engine`, `role`, and `user` origins. Tokens are pure
 *     visual primitives with no security surface and no per-role/per-user
 *     authoring path today; there is nothing to gate or personalize at those
 *     tiers. They can be added later without breaking the lower origins.
 *
 * No tombstones — tokens are additive, not restrict-only (a higher origin
 * overrides a value but cannot delete a key the baseline ships).
 *
 * Authoring belongs in `tokens.json`; this class never coerces values.
 * Type coercion is the JS resolver's job because that's where the CSS
 * strings get emitted.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Tokens {

	const SITE_OPTION = 'wp_admin_workspaces_site_tokens';

	const CACHE_GROUP = 'wp_admin_workspaces_tokens';
	const CACHE_KEY   = 'merged';

	/**
	 * Resolve and return the merged DTCG tokens tree.
	 *
	 * @return array Empty array if no origin contributed tokens.
	 */
	public static function resolve() {
		$cached = wp_cache_get( self::CACHE_KEY, self::CACHE_GROUP );
		if ( false !== $cached && is_array( $cached ) ) {
			return $cached;
		}

		$origins = array(
			self::load_core(),
			self::load_plugin(),
			self::load_theme(),
			self::load_site(),
		);

		$merged = array();
		foreach ( $origins as $origin ) {
			if ( is_array( $origin ) && ! empty( $origin ) ) {
				$merged = self::deep_merge( $merged, $origin );
			}
		}

		/**
		 * Filter the fully merged DTCG tokens tree before it is cached and
		 * shipped to the runtime.
		 *
		 * Symmetric with the `wp_admin_workspaces_data` final filter on the
		 * workspace.json cascade: `wp_admin_workspaces_plugin_tokens` is the
		 * per-origin loader hook (one origin), while this fires once on the
		 * resolved result. Use it to inject computed values or strip private
		 * token namespaces. The returned value is cached, so the filter runs
		 * once per cache lifetime, not per page load.
		 *
		 * @param array $merged The merged tokens tree (empty array if no
		 *                      origin contributed). Return an array.
		 */
		$merged = apply_filters( 'wp_admin_workspaces_tokens', $merged );
		if ( ! is_array( $merged ) ) {
			$merged = array();
		}

		wp_cache_set( self::CACHE_KEY, $merged, self::CACHE_GROUP );
		return $merged;
	}

	/**
	 * Drop the cached merge. Call from cache-flush + token-write paths.
	 */
	public static function flush() {
		wp_cache_delete( self::CACHE_KEY, self::CACHE_GROUP );
	}

	/* ───────────── origin loaders ───────────── */

	private static function load_core() {
		$path = WP_ADMIN_WORKSPACES_PATH . 'core.tokens.json';
		return self::read_json_file( $path );
	}

	private static function load_plugin() {
		$tokens = apply_filters( 'wp_admin_workspaces_plugin_tokens', array() );
		return is_array( $tokens ) ? $tokens : array();
	}

	private static function load_theme() {
		$dir = function_exists( 'get_stylesheet_directory' )
			? get_stylesheet_directory()
			: '';
		if ( ! $dir ) {
			return array();
		}
		return self::read_json_file( $dir . '/tokens.json' );
	}

	private static function load_site() {
		$value = get_option( self::SITE_OPTION, array() );
		return is_array( $value ) ? $value : array();
	}

	/* ───────────── helpers ───────────── */

	private static function read_json_file( $path ) {
		if ( ! file_exists( $path ) || ! is_readable( $path ) ) {
			return array();
		}
		$raw = file_get_contents( $path );
		if ( false === $raw ) {
			return array();
		}
		$decoded = json_decode( $raw, true );
		return is_array( $decoded ) ? $decoded : array();
	}

	/**
	 * Deep merge: associative arrays merge recursively; sequential
	 * arrays + scalars replace. Mirrors the workspace.json cascade's plain
	 * merge (no tombstones — tokens are additive, not restrict-only).
	 */
	private static function deep_merge( $base, $override ) {
		foreach ( $override as $key => $value ) {
			if (
				isset( $base[ $key ] )
				&& is_array( $base[ $key ] )
				&& is_array( $value )
				&& WP_Admin_Workspaces_Util::is_assoc( $base[ $key ] )
				&& WP_Admin_Workspaces_Util::is_assoc( $value )
			) {
				$base[ $key ] = self::deep_merge( $base[ $key ], $value );
			} else {
				$base[ $key ] = $value;
			}
		}
		return $base;
	}

}

// Defensive cache invalidation. Mirrors WP_Admin_Workspaces_Cache hook list:
// origin-changing writes (site option, theme switch, plugin
// activation/deactivation) drop the merged-tokens cache so the next
// resolve() picks up the new origin contents.
add_action( 'update_option_' . WP_Admin_Workspaces_Tokens::SITE_OPTION, array( 'WP_Admin_Workspaces_Tokens', 'flush' ) );
add_action( 'add_option_' . WP_Admin_Workspaces_Tokens::SITE_OPTION,    array( 'WP_Admin_Workspaces_Tokens', 'flush' ) );
add_action( 'delete_option_' . WP_Admin_Workspaces_Tokens::SITE_OPTION, array( 'WP_Admin_Workspaces_Tokens', 'flush' ) );
add_action( 'switch_theme',                                        array( 'WP_Admin_Workspaces_Tokens', 'flush' ) );
add_action( 'activated_plugin',                                    array( 'WP_Admin_Workspaces_Tokens', 'flush' ) );
add_action( 'deactivated_plugin',                                  array( 'WP_Admin_Workspaces_Tokens', 'flush' ) );
