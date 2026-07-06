<?php
/**
 * /wp-admin-workspaces/v1/activate-theme permission + validation floor tests.
 *
 * The route (`WP_Admin_Workspaces_Themes_REST`) is a thin transport over
 * `switch_theme()`, gated on `current_user_can( 'switch_themes' )`. It has
 * a deliberate validation ladder ahead of the switch so a bad request never
 * reaches `switch_theme()`'s mid-REST `wp_die()` (a 500 carrying literal
 * markup). This suite pins every rung.
 *
 * Requests are dispatched through `rest_do_request()` so the assertions read
 * real HTTP status codes off the response — permission failures route through
 * core's `rest_authorization_required_code()` (401 logged-out / 403 logged-in)
 * exactly as a live client would see them.
 *
 * Coverage:
 *   - Subscriber (lacks `switch_themes`)        → 403 rest_forbidden.
 *   - Logged-out                                → 401 rest_forbidden.
 *   - Admin, empty `stylesheet`                 → 400 rest_invalid_param.
 *   - Admin, unknown/uninstalled stylesheet     → 404 rest_theme_not_found.
 *   - Admin, broken theme (no style.css)        → 400 rest_theme_broken.
 *   - Admin, intact-but-incompatible theme      → 400 rest_theme_requirements.
 *   - Admin, valid installed theme              → 200 { stylesheet, name, active: true }.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-activate-theme-rest-tests.php`
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

$plugin_dir = dirname( __DIR__, 2 ) . '/';
require_once $plugin_dir . 'wp-admin-workspaces.php';

class WPAS_Activate_Theme_REST_Test_Runner {
	public static $pass               = 0;
	public static $fail               = 0;
	public static $created_user_ids   = array();
	public static $created_theme_dirs = array();
	public static $original_stylesheet = null;

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

	/**
	 * Create a throwaway theme directory under the active theme root and
	 * register it for teardown. Pass null $style_css to omit style.css
	 * entirely (yields a `theme_no_stylesheet` / "broken" theme).
	 *
	 * @param string      $slug      Stylesheet slug.
	 * @param string|null $style_css style.css contents, or null to omit.
	 * @return string Absolute path to the created directory.
	 */
	public static function make_theme( $slug, $style_css ) {
		$dir = get_theme_root() . '/' . $slug;
		if ( ! is_dir( $dir ) ) {
			mkdir( $dir, 0755, true );
		}
		self::$created_theme_dirs[] = $dir;
		if ( null !== $style_css ) {
			file_put_contents( $dir . '/style.css', $style_css );
			file_put_contents( $dir . '/index.php', "<?php\n" );
		}
		return $dir;
	}

	public static function rmdir_recursive( $dir ) {
		if ( ! is_dir( $dir ) ) {
			return;
		}
		foreach ( scandir( $dir ) as $entry ) {
			if ( '.' === $entry || '..' === $entry ) {
				continue;
			}
			$path = $dir . '/' . $entry;
			if ( is_dir( $path ) ) {
				self::rmdir_recursive( $path );
			} else {
				unlink( $path );
			}
		}
		rmdir( $dir );
	}

	public static function cleanup() {
		// Restore the theme the install booted with before touching anything.
		if ( null !== self::$original_stylesheet ) {
			switch_theme( self::$original_stylesheet );
		}
		foreach ( self::$created_user_ids as $id ) {
			wp_delete_user( $id, 1 );
		}
		self::$created_user_ids = array();
		foreach ( self::$created_theme_dirs as $dir ) {
			self::rmdir_recursive( $dir );
		}
		self::$created_theme_dirs = array();
		wp_clean_themes_cache();
	}

	/**
	 * Dispatch POST /activate-theme with the given stylesheet (omitted when
	 * null) and return the response object.
	 *
	 * @param string|null $stylesheet Stylesheet param, or null to omit.
	 * @return WP_REST_Response
	 */
	public static function dispatch( $stylesheet ) {
		$req = new WP_REST_Request( 'POST', '/wp-admin-workspaces/v1/activate-theme' );
		if ( null !== $stylesheet ) {
			$req->set_param( 'stylesheet', $stylesheet );
		}
		return rest_do_request( $req );
	}
}

$T = 'WPAS_Activate_Theme_REST_Test_Runner';
register_shutdown_function( array( $T, 'cleanup' ) );

// Ensure the REST server is booted so `rest_api_init` has registered the route.
rest_get_server();

$admin_id      = $T::ensure_user( 'wpas_activate_theme_admin', 'administrator' );
$subscriber_id = $T::ensure_user( 'wpas_activate_theme_subscriber', 'subscriber' );

if ( null === $admin_id || null === $subscriber_id ) {
	echo "SKIP — could not provision admin + subscriber test users.\n";
	echo "TOTAL: 0 passed, 0 failed (skipped)\n";
	exit( 0 );
}

$T::$original_stylesheet = get_stylesheet();

// Pick a real, activatable theme for the 200 case — installed, intact,
// allowed, requirements-compatible, and not the currently-active one. Done
// before the throwaway fixtures exist so they can't be selected.
$valid_target = null;
foreach ( wp_get_themes() as $slug => $theme ) {
	if ( $slug === $T::$original_stylesheet ) {
		continue;
	}
	if ( ! $theme->exists() || $theme->errors() || ! $theme->is_allowed() ) {
		continue;
	}
	if ( is_wp_error( validate_theme_requirements( $slug ) ) ) {
		continue;
	}
	$valid_target = $slug;
	break;
}

// ── 1. Subscriber (lacks switch_themes) → 403 ─────────────────────────
wp_set_current_user( $subscriber_id );
$res = $T::dispatch( $valid_target ? $valid_target : 'twentytwentyfour' );
$T::assert_eq( 'subscriber → 403', $res->get_status(), 403 );
$T::assert_eq( 'subscriber → rest_forbidden', $res->get_data()['code'], 'rest_forbidden' );

// ── 2. Logged-out → 401 ───────────────────────────────────────────────
wp_set_current_user( 0 );
$res = $T::dispatch( $valid_target ? $valid_target : 'twentytwentyfour' );
$T::assert_eq( 'logged-out → 401', $res->get_status(), 401 );
$T::assert_eq( 'logged-out → rest_forbidden', $res->get_data()['code'], 'rest_forbidden' );

// All remaining cases run as the admin (has switch_themes).
wp_set_current_user( $admin_id );

// ── 3. Empty stylesheet → 400 rest_invalid_param ──────────────────────
$res = $T::dispatch( '' );
$T::assert_eq( 'empty stylesheet → 400', $res->get_status(), 400 );
$T::assert_eq( 'empty stylesheet → rest_invalid_param', $res->get_data()['code'], 'rest_invalid_param' );

// ── 4. Unknown / uninstalled stylesheet → 404 rest_theme_not_found ────
$res = $T::dispatch( 'wpas-no-such-theme-xyz' );
$T::assert_eq( 'unknown stylesheet → 404', $res->get_status(), 404 );
$T::assert_eq( 'unknown stylesheet → rest_theme_not_found', $res->get_data()['code'], 'rest_theme_not_found' );

// ── 5. Broken theme (no style.css) → 400 rest_theme_broken ────────────
// Directory present but no style.css ⇒ WP_Theme::errors() carries
// 'theme_no_stylesheet' while exists() stays true (only 'theme_not_found'
// flips exists()), so it lands on the broken-theme rung, not not-found.
$T::make_theme( 'wpas-activate-broken', null );
wp_clean_themes_cache();
$broken_theme = wp_get_theme( 'wpas-activate-broken' );
$T::assert_true( 'broken fixture exists()', $broken_theme->exists() );
$T::assert_true( 'broken fixture has errors()', $broken_theme->errors() instanceof WP_Error );
$res = $T::dispatch( 'wpas-activate-broken' );
$T::assert_eq( 'broken theme → 400', $res->get_status(), 400 );
$T::assert_eq( 'broken theme → rest_theme_broken', $res->get_data()['code'], 'rest_theme_broken' );

// ── 6. Intact-but-incompatible theme → 400 rest_theme_requirements ────
// Valid style.css (so errors() is empty) but an impossible WP requirement,
// which `validate_theme_requirements()` rejects — guarding the switch_theme()
// mid-REST wp_die() the endpoint pre-checks against.
$T::make_theme(
	'wpas-activate-incompatible',
	"/*\nTheme Name: WPAS Incompatible Theme\nRequires at least: 99.0\nVersion: 1.0\n*/\n"
);
wp_clean_themes_cache();
$incompat_theme = wp_get_theme( 'wpas-activate-incompatible' );
$T::assert_true( 'incompatible fixture exists()', $incompat_theme->exists() );
$T::assert_eq( 'incompatible fixture errors() empty', $incompat_theme->errors(), false );
$T::assert_true(
	'incompatible fixture fails validate_theme_requirements()',
	is_wp_error( validate_theme_requirements( 'wpas-activate-incompatible' ) )
);
$res = $T::dispatch( 'wpas-activate-incompatible' );
$T::assert_eq( 'incompatible theme → 400', $res->get_status(), 400 );
$T::assert_eq( 'incompatible theme → rest_theme_requirements', $res->get_data()['code'], 'rest_theme_requirements' );

// ── 7. Valid installed theme → 200 { stylesheet, name, active: true } ─
if ( null === $valid_target ) {
	echo "SKIP — no second activatable theme installed to exercise the 200 path.\n";
} else {
	$res  = $T::dispatch( $valid_target );
	$data = $res->get_data();
	$T::assert_eq( 'valid theme → 200', $res->get_status(), 200 );
	$T::assert_eq( 'valid theme → stylesheet echoed', isset( $data['stylesheet'] ) ? $data['stylesheet'] : null, $valid_target );
	$T::assert_eq( 'valid theme → active true', isset( $data['active'] ) ? $data['active'] : null, true );
	$T::assert_true( 'valid theme → name present', isset( $data['name'] ) && '' !== $data['name'] );
	$T::assert_eq( 'valid theme → actually switched', get_stylesheet(), $valid_target );
}

echo "\nTOTAL: " . $T::$pass . " passed, " . $T::$fail . " failed of " . ( $T::$pass + $T::$fail ) . "\n";
exit( $T::$fail > 0 ? 1 : 0 );
