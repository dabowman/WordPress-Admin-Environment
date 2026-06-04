<?php
/**
 * Alpha file-trigger test runner (W1).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-alpha-trigger-tests.php`
 *
 * Covers the theme.json-style override origin:
 *   - WP_Admin_Workspaces_Origin_File partial-permissive validation (valid
 *     partial loads; malformed / non-object / empty-object / absent all
 *     degrade to null).
 *   - load_origins() file-override branch: the wp-admin-default baseline
 *     fills the `core` slot, the file fills `plugin`.
 *   - end-to-end resolve(): a partial override merges over the baseline
 *     (delta wins, baseline screens survive, engine falls back to the
 *     baseline), and a trusted-origin null tombstone removes a baseline
 *     screen.
 *   - wp_admin_workspaces_is_active() truth table (file / option / none).
 *   - the workspace.json mtime contributes to the resolver cache key.
 *
 * Class-scoped state because `wp eval-file` wraps the file in `eval()`,
 * which breaks `global $foo` lookups across helper functions.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Alpha_Trigger_Runner {
	public static $pass = 0;
	public static $fail = 0;
	public static $fixture_dir;
	/** @var string Path the workspace.json filter returns; '' → a missing path. */
	public static $override_path = '';

	public static function ok( $label, $condition, $detail = '' ) {
		if ( $condition ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label";
			if ( $detail ) {
				echo "\n      $detail";
			}
			echo "\n";
		}
	}

	public static function eq( $label, $actual, $expected ) {
		self::ok(
			$label,
			$actual === $expected,
			'expected: ' . wp_json_encode( $expected ) . "\n      actual:   " . wp_json_encode( $actual )
		);
	}

	/**
	 * Point the override loader at a fixture (or a missing path when '').
	 * An absolute path (leading '/') is used verbatim — lets the bundled-workspace
	 * sweep aim the loader at workspaces/ outside the fixture dir.
	 */
	public static function use_override( $name ) {
		if ( $name && '/' === $name[0] ) {
			self::$override_path = $name;
		} else {
			self::$override_path = $name ? self::$fixture_dir . $name : '';
		}
		WP_Admin_Workspaces_Origin_File::reset_memo();
		WP_Admin_Workspaces_Resolver::reset_request_memo();
		if ( class_exists( 'WP_Admin_Workspaces_Cache' ) ) {
			WP_Admin_Workspaces_Cache::flush();
		}
	}
}

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
if ( ! file_exists( $plugin_dir . 'wp-admin-workspaces.php' ) ) {
	$plugin_dir = WP_PLUGIN_DIR . '/wp-admin-workspaces/';
}
require_once $plugin_dir . 'wp-admin-workspaces.php';

WPAS_Alpha_Trigger_Runner::$fixture_dir = $plugin_dir . 'tests/php/fixtures/alpha/';

$user = get_user_by( 'login', 'admin' ) ?: get_user_by( 'id', 1 );
if ( $user ) {
	wp_set_current_user( $user->ID );
}

// Route the override loader at our fixtures. '' → a path that does not
// exist, exercising the absent-file branch.
add_filter( 'wp_admin_workspaces_workspace_json_path', function () {
	return WPAS_Alpha_Trigger_Runner::$override_path
		? WPAS_Alpha_Trigger_Runner::$override_path
		: WPAS_Alpha_Trigger_Runner::$fixture_dir . '__missing__.json';
} );

$T = 'WPAS_Alpha_Trigger_Runner';

// ── Origin_File partial-permissive validation ───────────────────────

echo "\n— Origin_File validation —\n";

$T::use_override( 'override-styles-only.json' );
$doc = WP_Admin_Workspaces_Origin_File::load();
$T::ok( 'valid partial: load returns assoc array', is_array( $doc ) && isset( $doc['styles'] ) );
$T::ok( 'valid partial: exists_and_valid true', WP_Admin_Workspaces_Origin_File::exists_and_valid() );
$T::ok( 'valid partial: mtime > 0', WP_Admin_Workspaces_Origin_File::mtime() > 0 );

$T::use_override( 'malformed.json' );
$T::ok( 'malformed JSON: load null', WP_Admin_Workspaces_Origin_File::load() === null );

$T::use_override( 'not-an-object.json' );
$T::ok( 'JSON array (not object): load null', WP_Admin_Workspaces_Origin_File::load() === null );

$T::use_override( 'empty-object.json' );
$T::ok( 'empty object treated as no override: load null', WP_Admin_Workspaces_Origin_File::load() === null );

$T::use_override( 'bad-screens-type.json' );
$T::ok( 'structurally bad block (screens: string) → load null', WP_Admin_Workspaces_Origin_File::load() === null );

// A list-shaped object block (`"screens": [ … ]`) is `is_array()`-true but
// would flow into merge_authoritative against the assoc baseline — reject it
// the same as a scalar block. (Empty `[]` is ambiguous with `{}` and allowed.)
$T::use_override( 'list-shaped-screens.json' );
$T::ok( 'list-shaped block (screens: [ … ]) → load null', WP_Admin_Workspaces_Origin_File::load() === null );

// …but `commands` IS a list block (schema types it `array`, merged by id).
// Symmetric counterpart to the screens reject above: a list-shaped commands
// block must NOT trip the object-shape gate. Regression guard for the bug
// where `commands` was grouped with the object-shaped blocks, which silently
// rejected every valid workspace dropped at wp-content/workspace.json.
$T::use_override( 'commands-list-block.json' );
$doc = WP_Admin_Workspaces_Origin_File::load();
$T::ok( 'list block (commands: [ … ]) accepted → load non-null', is_array( $doc ) && isset( $doc['commands'] ) );

// Strongest guard: every bundled workspace must pass the loader as-is. The workspaces
// are exactly what users drop into wp-content/workspace.json, so an over-tightened
// is_valid_partial that rejects any of them strands the user in classic.
foreach ( glob( $plugin_dir . 'workspaces/*.json' ) as $workspace_path ) {
	$T::use_override( $workspace_path );
	$T::ok(
		'bundled workspace ' . basename( $workspace_path ) . ' passes the file loader',
		WP_Admin_Workspaces_Origin_File::exists_and_valid()
	);
}

$T::use_override( '' );
$T::ok( 'absent file: load null', WP_Admin_Workspaces_Origin_File::load() === null );
$T::ok( 'absent file: exists_and_valid false', ! WP_Admin_Workspaces_Origin_File::exists_and_valid() );
$T::eq( 'absent file: mtime 0', WP_Admin_Workspaces_Origin_File::mtime(), 0 );

// ── load_origins file-override branch ───────────────────────────────

echo "\n— load_origins file-override branch —\n";

$T::use_override( 'override-styles-only.json' );
$origins = WP_Admin_Workspaces_Resolver::load_origins();
$T::eq( 'core slot holds the wp-admin-default baseline', $origins['core']['name'] ?? null, 'wp-admin-default' );
$T::ok( 'plugin slot holds the override file', is_array( $origins['plugin'] ) && isset( $origins['plugin']['styles'] ) );
$T::eq( 'baseline engine present in core slot', $origins['core']['engine'] ?? null, 'core:default' );

// ── end-to-end resolve(): partial merges over baseline ──────────────

echo "\n— resolve(): partial override over baseline —\n";

$T::use_override( 'override-rename-screen.json' );
$resolved = WP_Admin_Workspaces_Resolver::resolve();
$T::eq( 'override renames baseline screen', $resolved['screens']['posts']['label'] ?? null, 'Articles' );
$T::ok( 'overridden screen keeps baseline path', ( $resolved['screens']['posts']['path'] ?? '' ) !== '' );
$T::ok( 'baseline screens survive partial override', isset( $resolved['screens']['dashboard-home'] ) );
$T::eq( 'engine falls back to baseline when file omits it', $resolved['engine'] ?? null, 'core:default' );

$T::use_override( 'override-tombstone-screen.json' );
$resolved = WP_Admin_Workspaces_Resolver::resolve();
$T::ok( 'trusted-origin null tombstone removes baseline screen', ! isset( $resolved['screens']['posts'] ) );
$T::ok( 'tombstone leaves sibling screens intact', isset( $resolved['screens']['dashboard-home'] ) );

// ── resolve_with(): isolated deep-merge of a delta ──────────────────

echo "\n— resolve_with(): isolated delta merge —\n";

$baseline = array(
	'version'   => 3,
	'$wpds'     => '6.9',
	'name'      => 'baseline-fixture',
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array(
		'home'  => array( 'label' => 'Home', 'path' => '/', 'app' => 'core:dashboard' ),
		'posts' => array( 'label' => 'Posts', 'path' => '/posts', 'app' => 'core:posts' ),
	),
	'styles'    => array( 'color' => array( 'background' => '#ffffff', 'text' => '#111111' ) ),
);
$delta    = array( 'styles' => array( 'color' => array( 'background' => '#123456' ) ) );
$merged   = WP_Admin_Workspaces_Resolver::resolve_with( array( 'core' => $baseline, 'plugin' => $delta ) );
$T::eq( 'delta styles win', $merged['styles']['color']['background'] ?? null, '#123456' );
$T::eq( 'baseline styles survive deep-merge', $merged['styles']['color']['text'] ?? null, '#111111' );
$T::ok( 'baseline screens untouched by styles-only delta', isset( $merged['screens']['home'], $merged['screens']['posts'] ) );

// ── wp_admin_workspaces_is_active() truth table ───────────────────

echo "\n— wp_admin_workspaces_is_active() —\n";

$saved_shell  = get_option( 'wp_admin_workspaces_active_workspace', null );
$had_shell    = ( false !== get_option( 'wp_admin_workspaces_active_workspace', false ) );
delete_option( 'wp_admin_workspaces_active_workspace' );

$saved_enabled = get_option( 'wp_admin_workspaces_workspace_enabled', null );
$had_enabled   = ( false !== get_option( 'wp_admin_workspaces_workspace_enabled', false ) );
delete_option( 'wp_admin_workspaces_workspace_enabled' );

$T::use_override( 'override-styles-only.json' );
$T::ok( 'file present → workspace active', wp_admin_workspaces_is_active() === true );

$T::use_override( '' );
$T::ok( 'no file + no option → workspace inactive', wp_admin_workspaces_is_active() === false );

update_option( 'wp_admin_workspaces_active_workspace', 'single-pane-demo' );
$T::ok( 'no file + explicit option → workspace active', wp_admin_workspaces_is_active() === true );

// Settings → Workspace toggle vetoes the file/legacy triggers.
$T::use_override( 'override-styles-only.json' );
update_option( 'wp_admin_workspaces_workspace_enabled', false );
$T::ok( 'workspace_enabled=false vetoes a present file', wp_admin_workspaces_is_active() === false );
delete_option( 'wp_admin_workspaces_active_workspace' );
$T::ok( 'workspace_enabled=false still false with file only', wp_admin_workspaces_is_active() === false );
update_option( 'wp_admin_workspaces_workspace_enabled', true );
$T::ok( 'workspace_enabled=true restores the file-trigger path', wp_admin_workspaces_is_active() === true );

// Restore option state.
delete_option( 'wp_admin_workspaces_workspace_enabled' );
if ( $had_enabled ) {
	update_option( 'wp_admin_workspaces_workspace_enabled', $saved_enabled );
}
if ( $had_shell && is_string( $saved_shell ) ) {
	update_option( 'wp_admin_workspaces_active_workspace', $saved_shell );
} else {
	delete_option( 'wp_admin_workspaces_active_workspace' );
}

// ── workspace.json mtime contributes to the cache key ───────────────────

echo "\n— cache key signal —\n";

$T::use_override( '' );
$key_absent = WP_Admin_Workspaces_Cache::key_for( array() );
$T::use_override( 'override-styles-only.json' );
$key_present = WP_Admin_Workspaces_Cache::key_for( array() );
$T::ok( 'workspace.json presence changes the resolver cache key', $key_absent !== $key_present );

$T::use_override( '' );

// ── Summary ─────────────────────────────────────────────────────────

echo "\n────────────────────────────\n";
echo 'PASS: ' . WPAS_Alpha_Trigger_Runner::$pass . '  FAIL: ' . WPAS_Alpha_Trigger_Runner::$fail . "\n";
if ( WPAS_Alpha_Trigger_Runner::$fail > 0 ) {
	echo "RESULT: FAIL\n";
} else {
	echo "RESULT: PASS\n";
}

exit( WPAS_Alpha_Trigger_Runner::$fail > 0 ? 1 : 0 );
