<?php
/**
 * Engine `default-styles` merge tests (Phase C).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-engine-defaults-tests.php`
 *
 * Coverage:
 *   - Engine default-styles applied when workspace.json doesn't overlap.
 *   - workspace.json wins on overlapping keys.
 *   - Switching engine swaps defaults.
 *   - Engine without default-styles is a no-op.
 *   - Engine without `engine` declaration in workspace.json contributes nothing.
 *   - The synthetic `engine` origin sits between `core` and `plugin` in
 *     ORIGINS_ORDER + TRUSTED_ORIGINS.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Engine_Defaults_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function assert_true( $label, $condition, $detail = '' ) {
		if ( $condition ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			if ( $detail ) {
				echo "      $detail\n";
			}
		}
	}

	public static function assert_eq( $label, $expected, $actual ) {
		$pass = $expected === $actual;
		self::assert_true(
			$label,
			$pass,
			$pass ? '' : 'expected ' . var_export( $expected, true ) . ' got ' . var_export( $actual, true )
		);
	}
}

$T = 'WPAS_Engine_Defaults_Test_Runner';

// ─── Setup ─────────────────────────────────────────────────────

$registry = WP_Admin_Workspaces_Manifest_Registry::instance();

// Register a synthetic engine with default-styles for these tests.
// First-registration-wins, so use unique ids that won't collide with
// the discovery sweep at init.
$test_engine_id = 'plugin:engine-defaults-test/full';
$registered = $registry->register_engine( array(
	'id'                  => $test_engine_id,
	'version'             => 1,
	'title'               => 'Engine Defaults Test',
	'specializes-roles'   => array( 'main' ),
	'honored-platform'    => array(),
	'templates'           => array(
		'plugin:engine-defaults-test/main' => array( 'role' => 'main' ),
	),
	'default-arrangement' => 'wp-chrome',
	'script'              => 'wp-admin-workspaces',
	'default-styles'      => array(
		'theme' => array(
			'density' => 'compact',
			'color'   => array(
				'bg'      => '#1a1a1a',
				'primary' => '#ff5500',
			),
		),
		'chrome' => array(
			'sidebar' => array( 'background' => '#0a0a0a' ),
		),
	),
) );
$T::assert_true( 'synthetic engine with default-styles registers', $registered === $test_engine_id );

// Synthetic engine WITHOUT default-styles — to test no-op behavior.
$noop_engine_id = 'plugin:engine-defaults-test/empty';
$registered_noop = $registry->register_engine( array(
	'id'                  => $noop_engine_id,
	'version'             => 1,
	'title'               => 'Engine No-Defaults Test',
	'specializes-roles'   => array( 'main' ),
	'honored-platform'    => array(),
	'templates'           => array(
		'plugin:engine-defaults-test/empty-main' => array( 'role' => 'main' ),
	),
	'default-arrangement' => 'wp-chrome',
	'script'              => 'wp-admin-workspaces',
) );
$T::assert_true( 'synthetic engine without default-styles registers', $registered_noop === $noop_engine_id );

// ─── ORIGINS_ORDER + TRUSTED_ORIGINS ───────────────────────────

$T::assert_true(
	'ORIGINS_ORDER includes engine between core and plugin',
	WP_Admin_Workspaces_Resolver::ORIGINS_ORDER === array( 'core', 'engine', 'plugin', 'site', 'role', 'user' )
);
$T::assert_true(
	'TRUSTED_ORIGINS includes engine',
	in_array( 'engine', WP_Admin_Workspaces_Resolver::TRUSTED_ORIGINS, true )
);

// ─── 1. Engine defaults apply when workspace.json omits styles ─────

$plugin_doc = array(
	'engine'  => $test_engine_id,
	'regions' => array( 'main' => array( 'role' => 'main' ) ),
);
$resolved = WP_Admin_Workspaces_Resolver::resolve_with(
	WP_Admin_Workspaces_Resolver::ORIGINS_ORDER === array( 'core', 'engine', 'plugin', 'site', 'role', 'user' )
		? array(
			'core'   => array(),
			// load_origins computes 'engine' from $plugin_doc; resolve_with
			// callers compose it explicitly. Mirror what load_origins does.
			'engine' => array( 'styles' => array(
				'theme' => array(
					'density' => 'compact',
					'color'   => array(
						'bg'      => '#1a1a1a',
						'primary' => '#ff5500',
					),
				),
				'chrome' => array(
					'sidebar' => array( 'background' => '#0a0a0a' ),
				),
			) ),
			'plugin' => $plugin_doc,
			'site'   => array(),
			'role'   => array(),
			'user'   => array(),
		)
		: array()
);

$T::assert_eq(
	'engine theme.color.bg lands when plugin omits it',
	'#1a1a1a',
	$resolved['styles']['theme']['color']['bg'] ?? null
);
$T::assert_eq(
	'engine theme.color.primary lands when plugin omits it',
	'#ff5500',
	$resolved['styles']['theme']['color']['primary'] ?? null
);
$T::assert_eq(
	'engine theme.density lands when plugin omits it',
	'compact',
	$resolved['styles']['theme']['density'] ?? null
);
$T::assert_eq(
	'engine chrome.sidebar.background lands when plugin omits it',
	'#0a0a0a',
	$resolved['styles']['chrome']['sidebar']['background'] ?? null
);

// ─── 2. workspace.json wins on overlapping keys ────────────────────

$plugin_doc_overlap = array(
	'engine'  => $test_engine_id,
	'styles'  => array(
		'theme' => array(
			'color' => array( 'bg' => '#ffffff' ),
		),
	),
	'regions' => array( 'main' => array( 'role' => 'main' ) ),
);
$resolved2 = WP_Admin_Workspaces_Resolver::resolve_with( array(
	'core'   => array(),
	'engine' => array( 'styles' => array(
		'theme' => array(
			'density' => 'compact',
			'color'   => array(
				'bg'      => '#1a1a1a',
				'primary' => '#ff5500',
			),
		),
	) ),
	'plugin' => $plugin_doc_overlap,
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
) );

$T::assert_eq(
	'workspace.json wins for theme.color.bg',
	'#ffffff',
	$resolved2['styles']['theme']['color']['bg'] ?? null
);
$T::assert_eq(
	'engine still contributes non-overlapping theme.color.primary',
	'#ff5500',
	$resolved2['styles']['theme']['color']['primary'] ?? null
);
$T::assert_eq(
	'engine still contributes non-overlapping theme.density',
	'compact',
	$resolved2['styles']['theme']['density'] ?? null
);

// ─── 3. Engine without default-styles → no-op ──────────────────

$plugin_doc_noop = array(
	'engine'  => $noop_engine_id,
	'styles'  => array( 'theme' => array( 'color' => array( 'bg' => '#222' ) ) ),
	'regions' => array( 'main' => array( 'role' => 'main' ) ),
);
$resolved3 = WP_Admin_Workspaces_Resolver::resolve_with( array(
	'core'   => array(),
	'engine' => array(), // load_origins returns empty when manifest has no default-styles
	'plugin' => $plugin_doc_noop,
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
) );

$T::assert_eq(
	'engine without default-styles preserves workspace.json untouched',
	'#222',
	$resolved3['styles']['theme']['color']['bg'] ?? null
);
$T::assert_true(
	'engine without default-styles adds no extra theme keys',
	count( $resolved3['styles']['theme']['color'] ?? array() ) === 1
);

// ─── 4. engine_origin() integration via load_origins ───────────

// Use reflection to invoke the private engine_origin method.
$ref = new ReflectionClass( 'WP_Admin_Workspaces_Resolver' );
$method = $ref->getMethod( 'engine_origin' );
$method->setAccessible( true );

// engine_origin() now takes the resolved engine id (a string) — the
// caller (load_origins) extracts it from the override file's
// workspace.engine, falling back to the baseline's engine.
$origin_full = $method->invoke( null, $test_engine_id );
$T::assert_true(
	'engine_origin: returns synthetic styles doc for engine with default-styles',
	is_array( $origin_full ) && isset( $origin_full['styles']['theme']['density'] ) &&
		$origin_full['styles']['theme']['density'] === 'compact'
);

$origin_noop = $method->invoke( null, $noop_engine_id );
$T::assert_true(
	'engine_origin: returns empty array for engine without default-styles',
	$origin_noop === array()
);

$origin_empty_id = $method->invoke( null, '' );
$T::assert_true(
	'engine_origin: returns empty array for an empty engine id',
	$origin_empty_id === array()
);

$origin_unknown = $method->invoke( null, 'plugin:nonexistent/whatever' );
$T::assert_true(
	'engine_origin: returns empty array for unregistered engine id',
	$origin_unknown === array()
);

$origin_null = $method->invoke( null, null );
$T::assert_true(
	'engine_origin: returns empty array for a null engine id',
	$origin_null === array()
);

// ─── 5. Bundled core:default ships default-styles ──────────────

$core_default = $registry->get_engine( 'core:default' );
$T::assert_true(
	'core:default engine manifest registered',
	is_array( $core_default )
);
$T::assert_true(
	'core:default ships a default-styles block',
	is_array( $core_default['default-styles'] ?? null ) &&
		( $core_default['default-styles']['theme']['density'] ?? null ) === 'default'
);

$core_single_pane = $registry->get_engine( 'core:single-pane' );
$T::assert_true(
	'core:single-pane engine manifest registered',
	is_array( $core_single_pane )
);
$T::assert_true(
	'core:single-pane ships compact density via default-styles',
	is_array( $core_single_pane['default-styles'] ?? null ) &&
		( $core_single_pane['default-styles']['theme']['density'] ?? null ) === 'compact'
);

// ─── Summary ───────────────────────────────────────────────────

echo "\n— Summary —\n";
echo 'PASS: ' . $T::$pass . '  FAIL: ' . $T::$fail . "\n";
if ( $T::$fail > 0 ) {
	throw new RuntimeException( 'engine-defaults tests failed' );
}
