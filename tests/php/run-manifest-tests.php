<?php
/**
 * Manifest validator + registry tests (V2.M1 task 4).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-manifest-tests.php`
 *
 * Coverage:
 *   - Validator accepts every fixture under
 *     `tests/php/fixtures/manifests/{apps,engines}/valid/*`
 *   - Validator rejects every fixture under
 *     `tests/php/fixtures/manifests/{apps,engines}/invalid/*`
 *   - Registry register_app / register_engine accept arrays + paths
 *   - Registry rejects duplicate ids
 *   - Registry list_apps / list_engines return registered manifests
 *   - discover() walks `apps/{name}/app.json` + `engines/{name}/engine.json`
 *
 * The harness uses a fresh registry per assertion (via reset()) so
 * state from prior runs doesn't leak across tests. Idempotent.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Manifest_Test_Runner {
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

	public static function assert_eq( $label, $actual, $expected ) {
		if ( $actual === $expected ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			echo '      expected: ' . var_export( $expected, true ) . "\n";
			echo '      actual:   ' . var_export( $actual, true ) . "\n";
		}
	}

	public static function fixtures_dir() {
		return WP_ADMIN_SHELL_PATH . 'tests/php/fixtures/manifests';
	}
}

$dir = WPAS_Manifest_Test_Runner::fixtures_dir();

echo "\n— Validator: valid app fixtures (must accept) —\n";
foreach ( glob( "$dir/apps/valid/*/app.json" ) as $path ) {
	$result = WP_Admin_Shell_Manifest_Validator::validate_file( $path, 'app' );
	$label  = 'apps/valid/' . basename( dirname( $path ) );
	WPAS_Manifest_Test_Runner::assert_true(
		$label,
		$result['valid'],
		$result['valid'] ? '' : implode( '; ', $result['errors'] )
	);
}

echo "\n— Validator: invalid app fixtures (must reject) —\n";
foreach ( glob( "$dir/apps/invalid/*/app.json" ) as $path ) {
	$result = WP_Admin_Shell_Manifest_Validator::validate_file( $path, 'app' );
	$label  = 'apps/invalid/' . basename( dirname( $path ) );
	WPAS_Manifest_Test_Runner::assert_true(
		$label,
		! $result['valid'],
		$result['valid'] ? 'expected rejection but validator accepted' : ''
	);
}

echo "\n— Validator: valid engine fixtures (must accept) —\n";
foreach ( glob( "$dir/engines/valid/*/engine.json" ) as $path ) {
	$result = WP_Admin_Shell_Manifest_Validator::validate_file( $path, 'engine' );
	$label  = 'engines/valid/' . basename( dirname( $path ) );
	WPAS_Manifest_Test_Runner::assert_true(
		$label,
		$result['valid'],
		$result['valid'] ? '' : implode( '; ', $result['errors'] )
	);
}

echo "\n— Validator: invalid engine fixtures (must reject) —\n";
foreach ( glob( "$dir/engines/invalid/*/engine.json" ) as $path ) {
	$result = WP_Admin_Shell_Manifest_Validator::validate_file( $path, 'engine' );
	$label  = 'engines/invalid/' . basename( dirname( $path ) );
	WPAS_Manifest_Test_Runner::assert_true(
		$label,
		! $result['valid'],
		$result['valid'] ? 'expected rejection but validator accepted' : ''
	);
}

echo "\n— Validator: malformed inputs —\n";
$result = WP_Admin_Shell_Manifest_Validator::validate( 'not-an-array', 'app' );
WPAS_Manifest_Test_Runner::assert_true( 'rejects non-array manifest', ! $result['valid'] );

$result = WP_Admin_Shell_Manifest_Validator::validate( array(), 'app' );
WPAS_Manifest_Test_Runner::assert_true( 'rejects empty manifest', ! $result['valid'] );

$result = WP_Admin_Shell_Manifest_Validator::validate( array( 'id' => 'core:x', 'version' => 'one', 'title' => 'X', 'role' => 'main', 'script' => 'x' ), 'app' );
WPAS_Manifest_Test_Runner::assert_true( 'rejects non-integer version', ! $result['valid'] );

$result = WP_Admin_Shell_Manifest_Validator::validate_file( '/nonexistent/path/app.json', 'app' );
WPAS_Manifest_Test_Runner::assert_true( 'rejects unreadable file path', ! $result['valid'] );

echo "\n— Registry: register_app accepts arrays + paths —\n";
WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();

$id = $registry->register_app( array(
	'id'      => 'core:array-app',
	'version' => 1,
	'title'   => 'Array App',
	'role'    => 'main',
	'script'  => 'array-app',
) );
WPAS_Manifest_Test_Runner::assert_eq( 'register_app(array) returns id', $id, 'core:array-app' );

$path_id = $registry->register_app( "$dir/apps/valid/01-minimal/app.json" );
WPAS_Manifest_Test_Runner::assert_eq( 'register_app(path) returns id', $path_id, 'core:test-minimal-app' );

WPAS_Manifest_Test_Runner::assert_eq(
	'list_apps() length after two registrations',
	count( $registry->list_apps() ),
	2
);

$fetched = $registry->get_app( 'core:array-app' );
WPAS_Manifest_Test_Runner::assert_eq( 'get_app() returns title', $fetched['title'] ?? null, 'Array App' );

WPAS_Manifest_Test_Runner::assert_eq( 'get_app() returns null for unknown id', $registry->get_app( 'core:missing' ), null );

echo "\n— Registry: rejects duplicate ids —\n";
$dup = $registry->register_app( array(
	'id'      => 'core:array-app',
	'version' => 1,
	'title'   => 'Duplicate',
	'role'    => 'main',
	'script'  => 'dup',
) );
WPAS_Manifest_Test_Runner::assert_true( 'register_app() returns WP_Error on duplicate', is_wp_error( $dup ) );
WPAS_Manifest_Test_Runner::assert_eq(
	'first registration wins (title unchanged)',
	$registry->get_app( 'core:array-app' )['title'],
	'Array App'
);

echo "\n— Registry: register_engine —\n";
WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();

$engine_id = $registry->register_engine( "$dir/engines/valid/01-minimal/engine.json" );
WPAS_Manifest_Test_Runner::assert_eq( 'register_engine(path) returns id', $engine_id, 'core:test-minimal-engine' );
WPAS_Manifest_Test_Runner::assert_eq( 'list_engines() length', count( $registry->list_engines() ), 1 );

echo "\n— Registry: register rejects invalid manifest —\n";
$invalid = $registry->register_app( array( 'id' => 'no-namespace', 'version' => 1, 'title' => 'X', 'role' => 'main', 'script' => 'x' ) );
WPAS_Manifest_Test_Runner::assert_true( 'register_app() returns WP_Error on bad namespace', is_wp_error( $invalid ) );

$invalid = $registry->register_app( '/nonexistent/path/app.json' );
WPAS_Manifest_Test_Runner::assert_true( 'register_app() returns WP_Error on missing file', is_wp_error( $invalid ) );

$invalid = $registry->register_app( 42 );
WPAS_Manifest_Test_Runner::assert_true( 'register_app() returns WP_Error on bad input type', is_wp_error( $invalid ) );

echo "\n— Registry: discover() walks apps/ + engines/ —\n";
WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();

$count = $registry->discover( "$dir" );
// fixtures dir layout: apps/valid + apps/invalid + engines/valid + engines/invalid
// discover() recurses one level (apps/* and engines/*), so it sees `valid` + `invalid`
// as candidate folders and looks inside each for app.json/engine.json. Those files
// exist at apps/valid/{...}/app.json — one level deeper. discover() is intentionally
// shallow (per spec convention path), so against this fixture root it finds nothing.
// We instead point at a synthesized root.
WPAS_Manifest_Test_Runner::assert_eq( 'discover() shallow scan against fixtures root finds 0', $count, 0 );

// Build a temporary discovery-shaped tree by symlinking valid fixture dirs.
$tmp = sys_get_temp_dir() . '/wpas-discover-' . uniqid();
mkdir( "$tmp/apps", 0777, true );
mkdir( "$tmp/engines", 0777, true );
symlink( "$dir/apps/valid/01-minimal", "$tmp/apps/01-minimal" );
symlink( "$dir/apps/valid/02-full",    "$tmp/apps/02-full" );
symlink( "$dir/engines/valid/01-minimal", "$tmp/engines/01-minimal" );

WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();
$count    = $registry->discover( $tmp );
WPAS_Manifest_Test_Runner::assert_eq( 'discover() finds 2 apps + 1 engine = 3', $count, 3 );
WPAS_Manifest_Test_Runner::assert_eq( 'list_apps() after discover()', count( $registry->list_apps() ), 2 );
WPAS_Manifest_Test_Runner::assert_eq( 'list_engines() after discover()', count( $registry->list_engines() ), 1 );

// Cleanup.
unlink( "$tmp/apps/01-minimal" );
unlink( "$tmp/apps/02-full" );
unlink( "$tmp/engines/01-minimal" );
rmdir( "$tmp/apps" );
rmdir( "$tmp/engines" );
rmdir( $tmp );

echo "\n— Boot-time registration: shell-bundled core engine —\n";
WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();
$registry->register_engine(
	WP_ADMIN_SHELL_PATH . 'src/runtime/engines/core-default/engine.json'
);
$engine = $registry->get_engine( 'core:default' );
WPAS_Manifest_Test_Runner::assert_true(
	'core:default engine.json registers',
	null !== $engine
);
WPAS_Manifest_Test_Runner::assert_eq(
	'core:default has 5 templates',
	count( $engine['templates'] ?? array() ),
	5
);
WPAS_Manifest_Test_Runner::assert_true(
	'core:sidebar template ships',
	isset( $engine['templates']['core:sidebar'] )
);
WPAS_Manifest_Test_Runner::assert_true(
	'core:topbar template ships with start/center/end children',
	isset( $engine['templates']['core:topbar']['regions']['start'] )
		&& isset( $engine['templates']['core:topbar']['regions']['center'] )
		&& isset( $engine['templates']['core:topbar']['regions']['end'] )
);
WPAS_Manifest_Test_Runner::assert_eq(
	'default-arrangement is wp-chrome',
	$engine['default-arrangement'],
	'wp-chrome'
);

echo "\n— register_template: plugin extension point (spec §13 #4) —\n";
WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();
$registry->register_engine(
	WP_ADMIN_SHELL_PATH . 'src/runtime/engines/core-default/engine.json'
);

$ok = $registry->register_template(
	'core:default',
	'plugin:foo/popover',
	array(
		'role'          => 'dialog',
		'platform'      => array( 'core:modal' => true, 'core:dismiss-on' => array( 'Escape' ) ),
		'default-style' => array( 'inline-size' => '320px' ),
	)
);
WPAS_Manifest_Test_Runner::assert_eq(
	'register_template returns the id on success',
	$ok,
	'plugin:foo/popover'
);
$engine = $registry->get_engine( 'core:default' );
WPAS_Manifest_Test_Runner::assert_true(
	'engine.templates now contains the new template',
	isset( $engine['templates']['plugin:foo/popover'] )
);
WPAS_Manifest_Test_Runner::assert_eq(
	'plugin template body merged with role intact',
	$engine['templates']['plugin:foo/popover']['role'] ?? null,
	'dialog'
);

WPAS_Manifest_Test_Runner::assert_true(
	'register_template: unknown engine → WP_Error',
	is_wp_error( $registry->register_template(
		'core:not-an-engine',
		'plugin:foo/x',
		array( 'role' => 'region' )
	) )
);
WPAS_Manifest_Test_Runner::assert_true(
	'register_template: missing role → WP_Error',
	is_wp_error( $registry->register_template(
		'core:default',
		'plugin:foo/no-role',
		array( 'platform' => array() )
	) )
);
WPAS_Manifest_Test_Runner::assert_true(
	'register_template: invalid id → WP_Error',
	is_wp_error( $registry->register_template(
		'core:default',
		'BadId!',
		array( 'role' => 'region' )
	) )
);
WPAS_Manifest_Test_Runner::assert_true(
	'register_template: duplicate id → WP_Error (first wins)',
	is_wp_error( $registry->register_template(
		'core:default',
		'plugin:foo/popover',
		array( 'role' => 'region' )
	) )
);

echo "\n— Resolver: app + engine + template references —\n";
WP_Admin_Shell_Manifest_Registry::reset();
$registry = WP_Admin_Shell_Manifest_Registry::instance();
$registry->register_app( "$dir/apps/valid/01-minimal/app.json" );
$registry->register_engine( "$dir/engines/valid/01-minimal/engine.json" );

$resolver = new WP_Admin_Shell_Manifest_Resolver( $registry );

WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_app() returns manifest for registered id',
	$resolver->resolve_app( 'core:test-minimal-app' )['id'] ?? null,
	'core:test-minimal-app'
);
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_app() returns null for unregistered id',
	$resolver->resolve_app( 'core:not-registered' ),
	null
);
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_engine() returns manifest for registered id',
	$resolver->resolve_engine( 'core:test-minimal-engine' )['id'] ?? null,
	'core:test-minimal-engine'
);
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_template() returns template definition',
	$resolver->resolve_template( 'core:test-minimal-engine', 'core:main' )['role'] ?? null,
	'main'
);
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_template() returns null for missing template',
	$resolver->resolve_template( 'core:test-minimal-engine', 'core:nonexistent' ),
	null
);
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_template() returns null when engine missing',
	$resolver->resolve_template( 'core:no-engine', 'core:main' ),
	null
);

echo "\n— Resolver: role resolution through template inheritance —\n";

// 1. Explicit role on the region wins.
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_role() prefers region.role',
	$resolver->resolve_role( array( 'role' => 'navigation' ), 'core:test-minimal-engine' ),
	'navigation'
);

// 2. Template's role is inherited when region.role absent.
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_role() inherits from template when region.role absent',
	$resolver->resolve_role(
		array( 'template' => 'core:main' ),
		'core:test-minimal-engine'
	),
	'main'
);

// 3. Nested child inherits from parent template's same-named child.
$parent_template = array(
	'role'    => 'banner',
	'regions' => array(
		'start' => array( 'role' => 'region' ),
	),
);
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_role() inherits from parent-template child when region declared bare',
	$resolver->resolve_role( array(), 'core:test-minimal-engine', $parent_template, 'start' ),
	'region'
);

// 4. Unresolvable region returns null.
WPAS_Manifest_Test_Runner::assert_eq(
	'resolve_role() returns null when nothing resolves',
	$resolver->resolve_role( array(), 'core:no-engine' ),
	null
);

echo "\n— Resolver: route-key shape validation —\n";
WPAS_Manifest_Test_Runner::assert_true( '_self is valid', WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( '_self' ) );
WPAS_Manifest_Test_Runner::assert_true( 'detail is valid', WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( 'detail' ) );
WPAS_Manifest_Test_Runner::assert_true( 'kebab-case is valid', WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( 'inspector-pane' ) );
WPAS_Manifest_Test_Runner::assert_true( 'CamelCase is invalid', ! WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( 'Detail' ) );
WPAS_Manifest_Test_Runner::assert_true( 'leading digit is invalid', ! WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( '1detail' ) );
WPAS_Manifest_Test_Runner::assert_true( '_blank is invalid (no longer a routing concept)', ! WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( '_blank' ) );
WPAS_Manifest_Test_Runner::assert_true( 'empty string invalid', ! WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( '' ) );
WPAS_Manifest_Test_Runner::assert_true( 'non-string invalid', ! WP_Admin_Shell_Manifest_Resolver::is_valid_route_key( 42 ) );

echo "\n— Resolver: route pattern matching —\n";
$matched = WP_Admin_Shell_Manifest_Resolver::match_route( '/posts/{id}', '/posts/42' );
WPAS_Manifest_Test_Runner::assert_eq( 'match_route captures id', $matched, array( 'id' => '42' ) );

$matched = WP_Admin_Shell_Manifest_Resolver::match_route( '/posts/new', '/posts/new' );
WPAS_Manifest_Test_Runner::assert_eq( 'static segment matches exactly', $matched, array() );

$matched = WP_Admin_Shell_Manifest_Resolver::match_route( '/posts/{id}', '/pages/42' );
WPAS_Manifest_Test_Runner::assert_eq( 'mismatched static segment fails', $matched, null );

$matched = WP_Admin_Shell_Manifest_Resolver::match_route( '/posts/{type}/{id}', '/posts/page/7' );
WPAS_Manifest_Test_Runner::assert_eq( 'multi-param capture', $matched, array( 'type' => 'page', 'id' => '7' ) );

$matched = WP_Admin_Shell_Manifest_Resolver::match_route( '/media/*', '/media/2025/05/foo.jpg' );
WPAS_Manifest_Test_Runner::assert_eq( 'wildcard captures rest', $matched, array( '*' => '2025/05/foo.jpg' ) );

WPAS_Manifest_Test_Runner::assert_true(
	'is_valid_route_pattern accepts /posts',
	WP_Admin_Shell_Manifest_Resolver::is_valid_route_pattern( '/posts' )
);
WPAS_Manifest_Test_Runner::assert_true(
	'is_valid_route_pattern rejects no-leading-slash',
	! WP_Admin_Shell_Manifest_Resolver::is_valid_route_pattern( 'posts' )
);

echo "\n— Resolver: default-route matching —\n";
$routes = array(
	'/posts'      => array( 'app' => 'core:posts' ),
	'/posts/{id}' => array( 'app' => 'core:editor' ),
	'/media'      => array( 'app' => 'core:media' ),
);
WPAS_Manifest_Test_Runner::assert_eq(
	'default-route matches static pattern',
	WP_Admin_Shell_Manifest_Resolver::match_default_route( '/posts', $routes ),
	'/posts'
);
WPAS_Manifest_Test_Runner::assert_eq(
	'default-route matches parameter pattern (most-specific not enforced — first match wins per source order)',
	WP_Admin_Shell_Manifest_Resolver::match_default_route( '/posts/42', $routes ),
	'/posts/{id}'
);
WPAS_Manifest_Test_Runner::assert_eq(
	'default-route returns null for unknown path',
	WP_Admin_Shell_Manifest_Resolver::match_default_route( '/nonexistent', $routes ),
	null
);

echo "\n— Summary —\n";
echo 'PASS: ' . WPAS_Manifest_Test_Runner::$pass . '  FAIL: ' . WPAS_Manifest_Test_Runner::$fail . "\n";

if ( WPAS_Manifest_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
