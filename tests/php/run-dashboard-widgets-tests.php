<?php
/**
 * Dashboard-widgets registry tests (C4 — spec §13 #12).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-dashboard-widgets-tests.php`
 *
 * Coverage:
 *   - `WP_Admin_Shell_Dashboard_Widgets::register` validation + readback.
 *   - Override flavor: contributes per-id entries to the cascade.
 *   - Standalone flavor: also synthesizes an app manifest in the registry.
 *   - `wp_admin_shell_data_plugin` filter contribution.
 *   - admin.json declaration wins over programmatic registration for the same id.
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

WP_Admin_Shell_Dashboard_Widgets::reset();

// --- Registration validation -----------------------------------------------

$err = wp_admin_shell_register_dashboard_widget( '', array() );
WPAS_Dashboard_Widgets_Test_Runner::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_shell_register_dashboard_widget( 'no-namespace', array() );
WPAS_Dashboard_Widgets_Test_Runner::assert_wp_error( 'register rejects un-namespaced id', $err );

$err = wp_admin_shell_register_dashboard_widget( 'plugin:bad slug/widget', array() );
WPAS_Dashboard_Widgets_Test_Runner::assert_wp_error( 'register rejects malformed plugin id', $err );

// --- Override flavor --------------------------------------------------------

$id = wp_admin_shell_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'position'    => array( 'row' => 1, 'col' => 1 ),
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq( 'register returns id (override flavor)', $id, 'core:dashboard-widget-recent-posts' );

$entry = WP_Admin_Shell_Dashboard_Widgets::get( 'core:dashboard-widget-recent-posts' );
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'override position preserved',
	$entry['position'],
	array( 'row' => 1, 'col' => 1 )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'override defaultSize preserved',
	$entry['defaultSize'],
	array( 'w' => 2, 'h' => 1 )
);

// Hidden flag.
wp_admin_shell_register_dashboard_widget(
	'core:dashboard-widget-quick-draft',
	array( 'hidden' => true )
);
$hidden_entry = WP_Admin_Shell_Dashboard_Widgets::get( 'core:dashboard-widget-quick-draft' );
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'hidden flag preserved',
	$hidden_entry['hidden'],
	true
);

// --- Cascade contribution ---------------------------------------------------

$plugin_doc = apply_filters( 'wp_admin_shell_data_plugin', array() );
WPAS_Dashboard_Widgets_Test_Runner::assert_true(
	'plugin origin contains dashboardWidgets block after register()',
	isset( $plugin_doc['dashboardWidgets'] )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_true(
	'plugin origin includes registered id',
	isset( $plugin_doc['dashboardWidgets']['core:dashboard-widget-recent-posts'] )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'contributed entry carries position',
	$plugin_doc['dashboardWidgets']['core:dashboard-widget-recent-posts']['position'],
	array( 'row' => 1, 'col' => 1 )
);

// admin.json declaration wins over programmatic contribution.
$plugin_doc_with_admin_json = apply_filters( 'wp_admin_shell_data_plugin', array(
	'dashboardWidgets' => array(
		'core:dashboard-widget-recent-posts' => array(
			'position'    => array( 'row' => 5, 'col' => 5 ),
			'defaultSize' => array( 'w' => 1, 'h' => 3 ),
		),
	),
) );
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'admin.json declaration wins over programmatic injection (id collision)',
	$plugin_doc_with_admin_json['dashboardWidgets']['core:dashboard-widget-recent-posts']['position'],
	array( 'row' => 5, 'col' => 5 )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'admin.json declaration is authoritative (defaultSize not merged)',
	$plugin_doc_with_admin_json['dashboardWidgets']['core:dashboard-widget-recent-posts']['defaultSize'],
	array( 'w' => 1, 'h' => 3 )
);

// --- Standalone flavor (synthesizes a manifest) -----------------------------

WP_Admin_Shell_Dashboard_Widgets::reset();

$standalone = wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/sales',
	array(
		'title'           => 'Sales',
		'role'            => 'region',
		'script'          => 'wpas-test',
		'capabilities'    => array( 'manage_options' ),
		'dashboardWidget' => array(
			'defaultSize' => array( 'w' => 2, 'h' => 2 ),
			'minSize'     => array( 'w' => 1, 'h' => 1 ),
			'position'    => 'auto',
		),
	)
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'standalone register returns id',
	$standalone,
	'plugin:wpas-test/sales'
);

$manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/sales' );
WPAS_Dashboard_Widgets_Test_Runner::assert_true(
	'standalone register seeds manifest registry',
	is_array( $manifest )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'synthetic manifest preserves title',
	$manifest['title'],
	'Sales'
);
WPAS_Dashboard_Widgets_Test_Runner::assert_true(
	'synthetic manifest carries dashboardWidget block',
	isset( $manifest['dashboardWidget'] )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_eq(
	'synthetic manifest dashboardWidget defaultSize',
	$manifest['dashboardWidget']['defaultSize'],
	array( 'w' => 2, 'h' => 2 )
);
WPAS_Dashboard_Widgets_Test_Runner::assert_true(
	'synthetic manifest strips hidden field from dashboardWidget block',
	! isset( $manifest['dashboardWidget']['hidden'] )
);

// Override-only call (no script) should NOT add to the manifest registry.
WP_Admin_Shell_Dashboard_Widgets::reset();
wp_admin_shell_register_dashboard_widget(
	'plugin:wpas-test/override-only',
	array( 'hidden' => true )
);
$override_only_manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/override-only' );
WPAS_Dashboard_Widgets_Test_Runner::assert_true(
	'override-only call does NOT synthesize a manifest',
	$override_only_manifest === null
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
