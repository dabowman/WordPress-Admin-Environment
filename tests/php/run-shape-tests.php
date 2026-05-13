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

// Known region sources — v1 dispatch ids; v2 shells declare role/template/app instead.
$known_region_sources = array(
	'core:sidebar-region',
	'core:toolbar-region',
	'core:content-region',
	'core:preview-region',
	'core:overlay-region',
	'core:drawer-region',
);

// Known engine sources.
$known_engines = array( 'core:default', 'core:single-pane', 'core:desktop' );

/**
 * Walk a v2 region tree (top-level map of regions, each possibly with
 * nested `regions`) and collect every namespaced app id referenced via
 * `app` fields. Children are inspected recursively.
 */
function wpas_collect_v2_app_ids( $regions, &$out ) {
	foreach ( $regions as $rid => $r ) {
		if ( ! is_array( $r ) ) {
			continue;
		}
		if ( isset( $r['app'] ) && is_string( $r['app'] ) ) {
			$out[] = $r['app'];
		}
		if ( ! empty( $r['regions'] ) && is_array( $r['regions'] ) ) {
			wpas_collect_v2_app_ids( $r['regions'], $out );
		}
	}
}

foreach ( $shells as $slug ) {
	echo "\n— Shell: $slug —\n";
	update_option( 'wp_admin_shell_active_shell', $slug );
	WP_Admin_Shell_Cache::flush();
	WP_Admin_Shell_Resolver::reset_request_memo();

	$config = wp_admin_shell_get_active_config();

	$is_v2 = isset( $config['engine'] ) && ! isset( $config['settings'] );

	// Engine. v2 puts it at the root; v1 nests under settings.shell.layoutEngine.
	$engine = $is_v2
		? ( $config['engine'] ?? null )
		: ( $config['settings']['shell']['layoutEngine'] ?? null );
	$engine_path = $is_v2 ? 'engine' : 'settings.shell.layoutEngine';
	$T::ok(
		"$slug: $engine_path present",
		$engine !== null,
		'engine = ' . var_export( $engine, true )
	);
	$T::ok(
		"$slug: layoutEngine registered ($engine)",
		in_array( $engine, $known_engines, true ),
		'expected one of ' . implode( ',', $known_engines )
	);

	// Regions. v2 at root, v1 under settings.regions.
	$regions = $is_v2
		? ( $config['regions'] ?? array() )
		: ( $config['settings']['regions'] ?? array() );
	$T::ok( "$slug: ≥1 region", count( $regions ) >= 1, 'count=' . count( $regions ) );

	if ( $is_v2 ) {
		// v2 shells must NOT carry legacy region.source / region.kind / region.contains.
		foreach ( $regions as $rid => $r ) {
			$T::ok(
				"$slug: region '$rid' has no legacy source/kind/contains",
				! isset( $r['source'] ) && ! isset( $r['kind'] ) && ! isset( $r['contains'] )
			);
			$T::ok(
				"$slug: region '$rid' has role or template",
				isset( $r['role'] ) || isset( $r['template'] )
			);
		}
	} else {
		foreach ( $regions as $rid => $r ) {
			$T::ok(
				"$slug: region '$rid' source registered ({$r['source']})",
				in_array( $r['source'], $known_region_sources, true )
			);
		}
	}

	// Applications / app ids.
	if ( $is_v2 ) {
		$app_ids = array();
		wpas_collect_v2_app_ids( $regions, $app_ids );
		foreach ( ( $config['routes'] ?? array() ) as $pattern => $route ) {
			if ( isset( $route['app'] ) && is_string( $route['app'] ) ) {
				$app_ids[] = $route['app'];
			}
		}
		$app_ids = array_values( array_unique( $app_ids ) );
		$T::ok( "$slug: ≥1 app id (regions + routes)", count( $app_ids ) >= 1, 'count=' . count( $app_ids ) );
	} else {
		$apps    = $config['settings']['applications'] ?? array();
		$app_ids = array_column( $apps, 'id' );
		$T::ok( "$slug: ≥1 application", count( $apps ) >= 1, 'count=' . count( $apps ) );
	}

	// defaultRoute / default-route.
	$default_route = $is_v2
		? ( $config['default-route'] ?? null )
		: ( $config['settings']['defaultRoute'] ?? $config['defaultRoute'] ?? null );
	if ( $default_route !== null ) {
		if ( $is_v2 ) {
			// v2: default-route must match a routes block pattern.
			$routes = $config['routes'] ?? array();
			$matched = false;
			foreach ( array_keys( $routes ) as $pattern ) {
				if (
					class_exists( 'WP_Admin_Shell_Manifest_Resolver' ) &&
					WP_Admin_Shell_Manifest_Resolver::match_route( $pattern, $default_route ) !== null
				) {
					$matched = true;
					break;
				}
			}
			$T::ok(
				"$slug: default-route '$default_route' matches a routes pattern",
				$matched,
				'patterns: ' . implode( ',', array_keys( $routes ) )
			);
		} else {
			$trimmed  = ltrim( preg_replace( '/^#?\/?/', '', (string) $default_route ), '/' );
			$first    = explode( '/', $trimmed )[0];
			$resolves = in_array( $first, $app_ids, true );
			$T::ok(
				"$slug: defaultRoute '$default_route' resolves to known app id",
				$resolves,
				$resolves ? '' : "first segment '$first' not in app ids: " . implode( ',', $app_ids )
			);
		}
	} else {
		$T::ok( "$slug: defaultRoute may be null (auto-pick first non-hidden)", true );
	}

	// v1 only: every app in `regions[*].contains` is also in applications.
	if ( ! $is_v2 ) {
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

	// Navigation must serialize as a JSON array, not an object. v0 shells
	// auto-build nav from non-hidden apps; if the build path leaves sparse
	// integer keys, wp_json_encode emits an object → JS Array.isArray() false
	// → pruneNavItems returns []. Bug fixed by wrapping with array_values()
	// in the v0→v1 normalizer. v2 shells inline nav config directly into
	// the region declaration (no `__nav` synthesized id) so this scan is
	// v0/v1 only.
	if ( ! $is_v2 ) {
		$apps = $config['settings']['applications'] ?? array();
		$nav  = $config['settings']['navigation'] ?? null;
		if ( $nav === null ) {
			foreach ( $apps as $a ) {
				if ( ( $a['id'] ?? null ) === '__nav' ) {
					$nav = $a['config']['items'] ?? null;
					break;
				}
			}
		}
		if ( is_array( $nav ) ) {
			$T::ok(
				"$slug: navigation is a sequential list (no sparse keys)",
				array_is_list( $nav ),
				'keys: ' . implode( ',', array_keys( $nav ) )
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
