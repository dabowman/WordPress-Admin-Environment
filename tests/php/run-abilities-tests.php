<?php
/**
 * Customization abilities (Abilities API) tests.
 *
 * Covers the `wp-admin-workspaces/*` ability surface registered by
 * `WP_Admin_Workspaces_Abilities`:
 *   - Registration: every catalog id resolves via `wp_get_ability()`
 *     (skipped wholesale when the Abilities API is absent — WP < 6.9).
 *   - Permission floors: logged-out denied everywhere; subscriber denied on
 *     site-tier abilities; admin allowed.
 *   - get-workspace-config: per-user prune (subscriber loses the plugins
 *     screen) + the `blocks` subset filter.
 *   - describe-customization-surface: stock baseline reports an EMPTY
 *     user-tier allowlist (default-locked posture) + the deny patterns;
 *     a fixture workspace declaring `customizable` reports its paths.
 *   - update-user-prefs: stored verbatim, pre-flight report splits
 *     applied / rejected / outOfBand correctly against both the locked
 *     baseline and the fixture allowlist.
 *   - update-site-config / set-default-screen / hide+show-menu-item:
 *     end-to-end through the cascade — the RESOLVED doc reflects the writes
 *     (this also pins `default-screen` riding `V3_TOP_LEVEL_BLOCKS` so the
 *     site origin can set it).
 *   - switch-workspace: unknown slug 404, valid switch, 409 while a
 *     workspace.json override file is in force (via the path filter).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-abilities-tests.php`
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

if ( ! function_exists( 'wp_register_ability' ) ) {
	echo "SKIP — Abilities API not available (WP < 6.9 and no Abilities API plugin); the abilities surface no-ops by design.\n";
	echo "TOTAL: 0 passed, 0 failed (skipped)\n";
	exit( 0 );
}

class WPAS_Abilities_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;
	public static $created_user_ids = array();
	public static $fixture_file = '';

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

	public static function assert_error_status( $label, $result, $status ) {
		self::assert_eq(
			$label,
			is_wp_error( $result ) ? (int) ( $result->get_error_data()['status'] ?? 0 ) : null,
			$status
		);
	}

	public static function ensure_user( $login, $role ) {
		$user = get_user_by( 'login', $login );
		if ( $user ) {
			$user->set_role( $role );
			return (int) $user->ID;
		}
		$id = wp_create_user( $login, wp_generate_password( 16 ), $login . '@example.test' );
		if ( is_wp_error( $id ) ) {
			return null;
		}
		$u = get_user_by( 'id', $id );
		$u->set_role( $role );
		self::$created_user_ids[] = (int) $id;
		return (int) $id;
	}

	public static function flush() {
		WP_Admin_Workspaces_Cache::flush();
		WP_Admin_Workspaces_Resolver::reset_request_memo();
	}

	public static function cleanup() {
		foreach ( self::$created_user_ids as $id ) {
			wp_delete_user( $id, 1 );
		}
		self::$created_user_ids = array();
		if ( self::$fixture_file && file_exists( self::$fixture_file ) ) {
			unlink( self::$fixture_file );
		}
		delete_option( 'wp_admin_workspaces_site_config' );
		update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );
		if ( class_exists( 'WP_Admin_Workspaces_Registry' ) ) {
			WP_Admin_Workspaces_Registry::reset();
		}
		WP_Admin_Workspaces_Origin_File::reset_memo();
		self::flush();
	}
}

$T = 'WPAS_Abilities_Test_Runner';
register_shutdown_function( array( $T, 'cleanup' ) );
$A = 'WP_Admin_Workspaces_Abilities';

// Pin workspace + clean slate so the resolver sees the stock baseline.
update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );
delete_option( 'wp_admin_workspaces_site_config' );
$T::flush();

$admin_id      = $T::ensure_user( 'wpas_abilities_admin', 'administrator' );
$subscriber_id = $T::ensure_user( 'wpas_abilities_subscriber', 'subscriber' );

if ( $admin_id === null || $subscriber_id === null ) {
	echo "SKIP — could not provision admin + subscriber test users.\n";
	echo "TOTAL: 0 passed, 0 failed (skipped)\n";
	exit( 0 );
}

delete_user_meta( $admin_id, 'wp_admin_workspaces_user_prefs' );
delete_user_meta( $subscriber_id, 'wp_admin_workspaces_user_prefs' );

// ── 1. Registration — every catalog id resolves ───────────────────────

$ability_ids = array(
	'wp-admin-workspaces/get-workspace-config',
	'wp-admin-workspaces/describe-customization-surface',
	'wp-admin-workspaces/get-user-prefs',
	'wp-admin-workspaces/get-site-config',
	'wp-admin-workspaces/list-workspaces',
	'wp-admin-workspaces/update-user-prefs',
	'wp-admin-workspaces/reset-user-prefs',
	'wp-admin-workspaces/update-site-config',
	'wp-admin-workspaces/switch-workspace',
	'wp-admin-workspaces/set-default-screen',
	'wp-admin-workspaces/hide-menu-item',
	'wp-admin-workspaces/show-menu-item',
);

if ( function_exists( 'wp_get_ability' ) ) {
	foreach ( $ability_ids as $id ) {
		$T::assert_true( "registered: $id", null !== wp_get_ability( $id ) );
	}
} else {
	echo "NOTE  wp_get_ability() unavailable — skipping registry introspection, exercising callbacks directly.\n";
}

// ── 2. Permission floors ───────────────────────────────────────────────

wp_set_current_user( 0 );
$T::assert_eq( 'logged-out → logged-in floor false', $A::permission_logged_in(), false );
$T::assert_eq( 'logged-out → manage_options floor false', $A::permission_manage_options(), false );

wp_set_current_user( $subscriber_id );
$T::assert_eq( 'subscriber → logged-in floor true', $A::permission_logged_in(), true );
$T::assert_eq( 'subscriber → manage_options floor false', $A::permission_manage_options(), false );

wp_set_current_user( $admin_id );
$T::assert_eq( 'admin → manage_options floor true', $A::permission_manage_options(), true );

// ── 3. get-workspace-config: prune + blocks filter ─────────────────────

wp_set_current_user( $admin_id );
$T::flush();
$config = $A::get_workspace_config();
$T::assert_true( 'admin config has screens + menu', is_array( $config ) && isset( $config['screens'] ) && isset( $config['menu'] ) );
$T::assert_true( 'admin sees plugins screen', isset( $config['screens']['plugins'] ) );

$subset = $A::get_workspace_config( array( 'blocks' => array( 'menu' ) ) );
$T::assert_eq( 'blocks filter returns only menu', is_array( $subset ) ? array_keys( $subset ) : null, array( 'menu' ) );

wp_set_current_user( $subscriber_id );
$T::flush();
$config = $A::get_workspace_config();
$T::assert_true( 'subscriber config pruned: no plugins screen', is_array( $config ) && ! isset( $config['screens']['plugins'] ) );

// ── 4. describe-customization-surface on the stock baseline ───────────

wp_set_current_user( $subscriber_id );
$surface = $A::describe_customization_surface();
$T::assert_eq( 'stock baseline → empty user allowlist (default-locked)', $surface['tiers']['user']['allowedPaths'], array() );
$T::assert_true( 'deny patterns include engine', in_array( 'engine', $surface['tiers']['user']['deniedPatterns'], true ) );
$T::assert_eq( 'subscriber → site tier not writable', $surface['tiers']['site']['writable'], false );
$T::assert_eq( 'no override file → switchable', $surface['workspaceSwitchable'], true );

wp_set_current_user( $admin_id );
$surface = $A::describe_customization_surface();
$T::assert_eq( 'admin → site tier writable', $surface['tiers']['site']['writable'], true );

// ── 5. update-user-prefs against the locked baseline ──────────────────

wp_set_current_user( $subscriber_id );
$T::flush();
$result = $A::update_user_prefs( array(
	'prefs' => array(
		'styles'    => array( 'theme' => array( 'accent' => '#123456' ) ),
		'workspace' => 'single-pane-demo',
	),
) );
$T::assert_true( 'locked baseline → styles write rejected', in_array( 'styles.theme.accent', $result['rejected'], true ) );
$T::assert_eq( 'workspace key reported out-of-band', $result['outOfBand'], array( 'workspace' ) );
$stored = get_user_meta( $subscriber_id, 'wp_admin_workspaces_user_prefs', true );
$T::assert_eq( 'rejected write still stored verbatim (REST parity)', $stored['styles']['theme']['accent'] ?? null, '#123456' );

$result = $A::update_user_prefs( array( 'prefs' => 'not-an-object' ) );
$T::assert_error_status( 'non-object prefs → 400', $result, 400 );

$result = $A::reset_user_prefs();
$stored = get_user_meta( $subscriber_id, 'wp_admin_workspaces_user_prefs', true );
$T::assert_eq( 'reset deletes the slice', $stored, '' );

// ── 6. Site-tier writes flow through the cascade ───────────────────────

wp_set_current_user( $admin_id );
$T::flush();

// Tombstone hides a menu item in the RESOLVED doc.
$result = $A::hide_menu_item( array( 'id' => 'comments' ) );
$T::assert_eq( 'hide-menu-item path', is_wp_error( $result ) ? $result->get_error_code() : $result['path'], 'menu.comments' );
$T::flush();
$resolved = wp_admin_workspaces_get_active_config();
$T::assert_true( 'resolved menu drops comments', is_array( $resolved['menu'] ?? null ) && ! isset( $resolved['menu']['comments'] ) );

// show-menu-item restores it.
$result = $A::show_menu_item( array( 'id' => 'comments' ) );
$T::assert_eq( 'show-menu-item ok', is_wp_error( $result ) ? $result->get_error_code() : $result['hidden'], false );
$T::flush();
$resolved = wp_admin_workspaces_get_active_config();
$T::assert_true( 'resolved menu has comments again', isset( $resolved['menu']['comments'] ) );

$result = $A::show_menu_item( array( 'id' => 'comments' ) );
$T::assert_eq( 'show on a non-hidden item → error', is_wp_error( $result ) ? $result->get_error_code() : null, 'wp_admin_workspaces_menu_item_not_hidden' );
$result = $A::hide_menu_item( array( 'id' => 'no-such-item-xyz' ) );
$T::assert_eq( 'hide unknown id → error', is_wp_error( $result ) ? $result->get_error_code() : null, 'wp_admin_workspaces_unknown_menu_item' );

// set-default-screen lands in the resolved doc (pins the
// V3_TOP_LEVEL_BLOCKS `default-screen` fix — before it, the site origin's
// default-screen was silently dropped by filter_doc).
$result = $A::set_default_screen( array( 'screen' => 'posts' ) );
$T::assert_eq( 'set-default-screen ok', is_wp_error( $result ) ? $result->get_error_code() : $result['default-screen'], 'posts' );
$T::flush();
$resolved = wp_admin_workspaces_get_active_config();
$T::assert_eq( 'resolved default-screen is posts', $resolved['default-screen'] ?? null, 'posts' );

$result = $A::set_default_screen( array( 'screen' => 'no-such-screen-xyz' ) );
$T::assert_error_status( 'unknown screen → 404', $result, 404 );
$T::assert_true( 'unknown-screen error data lists valid ids', is_wp_error( $result ) && in_array( 'posts', $result->get_error_data()['screens'], true ) );

// update-site-config remove undoes the default-screen write.
$result = $A::update_site_config( array( 'remove' => array( 'default-screen' ) ) );
$T::assert_true( 'remove path ok', ! is_wp_error( $result ) );
$T::flush();
$resolved = wp_admin_workspaces_get_active_config();
$T::assert_eq( 'resolved default-screen back to baseline', $resolved['default-screen'] ?? null, 'dashboard-home' );

$result = $A::update_site_config( array() );
$T::assert_error_status( 'empty site-config input → 400', $result, 400 );

// ── 7. switch-workspace ────────────────────────────────────────────────

$result = $A::switch_workspace( array( 'workspace' => 'no-such-workspace-xyz' ) );
$T::assert_error_status( 'switch unknown slug → 404', $result, 404 );

$result = $A::switch_workspace( array( 'workspace' => 'single-pane-demo' ) );
$T::assert_eq( 'switch ok', is_wp_error( $result ) ? $result->get_error_code() : $result['active'], 'single-pane-demo' );
$T::assert_eq( 'active-workspace option written', get_option( 'wp_admin_workspaces_active_workspace' ), 'single-pane-demo' );

// Back to the baseline for the remaining cases.
$A::switch_workspace( array( 'workspace' => 'wp-admin-default' ) );
$T::flush();

// File override in force → 409. Point the loader at a temp fixture via the
// path filter instead of touching the live wp-content/workspace.json.
$T::$fixture_file = get_temp_dir() . 'wpas-abilities-fixture-workspace.json';
file_put_contents( $T::$fixture_file, wp_json_encode( array( 'styles' => array() ) ) );
$path_filter = function () use ( $T ) {
	return $T::$fixture_file;
};
add_filter( 'wp_admin_workspaces_workspace_json_path', $path_filter );
WP_Admin_Workspaces_Origin_File::reset_memo();

$result = $A::switch_workspace( array( 'workspace' => 'single-pane-demo' ) );
$T::assert_error_status( 'override file in force → 409', $result, 409 );

$surface = $A::describe_customization_surface();
$T::assert_eq( 'override file → workspaceFileActive true', $surface['workspaceFileActive'], true );
$T::assert_eq( 'override file → not switchable', $surface['workspaceSwitchable'], false );

remove_filter( 'wp_admin_workspaces_workspace_json_path', $path_filter );
unlink( $T::$fixture_file );
$T::$fixture_file = '';
WP_Admin_Workspaces_Origin_File::reset_memo();
$T::flush();

// ── 8. Fixture workspace with customizable declarations ───────────────

WP_Admin_Workspaces_Registry::register(
	'abilities-fixture',
	array(
		'version'        => 3,
		'$wpds'          => true,
		'name'           => 'abilities-fixture',
		'engine'         => 'core:default',
		'default-screen' => 'home',
		'screens'        => array(
			'home' => array(
				'path' => '/',
				'app'  => 'core:posts',
			),
		),
		'menu'           => array(
			'home' => array(
				'label'        => 'Home',
				'customizable' => array( 'label' ),
			),
		),
		'styles'         => array(
			'customizable' => array( 'theme.accent' ),
			'theme'        => array( 'accent' => '#ffffff' ),
		),
	)
);
update_option( 'wp_admin_workspaces_active_workspace', 'abilities-fixture' );
$T::flush();

wp_set_current_user( $subscriber_id );
$surface = $A::describe_customization_surface();
$declared = wp_list_pluck( $surface['tiers']['user']['allowedPaths'], 'path' );
$T::assert_true( 'fixture surface reports styles.theme.accent', in_array( 'styles.theme.accent', $declared, true ) );
$T::assert_true( 'fixture surface reports menu.home.label', in_array( 'menu.home.label', $declared, true ) );

$result = $A::update_user_prefs( array(
	'prefs' => array(
		'styles' => array( 'theme' => array( 'accent' => '#0073aa', 'radius' => '4px' ) ),
		'menu'   => array( 'home' => array( 'label' => 'Start' ) ),
	),
) );
$T::assert_true( 'fixture: allowed style path applied', in_array( 'styles.theme.accent', $result['applied'], true ) );
$T::assert_true( 'fixture: undeclared style path rejected', in_array( 'styles.theme.radius', $result['rejected'], true ) );
$T::assert_true( 'fixture: allowed menu label applied', in_array( 'menu.home.label', $result['applied'], true ) );

// The applied write actually lands in the resolved doc.
$T::flush();
$resolved = wp_admin_workspaces_get_active_config();
$T::assert_eq( 'resolved styles carry the user accent', $resolved['styles']['theme']['accent'] ?? null, '#0073aa' );
$T::assert_eq( 'resolved styles drop the rejected radius', $resolved['styles']['theme']['radius'] ?? null, null );

$A::reset_user_prefs();

// Restore + final cleanup happens in the shutdown handler.
wp_set_current_user( $admin_id );

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
