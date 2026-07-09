<?php
/**
 * Menu-renderer registry — plugin extension point (spec §13 #15).
 *
 * An engine declares which renderer it wants for the resolved `menu`
 * tree via the `menu-renderer` field in its `engine.json` (e.g.
 * `sidebar-drilldown`, `drawer`, or a plugin id `plugin:{slug}/{name}`).
 * The bundled renderers ship inside the workspace's JS bundle and register
 * themselves at module load. A third-party renderer can't do that — its
 * code lives in a separate plugin — so this registry is the server-side
 * half: a plugin declares its renderer id + the script handle that
 * registers the React component, and the workspace enqueues that script on
 * the admin-workspace page.
 *
 * The renderer's script must register the component against the kernel's
 * published surface:
 *
 *     window.wpAdminWorkspaces.kernel.registerMenuRenderer(
 *         'plugin:my/breadcrumb-menu',
 *         MyBreadcrumbMenu
 *     );
 *
 * `registerMenuRenderer` is mirrored onto `window.wpAdminWorkspaces.kernel` by the
 * kernel boot module. The component receives `{ items, currentPrimary,
 * navConfig }` and returns React.
 *
 * Renderer ids are global (an engine *names* a renderer; this registry
 * *supplies* it), so the registry keys on renderer id, not engine. Core
 * ids (`sidebar-drilldown`, `sidebar-tree`, `drawer`, `dock`, `none`) are
 * reserved — plugin ids must match `plugin:{slug}/{name}`.
 *
 * No cache-signal contribution: renderer registration enqueues a script
 * but does not alter the resolved workspace.json tree, so it can't stale the
 * resolver cache.
 *
 * NOTE (timing): the kernel mounts synchronously when its bundle runs, so
 * a renderer script that loads *after* the kernel bundle can miss the
 * first paint. Bundled + engine-owned renderers register via a direct
 * import and are race-free; the loose-script path here is best-effort
 * until the kernel ships a published import surface (tracked in
 * `docs/feedback.md`, kernel-import-surface gap).
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Menu_Renderers {

	/**
	 * Registry: renderer id → `{ script, style }`.
	 *
	 * @var array<string, array>
	 */
	private static $registry = array();

	/**
	 * Plugin renderer id pattern. Core ids are reserved and registered
	 * JS-side, never through this entry point.
	 */
	const ID_PATTERN = '#^plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$#';

	/**
	 * Register a plugin menu renderer.
	 *
	 * @param string $renderer_id Renderer id (`plugin:{slug}/{name}`).
	 * @param array  $args {
	 *     @type string      $script Registered script handle that calls
	 *                               `window.wpAdminWorkspaces.kernel.registerMenuRenderer`.
	 *                               Should declare `wp-admin-workspaces` as a
	 *                               dependency. Required.
	 *     @type string|null $style  Optional registered style handle to
	 *                               enqueue alongside the script.
	 * }
	 *
	 * @return string|WP_Error Renderer id on success, WP_Error on failure.
	 */
	public static function register( $renderer_id, $args ) {
		if ( ! is_string( $renderer_id ) || ! preg_match( self::ID_PATTERN, $renderer_id ) ) {
			$msg = "register_menu_renderer: invalid renderer id '$renderer_id' (expected plugin:{slug}/{name})";
			self::dev_warn( $msg );
			return new WP_Error( 'wp_admin_workspaces_invalid_menu_renderer_id', $msg );
		}
		if ( ! is_array( $args ) || empty( $args['script'] ) || ! is_string( $args['script'] ) ) {
			$msg = "register_menu_renderer: '$renderer_id' requires a non-empty 'script' handle";
			self::dev_warn( $msg );
			return new WP_Error( 'wp_admin_workspaces_invalid_menu_renderer_args', $msg );
		}
		if ( isset( self::$registry[ $renderer_id ] ) ) {
			$msg = "register_menu_renderer: duplicate id '$renderer_id' (first registration wins)";
			self::dev_warn( $msg );
			return new WP_Error( 'wp_admin_workspaces_duplicate_menu_renderer', $msg );
		}

		self::$registry[ $renderer_id ] = array(
			'script' => $args['script'],
			'style'  => ( isset( $args['style'] ) && is_string( $args['style'] ) ) ? $args['style'] : null,
		);
		return $renderer_id;
	}

	/**
	 * @return array<string, array> Map of renderer id → `{ script, style }`.
	 */
	public static function all() {
		return self::$registry;
	}

	/**
	 * Enqueue every registered renderer's script (+ optional style) on the
	 * admin-workspace page. Called from the workspace's `admin_enqueue_scripts`
	 * handler after the main `wp-admin-workspaces` bundle is enqueued, so a
	 * renderer script that declares `wp-admin-workspaces` as a dependency loads
	 * after the kernel boot module that publishes
	 * `window.wpAdminWorkspaces.kernel.registerMenuRenderer`.
	 *
	 * Only already-registered handles enqueue — a plugin is responsible
	 * for `wp_register_script()`-ing its handle before the workspace page
	 * renders.
	 */
	public static function enqueue_assets() {
		foreach ( self::$registry as $renderer ) {
			if ( wp_script_is( $renderer['script'], 'registered' ) ) {
				wp_enqueue_script( $renderer['script'] );
			}
			if ( ! empty( $renderer['style'] ) && wp_style_is( $renderer['style'], 'registered' ) ) {
				wp_enqueue_style( $renderer['style'] );
			}
		}
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$registry = array();
	}

	private static function dev_warn( $message ) {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			_doing_it_wrong( 'wp_admin_workspaces_register_menu_renderer', esc_html( $message ), '2.0.0' );
		}
	}
}
