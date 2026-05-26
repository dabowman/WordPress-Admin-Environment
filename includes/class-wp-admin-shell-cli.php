<?php
/**
 * `wp admin-shell …` WP-CLI commands (plan §M5.9).
 *
 * Subcommands:
 *   list                          Print registered shells with their origins.
 *   activate <slug>               Set wp_admin_shell_active_shell.
 *   register <name> <path>        Register a programmatic shell from JSON on disk.
 *   check-config <name>           Diagnose a shell's v2 readiness.
 *   migrate-shell <slug-or-path>  Rewrite a v2 admin.json shell as v3-shape.
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
				'slug'            => $shell['slug'],
				'title'           => $shell['title'],
				'origin'          => 'plugin', // shells/ files; M2 cascade lets site/role/user override on read
				'user-switchable' => ( ! empty( $shell['user-switchable'] ) || ! empty( $shell['userSwitchable'] ) ) ? 'yes' : 'no',
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
	 * @subcommand check-config
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

	/**
	 * Rewrite a v2 admin.json shell as v3-shape (Phase 3d.2).
	 *
	 * Reads the source file from either a slug (looked up in
	 * `shells/<slug>.json`) or an absolute file path. Writes the
	 * v3-shape JSON to `--output=<path>` or, by default, next to the
	 * source at `<basename>.v3.json`.
	 *
	 * Codifies the same v2 → v3 transformations the runtime
	 * `WP_Admin_Shell_V3_Compiler` performs at boot — `routes` → `screens`,
	 * `viewConfigs` → `settings.dataViews`, `fieldCollections` →
	 * `settings.dataFields`, `bindings` → `commands`, iframe-fallback
	 * collapse to `iframe:<slug>` shorthand, branding promotion to
	 * `workspace.branding`. Plugin authors carrying v2 shells use this to
	 * mechanically transition.
	 *
	 * **dataViewRef heuristic.** When a v2 route declares
	 * `config.variant`, the rewriter synthesizes
	 * `screen.dataViewRef: "<kind>/<name>/<variant>"`. The kind/name
	 * segments come from the app manifest registry's `dataView` block
	 * when available; otherwise the rewriter falls back to assuming
	 * `(postType, config.postType)` or `(taxonomy, config.taxonomy)`.
	 * Routes that match neither path leave `variant` in
	 * `screen.config.variant`; the v3 compiler's runtime
	 * manifest-inference picks it up at boot, so the migration is still
	 * functional but slightly less explicit.
	 *
	 * Output validation: lightweight checks against the admin-v3.json
	 * schema's top-level shape rules (required fields, enums, kebab-case
	 * patterns) before writing. Validation errors surface as
	 * `WP_CLI::warning()`s and abort the write unless `--force` is set.
	 *
	 * **Source lookup precedence:** the CLI first checks for a file at
	 * `<source>` (relative-to-cwd OR absolute), then falls back to
	 * `shells/<source>.json` under the plugin root. Running the CLI
	 * from a directory carrying a file named `<slug>` (without
	 * `.json`) may match unexpectedly; pass an explicit absolute path
	 * or use the slug form from an unrelated cwd to disambiguate.
	 *
	 * **`regions` block preservation:** v2 shells declaring a `regions`
	 * block (rare) get the block copied verbatim into the v3 output
	 * under the v3 `regions` escape hatch. v3's region shape may
	 * diverge from v2's; the output passes the rewriter clean but
	 * may fail Ajv validation post-merge. Hand-review any migrated
	 * shell that carried a custom `regions` block.
	 *
	 * **`infer_kind_name` heuristic:** when a route's `app` manifest
	 * doesn't declare a `dataView` block, the rewriter falls back to
	 * reading `(postType, config.postType)` then `(taxonomy,
	 * config.taxonomy)`. If both are set (unusual), `postType` wins.
	 *
	 * ## OPTIONS
	 *
	 * <slug-or-path>
	 * : Either an active-shell slug (resolves via `shells/<slug>.json`)
	 * or an absolute file path to a v2 admin.json document. Cwd-relative
	 * file matches take precedence over slug lookup — see "Source
	 * lookup precedence" above.
	 *
	 * [--dry-run]
	 * : Print the rewritten JSON to stdout; do not write any file.
	 *
	 * [--output=<path>]
	 * : Explicit destination file path. Default: source-path with
	 * `.json` replaced by `.v3.json`. Source paths already ending in
	 * `.v3.json` are kept as-is (no `.v3.v3.json` doubling).
	 *
	 * [--force]
	 * : Dual-purpose. (1) Overwrite an existing destination file
	 * (default: abort if the destination exists). (2) Bypass
	 * lightweight v3 schema validation errors and write anyway
	 * (default: abort on validation errors). Both behaviors gated by
	 * the same flag for ergonomic simplicity; pass `--force` only
	 * when you've reviewed the destination + the validation warnings.
	 *
	 * ## EXAMPLES
	 *
	 *     wp admin-shell migrate-shell my-v2-shell
	 *     wp admin-shell migrate-shell /tmp/legacy-shell.json --dry-run
	 *     wp admin-shell migrate-shell my-shell --output=/tmp/my-shell.v3.json --force
	 *
	 * @subcommand migrate-shell
	 * @when after_wp_load
	 *
	 * @param array $args        Positional args.
	 * @param array $assoc_args  Flag args.
	 * @return void
	 */
	public function migrate_shell( $args, $assoc_args ) {
		list( $source ) = $args;

		$source_path = WP_Admin_Shell_Migrate_CLI_Helpers::resolve_source( $source );
		if ( $source_path === '' ) {
			WP_CLI::error(
				"Source not found: {$source}. Expected a slug (looked up in shells/) or an absolute file path."
			);
		}

		$raw = file_get_contents( $source_path );
		if ( ! is_string( $raw ) ) {
			WP_CLI::error( "Could not read source file: {$source_path}" );
		}
		$v2 = json_decode( $raw, true );
		if ( ! is_array( $v2 ) ) {
			WP_CLI::error( "Source is not valid JSON: {$source_path}" );
		}

		if ( ! WP_Admin_Shell_Migrate_Rewriter::is_pre_v3( $v2 ) ) {
			WP_CLI::error(
				'Source appears to be v3 already (version:3 or workspace block present). Migration is one-way (v2 → v3); refusing to rewrite.'
			);
		}

		$warnings = array();
		$v3       = WP_Admin_Shell_Migrate_Rewriter::rewrite( $v2, array(), $warnings );

		foreach ( $warnings as $warn ) {
			WP_CLI::warning( $warn );
		}

		$errors = WP_Admin_Shell_Migrate_Rewriter::lightweight_validate( $v3 );
		foreach ( $errors as $err ) {
			WP_CLI::warning( $err );
		}

		$json = WP_Admin_Shell_Migrate_Rewriter::encode_json( $v3 );

		if ( ! empty( $assoc_args['dry-run'] ) ) {
			if ( ! empty( $errors ) ) {
				WP_CLI::log(
					'# v3-shape rewrite (validation surfaced ' . count( $errors ) . ' warning(s) — see above):'
				);
			}
			WP_CLI::log( $json );
			return;
		}

		$output = isset( $assoc_args['output'] ) && is_string( $assoc_args['output'] ) && $assoc_args['output'] !== ''
			? $assoc_args['output']
			: WP_Admin_Shell_Migrate_CLI_Helpers::default_output_path( $source_path );

		if ( ! empty( $errors ) && empty( $assoc_args['force'] ) ) {
			WP_CLI::error(
				'v3 validation surfaced ' . count( $errors ) . ' error(s); pass --force to write anyway, or correct the source.'
			);
		}

		if ( file_exists( $output ) && empty( $assoc_args['force'] ) ) {
			WP_CLI::error( "Destination already exists: {$output}. Pass --force to overwrite." );
		}

		$written = file_put_contents( $output, $json );
		if ( $written === false ) {
			WP_CLI::error( "Could not write to destination: {$output}" );
		}

		WP_CLI::success( "Wrote v3-shape shell to: {$output}" );
	}
}

WP_CLI::add_command( 'admin-shell', 'WP_Admin_Shell_CLI' );
