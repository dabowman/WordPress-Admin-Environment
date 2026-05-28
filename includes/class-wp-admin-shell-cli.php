<?php
/**
 * `wp admin-shell …` WP-CLI commands (plan §M5.9).
 *
 * Subcommands:
 *   list                          Print registered shells with their origins.
 *   activate <slug>               Set wp_admin_shell_active_shell.
 *   register <name> <path>        Register a programmatic shell from JSON on disk.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'WP_CLI' ) || ! WP_CLI ) {
	return;
}

class WP_Admin_Shell_CLI {

	/**
	 * List registered shells with their origins.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-shell list
	 *
	 * @when after_wp_load
	 */
	public function list( $args, $assoc_args ) {
		$shells = wp_admin_shell_get_available_shells();

		$active = get_option( 'wp_admin_shell_active_shell', 'wp-admin-default' );

		$rows = array();
		foreach ( $shells as $shell ) {
			$rows[] = array(
				'slug'            => $shell['slug'],
				'title'           => $shell['title'],
				'origin'          => 'plugin', // shells/ files; cascade lets site/role/user override on read
				'user-switchable' => ! empty( $shell['user-switchable'] ) ? 'yes' : 'no',
				'active'          => $shell['slug'] === $active ? 'yes' : '',
			);
		}

		WP_CLI\Utils\format_items( 'table', $rows, array( 'slug', 'title', 'origin', 'user-switchable', 'active' ) );
	}

	/**
	 * Set the active shell.
	 *
	 * ## OPTIONS
	 *
	 * <slug>
	 * : Shell slug (filename without .json).
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-shell activate single-pane-demo
	 *
	 * @when after_wp_load
	 */
	public function activate( $args, $assoc_args ) {
		list( $slug ) = $args;
		$slug = sanitize_file_name( $slug );

		$path = WP_ADMIN_SHELL_PATH . 'shells/' . $slug . '.json';
		if ( ! file_exists( $path ) ) {
			WP_CLI::error( "Shell not found: $slug (looked in shells/$slug.json)" );
		}

		update_option( 'wp_admin_shell_active_shell', $slug );
		WP_CLI::success( "Active shell set to: $slug" );
	}

	/**
	 * Register a programmatic shell from a JSON file on disk.
	 *
	 * Copies the file into shells/<name>.json. Existing files are not
	 * overwritten unless --force is set.
	 *
	 * ## OPTIONS
	 *
	 * <name>
	 * : Shell slug to register as.
	 *
	 * <path>
	 * : Source JSON file path.
	 *
	 * [--force]
	 * : Overwrite shells/<name>.json if it exists.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-shell register acme /tmp/acme.json
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

		$dest = WP_ADMIN_SHELL_PATH . 'shells/' . $name . '.json';
		if ( file_exists( $dest ) && empty( $assoc_args['force'] ) ) {
			WP_CLI::error( "Shell already exists: $name (use --force to overwrite)" );
		}

		file_put_contents( $dest, $json );
		WP_CLI::success( "Registered shell: $name → shells/$name.json" );
	}
}

WP_CLI::add_command( 'admin-shell', 'WP_Admin_Shell_CLI' );
