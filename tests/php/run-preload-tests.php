<?php
/**
 * REST preload tests — C1 phase.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-preload-tests.php`
 *
 * Coverage:
 *   - `WP_Admin_Shell_Preload::normalize_entry` accepts strings + 2-tuples,
 *     rejects malformed shapes (number, object, bad verb, missing leading slash).
 *   - `collect_from_origins` concatenates additively across cascade origins.
 *   - Duplicate `path|method` pairs dedupe across origins (first occurrence wins).
 *   - Per-origin `wp_admin_shell_data_{origin}` filters can mutate the
 *     preload list before collection.
 *   - `hydrate` actually invokes `rest_preload_api_request` (counted via
 *     `rest_pre_dispatch`) and returns a non-empty cache for known routes.
 *   - Malformed entries are skipped without poisoning the rest of the bundle.
 *
 * Class-scoped state — `wp eval-file` wraps in eval() and breaks `global`.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Preload_Test_Runner {
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

	public static function assert_true( $label, $condition ) {
		self::assert_eq( $label, (bool) $condition, true );
	}

	public static function assert_null( $label, $actual ) {
		self::assert_eq( $label, $actual, null );
	}
}

// Make sure preload entries authored at `me` actually authenticate. The
// CLI runner is unauthenticated by default — switch to user 1 so
// `/wp/v2/users/me` resolves a real record instead of 401.
$admin_ids = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ids' ) );
if ( ! empty( $admin_ids ) ) {
	wp_set_current_user( (int) $admin_ids[0] );
}

// --- normalize_entry --------------------------------------------------------

WPAS_Preload_Test_Runner::assert_eq(
	'string entry → [path, GET]',
	WP_Admin_Shell_Preload::normalize_entry( '/wp/v2/users/me' ),
	array( '/wp/v2/users/me', 'GET' )
);
WPAS_Preload_Test_Runner::assert_eq(
	'tuple entry → [path, OPTIONS]',
	WP_Admin_Shell_Preload::normalize_entry( array( '/wp/v2/settings', 'OPTIONS' ) ),
	array( '/wp/v2/settings', 'OPTIONS' )
);
WPAS_Preload_Test_Runner::assert_eq(
	'tuple entry — lowercase verb uppercased',
	WP_Admin_Shell_Preload::normalize_entry( array( '/wp/v2/posts', 'get' ) ),
	array( '/wp/v2/posts', 'GET' )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects missing leading slash',
	WP_Admin_Shell_Preload::normalize_entry( 'wp/v2/users/me' )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects empty string',
	WP_Admin_Shell_Preload::normalize_entry( '' )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects integer',
	WP_Admin_Shell_Preload::normalize_entry( 42 )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects assoc-shape entry',
	WP_Admin_Shell_Preload::normalize_entry( array( 'url' => '/wp/v2/users/me', 'method' => 'GET' ) )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects 1-tuple',
	WP_Admin_Shell_Preload::normalize_entry( array( '/wp/v2/users/me' ) )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects 3-tuple',
	WP_Admin_Shell_Preload::normalize_entry( array( '/wp/v2/users/me', 'GET', 'extra' ) )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects unknown verb',
	WP_Admin_Shell_Preload::normalize_entry( array( '/wp/v2/users/me', 'POST' ) )
);
WPAS_Preload_Test_Runner::assert_null(
	'rejects non-string method',
	WP_Admin_Shell_Preload::normalize_entry( array( '/wp/v2/users/me', 1 ) )
);

// --- collect_from_origins — single origin ----------------------------------

$origins_one = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => array( 'preload' => array( '/wp/v2/users/me' ) ),
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$collected_one = WP_Admin_Shell_Preload::collect_from_origins( $origins_one );
WPAS_Preload_Test_Runner::assert_eq(
	'single origin preload preserved',
	$collected_one,
	array( array( '/wp/v2/users/me', 'GET' ) )
);

// --- collect_from_origins — multi-origin additive --------------------------

$origins_multi = array(
	'core'   => array(),
	'engine' => array( 'preload' => array( '/wp/v2/types?context=view' ) ),
	'plugin' => array( 'preload' => array(
		'/wp/v2/users/me',
		array( '/wp/v2/settings', 'OPTIONS' ),
	) ),
	'site'   => array( 'preload' => array( '/wp/v2/posts?per_page=5' ) ),
	'role'   => array(),
	'user'   => array( 'preload' => array( array( '/wp/v2/users/me', 'GET' ) ) ),
);
$collected_multi = WP_Admin_Shell_Preload::collect_from_origins( $origins_multi );

WPAS_Preload_Test_Runner::assert_eq(
	'multi-origin concatenated, dedup drops user-origin repeat',
	$collected_multi,
	array(
		array( '/wp/v2/types?context=view', 'GET' ),
		array( '/wp/v2/users/me', 'GET' ),
		array( '/wp/v2/settings', 'OPTIONS' ),
		array( '/wp/v2/posts?per_page=5', 'GET' ),
	)
);

// Path+method pair distinguishes — same path under different verb survives.
$origins_methods = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => array( 'preload' => array(
		array( '/wp/v2/settings', 'OPTIONS' ),
		array( '/wp/v2/settings', 'GET' ),
	) ),
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$collected_methods = WP_Admin_Shell_Preload::collect_from_origins( $origins_methods );
WPAS_Preload_Test_Runner::assert_eq(
	'distinct verbs on same path both kept',
	count( $collected_methods ),
	2
);

// --- malformed entries don't poison neighbors ------------------------------

$origins_messy = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => array( 'preload' => array(
		'/wp/v2/users/me',
		42,                                       // skipped
		array( '/wp/v2/settings', 'POST' ),       // skipped — bad verb
		array( 'url' => '/foo' ),                 // skipped — assoc shape
		'',                                       // skipped — empty
		'/wp/v2/types?context=view',
	) ),
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$collected_messy = WP_Admin_Shell_Preload::collect_from_origins( $origins_messy );
WPAS_Preload_Test_Runner::assert_eq(
	'malformed entries skipped, valid neighbors survive',
	$collected_messy,
	array(
		array( '/wp/v2/users/me', 'GET' ),
		array( '/wp/v2/types?context=view', 'GET' ),
	)
);

// --- per-origin filter contributes ----------------------------------------

$origin_filter = function ( $doc ) {
	if ( ! isset( $doc['preload'] ) || ! is_array( $doc['preload'] ) ) {
		$doc['preload'] = array();
	}
	$doc['preload'][] = '/wp/v2/categories';
	return $doc;
};
add_filter( 'wp_admin_shell_data_plugin', $origin_filter );

$origins_filtered = array(
	'core'   => array(),
	'engine' => array(),
	'plugin' => array( 'preload' => array( '/wp/v2/users/me' ) ),
	'site'   => array(),
	'role'   => array(),
	'user'   => array(),
);
$collected_filtered = WP_Admin_Shell_Preload::collect_from_origins( $origins_filtered );

WPAS_Preload_Test_Runner::assert_eq(
	'per-origin filter contribution lands in collected list',
	$collected_filtered,
	array(
		array( '/wp/v2/users/me', 'GET' ),
		array( '/wp/v2/categories', 'GET' ),
	)
);
remove_filter( 'wp_admin_shell_data_plugin', $origin_filter );

// --- hydrate calls rest_preload_api_request -------------------------------

$dispatch_count = 0;
$counter        = function ( $result, $server, $request ) use ( &$dispatch_count ) {
	if ( strpos( (string) $request->get_route(), '/wp/v2/' ) === 0 ) {
		$dispatch_count++;
	}
	return $result;
};
add_filter( 'rest_pre_dispatch', $counter, 10, 3 );

$cache = WP_Admin_Shell_Preload::hydrate( array(
	array( '/wp/v2/users/me', 'GET' ),
	array( '/wp/v2/settings', 'OPTIONS' ),
) );

remove_filter( 'rest_pre_dispatch', $counter, 10 );

WPAS_Preload_Test_Runner::assert_true(
	'hydrate dispatched at least one REST request',
	$dispatch_count > 0
);
WPAS_Preload_Test_Runner::assert_true(
	'hydrate cache has /wp/v2/users/me entry',
	isset( $cache['/wp/v2/users/me'] )
);

// `rest_preload_api_request` for OPTIONS lands the response under
// `OPTIONS[ path ]` per WP-core convention.
WPAS_Preload_Test_Runner::assert_true(
	'hydrate cache has OPTIONS bucket for /wp/v2/settings',
	isset( $cache['OPTIONS']['/wp/v2/settings'] )
);

// Empty input → empty cache, no fatals.
$empty_cache = WP_Admin_Shell_Preload::hydrate( array() );
WPAS_Preload_Test_Runner::assert_eq(
	'hydrate empty list → empty cache',
	$empty_cache,
	array()
);

// --- inject() end-to-end smoke --------------------------------------------

// `inject()` short-circuits when `wp-api-fetch` isn't registered. The
// CLI bootstrap doesn't enqueue admin scripts, so register a stub
// handle before exercising the code path.
if ( ! wp_script_is( 'wp-api-fetch', 'registered' ) ) {
	wp_register_script( 'wp-api-fetch', '/dev/null/wp-api-fetch.js', array(), '0' );
}

$inject_filter = function ( $doc ) {
	$doc['preload'] = array( '/wp/v2/users/me' );
	return $doc;
};
add_filter( 'wp_admin_shell_data_plugin', $inject_filter );

WP_Admin_Shell_Preload::inject();

remove_filter( 'wp_admin_shell_data_plugin', $inject_filter );

$inline_after = wp_scripts()->get_data( 'wp-api-fetch', 'after' );
$inline_str   = is_array( $inline_after ) ? implode( "\n", $inline_after ) : (string) $inline_after;

WPAS_Preload_Test_Runner::assert_true(
	'inject attaches createPreloadingMiddleware inline on wp-api-fetch[after]',
	strpos( $inline_str, 'wp.apiFetch.createPreloadingMiddleware(' ) !== false
);
WPAS_Preload_Test_Runner::assert_true(
	'inject inline payload references the preloaded path',
	strpos( $inline_str, '/wp/v2/users/me' ) !== false
);

// --- Summary --------------------------------------------------------------

$total = WPAS_Preload_Test_Runner::$pass + WPAS_Preload_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Preload_Test_Runner::$pass . " passed, " . WPAS_Preload_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Preload_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
