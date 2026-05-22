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
require_once $plugin_dir . 'wp-admin-shell.php';

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

WP_Admin_Shell_Permissions::reset_audit();

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

$filtered = WP_Admin_Shell_Permissions::enforce_origin_tier( $user_doc, $baseline_doc, 'user' );
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

$audit = WP_Admin_Shell_Permissions::get_audit();
$T::assert_true(
	'user-origin: audit recorded ≥2 grow attempts',
	count( $audit ) >= 2
);

// User origin REMOVES — kept (shrink-only allows removal).
WP_Admin_Shell_Permissions::reset_audit();
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
$filtered = WP_Admin_Shell_Permissions::enforce_origin_tier( $user_remove, $baseline_doc, 'user' );
$T::assert_eq(
	'user-origin: removing caps from baseline kept',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array()
);
$T::assert_eq(
	'user-origin: removing caps generates zero audit entries',
	count( WP_Admin_Shell_Permissions::get_audit() ),
	0
);

// Site origin ADDS — kept (top of trust tier; add+remove allowed).
WP_Admin_Shell_Permissions::reset_audit();
$site_doc = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array( 'read', 'edit_posts' ),
			),
		),
	),
);
$filtered = WP_Admin_Shell_Permissions::enforce_origin_tier( $site_doc, $baseline_doc, 'site' );
$T::assert_eq(
	'site-origin: ADD is allowed (kept verbatim — top of trust tier)',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array( 'read', 'edit_posts' )
);

// Role origin behaves like user (consumer tier).
WP_Admin_Shell_Permissions::reset_audit();
$role_grow = array(
	'screens' => array(
		'profile' => array(
			'permissions' => array(
				'capabilities' => array( 'manage_options' ),
			),
		),
	),
);
$filtered = WP_Admin_Shell_Permissions::enforce_origin_tier( $role_grow, $baseline_doc, 'role' );
$T::assert_eq(
	'role-origin: grow attempt stripped',
	$filtered['screens']['profile']['permissions']['capabilities'],
	array()
);

// ── 2. Null tombstones gated to trust-tier origins ────────────────────

echo "\n— Null tombstone gating —\n";

// Consumer `merge()` ignores null tombstone.
$consumer_merge = WP_Admin_Shell_Merge::merge(
	array( 'screens' => array( 'users' => array( 'label' => 'Users' ) ) ),
	array( 'screens' => array( 'users' => null ) )
);
$T::assert_true(
	'consumer merge: null tombstone is no-op (users key survives)',
	isset( $consumer_merge['screens']['users'] )
);

// `merge_with_tombstones` honors null tombstone — used for site origin.
$site_merge = WP_Admin_Shell_Merge::merge_with_tombstones(
	array( 'screens' => array( 'users' => array( 'label' => 'Users' ) ) ),
	array( 'screens' => array( 'users' => null ) )
);
$T::assert_false(
	'site (merge_with_tombstones): null tombstone honored (users removed)',
	isset( $site_merge['screens']['users'] )
);

// `merge_authoritative` honors null tombstone — used for trusted origins.
$auth_merge = WP_Admin_Shell_Merge::merge_authoritative(
	array( 'screens' => array( 'users' => array( 'label' => 'Users' ) ) ),
	array( 'screens' => array( 'users' => null ) )
);
$T::assert_false(
	'plugin (merge_authoritative): null tombstone honored',
	isset( $auth_merge['screens']['users'] )
);

// `__tombstone: true` in keyed-array entry — consumer merge no-ops.
$consumer_kt = WP_Admin_Shell_Merge::merge(
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

// Same payload through merge_with_tombstones — honored.
$site_kt = WP_Admin_Shell_Merge::merge_with_tombstones(
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
$deep_consumer = WP_Admin_Shell_Merge::merge(
	array( 'styles' => array( 'color' => array( 'primary' => '#000', 'bg' => '#fff' ) ) ),
	array( 'styles' => array( 'color' => array( 'primary' => null ) ) )
);
$T::assert_true(
	'consumer merge: deep null tombstone no-op (primary survives)',
	isset( $deep_consumer['styles']['color']['primary'] )
);

// Same via site origin — honored.
$deep_site = WP_Admin_Shell_Merge::merge_with_tombstones(
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: screens.*.app rejected even with matching allowlist',
	! isset( $filtered['screens']['users']['app'] )
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: commands[].invoke rejected even with matching allowlist',
	empty( $filtered['commands'] )
);

// Hardcoded deny — workspace.engine NEVER writable.
$upstream = array(
	'workspace' => array(
		'engine'       => 'core:default',
		'customizable' => array( 'engine' ),
	),
);
$downstream = array(
	'workspace' => array(
		'engine' => 'attacker:malicious-engine',
	),
);
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_true(
	'hardcoded deny: workspace.engine rejected even with matching allowlist',
	! isset( $filtered['workspace']['engine'] )
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'site' );
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_eq(
	'customizable=true ancestor: descendant write allowed',
	$filtered['menu']['tools']['label'] ?? null,
	'ATTACKER'
);

// Emergency bypass filter restores pre-fix behavior.
add_filter( 'wp_admin_shell_customizable_bypass', '__return_true' );
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
$filtered = WP_Admin_Shell_Customizable::filter_doc( $upstream, $downstream, 'user' );
$T::assert_eq(
	'emergency bypass filter: user-origin writes pass through verbatim',
	$filtered['screens']['users']['label'] ?? null,
	'BYPASSED'
);
remove_filter( 'wp_admin_shell_customizable_bypass', '__return_true' );

// ── 4. is_safe_href protocol-relative reject ──────────────────────────

echo "\n— is_safe_href —\n";

// is_safe_href is private — exercise indirectly via wp_admin_shell_register_menu_item.
// Register an item with a known-bad href and assert it's rejected.
$bypass_evil = wp_admin_shell_register_menu_item( 'wpas-test-evil', array(
	'label' => 'evil',
	'href'  => '//evil.example.com',
) );
$T::assert_true(
	'is_safe_href: protocol-relative `//evil.example.com` rejected (WP_Error)',
	is_wp_error( $bypass_evil )
);

$bypass_evil_long = wp_admin_shell_register_menu_item( 'wpas-test-evil-long', array(
	'label' => 'evil',
	'href'  => '//evil.example.com/wp-login.php?redirect=true',
) );
$T::assert_true(
	'is_safe_href: protocol-relative with path/query rejected',
	is_wp_error( $bypass_evil_long )
);

// Affirmative cases — accepted hrefs.
$root_relative = wp_admin_shell_register_menu_item( 'wpas-test-root', array(
	'label' => 'ok',
	'href'  => '/wp-admin/foo.php',
) );
$T::assert_true(
	'is_safe_href: root-relative `/wp-admin/foo.php` accepted',
	! is_wp_error( $root_relative )
);

$hash = wp_admin_shell_register_menu_item( 'wpas-test-hash', array(
	'label' => 'ok',
	'href'  => '#anchor',
) );
$T::assert_true(
	'is_safe_href: hash route `#anchor` accepted',
	! is_wp_error( $hash )
);

$https = wp_admin_shell_register_menu_item( 'wpas-test-https', array(
	'label' => 'ok',
	'href'  => 'https://wordpress.org/',
) );
$T::assert_true(
	'is_safe_href: explicit https accepted',
	! is_wp_error( $https )
);

$mailto = wp_admin_shell_register_menu_item( 'wpas-test-mailto', array(
	'label' => 'ok',
	'href'  => 'mailto:user@example.com',
) );
$T::assert_true(
	'is_safe_href: mailto accepted',
	! is_wp_error( $mailto )
);

// Other rejected schemes.
$js = wp_admin_shell_register_menu_item( 'wpas-test-js', array(
	'label' => 'evil',
	'href'  => 'javascript:alert(1)',
) );
$T::assert_true(
	'is_safe_href: javascript: rejected',
	is_wp_error( $js )
);

$data_url = wp_admin_shell_register_menu_item( 'wpas-test-data', array(
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
$vbs = wp_admin_shell_register_menu_item( 'wpas-test-vbs', array(
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
$ws_space = wp_admin_shell_register_menu_item( 'wpas-test-ws-space', array(
	'label' => 'evil',
	'href'  => ' //evil.example.com',
) );
$T::assert_true(
	'is_safe_href: leading-space protocol-relative rejected',
	is_wp_error( $ws_space )
);

$ws_tab = wp_admin_shell_register_menu_item( 'wpas-test-ws-tab', array(
	'label' => 'evil',
	'href'  => "\t//evil.example.com",
) );
$T::assert_true(
	'is_safe_href: leading-tab protocol-relative rejected',
	is_wp_error( $ws_tab )
);

$ws_newline = wp_admin_shell_register_menu_item( 'wpas-test-ws-newline', array(
	'label' => 'evil',
	'href'  => "\n//evil.example.com",
) );
$T::assert_true(
	'is_safe_href: leading-newline protocol-relative rejected',
	is_wp_error( $ws_newline )
);

$ws_multi = wp_admin_shell_register_menu_item( 'wpas-test-ws-multi', array(
	'label' => 'evil',
	'href'  => "  \t //evil.example.com",
) );
$T::assert_true(
	'is_safe_href: multi-whitespace protocol-relative rejected',
	is_wp_error( $ws_multi )
);

// Backslash variants. Browsers sometimes treat `\\host` as
// protocol-relative; legacy WebViews and IE/Edge historically did.
// Defense-in-depth reject.
$bs_double = wp_admin_shell_register_menu_item( 'wpas-test-bs-double', array(
	'label' => 'evil',
	'href'  => '\\\\evil.example.com',
) );
$T::assert_true(
	'is_safe_href: double-backslash `\\\\evil.example.com` rejected',
	is_wp_error( $bs_double )
);

$bs_escaped = wp_admin_shell_register_menu_item( 'wpas-test-bs-escaped', array(
	'label' => 'evil',
	'href'  => '\\/\\/evil.example.com',
) );
$T::assert_true(
	'is_safe_href: escaped-slash `\\/\\/evil.example.com` rejected',
	is_wp_error( $bs_escaped )
);

// Whitespace-only href trims to '' and is accepted (no navigation
// target → nothing harmful to register).
$ws_only = wp_admin_shell_register_menu_item( 'wpas-test-ws-only', array(
	'label' => 'ok',
	'href'  => '   ',
) );
$T::assert_true(
	'is_safe_href: whitespace-only href accepted (trims to empty)',
	! is_wp_error( $ws_only )
);

// Normal hrefs with leading whitespace still validate to the trimmed
// inner value — `  /wp-admin/foo.php` → `/wp-admin/foo.php` → accepted.
$ws_safe = wp_admin_shell_register_menu_item( 'wpas-test-ws-safe', array(
	'label' => 'ok',
	'href'  => '  /wp-admin/foo.php',
) );
$T::assert_true(
	'is_safe_href: whitespace-padded safe href still accepted',
	! is_wp_error( $ws_safe )
);

WP_Admin_Shell_Menu_Items::reset();

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
