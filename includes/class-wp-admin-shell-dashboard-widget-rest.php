<?php
/**
 * /wp-admin-shell/v1/dashboard-widget/{id} — captured classic-widget HTML.
 *
 * The render half of the classic dashboard-widget bridge (#134). The harvest
 * pass (`WP_Admin_Shell_Dashboard_Bridge`) folds un-ported plugin dashboard
 * widgets into the dashboard-host grid as tiles; each tile lazily fetches its
 * widget's rendered HTML from this endpoint.
 *
 * **Why lazy / per-widget.** Classic widget callbacks can be slow (remote
 * feeds, heavy queries). Buffering every widget eagerly into the page-load
 * config would block the whole dashboard on the slowest widget. Per-tile fetch
 * lets each tile resolve independently; the grid paints immediately and tiles
 * fill in.
 *
 * **What it does.** Re-runs `wp_dashboard_setup()` to populate
 * `$wp_meta_boxes['dashboard']`, locates the requested widget id's `callback`,
 * `ob_start`-captures its echoed HTML, and returns `{ id, title, html }`.
 *
 * **Permission floor.** `current_user_can( 'read' )` (the classic dashboard's
 * own view floor) AND the requested id must be a non-core widget the bridge
 * actually surfaces — `WP_Admin_Shell_Dashboard_Bridge::is_core_widget()`
 * rejects the shell-native ids, and an id absent from the harvested set 404s.
 * This is the real gate: a caller can only render a widget the dashboard
 * already registered for this request, never an arbitrary callback. Logged-out
 * → 401; unknown / core / removed id → 404; logged-in-but-`!read` → 403.
 *
 * **Trust.** Captured HTML is admin-context — identical to what classic
 * wp-admin echoes for the same widget. Rendered by the tile app via
 * `dangerouslySetInnerHTML`, same author-trust boundary as the #128 notices
 * buffer. Widgets relying on enqueued JS/AJAX degrade to static HTML in
 * captured form; the tile offers a per-tile iframe fallback to classic
 * `index.php` for full fidelity.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Dashboard_Widget_REST {

	const REST_NAMESPACE = 'wp-admin-shell/v1';

	/**
	 * Register the dashboard-widget route.
	 */
	public static function register() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/dashboard-widget/(?P<id>[A-Za-z0-9_.\-]+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_widget_html' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'id' => array(
							'type'     => 'string',
							'required' => true,
						),
					),
				),
			)
		);
	}

	/**
	 * Floor: a logged-in user who can `read` (the classic dashboard's own
	 * view capability). The per-widget existence + non-core check in the
	 * callback is the substantive gate.
	 *
	 * @return bool|WP_Error
	 */
	public static function permission_check() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_unauthorized',
				__( 'You must be logged in to view dashboard widgets.', 'wp-admin-shell' ),
				array( 'status' => 401 )
			);
		}
		if ( ! current_user_can( 'read' ) ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_forbidden',
				__( 'You are not allowed to view dashboard widgets.', 'wp-admin-shell' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * Capture the requested classic dashboard widget's HTML.
	 *
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function get_widget_html( $request ) {
		$id = (string) $request->get_param( 'id' );

		// A core widget id is shipped native by the shell — never render the
		// classic version. Treat as not-found so the tile (which only ever
		// asks for harvested plugin ids) gets a clean 404 if mis-wired.
		if ( $id === '' || WP_Admin_Shell_Dashboard_Bridge::is_core_widget( $id ) ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_not_found',
				__( 'Unknown dashboard widget.', 'wp-admin-shell' ),
				array( 'status' => 404 )
			);
		}

		$box = self::locate_widget( $id );
		if ( ! is_array( $box ) || ! isset( $box['callback'] ) || ! is_callable( $box['callback'] ) ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_not_found',
				__( 'Unknown dashboard widget.', 'wp-admin-shell' ),
				array( 'status' => 404 )
			);
		}

		$title = isset( $box['title'] ) ? trim( wp_strip_all_tags( (string) $box['title'] ) ) : $id;
		$args  = isset( $box['args'] ) ? $box['args'] : null;

		// Mirror wp-admin's meta-box dispatch: callback receives the screen
		// object + a callback-args array `{ id, title, args }`. Buffer the
		// echoed HTML.
		$callback_args = array(
			'id'    => $id,
			'title' => isset( $box['title'] ) ? $box['title'] : $title,
			'args'  => $args,
		);

		ob_start();
		try {
			call_user_func( $box['callback'], null, $callback_args );
		} catch ( \Throwable $e ) {
			// A misbehaving widget callback must not 500 the endpoint — drain
			// the buffer and surface an empty render. The tile shows its
			// error/empty state + the iframe fallback.
			ob_end_clean();
			return rest_ensure_response(
				array(
					'id'    => $id,
					'title' => $title,
					'html'  => '',
				)
			);
		}
		$html = ob_get_clean();
		$html = is_string( $html ) ? $html : '';

		return rest_ensure_response(
			array(
				'id'    => $id,
				'title' => $title,
				'html'  => $html,
			)
		);
	}

	/**
	 * Re-run dashboard setup and locate a widget's meta-box record by id
	 * across every dashboard context.
	 *
	 * @param string $id Meta-box id.
	 * @return array|null The meta-box record (`{ title, callback, args, ... }`)
	 *                    or null when not registered.
	 */
	private static function locate_widget( $id ) {
		if ( ! WP_Admin_Shell_Dashboard_Bridge::ensure_dashboard_setup() ) {
			return null;
		}

		global $wp_meta_boxes;
		if ( ! is_array( $wp_meta_boxes ) || ! isset( $wp_meta_boxes['dashboard'] ) || ! is_array( $wp_meta_boxes['dashboard'] ) ) {
			return null;
		}

		foreach ( $wp_meta_boxes['dashboard'] as $context_boxes ) {
			if ( ! is_array( $context_boxes ) ) {
				continue;
			}
			foreach ( $context_boxes as $boxes ) {
				if ( ! is_array( $boxes ) ) {
					continue;
				}
				if ( isset( $boxes[ $id ] ) && is_array( $boxes[ $id ] ) ) {
					return $boxes[ $id ];
				}
			}
		}

		return null;
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Dashboard_Widget_REST', 'register' ) );
