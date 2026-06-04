<?php
/**
 * Resolver-shape integration tests.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php`
 *
 * For each bundled workspace, runs the full resolver pipeline and asserts the
 * resolved AUTHOR-shape doc has the structural invariants the kernel
 * depends on:
 *
 *   - top-level `workspace` block present + `workspace.engine` registered.
 *   - top-level `screens` block present with ≥ 1 entry.
 *   - every screen declares a primary app (shorthand `app` or `apps[0]`),
 *     and every referenced app source is a `core:*` / `plugin:*` /
 *     `iframe:*` id.
 *   - `workspace.default-screen` (when present) names a real screen.
 *   - no two screens claim the same `path`.
 *
 * The kernel derives the runtime surfaces (`engine` / `regions` / `routes`
 * / `default-route`) from these blocks JS-side; that synthesis is
 * validated by `tests/runtime/build-runtime-config.test.mjs`.
 *
 * Bug class this catches: canonical path drift between author files
 * and runtime readers.
 *
 * Bug class this DOES NOT catch: React component-level render bugs
 * (those need the JSDOM smoke harness — separate issue).
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Shape_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function ok( $label, $condition, $detail = '' ) {
		if ( $condition ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label";
			if ( $detail ) {
				echo "\n      $detail";
			}
			echo "\n";
		}
	}
}

$T          = 'WPAS_Shape_Test_Runner';
$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

$user = get_user_by( 'login', 'admin' ) ?: get_user_by( 'id', 1 );
wp_set_current_user( $user->ID );

$workspaces = array_map(
	fn( $f ) => basename( $f, '.json' ),
	glob( $plugin_dir . 'workspaces/*.json' )
);
sort( $workspaces );

// Known engine sources.
$known_engines = array( 'core:default', 'core:single-pane', 'core:desktop' );

/**
 * The primary app id for a screen — shorthand `app` or first `apps[]`
 * entry. Returns '' when the screen declares neither.
 */
function wpas_screen_primary_app( $screen ) {
	if ( ! is_array( $screen ) ) {
		return '';
	}
	if ( isset( $screen['app'] ) && is_string( $screen['app'] ) && $screen['app'] !== '' ) {
		return $screen['app'];
	}
	if ( isset( $screen['apps'] ) && is_array( $screen['apps'] ) && ! empty( $screen['apps'] ) ) {
		$first = reset( $screen['apps'] );
		if ( is_array( $first ) && isset( $first['app'] ) && is_string( $first['app'] ) ) {
			return $first['app'];
		}
	}
	return '';
}

/**
 * A namespaced app source is valid when it's `core:*`, `plugin:*`, or
 * `iframe:*` (the iframe shorthand the kernel translates to
 * core:iframe-fallback).
 */
function wpas_is_valid_app_ref( $ref ) {
	return is_string( $ref ) && (
		strpos( $ref, 'core:' ) === 0 ||
		strpos( $ref, 'plugin:' ) === 0 ||
		strpos( $ref, 'iframe:' ) === 0
	);
}

foreach ( $workspaces as $slug ) {
	echo "\n— Workspace: $slug —\n";
	update_option( 'wp_admin_workspaces_active_workspace', $slug );
	WP_Admin_Workspaces_Cache::flush();
	WP_Admin_Workspaces_Resolver::reset_request_memo();

	$config = wp_admin_workspaces_get_active_config();

	// All bundled workspaces are v3-shape. The resolver serializes the
	// author-shape doc (`workspace` / `screens` / `menu` / `settings` /
	// `commands`); the kernel derives the runtime surfaces JS-side.
	$T::ok(
		"$slug: top-level `engine` field present",
		isset( $config['engine'] ) && is_string( $config['engine'] )
	);
	$T::ok(
		"$slug: top-level `screens` block present",
		isset( $config['screens'] ) && is_array( $config['screens'] )
	);

	// Engine — top-level field in the v3 frame-shape (was workspace.engine).
	$engine = $config['engine'] ?? null;
	$T::ok(
		"$slug: engine present",
		$engine !== null,
		'engine = ' . var_export( $engine, true )
	);
	$T::ok(
		"$slug: engine is registered ($engine)",
		in_array( $engine, $known_engines, true ),
		'expected one of ' . implode( ',', $known_engines )
	);

	// Screens — ≥1 entry; each declares a valid primary app.
	$screens = $config['screens'] ?? array();
	$T::ok( "$slug: ≥1 screen", count( $screens ) >= 1, 'count=' . count( $screens ) );

	$paths = array();
	foreach ( $screens as $screen_id => $screen ) {
		if ( ! is_array( $screen ) ) {
			continue;
		}
		$primary = wpas_screen_primary_app( $screen );
		$T::ok(
			"$slug: screen '$screen_id' declares a primary app",
			$primary !== '',
			'no `app` or `apps[]` on screen'
		);
		if ( $primary !== '' ) {
			$T::ok(
				"$slug: screen '$screen_id' app ref valid ($primary)",
				wpas_is_valid_app_ref( $primary )
			);
		}
		// Collect paths for collision detection.
		if ( isset( $screen['path'] ) && is_string( $screen['path'] ) && $screen['path'] !== '' ) {
			$paths[] = $screen['path'];
		}
	}

	// No two screens claim the same path.
	$T::ok(
		"$slug: screen paths are unique",
		count( $paths ) === count( array_unique( $paths ) ),
		'paths: ' . implode( ', ', $paths )
	);

	// default-screen (when declared) names a real screen.
	$default_screen = $config['default-screen'] ?? null;
	if ( $default_screen !== null ) {
		$T::ok(
			"$slug: default-screen '$default_screen' names a real screen",
			isset( $screens[ $default_screen ] ),
			'available: ' . implode( ', ', array_keys( $screens ) )
		);
	} else {
		$T::ok( "$slug: default-screen may be absent (kernel auto-picks)", true );
	}
}

// Reset.
update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );
WP_Admin_Workspaces_Cache::flush();
WP_Admin_Workspaces_Resolver::reset_request_memo();

echo "\n— Summary —\n";
echo 'PASS: ' . $T::$pass . '  FAIL: ' . $T::$fail . "\n";
if ( $T::$fail > 0 ) {
	exit( 1 );
}
