<?php
/**
 * Workspace-as-primary-entry hijack.
 *
 * When a workspace is active (see wp_admin_shell_workspace_active()), the
 * shell takes over the admin root — `/wp-admin/`, `index.php`, and a bare
 * `admin.php` (no `?page`) — instead of living at a `?page=wp-admin-shell`
 * menu entry. The hijack runs at `admin_init` priority 0, before plugin
 * admin pages render. Classic wp-admin stays reachable via the endpoint
 * allowlist (RPC + install/update flows + plugin `?page=` URLs + network
 * admin) and the cap-gated classic-mode cookie (W3).
 *
 * The render path delegates to WordPress's own admin-header.php /
 * admin-footer.php so the standard `admin_enqueue_scripts` chain runs —
 * including the Gutenberg plugin's `wp-private-apis` override that every
 * `@wordpress/ui` overlay component depends on. wp_admin_shell_enqueue_
 * assets() is the gated callback that adds the shell bundle; its inline
 * CSS hides the surrounding admin chrome so the workspace fills the
 * viewport.
 *
 * Note: the render-and-exit path requires a real wp-admin request to
 * exercise (`is_admin()` is false under WP-CLI), so it is covered by the
 * manual smoke checklist rather than the automated suite. The decision
 * logic (allowlist, root-entry detection, gates) IS unit-tested.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Hijack {

	/**
	 * Admin entry scripts that must NEVER be hijacked — RPC endpoints,
	 * async upload, the install/update flows (separate nonce chains), the
	 * customizer, and the deprecated-but-still-routed bookmark targets.
	 * Matched against the `$pagenow` global. Extended via the
	 * `wp_admin_shell_hijack_allowlist` filter.
	 *
	 * @var string[]
	 */
	const ENDPOINT_ALLOWLIST = array(
		'admin-ajax.php',
		'admin-post.php',
		'async-upload.php',
		'media-upload.php',
		'update.php',
		'update-core.php',
		'plugin-install.php',
		'theme-install.php',
		'customize.php',
		'load-scripts.php',
		'load-styles.php',
		'press-this.php',
		'link-add.php',
	);

	/** @var bool|null Per-request memo of the active-request decision. */
	private static $is_active = null;

	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'maybe_hijack' ), 0 );
	}

	/**
	 * Whether THIS request is a workspace takeover. Memoized — both the
	 * hijack handler and the asset-enqueue gate read it.
	 *
	 * @return bool
	 */
	public static function is_active_request() {
		if ( self::$is_active !== null ) {
			return self::$is_active;
		}
		self::$is_active = self::compute();
		return self::$is_active;
	}

	/**
	 * Compute the takeover decision. Order matters — cheap context guards
	 * first, then the allowlist, then the escape-hatch cookie, then the
	 * workspace-active + capability gates, and finally the root-entry
	 * screen test.
	 *
	 * @return bool
	 */
	private static function compute() {
		// Non-page admin contexts run their own auth/nonce flows.
		if ( ! is_admin() ) {
			return false;
		}
		if ( ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() )
			|| ( defined( 'REST_REQUEST' ) && REST_REQUEST )
			|| ( defined( 'DOING_CRON' ) && DOING_CRON )
			|| ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST )
			|| ( defined( 'WP_CLI' ) && WP_CLI )
		) {
			return false;
		}
		// Allowlisted endpoints always fall through to classic.
		if ( self::is_allowlisted_endpoint() ) {
			return false;
		}
		// Explicit classic-mode escape hatch (W3).
		if ( ! empty( $_COOKIE['wp_admin_shell_classic'] ) ) {
			return false;
		}
		// Workspace must be active (override file present or explicit option).
		if ( ! function_exists( 'wp_admin_shell_workspace_active' ) || ! wp_admin_shell_workspace_active() ) {
			return false;
		}
		// Mirror the legacy entry's capability floor.
		if ( ! current_user_can( 'read' ) ) {
			return false;
		}
		// Only the admin-root entry points are taken over by the render
		// hijack. Other classic screens with a workspace equivalent are
		// handled by the classic→workspace redirect (W5); the rest stay
		// classic.
		return self::is_root_entry();
	}

	/**
	 * The bare admin-root entry points: the dashboard (`index.php`) and
	 * `admin.php` with no `?page` (plugin pages keep their `?page=` URL and
	 * stay classic).
	 *
	 * @return bool
	 */
	private static function is_root_entry() {
		$pagenow = isset( $GLOBALS['pagenow'] ) ? (string) $GLOBALS['pagenow'] : '';
		if ( 'index.php' === $pagenow ) {
			return true;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only routing decision, no state change.
		if ( 'admin.php' === $pagenow && empty( $_GET['page'] ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Whether the current `$pagenow` is on the never-hijack allowlist.
	 *
	 * @return bool
	 */
	private static function is_allowlisted_endpoint() {
		$pagenow = isset( $GLOBALS['pagenow'] ) ? (string) $GLOBALS['pagenow'] : '';

		/**
		 * Filter the endpoint allowlist — admin scripts that always fall
		 * through to classic wp-admin even when a workspace is active.
		 * Mirrors the `wp_admin_shell_classic_menu_core_slugs` pattern.
		 *
		 * @param string[] $allowlist Array of `$pagenow` values.
		 */
		$allowlist = apply_filters( 'wp_admin_shell_hijack_allowlist', self::ENDPOINT_ALLOWLIST );

		if ( in_array( $pagenow, (array) $allowlist, true ) ) {
			return true;
		}
		// Multisite network admin is always classic (alpha non-goal).
		if ( is_multisite() && is_network_admin() ) {
			return true;
		}
		return false;
	}

	/**
	 * Render the workspace and exit. Delegates head/footer + script
	 * printing to WordPress's admin chrome so the Gutenberg private-apis
	 * override and every `@wordpress/*` dependency register correctly.
	 */
	public static function maybe_hijack() {
		if ( ! self::is_active_request() ) {
			return;
		}

		// admin-header.php expects a title + screen context.
		if ( empty( $GLOBALS['title'] ) ) {
			$GLOBALS['title'] = __( 'Admin', 'wp-admin-shell' );
		}
		if ( empty( $GLOBALS['hook_suffix'] ) ) {
			$GLOBALS['hook_suffix'] = 'wp-admin-shell';
		}
		if ( function_exists( 'set_current_screen' ) ) {
			set_current_screen( 'wp-admin-shell' );
		}

		// admin_init (priority 0) fires BEFORE wp-admin/menu.php builds the
		// $menu / $submenu globals, but admin-header.php → menu-header.php
		// iterate them. Seed empties so the menu renders nothing (the shell
		// hides the chrome with CSS anyway) instead of tripping undefined-
		// global notices.
		if ( ! isset( $GLOBALS['menu'] ) ) {
			$GLOBALS['menu'] = array();
		}
		if ( ! isset( $GLOBALS['submenu'] ) ) {
			$GLOBALS['submenu'] = array();
		}

		require_once ABSPATH . 'wp-admin/admin-header.php';
		echo '<div id="wp-admin-shell"></div>';
		require_once ABSPATH . 'wp-admin/admin-footer.php';
		exit;
	}

	/**
	 * Reset the per-request memo. Test-only.
	 */
	public static function reset() {
		self::$is_active = null;
	}
}
