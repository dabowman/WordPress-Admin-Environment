<?php
/**
 * Security cascade tests — covers the four blocker fixes shipped in
 * PR 1 of the PR #49 pre-merge feedback chain.
 *
 *   1. Trust-tier enforcement on screens[].permissions (shrink-only on
 *      role / user origins; trusted origins pass through).
 *   2. Null tombstones gated to trust-tier origins (core/engine/plugin
 *      via `merge_authoritative`, site via `merge_with_tombstones`;
 *      role/user `merge()` no-ops with WP_DEBUG notice).
 *   3. `customizable` per-field enforcement on the seven v3 top-level
 *      blocks for consumer origins (role/user). Hardcoded deny-list
 *      rejects security-critical paths regardless of allowlist.
 *   4. `is_safe_href` rejects protocol-relative URLs.
 *
 * Invoke:
 *   npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-security-cascade-tests.php
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

class WPAS_Security_Cascade_Test_Runner {
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

	public static function assert_false( $label, $actual ) {
		self::assert_eq( $label, (bool) $actual, false );
	}
}

$T = 'WPAS_Security_Cascade_Test_Runner';

// ── 1. Trust-tier enforcement on screens[].permissions ────────────────

echo "\n— Trust-tier enforcement on screens[].permissions —\n";

WP_Admin_Workspaces_Permissions::reset_audit();

// User origin attempts to ADD `manage_options` to a screen whose baseline
// only declares `read`. Shrink-only rule strips it.
$baseline_doc = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array( 'read' ),
				'roles'        => array( 'subscriber' ),
			),
		),
	),
);
$user_doc = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array( 'read', 'manage_options' ),
				'roles'        => array( 'subscriber', 'administrator' ),
			),
		),
	),
);

$filtered = WP_Admin_Workspaces_Permissions::enforce_origin_tier( $user_doc, $baseline_doc, 'user' );
$T::assert_eq(
	'user-origin: caps shrunk to baseline intersection (drops manage_options)',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array( 'read' )
);
$T::assert_eq(
	'user-origin: roles shrunk to baseline intersection (drops administrator)',
	$filtered['screens']['profile']['permissions']['roles'],
	array( 'subscriber' )
);

$audit = WP_Admin_Workspaces_Permissions::get_audit();
$T::assert_true(
	'user-origin: audit recorded ≥2 grow attempts',
	count( $audit ) >= 2
);

// User origin REMOVES — kept (shrink-only allows removal).
WP_Admin_Workspaces_Permissions::reset_audit();
$user_remove = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array(),
				'roles'        => array( 'subscriber' ),
			),
		),
	),
);
$filtered = WP_Admin_Workspaces_Permissions::enforce_origin_tier( $user_remove, $baseline_doc, 'user' );
$T::assert_eq(
	'user-origin: removing caps from baseline kept',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array()
);
$T::assert_eq(
	'user-origin: removing caps generates zero audit entries',
	count( WP_Admin_Workspaces_Permissions::get_audit() ),
	0
);

// Site origin ADDS — kept (top of trust tier; add+remove allowed).
WP_Admin_Workspaces_Permissions::reset_audit();
$site_doc = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array( 'read', 'edit_posts' ),
			),
		),
	),
);
$filtered = WP_Admin_Workspaces_Permissions::enforce_origin_tier( $site_doc, $baseline_doc, 'site' );
$T::assert_eq(
	'site-origin: ADD is allowed (kept verbatim — top of trust tier)',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array( 'read', 'edit_posts' )
);

// Role origin behaves like user (consumer tier).
WP_Admin_Workspaces_Permissions::reset_audit();
$role_grow = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array( 'manage_options' ),
			),
		),
	),
);
$filtered = WP_Admin_Workspaces_Permissions::enforce_origin_tier( $role_grow, $baseline_doc, 'role' );
$T::assert_eq(
	'role-origin: grow attempt stripped',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array()
);

// ── 2. Null tombstones gated to trust-tier origins ────────────────────

echo "\n— Null tombstone gating —\n";

// Consumer `merge()` ignores null tombstone.
$consumer_merge = WP_Admin_Workspaces_Merge::merge(
	array( 'screens' => array( 'users' => array( 'label' => 'Users' ) ) ),
	array( 'screens' => array( 'users' => null ) )
);
$T::assert_true(
	'consumer merge: null tombstone is no-op (users key survives)',
	isset( $consumer_merge['screens']['users'] )
);

// `merge_with_tombstones` honors null tombstone — used for site origin.
$site_merge = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'screens' => array( 'users' => array( 'label' => 'Users' ) ) ),
	array( 'screens' => array( 'users' => null ) )
);
$T::assert_false(
	'site (merge_with_tombstones): null tombstone honored (users removed)',
	isset( $site_merge['screens']['users'] )
);

// `merge_authoritative` honors null tombstone — used for trusted origins.
$auth_merge = WP_Admin_Workspaces_Merge::merge_authoritative(
	array( 'screens' => array( 'users' => array( 'label' => 'Users' ) ) ),
	array( 'screens' => array( 'users' => null ) )
);
$T::assert_false(
	'plugin (merge_authoritative): null tombstone honored',
	isset( $auth_merge['screens']['users'] )
);

// `__tombstone: true` in keyed-array entry — consumer merge no-ops.
$consumer_kt = WP_Admin_Workspaces_Merge::merge(
	array( 'menu' => array(
		array( 'id' => 'posts', 'label' => 'Posts' ),
		array( 'id' => 'pages', 'label' => 'Pages' ),
	) ),
	array( 'menu' => array(
		array( 'id' => 'posts', '__tombstone' => true ),
	) )
);
$ids = array_column( $consumer_kt['menu'], 'id' );
$T::assert_true(
	'consumer merge: __tombstone marker no-op (posts entry survives)',
	in_array( 'posts', $ids, true )
);
// The ignored marker must not pollute the surviving entry.
$posts_entry = null;
foreach ( $consumer_kt['menu'] as $entry ) {
	if ( ( $entry['id'] ?? null ) === 'posts' ) {
		$posts_entry = $entry;
		break;
	}
}
$T::assert_false(
	'consumer merge: ignored __tombstone does not pollute surviving entry',
	is_array( $posts_entry ) && array_key_exists( '__tombstone', $posts_entry )
);

// Same payload through merge_with_tombstones — honored.
$site_kt = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'menu' => array(
		array( 'id' => 'posts', 'label' => 'Posts' ),
		array( 'id' => 'pages', 'label' => 'Pages' ),
	) ),
	array( 'menu' => array(
		array( 'id' => 'posts', '__tombstone' => true ),
	) )
);
$ids = array_column( $site_kt['menu'], 'id' );
$T::assert_false(
	'site merge: __tombstone marker honored (posts dropped)',
	in_array( 'posts', $ids, true )
);
$T::assert_true(
	'site merge: __tombstone marker preserves siblings (pages survives)',
	in_array( 'pages', $ids, true )
);

// Deep-nested null tombstone via consumer merge — no-op at deep path too.
$deep_consumer = WP_Admin_Workspaces_Merge::merge(
	array( 'styles' => array( 'color' => array( 'primary' => '#000', 'bg' => '#fff' ) ) ),
	array( 'styles' => array( 'color' => array( 'primary' => null ) ) )
);
$T::assert_true(
	'consumer merge: deep null tombstone no-op (primary survives)',
	isset( $deep_consumer['styles']['color']['primary'] )
);

// Same via site origin — honored.
$deep_site = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'styles' => array( 'color' => array( 'primary' => '#000', 'bg' => '#fff' ) ) ),
	array( 'styles' => array( 'color' => array( 'primary' => null ) ) )
);
$T::assert_false(
	'site merge: deep null tombstone honored (primary removed)',
	isset( $deep_site['styles']['color']['primary'] )
);
$T::assert_true(
	'site merge: deep tombstone preserves sibling',
	isset( $deep_site['styles']['color']['bg'] )
);

// ── 3. customizable per-field enforcement on v3 top-level blocks ──────

echo "\n— customizable per-field enforcement —\n";

// Consumer-origin write to a screen field NOT on the allowlist → rejected.
$upstream = array(
	'screens' => array(
		'users' => array(
			'label'         => 'Users',
			'permissions'   => array( 'capabilities' => array( 'list_users' ) ),
			// No customizable declaration anywhere → default-deny.
		),
	),
);
$downstream = array(
	'screens' => array(
		'users' => array(
			'label' => 'CHANGED',
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'consumer user-origin: no customizable declaration → screens block dropped',
	! isset( $filtered['screens'] )
);

// Consumer write to allowlisted path → kept.
$upstream = array(
	'screens' => array(
		'users' => array(
			'label'         => 'Users',
			'icon'          => 'users',
			'customizable'  => array( 'label' ),
		),
	),
);
$downstream = array(
	'screens' => array(
		'users' => array(
			'label' => 'CHANGED',
			'icon'  => 'evil',
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_eq(
	'consumer user-origin: allowlisted "label" path survives',
	$filtered['screens']['users']['label'] ?? null,
	'CHANGED'
);
$T::assert_true(
	'consumer user-origin: non-allowlisted "icon" path dropped',
	! isset( $filtered['screens']['users']['icon'] )
);

// Hardcoded deny — screens.<id>.permissions NEVER writable even with allowlist.
$upstream = array(
	'screens' => array(
		'users' => array(
			'label'        => 'Users',
			'permissions'  => array( 'capabilities' => array( 'list_users' ) ),
			'customizable' => array( 'permissions', 'permissions.capabilities' ),
		),
	),
);
$downstream = array(
	'screens' => array(
		'users' => array(
			'permissions' => array( 'capabilities' => array( 'read' ) ),
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: screens.*.permissions rejected even with matching allowlist',
	! isset( $filtered['screens']['users']['permissions'] )
);

// Hardcoded deny — screens.<id>.app NEVER writable.
$upstream = array(
	'screens' => array(
		'users' => array(
			'app'          => 'core:users',
			'customizable' => array( 'app' ),
		),
	),
);
$downstream = array(
	'screens' => array(
		'users' => array(
			'app' => 'attacker:fake-users',
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: screens.*.app rejected even with matching allowlist',
	! isset( $filtered['screens']['users']['app'] )
);

// Hardcoded deny — menu.**.permissions NEVER writable at ANY depth (the
// `**` pattern walks the nested menu tree), so a consumer can't broaden
// nav-link visibility even with a matching `customizable` allowlist.
$upstream = array(
	'menu' => array(
		'tools' => array(
			'label'        => 'Tools',
			'permissions'  => array( 'roles' => array( 'administrator' ) ),
			'customizable' => array( 'permissions', 'permissions.roles', 'items' ),
			'items'        => array(
				'reports' => array(
					'label'       => 'Reports',
					'permissions' => array( 'roles' => array( 'administrator' ) ),
				),
			),
		),
	),
);
$downstream = array(
	'menu' => array(
		'tools' => array(
			'permissions' => array( 'roles' => array( 'subscriber' ) ),
			'items'       => array(
				'reports' => array(
					'permissions' => array( 'roles' => array( 'subscriber' ) ),
				),
			),
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: menu.*.permissions rejected (top level)',
	! isset( $filtered['menu']['tools']['permissions'] )
);
$T::assert_true(
	'hardcoded deny: menu.**.permissions rejected (nested items)',
	! isset( $filtered['menu']['tools']['items']['reports']['permissions'] )
);

// Hardcoded deny — commands[].invoke NEVER writable.
$upstream = array(
	'commands' => array(
		array(
			'id'           => 'save',
			'invoke'       => 'core/save',
			'customizable' => array( 'invoke', 'shortcut' ),
		),
	),
);
$downstream = array(
	'commands' => array(
		array(
			'id'     => 'save',
			'invoke' => 'attacker/redirect',
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: commands[].invoke rejected even with matching allowlist',
	empty( $filtered['commands'] )
);

// Hardcoded deny — the top-level `engine` is NEVER writable.
$upstream = array(
	'engine'       => 'core:default',
	'customizable' => array( 'engine' ),
);
$downstream = array(
	'engine' => 'attacker:malicious-engine',
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: engine rejected even with matching allowlist',
	! isset( $filtered['engine'] )
);

// Trust-tier origin (site) — passes through verbatim.
$upstream = array(
	'screens' => array(
		'users' => array(
			'label' => 'Users',
		),
	),
);
$downstream = array(
	'screens' => array(
		'users' => array(
			'label'       => 'SITE-CHANGED',
			'permissions' => array( 'capabilities' => array( 'manage_options' ) ),
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'site' );
$T::assert_eq(
	'trust-tier site: writes pass through verbatim (label changed)',
	$filtered['screens']['users']['label'] ?? null,
	'SITE-CHANGED'
);
$T::assert_true(
	'trust-tier site: writes pass through verbatim (permissions set)',
	isset( $filtered['screens']['users']['permissions'] )
);

// `customizable: true` on an ancestor → allow downstream descendant write.
$upstream = array(
	'menu' => array(
		'tools' => array(
			'label'        => 'Tools',
			'customizable' => true,
		),
	),
);
$downstream = array(
	'menu' => array(
		'tools' => array(
			'label' => 'ATTACKER',
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_eq(
	'customizable=true ancestor: descendant write allowed',
	$filtered['menu']['tools']['label'] ?? null,
	'ATTACKER'
);

// Emergency bypass filter restores pre-fix behavior.
add_filter( 'wp_admin_workspaces_customizable_bypass', '__return_true' );
$upstream = array(
	'screens' => array(
		'users' => array(
			'label' => 'Users',
		),
	),
);
$downstream = array(
	'screens' => array(
		'users' => array(
			'label'       => 'BYPASSED',
			'permissions' => array( 'capabilities' => array( 'manage_options' ) ),
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_eq(
	'emergency bypass filter: user-origin writes pass through verbatim',
	$filtered['screens']['users']['label'] ?? null,
	'BYPASSED'
);
remove_filter( 'wp_admin_workspaces_customizable_bypass', '__return_true' );

// ── 3a. List-shape preservation through filter_v3_block ───────────────
// Reviewer's finding #1: pre-fix, filter_v3_block flattened list-of-keyed-
// objects into dot-paths and rehydrated them as assoc maps. Merge engine
// then saw shape-mismatch base-vs-over and *replaced the entire base
// list*. Catastrophic for commands[] consumers (compileCommands.mjs reads
// a list); latent for preload[], routes[].

echo "\n— List-shape preservation (filter_v3_block) —\n";

// commands.<id>.shortcut allowlisted — survives + output is list-shape.
$upstream = array(
	'commands' => array(
		array(
			'id'           => 'save',
			'shortcut'     => 'Mod+S',
			'invoke'       => 'core/save',
			'customizable' => array( 'shortcut' ),
		),
	),
);
$downstream = array(
	'commands' => array(
		array(
			'id'       => 'save',
			'shortcut' => 'Mod+Alt+S',
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'list-shape: commands[] survives as a list (NOT assoc map)',
	is_array( $filtered['commands'] ?? null ) && ! WP_Admin_Workspaces_Merge::is_assoc( $filtered['commands'] )
);
$T::assert_eq(
	'list-shape: commands[0].id preserved on the survived entry',
	$filtered['commands'][0]['id'] ?? null,
	'save'
);
$T::assert_eq(
	'list-shape: commands[0].shortcut allowlisted value flows through',
	$filtered['commands'][0]['shortcut'] ?? null,
	'Mod+Alt+S'
);

// Merge the filtered downstream over the base — list shape must
// round-trip the merge cleanly. Pre-fix, the assoc-map output here would
// trip the merge engine's shape-mismatch branch (`base_is_assoc !==
// over_is_assoc`) and the entire upstream commands list would be
// *replaced* by the assoc map.
$base_doc = array(
	'commands' => array(
		array( 'id' => 'save',   'shortcut' => 'Mod+S',     'invoke' => 'core/save' ),
		array( 'id' => 'cancel', 'shortcut' => 'Escape',    'invoke' => 'core/cancel' ),
		array( 'id' => 'find',   'shortcut' => 'Mod+F',     'invoke' => 'core/find' ),
	),
);
$merged = WP_Admin_Workspaces_Merge::merge( $base_doc, $filtered );
$T::assert_true(
	'list-shape merge: merged commands stays a list',
	is_array( $merged['commands'] ) && ! WP_Admin_Workspaces_Merge::is_assoc( $merged['commands'] )
);
$T::assert_eq(
	'list-shape merge: all three base entries survive (no list-replacement bug)',
	count( $merged['commands'] ),
	3
);
$ids_after = array_column( $merged['commands'], 'id' );
sort( $ids_after );
$T::assert_eq(
	'list-shape merge: cancel + find entries preserved alongside save',
	$ids_after,
	array( 'cancel', 'find', 'save' )
);
$save_after = null;
foreach ( $merged['commands'] as $entry ) {
	if ( $entry['id'] === 'save' ) {
		$save_after = $entry;
		break;
	}
}
$T::assert_eq(
	'list-shape merge: save entry got the new shortcut from consumer override',
	$save_after['shortcut'] ?? null,
	'Mod+Alt+S'
);
$T::assert_eq(
	'list-shape merge: save entry retained its baseline invoke',
	$save_after['invoke'] ?? null,
	'core/save'
);

// Keyed-list nested under an assoc parent: `screens[id].apps[]`. The
// downstream payload has `apps` as a list of `{id, app}` entries. After
// filter_v3_block, the apps[] block should still be a list. Use
// `customizable: true` on the screen entry to grant subtree access (the
// path-allowlist tail matcher requires exact paths, so listing each
// leaf would be verbose — `customizable: true` is the documented "all
// fields writable downstream" shortcut).
$upstream = array(
	'screens' => array(
		'posts' => array(
			'label'        => 'Posts',
			'customizable' => true,
			'apps'         => array(
				array( 'id' => 'list', 'app' => 'core:posts' ),
			),
		),
	),
);
$downstream = array(
	'screens' => array(
		'posts' => array(
			'apps' => array(
				array( 'id' => 'list', 'app' => 'core:posts' ),
				array( 'id' => 'preview', 'app' => 'core:editor' ),
			),
		),
	),
);
$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'nested keyed-list: screens.posts.apps[] stays a list',
	is_array( $filtered['screens']['posts']['apps'] ?? null ) && ! WP_Admin_Workspaces_Merge::is_assoc( $filtered['screens']['posts']['apps'] )
);
$T::assert_eq(
	'nested keyed-list: every consumer entry survives (with id field intact)',
	count( $filtered['screens']['posts']['apps'] ),
	2
);
$ids_nested = array_column( $filtered['screens']['posts']['apps'], 'id' );
sort( $ids_nested );
$T::assert_eq(
	'nested keyed-list: id field preserved for round-trip merge',
	$ids_nested,
	array( 'list', 'preview' )
);

// ── 4. is_safe_href protocol-relative reject ──────────────────────────

echo "\n— is_safe_href —\n";

// is_safe_href is private — exercise indirectly via wp_admin_workspaces_register_menu_item.
// Register an item with a known-bad href and assert it's rejected.
$bypass_evil = wp_admin_workspaces_register_menu_item( 'wpas-test-evil', array(
	'label' => 'evil',
	'href'  => '//evil.example.com',
) );
$T::assert_true(
	'is_safe_href: protocol-relative `//evil.example.com` rejected (WP_Error)',
	is_wp_error( $bypass_evil )
);

$bypass_evil_long = wp_admin_workspaces_register_menu_item( 'wpas-test-evil-long', array(
	'label' => 'evil',
	'href'  => '//evil.example.com/wp-login.php?redirect=true',
) );
$T::assert_true(
	'is_safe_href: protocol-relative with path/query rejected',
	is_wp_error( $bypass_evil_long )
);

// Affirmative cases — accepted hrefs.
$root_relative = wp_admin_workspaces_register_menu_item( 'wpas-test-root', array(
	'label' => 'ok',
	'href'  => '/wp-admin/foo.php',
) );
$T::assert_true(
	'is_safe_href: root-relative `/wp-admin/foo.php` accepted',
	! is_wp_error( $root_relative )
);

$hash = wp_admin_workspaces_register_menu_item( 'wpas-test-hash', array(
	'label' => 'ok',
	'href'  => '#anchor',
) );
$T::assert_true(
	'is_safe_href: hash route `#anchor` accepted',
	! is_wp_error( $hash )
);

$https = wp_admin_workspaces_register_menu_item( 'wpas-test-https', array(
	'label' => 'ok',
	'href'  => 'https://wordpress.org/',
) );
$T::assert_true(
	'is_safe_href: explicit https accepted',
	! is_wp_error( $https )
);

$mailto = wp_admin_workspaces_register_menu_item( 'wpas-test-mailto', array(
	'label' => 'ok',
	'href'  => 'mailto:user@example.com',
) );
$T::assert_true(
	'is_safe_href: mailto accepted',
	! is_wp_error( $mailto )
);

// Other rejected schemes.
$js = wp_admin_workspaces_register_menu_item( 'wpas-test-js', array(
	'label' => 'evil',
	'href'  => 'javascript:alert(1)',
) );
$T::assert_true(
	'is_safe_href: javascript: rejected',
	is_wp_error( $js )
);

$data_url = wp_admin_workspaces_register_menu_item( 'wpas-test-data', array(
	'label' => 'evil',
	'href'  => 'data:text/html,<script>alert(1)</script>',
) );
$T::assert_true(
	'is_safe_href: data: rejected',
	is_wp_error( $data_url )
);

// vbscript: is rejected by the fall-through `strpos(':') === false`
// branch — was claimed in the docblock but never asserted. Add
// explicit coverage to lock the contract.
$vbs = wp_admin_workspaces_register_menu_item( 'wpas-test-vbs', array(
	'label' => 'evil',
	'href'  => 'vbscript:msgbox(1)',
) );
$T::assert_true(
	'is_safe_href: vbscript: rejected',
	is_wp_error( $vbs )
);

// Whitespace-leading protocol-relative — HTML5 strips before
// navigation, so the browser would route to `//evil.example.com`.
// The validator's `trim()` neutralizes the bypass.
$ws_space = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-space', array(
	'label' => 'evil',
	'href'  => ' //evil.example.com',
) );
$T::assert_true(
	'is_safe_href: leading-space protocol-relative rejected',
	is_wp_error( $ws_space )
);

$ws_tab = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-tab', array(
	'label' => 'evil',
	'href'  => "\t//evil.example.com",
) );
$T::assert_true(
	'is_safe_href: leading-tab protocol-relative rejected',
	is_wp_error( $ws_tab )
);

$ws_newline = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-newline', array(
	'label' => 'evil',
	'href'  => "\n//evil.example.com",
) );
$T::assert_true(
	'is_safe_href: leading-newline protocol-relative rejected',
	is_wp_error( $ws_newline )
);

$ws_multi = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-multi', array(
	'label' => 'evil',
	'href'  => "  \t //evil.example.com",
) );
$T::assert_true(
	'is_safe_href: multi-whitespace protocol-relative rejected',
	is_wp_error( $ws_multi )
);

// Form-feed (`\x0c`) is WHATWG-stripped ASCII whitespace but absent from
// PHP's default trim() charset — the explicit charlist must catch it.
$ws_ff = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-ff', array(
	'label' => 'evil',
	'href'  => "\x0c//evil.example.com",
) );
$T::assert_true(
	'is_safe_href: leading form-feed protocol-relative rejected',
	is_wp_error( $ws_ff )
);

// Backslash variants. Browsers sometimes treat `\\host` as
// protocol-relative; legacy WebViews and IE/Edge historically did.
// Defense-in-depth reject.
$bs_double = wp_admin_workspaces_register_menu_item( 'wpas-test-bs-double', array(
	'label' => 'evil',
	'href'  => '\\\\evil.example.com',
) );
$T::assert_true(
	'is_safe_href: double-backslash `\\\\evil.example.com` rejected',
	is_wp_error( $bs_double )
);

$bs_escaped = wp_admin_workspaces_register_menu_item( 'wpas-test-bs-escaped', array(
	'label' => 'evil',
	'href'  => '\\/\\/evil.example.com',
) );
$T::assert_true(
	'is_safe_href: escaped-slash `\\/\\/evil.example.com` rejected',
	is_wp_error( $bs_escaped )
);

// Whitespace-only href trims to '' and is accepted (no navigation
// target → nothing harmful to register).
$ws_only = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-only', array(
	'label' => 'ok',
	'href'  => '   ',
) );
$T::assert_true(
	'is_safe_href: whitespace-only href accepted (trims to empty)',
	! is_wp_error( $ws_only )
);

// Normal hrefs with leading whitespace still validate to the trimmed
// inner value — `  /wp-admin/foo.php` → `/wp-admin/foo.php` → accepted.
$ws_safe = wp_admin_workspaces_register_menu_item( 'wpas-test-ws-safe', array(
	'label' => 'ok',
	'href'  => '  /wp-admin/foo.php',
) );
$T::assert_true(
	'is_safe_href: whitespace-padded safe href still accepted',
	! is_wp_error( $ws_safe )
);

WP_Admin_Workspaces_Menu_Items::reset();

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
