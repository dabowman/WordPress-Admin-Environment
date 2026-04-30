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
 * `wp_admin_shell_data_{origin}`, run through `userCustomizable` filtering
 * against the upstream merged tree, and merged with restrict-only
 * semantics. After all origins fold in, `wp_admin_shell_data` runs as
 * the final filter.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Resolver {

	const ORIGINS_ORDER = array( 'core', 'plugin', 'site', 'role', 'user' );

	public static function resolve( $context = array() ) {
		$origins = self::load_origins( $context );
		return self::resolve_with( $origins );
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
	 * Load each origin's doc from disk / DB. Stub for now — M2.2 fills
	 * out the plugin/site/role/user loaders.
	 */
	public static function load_origins( $context = array() ) {
		$shell_slug = $context['shell'] ?? self::active_shell_slug();
		$plugin_dir = trailingslashit( WP_ADMIN_SHELL_PATH );

		$shell_path = $plugin_dir . 'shells/' . sanitize_file_name( $shell_slug ) . '.json';
		$plugin_doc = WP_Admin_Shell_Origin_Core::load( $shell_path );

		return array(
			'core'   => WP_Admin_Shell_Origin_Core::empty_doc(),
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
			$slug = get_option( 'wp_admin_shell_active_config', 'developer-admin' );
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
