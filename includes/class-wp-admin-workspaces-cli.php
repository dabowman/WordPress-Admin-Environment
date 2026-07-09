<?php
/**
 * `wp admin-workspace …` WP-CLI commands (plan §M5.9).
 *
 * Subcommands:
 *   list                          Print registered workspaces with their origins.
 *   activate <slug>               Set wp_admin_workspaces_active_workspace.
 *   register <name> <path>        Register a programmatic workspace from JSON on disk.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

class WP_Admin_Workspaces_CLI {

	/**
	 * List registered workspaces with their origins.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-workspace list
	 *
	 * @when after_wp_load
	 */
	public function list( $args, $assoc_args ) {
		$workspaces = wp_admin_workspaces_get_available_workspaces();

		$active = get_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );

		$rows = array();
		foreach ( $workspaces as $workspace ) {
			$rows[] = array(
				'slug'            => $workspace['slug'],
				'title'           => $workspace['title'],
				'origin'          => 'plugin', // workspaces/ files; cascade lets site/role/user override on read
				'user-switchable' => ! empty( $workspace['user-switchable'] ) ? 'yes' : 'no',
				'active'          => $workspace['slug'] === $active ? 'yes' : '',
			);
		}

		WP_CLI\Utils\format_items( 'table', $rows, array( 'slug', 'title', 'origin', 'user-switchable', 'active' ) );
	}

	/**
	 * Set the active workspace.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : Workspace slug (filename without .json).
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-workspace activate writer
	 *
	 * @when after_wp_load
	 */
	public function activate( $args, $assoc_args ) {
		list( $slug ) = $args;
		$slug = sanitize_file_name( $slug );

		$path = WP_ADMIN_WORKSPACES_PATH . 'workspaces/' . $slug . '.json';
		if ( ! file_exists( $path ) ) {
			WP_CLI::error( "Workspace not found: $slug (looked in workspaces/$slug.json)" );
		}

		update_option( 'wp_admin_workspaces_active_workspace', $slug );
		WP_CLI::success( "Active workspace set to: $slug" );
	}

	/**
	 * Register a programmatic workspace from a JSON file on disk.
	 *
	 * Copies the file into workspaces/<name>.json. Existing files are not
	 * overwritten unless --force is set.
	 *
	 * ## OPTIONS
	 *
	 * <name>
	 * : Workspace slug to register as.
	 *
	 * <path>
	 * : Source JSON file path.
	 *
	 * [--force]
	 * : Overwrite workspaces/<name>.json if it exists.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-workspace register acme /tmp/acme.json
	 *
	 * @when after_wp_load
	 */
	public function register( $args, $assoc_args ) {
		list( $name, $source_path ) = $args;
		$name = sanitize_file_name( $name );

		if ( ! file_exists( $source_path ) ) {
			WP_CLI::error( "Source file not found: $source_path" );
		}

		// Defensive: refuse symlinks / non-regular files. Operator is
		// already trusted (CLI access), but this stops a stray symlink
		// in a tarball-imported install from pulling content out of the
		// expected directory.
		if ( ! is_file( $source_path ) ) {
			WP_CLI::error( "Source must be a regular file: $source_path" );
		}

		$json = file_get_contents( $source_path );
		$doc  = json_decode( $json, true );
		if ( ! is_array( $doc ) ) {
			WP_CLI::error( 'Source file is not valid JSON.' );
		}

		$dest = WP_ADMIN_WORKSPACES_PATH . 'workspaces/' . $name . '.json';
		if ( file_exists( $dest ) && empty( $assoc_args['force'] ) ) {
			WP_CLI::error( "Workspace already exists: $name (use --force to overwrite)" );
		}

		file_put_contents( $dest, $json );
		WP_CLI::success( "Registered workspace: $name → workspaces/$name.json" );
	}
}

WP_CLI::add_command( 'admin-workspace', 'WP_Admin_Workspaces_CLI' );
