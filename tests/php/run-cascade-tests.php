<?php
/**
 * Standalone cascade-resolver test runner.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-cascade-tests.php`
 *
 * Class-scoped state because `wp eval-file` wraps the file in `eval()`,
 * which breaks `global $foo` lookups across helper functions.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Cascade_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;
	public static $plugin_dir;
	public static $fixture_dir;

	public static function init() {
		self::$plugin_dir = dirname( __DIR__, 2 ) . '/';
		self::$fixture_dir = self::$plugin_dir . 'tests/php/fixtures/';
	}

	public static function assert_eq( $label, $a, $b, $detail = '' ) {
		if ( $a === $b ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			echo "      expected: " . json_encode( $b ) . "\n";
			echo "      actual:   " . json_encode( $a ) . "\n";
			if ( $detail ) {
				echo "      $detail\n";
			}
		}
	}

	public static function assert_true( $label, $condition, $detail = '' ) {
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

	public static function load( $name ) {
		$path = self::$fixture_dir . $name;
		if ( ! file_exists( $path ) ) {
			throw new RuntimeException( "Fixture not found: $path" );
		}
		return json_decode( file_get_contents( $path ), true );
	}
}

WPAS_Cascade_Test_Runner::init();

require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/cascade/class-wp-admin-workspaces-merge.php';
require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/cascade/class-wp-admin-workspaces-customizable.php';
require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/origins/class-wp-admin-workspaces-origin-core.php';
require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/cascade/class-wp-admin-workspaces-resolver.php';

$T = 'WPAS_Cascade_Test_Runner';

// ── Field-aware merge ───────────────────────────────────────────────

echo "\n— Field-aware merge —\n";

// 1. Scalars replace.
$merged = WP_Admin_Workspaces_Merge::merge( array( 'title' => 'A' ), array( 'title' => 'B' ) );
$T::assert_eq( 'scalars: replace', $merged['title'], 'B' );

// 2. Objects deep-merge.
$merged = WP_Admin_Workspaces_Merge::merge(
	array( 'styles' => array( 'a' => 1, 'b' => 2 ) ),
	array( 'styles' => array( 'b' => 3, 'c' => 4 ) )
);
$T::assert_eq( 'objects: deep-merge keeps unique keys',
	$merged['styles'],
	array( 'a' => 1, 'b' => 3, 'c' => 4 )
);

// 3. Keyed arrays merge by id — base order preserved, novel entries appended.
$base   = array( 'applications' => array(
	array( 'id' => 'posts', 'title' => 'Posts' ),
	array( 'id' => 'media', 'title' => 'Media' ),
) );
$over   = array( 'applications' => array(
	array( 'id' => 'media', 'title' => 'Library' ),
	array( 'id' => 'users', 'title' => 'Users' ),
) );
$merged = WP_Admin_Workspaces_Merge::merge( $base, $over );
$ids    = array_column( $merged['applications'], 'id' );
$titles = array_column( $merged['applications'], 'title', 'id' );
$T::assert_eq( 'keyed arrays: base order preserved + novel appended',
	$ids,
	array( 'posts', 'media', 'users' )
);
$T::assert_eq( 'keyed arrays: override merged into matching id',
	$titles,
	array( 'posts' => 'Posts', 'media' => 'Library', 'users' => 'Users' )
);

// 4. Plain arrays replace.
$merged = WP_Admin_Workspaces_Merge::merge(
	array( 'tags' => array( 'a', 'b' ) ),
	array( 'tags' => array( 'c' ) )
);
$T::assert_eq( 'plain arrays: replace', $merged['tags'], array( 'c' ) );

// 4a. Null tombstones (v3 spec §10) — theme.json convention adopted for workspace.json.
// Tombstones are gated to trust-tier origins (core/engine/plugin/site).
// `merge_with_tombstones()` is the site-origin additive-with-tombstone path;
// `merge_authoritative()` covers core/engine/plugin. Untrusted `merge()`
// silently no-ops tombstones (with WP_DEBUG notice) — verified separately.

// Top-level block removal.
$merged = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'screens' => array( 'posts' => array( 'label' => 'Posts' ) ) ),
	array( 'screens' => array( 'posts' => null ) )
);
$T::assert_eq( 'tombstone: top-level block removed',
	$merged,
	array( 'screens' => array() )
);

// Nested field removal — siblings preserved.
$merged = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'screens' => array( 'posts' => array( 'label' => 'Posts', 'icon' => 'post' ) ) ),
	array( 'screens' => array( 'posts' => array( 'icon' => null ) ) )
);
$T::assert_eq( 'tombstone: nested field removed, sibling preserved',
	$merged,
	array( 'screens' => array( 'posts' => array( 'label' => 'Posts' ) ) )
);

// Deep nested tombstone — only the leaf path is nullified.
$merged = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'a' => array( 'b' => array( 'c' => array( 'd' => 'leaf', 'e' => 'sibling' ) ) ) ),
	array( 'a' => array( 'b' => array( 'c' => array( 'd' => null ) ) ) )
);
$T::assert_eq( 'tombstone: deep nested leaf removed, parent + sibling preserved',
	$merged,
	array( 'a' => array( 'b' => array( 'c' => array( 'e' => 'sibling' ) ) ) )
);

// Keyed array entry removal by id via `__tombstone` marker.
$merged = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'commands' => array(
		array( 'id' => 'open-palette', 'shortcut' => 'Mod+K' ),
		array( 'id' => 'save',         'shortcut' => 'Mod+S' ),
	) ),
	array( 'commands' => array(
		array( 'id' => 'open-palette', '__tombstone' => true ),
	) )
);
$ids = array_column( $merged['commands'], 'id' );
$T::assert_eq( 'tombstone: keyed-array entry removed, siblings preserved',
	$ids,
	array( 'save' )
);

// Tombstone with no matching base entry is a harmless no-op (no
// new entry materializes from the tombstone marker itself).
$merged = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'commands' => array(
		array( 'id' => 'save', 'shortcut' => 'Mod+S' ),
	) ),
	array( 'commands' => array(
		array( 'id' => 'never-existed', '__tombstone' => true ),
	) )
);
$ids = array_column( $merged['commands'], 'id' );
$T::assert_eq( 'tombstone: orphan tombstone is a no-op',
	$ids,
	array( 'save' )
);

// Tombstone field on a key with no lower-origin value is a no-op.
$merged = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'screens' => array( 'posts' => array( 'label' => 'Posts' ) ) ),
	array( 'screens' => array( 'posts' => array( 'unset-me' => null ) ) )
);
$T::assert_eq( 'tombstone: nullify-an-absent-key is a no-op',
	$merged,
	array( 'screens' => array( 'posts' => array( 'label' => 'Posts' ) ) )
);

// Three-origin resurrection: middle origin tombstones, highest origin
// re-asserts. Highest-origin write wins (tombstones don't propagate).
$step1 = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	array( 'screens' => array( 'posts' => array( 'label' => 'Posts' ) ) ),
	array( 'screens' => array( 'posts' => null ) )
);
$T::assert_eq( 'tombstone: middle-origin tombstone removes value',
	$step1,
	array( 'screens' => array() )
);
$step2 = WP_Admin_Workspaces_Merge::merge_with_tombstones(
	$step1,
	array( 'screens' => array( 'posts' => array( 'label' => 'Renamed' ) ) )
);
$T::assert_eq( 'tombstone: highest-origin resurrects after middle tombstone',
	$step2,
	array( 'screens' => array( 'posts' => array( 'label' => 'Renamed' ) ) )
);

// Authoritative-merge path also honors null tombstones (so trusted
// origins can express "I want this gone" without enumerating the rest).
$merged = WP_Admin_Workspaces_Merge::merge_authoritative(
	array( 'styles' => array( 'a' => 1, 'b' => 2 ) ),
	array( 'styles' => array( 'a' => null ) )
);
$T::assert_eq( 'tombstone: authoritative merge honors null',
	$merged,
	array( 'styles' => array( 'b' => 2 ) )
);

// Tombstone on plain (non-keyed) array entry: the whole array is
// replaced anyway (plain arrays replace), so this exercises that
// keyed-array detection won't mistakenly fire on a plain list.
$merged = WP_Admin_Workspaces_Merge::merge(
	array( 'tags' => array( 'a', 'b', 'c' ) ),
	array( 'tags' => array( 'x' ) )
);
$T::assert_eq( 'tombstone: plain-array replace still works alongside tombstone path',
	$merged['tags'],
	array( 'x' )
);

// 5. Restrict-only.
$base    = $T::load( '01-base-plugin.json' );
$middle  = $T::load( '02-plugin-removes-plugins.json' );
$user    = $T::load( '03-user-tries-to-re-add-plugins.json' );

$tagged_base   = WP_Admin_Workspaces_Merge::tag_origin( $base,    'core' );
$tagged_middle = WP_Admin_Workspaces_Merge::tag_origin( $middle,  'plugin' );
$tagged_user   = WP_Admin_Workspaces_Merge::tag_origin( $user,    'user' );

// Trusted-origin step: plugin authoritatively redefines applications (drops `plugins`).
$step1 = WP_Admin_Workspaces_Merge::merge_authoritative( $tagged_base, $tagged_middle );
// Consumer-origin step: user tries to add `plugins`; tombstone refuses it.
$step2 = WP_Admin_Workspaces_Merge::merge( $step1, $tagged_user );

$apps_clean = array_values( array_filter(
	$step2['settings']['applications'],
	fn( $a ) => empty( $a['__origin'] ) || $a['__origin'] !== '__removed'
) );
$ids = array_column( $apps_clean, 'id' );

$T::assert_true( 'restrict-only: user cannot re-add plugin-removed app',
	! in_array( 'plugins', $ids, true ),
	'ids: ' . implode( ',', $ids )
);
$T::assert_true( 'restrict-only: surviving apps preserved',
	in_array( 'posts', $ids, true ) && in_array( 'media', $ids, true ),
	'ids: ' . implode( ',', $ids )
);

// ── customizable ────────────────────────────────────────────────────

echo "\n— customizable enforcement —\n";

$T::assert_eq( 'customizable=true: all fields allowed',
	WP_Admin_Workspaces_Customizable::filter_writes(
		array( 'id' => 'x', 'customizable' => true ),
		array( 'title' => 'B', 'icon' => 'j' )
	),
	array( 'title' => 'B', 'icon' => 'j' )
);

$T::assert_eq( 'customizable=false: all fields blocked',
	WP_Admin_Workspaces_Customizable::filter_writes(
		array( 'id' => 'x', 'customizable' => false ),
		array( 'title' => 'X' )
	),
	array()
);

$T::assert_eq( 'customizable=[title]: only title allowed',
	WP_Admin_Workspaces_Customizable::filter_writes(
		array( 'id' => 'x', 'customizable' => array( 'title' ) ),
		array( 'title' => 'OK', 'icon' => 'NO' )
	),
	array( 'title' => 'OK' )
);

$T::assert_eq( 'customizable absent: locked (default-deny)',
	WP_Admin_Workspaces_Customizable::filter_writes(
		array( 'id' => 'x' ),
		array( 'title' => 'X' )
	),
	array()
);

$base       = $T::load( '05-base-with-customizable.json' );
$user_input = $T::load( '06-user-customize-attempts.json' );

$filtered = WP_Admin_Workspaces_Customizable::filter_doc( $base, $user_input );

$T::assert_eq( 'doc: branding.accentColor allowed',
	$filtered['styles']['branding']['accentColor'] ?? null,
	'#ff00ff'
);
$T::assert_true( 'doc: branding.title blocked',
	! isset( $filtered['styles']['branding']['title'] ),
	'styles: ' . json_encode( $filtered['styles'] ?? null )
);

$posts_filtered = null;
foreach ( ( $filtered['settings']['applications'] ?? array() ) as $a ) {
	if ( ( $a['id'] ?? null ) === 'posts' ) {
		$posts_filtered = $a;
	}
}
$T::assert_eq( 'doc: posts.title allowed (declared)',
	$posts_filtered['title'] ?? null,
	'My Posts'
);
$T::assert_true( 'doc: posts.source blocked (not declared)',
	! isset( $posts_filtered['source'] ),
	'posts entry: ' . json_encode( $posts_filtered )
);

$pages_filtered = null;
foreach ( ( $filtered['settings']['applications'] ?? array() ) as $a ) {
	if ( ( $a['id'] ?? null ) === 'pages' ) {
		$pages_filtered = $a;
	}
}
$T::assert_true( 'doc: pages locked entirely',
	$pages_filtered === null || ! isset( $pages_filtered['title'] ),
	'pages entry: ' . json_encode( $pages_filtered )
);

// ── Origin loaders + full pipeline ──────────────────────────────────

echo "\n— Origin loaders + full pipeline —\n";

// The loader passes docs through as-is + falls back to `empty_doc()` for
// missing/malformed JSON. The empty doc is v3-shape: a top-level `engine`
// and a single screen so the kernel can synthesize a valid (empty)
// workspace.
$empty = WP_Admin_Workspaces_Origin_Core::empty_doc();
$T::assert_eq( 'core origin: empty_doc carries top-level engine',
	$empty['engine'] ?? null,
	'core:default'
);
$T::assert_true( 'core origin: empty_doc carries a home screen',
	isset( $empty['screens']['home'] ),
	'screens: ' . json_encode( array_keys( $empty['screens'] ?? array() ) )
);
$T::assert_true( 'core origin: missing workspace path falls back to empty_doc',
	is_array( WP_Admin_Workspaces_Origin_Core::load( '/path/does/not/exist.json' ) )
);

$injected = array(
	'core'   => $base, // 05-base-with-customizable.json
	'plugin' => array(),
	'site'   => array(),
	'role'   => array(),
	'user'   => $user_input,
);
$resolved = WP_Admin_Workspaces_Resolver::resolve_with( $injected );

$pages_after = null;
foreach ( ( $resolved['settings']['applications'] ?? array() ) as $a ) {
	if ( ( $a['id'] ?? null ) === 'pages' ) {
		$pages_after = $a;
	}
}
$T::assert_eq( 'resolver: locked entry preserves base value',
	$pages_after['title'] ?? null,
	'Pages'
);
$T::assert_eq( 'resolver: customizable user override applied',
	$resolved['styles']['branding']['accentColor'] ?? null,
	'#ff00ff'
);
$T::assert_true( 'resolver: origin tags stripped',
	! isset( $resolved['__origin'] ) && ! isset( $resolved['settings']['__origin'] ),
	json_encode( array_keys( $resolved ) )
);

// ── Programmatic workspace registration (spec §13 #6) ──────────────────

echo "\n— Programmatic workspace registration —\n";

require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/class-wp-admin-workspaces-registry.php';

WP_Admin_Workspaces_Registry::reset();
$slug = WP_Admin_Workspaces_Registry::register( 'computed-workspace', array(
	'version' => 1,
	'engine'  => 'core:default',
	'title'   => 'Computed',
	'regions' => array(
		'content' => array( 'role' => 'main' ),
	),
) );
$T::assert_eq( 'register_workspace returns slug', $slug, 'computed-workspace' );
$T::assert_true( 'has() finds registered slug', WP_Admin_Workspaces_Registry::has( 'computed-workspace' ) );
$T::assert_true( 'all() includes registered slug', isset( WP_Admin_Workspaces_Registry::all()['computed-workspace'] ) );

$bad = WP_Admin_Workspaces_Registry::register( '', array() );
$T::assert_true( 'empty slug → WP_Error', is_wp_error( $bad ) );

$bad = WP_Admin_Workspaces_Registry::register( 'no-doc', 'not an array' );
$T::assert_true( 'non-array doc → WP_Error', is_wp_error( $bad ) );

// Registration without a `name` field stamps the slug in.
WP_Admin_Workspaces_Registry::reset();
WP_Admin_Workspaces_Registry::register( 'auto-name', array(
	'version' => 1,
	'engine'  => 'core:default',
	'regions' => array( 'content' => array( 'role' => 'main' ) ),
) );
$T::assert_eq(
	'register stamps slug into doc when name missing',
	WP_Admin_Workspaces_Registry::get( 'auto-name' )['name'] ?? null,
	'auto-name'
);

// Resolver picks programmatic over file-based when slug exists.
WP_Admin_Workspaces_Registry::reset();
WP_Admin_Workspaces_Registry::register( 'wp-admin-default', array(
	'version' => 1,
	'engine'  => 'core:default',
	'title'   => 'Programmatic Override',
	'regions' => array( 'content' => array( 'role' => 'main' ) ),
) );

WP_Admin_Workspaces_Cache::flush();
WP_Admin_Workspaces_Resolver::reset_request_memo();
update_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );
$resolved = WP_Admin_Workspaces_Resolver::resolve();
$T::assert_eq(
	'resolver: programmatic workspace wins over file-based same slug',
	$resolved['title'] ?? null,
	'Programmatic Override'
);

// Cleanup so subsequent tests get a clean slate.
WP_Admin_Workspaces_Registry::reset();
WP_Admin_Workspaces_Cache::flush();
WP_Admin_Workspaces_Resolver::reset_request_memo();
delete_option( 'wp_admin_workspaces_active_workspace' );

// ── user-switchable: schema-canonical kebab form ─────────────────────

echo "\n— user-switchable kebab form —\n";

// A bundled workspace that ships `"user-switchable": true` in kebab form.
// Pre-fix: production code read `userSwitchable` and silently treated
// every workspace as non-switchable (always-false). Post-fix: kebab wins.
// `WP_Admin_Workspaces_Config::get_user_switchable()` exercises the same
// reader path used by JS-side `window.wpAdminWorkspaces.workspaces` enumeration.
$desktop_demo_path = WPAS_Cascade_Test_Runner::$plugin_dir . 'workspaces/desktop-demo.json';
if ( file_exists( $desktop_demo_path ) ) {
	$desktop_demo_doc = json_decode( file_get_contents( $desktop_demo_path ), true );
	require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/class-wp-admin-workspaces-config.php';
	$cfg = new WP_Admin_Workspaces_Config( $desktop_demo_doc );
	$T::assert_true(
		'user-switchable: kebab "user-switchable: true" recognized via Config::get_user_switchable',
		$cfg->get_user_switchable()
	);
}

// ── Summary ─────────────────────────────────────────────────────────

echo "\n— Summary —\n";
echo 'PASS: ' . WPAS_Cascade_Test_Runner::$pass . '  FAIL: ' . WPAS_Cascade_Test_Runner::$fail . "\n";

if ( WPAS_Cascade_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
