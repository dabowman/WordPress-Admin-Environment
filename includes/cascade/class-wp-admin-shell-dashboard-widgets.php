<?php
/**
 * Dashboard-widgets registry (C4 — spec §13 #12).
 *
 * Plugins register a widget app for the dashboard grid via
 * `wp_admin_shell_register_dashboard_widget()`. The registry stores
 * per-id placement/sizing overrides and contributes them to the
 * cascade through the synthetic `plugin` origin so site/role/user
 * origins can extend or replace via the same admin.json
 * `dashboardWidgets` block.
 *
 * Schema: see `docs/schemas/admin-v2.json#/$defs/dashboardWidgetOverride`.
 *
 * Plugins don't need to use this API just to author a widget. The
 * grid host (`core:dashboard-host`) considers ANY registered app
 * whose `app.json` declares a `dashboardWidget` block to be a
 * candidate widget — the manifest is the eligibility check. This
 * function exists to:
 *
 *   1. Programmatically register a widget when the plugin can't
 *      ship an `app.json` (e.g. a mu-plugin contributing a widget
 *      without a full app manifest path).
 *   2. Override placement / size for an already-registered app
 *      without writing admin.json — useful for plugin authors that
 *      want to opt their app into the grid.
 *
 * For case (1), the function registers a synthetic app manifest
 * that nests the dashboardWidget block; for case (2) it adds an
 * entry to the cascade-contributed `dashboardWidgets` block keyed
 * by the existing app id.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Dashboard_Widgets {

	/**
	 * Per-widget override docs keyed by app id.
	 *
	 * @var array<string, array>
	 */
	private static $overrides = array();

	/**
	 * Synthetic app-manifest contributions: app id → manifest doc.
	 * Used when a plugin registers a widget without first registering
	 * an app via `wp_admin_shell_register_app()`. The registry
	 * synthesizes a minimal manifest carrying the dashboardWidget
	 * block + supplied app metadata so the host's eligibility check
	 * passes.
	 *
	 * @var array<string, array>
	 */
	private static $synthetic_manifests = array();

	/**
	 * Synthetic manifests queued for forwarding to the manifest
	 * registry. Drained by `flush_pending_registrations()`, called from
	 * the `init` priority-8 manifest-discovery pass (after the registry
	 * class is loaded) + lazily by `all()` as a safety net.
	 *
	 * @var array<string, array>
	 */
	private static $pending_registrations = array();

	/**
	 * Register a dashboard widget.
	 *
	 * Two flavors:
	 *
	 *   - **Override flavor.** `$args` carries placement/size only
	 *     (`position`, `defaultSize`, `minSize`, `title`, `hidden`).
	 *     The app must already be registered separately. The args
	 *     contribute to the `dashboardWidgets[id]` cascade entry.
	 *
	 *   - **Standalone flavor.** `$args` additionally carries `script`
	 *     (and optional `role`, `title`, `capabilities`,
	 *     `dashboardWidget`). The function registers a synthetic app
	 *     manifest so the host can mount the widget without a
	 *     separate `wp_admin_shell_register_app()` call.
	 *
	 * @param string $id   App id (namespaced — `core:` or `plugin:slug/name`).
	 * @param array  $args Configuration. See above.
	 * @return string|WP_Error App id on success, WP_Error on failure.
	 */
	public static function register( $id, $args = array() ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_invalid_id',
				__( 'Dashboard widget id must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( ! preg_match(
			'/^(core:[a-z][a-z0-9]*(-[a-z0-9]+)*|plugin:[a-z][a-z0-9-]*\/[a-z][a-z0-9]*(-[a-z0-9]+)*)$/',
			$id
		) ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_invalid_namespace',
				/* translators: %s: app id */
				sprintf( __( 'Dashboard widget id %s must be namespaced (core:* or plugin:slug/name).', 'wp-admin-shell' ), $id )
			);
		}
		if ( ! is_array( $args ) ) {
			$args = array();
		}

		// Merge top-level placement keys with nested dashboardWidget
		// block — one source of truth flows to both override + manifest.
		// Top-level keys win over nested when both supplied (admin.json-
		// style: most-recent declaration wins per-property).
		$inline_widget_block = isset( $args['dashboardWidget'] ) && is_array( $args['dashboardWidget'] )
			? $args['dashboardWidget']
			: array();
		$override = $inline_widget_block;
		foreach ( array( 'title', 'defaultSize', 'minSize', 'position', 'hidden' ) as $key ) {
			if ( array_key_exists( $key, $args ) ) {
				$override[ $key ] = $args[ $key ];
			}
		}
		if ( ! empty( $override ) ) {
			self::$overrides[ $id ] = $override;
		}

		// Standalone flavor: $args carries 'script' → synthesize a
		// manifest. The script handle is required for an app the kernel
		// can mount; without it, treat the call as override-only.
		if ( isset( $args['script'] ) && is_string( $args['script'] ) ) {
			$manifest = array(
				'id'      => $id,
				'version' => 1,
				'title'   => isset( $args['title'] ) && is_string( $args['title'] )
					? $args['title']
					: $id,
				'role'    => isset( $args['role'] ) && is_string( $args['role'] )
					? $args['role']
					: 'region',
				'script'  => $args['script'],
			);
			if ( isset( $args['capabilities'] ) && is_array( $args['capabilities'] ) ) {
				$manifest['capabilities'] = array_values( $args['capabilities'] );
			}
			if ( ! empty( $override ) ) {
				// Strip override-only fields when promoting to manifest.
				$manifest_widget = $override;
				unset( $manifest_widget['hidden'] );
				if ( ! empty( $manifest_widget ) ) {
					$manifest['dashboardWidget'] = $manifest_widget;
				}
			}
			self::$synthetic_manifests[ $id ] = $manifest;
			// Forward the manifest to the registry — but defer the
			// actual register_app() call until the manifest-registry
			// class is guaranteed loaded + the `init` priority-8
			// manifest-discovery pass has run. Calling synchronously
			// from a mu-plugin / early `plugins_loaded` would fatal on
			// `Class "WP_Admin_Shell_Manifest_Registry" not found`.
			// Mirrors the field-collections deferral pattern.
			self::$pending_registrations[ $id ] = $manifest;
		}

		return $id;
	}

	/**
	 * Flush queued synthetic-manifest registrations into the manifest
	 * registry. Idempotent — already-registered ids no-op via the
	 * registry's own duplicate-id rejection. Called from the
	 * `wp_admin_shell_manifests_loaded` hook (and lazily by `all()` as
	 * a safety net for code paths that observe the registry before
	 * `init` fires).
	 */
	public static function flush_pending_registrations() {
		if ( empty( self::$pending_registrations ) ) {
			return;
		}
		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return;
		}
		$registry = WP_Admin_Shell_Manifest_Registry::instance();
		foreach ( self::$pending_registrations as $id => $manifest ) {
			$registry->register_app( $manifest );
		}
		self::$pending_registrations = array();
	}

	/**
	 * Read every override doc.
	 *
	 * @return array<string, array>
	 */
	public static function all() {
		return self::$overrides;
	}

	/**
	 * Look up one override by id.
	 *
	 * @param string $id App id.
	 * @return array|null
	 */
	public static function get( $id ) {
		return self::$overrides[ $id ] ?? null;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$overrides             = array();
		self::$synthetic_manifests   = array();
		self::$pending_registrations = array();
	}
}

/**
 * Public API — spec §13 #12.
 *
 * @param string $id   App id.
 * @param array  $args Optional configuration. Recognized keys:
 *                     - `title`        (string) Override the widget title.
 *                     - `defaultSize`  (array)  `{ w, h }` cells.
 *                     - `minSize`      (array)  `{ w, h }` cells.
 *                     - `position`     (string|array) `'auto'` or `{ row, col }`.
 *                     - `hidden`       (bool)   Hide the widget on this install.
 *                     - `script`       (string) Triggers standalone flavor: synthesize an app manifest.
 *                     - `role`         (string) For standalone flavor — ARIA role (default `region`).
 *                     - `capabilities` (array)  For standalone flavor — required caps.
 *                     - `dashboardWidget` (array) For standalone flavor — manifest dashboardWidget block.
 * @return string|WP_Error
 */
function wp_admin_shell_register_dashboard_widget( $id, $args = array() ) {
	return WP_Admin_Shell_Dashboard_Widgets::register( $id, $args );
}

/**
 * Cascade contribution — registered overrides enter the resolver
 * through the `plugin` origin so site/role/user overrides can extend
 * or replace via admin.json's `dashboardWidgets` block. Priority 5
 * (same as field-collections) so plugin authors using
 * `add_filter('wp_admin_shell_data_plugin', …)` directly win.
 *
 * Per-id collision rule: an admin.json declaration for the same app id
 * wins entirely over the programmatic contribution. The contribution
 * fills the slot only when no inline declaration claims it.
 */
add_filter( 'wp_admin_shell_data_plugin', function ( $doc ) {
	// Lazy flush — if a plugin registered widgets before the `init`
	// pass below ran, drain the queue now so the cascade reflects them.
	WP_Admin_Shell_Dashboard_Widgets::flush_pending_registrations();

	$overrides = WP_Admin_Shell_Dashboard_Widgets::all();
	if ( empty( $overrides ) ) {
		return $doc;
	}
	if ( ! isset( $doc['dashboardWidgets'] ) || ! is_array( $doc['dashboardWidgets'] ) ) {
		$doc['dashboardWidgets'] = array();
	}
	foreach ( $overrides as $id => $override ) {
		if ( ! isset( $doc['dashboardWidgets'][ $id ] ) ) {
			$doc['dashboardWidgets'][ $id ] = $override;
		}
	}
	return $doc;
}, 5 );

/**
 * Flush queued synthetic-manifest registrations into the manifest
 * registry at the same priority the shell's main file uses for
 * convention-path manifest discovery (`init` priority 8). Plugin
 * authors hooking earlier than this fire safely because `register()`
 * only stashes the manifest — the registry call happens here.
 */
add_action( 'init', array( 'WP_Admin_Shell_Dashboard_Widgets', 'flush_pending_registrations' ), 7 );
