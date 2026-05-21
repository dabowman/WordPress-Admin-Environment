<?php
/**
 * Resolver-shape integration tests.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-shape-tests.php`
 *
 * For each bundled shell, runs the full resolver pipeline and asserts
 * the resolved tree has the structural invariants the runtime depends on:
 *
 *   - top-level `engine` present and registered.
 *   - `regions` has ≥ 1 entry; every region declares `role` or `template`.
 *   - ≥ 1 app id referenced via regions + routes.
 *   - `default-route` resolves to a routes pattern.
 *   - v3 shape distinctives: top-level `screens` block present, top-level
 *     `workspace` block present, `version === 3`.
 *   - Multi-app screens (declaring `apps[]` with `slot` fields) synthesize
 *     the expected slot-namespaced routes (`@<slot>/<path>`).
 *
 * Bug class this catches: canonical path drift between author files
 * and runtime readers (e.g. a v3 reshape that loses the synthetic v2
 * runtime path).
 *
 * Bug class this DOES NOT catch: React component-level render bugs
 * (those need the JSDOM smoke harness — separate issue).
 *
 * History: v1-shape branches dropped in Phase 3d.3 (all bundled shells
 * are v3-shape; the v3 compiler synthesizes v2-runtime shape so the
 * runtime branch still validates after compile).
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

// Known engine sources.
$known_engines = array( 'core:default', 'core:single-pane', 'core:desktop' );

/**
 * Walk a v2-runtime region tree (top-level map of regions, each possibly
 * with nested `regions`) and collect every namespaced app id referenced
 * via `app` fields. Children are inspected recursively.
 */
function wpas_collect_region_app_ids( $regions, &$out ) {
	foreach ( $regions as $rid => $r ) {
		if ( ! is_array( $r ) ) {
			continue;
		}
		if ( isset( $r['app'] ) && is_string( $r['app'] ) ) {
			$out[] = $r['app'];
		}
		if ( ! empty( $r['regions'] ) && is_array( $r['regions'] ) ) {
			wpas_collect_region_app_ids( $r['regions'], $out );
		}
	}
}

foreach ( $shells as $slug ) {
	echo "\n— Shell: $slug —\n";
	update_option( 'wp_admin_shell_active_shell', $slug );
	WP_Admin_Shell_Cache::flush();
	WP_Admin_Shell_Resolver::reset_request_memo();

	$config = wp_admin_shell_get_active_config();

	// All bundled shells are v3-shape; the v3 compiler synthesizes
	// `regions` / `routes` / `default-route` on top so the resolved doc
	// surfaces BOTH the v3 authoring layer (screens / menu / workspace)
	// AND the v2-runtime layer the kernel consumes.
	$T::ok(
		"$slug: v3 shape — top-level `workspace` block present",
		isset( $config['workspace'] ) && is_array( $config['workspace'] )
	);
	$T::ok(
		"$slug: v3 shape — top-level `screens` block present",
		isset( $config['screens'] ) && is_array( $config['screens'] )
	);

	// Engine. v3 places it at workspace.engine; the v3 compiler promotes
	// it to top-level `engine` for the kernel.
	$engine = $config['engine'] ?? null;
	$T::ok(
		"$slug: engine present (compiler-promoted from workspace.engine)",
		$engine !== null,
		'engine = ' . var_export( $engine, true )
	);
	$T::ok(
		"$slug: engine is registered ($engine)",
		in_array( $engine, $known_engines, true ),
		'expected one of ' . implode( ',', $known_engines )
	);

	// Regions — v2-runtime shape, synthesized by the v3 compiler from the
	// active engine manifest's `defaultRegions` + workspace `regions`.
	$regions = $config['regions'] ?? array();
	$T::ok( "$slug: ≥1 region", count( $regions ) >= 1, 'count=' . count( $regions ) );

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

	// Applications / app ids — collect from regions + routes.
	$app_ids = array();
	wpas_collect_region_app_ids( $regions, $app_ids );
	foreach ( ( $config['routes'] ?? array() ) as $pattern => $route ) {
		if ( isset( $route['app'] ) && is_string( $route['app'] ) ) {
			$app_ids[] = $route['app'];
		}
	}
	$app_ids = array_values( array_unique( $app_ids ) );
	$T::ok( "$slug: ≥1 app id (regions + routes)", count( $app_ids ) >= 1, 'count=' . count( $app_ids ) );

	// default-route — must match a routes block pattern (v2-runtime shape).
	$default_route = $config['default-route'] ?? null;
	if ( $default_route !== null ) {
		$routes  = $config['routes'] ?? array();
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
		$T::ok( "$slug: default-route may be null (auto-pick first non-hidden)", true );
	}

	// Multi-app screens — every screen declaring `apps[]` with a `slot`
	// other than `_self` should produce a slot-namespaced route. Walk
	// the screens block + assert the compiler's synthesize_routes() did
	// its job. v2 shells with no `screens` block skip this check
	// (bundled v3 shells all have it).
	if ( isset( $config['screens'] ) && is_array( $config['screens'] ) ) {
		$routes_block = $config['routes'] ?? array();
		foreach ( $config['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) || ! isset( $screen['apps'] ) || ! is_array( $screen['apps'] ) ) {
				continue;
			}
			$apps_list = array_values( $screen['apps'] );
			if ( count( $apps_list ) < 2 ) {
				continue;
			}
			$path = isset( $screen['path'] ) && is_string( $screen['path'] ) && $screen['path'] !== ''
				? $screen['path']
				: '/' . $screen_id;
			// Walk non-primary entries (skip apps[0] — handled as primary).
			for ( $i = 1; $i < count( $apps_list ); $i++ ) {
				$entry = $apps_list[ $i ];
				if ( ! is_array( $entry ) ) {
					continue;
				}
				$entry_slot = isset( $entry['slot'] ) && is_string( $entry['slot'] ) && $entry['slot'] !== ''
					? $entry['slot']
					: '';
				// Apps without a slot are app-internal compositions (e.g.
				// dashboard host's `slot: "grid"` widgets that mount
				// inside the host). They shouldn't emit slot routes.
				if ( $entry_slot === '' || $entry_slot === '_self' ) {
					continue;
				}
				// `grid` is an app-declared slot used by dashboard-host;
				// it mounts inside the host, not via engine slots, so it
				// shouldn't emit a slot-namespaced route either. The host
				// reads the widgets directly from the screen.apps block.
				if ( $entry_slot === 'grid' ) {
					continue;
				}
				$slot_route = '@' . $entry_slot . '/' . ltrim( $path, '/' );
				$T::ok(
					"$slug: multi-app screen '$screen_id' synthesized slot route '$slot_route'",
					isset( $routes_block[ $slot_route ] ),
					'available routes: ' . implode( ', ', array_keys( $routes_block ) )
				);
			}
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
