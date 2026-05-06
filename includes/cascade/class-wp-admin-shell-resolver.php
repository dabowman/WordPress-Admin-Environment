<?php
/**
 * Cascade resolver — merges the five origins into a single config tree.
 *
 * Origins (highest → lowest precedence):
 *   user   — wp_admin_shell_user_prefs (current user only)
 *   role   — wp_admin_shell_role_config[<role>]
 *   site   — wp_admin_shell_site_config option
 *   plugin — files in shells/ (or programmatic registration; the active
 *            shell that the user / role / site selected)
 *   core   — empty baseline (and v0→v1 normalization)
 *
 * Each origin is loaded into a normalized doc, optionally filtered with
 * `wp_admin_shell_data_{origin}`, run through `customizable` filtering
 * against the upstream merged tree, and merged with restrict-only
 * semantics. After all origins fold in, `wp_admin_shell_data` runs as
 * the final filter.
 *
 * Cache + filter timing.
 * The resolver memoizes through WP_Admin_Shell_Cache (object cache +
 * transient). On a cache hit, origin loaders AND filters are skipped —
 * the merged tree returns directly. This matches `WP_Theme_JSON_Resolver`
 * behavior. Implications for plugin authors:
 *
 *   - `wp_admin_shell_data_*` filter changes do not take effect until
 *     the next natural cache invalidation (option/meta write,
 *     plugin/theme activation, role change) or a manual flush via
 *     `WP_Admin_Shell_Cache::flush()`.
 *   - Plugins hooking the filter at activation time get a flush
 *     automatically (the `activated_plugin` action triggers it).
 *   - Plugins hooking conditionally (e.g. only when a setting toggles)
 *     should call the flush themselves on the trigger.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Resolver {

	const ORIGINS_ORDER = array( 'core', 'plugin', 'site', 'role', 'user' );

	/** @var array Per-request resolved-doc memo, keyed by cache key. */
	private static $request_memo = array();

	public static function resolve( $context = array() ) {
		$context['shell'] = $context['shell'] ?? self::active_shell_slug();

		$cache_key = class_exists( 'WP_Admin_Shell_Cache' )
			? WP_Admin_Shell_Cache::key_for( $context )
			: null;

		// Request-scope memo — zero cost on repeat calls within a single
		// request (the WP_Object_Cache layer adds ~0.2ms per hit; this
		// avoids that for callers that resolve multiple times per request).
		if ( $cache_key !== null && isset( self::$request_memo[ $cache_key ] ) ) {
			return self::$request_memo[ $cache_key ];
		}

		if ( $cache_key !== null ) {
			$cached = WP_Admin_Shell_Cache::get( $cache_key );
			if ( $cached !== null ) {
				self::$request_memo[ $cache_key ] = $cached;
				return $cached;
			}
		}

		$origins  = self::load_origins( $context );
		$resolved = self::resolve_with( $origins );

		if ( $cache_key !== null ) {
			WP_Admin_Shell_Cache::set( $cache_key, $resolved );
			self::$request_memo[ $cache_key ] = $resolved;
		}
		return $resolved;
	}

	/**
	 * Reset the per-request memo. Test-only — production code relies on
	 * the memo lasting the entire request.
	 */
	public static function reset_request_memo() {
		self::$request_memo = array();
	}

	/**
	 * Resolve from a pre-loaded origin map. Useful for tests and for the
	 * cache layer (M2.7) that hands a hydrated map back to the pipeline
	 * without redoing disk / option reads.
	 *
	 * @param array $origins  [ 'core' => array, 'plugin' => array, ... ]
	 */
	const TRUSTED_ORIGINS  = array( 'core', 'plugin' );
	const CONSUMER_ORIGINS = array( 'site', 'role', 'user' );

	public static function resolve_with( $origins ) {
		$merged = array();

		// Phase 1 — trusted origins (authoritative).
		foreach ( self::TRUSTED_ORIGINS as $origin ) {
			$doc = $origins[ $origin ] ?? array();
			if ( ! is_array( $doc ) ) {
				continue;
			}
			$doc    = apply_filters( "wp_admin_shell_data_{$origin}", $doc );
			$tagged = WP_Admin_Shell_Merge::tag_origin( $doc, $origin );
			$merged = WP_Admin_Shell_Merge::merge_authoritative( $merged, $tagged );
		}

		// Phase 2 — consumer origins (additive, customizable-filtered).
		foreach ( self::CONSUMER_ORIGINS as $origin ) {
			$doc = $origins[ $origin ] ?? array();
			if ( ! is_array( $doc ) ) {
				continue;
			}
			$doc    = apply_filters( "wp_admin_shell_data_{$origin}", $doc );
			$doc    = WP_Admin_Shell_Customizable::filter_doc( $merged, $doc );
			$tagged = WP_Admin_Shell_Merge::tag_origin( $doc, $origin );
			$merged = WP_Admin_Shell_Merge::merge( $merged, $tagged );
		}

		$merged = apply_filters( 'wp_admin_shell_data', $merged );
		return WP_Admin_Shell_Merge::strip_origin_tags( $merged );
	}

	/**
	 * Load each origin's doc from disk / DB.
	 *
	 * Plan §M2 source-layout calls for one origin class per origin
	 * (`origins/{core,plugin,site,role,user}.php`). v1 keeps the
	 * core origin as its own class (because of the v0 → v1 normalizer
	 * surface) and inlines plugin/site/role/user as private methods on
	 * the resolver. Functionally equivalent to the planned split; if a
	 * future origin grows complex enough to need its own class
	 * (programmatic plugin shells, network site config), extract then.
	 */
	public static function load_origins( $context = array() ) {
		$shell_slug = $context['shell'] ?? self::active_shell_slug();
		$plugin_dir = trailingslashit( WP_ADMIN_SHELL_PATH );

		// Programmatic registrations win over file-based shells of the
		// same slug (spec §13 #6). Falls through to disk when the slug
		// is not registered programmatically.
		if ( class_exists( 'WP_Admin_Shell_Shells' ) && WP_Admin_Shell_Shells::has( $shell_slug ) ) {
			$plugin_doc = WP_Admin_Shell_Shells::get( $shell_slug );
		} else {
			$shell_path = $plugin_dir . 'shells/' . sanitize_file_name( $shell_slug ) . '.json';
			$plugin_doc = WP_Admin_Shell_Origin_Core::load( $shell_path );
		}

		// Core origin is the empty baseline that guards against missing
		// shells. When the plugin origin is a real shell with an engine
		// declaration (v2 root `engine` or v1 `settings.shell.layoutEngine`),
		// merging the v1-shaped empty_doc on top would inject conflicting
		// keys. v2 shells in particular gain a phantom `settings.*` partition
		// from the baseline. Skip the baseline whenever the plugin doc has
		// already declared an engine.
		$has_plugin_engine =
			( is_array( $plugin_doc ) && (
				isset( $plugin_doc['engine'] ) ||
				isset( $plugin_doc['settings']['shell']['layoutEngine'] )
			) );
		$core_doc = $has_plugin_engine
			? array()
			: WP_Admin_Shell_Origin_Core::empty_doc();

		return array(
			'core'   => $core_doc,
			'plugin' => $plugin_doc,
			'site'   => is_array( get_option( 'wp_admin_shell_site_config', array() ) ) ? get_option( 'wp_admin_shell_site_config', array() ) : array(),
			'role'   => self::role_origin(),
			'user'   => self::user_origin(),
		);
	}

	private static function role_origin() {
		$role_config = get_option( 'wp_admin_shell_role_config', array() );
		if ( ! is_array( $role_config ) ) {
			return array();
		}
		$user = wp_get_current_user();
		if ( ! $user || empty( $user->roles ) ) {
			return array();
		}
		// First role wins. Multi-role merging is a v2 concern.
		foreach ( (array) $user->roles as $role ) {
			if ( isset( $role_config[ $role ] ) && is_array( $role_config[ $role ] ) ) {
				return $role_config[ $role ];
			}
		}
		return array();
	}

	private static function user_origin() {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return array();
		}
		$prefs = get_user_meta( $user_id, 'wp_admin_shell_user_prefs', true );
		return is_array( $prefs ) ? $prefs : array();
	}

	/**
	 * Active shell slug — site default with role/user override.
	 *
	 * Migration: the MVP wrote `wp_admin_shell_active_config`; v1 writes
	 * `wp_admin_shell_active_shell`. Reads check the new key first, fall
	 * back to the old. Plan §M2.9.
	 */
	public static function active_shell_slug() {
		$slug = get_option( 'wp_admin_shell_active_shell', null );
		if ( ! $slug ) {
			$slug = get_option( 'wp_admin_shell_active_config', 'wp-admin-default' );
		}

		// Role override (per-role shell selection).
		$role_config = get_option( 'wp_admin_shell_role_config', array() );
		$user        = wp_get_current_user();
		if ( $user && ! empty( $user->roles ) && is_array( $role_config ) ) {
			foreach ( (array) $user->roles as $role ) {
				if ( isset( $role_config[ $role ]['shell'] ) ) {
					$slug = $role_config[ $role ]['shell'];
					break;
				}
			}
		}

		// User override — only if active shell allows it.
		$user_id = get_current_user_id();
		if ( $user_id ) {
			$prefs = get_user_meta( $user_id, 'wp_admin_shell_user_prefs', true );
			if ( is_array( $prefs ) && ! empty( $prefs['shell'] ) ) {
				if ( self::shell_allows_user_switch( $prefs['shell'] ) ) {
					$slug = $prefs['shell'];
				}
			}
		}

		return sanitize_file_name( $slug );
	}

	private static function shell_allows_user_switch( $shell_slug ) {
		$path = WP_ADMIN_SHELL_PATH . 'shells/' . sanitize_file_name( $shell_slug ) . '.json';
		if ( ! file_exists( $path ) ) {
			return false;
		}
		$doc = json_decode( file_get_contents( $path ), true );
		return is_array( $doc ) && ! empty( $doc['userSwitchable'] );
	}
}
