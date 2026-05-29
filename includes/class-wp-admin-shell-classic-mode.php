<?php
/**
 * Classic-mode escape hatch.
 *
 * Lets an administrator drop out of the workspace into classic wp-admin
 * for a browser session, and back again. Activation is a cap-gated query
 * toggle that sets a session cookie; the workspace hijack (W2) bails
 * whenever the cookie is present, so every classic page becomes reachable.
 *
 *   - `?classic=1` (cap: `read` — mirrors the hijack floor so every logged-in
 *     user has a way out, not just admins; nonce-protected) → set the
 *     `wp_admin_shell_classic` session cookie, strip the param, redirect. The
 *     next request carries the cookie, so the hijack stands down and classic
 *     renders.
 *   - `?classic=0` → clear the cookie, strip the param, redirect. The next
 *     request has no cookie, so the workspace takes over again. Lenient (no
 *     nonce required) so a user can never get trapped in classic.
 *   - The workspace admin bar gains a "Classic wp-admin" escape node; the
 *     classic admin bar gains the reciprocal "Back to workspace" node while
 *     the cookie is set (both only when a workspace is actually active).
 *
 * The toggle runs at `admin_init` priority -10, before the hijack at
 * priority 0, so the cookie is established and the redirect issued before
 * any render decision is made.
 *
 * Trade-offs (documented, accepted for alpha): the cookie is browser-wide
 * (all tabs follow on next navigation) and session-scoped (clears on
 * browser close). The cap gates ACTIVATION, not session continuation — a
 * mid-session cap revocation leaves the user in classic until the cookie
 * expires.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Classic_Mode {

	const COOKIE = 'wp_admin_shell_classic';

	/** Nonce action protecting the cookie-flip toggle. */
	const NONCE_ACTION = 'wp_admin_shell_classic';

	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'handle_toggle' ), -10 );
		add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar_node' ), 999 );
	}

	/**
	 * Process the `?classic=0|1` toggle. No-op when the param is absent.
	 */
	public static function handle_toggle() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- nonce verified below for the activation path; param presence is read-only routing.
		if ( ! isset( $_GET['classic'] ) ) {
			return;
		}
		// The toggle is a plain GET link from the workspace toolbar / classic
		// admin bar. Don't fire its cookie-set + redirect + exit on the
		// non-page contexts the hijack itself exempts (ajax / REST / cron /
		// xmlrpc / CLI) or on a non-GET request — a stray `?classic=` there
		// would short-circuit a request that was never meant to toggle.
		if ( ( function_exists( 'wp_doing_ajax' ) && wp_doing_ajax() )
			|| ( defined( 'REST_REQUEST' ) && REST_REQUEST )
			|| ( defined( 'DOING_CRON' ) && DOING_CRON )
			|| ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST )
			|| ( defined( 'WP_CLI' ) && WP_CLI )
		) {
			return;
		}
		$method = isset( $_SERVER['REQUEST_METHOD'] )
			? strtoupper( sanitize_text_field( wp_unslash( $_SERVER['REQUEST_METHOD'] ) ) )
			: 'GET';
		if ( 'GET' !== $method ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- value read for branching; the state-changing branch verifies the nonce.
		$value = sanitize_text_field( wp_unslash( $_GET['classic'] ) );

		if ( '1' === $value ) {
			// Activation flips a security-relevant gate (it disables the
			// workspace for the browser session), so it requires BOTH a valid
			// nonce and the `read` cap. The nonce closes the CSRF hole — a
			// nonce-less cross-site top-level navigation to `/wp-admin/
			// ?classic=1` (the SameSite=Lax auth cookie still rides along) is
			// now a no-op. The cap floor mirrors the hijack's `read` floor so
			// any logged-in user — not just admins — can escape a workspace
			// rendering bug. A failing check is silently ignored: the param is
			// stripped and the user stays in the workspace.
			$nonce = isset( $_GET['_wpnonce'] )
				? sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ) )
				: '';
			if ( wp_verify_nonce( $nonce, self::NONCE_ACTION ) && current_user_can( 'read' ) ) {
				self::set_cookie( true );
			}
		} elseif ( '0' === $value ) {
			// Returning to the workspace is the safe default — it re-enables
			// the hijack rather than disabling it — so it's intentionally
			// lenient (no nonce) to guarantee a user is never trapped in
			// classic by a stale/missing nonce.
			self::set_cookie( false );
		} else {
			return;
		}

		self::redirect_without_param();
	}

	/**
	 * Add the classic-mode toggle node to the admin bar.
	 *
	 *   - In the workspace (cookie not set) → a "Classic wp-admin" escape node
	 *     so every user down to the `read` floor has a documented way out of a
	 *     workspace rendering bug.
	 *   - In classic (cookie set) → the reciprocal "Back to workspace" node.
	 *
	 * Both only when a workspace is actually active to toggle against. No
	 * explicit cap check: the admin bar renders only for logged-in users, and
	 * the workspace itself requires `read` to render, so only readers ever see
	 * the node. Hrefs are nonce-protected (the toggle verifies the nonce on
	 * activation).
	 *
	 * @param WP_Admin_Bar $wp_admin_bar Admin bar instance.
	 */
	public static function admin_bar_node( $wp_admin_bar ) {
		if ( ! function_exists( 'wp_admin_shell_workspace_active' ) || ! wp_admin_shell_workspace_active() ) {
			return;
		}
		// Match the hijack's exact predicate (`'1' === …`) so a forged/garbage
		// truthy cookie (`=yes`) can't drift the two apart — the hijack would
		// still serve the workspace, so this must show the escape node, not the
		// "back" node.
		$in_classic = isset( $_COOKIE[ self::COOKIE ] ) && '1' === $_COOKIE[ self::COOKIE ];
		if ( $in_classic ) {
			$wp_admin_bar->add_node( array(
				'id'    => 'wp-admin-shell-back-to-workspace',
				'title' => __( '↩ Back to workspace', 'wp-admin-shell' ),
				'href'  => self::toggle_url( false ),
			) );
		} else {
			$wp_admin_bar->add_node( array(
				'id'    => 'wp-admin-shell-classic',
				'title' => __( 'Classic wp-admin', 'wp-admin-shell' ),
				'href'  => self::toggle_url( true ),
			) );
		}
	}

	/**
	 * Build a nonce-protected toggle URL.
	 *
	 * @param bool $on True → `?classic=1` (into classic); false → `?classic=0`.
	 * @return string
	 */
	private static function toggle_url( $on ) {
		return wp_nonce_url(
			add_query_arg( 'classic', $on ? '1' : '0', admin_url( '/' ) ),
			self::NONCE_ACTION
		);
	}

	/**
	 * Set or clear the session cookie. Also mutates $_COOKIE so a same-
	 * request reader (e.g. the hijack, if no redirect intervened) sees the
	 * new state.
	 *
	 * @param bool $on True → set; false → clear.
	 */
	private static function set_cookie( $on ) {
		$expire = $on ? 0 : ( time() - DAY_IN_SECONDS );
		// Scope to the install's real admin path — `ADMIN_COOKIE_PATH`
		// already encodes subdirectory / relocated / multisite-subdir
		// installs (`/blog/wp-admin/`). A hardcoded `/wp-admin/` would never
		// be sent on those, leaving the escape hatch permanently off.
		$args   = array(
			'expires'  => $expire,
			'path'     => defined( 'ADMIN_COOKIE_PATH' ) ? ADMIN_COOKIE_PATH : '/wp-admin/',
			'secure'   => is_ssl(),
			'httponly' => true,
			'samesite' => 'Lax',
		);
		if ( ! headers_sent() ) {
			setcookie( self::COOKIE, $on ? '1' : '', $args );
		}
		if ( $on ) {
			$_COOKIE[ self::COOKIE ] = '1';
		} else {
			unset( $_COOKIE[ self::COOKIE ] );
		}
	}

	/**
	 * Redirect to the current URL minus the `classic` param and exit.
	 */
	private static function redirect_without_param() {
		$target = remove_query_arg( 'classic' );
		if ( ! is_string( $target ) || '' === $target ) {
			$target = admin_url( '/' );
		}
		wp_safe_redirect( $target );
		exit;
	}
}
