<?php
/**
 * core:desktop chromeless bridge PHP-side contract test.
 *
 * Pins the most-regressable surface of `includes/engines/core-desktop/chromeless-bridge.php`:
 *
 *   - The bridge function `wp_admin_shell_chromeless_bridge_script()` emits
 *     output ONLY when the request is chromeless (the gate function
 *     `wp_admin_shell_is_chromeless_request()` returns true).
 *   - The detection function honours both the explicit query-var signal
 *     and the `Sec-Fetch-Site` / `Sec-Fetch-Dest` iframe headers.
 *   - The bridge source file exists where the bootstrap requires it.
 *
 * postMessage round-trip is a browser concern and lives in the Node
 * contract test (`tests/runtime/chromeless-bridge-contract.test.mjs`).
 * Here we only verify the PHP gate.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-chromeless-bridge-tests.php`
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Chromeless_Bridge_Test_Runner {
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
}

$T = 'WPAS_Chromeless_Bridge_Test_Runner';

if ( ! function_exists( 'wp_admin_shell_is_chromeless_request' ) ) {
	echo "Plugin not loaded — missing wp_admin_shell_is_chromeless_request.\n";
	exit( 1 );
}
if ( ! function_exists( 'wp_admin_shell_chromeless_bridge_script' ) ) {
	echo "Plugin not loaded — missing wp_admin_shell_chromeless_bridge_script.\n";
	exit( 1 );
}

// Snapshot ambient request state so other tests are not affected.
$orig_get    = $_GET;
$orig_server = $_SERVER;

function wpas_bridge_reset_request() {
	$_GET  = array();
	unset( $_SERVER['HTTP_SEC_FETCH_SITE'], $_SERVER['HTTP_SEC_FETCH_DEST'] );
}

echo "\n— wp_admin_shell_is_chromeless_request: detection signals —\n";

wpas_bridge_reset_request();
$T::assert_true(
	'no signal: not chromeless',
	false === wp_admin_shell_is_chromeless_request()
);

wpas_bridge_reset_request();
$_GET['wp_admin_shell_chromeless'] = '1';
$T::assert_true(
	'query var "=1": chromeless',
	true === wp_admin_shell_is_chromeless_request()
);

wpas_bridge_reset_request();
$_GET['wp_admin_shell_chromeless'] = '0';
$T::assert_true(
	'query var "=0": not chromeless',
	false === wp_admin_shell_is_chromeless_request()
);

wpas_bridge_reset_request();
$_SERVER['HTTP_SEC_FETCH_SITE'] = 'same-origin';
$_SERVER['HTTP_SEC_FETCH_DEST'] = 'iframe';
$T::assert_true(
	'Sec-Fetch same-origin + iframe: chromeless',
	true === wp_admin_shell_is_chromeless_request()
);

wpas_bridge_reset_request();
$_SERVER['HTTP_SEC_FETCH_SITE'] = 'cross-site';
$_SERVER['HTTP_SEC_FETCH_DEST'] = 'iframe';
$T::assert_true(
	'Sec-Fetch cross-site + iframe: not chromeless',
	false === wp_admin_shell_is_chromeless_request()
);

wpas_bridge_reset_request();
$_SERVER['HTTP_SEC_FETCH_SITE'] = 'same-origin';
$_SERVER['HTTP_SEC_FETCH_DEST'] = 'document';
$T::assert_true(
	'Sec-Fetch same-origin + document: not chromeless',
	false === wp_admin_shell_is_chromeless_request()
);

echo "\n— wp_admin_shell_chromeless_bridge_script: output gate —\n";

wpas_bridge_reset_request();
ob_start();
wp_admin_shell_chromeless_bridge_script();
$out_when_off = ob_get_clean();
$T::assert_true(
	'non-chromeless request: bridge emits nothing',
	'' === $out_when_off,
	'got ' . strlen( $out_when_off ) . ' bytes of output when off'
);

wpas_bridge_reset_request();
$_GET['wp_admin_shell_chromeless'] = '1';
ob_start();
wp_admin_shell_chromeless_bridge_script();
$out_when_on = ob_get_clean();
$T::assert_true(
	'chromeless request: bridge emits a <script> block',
	false !== strpos( $out_when_on, '<script' )
);
$T::assert_true(
	'chromeless request: bridge emits the source-URL marker',
	false !== strpos( $out_when_on, 'wp-admin-shell-chromeless-bridge.js' )
);
$T::assert_true(
	'chromeless request: bridge emits the iframe-ready handshake type',
	false !== strpos( $out_when_on, 'wp-admin-shell-iframe-ready' )
);

echo "\n— admin_body_class filter contributes the chromeless class —\n";

wpas_bridge_reset_request();
$_GET['wp_admin_shell_chromeless'] = '1';
$classes = apply_filters( 'admin_body_class', '' );
$T::assert_true(
	'admin_body_class includes wp-admin-shell-chromeless when on',
	false !== strpos( $classes, 'wp-admin-shell-chromeless' )
);

wpas_bridge_reset_request();
$classes = apply_filters( 'admin_body_class', '' );
$T::assert_true(
	'admin_body_class omits wp-admin-shell-chromeless when off',
	false === strpos( $classes, 'wp-admin-shell-chromeless' )
);

echo "\n— bridge source file resolves where bootstrap requires it —\n";

$bridge_path = WP_PLUGIN_DIR . '/' . basename( dirname( __DIR__, 2 ) ) . '/includes/engines/core-desktop/chromeless-bridge.php';
$T::assert_true(
	'bridge file exists at expected path',
	file_exists( $bridge_path ),
	'checked ' . $bridge_path
);

// Restore ambient state.
$_GET    = $orig_get;
$_SERVER = $orig_server;

echo "\n— Summary —\n";
echo 'PASS: ' . $T::$pass . '  FAIL: ' . $T::$fail . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
