<?php
/**
 * Standalone cascade-resolver test runner.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php`
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
		self::$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
		if ( ! file_exists( self::$plugin_dir . 'wp-admin-shell.php' ) ) {
			self::$plugin_dir = WP_PLUGIN_DIR . '/wp-admin-shell/';
		}
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

require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/cascade/class-wp-admin-shell-merge.php';
require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/cascade/class-wp-admin-shell-customizable.php';
require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/origins/class-wp-admin-shell-origin-core.php';
require_once WPAS_Cascade_Test_Runner::$plugin_dir . 'includes/cascade/class-wp-admin-shell-resolver.php';

$T = 'WPAS_Cascade_Test_Runner';

// ── Field-aware merge ───────────────────────────────────────────────

echo "\n— Field-aware merge —\n";

// 1. Scalars replace.
$merged = WP_Admin_Shell_Merge::merge( array( 'title' => 'A' ), array( 'title' => 'B' ) );
$T::assert_eq( 'scalars: replace', $merged['title'], 'B' );

// 2. Objects deep-merge.
$merged = WP_Admin_Shell_Merge::merge(
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
$merged = WP_Admin_Shell_Merge::merge( $base, $over );
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
$merged = WP_Admin_Shell_Merge::merge(
	array( 'tags' => array( 'a', 'b' ) ),
	array( 'tags' => array( 'c' ) )
);
$T::assert_eq( 'plain arrays: replace', $merged['tags'], array( 'c' ) );

// 5. Restrict-only.
$base    = $T::load( '01-base-plugin.json' );
$middle  = $T::load( '02-plugin-removes-plugins.json' );
$user    = $T::load( '03-user-tries-to-re-add-plugins.json' );

$tagged_base   = WP_Admin_Shell_Merge::tag_origin( $base,    'core' );
$tagged_middle = WP_Admin_Shell_Merge::tag_origin( $middle,  'plugin' );
$tagged_user   = WP_Admin_Shell_Merge::tag_origin( $user,    'user' );

// Trusted-origin step: plugin authoritatively redefines applications (drops `plugins`).
$step1 = WP_Admin_Shell_Merge::merge_authoritative( $tagged_base, $tagged_middle );
// Consumer-origin step: user tries to add `plugins`; tombstone refuses it.
$step2 = WP_Admin_Shell_Merge::merge( $step1, $tagged_user );

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
	WP_Admin_Shell_Customizable::filter_writes(
		array( 'id' => 'x', 'customizable' => true ),
		array( 'title' => 'B', 'icon' => 'j' )
	),
	array( 'title' => 'B', 'icon' => 'j' )
);

$T::assert_eq( 'customizable=false: all fields blocked',
	WP_Admin_Shell_Customizable::filter_writes(
		array( 'id' => 'x', 'customizable' => false ),
		array( 'title' => 'X' )
	),
	array()
);

$T::assert_eq( 'customizable=[title]: only title allowed',
	WP_Admin_Shell_Customizable::filter_writes(
		array( 'id' => 'x', 'customizable' => array( 'title' ) ),
		array( 'title' => 'OK', 'icon' => 'NO' )
	),
	array( 'title' => 'OK' )
);

$T::assert_eq( 'customizable absent: locked (default-deny)',
	WP_Admin_Shell_Customizable::filter_writes(
		array( 'id' => 'x' ),
		array( 'title' => 'X' )
	),
	array()
);

$base       = $T::load( '05-base-with-customizable.json' );
$user_input = $T::load( '06-user-customize-attempts.json' );

$filtered = WP_Admin_Shell_Customizable::filter_doc( $base, $user_input );

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

// V2.M4 task 8: the v0 → v1 normalizer is gone. v0 inputs are no
// longer supported. The loader passes docs through as-is + falls back
// to `empty_doc()` for missing/malformed JSON. The empty doc carries
// an `engine` field and a single content region so the kernel can
// render a valid (empty) shell.
$empty = WP_Admin_Shell_Origin_Core::empty_doc();
$T::assert_eq( 'core origin: empty_doc carries engine',
	$empty['engine'] ?? null,
	'core:default'
);
$T::assert_true( 'core origin: empty_doc carries content region',
	isset( $empty['regions']['content'] ),
	'regions: ' . json_encode( array_keys( $empty['regions'] ?? array() ) )
);
$T::assert_true( 'core origin: malformed doc falls back to empty_doc',
	is_array( WP_Admin_Shell_Origin_Core::normalize_v0( null ) )
);

$injected = array(
	'core'   => $base, // 05-base-with-customizable.json
	'plugin' => array(),
	'site'   => array(),
	'role'   => array(),
	'user'   => $user_input,
);
$resolved = WP_Admin_Shell_Resolver::resolve_with( $injected );

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

// ── Summary ─────────────────────────────────────────────────────────

echo "\n— Summary —\n";
echo 'PASS: ' . WPAS_Cascade_Test_Runner::$pass . '  FAIL: ' . WPAS_Cascade_Test_Runner::$fail . "\n";

if ( WPAS_Cascade_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
