<?php
/**
 * Two-layer cache for the cascade resolver (plan §M2.7).
 *
 *   1. Request-scope: WP_Object_Cache group `wp_admin_shell`. One read
 *      per request after the first; persistent object caches (Redis,
 *      Memcached) further hold it across requests.
 *   2. Cross-request transient: `wp_admin_shell_resolved_<hash>`. Falls
 *      back to options when no persistent cache is configured.
 *
 * The cache key is a hash over signals that uniquely identify each
 * origin's content:
 *   - core:   bundled JSON file mtimes (shells dir)
 *   - plugin: active shell slug + that file's mtime
 *   - site:   `wp_admin_shell_site_config` option contents
 *   - role:   current user's role(s) + `wp_admin_shell_role_config` option
 *   - user:   current user's id + `wp_admin_shell_user_prefs` user meta
 *
 * Any origin write (option update, user-meta update, file edit) results
 * in a different hash, so cache invalidation is automatic. Explicit
 * `flush()` is exposed for option-update hooks that want to be defensive.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Cache {

	const GROUP          = 'wp_admin_shell';
	const TRANSIENT_BASE = 'wp_admin_shell_resolved_';
	const TTL_SECONDS    = 300; // 5 minutes; short because invalidation is hash-driven anyway.

	public static function get( $key ) {
		$found = false;
		$value = wp_cache_get( $key, self::GROUP, false, $found );
		if ( $found ) {
			return $value;
		}
		$transient = get_transient( self::TRANSIENT_BASE . $key );
		if ( $transient !== false ) {
			wp_cache_set( $key, $transient, self::GROUP );
			return $transient;
		}
		return null;
	}

	public static function set( $key, $value ) {
		wp_cache_set( $key, $value, self::GROUP );
		set_transient( self::TRANSIENT_BASE . $key, $value, self::TTL_SECONDS );
	}

	public static function flush() {
		wp_cache_flush_group( self::GROUP );
		// Transients are scoped per-request; full flush is impractical
		// (no native API for "delete all transients matching prefix").
		// Hash-based keys self-invalidate when their inputs change, so
		// stale transients age out via TTL. Leave them.
	}

	/**
	 * Compute a stable cache key over every origin's signal source.
	 */
	public static function key_for( $context = array() ) {
		$signals = array(
			'shell'       => $context['shell'] ?? '',
			'core_mtime'  => self::shells_mtime(),
			'site_opt'    => self::option_signal( 'wp_admin_shell_site_config' ),
			'role_opt'    => self::option_signal( 'wp_admin_shell_role_config' ),
			'user_id'     => get_current_user_id(),
			'user_prefs'  => self::user_meta_signal( 'wp_admin_shell_user_prefs' ),
			'user_roles'  => self::current_user_roles(),
		);
		return substr( md5( wp_json_encode( $signals ) ), 0, 16 );
	}

	private static function shells_mtime() {
		$dir = WP_ADMIN_SHELL_PATH . 'shells/';
		if ( ! is_dir( $dir ) ) {
			return 0;
		}
		$max = 0;
		foreach ( glob( $dir . '*.json' ) ?: array() as $file ) {
			$mtime = filemtime( $file );
			if ( $mtime > $max ) {
				$max = $mtime;
			}
		}
		return $max;
	}

	private static function option_signal( $option_name ) {
		$value = get_option( $option_name, null );
		if ( $value === null ) {
			return '';
		}
		return md5( wp_json_encode( $value ) );
	}

	private static function user_meta_signal( $meta_key ) {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return '';
		}
		$value = get_user_meta( $user_id, $meta_key, true );
		return md5( wp_json_encode( $value ) );
	}

	private static function current_user_roles() {
		$user = wp_get_current_user();
		if ( ! $user || empty( $user->roles ) ) {
			return '';
		}
		$roles = (array) $user->roles;
		sort( $roles );
		return implode( ',', $roles );
	}
}

// Defensive flush hooks — anything that writes a cascade origin invalidates.
add_action( 'update_option_wp_admin_shell_active_shell',  array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'update_option_wp_admin_shell_active_config', array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'update_option_wp_admin_shell_site_config',   array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'update_option_wp_admin_shell_role_config',   array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'updated_user_meta', function ( $meta_id, $object_id, $meta_key ) {
	if ( $meta_key === 'wp_admin_shell_user_prefs' ) {
		WP_Admin_Shell_Cache::flush();
	}
}, 10, 3 );
