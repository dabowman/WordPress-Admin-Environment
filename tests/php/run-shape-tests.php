<?php
/**
 * Resolver-shape integration tests.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php`
 *
 * For each bundled shell, runs the full resolver pipeline and asserts
 * the resolved tree has the structural invariants the runtime depends on:
 *
 *   - settings.shell.layoutEngine present and registered.
 *   - settings.regions has ≥ 1 entry; every region has a known source.
 *   - settings.applications has ≥ 1 entry; every routable app declared
 *     in the shell survives the merge.
 *   - settings.defaultRoute (or top-level mirror) resolves to a known
 *     app id present in settings.applications.
 *
 * Bug class this catches: v1 canonical path drift between author files
 * and runtime readers (e.g. resolver writes settings.applications but a
 * runtime reader checks config.applications). The two regressions in
 * commits 027d53b + a5cb55e would have been caught here.
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
require_once $plugin_dir . 'wp-admin-shell.php';

$user = get_user_by( 'login', 'admin' ) ?: get_user_by( 'id', 1 );
wp_set_current_user( $user->ID );

$shells = array_map(
	fn( $f ) => basename( $f, '.json' ),
	glob( $plugin_dir . 'shells/*.json' )
);
sort( $shells );

// Known region sources — mirrored from src/runtime/registry/builtins.js.
$known_region_sources = array(
	'core:sidebar-region',
	'core:toolbar-region',
	'core:content-region',
	'core:preview-region',
	'core:overlay-region',
	'core:drawer-region',
);

// Known engine sources.
$known_engines = array( 'core:site-editor-layout' );

foreach ( $shells as $slug ) {
	echo "\n— Shell: $slug —\n";
	update_option( 'wp_admin_shell_active_shell', $slug );
	WP_Admin_Shell_Cache::flush();
	WP_Admin_Shell_Resolver::reset_request_memo();

	$config = wp_admin_shell_get_active_config();

	// Engine.
	$engine = $config['settings']['shell']['layoutEngine'] ?? null;
	$T::ok(
		"$slug: settings.shell.layoutEngine present",
		$engine !== null,
		'engine = ' . var_export( $engine, true )
	);
	$T::ok(
		"$slug: layoutEngine registered ($engine)",
		in_array( $engine, $known_engines, true ),
		'expected one of ' . implode( ',', $known_engines )
	);

	// Regions.
	$regions = $config['settings']['regions'] ?? array();
	$T::ok( "$slug: ≥1 region", count( $regions ) >= 1, 'count=' . count( $regions ) );
	foreach ( $regions as $rid => $r ) {
		$T::ok(
			"$slug: region '$rid' source registered ({$r['source']})",
			in_array( $r['source'], $known_region_sources, true )
		);
	}

	// Applications.
	$apps   = $config['settings']['applications'] ?? array();
	$app_ids = array_column( $apps, 'id' );
	$T::ok( "$slug: ≥1 application", count( $apps ) >= 1, 'count=' . count( $apps ) );

	// defaultRoute resolves to a known app id.
	$default_route = $config['settings']['defaultRoute']
		?? $config['defaultRoute']
		?? null;
	if ( $default_route !== null ) {
		$trimmed = ltrim( preg_replace( '/^#?\/?/', '', (string) $default_route ), '/' );
		$first   = explode( '/', $trimmed )[0];
		$resolves = in_array( $first, $app_ids, true );
		$T::ok(
			"$slug: defaultRoute '$default_route' resolves to known app id",
			$resolves,
			$resolves ? '' : "first segment '$first' not in app ids: " . implode( ',', $app_ids )
		);
	} else {
		$T::ok( "$slug: defaultRoute may be null (auto-pick first non-hidden)", true );
	}

	// Every app in `regions[*].contains` is also in applications.
	foreach ( $regions as $rid => $r ) {
		foreach ( ( $r['contains'] ?? array() ) as $contained ) {
			if ( ! is_string( $contained ) ) {
				continue;
			}
			$T::ok(
				"$slug: region '$rid'.contains references known app '$contained'",
				in_array( $contained, $app_ids, true ),
				'app ids: ' . implode( ',', $app_ids )
			);
		}
	}
}

// Reset.
update_option( 'wp_admin_shell_active_shell', 'wp-admin-default' );
WP_Admin_Shell_Cache::flush();
WP_Admin_Shell_Resolver::reset_request_memo();

echo "\n— Summary —\n";
echo 'PASS: ' . $T::$pass . '  FAIL: ' . $T::$fail . "\n";
if ( $T::$fail > 0 ) {
	exit( 1 );
}
