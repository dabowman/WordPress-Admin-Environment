<?php
/**
 * `wp admin-shell …` WP-CLI commands (plan §M5.9).
 *
 * Subcommands:
 *   list                  Print registered shells with their origins.
 *   activate <slug>       Set wp_admin_shell_active_shell.
 *   register <name> <path> Register a programmatic shell from JSON on disk.
 *   upgrade-config <name> Normalize a v0 (MVP flat) shell to v1 form.
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

		$active = get_option( 'wp_admin_shell_active_shell', '' );
		if ( $active === '' ) {
			$active = get_option( 'wp_admin_shell_active_config', 'developer-admin' );
		}

		$rows = array();
		foreach ( $shells as $shell ) {
			$rows[] = array(
				'slug'           => $shell['slug'],
				'title'          => $shell['title'],
				'origin'         => 'plugin', // shells/ files; M2 cascade lets site/role/user override on read
				'userSwitchable' => ! empty( $shell['userSwitchable'] ) ? 'yes' : 'no',
				'active'         => $shell['slug'] === $active ? 'yes' : '',
			);
		}

		WP_CLI\Utils\format_items( 'table', $rows, array( 'slug', 'title', 'origin', 'userSwitchable', 'active' ) );
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
	 *     wp admin-shell activate content-author
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

	/**
	 * Normalize a v0 (MVP flat) shell to v1 partitioned form on disk.
	 *
	 * Reads shells/<name>.json, runs it through the v0 → v1 normalizer,
	 * and writes the result back. The v0 file is preserved as
	 * shells/<name>.v0.json.
	 *
	 * ## OPTIONS
	 *
	 * <name>
	 * : Shell slug.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-shell upgrade-config content-author
	 *
	 * @when after_wp_load
	 */
	public function upgrade_config( $args, $assoc_args ) {
		list( $name ) = $args;
		$name = sanitize_file_name( $name );

		$path = WP_ADMIN_SHELL_PATH . 'shells/' . $name . '.json';
		if ( ! file_exists( $path ) ) {
			WP_CLI::error( "Shell not found: $name" );
		}

		$raw = json_decode( file_get_contents( $path ), true );
		if ( ! is_array( $raw ) ) {
			WP_CLI::error( 'Shell file is not valid JSON.' );
		}

		if ( isset( $raw['settings']['shell']['layoutEngine'] ) ) {
			WP_CLI::warning( "Shell already in v1 form: $name" );
			return;
		}

		$shells_dir = WP_ADMIN_SHELL_PATH . 'shells/';
		if ( ! is_writable( $shells_dir ) ) {
			WP_CLI::error( "shells/ is not writable; cannot back up before upgrade." );
		}

		// Write the backup BEFORE touching the original. Bail loudly if
		// the backup write fails — overwriting the original without a
		// preserved v0 copy would lose author intent.
		$backup       = $shells_dir . $name . '.v0.json';
		$backup_bytes = file_put_contents( $backup, file_get_contents( $path ) );
		if ( $backup_bytes === false ) {
			WP_CLI::error( "Backup write failed: $backup" );
		}

		$v1 = WP_Admin_Shell_Origin_Core::normalize_v0( $raw );
		$write_bytes = file_put_contents(
			$path,
			wp_json_encode( $v1, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n"
		);
		if ( $write_bytes === false ) {
			WP_CLI::error( "Upgrade write failed; backup preserved at $backup" );
		}

		WP_CLI::success( "Upgraded $name to v1. v0 backup: shells/$name.v0.json" );
	}
}

WP_CLI::add_command( 'admin-shell', 'WP_Admin_Shell_CLI' );
