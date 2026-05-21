<?php
/**
 * v3 cap-gating smoke — screen + menu visibility per role.
 *
 * Replaces the v2-shape nav-items capability pruning smoke (Phase 3d.1
 * retired the v2 `shells/wp-admin-default.json`; the v3 equivalent is
 * screen-level + menu-level capability gating).
 *
 * Coverage:
 *   - `WP_Admin_Shell_Permissions::resolve()` produces canonical shape
 *     when given a screen-permissions block.
 *   - `WP_Admin_Shell_Permissions::user_passes()` evaluates OR-semantic
 *     capability lists per role (any one cap passes).
 *   - `WP_Admin_Shell_Permissions::user_passes()` evaluates OR-semantic
 *     role membership lists (any one role passes).
 *   - `WP_Admin_Shell_Permissions::user_passes()` combines caps + roles
 *     (OR between the two fields too).
 *   - App-floor AND-required caps are the absolute backstop (any missing
 *     floor cap denies regardless of OR-set membership).
 *   - Empty permissions block inflates to default admin-only via
 *     `default_permissions()`.
 *   - Unknown capability + role slugs fail closed.
 *   - Magic `"super-admin"` role triggers `is_super_admin()`.
 *   - `enforce_trust_tiers()` enforces restrict-only on role/user origins:
 *     consumer origin can REMOVE from OR-set, attempts to ADD are
 *     rejected + audit-logged.
 *   - End-to-end: walk each role through the bundled `wp-admin-default`
 *     workspace, count visible screens, assert role-level expectations
 *     (no exact-id-list to avoid coupling tests to screen catalog
 *     authoring decisions).
 *   - Menu-tree pruning: items pointing at cap-restricted screens drop
 *     from the rendered tree.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-gating-smoke.php`
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-shell.php';

if ( ! class_exists( 'WP_Admin_Shell_Permissions' ) ) {
	echo "Plugin classes not loaded after require.\n";
	exit( 1 );
}

class WPAS_Cap_Gating_Smoke_Test_Runner {
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

$T = 'WPAS_Cap_Gating_Smoke_Test_Runner';

// Helper — resolve user id for a role, or null when no fixture user exists.
function wpas_cap_smoke_user_for_role( $role ) {
	$user = get_user_by( 'login', $role );
	if ( $user ) {
		return (int) $user->ID;
	}
	// Fallback: find any user holding the role.
	$users = get_users( array( 'role' => $role, 'number' => 1 ) );
	if ( ! empty( $users ) ) {
		return (int) $users[0]->ID;
	}
	return null;
}

// ── 1. resolve() canonical shape ─────────────────────────────────────

$resolved = WP_Admin_Shell_Permissions::resolve(
	array(
		'capabilities' => array( 'edit_posts', 'edit_posts', '', 0 ),
		'roles'        => array( 'editor', 'administrator' ),
	),
	array( 'manage_options' )
);
$T::assert_eq(
	'resolve: capabilities deduped + non-string entries dropped',
	$resolved['capabilities'],
	array( 'edit_posts' )
);
$T::assert_eq(
	'resolve: roles preserved with order',
	$resolved['roles'],
	array( 'editor', 'administrator' )
);
$T::assert_eq(
	'resolve: appFloor surfaces',
	$resolved['appFloor'],
	array( 'manage_options' )
);

// Empty perms block (null) inflates to default admin-only.
$default_perms = WP_Admin_Shell_Permissions::resolve( null );
$T::assert_eq(
	'resolve: null permissions defaults to admin-only roles',
	$default_perms['roles'],
	array( 'administrator', 'super-admin' )
);
$T::assert_eq(
	'resolve: null permissions defaults to empty caps OR-set',
	$default_perms['capabilities'],
	array()
);

// Empty arrays inflate to admin-only too (fail-closed convention).
$empty_perms = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array() )
);
$T::assert_eq(
	'resolve: explicit empty arrays inflate to admin-only (fail-closed)',
	$empty_perms['roles'],
	array( 'administrator', 'super-admin' )
);

// ── 2. user_passes() — OR-set capability semantics ───────────────────

$admin_id        = wpas_cap_smoke_user_for_role( 'administrator' );
$editor_id       = wpas_cap_smoke_user_for_role( 'editor' );
$author_id       = wpas_cap_smoke_user_for_role( 'author' );
$contributor_id  = wpas_cap_smoke_user_for_role( 'contributor' );
$subscriber_id   = wpas_cap_smoke_user_for_role( 'subscriber' );

// Lower the bar — at least administrator must exist for the smoke to mean anything.
if ( $admin_id === null ) {
	echo "SKIP no administrator user found — cannot run smoke.\n";
	echo "TOTAL: 0 passed, 0 failed (skipped)\n";
	exit( 0 );
}

$caps_only_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array( 'edit_posts' ), 'roles' => array() )
);

$T::assert_true(
	'user_passes: admin holds edit_posts → passes caps-only OR-set',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $caps_only_resolve )
);

if ( $subscriber_id !== null ) {
	$T::assert_false(
		'user_passes: subscriber lacks edit_posts → denied on caps-only OR-set',
		WP_Admin_Shell_Permissions::user_passes( $subscriber_id, $caps_only_resolve )
	);
}

// Multi-cap OR-set — any one cap suffices.
$multi_cap_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array( 'manage_options', 'edit_posts' ), 'roles' => array() )
);
if ( $contributor_id !== null ) {
	$T::assert_true(
		'user_passes: contributor passes via OR (holds edit_posts even without manage_options)',
		WP_Admin_Shell_Permissions::user_passes( $contributor_id, $multi_cap_resolve )
	);
}

// ── 3. user_passes() — OR-set role semantics ─────────────────────────

$roles_only_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array( 'editor' ) )
);
if ( $editor_id !== null ) {
	$T::assert_true(
		'user_passes: editor passes role membership OR-set',
		WP_Admin_Shell_Permissions::user_passes( $editor_id, $roles_only_resolve )
	);
}
if ( $author_id !== null ) {
	$T::assert_false(
		'user_passes: author denied when role list is editor-only',
		WP_Admin_Shell_Permissions::user_passes( $author_id, $roles_only_resolve )
	);
}

// Multi-role OR-set.
$multi_role_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array( 'editor', 'author' ) )
);
if ( $author_id !== null ) {
	$T::assert_true(
		'user_passes: author passes when role list includes author',
		WP_Admin_Shell_Permissions::user_passes( $author_id, $multi_role_resolve )
	);
}

// ── 4. user_passes() — cap + role hybrid OR ───────────────────────────

// User holds neither cap nor matching role → denied.
$hybrid_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array( 'manage_options' ), 'roles' => array( 'editor' ) )
);
if ( $author_id !== null ) {
	$T::assert_false(
		'user_passes: author (no manage_options, not editor) denied by hybrid OR',
		WP_Admin_Shell_Permissions::user_passes( $author_id, $hybrid_resolve )
	);
}
if ( $editor_id !== null ) {
	$T::assert_true(
		'user_passes: editor passes hybrid via role match',
		WP_Admin_Shell_Permissions::user_passes( $editor_id, $hybrid_resolve )
	);
}
$T::assert_true(
	'user_passes: admin passes hybrid via cap match',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $hybrid_resolve )
);

// ── 5. app-floor AND-required backstop ────────────────────────────────

// OR-set permits via role, but app-floor demands a cap the role lacks.
$floor_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array( 'editor' ) ),
	array( 'manage_options' )
);
if ( $editor_id !== null ) {
	$T::assert_false(
		'app-floor: editor OR-set passes but manage_options floor denies',
		WP_Admin_Shell_Permissions::user_passes( $editor_id, $floor_resolve )
	);
}
// Admin matches floor (manage_options) but fails the editor-only OR-set
// (admin is in role 'administrator', not 'editor'). app-floor is a
// backstop, not a bypass.
$T::assert_false(
	'app-floor: admin matches floor but fails OR-set when admin role excluded',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $floor_resolve )
);

// Admin passes when admin role IS in the OR-set + floor matches.
$floor_with_admin = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array( 'administrator', 'editor' ) ),
	array( 'manage_options' )
);
$T::assert_true(
	'app-floor: admin passes when OR-set includes admin role + floor matches',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $floor_with_admin )
);

// ── 6. unknown slugs fail closed ──────────────────────────────────────

$unknown_cap = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array( 'this_cap_does_not_exist_xyz' ), 'roles' => array() )
);
$T::assert_false(
	'unknown cap: no user can satisfy (fail-closed)',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $unknown_cap )
);

$unknown_role = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array( 'this_role_does_not_exist_xyz' ) )
);
$T::assert_false(
	'unknown role: no user can satisfy (fail-closed)',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $unknown_role )
);

// ── 7. super-admin magic ──────────────────────────────────────────────

$super_admin_resolve = WP_Admin_Shell_Permissions::resolve(
	array( 'capabilities' => array(), 'roles' => array( 'super-admin' ) )
);
// On single-site, is_super_admin is a synonym for "user can manage_options".
// On multisite, it requires explicit grant. Assert behavior matches WP's
// is_super_admin() — admins pass on single-site even without explicit grant.
$expected_super_admin_admin = is_super_admin( $admin_id );
$T::assert_eq(
	'super-admin magic: admin user passes iff is_super_admin($admin_id)',
	WP_Admin_Shell_Permissions::user_passes( $admin_id, $super_admin_resolve ),
	$expected_super_admin_admin
);

if ( $subscriber_id !== null ) {
	$T::assert_false(
		'super-admin magic: subscriber never passes is_super_admin',
		WP_Admin_Shell_Permissions::user_passes( $subscriber_id, $super_admin_resolve )
	);
}

// ── 8. enforce_trust_tiers — restrict-only consumer origins ───────────

WP_Admin_Shell_Permissions::reset_audit();

$trust_per_origin = array(
	'core'   => array( 'capabilities' => array( 'edit_posts' ), 'roles' => array( 'editor', 'author' ) ),
	'plugin' => array( 'capabilities' => array( 'manage_options' ) ),
	'role'   => array( 'capabilities' => array( 'edit_posts' ), 'roles' => array( 'editor' ) ),
);

$merged = WP_Admin_Shell_Permissions::enforce_trust_tiers( $trust_per_origin, 'screen.test' );

$T::assert_eq(
	'trust-tier: role origin shrinks caps to intersection (drops manage_options)',
	$merged['capabilities'],
	array( 'edit_posts' )
);
$T::assert_eq(
	'trust-tier: role origin shrinks roles to intersection (drops author)',
	$merged['roles'],
	array( 'editor' )
);
$T::assert_eq(
	'trust-tier: zero audit entries when consumer only removes',
	count( WP_Admin_Shell_Permissions::get_audit() ),
	0
);

// Consumer origin attempts to GROW the OR-set → rejection + audit.
WP_Admin_Shell_Permissions::reset_audit();

$trust_grow = array(
	'core' => array( 'capabilities' => array( 'edit_posts' ), 'roles' => array( 'administrator' ) ),
	'user' => array( 'capabilities' => array( 'edit_posts', 'manage_options' ), 'roles' => array( 'administrator', 'editor' ) ),
);

$merged_grow = WP_Admin_Shell_Permissions::enforce_trust_tiers( $trust_grow, 'screen.tested' );

$T::assert_eq(
	'trust-tier: user origin grow attempt rejected — caps stay at trusted baseline',
	$merged_grow['capabilities'],
	array( 'edit_posts' )
);
$T::assert_eq(
	'trust-tier: user origin grow attempt rejected — roles stay at trusted baseline',
	$merged_grow['roles'],
	array( 'administrator' )
);

$audit = WP_Admin_Shell_Permissions::get_audit();
$T::assert_eq(
	'trust-tier: 2 audit entries (one for the cap, one for the role)',
	count( $audit ),
	2
);
$has_cap_audit  = false;
$has_role_audit = false;
foreach ( $audit as $entry ) {
	if ( $entry['origin'] === 'user' && $entry['kind'] === 'capability' && $entry['attempted'] === 'add' ) {
		$has_cap_audit = true;
	}
	if ( $entry['origin'] === 'user' && $entry['kind'] === 'role' && $entry['attempted'] === 'add' ) {
		$has_role_audit = true;
	}
}
$T::assert_true( 'trust-tier: audit entry recorded for cap grow attempt', $has_cap_audit );
$T::assert_true( 'trust-tier: audit entry recorded for role grow attempt', $has_role_audit );

// ── 9. End-to-end — bundled wp-admin-default screen visibility ────────

// Walk each role through the resolver. Counts visible screens; we assert
// monotonic visibility increases (admin >= editor >= author >= contributor
// >= subscriber) rather than exact ids — the screen catalog is authoring
// content, not test fixture.

update_option( 'wp_admin_shell_active_shell', 'wp-admin-default' );
if ( class_exists( 'WP_Admin_Shell_Cache' ) ) {
	WP_Admin_Shell_Cache::flush();
}
WP_Admin_Shell_Resolver::reset_request_memo();

$role_visible_counts = array();
$roles_to_walk       = array( 'subscriber', 'contributor', 'author', 'editor', 'administrator' );

foreach ( $roles_to_walk as $role ) {
	$user_id = wpas_cap_smoke_user_for_role( $role );
	if ( $user_id === null ) {
		continue;
	}
	wp_set_current_user( $user_id );
	if ( class_exists( 'WP_Admin_Shell_Cache' ) ) {
		WP_Admin_Shell_Cache::flush();
	}
	WP_Admin_Shell_Resolver::reset_request_memo();

	$resolved_doc = WP_Admin_Shell_Resolver::resolve( array( 'shell' => 'wp-admin-default' ) );
	$screens      = isset( $resolved_doc['screens'] ) && is_array( $resolved_doc['screens'] )
		? $resolved_doc['screens']
		: array();

	$visible = 0;
	foreach ( $screens as $screen_id => $screen ) {
		if ( ! is_array( $screen ) ) {
			continue;
		}
		$perms     = $screen['permissions'] ?? null;
		$app_floor = WP_Admin_Shell_Permissions::app_floor_for( $screen );
		$rp        = WP_Admin_Shell_Permissions::resolve( $perms, $app_floor );
		if ( WP_Admin_Shell_Permissions::user_passes( $user_id, $rp ) ) {
			$visible++;
		}
	}
	$role_visible_counts[ $role ] = $visible;
}

// Reset to admin so the rest of the harness sees an admin context.
wp_set_current_user( $admin_id );

// Sanity checks on the counts.
if ( isset( $role_visible_counts['administrator'] ) ) {
	$T::assert_true(
		'e2e: administrator sees ≥10 screens in wp-admin-default',
		$role_visible_counts['administrator'] >= 10
	);
}
if ( isset( $role_visible_counts['subscriber'] ) ) {
	$T::assert_true(
		'e2e: subscriber sees ≥1 screen (at minimum the dashboard / profile)',
		$role_visible_counts['subscriber'] >= 1
	);
	$T::assert_true(
		'e2e: subscriber < administrator (fewer privileged screens)',
		$role_visible_counts['subscriber'] < ( $role_visible_counts['administrator'] ?? PHP_INT_MAX )
	);
}
// Monotonic — each role at least as broad as the role below.
$ordered_seen = array_intersect_key(
	$role_visible_counts,
	array_flip( $roles_to_walk )
);
$prev_count = -1;
$monotonic  = true;
$prev_role  = '';
foreach ( $roles_to_walk as $role ) {
	if ( ! isset( $ordered_seen[ $role ] ) ) {
		continue;
	}
	if ( $ordered_seen[ $role ] < $prev_count ) {
		$monotonic = false;
		echo "      role $prev_role had $prev_count visible, $role has " . $ordered_seen[ $role ] . " — non-monotonic\n";
	}
	$prev_count = $ordered_seen[ $role ];
	$prev_role  = $role;
}
$T::assert_true(
	'e2e: visible-screen counts monotonically non-decreasing subscriber → admin',
	$monotonic
);

// ── 10. Menu-tree pruning sanity ──────────────────────────────────────
// Items in the menu tree that bind to a cap-restricted screen the user
// can't see must drop. The bridge between menu and screens is by item-id
// → screen-id match. This walk approximates the runtime's pruneMenu()
// behavior (resolveMenu in JS) without depending on it directly.

function wpas_cap_smoke_count_menu_items( $menu, $screens, $user_id ) {
	$count = 0;
	if ( ! is_array( $menu ) ) {
		return $count;
	}
	foreach ( $menu as $item_id => $item ) {
		if ( ! is_array( $item ) ) {
			continue;
		}
		// Separators always render.
		if ( ! empty( $item['separator'] ) ) {
			$count++;
			continue;
		}
		// External + free-floating items (no screen binding) render
		// unconditionally for the smoke (no cap to check at item level).
		$bound_screen = isset( $screens[ $item_id ] ) && is_array( $screens[ $item_id ] )
			? $screens[ $item_id ]
			: null;
		if ( $bound_screen !== null ) {
			$perms     = $bound_screen['permissions'] ?? null;
			$app_floor = WP_Admin_Shell_Permissions::app_floor_for( $bound_screen );
			$rp        = WP_Admin_Shell_Permissions::resolve( $perms, $app_floor );
			if ( ! WP_Admin_Shell_Permissions::user_passes( $user_id, $rp ) ) {
				continue;
			}
		}
		$count++;
		if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
			$count += wpas_cap_smoke_count_menu_items( $item['items'], $screens, $user_id );
		}
	}
	return $count;
}

// Re-resolve as admin to get the canonical menu shape.
wp_set_current_user( $admin_id );
WP_Admin_Shell_Resolver::reset_request_memo();
$admin_resolved = WP_Admin_Shell_Resolver::resolve( array( 'shell' => 'wp-admin-default' ) );
$menu           = isset( $admin_resolved['menu'] ) && is_array( $admin_resolved['menu'] )
	? $admin_resolved['menu']
	: array();
$screens        = isset( $admin_resolved['screens'] ) && is_array( $admin_resolved['screens'] )
	? $admin_resolved['screens']
	: array();

$admin_menu_count = wpas_cap_smoke_count_menu_items( $menu, $screens, $admin_id );
$T::assert_true(
	'e2e menu: admin sees ≥10 menu items in wp-admin-default',
	$admin_menu_count >= 10
);

if ( $subscriber_id !== null ) {
	$subscriber_menu_count = wpas_cap_smoke_count_menu_items( $menu, $screens, $subscriber_id );
	$T::assert_true(
		'e2e menu: subscriber sees ≥1 menu items',
		$subscriber_menu_count >= 1
	);
	$T::assert_true(
		'e2e menu: subscriber < admin (cap-restricted items pruned)',
		$subscriber_menu_count < $admin_menu_count
	);
}

if ( $editor_id !== null ) {
	$editor_menu_count = wpas_cap_smoke_count_menu_items( $menu, $screens, $editor_id );
	$T::assert_true(
		'e2e menu: editor sees > author when both exist',
		$editor_menu_count > ( $author_id !== null
			? wpas_cap_smoke_count_menu_items( $menu, $screens, $author_id )
			: 0 )
	);
}

// ── Final report ──────────────────────────────────────────────────────

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
