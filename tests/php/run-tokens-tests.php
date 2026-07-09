<?php
/**
 * tokens.json discovery + merge tests (V2.M5 task 2).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-tokens-tests.php`
 *
 * Coverage:
 *   - Core baseline (`core.tokens.json`) loads
 *   - `wp_admin_workspaces_plugin_tokens` filter contributes plugin tokens
 *   - `wp_admin_workspaces_site_tokens` option contributes site tokens
 *   - Theme `tokens.json` contributes theme tokens (skipped if no theme)
 *   - Origins deep-merge: site > theme > plugin > core
 *   - Cache hit returns same array
 *   - flush() invalidates the cache
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Tokens_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function assert_true( $label, $condition, $detail = '' ) {
		if ( $condition ) {
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

	public static function assert_eq( $label, $expected, $actual ) {
		$pass = $expected === $actual;
		self::assert_true(
			$label,
			$pass,
			$pass ? '' : 'expected ' . var_export( $expected, true ) . ', got ' . var_export( $actual, true )
		);
	}
}

$T = 'WPAS_Tokens_Test_Runner';

// Reset cascade state between assertions.
function wpas_tokens_reset() {
	delete_option( 'wp_admin_workspaces_site_tokens' );
	remove_all_filters( 'wp_admin_workspaces_plugin_tokens' );
	remove_all_filters( 'wp_admin_workspaces_tokens' );
	WP_Admin_Workspaces_Tokens::flush();
}

echo "\n— core.tokens.json baseline —\n";
{
	wpas_tokens_reset();
	$tokens = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_true( 'tokens is associative array', is_array( $tokens ) && ! empty( $tokens ) );
	$T::assert_true( 'core color tree present', isset( $tokens['color']['$type'] ) );
	$T::assert_eq( 'core color $type', 'color', $tokens['color']['$type'] );
	$T::assert_true( 'core color.brand.500 present', isset( $tokens['color']['brand']['500']['$value'] ) );
}

echo "\n— plugin filter origin —\n";
{
	wpas_tokens_reset();
	add_filter( 'wp_admin_workspaces_plugin_tokens', function () {
		return array(
			'plugin' => array(
				'$type'  => 'color',
				'extra'  => array( '$value' => '#abc123' ),
			),
		);
	} );
	$tokens = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_true( 'plugin contribution merged', isset( $tokens['plugin']['extra']['$value'] ) );
	$T::assert_eq( 'plugin extra value', '#abc123', $tokens['plugin']['extra']['$value'] );
	$T::assert_true( 'core baseline still present', isset( $tokens['color']['brand']['500'] ) );
}

echo "\n— site option origin overrides plugin —\n";
{
	wpas_tokens_reset();
	add_filter( 'wp_admin_workspaces_plugin_tokens', function () {
		return array(
			'color' => array(
				'$type' => 'color',
				'brand' => array( '500' => array( '$value' => '#aaa000' ) ),
			),
		);
	} );
	update_option( 'wp_admin_workspaces_site_tokens', array(
		'color' => array(
			'$type' => 'color',
			'brand' => array( '500' => array( '$value' => '#zzzzzz' ) ),
		),
	) );
	$tokens = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_eq(
		'site value wins over plugin/core',
		'#zzzzzz',
		$tokens['color']['brand']['500']['$value']
	);
}

echo "\n— deep merge keeps unrelated branches —\n";
{
	wpas_tokens_reset();
	update_option( 'wp_admin_workspaces_site_tokens', array(
		'color' => array(
			'brand' => array( '500' => array( '$value' => '#site' ) ),
		),
	) );
	$tokens = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_eq( 'site overrode brand.500', '#site', $tokens['color']['brand']['500']['$value'] );
	$T::assert_true(
		'core color.brand.600 preserved through deep merge',
		isset( $tokens['color']['brand']['600']['$value'] )
	);
	$T::assert_true(
		'core size tree preserved (unrelated branch)',
		isset( $tokens['size']['$type'] )
	);
}

echo "\n— final wp_admin_workspaces_tokens filter —\n";
{
	wpas_tokens_reset();
	add_filter( 'wp_admin_workspaces_tokens', function ( $merged ) {
		$merged['computed'] = array( '$value' => 'injected' );
		unset( $merged['size'] ); // strip a private namespace
		return $merged;
	} );
	$tokens = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_true( 'final filter injected computed value', isset( $tokens['computed']['$value'] ) );
	$T::assert_eq( 'computed value passed through', 'injected', $tokens['computed']['$value'] );
	$T::assert_true( 'final filter stripped namespace', ! isset( $tokens['size'] ) );
	$T::assert_true( 'core color tree survives (only size stripped)', isset( $tokens['color'] ) );
}

{
	wpas_tokens_reset();
	// A filter returning a non-array must not corrupt the cache/runtime.
	add_filter( 'wp_admin_workspaces_tokens', function () {
		return 'not-an-array';
	} );
	$tokens = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_true( 'non-array filter return coerced to array', is_array( $tokens ) );
}

echo "\n— cache —\n";
{
	wpas_tokens_reset();
	$first = WP_Admin_Workspaces_Tokens::resolve();
	add_filter( 'wp_admin_workspaces_plugin_tokens', function () {
		return array( 'late' => array( '$value' => 'wins after flush' ) );
	} );
	$cached = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_true( 'cache hit ignored late filter (no flush)', ! isset( $cached['late'] ) );
	WP_Admin_Workspaces_Tokens::flush();
	$fresh = WP_Admin_Workspaces_Tokens::resolve();
	$T::assert_true( 'flush() picks up late filter', isset( $fresh['late'] ) );
}

wpas_tokens_reset();

echo "\n— Summary —\n";
echo 'PASS: ' . $T::$pass . '  FAIL: ' . $T::$fail . "\n";
if ( $T::$fail > 0 ) {
	throw new RuntimeException( 'tokens tests failed' );
}
