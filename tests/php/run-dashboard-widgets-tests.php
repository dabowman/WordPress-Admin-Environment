<?php
/**
 * Dashboard-widgets registry tests (v3 reshape — 3c.1).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-dashboard-widgets-tests.php`
 *
 * Coverage:
 *   - `WP_Admin_Shell_Dashboard_Widgets::register` validation + readback.
 *   - Override flavor: contributes screens[<target>].apps[] entries to the cascade.
 *   - Custom target screen via $args['screen'].
 *   - Standalone flavor: also synthesizes an app manifest with slotHints.
 *   - admin.json declaration wins per-entry-id via the cascade's id-keyed array merge.
 *   - Tombstone semantics: hidden:true marks the contributed entry as a cascade tombstone.
 *   - v2 `dashboardWidgets` block translated to screen-app entries at compile time.
 *   - Lazy + deferred manifest forwarding.
 *   - Entry-id derivation from app id.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Dashboard_Widgets_Test_Runner {
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

$T = 'WPAS_Dashboard_Widgets_Test_Runner';

WP_Admin_Shell_Dashboard_Widgets::reset();

// --- Registration validation -----------------------------------------------

$err = wp_admin_shell_register_dashboard_widget( '', array() );
$T::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_shell_register_dashboard_widget( 'no-namespace', array() );
$T::assert_wp_error( 'register rejects un-namespaced id', $err );

$err = wp_admin_shell_register_dashboard_widget( 'plugin:bad slug/widget', array() );
$T::assert_wp_error( 'register rejects malformed plugin id', $err );

// --- Entry-id derivation ----------------------------------------------------

$T::assert_eq(
	'entry-id derivation: core: prefix stripped',
	WP_Admin_Shell_Dashboard_Widgets::derive_entry_id( 'core:dashboard-widget-recent-posts' ),
	'dashboard-widget-recent-posts'
);
$T::assert_eq(
	'entry-id derivation: plugin slug stripped',
	WP_Admin_Shell_Dashboard_Widgets::derive_entry_id( 'plugin:acme/sales-stats' ),
	'sales-stats'
);

// --- Override flavor --------------------------------------------------------

WP_Admin_Shell_Dashboard_Widgets::reset();
$id = wp_admin_shell_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'position'    => array( 'row' => 1, 'col' => 1 ),
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
$T::assert_eq( 'register returns id (override flavor)', $id, 'core:dashboard-widget-recent-posts' );

$record = WP_Admin_Shell_Dashboard_Widgets::get( 'core:dashboard-widget-recent-posts' );
$T::assert_eq(
	'record placement.position preserved',
	$record['placement']['position'],
	array( 'row' => 1, 'col' => 1 )
);
$T::assert_eq(
	'record placement.defaultSize preserved',
	$record['placement']['defaultSize'],
	array( 'w' => 2, 'h' => 1 )
);
$T::assert_eq(
	'record target_screen defaults to dashboard-widgets',
	$record['target_screen'],
	'dashboard-widgets'
);

// --- Cascade contribution: screens[<target>].apps[] -------------------------

$plugin_doc = apply_filters( 'wp_admin_shell_data_plugin', array() );
$T::assert_true(
	'plugin origin creates screens[dashboard-widgets] when registrations exist',
	isset( $plugin_doc['screens']['dashboard-widgets']['apps'] )
);
$apps = $plugin_doc['screens']['dashboard-widgets']['apps'];
$T::assert_eq(
	'plugin origin contributes exactly one apps entry',
	count( $apps ),
	1
);
$T::assert_eq(
	'contributed entry app id',
	$apps[0]['app'],
	'core:dashboard-widget-recent-posts'
);
$T::assert_eq(
	'contributed entry has slot:"grid"',
	$apps[0]['slot'],
	'grid'
);
$T::assert_eq(
	'contributed entry id is the kebab-derived form',
	$apps[0]['id'],
	'dashboard-widget-recent-posts'
);
$T::assert_eq(
	'contributed entry carries defaultSize as `size`',
	$apps[0]['size'],
	array( 'w' => 2, 'h' => 1 )
);
$T::assert_eq(
	'contributed entry carries position',
	$apps[0]['position'],
	array( 'row' => 1, 'col' => 1 )
);

// --- Custom target screen ---------------------------------------------------

WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'screen'      => 'home-dashboard',
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
$plugin_doc = apply_filters( 'wp_admin_shell_data_plugin', array() );
$T::assert_true(
	'custom screen target receives contribution',
	isset( $plugin_doc['screens']['home-dashboard']['apps'] )
);
$T::assert_true(
	'default screen target receives nothing when explicit screen set',
	! isset( $plugin_doc['screens']['dashboard-widgets'] )
);
$T::assert_eq(
	'custom-screen entry is the same kebab-derived id',
	$plugin_doc['screens']['home-dashboard']['apps'][0]['id'],
	'dashboard-widget-recent-posts'
);

// --- Hidden tombstone -------------------------------------------------------

WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'core:dashboard-widget-quick-draft',
	array( 'hidden' => true )
);
$plugin_doc = apply_filters( 'wp_admin_shell_data_plugin', array() );
$entry      = $plugin_doc['screens']['dashboard-widgets']['apps'][0];
$T::assert_true(
	'hidden:true contributes a tombstone marker',
	! empty( $entry['__tombstone'] )
);
$T::assert_eq(
	'tombstoned entry id matches the derived form',
	$entry['id'],
	'dashboard-widget-quick-draft'
);

// --- admin.json wins per-entry-id (cascade id-keyed merge) ------------------

WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
// Simulate admin.json `screens[dashboard-widgets].apps[]` claiming the
// same entry id with different placement. Run a manual cascade merge
// to verify the contract.
$plugin_origin = apply_filters( 'wp_admin_shell_data_plugin', array() );
$site_origin   = array(
	'screens' => array(
		'dashboard-widgets' => array(
			'apps' => array(
				array(
					'id'   => 'dashboard-widget-recent-posts',
					'app'  => 'core:dashboard-widget-recent-posts',
					'slot' => 'grid',
					'size' => array( 'w' => 4, 'h' => 4 ),
				),
			),
		),
	),
);
$merged = WP_Admin_Shell_Merge::merge( $plugin_origin, $site_origin );
$T::assert_eq(
	'admin.json (site origin) entry merges by id over plugin contribution',
	$merged['screens']['dashboard-widgets']['apps'][0]['size'],
	array( 'w' => 4, 'h' => 4 )
);
$T::assert_eq(
	'merged apps[] has one entry (id-merged)',
	count( $merged['screens']['dashboard-widgets']['apps'] ),
	1
);

// --- Standalone flavor (synthesizes a manifest with slotHints) --------------

WP_Admin_Shell_Dashboard_Widgets::reset();

$standalone = wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/sales',
	array(
		'title'        => 'Sales',
		'role'         => 'region',
		'script'       => 'wpas-test',
		'capabilities' => array( 'manage_options' ),
		'slotHints'    => array(
			'defaultSize' => array( 'w' => 2, 'h' => 2 ),
			'minSize'     => array( 'w' => 1, 'h' => 1 ),
			'position'    => 'auto',
		),
	)
);
$T::assert_eq(
	'standalone register returns id',
	$standalone,
	'plugin:wpas-test/sales'
);

WP_Admin_Shell_Dashboard_Widgets::flush_pending_registrations();

$manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/sales' );
$T::assert_true(
	'standalone register seeds manifest registry',
	is_array( $manifest )
);
$T::assert_eq(
	'synthetic manifest preserves title',
	$manifest['title'],
	'Sales'
);
$T::assert_true(
	'synthetic manifest carries slotHints',
	isset( $manifest['slotHints'] )
);
$T::assert_eq(
	'synthetic manifest slotHints defaultSize',
	$manifest['slotHints']['defaultSize'],
	array( 'w' => 2, 'h' => 2 )
);
$T::assert_true(
	'synthetic manifest does not carry legacy dashboardWidget block',
	! isset( $manifest['dashboardWidget'] )
);

// Pre-flush state: a freshly-registered widget must NOT hit the manifest
// registry synchronously.
WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/deferred',
	array( 'script' => 'wpas-test' )
);
$pre_flush = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/deferred' );
$T::assert_true(
	'standalone register does NOT synchronously hit the manifest registry',
	$pre_flush === null
);

WP_Admin_Shell_Dashboard_Widgets::flush_pending_registrations();
$post_flush = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/deferred' );
$T::assert_true(
	'flush_pending_registrations forwards the manifest',
	is_array( $post_flush )
);

// Lazy flush via wp_admin_shell_data_plugin filter (covers the
// register-then-resolve order where init priority 7 hasn't fired yet).
WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/lazy',
	array( 'script' => 'wpas-test' )
);
apply_filters( 'wp_admin_shell_data_plugin', array() );
$lazy = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/lazy' );
$T::assert_true(
	'apply_filters(wp_admin_shell_data_plugin) lazy-flushes',
	is_array( $lazy )
);

// Standalone-flavor dual-source: top-level placement keys + nested
// slotHints both supplied. Top-level wins per-property.
WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/dual-source',
	array(
		'script'      => 'wpas-test',
		'defaultSize' => array( 'w' => 3, 'h' => 1 ),  // top-level wins
		'slotHints'   => array(
			'defaultSize' => array( 'w' => 1, 'h' => 1 ),  // overridden
			'minSize'     => array( 'w' => 1, 'h' => 1 ),  // preserved
		),
	)
);
WP_Admin_Shell_Dashboard_Widgets::flush_pending_registrations();
$dual_manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/dual-source' );
$T::assert_eq(
	'synthetic manifest slotHints carries the top-level-wins defaultSize',
	$dual_manifest['slotHints']['defaultSize'],
	array( 'w' => 3, 'h' => 1 )
);
$T::assert_eq(
	'nested slotHints keys survive when not overridden top-level',
	$dual_manifest['slotHints']['minSize'],
	array( 'w' => 1, 'h' => 1 )
);

// Override-only call (no script) should NOT add to the manifest registry.
WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/override-only',
	array( 'hidden' => true )
);
$override_only_manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/override-only' );
$T::assert_true(
	'override-only call does NOT synthesize a manifest',
	$override_only_manifest === null
);

// --- v2 back-compat: translate_v2_dashboard_widgets -------------------------

WP_Admin_Shell_Dashboard_Widgets::reset();

// v2 shape: top-level dashboardWidgets block + a dashboard-widgets screen.
$v2_resolved = array(
	'version'          => 1,
	'engine'           => 'core:default',
	'screens'          => array(
		'dashboard-widgets' => array(
			'path' => '/dashboard/widgets',
			'apps' => array(
				array(
					'id'   => 'host',
					'app'  => 'core:dashboard-host',
				),
			),
		),
	),
	'dashboardWidgets' => array(
		'core:dashboard-widget-recent-posts' => array(
			'defaultSize' => array( 'w' => 2, 'h' => 1 ),
		),
		'core:dashboard-widget-quick-draft' => array(
			'position' => array( 'row' => 1, 'col' => 1 ),
		),
	),
);
$v2_compiled = WP_Admin_Shell_V3_Compiler::compile( $v2_resolved );

$apps = $v2_compiled['screens']['dashboard-widgets']['apps'];
$T::assert_eq(
	'v2 back-compat: 3 apps[] entries after translation (host + 2 widgets)',
	count( $apps ),
	3
);
$ids = array();
foreach ( $apps as $a ) {
	$ids[] = $a['id'];
}
$T::assert_true(
	'v2 back-compat: recent-posts entry present after translation',
	in_array( 'dashboard-widget-recent-posts', $ids, true )
);
$T::assert_true(
	'v2 back-compat: quick-draft entry present after translation',
	in_array( 'dashboard-widget-quick-draft', $ids, true )
);

// Verify the translated entries carry slot:"grid" + size/position.
foreach ( $apps as $a ) {
	if ( $a['id'] === 'dashboard-widget-recent-posts' ) {
		$T::assert_eq(
			'v2 back-compat: recent-posts entry has slot:"grid"',
			$a['slot'],
			'grid'
		);
		$T::assert_eq(
			'v2 back-compat: recent-posts entry has size from v2 defaultSize',
			$a['size'],
			array( 'w' => 2, 'h' => 1 )
		);
	}
	if ( $a['id'] === 'dashboard-widget-quick-draft' ) {
		$T::assert_eq(
			'v2 back-compat: quick-draft entry has position from v2',
			$a['position'],
			array( 'row' => 1, 'col' => 1 )
		);
	}
}

// hidden:true in the v2 block drops the entry from translation.
$v2_hidden = array(
	'screens'          => array(
		'dashboard-widgets' => array( 'app' => 'core:dashboard-host' ),
	),
	'dashboardWidgets' => array(
		'core:dashboard-widget-recent-posts' => array( 'hidden' => true ),
	),
);
$v2_hidden_compiled = WP_Admin_Shell_V3_Compiler::compile( $v2_hidden );
$apps_hidden        = isset( $v2_hidden_compiled['screens']['dashboard-widgets']['apps'] )
	? $v2_hidden_compiled['screens']['dashboard-widgets']['apps']
	: array();
$has_recent = false;
foreach ( $apps_hidden as $a ) {
	if ( isset( $a['app'] ) && $a['app'] === 'core:dashboard-widget-recent-posts' ) {
		$has_recent = true;
	}
}
$T::assert_true(
	'v2 back-compat: hidden:true v2 entry is dropped from translation',
	! $has_recent
);

// Author-defined v3 entry wins — translator skips the v2 block for same app id.
$v2_with_author = array(
	'screens'          => array(
		'dashboard-widgets' => array(
			'apps' => array(
				array(
					'id'   => 'my-custom-id',
					'app'  => 'core:dashboard-widget-recent-posts',
					'slot' => 'grid',
					'size' => array( 'w' => 4, 'h' => 4 ),
				),
			),
		),
	),
	'dashboardWidgets' => array(
		'core:dashboard-widget-recent-posts' => array(
			'defaultSize' => array( 'w' => 2, 'h' => 1 ),
		),
	),
);
$compiled_author = WP_Admin_Shell_V3_Compiler::compile( $v2_with_author );
$T::assert_eq(
	'v2 back-compat: author v3-shape entry wins (no duplicate)',
	count( $compiled_author['screens']['dashboard-widgets']['apps'] ),
	1
);
$T::assert_eq(
	'v2 back-compat: author entry size preserved',
	$compiled_author['screens']['dashboard-widgets']['apps'][0]['size'],
	array( 'w' => 4, 'h' => 4 )
);

// No-op when target screen is absent.
$v2_no_screen = array(
	'screens'          => array(),
	'dashboardWidgets' => array(
		'core:dashboard-widget-recent-posts' => array(),
	),
);
$compiled_no_screen = WP_Admin_Shell_V3_Compiler::compile( $v2_no_screen );
$T::assert_true(
	'v2 back-compat: missing target screen → no translation',
	! isset( $compiled_no_screen['screens']['dashboard-widgets'] )
);

// --- Reset cleanup ---------------------------------------------------------

WP_Admin_Shell_Dashboard_Widgets::reset();

// --- Summary ---------------------------------------------------------------

$total = WPAS_Dashboard_Widgets_Test_Runner::$pass + WPAS_Dashboard_Widgets_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Dashboard_Widgets_Test_Runner::$pass . " passed, " . WPAS_Dashboard_Widgets_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Dashboard_Widgets_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
