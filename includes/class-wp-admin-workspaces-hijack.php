<?php
/**
 * Workspace-as-primary-entry hijack.
 *
 * When a workspace is active (see wp_admin_workspaces_is_active()), the
 * workspace takes over the admin root — `/wp-admin/`, `index.php`, and a bare
 * `admin.php` (no `?page`) — instead of living at a `?page=wp-admin-workspaces`
 * menu entry. The hijack runs at `admin_init` priority 0, before plugin
 * admin pages render. Classic wp-admin stays reachable via the endpoint
 * allowlist (RPC + install/update flows + plugin `?page=` URLs + network
 * admin) and the cap-gated classic-mode cookie (W3).
 *
 * The render path delegates to WordPress's own admin-header.php /
 * admin-footer.php so the standard `admin_enqueue_scripts` chain runs —
 * including the Gutenberg plugin's `wp-private-apis` override that every
 * `@wordpress/ui` overlay component depends on. wp_admin_workspaces_enqueue_
 * assets() is the gated callback that adds the workspace bundle; its inline
 * CSS hides the surrounding admin chrome so the workspace fills the
 * viewport.
 *
 * Note: the render-and-exit path requires a real wp-admin request to
 * exercise (`is_admin()` is false under WP-CLI), so it is covered by the
 * manual smoke checklist rather than the automated suite. The decision
 * logic (allowlist, root-entry detection, gates) IS unit-tested.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Hijack {

	/**
	 * Admin entry scripts that must NEVER be hijacked — RPC endpoints,
	 * async upload, the install/update flows (separate nonce chains), the
	 * customizer, and the deprecated-but-still-routed bookmark targets.
	 * Matched against the `$pagenow` global. Extended via the
	 * `wp_admin_workspaces_hijack_allowlist` filter.
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
		self::$is_active = self::passes_base_gates() && self::is_root_entry();
		return self::$is_active;
	}

	/**
	 * The shared takeover gates, minus the root-entry screen test. Order
	 * matters — cheap context guards first, then the allowlist, then the
	 * escape-hatch cookie, then the workspace-active + capability gates.
	 * The render hijack (W2) additionally requires {@see is_root_entry()};
	 * the classic→workspace redirect (W5) applies to non-root screens that
	 * clear these gates.
	 *
	 * @return bool
	 */
	private static function passes_base_gates() {
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
		// Hard runtime dep: without the Gutenberg plugin the @wordpress/ui
		// overlay components throw at module-load and the workspace renders blank.
		// Stand down so classic wp-admin stays reachable (the admin_notices
		// warning explains why) rather than taking over `/wp-admin/` into a
		// blank screen.
		if ( function_exists( 'wp_admin_workspaces_dependencies_met' )
			&& ! wp_admin_workspaces_dependencies_met() ) {
			return false;
		}
		// Allowlisted endpoints always fall through to classic.
		if ( self::is_allowlisted_endpoint() ) {
			return false;
		}
		// Iframe-mounted admin pages never get the workspace treatment —
		// the W5 redirect would 302 the iframe to `/wp-admin/#/…`, which
		// is a root entry → W2 renders the workspace INSIDE its own
		// iframe-fallback → that screen mounts the same classic page in
		// another iframe → infinite recursion. The chromeless-request
		// signal (`Sec-Fetch-Dest: iframe` OR the explicit
		// `?wp_admin_workspaces_chromeless=1` flag the bridge layer sets)
		// catches every same-origin iframe load.
		if ( function_exists( 'wp_admin_workspaces_is_chromeless_request' )
			&& wp_admin_workspaces_is_chromeless_request() ) {
			return false;
		}
		// Explicit classic-mode escape hatch (W3). Match the exact value the
		// toggle sets — a garbage / forged non-empty cookie shouldn't be able
		// to permanently disable the workspace for a browser.
		if ( isset( $_COOKIE['wp_admin_workspaces_classic'] ) && '1' === $_COOKIE['wp_admin_workspaces_classic'] ) {
			return false;
		}
		// Workspace must be active (override file present or explicit option).
		if ( ! function_exists( 'wp_admin_workspaces_is_active' ) || ! wp_admin_workspaces_is_active() ) {
			return false;
		}
		// Mirror the legacy entry's capability floor.
		if ( ! current_user_can( 'read' ) ) {
			return false;
		}
		return true;
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
		// Bare dashboard / admin.php only. A `page=` (plugin subpage, incl.
		// add_dashboard_page() → index.php?page=…) or `action=` (plugin
		// dispatch) request is not a root entry and must reach its own
		// handler.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only routing decision, no state change.
		if ( ! empty( $_GET['page'] ) || ! empty( $_GET['action'] ) ) {
			return false;
		}
		return 'index.php' === $pagenow || 'admin.php' === $pagenow;
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
		 * Mirrors the `wp_admin_workspaces_classic_menu_core_slugs` pattern.
		 *
		 * @param string[] $allowlist Array of `$pagenow` values.
		 */
		$allowlist = apply_filters( 'wp_admin_workspaces_hijack_allowlist', self::ENDPOINT_ALLOWLIST );

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
	 * admin_init priority-0 entry. Root entry points render the workspace;
	 * other classic screens that map to a workspace route redirect into it
	 * (W5); everything else falls through to classic.
	 */
	public static function maybe_hijack() {
		if ( ! self::passes_base_gates() ) {
			return;
		}
		if ( self::is_root_entry() ) {
			self::render_and_exit();
			return;
		}
		self::maybe_redirect_legacy();
	}

	/**
	 * Redirect a classic-screen navigation that has a workspace equivalent
	 * to the matching workspace route (`admin_url('/') . '#' . path`).
	 * GET-only — write endpoints (POST) are never redirected. The most
	 * specific legacy mapping (most satisfied `legacy_query` constraints)
	 * wins, so `edit.php?post_type=page` lands on `/pages`, not `/posts`.
	 */
	private static function maybe_redirect_legacy() {
		$method = isset( $_SERVER['REQUEST_METHOD'] )
			? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) )
			: 'GET';
		if ( 'GET' !== $method ) {
			return;
		}
		if ( ! function_exists( 'wp_admin_workspaces_get_active_config' ) || ! class_exists( 'WP_Admin_Workspaces_Admin_Routes' ) ) {
			return;
		}

		$pagenow = isset( $GLOBALS['pagenow'] ) ? (string) $GLOBALS['pagenow'] : '';
		if ( '' === $pagenow || 'index.php' === $pagenow ) {
			return;
		}
		// Plugin pages (`admin.php?page=…`) never carry a `legacy_path`, so
		// skip the full resolve + map build for them (and any `_wpnonce`'d
		// action) rather than building a map only to find no match.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only routing pre-check.
		if ( isset( $_GET['page'] ) || isset( $_GET['_wpnonce'] ) ) {
			return;
		}

		$map = WP_Admin_Workspaces_Admin_Routes::legacy_map( wp_admin_workspaces_get_active_config() );
		$hash = self::match_legacy_hash( $pagenow, $map );
		if ( null === $hash ) {
			return;
		}

		wp_safe_redirect( admin_url( '/' ) . '#' . $hash, 302 );
		exit;
	}

	/**
	 * Resolve the workspace route hash for a classic `$pagenow` + current
	 * `$_GET`, or null. Mirrors the JS interceptor's matchLegacyRoute:
	 * most-specific (most satisfied constraints) wins; route `{token}`s
	 * interpolate from `legacy_params` (or a same-named query key).
	 *
	 * @param string $pagenow Current classic script.
	 * @param array  $map     legacy_map() output.
	 * @return string|null Workspace route path (leading slash) or null.
	 */
	private static function match_legacy_hash( $pagenow, $map ) {
		// Never map a nonce-protected action (e.g.
		// `plugins.php?action=deactivate&_wpnonce=…`): redirecting would
		// drop `action`/`_wpnonce` and silently void the operation. Such
		// links must complete in classic.
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence check only; not verifying.
		if ( isset( $_GET['_wpnonce'] ) ) {
			return null;
		}
		$best       = null;
		$best_score = -1;
		foreach ( $map as $route_path => $entry ) {
			if ( ( $entry['legacy_path'] ?? '' ) !== $pagenow ) {
				continue;
			}
			$legacy_query = isset( $entry['legacy_query'] ) && is_array( $entry['legacy_query'] ) ? $entry['legacy_query'] : array();
			// An incidental, possibly state-changing `action` the entry
			// doesn't itself claim must not be dropped by a redirect — skip
			// entries that don't constrain `action` when the URL carries one.
			// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- presence check only.
			if ( isset( $_GET['action'] ) && ! array_key_exists( 'action', $legacy_query ) ) {
				continue;
			}
			$matches      = true;
			foreach ( $legacy_query as $key => $value ) {
				// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only GET routing match.
				$got = isset( $_GET[ $key ] ) ? sanitize_text_field( wp_unslash( $_GET[ $key ] ) ) : '';
				// WordPress convention: edit.php / post-new.php with no
				// `post_type` means `post_type=post`. Keeps a bare edit.php
				// matching the `post`-constrained baseline screen while a
				// CPT (`?post_type=product`) falls through to classic.
				// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only GET routing match.
				if ( 'post_type' === $key && ! isset( $_GET[ $key ] ) ) {
					$got = 'post';
				}
				if ( (string) $got !== (string) $value ) {
					$matches = false;
					break;
				}
			}
			if ( ! $matches ) {
				continue;
			}
			$score = count( $legacy_query );
			if ( $score <= $best_score ) {
				continue;
			}

			$params      = isset( $entry['legacy_params'] ) && is_array( $entry['legacy_params'] ) ? $entry['legacy_params'] : array();
			$interpolated = preg_replace_callback(
				'/\{(\w+)\}/',
				function ( $m ) use ( $params ) {
					$query_key = $params[ $m[1] ] ?? $m[1];
					// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only GET routing match.
					$value = isset( $_GET[ $query_key ] ) ? sanitize_text_field( wp_unslash( $_GET[ $query_key ] ) ) : null;
					return ( null !== $value && '' !== $value ) ? rawurlencode( $value ) : $m[0];
				},
				$route_path
			);

			// Skip entries whose tokens didn't resolve (stray `{...}`), that
			// collapse an empty segment (`/x//7`), or that point at the root
			// (would loop with the render hijack). Mirrors the JS matcher.
			if ( '' === $interpolated || '/' === $interpolated || false !== strpos( $interpolated, '{' ) || false !== strpos( $interpolated, '//' ) ) {
				continue;
			}
			$best       = $interpolated;
			$best_score = $score;
		}
		return $best;
	}

	/**
	 * Render the workspace and exit. Delegates head/footer + script
	 * printing to WordPress's admin chrome so the Gutenberg private-apis
	 * override and every `@wordpress/*` dependency register correctly.
	 */
	private static function render_and_exit() {
		// admin-header.php expects a title + screen context.
		if ( empty( $GLOBALS['title'] ) ) {
			$GLOBALS['title'] = __( 'Admin', 'wp-admin-workspaces' );
		}
		if ( empty( $GLOBALS['hook_suffix'] ) ) {
			$GLOBALS['hook_suffix'] = 'wp-admin-workspaces';
		}
		if ( function_exists( 'set_current_screen' ) ) {
			set_current_screen( 'wp-admin-workspaces' );
		}

		// admin_init (priority 0) fires BEFORE wp-admin/menu.php builds the
		// $menu / $submenu globals, but admin-header.php → menu-header.php
		// iterate them. Seed empties so the menu renders nothing (the workspace
		// hides the chrome with CSS anyway) instead of tripping undefined-
		// global notices.
		if ( ! isset( $GLOBALS['menu'] ) ) {
			$GLOBALS['menu'] = array();
		}
		if ( ! isset( $GLOBALS['submenu'] ) ) {
			$GLOBALS['submenu'] = array();
		}

		require_once ABSPATH . 'wp-admin/admin-header.php';
		echo '<div id="wp-admin-workspaces"></div>';
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
