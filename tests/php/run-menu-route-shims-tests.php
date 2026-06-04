<?php
/**
 * Menu-item + admin-route shim tests — v3 nested-tree shape.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-menu-route-shims-tests.php`
 *
 * Coverage:
 *   - Menu-item registration validates ids/args, rejects duplicates,
 *     and rejects dangerous URL schemes on `href`.
 *   - `contribute()` merges registered items into the v3 `menu` tree:
 *       * root insertion at top-level keys,
 *       * nested insertion via `parent: "<id>"` (walks any depth),
 *       * missing parent falls back to root.
 *   - Cascade behavior at depth: site/role/user can override per-field
 *     anywhere in the nested tree (`menu.parent.items.child.label`),
 *     and `null` tombstones remove items + subtrees.
 *   - Screen-binding pass flows `label` / `icon` / `description` /
 *     `permissions` / `path` from `screens[id]` into matching menu items.
 *   - Item-key collisions: later origins win per-field via the merge
 *     engine; the shim does not stomp pre-existing fields.
 *   - Admin-routes shim unchanged from v2 — kept here to confirm it
 *     still passes after the menu-items rewrite.
 *
 * Test totals target the 40–60 assertion range per the v3 plan.
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

// Minimal v3 doc — top-level `menu` + `screens` blocks only.
function wpas_shim_test_v3_doc() {
	return array(
		'version' => 3,
		'engine'  => 'core:default',
		'screens' => array(
			'dashboard'    => array(
				'label'       => 'Dashboard',
				'icon'        => 'dashboard',
				'description' => 'Site overview.',
				'path'        => '/dashboard',
				'app'         => 'core:dashboard',
				'permissions' => array( 'capabilities' => array( 'read' ) ),
			),
			'posts'        => array(
				'label'       => 'Posts',
				'icon'        => 'post',
				'path'        => '/posts',
				'app'         => 'core:posts',
				'config'      => array( 'postType' => 'post' ),
				'permissions' => array( 'capabilities' => array( 'edit_posts' ) ),
			),
			'posts-drafts' => array(
				'label'       => 'Drafts',
				'icon'        => 'drafts',
				'path'        => '/posts/drafts',
				'app'         => 'core:posts',
				'config'      => array( 'postType' => 'post' ),
				'permissions' => array( 'capabilities' => array( 'edit_posts' ) ),
			),
		),
		'menu'    => array(
			'dashboard' => array( 'position' => 5 ),
			'posts'     => array(
				'position' => 30,
				'items'    => array(
					'posts-drafts' => array( 'position' => 10 ),
				),
			),
		),
	);
}

WP_Admin_Workspaces_Menu_Items::reset();
WP_Admin_Workspaces_Admin_Routes::reset();

// -----------------------------------------------------------------------------
// Menu items — registration + validation
// -----------------------------------------------------------------------------

$id = wp_admin_workspaces_register_menu_item(
	'plugin-foo',
	array(
		'label'    => 'Foo',
		'icon'     => 'star-filled',
		'href'     => '#/foo',
		'position' => 100,
	)
);
WPAS_Shim_Test_Runner::assert_eq( 'register returns id', $id, 'plugin-foo' );

$registry = WP_Admin_Workspaces_Menu_Items::all();
WPAS_Shim_Test_Runner::assert_true(
	'registry contains registered item',
	isset( $registry['plugin-foo'] )
);

$err = wp_admin_workspaces_register_menu_item( '', array( 'label' => 'X' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_workspaces_register_menu_item( 'plugin-bar', 'not-an-array' );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects non-array args', $err );

$err = wp_admin_workspaces_register_menu_item( 'plugin-foo', array( 'label' => 'Again' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects duplicate id', $err );

$err = wp_admin_workspaces_register_menu_item( 'plugin-bad-label', array( 'label' => '' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects empty label', $err );

$err = wp_admin_workspaces_register_menu_item(
	'plugin-bad-parent',
	array(
		'label'  => 'X',
		'parent' => '',
	)
);
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects empty parent', $err );

$err = wp_admin_workspaces_register_menu_item(
	'plugin-bad-position',
	array(
		'label'    => 'X',
		'href'     => '/p',
		'position' => 'not-int',
	)
);
WPAS_Shim_Test_Runner::assert_wp_error( 'register rejects non-integer position', $err );

// Dangerous URL schemes on `href` rejected (defense in depth even though
// plugin code is trusted).
foreach ( array( 'javascript:alert(1)', 'data:text/html,<script>', 'vbscript:msgbox(1)', 'file:///etc/passwd' ) as $bad ) {
	$bad_id = 'bad-' . md5( $bad );
	$err    = wp_admin_workspaces_register_menu_item(
		$bad_id,
		array(
			'label' => 'Bad',
			'href'  => $bad,
		)
	);
	WPAS_Shim_Test_Runner::assert_wp_error( "register rejects dangerous scheme: $bad", $err );
}
foreach ( array( 'mailto:hello@example.com', 'tel:+15551234', 'https://wordpress.org', '/relative', '#hash', '{site_url}' ) as $ok ) {
	$ok_id = 'ok-' . md5( $ok );
	$got   = wp_admin_workspaces_register_menu_item(
		$ok_id,
		array(
			'label' => 'OK',
			'href'  => $ok,
		)
	);
	WPAS_Shim_Test_Runner::assert_eq( "register accepts safe scheme: $ok", $got, $ok_id );
}

// -----------------------------------------------------------------------------
// Menu items — root contribution
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();

wp_admin_workspaces_register_menu_item(
	'plugin-root',
	array(
		'label'    => 'Plugin Root',
		'icon'     => 'admin-plugins',
		'href'     => '#/plugin',
		'position' => 150,
	)
);

$contributed = WP_Admin_Workspaces_Menu_Items::contribute( wpas_shim_test_v3_doc() );

WPAS_Shim_Test_Runner::assert_true(
	'root contribution adds id to menu',
	isset( $contributed['menu']['plugin-root'] )
);
WPAS_Shim_Test_Runner::assert_eq(
	'root contribution preserves label',
	$contributed['menu']['plugin-root']['label'],
	'Plugin Root'
);
WPAS_Shim_Test_Runner::assert_eq(
	'root contribution preserves position',
	$contributed['menu']['plugin-root']['position'],
	150
);
WPAS_Shim_Test_Runner::assert_eq(
	'root contribution preserves href',
	$contributed['menu']['plugin-root']['href'],
	'#/plugin'
);
WPAS_Shim_Test_Runner::assert_true(
	'pre-existing menu entries preserved on contribute',
	isset( $contributed['menu']['dashboard'] ) && isset( $contributed['menu']['posts'] )
);

// -----------------------------------------------------------------------------
// Menu items — nested contribution via `parent`
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();

wp_admin_workspaces_register_menu_item(
	'plugin-nested',
	array(
		'label'    => 'Nested',
		'href'     => '#/posts/nested',
		'parent'   => 'posts',
		'position' => 99,
	)
);

$nested = WP_Admin_Workspaces_Menu_Items::contribute( wpas_shim_test_v3_doc() );

WPAS_Shim_Test_Runner::assert_true(
	'nested contribution lands under parent items map',
	isset( $nested['menu']['posts']['items']['plugin-nested'] )
);
WPAS_Shim_Test_Runner::assert_eq(
	'nested contribution preserves label under parent',
	$nested['menu']['posts']['items']['plugin-nested']['label'],
	'Nested'
);
WPAS_Shim_Test_Runner::assert_true(
	'nested contribution does NOT land at root',
	! isset( $nested['menu']['plugin-nested'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'sibling under parent preserved',
	isset( $nested['menu']['posts']['items']['posts-drafts'] )
);

// Deep nesting — register under a child of `posts`.
WP_Admin_Workspaces_Menu_Items::reset();

$doc_deep                                                    = wpas_shim_test_v3_doc();
$doc_deep['menu']['posts']['items']['posts-drafts']['items'] = array(
	'drafts-mine' => array( 'position' => 5 ),
);
$doc_deep['screens']['drafts-mine']                          = array(
	'label' => 'Mine',
	'path'  => '/posts/drafts/mine',
	'app'   => 'core:posts',
);

wp_admin_workspaces_register_menu_item(
	'plugin-deep',
	array(
		'label'  => 'Deep',
		'href'   => '#/deep',
		'parent' => 'posts-drafts',
	)
);
$deep = WP_Admin_Workspaces_Menu_Items::contribute( $doc_deep );

WPAS_Shim_Test_Runner::assert_true(
	'deep contribution lands under 2-level-deep parent',
	isset( $deep['menu']['posts']['items']['posts-drafts']['items']['plugin-deep'] )
);
WPAS_Shim_Test_Runner::assert_eq(
	'deep contribution preserves label two levels deep',
	$deep['menu']['posts']['items']['posts-drafts']['items']['plugin-deep']['label'],
	'Deep'
);

// Missing parent → falls back to root (with WP_DEBUG notice when on).
WP_Admin_Workspaces_Menu_Items::reset();
wp_admin_workspaces_register_menu_item(
	'plugin-orphan',
	array(
		'label'  => 'Orphan',
		'href'   => '#/orphan',
		'parent' => 'does-not-exist',
	)
);
$orphan_filtered = @WP_Admin_Workspaces_Menu_Items::contribute( wpas_shim_test_v3_doc() ); // suppress potential WP_DEBUG notice
WPAS_Shim_Test_Runner::assert_true(
	'missing parent → item lands at root',
	isset( $orphan_filtered['menu']['plugin-orphan'] )
);

// -----------------------------------------------------------------------------
// Menu items — separator + hidden + external
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();
wp_admin_workspaces_register_menu_item(
	'plugin-sep',
	array(
		'separator' => true,
		'position'  => 5,
	)
);
wp_admin_workspaces_register_menu_item(
	'plugin-hidden',
	array(
		'label'  => 'Hidden',
		'href'   => '#/hidden',
		'hidden' => true,
	)
);
wp_admin_workspaces_register_menu_item(
	'plugin-ext-https',
	array(
		'label' => 'WordPress',
		'href'  => 'https://wordpress.org/',
	)
);
wp_admin_workspaces_register_menu_item(
	'plugin-ext-explicit-false',
	array(
		'label'    => 'Internal Despite https',
		'href'     => 'https://wordpress.org/',
		'external' => false,
	)
);

$sep_doc = WP_Admin_Workspaces_Menu_Items::contribute( wpas_shim_test_v3_doc() );

WPAS_Shim_Test_Runner::assert_true(
	'separator entry preserved on contribute',
	! empty( $sep_doc['menu']['plugin-sep']['separator'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'hidden flag preserved on contribute',
	! empty( $sep_doc['menu']['plugin-hidden']['hidden'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'absolute https href auto-flags external',
	! empty( $sep_doc['menu']['plugin-ext-https']['external'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'explicit external=false suppresses auto-detect',
	empty( $sep_doc['menu']['plugin-ext-explicit-false']['external'] )
);

// -----------------------------------------------------------------------------
// Menu items — empty registry is a no-op on contribute
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();
$untouched = wpas_shim_test_v3_doc();
$same      = WP_Admin_Workspaces_Menu_Items::contribute( $untouched );
WPAS_Shim_Test_Runner::assert_eq(
	'empty registry: contribute is a no-op',
	$same,
	$untouched
);

// -----------------------------------------------------------------------------
// Cascade — site origin overrides nested item label two levels deep
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();

$base_origin                                                  = wpas_shim_test_v3_doc();
$base_origin['menu']['posts']['items']['posts-drafts']['label'] = 'Draft Posts';

$site_origin = array(
	'menu' => array(
		'posts' => array(
			'items' => array(
				'posts-drafts' => array( 'label' => 'My Drafts' ),
			),
		),
	),
);

$origins  = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => $base_origin,
	'site'   => $site_origin,
	'role'   => array(),
	'user'   => array(),
);
$resolved = WP_Admin_Workspaces_Resolver::resolve_with( $origins );

WPAS_Shim_Test_Runner::assert_eq(
	'cascade: site origin renames nested child label',
	$resolved['menu']['posts']['items']['posts-drafts']['label'],
	'My Drafts'
);
WPAS_Shim_Test_Runner::assert_eq(
	'cascade: lower-origin position preserved when site does not touch it',
	$resolved['menu']['posts']['items']['posts-drafts']['position'],
	10
);
WPAS_Shim_Test_Runner::assert_eq(
	'cascade: untouched siblings survive',
	$resolved['menu']['posts']['position'],
	30
);

// -----------------------------------------------------------------------------
// Cascade — tombstones remove items + subtrees
// -----------------------------------------------------------------------------

$origins_tombstone  = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => wpas_shim_test_v3_doc(),
	'site'   => array(
		'menu' => array(
			'posts' => null,
		),
	),
	'role'   => array(),
	'user'   => array(),
);
$resolved_tombstone = WP_Admin_Workspaces_Resolver::resolve_with( $origins_tombstone );
WPAS_Shim_Test_Runner::assert_true(
	'cascade: null tombstones a root menu entry',
	! isset( $resolved_tombstone['menu']['posts'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'cascade: tombstone takes subtree with it',
	! isset( $resolved_tombstone['menu']['posts']['items']['posts-drafts'] )
);
WPAS_Shim_Test_Runner::assert_true(
	'cascade: tombstone scoped to target id only',
	isset( $resolved_tombstone['menu']['dashboard'] )
);

// Nested tombstone — site removes a child two levels deep.
$origins_deep_tomb  = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => wpas_shim_test_v3_doc(),
	'site'   => array(
		'menu' => array(
			'posts' => array(
				'items' => array(
					'posts-drafts' => null,
				),
			),
		),
	),
	'role'   => array(),
	'user'   => array(),
);
$resolved_deep_tomb = WP_Admin_Workspaces_Resolver::resolve_with( $origins_deep_tomb );
WPAS_Shim_Test_Runner::assert_true(
	'cascade: nested null tombstone removes deep child only',
	isset( $resolved_deep_tomb['menu']['posts'] ) &&
	! isset( $resolved_deep_tomb['menu']['posts']['items']['posts-drafts'] )
);

// -----------------------------------------------------------------------------
// Screen-binding pass — flow label/icon/description/permissions/path
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();
WP_Admin_Workspaces_Resolver::reset_request_memo();
if ( class_exists( 'WP_Admin_Workspaces_Cache' ) ) {
	WP_Admin_Workspaces_Cache::flush();
}

$plugin_doc         = wpas_shim_test_v3_doc();
$plugin_doc['menu'] = array(
	'dashboard' => array( 'position' => 5 ),
	'posts'     => array(
		'position' => 30,
		'items'    => array(
			'posts-drafts' => array( 'position' => 10 ),
		),
	),
);
// One menu item override — keep `Posts` screen but show as `Articles`
// in the menu.
$plugin_doc['menu']['posts']['label'] = 'Articles';

$origins_bind  = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => $plugin_doc,
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$resolved_bind = WP_Admin_Workspaces_Resolver::resolve_with( $origins_bind );

WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: dashboard label flows from screen',
	$resolved_bind['menu']['dashboard']['label'],
	'Dashboard'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: dashboard icon flows from screen',
	$resolved_bind['menu']['dashboard']['icon'],
	'dashboard'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: dashboard description flows from screen',
	$resolved_bind['menu']['dashboard']['description'],
	'Site overview.'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: dashboard path → href',
	$resolved_bind['menu']['dashboard']['href'],
	'#/dashboard'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: permissions copied from screen',
	$resolved_bind['menu']['dashboard']['permissions']['capabilities'],
	array( 'read' )
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: menu-item label override wins over screen label',
	$resolved_bind['menu']['posts']['label'],
	'Articles'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: posts icon flows from screen',
	$resolved_bind['menu']['posts']['icon'],
	'post'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: nested child label flows from screen',
	$resolved_bind['menu']['posts']['items']['posts-drafts']['label'],
	'Drafts'
);
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: nested child href derived from screen path',
	$resolved_bind['menu']['posts']['items']['posts-drafts']['href'],
	'#/posts/drafts'
);

// `hidden: true` on screen propagates to menu item.
$plugin_doc_hidden                                = wpas_shim_test_v3_doc();
$plugin_doc_hidden['screens']['posts']['hidden']  = true;
$plugin_doc_hidden['menu']                        = array(
	'posts' => array( 'position' => 30 ),
);
$origins_hidden                                   = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => $plugin_doc_hidden,
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$resolved_hidden                                  = WP_Admin_Workspaces_Resolver::resolve_with( $origins_hidden );
WPAS_Shim_Test_Runner::assert_true(
	'screen-binding: hidden flag propagates from screen',
	! empty( $resolved_hidden['menu']['posts']['hidden'] )
);

// Standalone menu item (no matching screen) untouched by binding.
$plugin_doc_standalone               = wpas_shim_test_v3_doc();
$plugin_doc_standalone['menu']['view-site'] = array(
	'label'    => 'View Site',
	'icon'     => 'external',
	'href'     => '{site_url}',
	'external' => true,
	'position' => 999,
);
$origins_standalone                  = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => $plugin_doc_standalone,
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$resolved_standalone                 = WP_Admin_Workspaces_Resolver::resolve_with( $origins_standalone );
WPAS_Shim_Test_Runner::assert_eq(
	'screen-binding: standalone item label preserved',
	$resolved_standalone['menu']['view-site']['label'],
	'View Site'
);
WPAS_Shim_Test_Runner::assert_true(
	'screen-binding: standalone item gets no `permissions` (no screen)',
	! isset( $resolved_standalone['menu']['view-site']['permissions'] )
);

// -----------------------------------------------------------------------------
// End-to-end — shim contributes through `wp_admin_workspaces_data_plugin`
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();

wp_admin_workspaces_register_menu_item(
	'plugin-e2e',
	array(
		'label'    => 'E2E',
		'href'     => '#/plugin/e2e',
		'parent'   => 'posts',
		'position' => 99,
	)
);

$bare         = wpas_shim_test_v3_doc();
$after_plugin = apply_filters( 'wp_admin_workspaces_data_plugin', $bare );

WPAS_Shim_Test_Runner::assert_true(
	'E2E: registered item appears under named parent',
	isset( $after_plugin['menu']['posts']['items']['plugin-e2e'] )
);
WPAS_Shim_Test_Runner::assert_eq(
	'E2E: registered item label survives the filter',
	$after_plugin['menu']['posts']['items']['plugin-e2e']['label'],
	'E2E'
);

// Full pipeline — register via plugin, resolve, both shim + screen
// binding flow through.
WP_Admin_Workspaces_Menu_Items::reset();
WP_Admin_Workspaces_Resolver::reset_request_memo();
if ( class_exists( 'WP_Admin_Workspaces_Cache' ) ) {
	WP_Admin_Workspaces_Cache::flush();
}

wp_admin_workspaces_register_menu_item(
	'plugin-bound',
	array(
		'parent'   => 'dashboard',
		'position' => 25,
	)
);
// Register a screen for it so binding fills label/icon.
$plugin_doc_e2e                              = wpas_shim_test_v3_doc();
$plugin_doc_e2e['screens']['plugin-bound']   = array(
	'label' => 'Bound by Screen',
	'icon'  => 'admin-tools',
	'path'  => '/plugin-bound',
	'app'   => 'plugin:my-plugin/bound',
);

$origins_e2e  = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => $plugin_doc_e2e,
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$resolved_e2e = WP_Admin_Workspaces_Resolver::resolve_with( $origins_e2e );

WPAS_Shim_Test_Runner::assert_true(
	'pipeline: shim item appears under parent after full resolve',
	isset( $resolved_e2e['menu']['dashboard']['items']['plugin-bound'] )
);
WPAS_Shim_Test_Runner::assert_eq(
	'pipeline: screen-binding fills shim item label from screen',
	$resolved_e2e['menu']['dashboard']['items']['plugin-bound']['label'],
	'Bound by Screen'
);
WPAS_Shim_Test_Runner::assert_eq(
	'pipeline: screen-binding fills shim item icon from screen',
	$resolved_e2e['menu']['dashboard']['items']['plugin-bound']['icon'],
	'admin-tools'
);
WPAS_Shim_Test_Runner::assert_eq(
	'pipeline: screen-binding stamps href from screen path',
	$resolved_e2e['menu']['dashboard']['items']['plugin-bound']['href'],
	'#/plugin-bound'
);

// -----------------------------------------------------------------------------
// Cache-fingerprint signal — registry mutations contribute to the cache key
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();
WP_Admin_Workspaces_Admin_Routes::reset();

$baseline_signals = apply_filters( 'wp_admin_workspaces_cache_signals', array(), array() );
WPAS_Shim_Test_Runner::assert_true(
	'cache signals — no menu_items key when registry empty',
	! isset( $baseline_signals['menu_items'] )
);

wp_admin_workspaces_register_menu_item(
	'cache-fp',
	array(
		'label' => 'X',
		'href'  => '/cache',
	)
);
$after_menu = apply_filters( 'wp_admin_workspaces_cache_signals', array(), array() );
WPAS_Shim_Test_Runner::assert_true(
	'menu registration adds menu_items fingerprint',
	isset( $after_menu['menu_items'] )
);

wp_admin_workspaces_register_menu_item(
	'cache-fp-2',
	array(
		'label' => 'Y',
		'href'  => '/cache-2',
	)
);
$after_second = apply_filters( 'wp_admin_workspaces_cache_signals', array(), array() );
WPAS_Shim_Test_Runner::assert_true(
	'second registration changes menu_items fingerprint',
	$after_menu['menu_items'] !== $after_second['menu_items']
);

WP_Admin_Workspaces_Menu_Items::reset();
$cleared = apply_filters( 'wp_admin_workspaces_cache_signals', array(), array() );
WPAS_Shim_Test_Runner::assert_true(
	'reset clears menu_items fingerprint',
	! isset( $cleared['menu_items'] )
);

// -----------------------------------------------------------------------------
// Admin routes — unchanged from v2 (kept here to confirm Phase-3a-out-of-
// scope status; the shim still validates + contributes correctly).
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Admin_Routes::reset();

$path = wp_admin_workspaces_register_admin_route(
	'/plugin/list',
	array(
		'app'    => 'plugin:my-plugin/list',
		'config' => array( 'view' => 'table' ),
	)
);
WPAS_Shim_Test_Runner::assert_eq( 'admin-route: register returns path', $path, '/plugin/list' );

$err = wp_admin_workspaces_register_admin_route( '', array( 'app' => 'plugin:x/y' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'admin-route: rejects empty path', $err );

$err = wp_admin_workspaces_register_admin_route( 'no-leading-slash', array( 'app' => 'plugin:x/y' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'admin-route: rejects path without leading slash', $err );

$err = wp_admin_workspaces_register_admin_route( '/plugin/list', array( 'app' => 'plugin:my-plugin/other' ) );
WPAS_Shim_Test_Runner::assert_wp_error( 'admin-route: rejects duplicate path', $err );

WP_Admin_Workspaces_Admin_Routes::reset();
wp_admin_workspaces_register_admin_route(
	'/plugin/list',
	array(
		'app'    => 'plugin:my-plugin/list',
		'config' => array( 'view' => 'table' ),
	)
);
$with_routes = WP_Admin_Workspaces_Admin_Routes::contribute( wpas_shim_test_v3_doc() );
WPAS_Shim_Test_Runner::assert_eq(
	'admin-route: shim route appended to doc',
	$with_routes['routes']['/plugin/list']['app'],
	'plugin:my-plugin/list'
);

WP_Admin_Workspaces_Admin_Routes::reset();
$cleared_routes = apply_filters( 'wp_admin_workspaces_cache_signals', array(), array() );
WPAS_Shim_Test_Runner::assert_true(
	'admin-route: reset clears admin_routes fingerprint',
	! isset( $cleared_routes['admin_routes'] )
);

// -----------------------------------------------------------------------------
// Cleanup
// -----------------------------------------------------------------------------

WP_Admin_Workspaces_Menu_Items::reset();
WP_Admin_Workspaces_Admin_Routes::reset();
WP_Admin_Workspaces_Resolver::reset_request_memo();
if ( class_exists( 'WP_Admin_Workspaces_Cache' ) ) {
	WP_Admin_Workspaces_Cache::flush();
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

$total = WPAS_Shim_Test_Runner::$pass + WPAS_Shim_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Shim_Test_Runner::$pass . ' passed, ' . WPAS_Shim_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Shim_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
