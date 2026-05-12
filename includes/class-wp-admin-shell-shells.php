<?php
/**
 * Programmatic shell registry (spec §13 #6).
 *
 * Plugins call `wp_admin_shell_register_shell( $slug, $admin_json )`
 * to contribute a complete shell at runtime — useful for shells whose
 * shape is computed (per role, per site, per feature flag) rather than
 * stored on disk.
 *
 * The registry sits between the file-based discovery and the cascade
 * resolver:
 *
 *   1. The plugin origin loader (`WP_Admin_Shell_Resolver::load_origins`)
 *      checks the programmatic registry for the active slug *before*
 *      reading `shells/{slug}.json` from disk. Programmatic
 *      registrations override file-based shells of the same slug.
 *   2. `wp_admin_shell_get_available_shells()` merges programmatic
 *      registrations into the dropdown so authors can switch to them
 *      from the Settings page.
 *
 * Programmatic shells participate in the same cascade as file shells:
 * site / role / user origins still merge on top, restrict-only and
 * `customizable` enforcement still apply.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Shells {

	/** @var array<string, array> slug => admin.json doc */
	private static $registered = array();

	/**
	 * Register a complete shell programmatically.
	 *
	 * @param string $slug      Unique slug. Sanitized via `sanitize_file_name`.
	 * @param array  $admin_json Full admin.json document.
	 *
	 * @return string|WP_Error Slug on success, WP_Error otherwise.
	 */
	public static function register( $slug, $admin_json ) {
		$slug = is_string( $slug ) ? sanitize_file_name( $slug ) : '';
		if ( $slug === '' ) {
			return new WP_Error(
				'wp_admin_shell_invalid_shell_slug',
				'register_shell: slug must be a non-empty string'
			);
		}
		if ( ! is_array( $admin_json ) ) {
			return new WP_Error(
				'wp_admin_shell_invalid_shell_doc',
				"register_shell: admin.json doc for '$slug' must be an array"
			);
		}

		// Stamp the slug into the doc when missing so consumers
		// (cascade tagging, dropdown) have a stable identifier.
		if ( ! isset( $admin_json['name'] ) || ! is_string( $admin_json['name'] ) || $admin_json['name'] === '' ) {
			$admin_json['name'] = $slug;
		}

		self::$registered[ $slug ] = $admin_json;
		return $slug;
	}

	public static function get( $slug ) {
		return self::$registered[ $slug ] ?? null;
	}

	public static function has( $slug ) {
		return isset( self::$registered[ $slug ] );
	}

	/**
	 * @return array<string, array>
	 */
	public static function all() {
		return self::$registered;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$registered = array();
	}
}
