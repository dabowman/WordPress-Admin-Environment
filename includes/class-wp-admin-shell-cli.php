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
	 * Diagnose a shell's v2 readiness.
	 *
	 * Reports whether the shell is in canonical v2 shape (top-level
	 * `engine` + `regions` + `routes`, no `settings.*` partition) and
	 * lists the legacy fields that block v2 validation if the shell is
	 * still on the v0 (MVP flat) or v1 (partitioned) shape.
	 *
	 * The MVP `upgrade-config` command — which used the old v0 → v1
	 * normalizer — is gone in v2. The normalizer body was retired in
	 * `10e87d1` (V2.M4 task 8); v0/v1 → v2 transformation is intentionally
	 * not automated because the v2 shape requires authoring decisions
	 * (region templates, routes block, route-key per routable region)
	 * that no mechanical rewrite can make. Use this command to inspect
	 * the gap; rewrite the shell by hand against the v2 design spec.
	 *
	 * ## OPTIONS
	 *
	 * <name>
	 * : Shell slug.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-shell check-config wp-admin-default
	 *
	 * @when after_wp_load
	 */
	public function check_config( $args, $assoc_args ) {
		list( $name ) = $args;
		$name = sanitize_file_name( $name );

		$path = WP_ADMIN_SHELL_PATH . 'shells/' . $name . '.json';
		if ( ! file_exists( $path ) ) {
			WP_CLI::error( "Shell not found: $name" );
		}

		$doc = json_decode( file_get_contents( $path ), true );
		if ( ! is_array( $doc ) ) {
			WP_CLI::error( 'Shell file is not valid JSON.' );
		}

		$is_v2 = isset( $doc['engine'] ) && ! isset( $doc['settings'] );
		$has_regions  = isset( $doc['regions'] ) && is_array( $doc['regions'] );
		$has_routes   = isset( $doc['routes'] ) && is_array( $doc['routes'] );
		$has_settings = isset( $doc['settings'] );

		$legacy_fields = array();
		if ( $has_settings ) {
			$legacy_fields[] = 'settings.* partition';
		}
		if ( isset( $doc['settings']['shell']['layoutEngine'] ) ) {
			$legacy_fields[] = 'settings.shell.layoutEngine';
		}
		if ( isset( $doc['settings']['regions'] ) ) {
			$legacy_fields[] = 'settings.regions';
		}
		if ( isset( $doc['settings']['applications'] ) ) {
			$legacy_fields[] = 'settings.applications';
		}
		foreach ( ( $doc['settings']['regions'] ?? array() ) as $region ) {
			if ( isset( $region['kind'] ) ) {
				$legacy_fields[] = 'region.kind (legacy enum; v2 uses role/layout/platform)';
				break;
			}
		}
		foreach ( ( $doc['regions'] ?? array() ) as $region ) {
			if ( isset( $region['kind'] ) ) {
				$legacy_fields[] = 'region.kind under v2 root (drop; v2 uses role/template)';
				break;
			}
			if ( isset( $region['contains'] ) ) {
				$legacy_fields[] = 'region.contains[] (v2: one app + nested regions)';
				break;
			}
		}

		WP_CLI::log( 'Shell:        ' . $name );
		WP_CLI::log( 'Path:         ' . $path );
		WP_CLI::log( 'Shape:        ' . ( $is_v2 ? 'v2 (canonical)' : ( $has_settings ? 'v1 (partitioned)' : 'v0 (flat)' ) ) );
		WP_CLI::log( 'Has regions:  ' . ( $has_regions ? 'yes' : 'no' ) );
		WP_CLI::log( 'Has routes:   ' . ( $has_routes ? 'yes' : 'no' ) );

		if ( ! empty( $legacy_fields ) ) {
			WP_CLI::log( 'Legacy fields:' );
			foreach ( array_unique( $legacy_fields ) as $field ) {
				WP_CLI::log( '  - ' . $field );
			}
			WP_CLI::warning( 'Shell needs hand-rewrite to v2. See docs/wp-admin-shell-design-spec.md §4.3.' );
			return;
		}

		WP_CLI::success( 'Shell is v2-canonical.' );
	}
}

WP_CLI::add_command( 'admin-shell', 'WP_Admin_Shell_CLI' );
