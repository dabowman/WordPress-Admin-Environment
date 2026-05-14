<?php
/**
 * Menu-item + admin-route shim tests — Track B (C3) phase.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-menu-route-shims-tests.php`
 *
 * Coverage:
 *   - Both shim APIs validate input + reject duplicates with WP_Error.
 *   - `wp_admin_shell_data_plugin` filter contributes registered items
 *     additively into the resolved tree.
 *   - Default region resolution (first `core:navigation` region) +
 *     explicit region (bare id and slash-path) routing.
 *   - CIAB `parent` + `parent_type=drilldown` nesting builds a `screen`
 *     subtree under the named parent.
 *   - `parent_type=dropdown` falls back to drilldown without fataling.
 *   - `gc_time` accepted + ignored (no fatal, no schema rejection).
 *   - Cap-collection sweep picks up shim-declared `capability` so the
 *     shell's 4-layer cap model gates shim items the same as inline
 *     admin.json items.
 *   - End-to-end: register both shims; declare admin.json that does NOT
 *     mention them; resolved cascade tree contains both.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Shim_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

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

	public static function assert_true( $label, $actual ) {
		self::assert_eq( $label, (bool) $actual, true );
	}

	public static function assert_wp_error( $label, $actual ) {
		self::assert_true( $label, is_wp_error( $actual ) );
	}
}

// Helper: build a synthetic shell doc with an explicit nav region tree.
function wpas_shim_test_shell_doc() {
	return array(
		'engine'  => 'core:default',
		'regions' => array(
			'sidebar' => array(
				'template' => 'core:sidebar',
				'regions'  => array(
					'hub' => array( 'role' => 'region', 'app' => 'core:site-hub' ),
					'nav' => array(
						'role'   => 'navigation',
						'app'    => 'core:navigation',
						'config' => array(
							'items' => array(
								array(
									'label'      => 'Existing Posts',
									'icon'       => 'post',
									'href'       => '#/posts',
									'capability' => 'edit_posts',
								),
							),
						),
					),
				),
			),
			'content' => array(
				'template' => 'core:main',
				'routing'  => array( 'route-key' => '_self' ),
			),
		),
		'routes'  => array(
			'/posts' => array(
				'app'    => 'core:iframe-fallback',
				'config' => array( 'url' => 'edit.php' ),
			),
		),
	);
}

// Helper: build a shell doc with a SECOND nav region nested deeper for
// region routing tests.
function wpas_shim_test_dual_nav_doc() {
	return array(
		'engine'  => 'core:default',
		'regions' => array(
			'sidebar' => array(
				'template' => 'core:sidebar',
				'regions'  => array(
					'nav' => array(
						'role'   => 'navigation',
						'app'    => 'core:navigation',
						'config' => array( 'items' => array() ),
					),
				),
			),
			'sub-shell' => array(
				'role'    => 'region',
				'regions' => array(
					'inner-nav' => array(
						'role'   => 'navigation',
						'app'    => 'core:navigation',
						'config' => array( 'items' => array() ),
					),
				),
			),
		),
	);
}

WP_Admin_Shell_Menu_Items::reset();
WP_Admin_Shell_Admin_Routes::reset();

// -----------------------------------------------------------------------------
// Menu items — registration + validation
// -----------------------------------------------------------------------------

$id = wp_admin_shell_register_menu_item( 'plugin-foo', array(
	'to'         => '/foo',
	'label'      => 'Foo',
	'icon'       => 'star-filled',
	'capability' => 'edit_posts',
) );
WPAS_Shim_Test_Runner::assert_eq( 'register returns id', $id, 'plugin-foo' );

$registry = WP_Admin_Shell_Menu_Items::all();
WPAS_Shim_Test_Runner::assert_true(
	'registry contains registered item',
	isset( $registry['plugin-foo'] )
);

// Validation rejections.
$err = wp_admin_shell_register_menu_item( '', array( 'to' => '/foo', 'label' => 'Foo' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_shell_register_menu_item( 'plugin-bar', 'not-an-array' );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects non-array args', $err );

$err = wp_admin_shell_register_menu_item( 'plugin-bar', array( 'to' => '/bar' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects missing label', $err );

$err = wp_admin_shell_register_menu_item( 'plugin-bar', array( 'label' => 'Bar' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects missing both `to` and `parent_type`', $err );

$err = wp_admin_shell_register_menu_item( 'plugin-bar', array(
	'label'       => 'Bar',
	'parent_type' => 'mystery',
) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects unknown parent_type', $err );

// Duplicate id rejection.
$err = wp_admin_shell_register_menu_item( 'plugin-foo', array( 'to' => '/foo', 'label' => 'Foo Again' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects duplicate id', $err );

// -----------------------------------------------------------------------------
// Menu items — default region resolution
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();

wp_admin_shell_register_menu_item( 'plugin-default', array(
	'to'    => '/plugin-default',
	'label' => 'Plugin Default',
) );

$doc      = wpas_shim_test_shell_doc();
$filtered = WP_Admin_Shell_Menu_Items::contribute( $doc );
$nav_items = $filtered['regions']['sidebar']['regions']['nav']['config']['items'];

WPAS_Shim_Test_Runner::assert_eq(
	'default region resolves to first core:navigation region — items count',
	count( $nav_items ),
	2
);
WPAS_Shim_Test_Runner::assert_eq(
	'admin.json item preserved at index 0',
	$nav_items[0]['label'],
	'Existing Posts'
);
WPAS_Shim_Test_Runner::assert_eq(
	'shim item appended at index 1',
	$nav_items[1]['label'],
	'Plugin Default'
);
WPAS_Shim_Test_Runner::assert_eq(
	'shim item href = `#` + `to`',
	$nav_items[1]['href'],
	'#/plugin-default'
);

// `find_default_nav_region_id` returns the right slash-path.
WPAS_Shim_Test_Runner::assert_eq(
	'find_default_nav_region_id returns sidebar/nav slash-path',
	WP_Admin_Shell_Menu_Items::find_default_nav_region_id( wpas_shim_test_shell_doc() ),
	'sidebar/nav'
);

// -----------------------------------------------------------------------------
// Menu items — explicit region routing (bare id + slash-path)
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();

wp_admin_shell_register_menu_item( 'plugin-bare', array(
	'to'     => '/bare',
	'label'  => 'Bare Region',
	'region' => 'inner-nav',
) );
wp_admin_shell_register_menu_item( 'plugin-slash', array(
	'to'     => '/slash',
	'label'  => 'Slash Region',
	'region' => 'sub-shell/inner-nav',
) );

$dual = wpas_shim_test_dual_nav_doc();
$filtered_dual = WP_Admin_Shell_Menu_Items::contribute( $dual );
$inner_items = $filtered_dual['regions']['sub-shell']['regions']['inner-nav']['config']['items'];

WPAS_Shim_Test_Runner::assert_eq(
	'bare region id matches nested region',
	count( $inner_items ),
	2
);
WPAS_Shim_Test_Runner::assert_eq(
	'slash-path region id matches the same nested region',
	$inner_items[1]['label'],
	'Slash Region'
);

// Sidebar/nav stays empty — both items targeted the inner region.
WPAS_Shim_Test_Runner::assert_eq(
	'sidebar/nav stays empty when items target a different region',
	count( $filtered_dual['regions']['sidebar']['regions']['nav']['config']['items'] ),
	0
);

// Item targeting an unknown region drops silently.
WP_Admin_Shell_Menu_Items::reset();
wp_admin_shell_register_menu_item( 'plugin-orphan', array(
	'to'     => '/orphan',
	'label'  => 'Orphan',
	'region' => 'does-not-exist',
) );
$dual_again = wpas_shim_test_dual_nav_doc();
$filtered_orphan = WP_Admin_Shell_Menu_Items::contribute( $dual_again );
WPAS_Shim_Test_Runner::assert_eq(
	'item targeting unknown region drops silently',
	count( $filtered_orphan['regions']['sidebar']['regions']['nav']['config']['items'] ),
	0
);
WPAS_Shim_Test_Runner::assert_eq(
	'item targeting unknown region drops — inner nav also empty',
	count( $filtered_orphan['regions']['sub-shell']['regions']['inner-nav']['config']['items'] ),
	0
);

// -----------------------------------------------------------------------------
// Menu items — drilldown nesting via parent
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();

wp_admin_shell_register_menu_item( 'settings', array(
	'label'       => 'Settings',
	'icon'        => 'settings',
	'parent_type' => 'drilldown',
	'description' => 'Plugin configuration.',
) );
wp_admin_shell_register_menu_item( 'settings-general', array(
	'to'         => '/plugin/settings/general',
	'label'      => 'General',
	'icon'       => 'admin-generic',
	'parent'     => 'settings',
	'capability' => 'manage_options',
) );
wp_admin_shell_register_menu_item( 'settings-advanced', array(
	'to'         => '/plugin/settings/advanced',
	'label'      => 'Advanced',
	'parent'     => 'settings',
	'capability' => 'manage_options',
) );

$doc_drill = wpas_shim_test_shell_doc();
$filtered_drill = WP_Admin_Shell_Menu_Items::contribute( $doc_drill );
$nav_drill = $filtered_drill['regions']['sidebar']['regions']['nav']['config']['items'];

WPAS_Shim_Test_Runner::assert_eq(
	'drilldown parent appended after admin.json items',
	count( $nav_drill ),
	2
);
$screen_item = $nav_drill[1];
WPAS_Shim_Test_Runner::assert_eq(
	'drilldown parent emitted as `screen`',
	$screen_item['screen'],
	'settings'
);
WPAS_Shim_Test_Runner::assert_eq(
	'drilldown parent label preserved',
	$screen_item['label'],
	'Settings'
);
WPAS_Shim_Test_Runner::assert_eq(
	'drilldown parent description preserved',
	$screen_item['description'],
	'Plugin configuration.'
);
WPAS_Shim_Test_Runner::assert_eq(
	'drilldown parent has 2 children',
	count( $screen_item['items'] ),
	2
);
WPAS_Shim_Test_Runner::assert_eq(
	'first child href = `#` + `to`',
	$screen_item['items'][0]['href'],
	'#/plugin/settings/general'
);
WPAS_Shim_Test_Runner::assert_eq(
	'first child carries capability',
	$screen_item['items'][0]['capability'],
	'manage_options'
);

// -----------------------------------------------------------------------------
// Menu items — dropdown falls back to drilldown
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();

$dropdown_id = wp_admin_shell_register_menu_item( 'menu-as-dropdown', array(
	'label'       => 'Dropdown Menu',
	'parent_type' => 'dropdown',
) );
wp_admin_shell_register_menu_item( 'menu-as-dropdown-child', array(
	'to'     => '/dropdown/child',
	'label'  => 'Child',
	'parent' => 'menu-as-dropdown',
) );
WPAS_Shim_Test_Runner::assert_eq( 'dropdown registers cleanly (no fatal)', $dropdown_id, 'menu-as-dropdown' );

$registry = WP_Admin_Shell_Menu_Items::all();
WPAS_Shim_Test_Runner::assert_eq(
	'dropdown coerced to drilldown in registry',
	$registry['menu-as-dropdown']['parent_type'],
	'drilldown'
);

// -----------------------------------------------------------------------------
// Menu items — position sorting
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();

wp_admin_shell_register_menu_item( 'pos-c', array( 'to' => '/c', 'label' => 'C', 'position' => 30 ) );
wp_admin_shell_register_menu_item( 'pos-a', array( 'to' => '/a', 'label' => 'A', 'position' => 10 ) );
wp_admin_shell_register_menu_item( 'pos-b', array( 'to' => '/b', 'label' => 'B', 'position' => 20 ) );
wp_admin_shell_register_menu_item( 'pos-z', array( 'to' => '/z', 'label' => 'Z' ) ); // null position → last

$doc_pos = wpas_shim_test_shell_doc();
$filtered_pos = WP_Admin_Shell_Menu_Items::contribute( $doc_pos );
$sorted_labels = array_map(
	function ( $item ) { return $item['label']; },
	$filtered_pos['regions']['sidebar']['regions']['nav']['config']['items']
);
WPAS_Shim_Test_Runner::assert_eq(
	'position sort: existing → A(10) → B(20) → C(30) → Z(null)',
	$sorted_labels,
	array( 'Existing Posts', 'A', 'B', 'C', 'Z' )
);

// -----------------------------------------------------------------------------
// Menu items — external link auto-detection
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();

wp_admin_shell_register_menu_item( 'ext-https', array(
	'to'    => 'https://wordpress.org/',
	'label' => 'WordPress',
) );
wp_admin_shell_register_menu_item( 'ext-protocol-relative', array(
	'to'    => '//cdn.example/',
	'label' => 'CDN',
) );
wp_admin_shell_register_menu_item( 'ext-hash', array(
	'to'    => '#/inside-shell',
	'label' => 'Inside',
) );

$doc_ext = wpas_shim_test_shell_doc();
$filtered_ext = WP_Admin_Shell_Menu_Items::contribute( $doc_ext );
$ext_items = $filtered_ext['regions']['sidebar']['regions']['nav']['config']['items'];

// existing item is at index 0; shim items follow
WPAS_Shim_Test_Runner::assert_eq( 'https external href passes through', $ext_items[1]['href'], 'https://wordpress.org/' );
WPAS_Shim_Test_Runner::assert_true( 'https flagged external', ! empty( $ext_items[1]['external'] ) );
WPAS_Shim_Test_Runner::assert_eq( 'protocol-relative href passes through', $ext_items[2]['href'], '//cdn.example/' );
WPAS_Shim_Test_Runner::assert_true( 'protocol-relative flagged external', ! empty( $ext_items[2]['external'] ) );
WPAS_Shim_Test_Runner::assert_eq( 'hash href passes through unchanged', $ext_items[3]['href'], '#/inside-shell' );
WPAS_Shim_Test_Runner::assert_true( 'hash NOT flagged external', empty( $ext_items[3]['external'] ) );

// Explicit `external => false` suppresses absolute-URL auto-detect
// (escape hatch — author chose to hash-route an absolute URL).
WP_Admin_Shell_Menu_Items::reset();
wp_admin_shell_register_menu_item( 'ext-explicit-false', array(
	'to'       => 'https://wordpress.org/',
	'label'    => 'Internal Despite https',
	'external' => false,
) );
wp_admin_shell_register_menu_item( 'ext-explicit-true', array(
	'to'       => '#/inside',
	'label'    => 'External Despite Hash',
	'external' => true,
) );
$doc_explicit = wpas_shim_test_shell_doc();
$filtered_explicit = WP_Admin_Shell_Menu_Items::contribute( $doc_explicit );
$exp_items = $filtered_explicit['regions']['sidebar']['regions']['nav']['config']['items'];
WPAS_Shim_Test_Runner::assert_true(
	'explicit external=false suppresses absolute-URL auto-detect',
	empty( $exp_items[1]['external'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'explicit external=true overrides hash-href default',
	! empty( $exp_items[2]['external'] )
);

// -----------------------------------------------------------------------------
// Menu items — empty registry is a no-op on contribute
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();
$untouched = wpas_shim_test_shell_doc();
$same      = WP_Admin_Shell_Menu_Items::contribute( $untouched );
WPAS_Shim_Test_Runner::assert_eq(
	'empty registry: contribute is a no-op',
	$same,
	$untouched
);

// -----------------------------------------------------------------------------
// Admin routes — registration + validation
// -----------------------------------------------------------------------------

WP_Admin_Shell_Admin_Routes::reset();

$path = wp_admin_shell_register_admin_route( '/plugin/list', array(
	'app'    => 'plugin:my-plugin/list',
	'config' => array( 'view' => 'table' ),
) );
WPAS_Shim_Test_Runner::assert_eq( 'register returns path', $path, '/plugin/list' );

$err = wp_admin_shell_register_admin_route( '', array( 'app' => 'plugin:x/y' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects empty path', $err );

$err = wp_admin_shell_register_admin_route( 'no-leading-slash', array( 'app' => 'plugin:x/y' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects path without leading slash', $err );

$err = wp_admin_shell_register_admin_route( '/has spaces', array( 'app' => 'plugin:x/y' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects path with disallowed chars', $err );

$err = wp_admin_shell_register_admin_route( '/no-app', array( 'config' => array() ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects missing `app`', $err );

$err = wp_admin_shell_register_admin_route( '/bad-config', array(
	'app'    => 'plugin:x/y',
	'config' => 'not-an-array',
) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects non-array config', $err );

$err = wp_admin_shell_register_admin_route( '/bad-static', array(
	'app'         => 'plugin:x/y',
	'static_data' => 'not-an-array',
) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects non-array static_data', $err );

// Duplicate-path rejection.
$err = wp_admin_shell_register_admin_route( '/plugin/list', array( 'app' => 'plugin:my-plugin/other' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects duplicate path', $err );

// -----------------------------------------------------------------------------
// Admin routes — `static_data` folds into `config`
// -----------------------------------------------------------------------------

WP_Admin_Shell_Admin_Routes::reset();
wp_admin_shell_register_admin_route( '/plugin/detail', array(
	'app'         => 'plugin:my-plugin/detail',
	'config'      => array( 'view' => 'edit' ),
	'static_data' => array( 'origin' => 'shim' ),
) );

$registry = WP_Admin_Shell_Admin_Routes::all();
WPAS_Shim_Test_Runner::assert_eq(
	'static_data merged into config',
	$registry['/plugin/detail']['config'],
	array( 'origin' => 'shim', 'view' => 'edit' )
);

// Merge direction: explicit `config` wins on key collision.
WP_Admin_Shell_Admin_Routes::reset();
wp_admin_shell_register_admin_route( '/plugin/collide', array(
	'app'         => 'plugin:my-plugin/detail',
	'config'      => array( 'view' => 'config-wins' ),
	'static_data' => array( 'view' => 'static-loses', 'extra' => 'kept' ),
) );
$collide_registry = WP_Admin_Shell_Admin_Routes::all();
WPAS_Shim_Test_Runner::assert_eq(
	'explicit config wins on collision with static_data',
	$collide_registry['/plugin/collide']['config']['view'],
	'config-wins'
);
WPAS_Shim_Test_Runner::assert_eq(
	'static_data extras (no collision) survive merge',
	$collide_registry['/plugin/collide']['config']['extra'],
	'kept'
);

// `gc_time` accepted, no fatal.
WP_Admin_Shell_Admin_Routes::reset();
$path = wp_admin_shell_register_admin_route( '/plugin/cached', array(
	'app'     => 'plugin:my-plugin/list',
	'gc_time' => 60000,
) );
WPAS_Shim_Test_Runner::assert_eq( 'gc_time accepted (no fatal, registers fine)', $path, '/plugin/cached' );
$registry = WP_Admin_Shell_Admin_Routes::all();
WPAS_Shim_Test_Runner::assert_true(
	'gc_time NOT propagated to resolved route doc',
	! isset( $registry['/plugin/cached']['gc_time'] )
);

// -----------------------------------------------------------------------------
// Admin routes — cascade contribution
// -----------------------------------------------------------------------------

WP_Admin_Shell_Admin_Routes::reset();
wp_admin_shell_register_admin_route( '/plugin/list', array(
	'app'    => 'plugin:my-plugin/list',
	'config' => array( 'view' => 'table' ),
) );

$doc_routes = wpas_shim_test_shell_doc();
$filtered_routes = WP_Admin_Shell_Admin_Routes::contribute( $doc_routes );
WPAS_Shim_Test_Runner::assert_eq(
	'admin.json route preserved',
	$filtered_routes['routes']['/posts']['app'],
	'core:iframe-fallback'
);
WPAS_Shim_Test_Runner::assert_eq(
	'shim route appended',
	$filtered_routes['routes']['/plugin/list']['app'],
	'plugin:my-plugin/list'
);
WPAS_Shim_Test_Runner::assert_eq(
	'shim route config preserved',
	$filtered_routes['routes']['/plugin/list']['config']['view'],
	'table'
);

// admin.json wins on per-path collision.
$doc_collide = wpas_shim_test_shell_doc();
$doc_collide['routes']['/plugin/list'] = array(
	'app'    => 'plugin:my-plugin/winner',
	'config' => array( 'view' => 'admin-json-wins' ),
);
$filtered_collide = WP_Admin_Shell_Admin_Routes::contribute( $doc_collide );
WPAS_Shim_Test_Runner::assert_eq(
	'admin.json wins per-path on collision',
	$filtered_collide['routes']['/plugin/list']['config']['view'],
	'admin-json-wins'
);

// Contribute with no doc-routes block creates one.
$doc_no_routes = array( 'engine' => 'core:default' );
$filtered_seed = WP_Admin_Shell_Admin_Routes::contribute( $doc_no_routes );
WPAS_Shim_Test_Runner::assert_true(
	'contribute seeds routes block when absent',
	isset( $filtered_seed['routes']['/plugin/list'] )
);

// -----------------------------------------------------------------------------
// End-to-end — both shims through `wp_admin_shell_data_plugin` filter
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();
WP_Admin_Shell_Admin_Routes::reset();

wp_admin_shell_register_menu_item( 'plugin-e2e', array(
	'to'         => '/plugin/e2e',
	'label'      => 'E2E',
	'icon'       => 'star-filled',
	'capability' => 'manage_options',
) );
wp_admin_shell_register_admin_route( '/plugin/e2e', array(
	'app'    => 'plugin:my-plugin/e2e',
	'config' => array( 'view' => 'list' ),
) );

$bare_admin_json = wpas_shim_test_shell_doc(); // declares NEITHER /plugin/e2e nor a matching nav item
$plugin_after_filters = apply_filters( 'wp_admin_shell_data_plugin', $bare_admin_json );

$nav_after = $plugin_after_filters['regions']['sidebar']['regions']['nav']['config']['items'];
$found_e2e = false;
foreach ( $nav_after as $item ) {
	if ( ( $item['label'] ?? null ) === 'E2E' ) {
		$found_e2e = true;
		break;
	}
}
WPAS_Shim_Test_Runner::assert_true(
	'E2E: shim menu item appears in resolved nav region',
	$found_e2e
);
WPAS_Shim_Test_Runner::assert_true(
	'E2E: shim route appears in resolved routes block',
	isset( $plugin_after_filters['routes']['/plugin/e2e'] )
);
WPAS_Shim_Test_Runner::assert_eq(
	'E2E: shim route app id preserved through filter',
	$plugin_after_filters['routes']['/plugin/e2e']['app'],
	'plugin:my-plugin/e2e'
);

// -----------------------------------------------------------------------------
// Cap gating — shim-declared `capability` flows through 4-layer cap model
// -----------------------------------------------------------------------------

WP_Admin_Shell_Menu_Items::reset();
WP_Admin_Shell_Admin_Routes::reset();
WP_Admin_Shell_Resolver::reset_request_memo();
if ( class_exists( 'WP_Admin_Shell_Cache' ) ) {
	WP_Admin_Shell_Cache::flush();
}

wp_admin_shell_register_menu_item( 'plugin-locked', array(
	'to'         => '/plugin/locked',
	'label'      => 'Locked',
	'capability' => 'manage_woocommerce', // unlikely to be granted
) );

$origins = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => wpas_shim_test_shell_doc(),
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$resolved = WP_Admin_Shell_Resolver::resolve_with( $origins );

// Walk the resolved nav config items and confirm shim cap survived.
$resolved_items = $resolved['regions']['sidebar']['regions']['nav']['config']['items'];
$cap_seen = false;
foreach ( $resolved_items as $item ) {
	if ( ( $item['label'] ?? null ) === 'Locked' && ( $item['capability'] ?? null ) === 'manage_woocommerce' ) {
		$cap_seen = true;
		break;
	}
}
WPAS_Shim_Test_Runner::assert_true(
	'cap-gate: shim-declared `capability` survives cascade resolution',
	$cap_seen
);

// `wpas_collect_nav_item_caps` (from wp-admin-shell.php) walks
// region.config.items and gathers caps for the JS-side payload — so the
// browser pruner sees an authoritative cap map for shim items.
$declared = array();
wpas_collect_nav_item_caps( $resolved_items, $declared );
WPAS_Shim_Test_Runner::assert_true(
	'cap-gate: cap collector picks up shim cap (manage_woocommerce)',
	isset( $declared['manage_woocommerce'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'cap-gate: cap collector picks up admin.json cap (edit_posts) too',
	isset( $declared['edit_posts'] )
);

WP_Admin_Shell_Menu_Items::reset();
WP_Admin_Shell_Admin_Routes::reset();
WP_Admin_Shell_Resolver::reset_request_memo();
if ( class_exists( 'WP_Admin_Shell_Cache' ) ) {
	WP_Admin_Shell_Cache::flush();
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

$total = WPAS_Shim_Test_Runner::$pass + WPAS_Shim_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Shim_Test_Runner::$pass . " passed, " . WPAS_Shim_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Shim_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
