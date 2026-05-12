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
		self::flush_transients();
	}

	/**
	 * Delete every transient this cache layer owns. The hash-based key
	 * scheme normally lets stale transients age out via TTL when their
	 * inputs change, but tests + admin-side cache-flush actions need an
	 * explicit purge so cache-shape changes (e.g. v1 → v2 admin.json
	 * shape transitions) take effect immediately on the next read.
	 */
	public static function flush_transients() {
		global $wpdb;
		if ( ! isset( $wpdb ) ) {
			return;
		}
		$opt_like      = $wpdb->esc_like( '_transient_' . self::TRANSIENT_BASE ) . '%';
		$timeout_like  = $wpdb->esc_like( '_transient_timeout_' . self::TRANSIENT_BASE ) . '%';
		// phpcs:disable WordPress.DB.DirectDatabaseQuery
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $opt_like, $timeout_like ) );
		// phpcs:enable
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

// Plugin activation/deactivation invalidates the cache so freshly-
// hooked `wp_admin_shell_data_*` filters or sources contributed by
// the activated plugin take effect on the next page load. The
// `activated_plugin` / `deactivated_plugin` actions fire for every
// plugin (not just ours); the cost of an extra flush during plugin
// management is well below the cost of a plugin author seeing stale
// cache and filing a bug.
add_action( 'activated_plugin',   array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'deactivated_plugin', array( 'WP_Admin_Shell_Cache', 'flush' ) );

// Theme switch can change source registrations and capability surfaces.
add_action( 'switch_theme', array( 'WP_Admin_Shell_Cache', 'flush' ) );

// User role changes affect cap precomputation + role-origin reads.
add_action( 'set_user_role',    array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'add_user_role',    array( 'WP_Admin_Shell_Cache', 'flush' ) );
add_action( 'remove_user_role', array( 'WP_Admin_Shell_Cache', 'flush' ) );
