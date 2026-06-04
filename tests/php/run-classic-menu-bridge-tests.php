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
 *       * pre-declared workspace.json screen wins (bridge skips),
 *       * container .label preserved across origins (bridge only writes items),
 *       * empty $GLOBALS['menu'] → no crash, no contribution,
 *       * default container created when absent.
 *   - Coexistence with `wp_admin_workspaces_register_menu_item()`.
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
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( 'my-plugin-page' ),
	'ingested-my-plugin-page'
);
$T::assert_eq(
	'screen id: query-stringed slug',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( 'edit.php?post_type=product' ),
	'ingested-edit-php-post-type-product'
);
$T::assert_eq(
	'screen id: admin.php?page= prefix stripped',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( 'admin.php?page=woocommerce' ),
	'ingested-woocommerce'
);
$T::assert_eq(
	'screen id: empty slug returns empty (mirrors derive_path empty-handling)',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( '' ),
	''
);
$T::assert_eq(
	'path: empty slug returns empty (mirrors derive_screen_id empty-handling)',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_path( '' ),
	''
);

// --- Path derivation -----------------------------------------------------

$T::assert_eq(
	'path: simple slug → /admin/<slugified>',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_path( 'my-plugin-page' ),
	'/admin/my-plugin-page'
);
$T::assert_eq(
	'path: query-stringed slug → /admin/<slugified>',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_path( 'edit.php?post_type=product' ),
	'/admin/edit-php-post-type-product'
);
$T::assert_eq(
	'path: admin.php?page= prefix stripped → /admin/<page>',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_path( 'admin.php?page=woocommerce' ),
	'/admin/woocommerce'
);
$T::assert_eq(
	'path: known core slug short-circuits to mapped path',
	WP_Admin_Workspaces_Classic_Menu_Bridge::derive_path( 'upload.php' ),
	'/media'
);

// --- Core slug detection -------------------------------------------------

$T::assert_true(
	'is_core_slug: top-level core slug detected',
	WP_Admin_Workspaces_Classic_Menu_Bridge::is_core_slug( 'edit.php' )
);
$T::assert_true(
	'is_core_slug: settings core slug detected',
	WP_Admin_Workspaces_Classic_Menu_Bridge::is_core_slug( 'options-permalink.php' )
);
$T::assert_true(
	'is_core_slug: third-party slug not detected',
	! WP_Admin_Workspaces_Classic_Menu_Bridge::is_core_slug( 'my-plugin-page' )
);
$T::assert_true(
	'is_core_slug: edit.php?post_type=post (core CPT) detected',
	WP_Admin_Workspaces_Classic_Menu_Bridge::is_core_slug( 'edit.php?post_type=post' )
);
$T::assert_true(
	'is_core_slug: edit.php?post_type=product (custom CPT) NOT core',
	! WP_Admin_Workspaces_Classic_Menu_Bridge::is_core_slug( 'edit.php?post_type=product' )
);

// Filter-expanded skip list. Memoization means the core-slug list is
// snapshotted on first call — register the filter, then reset() to
// drain the memo, then probe.
add_filter(
	'wp_admin_workspaces_classic_menu_core_slugs',
	function ( $slugs ) {
		$slugs[] = 'edit.php?post_type=product';
		return $slugs;
	}
);
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$T::assert_true(
	'is_core_slug: filter expansion adds custom slug to skip list',
	WP_Admin_Workspaces_Classic_Menu_Bridge::is_core_slug( 'edit.php?post_type=product' )
);
remove_all_filters( 'wp_admin_workspaces_classic_menu_core_slugs' );
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();

// --- Icon mapping --------------------------------------------------------

$T::assert_eq(
	'icon: dashicons-cart → cart',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon( 'dashicons-cart' ),
	'cart'
);
$T::assert_eq(
	'icon: dashicons-admin-tools → admin-tools',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon( 'dashicons-admin-tools' ),
	'admin-tools'
);
$T::assert_eq(
	'icon: data-URI → null (caller falls back to menu)',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon( 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ),
	null
);
$T::assert_eq(
	'icon: empty string → null',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon( '' ),
	null
);
$T::assert_eq(
	'icon: "none" sentinel → null',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon( 'none' ),
	null
);
$T::assert_eq(
	'icon: "div" sentinel → null',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon( 'div' ),
	null
);

// --- Scan: third-party top-level entry -----------------------------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	// [ label, capability, slug, page_title, _classes, _hookname, _icon ]
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', 'toplevel_page_my-plugin-page', 'dashicons-admin-tools' ),
);
$records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
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
	count( WP_Admin_Workspaces_Classic_Menu_Bridge::scan() ),
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
$records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
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
$records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
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
$records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
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
	count( WP_Admin_Workspaces_Classic_Menu_Bridge::scan() ),
	0
);

// --- contribute(): screens + menu structure -----------------------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );

$T::assert_true(
	'contribute: screen entry created at expected id',
	isset( $doc['screens']['ingested-my-plugin-page'] )
);
$T::assert_eq(
	'contribute: screen app maps slug → iframe:admin.php?page=<slug>',
	$doc['screens']['ingested-my-plugin-page']['app'],
	'iframe:admin.php?page=my-plugin-page'
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
	'contribute: third-party top-level menu surfaces at menu ROOT (not nested under ingested)',
	isset( $doc['menu']['ingested-my-plugin-page'] )
);
$T::assert_true(
	'contribute: no ingested container created when there are no core-parented orphans',
	! isset( $doc['menu']['ingested'] )
);

// --- contribute(): cascade collision with workspace.json screen -------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
// workspace.json origin pre-declared a screen with the same id (e.g. site
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
$doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( $pre_existing );
$T::assert_eq(
	'contribute: workspace.json-declared screen survives — bridge skips',
	$doc['screens']['ingested-my-plugin-page']['label'],
	'Customized'
);
$T::assert_eq(
	'contribute: workspace.json-declared screen path preserved',
	$doc['screens']['ingested-my-plugin-page']['path'],
	'/custom-path'
);
$T::assert_eq(
	'contribute: workspace.json-declared screen app preserved',
	$doc['screens']['ingested-my-plugin-page']['app'],
	'core:posts'
);

// --- contribute(): custom container label preserved across origins ------
// The shared `ingested` container only collects submenus parented to a
// CORE wp-admin slug the workspace does NOT mirror natively (orphans). Use
// `import.php` — a core slug NOT in $CORE_PARENT_MENU — so the fallback
// `ingested` container branch + ensure_container()'s preserve path are
// exercised. (tools.php / options-general.php now nest under their real
// workspace parent — see the #127 "core nest" block below.)

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'Import', 'import', 'import.php', 'Import', '', '', 'dashicons-download' ),
);
$GLOBALS['submenu'] = array(
	'import.php' => array(
		array( 'Custom Tool', 'manage_options', 'custom-tool-page' ),
	),
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
$doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( $custom_container );
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
	'contribute: bridge writes the core-parented orphan into the custom-labeled container',
	isset( $doc['menu']['ingested']['items']['ingested-import-php'] )
);

// --- contribute(): idempotency — filter twice doesn't duplicate ---------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
$first  = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$second = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( $first );
$T::assert_eq(
	'idempotency: screens count unchanged after second contribute',
	count( $second['screens'] ),
	count( $first['screens'] )
);
$T::assert_eq(
	'idempotency: top-level menu count unchanged after second contribute',
	count( $second['menu'] ),
	count( $first['menu'] )
);

// --- contribute(): empty globals → contribution is a no-op --------------

wpas_cmb_reset_globals();
$empty_doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
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
$doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$T::assert_true(
	'contribute: submenu child screen created',
	isset( $doc['screens']['ingested-my-plugin-settings'] )
);
$T::assert_eq(
	'contribute: submenu child app maps slug → iframe:admin.php?page=<slug>',
	$doc['screens']['ingested-my-plugin-settings']['app'],
	'iframe:admin.php?page=my-plugin-settings'
);
$T::assert_true(
	'contribute: submenu child nested under the top-level parent in menu tree',
	isset( $doc['menu']['ingested-my-plugin-page']['items']['ingested-my-plugin-settings'] )
);

// --- contribute(): synthesized container under UNMAPPED core parent -----
// import.php is a core slug NOT in $CORE_PARENT_MENU, so its orphan plugin
// children get a synthesized container inside the generic `ingested`
// bucket. (Mapped core parents — tools.php / options-general.php — nest
// directly under their real workspace parent; see the #127 "core nest" block.)

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'Import', 'import', 'import.php', 'Import', '', '', 'dashicons-download' ),
);
$GLOBALS['submenu'] = array(
	'import.php' => array(
		array( 'Custom Tool', 'manage_options', 'custom-tool-page' ),
	),
);
$doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$T::assert_true(
	'contribute: synthesized container screen created for core parent',
	isset( $doc['screens']['ingested-import-php'] )
);
$T::assert_true(
	'contribute: synthesized container screen is hidden',
	! empty( $doc['screens']['ingested-import-php']['hidden'] )
);
$T::assert_eq(
	'contribute: synthesized container has the core parent label',
	$doc['menu']['ingested']['items']['ingested-import-php']['label'],
	'Import'
);
$T::assert_true(
	'contribute: synthesized container child screen created',
	isset( $doc['screens']['ingested-custom-tool-page'] )
);
$T::assert_true(
	'contribute: synthesized container child nested in menu tree',
	isset( $doc['menu']['ingested']['items']['ingested-import-php']['items']['ingested-custom-tool-page'] )
);

// --- scan(): wp-admin separator rows are skipped ------------------------
// $GLOBALS['menu'] interleaves `wp-menu-separator` divider rows (synthetic
// `separatorN` slug, CSS class in index 4). They are visual dividers, not
// navigable pages, and must never be ingested.

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( '', 'read', 'separator1', '', 'wp-menu-separator' ),
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', 'menu-top', '', 'dashicons-admin-tools' ),
	array( '', 'read', 'separator-last', '', 'wp-menu-separator' ),
);
$sep_records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
$T::assert_eq(
	'scan: separator rows skipped — only the real plugin entry ingested',
	count( $sep_records ),
	1
);
$T::assert_eq(
	'scan: surviving record is the plugin page (not a separator)',
	$sep_records[0]['id'],
	'ingested-my-plugin-page'
);

// --- contribute(): external (http) submenu child → anchor, no screen ----
// Gutenberg's Support / Documentation submenus register a full URL as the
// slug. They must surface as external links, not iframe-mounted screens.

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', 'menu-top', '', 'dashicons-admin-tools' ),
);
$GLOBALS['submenu'] = array(
	'my-plugin-page' => array(
		array( 'Docs', 'manage_options', 'https://example.com/docs' ),
	),
);
$ext_doc  = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$ext_id   = WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( 'https://example.com/docs' );
$ext_item = $ext_doc['menu']['ingested-my-plugin-page']['items'][ $ext_id ];
$T::assert_eq(
	'contribute: external child href is the raw URL',
	$ext_item['href'],
	'https://example.com/docs'
);
$T::assert_true(
	'contribute: external child marked external',
	! empty( $ext_item['external'] )
);
$T::assert_true(
	'contribute: external child does NOT synthesize a screen',
	! isset( $ext_doc['screens'][ $ext_id ] )
);

// --- contribute(): a `.php` slug passes through unchanged ----------------
// `menu_page_url()` treats a `.php` slug as a direct admin file (keep the
// query string); only page slugs get the `admin.php?page=` prefix.

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'Orders', 'manage_options', 'edit.php?post_type=shop_order', 'Orders', 'menu-top', '', 'dashicons-cart' ),
);
$php_doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$T::assert_eq(
	'contribute: .php slug kept as-is for the iframe url (no admin.php?page= prefix)',
	$php_doc['screens']['ingested-edit-php-post-type-shop-order']['app'],
	'iframe:edit.php?post_type=shop_order'
);

// --- Coexistence with wp_admin_workspaces_register_menu_item() ----------------

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
WP_Admin_Workspaces_Menu_Items::reset();
$reg = wp_admin_workspaces_register_menu_item(
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
$doc_after_menu_items = apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$T::assert_true(
	'coexistence: bridge item present alongside manual menu item',
	isset( $doc_after_menu_items['menu']['ingested-my-plugin-page'] )
);
$T::assert_true(
	'coexistence: manual menu item also present',
	isset( $doc_after_menu_items['menu']['manual-item'] )
);

WP_Admin_Workspaces_Menu_Items::reset();

// --- Real id collision — manual entry at the bridge's target id ----------
// Reviewer flagged: prior coexistence test placed entries in different
// containers and never exercised the collision path. This test puts a
// manual register at `menu.ingested.items.ingested-my-plugin-page` (same
// id the bridge would synthesize) and asserts first-write wins (manual
// menu-items at priority 5 lands before bridge at priority 6).

wpas_cmb_reset_globals();
$GLOBALS['menu'] = array(
	array( 'My Plugin', 'manage_options', 'my-plugin-page', 'My Plugin', '', '', 'dashicons-admin-tools' ),
);
WP_Admin_Workspaces_Menu_Items::reset();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();

// Manual registration claims the same id the bridge would assign. The
// bridge now surfaces a third-party top-level menu at `menu.<id>`
// (root), so pre-seed there to exercise the first-write-wins path.
$pre_seeded = array(
	'menu' => array(
		'ingested-my-plugin-page' => array(
			'label' => 'Custom override label',
			'icon'  => 'star',
		),
	),
);
$collision_doc = apply_filters( 'wp_admin_workspaces_data_plugin', $pre_seeded );
$T::assert_true(
	'real collision: pre-seeded ingested-my-plugin-page survives the bridge pass',
	isset( $collision_doc['menu']['ingested-my-plugin-page'] )
);
$T::assert_eq(
	'real collision: first-write wins — original label preserved',
	$collision_doc['menu']['ingested-my-plugin-page']['label'],
	'Custom override label'
);

// --- #127: map_icon_source() — arbitrary-icon escape hatch ---------------

$T::assert_eq(
	'icon source: dashicons-* → null (name registry covers it)',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( 'dashicons-cart' ),
	null
);
$T::assert_eq(
	'icon source: empty → null',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( '' ),
	null
);
$T::assert_eq(
	'icon source: "none" sentinel → null',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( 'none' ),
	null
);
$T::assert_eq(
	'icon source: data-URI SVG → { type: url, value }',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ),
	array( 'type' => 'url', 'value' => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' )
);
$T::assert_eq(
	'icon source: absolute http(s) image URL → { type: url, value }',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( 'https://example.com/wp-content/plugins/acme/icon.png' ),
	array( 'type' => 'url', 'value' => 'https://example.com/wp-content/plugins/acme/icon.png' )
);
$T::assert_eq(
	'icon source: site-relative image path → { type: url, value }',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( '/wp-content/plugins/acme/icon.svg' ),
	array( 'type' => 'url', 'value' => '/wp-content/plugins/acme/icon.svg' )
);
$T::assert_eq(
	'icon source: protocol-relative URL → { type: url, value }',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( '//cdn.example.com/icon.png' ),
	array( 'type' => 'url', 'value' => '//cdn.example.com/icon.png' )
);
$T::assert_eq(
	'icon source: bare non-image relative path → null (not an icon URL)',
	WP_Admin_Workspaces_Classic_Menu_Bridge::map_icon_source( '/some/path' ),
	null
);

// --- #127: scan() carries numeric position + iconSource -----------------

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
// Keys are the wp-admin numeric position. A data-URI icon exercises
// iconSource; a dashicon entry confirms iconSource stays null there.
$GLOBALS['menu'] = array(
	58 => array( 'Acme', 'manage_options', 'acme-page', 'Acme', '', '', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ),
	72 => array( 'Beta', 'manage_options', 'beta-page', 'Beta', '', '', 'dashicons-admin-tools' ),
);
$pos_records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
$acme = null;
$beta = null;
foreach ( $pos_records as $r ) {
	if ( $r['id'] === 'ingested-acme-page' ) {
		$acme = $r;
	}
	if ( $r['id'] === 'ingested-beta-page' ) {
		$beta = $r;
	}
}
$T::assert_eq(
	'scan: numeric position carried from the menu array key (acme)',
	$acme['position'],
	58
);
$T::assert_eq(
	'scan: numeric position carried from the menu array key (beta)',
	$beta['position'],
	72
);
$T::assert_eq(
	'scan: data-URI icon → iconSource { type: url }, name icon falls back to menu',
	array( $acme['icon'], $acme['iconSource'] ),
	array( 'menu', array( 'type' => 'url', 'value' => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ) )
);
$T::assert_eq(
	'scan: dashicon icon → iconSource null (name registry covers it)',
	$beta['iconSource'],
	null
);

// --- #127: contribute() stamps position + iconSource on menu/screen -----

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	58 => array( 'Acme', 'manage_options', 'acme-page', 'Acme', '', '', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ),
);
$pos_doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$T::assert_eq(
	'contribute: menu item carries the numeric position',
	$pos_doc['menu']['ingested-acme-page']['position'],
	58
);
$T::assert_eq(
	'contribute: menu item carries iconSource for a data-URI icon',
	$pos_doc['menu']['ingested-acme-page']['iconSource'],
	array( 'type' => 'url', 'value' => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' )
);
$T::assert_eq(
	'contribute: screen carries iconSource for a data-URI icon',
	$pos_doc['screens']['ingested-acme-page']['iconSource'],
	array( 'type' => 'url', 'value' => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' )
);

// --- #127: core-parented submenu nests under the REAL workspace parent ------
// A plugin submenu under tools.php nests under `menu.tools.items`, NOT the
// generic `ingested` container. options-general.php → `menu.settings.items`.

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	array( 'Tools', 'edit_posts', 'tools.php', 'Tools', '', '', 'dashicons-admin-tools' ),
	array( 'Settings', 'manage_options', 'options-general.php', 'Settings', '', '', 'dashicons-admin-settings' ),
);
$GLOBALS['submenu'] = array(
	'tools.php'           => array(
		array( 'Acme Export', 'manage_options', 'acme-export' ),
	),
	'options-general.php' => array(
		array( 'Acme Settings', 'manage_options', 'acme-settings' ),
	),
);
$nest_doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$T::assert_true(
	'core nest: tools.php child nests under menu.tools.items (real workspace parent)',
	isset( $nest_doc['menu']['tools']['items']['ingested-acme-export'] )
);
$T::assert_true(
	'core nest: options-general.php child nests under menu.settings.items (real workspace parent)',
	isset( $nest_doc['menu']['settings']['items']['ingested-acme-settings'] )
);
$T::assert_true(
	'core nest: NO generic ingested container created for mapped core parents',
	! isset( $nest_doc['menu']['ingested'] )
);
$T::assert_true(
	'core nest: tools.php child still gets a backing screen',
	isset( $nest_doc['screens']['ingested-acme-export'] )
);
$T::assert_eq(
	'core nest: tools.php child screen iframe app id',
	$nest_doc['screens']['ingested-acme-export']['app'],
	'iframe:admin.php?page=acme-export'
);

// --- #127: an UNMAPPED core parent still falls back to ingested ---------
// import.php is a core slug but NOT in $CORE_PARENT_MENU, so its orphaned
// plugin children land in the generic `ingested` container as before.

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	array( 'Import', 'import', 'import.php', 'Import', '', '', 'dashicons-download' ),
);
$GLOBALS['submenu'] = array(
	'import.php' => array(
		array( 'Acme Importer', 'manage_options', 'acme-importer' ),
	),
);
$fallback_doc = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() );
$T::assert_true(
	'core fallback: unmapped core parent (import.php) uses the ingested container',
	isset( $fallback_doc['menu']['ingested']['items']['ingested-import-php'] )
);

// --- #127: menu-items bind_screens flows screen iconSource onto item ----
// The third-party top-level menu emits a bare menu node + a screen carrying
// iconSource; bind_screens (priority 5, post-merge) must copy it onto the
// bound item the same way it copies `icon`.

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$bind_doc = array(
	'screens' => array(
		'ingested-acme-page' => array(
			'label'      => 'Acme',
			'icon'       => 'menu',
			'iconSource' => array( 'type' => 'url', 'value' => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' ),
			'path'       => '/admin/acme-page',
			'app'        => 'iframe:admin.php?page=acme-page',
		),
	),
	'menu'    => array(
		'ingested-acme-page' => array( 'position' => 58 ),
	),
);
$bound = WP_Admin_Workspaces_Menu_Items::bind_screens( $bind_doc );
$T::assert_eq(
	'bind_screens: screen iconSource flows onto the bound menu item',
	$bound['menu']['ingested-acme-page']['iconSource'],
	array( 'type' => 'url', 'value' => 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' )
);

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();

// --- #252: native legacy_path skip — structural fix ----------------------
// Slugs already claimed by a native workspace screen via `legacy_path` must
// not be re-ingested by the bridge, even when absent from $CORE_SLUGS.
// The resolver passes the already-merged core+engine doc as a second arg
// to the `wp_admin_workspaces_data_plugin` filter; `contribute()` derives
// the skip set from it.

// theme-editor.php is a submenu of themes.php (Appearance); plugin-editor.php
// is a submenu of plugins.php (Plugins). Both are absent from $CORE_SLUGS
// but ARE claimed by native workspace screens via `legacy_path`.
wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	array( 'Appearance', 'switch_themes', 'themes.php', 'Appearance', '', '', 'dashicons-admin-appearance' ),
	array( 'Plugins', 'activate_plugins', 'plugins.php', 'Plugins', '', '', 'dashicons-admin-plugins' ),
);
$GLOBALS['submenu'] = array(
	'themes.php' => array(
		array( 'Theme File Editor', 'edit_themes', 'theme-editor.php' ),
		array( 'Site Editor', 'edit_theme_options', 'site-editor.php' ),
	),
	'plugins.php' => array(
		array( 'Plugin File Editor', 'edit_plugins', 'plugin-editor.php' ),
	),
);
// Simulate the prior-merged doc from the core origin that declares these
// screens natively with `legacy_path` (mirrors wp-admin-default.json).
$prior_merged_252 = array(
	'screens' => array(
		'theme-editor' => array(
			'label'       => 'Theme File Editor',
			'path'        => '/tools/theme-editor',
			'app'         => 'iframe:theme-editor.php',
			'legacy_path' => 'theme-editor.php',
		),
		'plugin-editor' => array(
			'label'       => 'Plugin File Editor',
			'path'        => '/tools/plugin-editor',
			'app'         => 'iframe:plugin-editor.php',
			'legacy_path' => 'plugin-editor.php',
		),
		'site-editor' => array(
			'label'       => 'Editor',
			'path'        => '/site-editor',
			'app'         => 'core:site-editor',
			'legacy_path' => 'site-editor.php',
		),
	),
);
$doc_252 = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array(), $prior_merged_252 );

$T::assert_true(
	'#252: theme-editor.php not ingested when claimed natively via legacy_path',
	! isset( $doc_252['screens']['ingested-theme-editor-php'] )
);
$T::assert_true(
	'#252: plugin-editor.php not ingested when claimed natively via legacy_path',
	! isset( $doc_252['screens']['ingested-plugin-editor-php'] )
);
$T::assert_true(
	'#252: site-editor.php not ingested when claimed natively via legacy_path',
	! isset( $doc_252['screens']['ingested-site-editor-php'] )
);
// The ingested containers for themes.php and plugins.php also have no
// children left (all their relevant children were native) — they should
// not be emitted at all since `scan_children()` returns empty arrays.
$themes_php_id  = WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( 'themes.php' );
$plugins_php_id = WP_Admin_Workspaces_Classic_Menu_Bridge::derive_screen_id( 'plugins.php' );
$T::assert_true(
	'#252: ingested-themes-php container not emitted when all children are native',
	! isset( $doc_252['menu']['ingested']['items'][ $themes_php_id ] )
);
$T::assert_true(
	'#252: ingested-plugins-php container not emitted when all children are native',
	! isset( $doc_252['menu']['ingested']['items'][ $plugins_php_id ] )
);

// Non-native children alongside a native one must still be ingested.
wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	array( 'Plugins', 'activate_plugins', 'plugins.php', 'Plugins', '', '', 'dashicons-admin-plugins' ),
);
$GLOBALS['submenu'] = array(
	'plugins.php' => array(
		array( 'Plugin File Editor', 'edit_plugins', 'plugin-editor.php' ),
		array( 'Acme Plugin', 'manage_options', 'acme-plugin-page' ), // Third-party: not native.
	),
);
$prior_merged_252b = array(
	'screens' => array(
		'plugin-editor' => array(
			'legacy_path' => 'plugin-editor.php',
		),
	),
);
$doc_252b = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array(), $prior_merged_252b );
$T::assert_true(
	'#252: plugin-editor.php skipped (native) but adjacent third-party child still ingested',
	! isset( $doc_252b['screens']['ingested-plugin-editor-php'] ) &&
	isset( $doc_252b['screens']['ingested-acme-plugin-page'] )
);

// Without $prior_merged the bridge falls back to static-list-only (graceful
// degradation — direct calls from tests or third-party code still work).
wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	array( 'Plugins', 'activate_plugins', 'plugins.php', 'Plugins', '', '', 'dashicons-admin-plugins' ),
);
$GLOBALS['submenu'] = array(
	'plugins.php' => array(
		array( 'Acme Plugin', 'manage_options', 'acme-plugin-page' ),
	),
);
$doc_252c = WP_Admin_Workspaces_Classic_Menu_Bridge::contribute( array() ); // No $prior_merged.
$T::assert_true(
	'#252: contribute() without $prior_merged still ingests third-party children (static list only)',
	isset( $doc_252c['screens']['ingested-acme-plugin-page'] )
);

// scan() with $native_legacy_paths skips a top-level entry whose slug
// matches a claimed legacy_path.
wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();
$GLOBALS['menu'] = array(
	array( 'My Editor', 'manage_options', 'theme-editor.php', 'My Editor', '', '', 'dashicons-code-standards' ),
	array( 'Other Plugin', 'manage_options', 'other-plugin', 'Other Plugin', '', '', 'dashicons-admin-tools' ),
);
$scan_252 = WP_Admin_Workspaces_Classic_Menu_Bridge::scan( array( 'theme-editor.php' ) );
$T::assert_eq(
	'#252: scan() with $native_legacy_paths skips a top-level slug claimed natively',
	count( $scan_252 ),
	1
);
$T::assert_eq(
	'#252: scan() surviving record is the non-native plugin (not the claimed slug)',
	$scan_252[0]['id'],
	'ingested-other-plugin'
);

wpas_cmb_reset_globals();
WP_Admin_Workspaces_Classic_Menu_Bridge::reset();

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
