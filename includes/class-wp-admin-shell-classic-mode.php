<?php
/**
 * Classic-mode escape hatch.
 *
 * Lets an administrator drop out of the workspace into classic wp-admin
 * for a browser session, and back again. Activation is a cap-gated query
 * toggle that sets a session cookie; the workspace hijack (W2) bails
 * whenever the cookie is present, so every classic page becomes reachable.
 *
 *   - `?classic=1` (cap: `manage_options`) → set the `wp_admin_shell_
 *     classic` session cookie, strip the param, redirect. The next request
 *     carries the cookie, so the hijack stands down and classic renders.
 *   - `?classic=0` → clear the cookie, strip the param, redirect. The next
 *     request has no cookie, so the workspace takes over again.
 *   - Classic admin bar gains a "Back to workspace" node while the cookie
 *     is set (only when a workspace is actually active to return to).
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

	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'handle_toggle' ), -10 );
		add_action( 'admin_bar_menu', array( __CLASS__, 'admin_bar_node' ), 999 );
	}

	/**
	 * Process the `?classic=0|1` toggle. No-op when the param is absent.
	 */
	public static function handle_toggle() {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- idempotent per-session UI toggle, not a state-changing write; cap-gated below.
		if ( ! isset( $_GET['classic'] ) ) {
			return;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$value = sanitize_text_field( wp_unslash( $_GET['classic'] ) );

		if ( '1' === $value ) {
			// Activation is cap-gated. A user without the cap is simply
			// redirected back without a cookie, so they stay in the
			// workspace (the toggle is silently ignored).
			if ( current_user_can( 'manage_options' ) ) {
				self::set_cookie( true );
			}
		} elseif ( '0' === $value ) {
			// Anyone may return to the workspace.
			self::set_cookie( false );
		} else {
			return;
		}

		self::redirect_without_param();
	}

	/**
	 * Add the reciprocal "Back to workspace" node to the classic admin
	 * bar while the classic cookie is set and a workspace is active.
	 *
	 * @param WP_Admin_Bar $wp_admin_bar Admin bar instance.
	 */
	public static function admin_bar_node( $wp_admin_bar ) {
		if ( empty( $_COOKIE[ self::COOKIE ] ) ) {
			return;
		}
		if ( ! function_exists( 'wp_admin_shell_workspace_active' ) || ! wp_admin_shell_workspace_active() ) {
			return;
		}
		$wp_admin_bar->add_node( array(
			'id'    => 'wp-admin-shell-back-to-workspace',
			'title' => __( '↩ Back to workspace', 'wp-admin-shell' ),
			'href'  => add_query_arg( 'classic', '0', admin_url( '/' ) ),
		) );
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
		$args   = array(
			'expires'  => $expire,
			'path'     => '/wp-admin/',
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
