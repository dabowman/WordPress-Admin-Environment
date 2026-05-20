<?php
/**
 * Classic wp-admin menu bridge tests (3c.3).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-classic-menu-bridge-tests.php`
 *
 * Coverage:
 *   - Slug → screen id derivation (kebab-case, prefix stripping).
 *   - Slug → path derivation (core mappings, query-stringed slugs, admin.php?page=).
 *   - Core-slug detection + filter expansion.
 *   - Icon mapping: dashicons / data-URI / empty.
 *   - Scan walks $GLOBALS['menu'] + $GLOBALS['submenu']:
 *       * third-party top-level entries ingested,
 *       * core wp-admin entries skipped,
 *       * children under a third-party parent nested,
 *       * children under a core parent get a synthesized container,
 *       * child entries matching core slugs are skipped.
 *   - Cascade contribute():
 *       * builds screens[<id>] + menu.ingested.items[<id>],
 *       * iframe app id format,
 *       * permission capabilities propagated,
 *       * idempotency guard (filter twice — no duplicates),
 *       * pre-declared admin.json screen wins (bridge skips),
 *       * container .label preserved across origins (bridge only writes items),
 *       * empty $GLOBALS['menu'] → no crash, no contribution,
 *       * default container created when absent.
 *   - Coexistence with `wp_admin_shell_register_menu_item()`.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Classic_Menu_Bridge_Test_Runner {
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
}

$T = 'WPAS_Classic_Menu_Bridge_Test_Runner';

/**
 * Snapshot + restore globals so the harness doesn't leak state.
 */
$saved_menu    = isset( $GLOBALS['menu'] ) ? $GLOBALS['menu'] : null;
$saved_submenu = isset( $GLOBALS['submenu'] ) ? $GLOBALS['submenu'] : null;

// Clean slate for each test block.
function wpas_cmb_reset_globals() {
	$GLOBALS['menu']    = array();
	$GLOBALS['submenu'] = array();
}

// --- Slug → screen id derivation -----------------------------------------

$T::assert_eq(
	'screen id: simple slug',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_screen_id( 'my-plugin-page' ),
	'ingested-my-plugin-page'
);
$T::assert_eq(
	'screen id: query-stringed slug',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_screen_id( 'edit.php?post_type=product' ),
	'ingested-edit-php-post-type-product'
);
$T::assert_eq(
	'screen id: admin.php?page= prefix stripped',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_screen_id( 'admin.php?page=woocommerce' ),
	'ingested-woocommerce'
);
$T::assert_eq(
	'screen id: empty slug fallback',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_screen_id( '' ),
	'ingested-unknown'
);

// --- Path derivation -----------------------------------------------------

$T::assert_eq(
	'path: simple slug → /admin/<slugified>',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_path( 'my-plugin-page' ),
	'/admin/my-plugin-page'
);
$T::assert_eq(
	'path: query-stringed slug → /admin/<slugified>',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_path( 'edit.php?post_type=product' ),
	'/admin/edit-php-post-type-product'
);
$T::assert_eq(
	'path: admin.php?page= prefix stripped → /admin/<page>',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_path( 'admin.php?page=woocommerce' ),
	'/admin/woocommerce'
);
$T::assert_eq(
	'path: known core slug short-circuits to mapped path',
	WP_Admin_Shell_Classic_Menu_Bridge::derive_path( 'upload.php' ),
	'/media'
);

// --- Core slug detection -------------------------------------------------

$T::assert_true(
	'is_core_slug: top-level core slug detected',
	WP_Admin_Shell_Classic_Menu_Bridge::is_core_slug( 'edit.php' )
);
$T::assert_true(
	'is_core_slug: settings core slug detected',
	WP_Admin_Shell_Classic_Menu_Bridge::is_core_slug( 'options-permalink.php' )
);
$T::assert_true(
	'is_core_slug: third-party slug not detected',
	! WP_Admin_Shell_Classic_Menu_Bridge::is_core_slug( 'my-plugin-page' )
);
$T::assert_true(
	'is_core_slug: edit.php?post_type=post (core CPT) detected',
	WP_Admin_Shell_Classic_Menu_Bridge::is_core_slug( 'edit.php?post_type=post' )
);
$T::assert_true(
	'is_core_slug: edit.php?post_type=product (custom CPT) NOT core',
	! WP_Admin_Shell_Classic_Menu_Bridge::is_core_slug( 'edit.php?post_type=product' )
);

// Filter-expanded skip list.
add_filter(
	'wp_admin_shell_classic_menu_core_slugs',
	function ( $slugs ) {
		$slugs[] = 'edit.php?post_type=product';
		return $slugs;
	}
);
$T::assert_true(
	'is_core_slug: filter expansion adds custom slug to skip list',
	WP_Admin_Shell_Classic_Menu_Bridge::is_core_slug( 'edit.php?post_type=product' )
);
remove_all_filters( 'wp_admin_shell_classic_menu_core_slugs' );

// --- Icon mapping --------------------------------------------------------

$T::assert_eq(
	'icon: dashicons-cart → cart',
	WP_Admin_Shell_Classic_Menu_Bridge::map_icon( 'dashicons-cart' ),
	'cart'
);
$T::assert_eq(
	'icon: dashicons-admin-tools → admin-tools',
	WP_Admin_Shell_Classic_Menu_Bridge::map_icon( 'dashicons-admin-tools' ),
	'admin-tools'
);
$T::assert_eq(
	'icon: data-URI → null (caller falls back to menu)',
	WP_Admin_Shell_Classic_Menu_Bridge::map_icon( 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ),
	null
);
$T::assert_eq(
	'icon: empty string → null',
	WP_Admin_Shell_Classic_Menu_Bridge::map_icon( '' ),
	null
);
$T::assert_eq(
	'icon: "none" sentinel → null',
	WP_Admin_Shell_Classic_Menu_Bridge::map_icon( 'none' ),
	null
);
$T::assert_eq(
	'icon: "div" sentinel → null',
	WP_Admin_Shell_Classic_Menu_Bridge::map_icon( 'div' ),
	null
);

// --- Scan: third-party top-level entry -----------------------------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	// [ label, capability, slug, page_title, _classes, _hookname, _icon ]
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', 'toplevel_page_my-plugin-page', 'dashicons-admin-tools' ),
);
$records = WP_Admin_Shell_Classic_Menu_Bridge::scan();
$T::assert_eq(
	'scan: one third-party plugin entry ingested',
	count( $records ),
	1
);
$T::assert_eq(
	'scan: ingested id matches derive_screen_id',
	$records[0]['id'],
	'ingested-my-plugin-page'
);
$T::assert_eq(
	'scan: ingested capability propagated',
	$records[0]['capability'],
	'manage_options'
);
$T::assert_eq(
	'scan: ingested icon mapped from dashicons',
	$records[0]['icon'],
	'admin-tools'
);

// --- Scan: core wp-admin entry skipped -----------------------------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'Posts', 'edit_posts', 'edit.php', 'Posts', '', 'menu-posts', 'dashicons-admin-post' ),
);
$T::assert_eq(
	'scan: core wp-admin entry (edit.php) skipped',
	count( WP_Admin_Shell_Classic_Menu_Bridge::scan() ),
	0
);

// --- Scan: third-party label with update-count span markup ---------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array(
		"Plugins <span class='update-plugins count-3'><span class='plugin-count'>3</span></span>",
		'activate_plugins',
		'my-plugin-with-count',
		'Plugins',
		'',
		'menu-plugins',
		'',
	),
);
$records = WP_Admin_Shell_Classic_Menu_Bridge::scan();
$T::assert_eq(
	'scan: update-count <span> markup stripped from label',
	$records[0]['label'],
	'Plugins'
);
$T::assert_eq(
	'scan: empty icon falls back to "menu"',
	$records[0]['icon'],
	'menu'
);

// --- Scan: submenu under third-party parent → nested children ------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$GLOBALS['submenu'] = array(
	'my-plugin-page' => array(
		array( 'Settings', 'manage_options', 'my-plugin-settings' ),
		array( 'Reports', 'manage_options', 'my-plugin-reports' ),
	),
);
$records = WP_Admin_Shell_Classic_Menu_Bridge::scan();
$T::assert_eq(
	'scan: third-party parent has two ingested children',
	count( $records[0]['children'] ),
	2
);
$T::assert_eq(
	'scan: first child id',
	$records[0]['children'][0]['id'],
	'ingested-my-plugin-settings'
);
$T::assert_eq(
	'scan: first child capability propagated',
	$records[0]['children'][0]['capability'],
	'manage_options'
);

// --- Scan: submenu under core parent → synthesized container ------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'Tools', 'edit_posts', 'tools.php', 'Tools', '', '', 'dashicons-admin-tools' ),
);
$GLOBALS['submenu'] = array(
	'tools.php' => array(
		array( 'Import', 'import', 'import.php' ), // core slug — skipped.
		array( 'Custom Tool', 'manage_options', 'custom-tool-page' ),
	),
);
$records = WP_Admin_Shell_Classic_Menu_Bridge::scan();
$T::assert_eq(
	'scan: core-parent submenu synthesizes one container record',
	count( $records ),
	1
);
$T::assert_true(
	'scan: synthesized container marked parent_is_core',
	$records[0]['parent_is_core']
);
$T::assert_eq(
	'scan: synthesized container has one ingested child (core child skipped)',
	count( $records[0]['children'] ),
	1
);
$T::assert_eq(
	'scan: synthesized container child id',
	$records[0]['children'][0]['id'],
	'ingested-custom-tool-page'
);
$T::assert_eq(
	'scan: synthesized container retains the core parent label',
	$records[0]['label'],
	'Tools'
);

// --- Scan: empty globals → no crash, no records --------------------------

wpas_cmb_reset_globals();
$T::assert_eq(
	'scan: empty $GLOBALS["menu"] → no records',
	count( WP_Admin_Shell_Classic_Menu_Bridge::scan() ),
	0
);

// --- contribute(): screens + menu structure -----------------------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$doc = WP_Admin_Shell_Classic_Menu_Bridge::contribute( array() );

$T::assert_true(
	'contribute: screen entry created at expected id',
	isset( $doc['screens']['ingested-my-plugin-page'] )
);
$T::assert_eq(
	'contribute: screen app is iframe:<slug>',
	$doc['screens']['ingested-my-plugin-page']['app'],
	'iframe:my-plugin-page'
);
$T::assert_eq(
	'contribute: screen path is /admin/<slugified>',
	$doc['screens']['ingested-my-plugin-page']['path'],
	'/admin/my-plugin-page'
);
$T::assert_eq(
	'contribute: screen icon mapped from dashicons',
	$doc['screens']['ingested-my-plugin-page']['icon'],
	'admin-tools'
);
$T::assert_eq(
	'contribute: screen permissions.capabilities carries menu cap',
	$doc['screens']['ingested-my-plugin-page']['permissions']['capabilities'],
	array( 'manage_options' )
);
$T::assert_true(
	'contribute: ingested container created at menu root',
	isset( $doc['menu']['ingested']['items']['ingested-my-plugin-page'] )
);
$T::assert_eq(
	'contribute: ingested container label defaults to "Plugins"',
	$doc['menu']['ingested']['label'],
	'Plugins'
);

// --- contribute(): cascade collision with admin.json screen -------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
// admin.json origin pre-declared a screen with the same id (e.g. site
// origin overrode the auto-bridge with a customized screen). The
// bridge's idempotency guard must skip ingestion.
$pre_existing = array(
	'screens' => array(
		'ingested-my-plugin-page' => array(
			'label' => 'Customized',
			'path'  => '/custom-path',
			'app'   => 'core:posts',
		),
	),
);
$doc = WP_Admin_Shell_Classic_Menu_Bridge::contribute( $pre_existing );
$T::assert_eq(
	'contribute: admin.json-declared screen survives — bridge skips',
	$doc['screens']['ingested-my-plugin-page']['label'],
	'Customized'
);
$T::assert_eq(
	'contribute: admin.json-declared screen path preserved',
	$doc['screens']['ingested-my-plugin-page']['path'],
	'/custom-path'
);
$T::assert_eq(
	'contribute: admin.json-declared screen app preserved',
	$doc['screens']['ingested-my-plugin-page']['app'],
	'core:posts'
);

// --- contribute(): custom container label preserved across origins ------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$custom_container = array(
	'menu' => array(
		'ingested' => array(
			'label'    => 'Custom Container Label',
			'position' => 50,
			'items'    => array(),
		),
	),
);
$doc = WP_Admin_Shell_Classic_Menu_Bridge::contribute( $custom_container );
$T::assert_eq(
	'contribute: custom container label survives',
	$doc['menu']['ingested']['label'],
	'Custom Container Label'
);
$T::assert_eq(
	'contribute: custom container position survives',
	$doc['menu']['ingested']['position'],
	50
);
$T::assert_true(
	'contribute: bridge still writes its item into custom-labeled container',
	isset( $doc['menu']['ingested']['items']['ingested-my-plugin-page'] )
);

// --- contribute(): idempotency — filter twice doesn't duplicate ---------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$first  = WP_Admin_Shell_Classic_Menu_Bridge::contribute( array() );
$second = WP_Admin_Shell_Classic_Menu_Bridge::contribute( $first );
$T::assert_eq(
	'idempotency: screens count unchanged after second contribute',
	count( $second['screens'] ),
	count( $first['screens'] )
);
$T::assert_eq(
	'idempotency: container item count unchanged after second contribute',
	count( $second['menu']['ingested']['items'] ),
	count( $first['menu']['ingested']['items'] )
);

// --- contribute(): empty globals → contribution is a no-op --------------

wpas_cmb_reset_globals();
$empty_doc = WP_Admin_Shell_Classic_Menu_Bridge::contribute( array() );
$T::assert_eq(
	'contribute: empty globals → no screens added',
	$empty_doc,
	array()
);

// --- contribute(): submenu under third-party parent → child screens ----

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$GLOBALS['submenu'] = array(
	'my-plugin-page' => array(
		array( 'Settings', 'manage_options', 'my-plugin-settings' ),
	),
);
$doc = WP_Admin_Shell_Classic_Menu_Bridge::contribute( array() );
$T::assert_true(
	'contribute: submenu child screen created',
	isset( $doc['screens']['ingested-my-plugin-settings'] )
);
$T::assert_eq(
	'contribute: submenu child app is iframe:<slug>',
	$doc['screens']['ingested-my-plugin-settings']['app'],
	'iframe:my-plugin-settings'
);
$T::assert_true(
	'contribute: submenu child nested under parent in menu tree',
	isset( $doc['menu']['ingested']['items']['ingested-my-plugin-page']['items']['ingested-my-plugin-settings'] )
);

// --- contribute(): synthesized container under core parent --------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'Tools', 'edit_posts', 'tools.php', 'Tools', '', '', 'dashicons-admin-tools' ),
);
$GLOBALS['submenu'] = array(
	'tools.php' => array(
		array( 'Custom Tool', 'manage_options', 'custom-tool-page' ),
	),
);
$doc = WP_Admin_Shell_Classic_Menu_Bridge::contribute( array() );
$T::assert_true(
	'contribute: synthesized container screen created for core parent',
	isset( $doc['screens']['ingested-tools-php'] )
);
$T::assert_true(
	'contribute: synthesized container screen is hidden',
	! empty( $doc['screens']['ingested-tools-php']['hidden'] )
);
$T::assert_eq(
	'contribute: synthesized container has the core parent label',
	$doc['menu']['ingested']['items']['ingested-tools-php']['label'],
	'Tools'
);
$T::assert_true(
	'contribute: synthesized container child screen created',
	isset( $doc['screens']['ingested-custom-tool-page'] )
);
$T::assert_true(
	'contribute: synthesized container child nested in menu tree',
	isset( $doc['menu']['ingested']['items']['ingested-tools-php']['items']['ingested-custom-tool-page'] )
);

// --- Coexistence with wp_admin_shell_register_menu_item() ----------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
WP_Admin_Shell_Menu_Items::reset();
$reg = wp_admin_shell_register_menu_item(
	'manual-item',
	array(
		'label'    => 'Manual',
		'icon'     => 'star',
		'position' => 7,
	)
);
$T::assert_eq(
	'coexistence: register_menu_item still returns id',
	$reg,
	'manual-item'
);

// Apply menu-items contribute() (priority 5) then bridge (priority 6).
$doc_after_menu_items = apply_filters( 'wp_admin_shell_data_plugin', array() );
$T::assert_true(
	'coexistence: bridge item present alongside manual menu item',
	isset( $doc_after_menu_items['menu']['ingested']['items']['ingested-my-plugin-page'] )
);
$T::assert_true(
	'coexistence: manual menu item also present',
	isset( $doc_after_menu_items['menu']['manual-item'] )
);

WP_Admin_Shell_Menu_Items::reset();

// --- Restore globals -----------------------------------------------------

$GLOBALS['menu']    = $saved_menu;
$GLOBALS['submenu'] = $saved_submenu;

// --- Summary -------------------------------------------------------------

$total = WPAS_Classic_Menu_Bridge_Test_Runner::$pass + WPAS_Classic_Menu_Bridge_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Classic_Menu_Bridge_Test_Runner::$pass . " passed, " . WPAS_Classic_Menu_Bridge_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Classic_Menu_Bridge_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
