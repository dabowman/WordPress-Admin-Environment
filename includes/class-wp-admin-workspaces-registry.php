<?php
/**
 * Programmatic workspace registry (spec §13 #6).
 *
 * Plugins call `wp_admin_workspaces_register_workspace( $slug, $workspace_json )`
 * to contribute a complete workspace at runtime — useful for workspaces whose
 * shape is computed (per role, per site, per feature flag) rather than
 * stored on disk.
 *
 * The registry sits between the file-based discovery and the cascade
 * resolver:
 *
 *   1. The plugin origin loader (`WP_Admin_Workspaces_Resolver::load_origins`)
 *      checks the programmatic registry for the active slug *before*
 *      reading `workspaces/{slug}.json` from disk. Programmatic
 *      registrations override file-based workspaces of the same slug.
 *   2. `wp_admin_workspaces_get_available_workspaces()` merges programmatic
 *      registrations into the dropdown so authors can switch to them
 *      from the Settings page.
 *
 * Programmatic workspaces participate in the same cascade as file workspaces:
 * site / role / user origins still merge on top, restrict-only and
 * `customizable` enforcement still apply.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Registry {

	/** @var array<string, array> slug => workspace.json doc */
	private static $registered = array();

	/**
	 * Register a complete workspace programmatically.
	 *
	 * @param string $slug      Unique slug. Sanitized via `sanitize_file_name`.
	 * @param array  $workspace_json Full workspace.json document.
	 *
	 * @return string|WP_Error Slug on success, WP_Error otherwise.
	 */
	public static function register( $slug, $workspace_json ) {
		$slug = is_string( $slug ) ? sanitize_file_name( $slug ) : '';
		if ( $slug === '' ) {
			return new WP_Error(
				'wp_admin_workspaces_invalid_workspace_slug',
				'register_workspace: slug must be a non-empty string'
			);
		}
		if ( ! is_array( $workspace_json ) ) {
			return new WP_Error(
				'wp_admin_workspaces_invalid_shell_doc',
				"register_workspace: workspace.json doc for '$slug' must be an array"
			);
		}

		// Stamp the slug into the doc when missing so consumers
		// (cascade tagging, dropdown) have a stable identifier.
		if ( ! isset( $workspace_json['name'] ) || ! is_string( $workspace_json['name'] ) || $workspace_json['name'] === '' ) {
			$workspace_json['name'] = $slug;
		}

		self::$registered[ $slug ] = $workspace_json;
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
