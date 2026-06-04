<?php
/**
 * Alpha routing / hijack test runner (W2 + W3 + W5 + W7).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-alpha-routing-tests.php`
 *
 * Covers the workspace-as-primary-entry decision logic:
 *   - is_root_entry(): which admin URLs the render hijack takes over
 *     (dashboard + bare admin.php; NOT `?page=` plugin pages or other
 *     classic screens).
 *   - is_allowlisted_endpoint(): the never-hijack list + the
 *     `wp_admin_workspaces_hijack_allowlist` extension filter + network admin.
 *   - is_active_request(): the context guard short-circuits under
 *     non-page contexts (including WP-CLI, where this runs).
 *
 * The render-and-exit path itself (admin-header.php → container →
 * admin-footer.php → exit) needs a real browser request — `is_admin()`
 * is false under WP-CLI — so it lives on the manual smoke checklist, not
 * here. The W3 classic-mode cookie flow + W5 classic→workspace redirect
 * + W7 allowlist matrix extend this file as those workstreams land.
 *
 * Class-scoped state because `wp eval-file` wraps the file in `eval()`.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Alpha_Routing_Runner {
	public static $pass = 0;
	public static $fail = 0;

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

	/** Set the routing globals the hijack reads. */
	public static function request( $pagenow, $page = null ) {
		$GLOBALS['pagenow'] = $pagenow;
		if ( null === $page ) {
			unset( $_GET['page'] );
		} else {
			$_GET['page'] = $page;
		}
		WP_Admin_Workspaces_Hijack::reset();
	}
}

$plugin_dir = WP_PLUGIN_DIR . '/WordPress-Admin-Environment/';
if ( ! file_exists( $plugin_dir . 'wp-admin-workspaces.php' ) ) {
	$plugin_dir = WP_PLUGIN_DIR . '/wp-admin-workspaces/';
}
require_once $plugin_dir . 'wp-admin-workspaces.php';

$user = get_user_by( 'login', 'admin' ) ?: get_user_by( 'id', 1 );
if ( $user ) {
	wp_set_current_user( $user->ID );
}

$T = 'WPAS_Alpha_Routing_Runner';

$ref          = new ReflectionClass( 'WP_Admin_Workspaces_Hijack' );
$is_root      = $ref->getMethod( 'is_root_entry' );
$is_allowed   = $ref->getMethod( 'is_allowlisted_endpoint' );
$is_root->setAccessible( true );
$is_allowed->setAccessible( true );

// ── is_root_entry(): the render-hijack targets ─────────────────────

echo "\n— is_root_entry —\n";

$T::request( 'index.php' );
$T::ok( 'dashboard (index.php) is a root entry', $is_root->invoke( null ) === true );

$T::request( 'admin.php' );
$T::ok( 'bare admin.php is a root entry', $is_root->invoke( null ) === true );

$T::request( 'admin.php', 'acme-thing' );
$T::ok( 'admin.php?page=acme-thing is NOT a root entry (plugin page)', $is_root->invoke( null ) === false );

$T::request( 'index.php', 'my-tool' );
$T::ok( 'index.php?page=my-tool is NOT a root entry (dashboard subpage)', $is_root->invoke( null ) === false );

$T::request( 'edit.php' );
$T::ok( 'edit.php is NOT a root entry (W5 redirect territory)', $is_root->invoke( null ) === false );

$T::request( 'upload.php' );
$T::ok( 'upload.php is NOT a root entry', $is_root->invoke( null ) === false );

// ── is_allowlisted_endpoint(): never-hijack list ───────────────────

echo "\n— is_allowlisted_endpoint —\n";

foreach ( array( 'admin-ajax.php', 'admin-post.php', 'async-upload.php', 'update.php', 'update-core.php', 'plugin-install.php', 'theme-install.php', 'customize.php', 'load-scripts.php', 'load-styles.php' ) as $slug ) {
	$T::request( $slug );
	$T::ok( "allowlisted: $slug", $is_allowed->invoke( null ) === true );
}

$T::request( 'index.php' );
$T::ok( 'index.php is NOT allowlisted', $is_allowed->invoke( null ) === false );

$T::request( 'edit.php' );
$T::ok( 'edit.php is NOT allowlisted', $is_allowed->invoke( null ) === false );

// Extension filter.
$extend = function ( $list ) {
	$list[] = 'edit.php';
	return $list;
};
add_filter( 'wp_admin_workspaces_hijack_allowlist', $extend );
$T::request( 'edit.php' );
$T::ok( 'wp_admin_workspaces_hijack_allowlist extends the list', $is_allowed->invoke( null ) === true );
remove_filter( 'wp_admin_workspaces_hijack_allowlist', $extend );
$T::request( 'edit.php' );
$T::ok( 'allowlist filter removal restores default', $is_allowed->invoke( null ) === false );

// ── is_active_request(): context guard ─────────────────────────────

echo "\n— is_active_request context guard —\n";

// Under WP-CLI is_admin() is false, so the takeover never fires here —
// this asserts the guard, not the positive path (which is manual-smoke).
$T::request( 'index.php' );
$T::ok( 'is_active_request false under non-admin (CLI) context', WP_Admin_Workspaces_Hijack::is_active_request() === false );

// ── W3: classic-mode cookie + admin bar ────────────────────────────

echo "\n— classic-mode cookie + admin bar —\n";

$cm  = new ReflectionClass( 'WP_Admin_Workspaces_Classic_Mode' );
$set = $cm->getMethod( 'set_cookie' );
$set->setAccessible( true );

unset( $_COOKIE['wp_admin_workspaces_classic'] );
$set->invoke( null, true );
$T::ok( 'set_cookie(true) marks $_COOKIE', ( $_COOKIE['wp_admin_workspaces_classic'] ?? '' ) === '1' );
$set->invoke( null, false );
$T::ok( 'set_cookie(false) clears $_COOKIE', ! isset( $_COOKIE['wp_admin_workspaces_classic'] ) );

// Stub admin bar — captures add_node() calls without needing WP_Admin_Bar.
$make_bar = function () {
	return new class() {
		public $nodes = array();
		public function add_node( $args ) {
			$this->nodes[ $args['id'] ] = $args;
		}
	};
};

// Drive workspace-active state through the override-path filter.
$GLOBALS['wpas_routing_override'] = '';
$path_filter = function () {
	return $GLOBALS['wpas_routing_override'] ? $GLOBALS['wpas_routing_override'] : '/__no_admin_json__';
};
add_filter( 'wp_admin_workspaces_admin_json_path', $path_filter );

$fix = $plugin_dir . 'tests/php/fixtures/alpha/';

// Cookie set + workspace active → node present.
$GLOBALS['wpas_routing_override'] = $fix . 'override-styles-only.json';
WP_Admin_Workspaces_Origin_File::reset_memo();
$_COOKIE['wp_admin_workspaces_classic'] = '1';
$bar = $make_bar();
WP_Admin_Workspaces_Classic_Mode::admin_bar_node( $bar );
$T::ok( 'Back-to-workspace node shown when cookie set + workspace active', isset( $bar->nodes['wp-admin-workspaces-back-to-workspace'] ) );

// Cookie absent → no back-to-workspace node, but the reciprocal "Classic
// wp-admin" escape node IS shown (workspace still active → there's something
// to escape from). The escape control mirrors the hijack's read floor.
unset( $_COOKIE['wp_admin_workspaces_classic'] );
$bar = $make_bar();
WP_Admin_Workspaces_Classic_Mode::admin_bar_node( $bar );
$T::ok( 'no back-to-workspace node when classic cookie absent', ! isset( $bar->nodes['wp-admin-workspaces-back-to-workspace'] ) );
$T::ok( 'classic-escape node shown in workspace (cookie absent + active)', isset( $bar->nodes['wp-admin-workspaces-classic'] ) );

// Garbage truthy cookie (`=yes`) must NOT count as classic — the hijack only
// stands down on exactly '1', so the bar must show the escape node, not "back".
$_COOKIE['wp_admin_workspaces_classic'] = 'yes';
$bar = $make_bar();
WP_Admin_Workspaces_Classic_Mode::admin_bar_node( $bar );
$T::ok( 'forged truthy cookie → escape node, not back-to-workspace', isset( $bar->nodes['wp-admin-workspaces-classic'] ) && ! isset( $bar->nodes['wp-admin-workspaces-back-to-workspace'] ) );
unset( $_COOKIE['wp_admin_workspaces_classic'] );

// Cookie set but workspace inactive (no file + no option) → no node.
$GLOBALS['wpas_routing_override'] = '';
WP_Admin_Workspaces_Origin_File::reset_memo();
$saved_shell = get_option( 'wp_admin_workspaces_active_shell', null );
$had_shell   = ( false !== get_option( 'wp_admin_workspaces_active_shell', false ) );
delete_option( 'wp_admin_workspaces_active_shell' );
$_COOKIE['wp_admin_workspaces_classic'] = '1';
$bar = $make_bar();
WP_Admin_Workspaces_Classic_Mode::admin_bar_node( $bar );
$T::ok( 'no node when workspace inactive', ! isset( $bar->nodes['wp-admin-workspaces-back-to-workspace'] ) );

// Restore option + cookie + filter state.
if ( $had_shell && is_string( $saved_shell ) ) {
	update_option( 'wp_admin_workspaces_active_shell', $saved_shell );
}
unset( $_COOKIE['wp_admin_workspaces_classic'] );
remove_filter( 'wp_admin_workspaces_admin_json_path', $path_filter );
WP_Admin_Workspaces_Origin_File::reset_memo();

// ── W5: classic→workspace legacy redirect mapping ──────────────────

echo "\n— legacy redirect mapping —\n";

$match_legacy = $ref->getMethod( 'match_legacy_hash' );
$match_legacy->setAccessible( true );

$map = array(
	'/posts'           => array( 'legacy_path' => 'edit.php', 'legacy_query' => array( 'post_type' => 'post' ) ),
	'/pages'           => array( 'legacy_path' => 'edit.php', 'legacy_query' => array( 'post_type' => 'page' ) ),
	'/posts/{id}/edit' => array( 'legacy_path' => 'post.php', 'legacy_query' => array( 'action' => 'edit' ), 'legacy_params' => array( 'id' => 'post' ) ),
);

$_GET = array( 'post_type' => 'page' );
$T::ok( 'edit.php?post_type=page → /pages', $match_legacy->invoke( null, 'edit.php', $map ) === '/pages' );

$_GET = array();
$T::ok( 'bare edit.php → /posts (WP default post_type=post)', $match_legacy->invoke( null, 'edit.php', $map ) === '/posts' );

$_GET = array( 'post_type' => 'product' );
$T::ok( 'CPT edit.php?post_type=product → null (falls through to classic)', $match_legacy->invoke( null, 'edit.php', $map ) === null );
$_GET = array();

$_GET = array( 'post' => '42', 'action' => 'edit' );
$T::ok( 'post.php?post=42&action=edit → /posts/42/edit', $match_legacy->invoke( null, 'post.php', $map ) === '/posts/42/edit' );

$_GET = array();
$T::ok( 'unmapped script → null', $match_legacy->invoke( null, 'upload.php', $map ) === null );

// Nonce-protected action is never mapped (would drop action/_wpnonce).
$_GET = array( '_wpnonce' => 'abc', 'post_type' => 'page' );
$T::ok( 'nonce-protected GET → null (stays classic)', $match_legacy->invoke( null, 'edit.php', $map ) === null );

// Unresolved token → null (no bogus /posts/{id}/edit route).
$_GET = array( 'action' => 'edit' );
$T::ok( 'post.php?action=edit with no post id → null', $match_legacy->invoke( null, 'post.php', $map ) === null );
$_GET = array();

// Baseline screens populate the legacy map.
$baseline = json_decode( file_get_contents( $plugin_dir . 'shells/wp-admin-default.json' ), true );
$lm       = WP_Admin_Workspaces_Admin_Routes::legacy_map( $baseline );
$T::ok( 'baseline maps /posts → edit.php', ( $lm['/posts']['legacy_path'] ?? '' ) === 'edit.php' );
$T::ok( 'baseline constrains /posts to post_type=post (CPTs fall through)', ( $lm['/posts']['legacy_query']['post_type'] ?? '' ) === 'post' );
$T::ok( 'baseline maps /pages with post_type=page', ( $lm['/pages']['legacy_query']['post_type'] ?? '' ) === 'page' );
$T::ok( 'baseline maps /media → upload.php', ( $lm['/media']['legacy_path'] ?? '' ) === 'upload.php' );
$T::ok( 'baseline does NOT map allowlisted plugin-install', ! isset( $lm['/plugins/new'] ) );

// ── Runtime private-API dependency gate (version-gated) ─────────────

echo "\n— private-API dependency gate —\n";

// WordPress 7.0+ ships the wp-private-apis allowlist (and @wordpress/theme)
// in core, so the Gutenberg plugin is no longer required. < 7.0 still needs
// it. The boundary is injectable for this assertion.
$T::ok( 'WP 6.7 does NOT supply private-apis in core', wp_admin_shell_core_supplies_private_apis( '6.7' ) === false );
$T::ok( 'WP 6.9 does NOT supply private-apis in core', wp_admin_shell_core_supplies_private_apis( '6.9' ) === false );
$T::ok( 'WP 6.9.2 (patch) still excluded', wp_admin_shell_core_supplies_private_apis( '6.9.2' ) === false );
$T::ok( 'WP 7.0 supplies private-apis in core', wp_admin_shell_core_supplies_private_apis( '7.0' ) === true );
$T::ok( 'WP 7.0.1 (patch) included', wp_admin_shell_core_supplies_private_apis( '7.0.1' ) === true );
$T::ok( 'WP 7.1 included', wp_admin_shell_core_supplies_private_apis( '7.1' ) === true );
// Conservative on pre-release builds: 7.0 betas/RCs sort below 7.0 final, so
// they fall back to the Gutenberg-plugin path (which still works there).
$T::ok( 'WP 7.0-beta1 falls below 7.0 final (Gutenberg fallback)', wp_admin_shell_core_supplies_private_apis( '7.0-beta1' ) === false );

// The default dev/CI container runs WP 7.0+ (.wp-env `core: null` = latest
// stable, and 7.0 is GA). Assert that directly — both that core supplies the
// allowlist AND that dependencies_met() is therefore satisfied without
// Gutenberg. This fails LOUDLY if CI ever resolves to < 7.0 (the scenario where
// removing Gutenberg from .wp-env.json would silently render the shell empty),
// turning the environment assumption into a guarded invariant rather than a
// no-op. To exercise the < 7.0 Gutenberg-fallback path, pin an older `core` and
// add `gutenberg` back per CLAUDE.md — that intentional deviation flips these.
$T::ok( 'dev/CI container supplies private-apis in core (WP >= 7.0)', wp_admin_shell_core_supplies_private_apis() === true );
$T::ok( 'dependencies_met true on a 7.0+ container without Gutenberg', wp_admin_shell_dependencies_met() === true );

// Composition contract, deterministic across all four signal combinations —
// exercises the Gutenberg-fallback branch a live 7.0 container short-circuits
// past. Either signal satisfies the gate; neither leaves it unmet.
$T::ok( 'met: core supplies + Gutenberg present', wp_admin_shell_dependencies_met_from( true, true ) === true );
$T::ok( 'met: core supplies, no Gutenberg (the 7.0 path)', wp_admin_shell_dependencies_met_from( true, false ) === true );
$T::ok( 'met: no core allowlist, Gutenberg present (the < 7.0 fallback)', wp_admin_shell_dependencies_met_from( false, true ) === true );
$T::ok( 'unmet: neither core allowlist nor Gutenberg', wp_admin_shell_dependencies_met_from( false, false ) === false );

// ── Summary ────────────────────────────────────────────────────────

echo "\n────────────────────────────\n";
echo 'PASS: ' . WPAS_Alpha_Routing_Runner::$pass . '  FAIL: ' . WPAS_Alpha_Routing_Runner::$fail . "\n";
echo ( WPAS_Alpha_Routing_Runner::$fail > 0 ? "RESULT: FAIL\n" : "RESULT: PASS\n" );

exit( WPAS_Alpha_Routing_Runner::$fail > 0 ? 1 : 0 );
