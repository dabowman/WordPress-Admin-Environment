<?php
/**
 * V3 compiler tests.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-v3-compiler-tests.php`
 *
 * Coverage:
 *   - v3 shape detection (version: 3, screens, workspace).
 *   - v2 shell passthrough (compiler is a no-op).
 *   - v2 legacy bindings → commands forwarding.
 *   - routes synthesis from single-app screens.
 *   - routes synthesis from apps[] long-form screens (first entry = primary).
 *   - screenId injection into routes config.
 *   - regions synthesis from engine defaultRegions (registry-aware).
 *   - regions merge when workspace declares regions explicitly.
 *   - default-route synthesis from workspace.default-screen.
 *   - default-route fallback when default-screen has no path.
 *   - commands compilation preserves v3 entries with id.
 *   - commands compilation dedupes by id.
 *   - End-to-end resolve against the bundled v3 default shell.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_V3_Compiler_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function ok( $label, $cond, $detail = '' ) {
		if ( $cond ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			if ( $detail ) {
				echo "      $detail\n";
			}
		}
	}

	public static function eq( $label, $actual, $expected ) {
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
}

$T          = 'WPAS_V3_Compiler_Test_Runner';
$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
require_once $plugin_dir . 'wp-admin-shell.php';

// ── 1. Shape detection ──────────────────────────────────────────────

$T::ok(
	'is_v3 detects version:3',
	WP_Admin_Shell_V3_Compiler::is_v3( array( 'version' => 3 ) )
);
$T::ok(
	'is_v3 detects screens block',
	WP_Admin_Shell_V3_Compiler::is_v3( array( 'screens' => array( 'home' => array() ) ) )
);
$T::ok(
	'is_v3 detects workspace block',
	WP_Admin_Shell_V3_Compiler::is_v3( array( 'workspace' => array( 'engine' => 'core:default' ) ) )
);
$T::ok(
	'is_v3 rejects v2-shaped doc',
	! WP_Admin_Shell_V3_Compiler::is_v3( array( 'version' => 1, 'engine' => 'core:default', 'regions' => array() ) )
);
$T::ok(
	'is_v3 rejects non-array',
	! WP_Admin_Shell_V3_Compiler::is_v3( 'not-an-array' )
);

// ── 2. v2 passthrough ───────────────────────────────────────────────

$v2_doc = array(
	'version' => 1,
	'engine'  => 'core:default',
	'regions' => array( 'content' => array( 'template' => 'core:main' ) ),
	'routes'  => array( '/posts' => array( 'app' => 'core:posts' ) ),
);
$compiled_v2 = WP_Admin_Shell_V3_Compiler::compile( $v2_doc );
$T::eq(
	'v2 doc passthrough preserves route app',
	$compiled_v2['routes']['/posts']['app'],
	'core:posts'
);
$T::eq(
	'v2 doc passthrough preserves engine',
	$compiled_v2['engine'],
	'core:default'
);
$T::eq(
	'v2 doc passthrough preserves regions',
	$compiled_v2['regions'],
	array( 'content' => array( 'template' => 'core:main' ) )
);

// v2 back-compat — v3 compiler synthesizes screens from v2 routes
// so v3-built apps reading `screenId` / `useDataView(screenId)` still
// work when activated against a v2 shell. The synthesis injects
// `screenId` into the route's config so apps reading
// `props.config.screenId` find the synth'd identity.
$T::ok(
	'v2 synthesis: screenId injected into route config',
	isset( $compiled_v2['routes']['/posts']['config']['screenId'] )
);
$T::ok(
	'v2 synthesis: screens block created',
	isset( $compiled_v2['screens'] ) && is_array( $compiled_v2['screens'] )
);
$synthesized_screen_id = $compiled_v2['routes']['/posts']['config']['screenId'];
$T::ok(
	'v2 synthesis: synthesized screen entry exists',
	isset( $compiled_v2['screens'][ $synthesized_screen_id ] )
);
$T::eq(
	'v2 synthesis: synthesized screen carries route app',
	$compiled_v2['screens'][ $synthesized_screen_id ]['app'],
	'core:posts'
);

// v2 back-compat — route with config.variant flows into the
// synthesized screen as `dataViewVariant`.
$v2_variant_doc = array(
	'version' => 1,
	'engine'  => 'core:default',
	'regions' => array(),
	'routes'  => array(
		'/posts/drafts' => array(
			'app'    => 'core:posts',
			'config' => array( 'postType' => 'post', 'variant' => 'drafts' ),
		),
	),
);
$compiled_v2_variant     = WP_Admin_Shell_V3_Compiler::compile( $v2_variant_doc );
$variant_synth_screen_id = $compiled_v2_variant['routes']['/posts/drafts']['config']['screenId'];
$T::eq(
	'v2 variant synthesis: dataViewVariant stamped from config.variant',
	$compiled_v2_variant['screens'][ $variant_synth_screen_id ]['dataViewVariant'],
	'drafts'
);

// ── 3. v2 bindings → commands forwarding ────────────────────────────

$v2_with_bindings = array(
	'version'  => 1,
	'engine'   => 'core:default',
	'regions'  => array(),
	'bindings' => array(
		array( 'shortcut' => 'Mod+K', 'invoke' => 'core:command-palette' ),
	),
);
$compiled_v2b = WP_Admin_Shell_V3_Compiler::compile( $v2_with_bindings );
$T::ok(
	'v2 bindings forwarded into commands[]',
	is_array( $compiled_v2b['commands'] ) && count( $compiled_v2b['commands'] ) === 1
);
$T::eq(
	'v2 forwarded command has shortcut',
	$compiled_v2b['commands'][0]['shortcut'],
	'Mod+K'
);
$T::eq(
	'v2 forwarded command has invoke',
	$compiled_v2b['commands'][0]['invoke'],
	'core:command-palette'
);

// ── 4. routes synthesis — shorthand single-app screens ──────────────

$v3_min = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array(
		'home' => array(
			'label' => 'Home',
			'path'  => '/dashboard/home',
			'app'   => 'core:dashboard',
		),
		'posts' => array(
			'label'  => 'Posts',
			'path'   => '/posts',
			'app'    => 'core:posts',
			'config' => array( 'postType' => 'post' ),
		),
	),
);
$compiled_min = WP_Admin_Shell_V3_Compiler::compile( $v3_min );

$T::ok(
	'routes synth: /dashboard/home present',
	isset( $compiled_min['routes']['/dashboard/home'] )
);
$T::eq(
	'routes synth: /dashboard/home app id',
	$compiled_min['routes']['/dashboard/home']['app'],
	'core:dashboard'
);
$T::eq(
	'routes synth: /dashboard/home screenId injected',
	$compiled_min['routes']['/dashboard/home']['config']['screenId'],
	'home'
);
$T::ok(
	'routes synth: /posts present',
	isset( $compiled_min['routes']['/posts'] )
);
$T::eq(
	'routes synth: /posts retains screen.config.postType',
	$compiled_min['routes']['/posts']['config']['postType'],
	'post'
);
$T::eq(
	'routes synth: /posts screenId injected',
	$compiled_min['routes']['/posts']['config']['screenId'],
	'posts'
);

// ── 5. routes synthesis — long-form apps[] screens ──────────────────

$v3_long = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'split' ),
	'screens'   => array(
		'split' => array(
			'label' => 'Split View',
			'path'  => '/split',
			'apps'  => array(
				array( 'id' => 'list',    'app' => 'core:posts',  'config' => array( 'postType' => 'page' ) ),
				array( 'id' => 'preview', 'app' => 'core:editor', 'slot' => 'detail' ),
			),
		),
	),
);
$compiled_long = WP_Admin_Shell_V3_Compiler::compile( $v3_long );
$T::eq(
	'apps[] long-form: primary app from first entry',
	$compiled_long['routes']['/split']['app'],
	'core:posts'
);
$T::eq(
	'apps[] long-form: primary app config retained',
	$compiled_long['routes']['/split']['config']['postType'],
	'page'
);
$T::eq(
	'apps[] long-form: screenId still injected',
	$compiled_long['routes']['/split']['config']['screenId'],
	'split'
);

// ── 6. Slot-routed screens (palette) ────────────────────────────────

$v3_palette = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array(
		'home' => array( 'path' => '/', 'app' => 'core:dashboard' ),
		'command-palette' => array(
			'label' => 'Command Palette',
			'slot'  => 'palette',
			'app'   => 'core:command-palette',
			'mode'  => 'modal',
		),
	),
);
$compiled_palette = WP_Admin_Shell_V3_Compiler::compile( $v3_palette );
// Palette routes live under @palette/<id> key.
$T::ok(
	'palette-slot screen registers under @palette/command-palette',
	isset( $compiled_palette['routes']['@palette/command-palette'] )
);
$T::eq(
	'palette-slot screen has correct app id',
	$compiled_palette['routes']['@palette/command-palette']['app'],
	'core:command-palette'
);

// ── 7. Regions synthesis — engine defaultRegions ───────────────────

$compiled_full = WP_Admin_Shell_V3_Compiler::compile( $v3_min );
$T::ok(
	'regions synth: top-level regions block present',
	is_array( $compiled_full['regions'] ) && ! empty( $compiled_full['regions'] )
);
// core:default ships sidebar + content + command-palette + notices-banner +
// notices-snackbar in its defaultRegions.
$T::ok(
	'regions synth: content region present (from engine defaultRegions)',
	isset( $compiled_full['regions']['content'] )
);
$T::ok(
	'regions synth: sidebar region present',
	isset( $compiled_full['regions']['sidebar'] )
);
$T::eq(
	'regions synth: content region route-key is _self',
	$compiled_full['regions']['content']['routing']['route-key'] ?? null,
	'_self'
);

// ── 8. Regions merge — workspace overrides engine defaults ─────────

$v3_with_regions = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array( 'home' => array( 'path' => '/', 'app' => 'core:dashboard' ) ),
	'regions'   => array(
		'content' => array( 'style' => array( 'background' => 'red' ) ),
		'custom-region' => array( 'role' => 'region', 'app' => 'plugin:my/widget' ),
	),
);
$compiled_merged = WP_Admin_Shell_V3_Compiler::compile( $v3_with_regions );
$T::ok(
	'regions merge: workspace adds custom-region',
	isset( $compiled_merged['regions']['custom-region'] )
);
$T::ok(
	'regions merge: engine defaultRegions (sidebar) still present',
	isset( $compiled_merged['regions']['sidebar'] )
);
$T::eq(
	'regions merge: workspace style wins on content region',
	$compiled_merged['regions']['content']['style']['background'] ?? null,
	'red'
);
$T::eq(
	'regions merge: content region still has template from engine defaults',
	$compiled_merged['regions']['content']['template'] ?? null,
	'core:main'
);

// ── 9. default-route synthesis ─────────────────────────────────────

$T::eq(
	'default-route from workspace.default-screen path',
	$compiled_min['default-route'],
	'/dashboard/home'
);

// Default-screen has no path — fall back.
$v3_no_path = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'palette-only' ),
	'screens'   => array(
		'palette-only' => array( 'slot' => 'palette', 'app' => 'core:command-palette' ),
		'real-screen'  => array( 'path' => '/somewhere', 'app' => 'core:dashboard' ),
	),
);
$compiled_np = WP_Admin_Shell_V3_Compiler::compile( $v3_no_path );
$T::eq(
	'default-route falls back when default-screen has no path',
	$compiled_np['default-route'],
	'/somewhere'
);

// ── 10. commands compilation ───────────────────────────────────────

$v3_commands = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array( 'home' => array( 'path' => '/', 'app' => 'core:dashboard' ) ),
	'commands'  => array(
		array( 'id' => 'open-palette', 'shortcut' => 'Mod+K', 'invoke' => 'core:command-palette' ),
		array( 'id' => 'go-posts',     'shortcut' => 'g p',   'navigate' => '/posts' ),
	),
);
$compiled_cmds = WP_Admin_Shell_V3_Compiler::compile( $v3_commands );
$T::ok(
	'commands compile: preserves array',
	is_array( $compiled_cmds['commands'] ) && count( $compiled_cmds['commands'] ) === 2
);
// Find by id (order is preserved but defensive).
$cmd_ids = array();
foreach ( $compiled_cmds['commands'] as $c ) {
	$cmd_ids[] = $c['id'];
}
$T::ok(
	'commands compile: open-palette id present',
	in_array( 'open-palette', $cmd_ids, true )
);
$T::ok(
	'commands compile: go-posts id present',
	in_array( 'go-posts', $cmd_ids, true )
);

// Dedup by id — later wins.
$v3_dup_cmds = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array( 'home' => array( 'path' => '/', 'app' => 'core:dashboard' ) ),
	'commands'  => array(
		array( 'id' => 'dup', 'shortcut' => 'a', 'invoke' => 'first' ),
		array( 'id' => 'dup', 'shortcut' => 'b', 'invoke' => 'second' ),
	),
);
$compiled_dup = WP_Admin_Shell_V3_Compiler::compile( $v3_dup_cmds );
$T::eq(
	'commands compile: duplicate ids dedupe (later wins)',
	count( $compiled_dup['commands'] ),
	1
);
$T::eq(
	'commands compile: dedup keeps later entry',
	$compiled_dup['commands'][0]['invoke'],
	'second'
);

// ── 11. engine promotion: workspace.engine → top-level engine ───────

$T::eq(
	'engine promoted from workspace.engine to top-level',
	$compiled_min['engine'],
	'core:default'
);

// ── 12. screens with no path or alternate slot are skipped ──────────

$v3_skip = array(
	'version'   => 3,
	'workspace' => array( 'engine' => 'core:default', 'default-screen' => 'home' ),
	'screens'   => array(
		'home'       => array( 'path' => '/', 'app' => 'core:dashboard' ),
		'no-mount'   => array( 'app' => 'core:somewhere' ), // No path, default slot _self → skipped
	),
);
$compiled_skip = WP_Admin_Shell_V3_Compiler::compile( $v3_skip );
$T::ok(
	'screens with no path + _self slot skip route synth',
	! isset( $compiled_skip['routes']['/no-mount'] )
);

// ── 13. End-to-end: bundled v3 default shell via full resolver ──────

update_option( 'wp_admin_shell_active_shell', 'wp-admin-default-v3' );
WP_Admin_Shell_Cache::flush();
WP_Admin_Shell_Resolver::reset_request_memo();

$resolved = wp_admin_shell_get_active_config();

$T::ok(
	'e2e: v3 shell resolves to non-empty config',
	is_array( $resolved ) && ! empty( $resolved )
);
$T::eq(
	'e2e: engine promoted to top-level',
	$resolved['engine'] ?? null,
	'core:default'
);
$T::ok(
	'e2e: routes synthesized from screens',
	is_array( $resolved['routes'] ?? null )
		&& isset( $resolved['routes']['/dashboard/home'] )
		&& isset( $resolved['routes']['/posts'] )
);
$T::eq(
	'e2e: /posts screenId injected',
	$resolved['routes']['/posts']['config']['screenId'] ?? null,
	'posts'
);
$T::ok(
	'e2e: regions synthesized from engine defaultRegions',
	is_array( $resolved['regions'] ?? null )
		&& isset( $resolved['regions']['sidebar'] )
		&& isset( $resolved['regions']['content'] )
);
$T::eq(
	'e2e: default-route resolves to /dashboard/home',
	$resolved['default-route'] ?? null,
	'/dashboard/home'
);
$T::ok(
	'e2e: commands block preserved (5 declared in fixture)',
	is_array( $resolved['commands'] ?? null )
		&& count( $resolved['commands'] ) === 5
);
$T::ok(
	'e2e: screens block remains on resolved doc',
	is_array( $resolved['screens'] ?? null )
		&& isset( $resolved['screens']['posts'] )
);

// Restore for subsequent tests.
update_option( 'wp_admin_shell_active_shell', 'wp-admin-default' );
WP_Admin_Shell_Cache::flush();
WP_Admin_Shell_Resolver::reset_request_memo();

// ── Summary ────────────────────────────────────────────────────────

echo "\n— Summary —\n";
echo "PASS: " . WPAS_V3_Compiler_Test_Runner::$pass . "  FAIL: " . WPAS_V3_Compiler_Test_Runner::$fail . "\n";
if ( WPAS_V3_Compiler_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
