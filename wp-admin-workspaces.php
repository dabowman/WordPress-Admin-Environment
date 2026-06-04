<?php
/**
 * Plugin Name: WP Admin Workspaces
 * Plugin URI: https://github.com/dabowman/WordPress-Admin-Environment
 * Description: A configurable, React-based WordPress admin environment driven by admin.json configuration files.
 * Version: 0.1.0
 * Requires PHP: 7.4
 * Requires at least: 6.7
 * Author: WP Admin Workspaces Contributors
 * Author URI: https://github.com/dabowman/WordPress-Admin-Environment
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: wp-admin-workspaces
 * Domain Path: /languages
 */

defined( 'ABSPATH' ) || exit;

// Runtime private-API dependency. `@wordpress/ui` overlay components
// transitively import `@wordpress/theme`, which calls
// __dangerousOptInToUnstableAPIsOnlyForCoreModules against the runtime
// wp.privateApis. That opt-in only succeeds if the module name is on the
// allowlist baked into the loaded `wp-private-apis` script.
//
// - WordPress < 7.0: core's allowlist EXCLUDES @wordpress/theme /
//   @wordpress/ui / @wordpress/dataviews. Only the Gutenberg plugin's
//   wp-private-apis override whitelists them, so Gutenberg is required —
//   without it every overlay component throws at module-load and the
//   workspace renders empty.
// - WordPress >= 7.0: core bundles @wordpress/theme AND ships a
//   wp-private-apis allowlist that includes @wordpress/theme,
//   @wordpress/ui and @wordpress/dataviews (verified against the 7.0
//   release — wp-includes/js/dist/private-apis.js
//   CORE_MODULES_USING_PRIVATE_APIS). The opt-in consent string is
//   unchanged, so the workspace's bundled overlay components unlock against
//   core's own wp.privateApis and Gutenberg is no longer required.
//
// Surface a clear notice when neither path is satisfied instead of
// letting the workspace render blank.
/**
 * Whether the WordPress version supplies the private-API allowlist the workspace
 * needs in core (i.e. the Gutenberg plugin is no longer required).
 *
 * @param string|null $version WordPress version to test. Defaults to the
 *                             running install's version. Injectable for tests.
 * @return bool True on WordPress 7.0+.
 */
function wp_admin_workspaces_core_supplies_private_apis( $version = null ) {
	if ( null === $version ) {
		$version = get_bloginfo( 'version' );
	}
	return version_compare( $version, '7.0', '>=' );
}

/**
 * Whether the workspace's runtime private-API dependency is satisfied.
 *
 * Met when either WordPress core supplies the allowlist (7.0+) or the
 * Gutenberg plugin is active (its `wp-private-apis` override whitelists the
 * modules on older WordPress). Gutenberg presence is detected via the runtime
 * `GUTENBERG_VERSION` constant plus the plugin (option) layer.
 *
 * @return bool
 */
function wp_admin_workspaces_dependencies_met() {
	if ( ! function_exists( 'is_plugin_active' ) ) {
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
	}
	$gutenberg_present =
		defined( 'GUTENBERG_VERSION' ) ||
		is_plugin_active( 'gutenberg/gutenberg.php' );
	return wp_admin_workspaces_dependencies_met_from(
		wp_admin_workspaces_core_supplies_private_apis(),
		$gutenberg_present
	);
}

/**
 * Pure composition of the dependency gate — the OR contract over its two
 * signals, factored out so every branch (including the Gutenberg fallback,
 * which a live 7.0 container never reaches) is deterministically testable
 * without defining `GUTENBERG_VERSION` or depending on the running WP version.
 *
 * @param bool $core_supplies     Whether core supplies the private-API allowlist (WP 7.0+).
 * @param bool $gutenberg_present Whether the Gutenberg plugin is active.
 * @return bool Whether the dependency is satisfied.
 */
function wp_admin_workspaces_dependencies_met_from( $core_supplies, $gutenberg_present ) {
	return (bool) ( $core_supplies || $gutenberg_present );
}

add_action( 'admin_notices', function () {
	if ( ! wp_admin_workspaces_dependencies_met() ) {
		echo '<div class="notice notice-error"><p>';
		echo esc_html__( 'WP Admin Workspaces requires either WordPress 7.0+ or the Gutenberg plugin. The workspace uses @wordpress/ui components that depend on private APIs; WordPress 7.0 ships those in core, while earlier versions need the Gutenberg plugin to whitelist them. The workspace has stood down — classic wp-admin is being served until one of those is available.', 'wp-admin-workspaces' );
		echo '</p></div>';
	}
} );

// Single source of truth for the plugin version — keep in sync with the
// `Version:` header above and `package.json`. Used for asset cache-busting
// fallbacks and surfaced to support/debug tooling.
define( 'WP_ADMIN_WORKSPACES_VERSION', '0.1.0' );
define( 'WP_ADMIN_WORKSPACES_PATH', plugin_dir_path( __FILE__ ) );
define( 'WP_ADMIN_WORKSPACES_URL', plugin_dir_url( __FILE__ ) );
define( 'WP_ADMIN_WORKSPACES_DB_VERSION', 2 );

/**
 * Version-stamped migration. Plan §M2.9 + issue #6.
 *
 * The `wp_admin_workspaces_db_version` option stamps the highest migration
 * step that has run for this install. Each step runs at most once per
 * install lifetime; reactivation / downgrade-then-upgrade cycles
 * cannot re-fire steps that already completed (which would otherwise
 * clobber a user's later choice with the legacy MVP value).
 *
 * Step 1: copy the pre-MVP `wp_admin_shell_active_config` legacy option
 *         into the MVP `wp_admin_shell_active_shell` key when the latter
 *         is empty (faithful to the original pre-rebrand chain; reads the
 *         real on-disk legacy key names, which a code rename can never
 *         touch).
 *
 * Step 2: the 0.1.0 "workspaces" rebrand renamed every persisted option
 *         from `wp_admin_shell_*` to `wp_admin_workspaces_*`. Stored
 *         option names are not subject to a code rename, so copy each
 *         legacy key forward to its new name when the new key is absent
 *         (idempotent). Without this, an upgraded install silently loses
 *         its active-workspace selection AND its enable toggle — the
 *         latter would re-enable a deliberately-disabled admin takeover.
 *         The legacy `wp_admin_shell_*` rows are left in place (uninstall
 *         sweeps both namespaces); the bridge only seeds the new keys.
 *
 * If a future migration is needed (e.g. a v0 → v1 schema rewrite on
 * disk), bump WP_ADMIN_WORKSPACES_DB_VERSION and add a step here. Steps
 * must be idempotent w.r.t. their own stamp — running twice is a bug,
 * but a partially-failed migration that re-runs from a lower stamp
 * should converge.
 */
add_action( 'init', function () {
	$current_version = (int) get_option( 'wp_admin_workspaces_db_version', 0 );
	if ( $current_version >= WP_ADMIN_WORKSPACES_DB_VERSION ) {
		return;
	}

	if ( $current_version < 1 ) {
		// Step 1 — pre-MVP active-config → MVP active-workspace write-copy.
		if ( get_option( 'wp_admin_shell_active_shell', '' ) === '' ) {
			$legacy = get_option( 'wp_admin_shell_active_config', '' );
			if ( $legacy !== '' ) {
				update_option( 'wp_admin_shell_active_shell', $legacy );
			}
		}
	}

	if ( $current_version < 2 ) {
		// Step 2 — wp_admin_shell_* → wp_admin_workspaces_* option bridge.
		$option_map = array(
			'wp_admin_shell_active_shell'      => 'wp_admin_workspaces_active_workspace',
			'wp_admin_shell_workspace_enabled' => 'wp_admin_workspaces_enabled',
			'wp_admin_shell_settings'          => 'wp_admin_workspaces_settings',
			'wp_admin_shell_site_config'       => 'wp_admin_workspaces_site_config',
			'wp_admin_shell_role_config'       => 'wp_admin_workspaces_role_config',
		);
		$sentinel = '__wpaw_absent__';
		foreach ( $option_map as $old_key => $new_key ) {
			$old_val = get_option( $old_key, $sentinel );
			if ( $sentinel !== $old_val && $sentinel === get_option( $new_key, $sentinel ) ) {
				update_option( $new_key, $old_val );
			}
		}

		// User-prefs meta: rename the meta_key for every user that hasn't
		// already got the new key (guarded so a partial re-run is safe).
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- one-time keyed migration; no caching applies.
		$wpdb->query(
			$wpdb->prepare(
				"UPDATE {$wpdb->usermeta} m
				 SET m.meta_key = %s
				 WHERE m.meta_key = %s
				   AND NOT EXISTS (
				       SELECT 1 FROM ( SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s ) e
				       WHERE e.user_id = m.user_id
				   )",
				'wp_admin_workspaces_user_prefs',
				'wp_admin_shell_user_prefs',
				'wp_admin_workspaces_user_prefs'
			)
		);
	}

	update_option( 'wp_admin_workspaces_db_version', WP_ADMIN_WORKSPACES_DB_VERSION );
}, 5 );

require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-can-rest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-prefs-rest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-themes-rest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-merge.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-customizable.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-cache.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-config-validator.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/origins/class-wp-admin-workspaces-origin-core.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/origins/class-wp-admin-workspaces-origin-file.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-resolver.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-data-field-collections.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-data-view-config.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-dashboard-widgets.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-dashboard-bridge.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-preload.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-menu-items.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-appearance-menu.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-admin-routes.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-classic-menu-bridge.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-chrome-harvest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-modes.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/cascade/class-wp-admin-workspaces-permissions.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-config.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-data-view-rest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-dashboard-widget-rest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-data-field-collections-rest.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-cli.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/manifests/class-wp-admin-workspaces-manifest-validator.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/manifests/class-wp-admin-workspaces-manifest-registry.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/manifests/class-wp-admin-workspaces-manifest-resolver.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/manifests/class-wp-admin-workspaces-menu-renderers.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/tokens/class-wp-admin-workspaces-tokens.php';
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-registry.php';

// Engine-specific PHP — each engine that needs server hooks ships
// under `includes/engines/<engine-id>/`. Bootstrap files load
// unconditionally; their handlers gate themselves on the active engine
// or per-request signals (`core:desktop` only hooks the chromeless
// bridge when the request carries `wp_admin_workspaces_chromeless=1`).
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/engines/core-desktop/bootstrap.php';

/**
 * V2.M1 — Public manifest registration API.
 *
 * Plugins call these to register an `app.json` or `engine.json`
 * manifest, either as an associative array or by absolute path. The
 * convention path (`apps/{name}/app.json`, `engines/{name}/engine.json`
 * under the plugin root) is auto-scanned on `init` priority 8 — most
 * plugins don't need to call these directly.
 *
 * @return string|WP_Error Manifest id on success, WP_Error on failure.
 */
function wp_admin_workspaces_register_app( $manifest_or_path ) {
	return WP_Admin_Workspaces_Manifest_Registry::instance()->register_app( $manifest_or_path );
}

function wp_admin_workspaces_register_engine( $manifest_or_path ) {
	return WP_Admin_Workspaces_Manifest_Registry::instance()->register_engine( $manifest_or_path );
}

/**
 * Register a region template against an existing engine. Plugin
 * extension point per spec §13 #4 — adds a `templates[$template_id]`
 * entry to the engine's manifest at runtime so admin.json regions can
 * reference it via `template`. The engine must already be registered.
 *
 * @param string $engine_id  Engine id to extend.
 * @param string $template_id Template id (use `plugin:{slug}/{name}`).
 * @param array  $template   Template body; must declare at least `role`.
 *
 * @return string|WP_Error template id on success, WP_Error on failure.
 */
function wp_admin_workspaces_register_template( $engine_id, $template_id, $template ) {
	return WP_Admin_Workspaces_Manifest_Registry::instance()->register_template(
		$engine_id,
		$template_id,
		$template
	);
}

/**
 * Register a plugin menu renderer (spec §13 #15).
 *
 * An engine names a renderer through its `engine.json` `menu-renderer`
 * field; a `plugin:{slug}/{name}` id resolves to a React component a
 * plugin supplies. This declares the id + the script handle that
 * registers that component (`window.wpAdminWorkspaces.registerMenuRenderer`).
 * The workspace enqueues the script on the admin-workspace page.
 *
 * The renderer component receives `{ items, currentPrimary, navConfig }`
 * — the host-pruned menu tree, the active URL primary path, and the
 * per-region nav config — and returns React.
 *
 * Timing: register the script handle (`wp_register_script`, with
 * `wp-admin-workspaces` as a dependency) before the workspace page renders, then
 * call this from `admin_enqueue_scripts` or earlier.
 *
 * @param string $renderer_id Renderer id (`plugin:{slug}/{name}`).
 * @param array  $args        See `WP_Admin_Workspaces_Menu_Renderers::register`.
 * @return string|WP_Error Renderer id on success, WP_Error on failure.
 */
function wp_admin_workspaces_register_menu_renderer( $renderer_id, $args ) {
	return WP_Admin_Workspaces_Menu_Renderers::register( $renderer_id, $args );
}

/**
 * Register a complete workspace programmatically (spec §13 #6). Use when
 * a workspace's shape is computed at runtime (per role, per feature flag,
 * etc.) rather than stored on disk under `workspaces/`.
 *
 * The registered workspace participates in the same cascade as file
 * workspaces: site/role/user origins still merge on top.
 *
 * @param string $slug      Unique slug.
 * @param array  $admin_json Full admin.json document.
 *
 * @return string|WP_Error slug on success, WP_Error on failure.
 */
function wp_admin_workspaces_register_workspace( $slug, $admin_json ) {
	return WP_Admin_Workspaces_Registry::register( $slug, $admin_json );
}

/**
 * Register a nav menu item — CIAB compatibility shim (spec §13 #10).
 *
 * Mechanical port of CIAB's `next_admin_register_menu_item()`. Plugins
 * that previously called `next_admin_register_menu_item()` rename to
 * `wp_admin_workspaces_register_menu_item()` and drop their inline
 * `current_user_can()` gates — the `capability` arg flows through the
 * workspace's 4-layer cap model. CIAB args (`to`, `label`, `icon`, `badge`,
 * `parent`, `parent_type`, `position`) carry over 1:1; the workspace adds
 * an optional `region` arg (defaults to the first `core:navigation`
 * region in the resolved tree).
 *
 * Timing: call from `init` priority 9 or earlier (`plugins_loaded` is
 * fine). The cascade resolver's first run on the page render or first
 * REST hit triggers `wp_admin_workspaces_data_plugin` and memoizes the
 * resolved tree through `WP_Admin_Workspaces_Cache`. Registrations made
 * after the resolver's first run miss the current request entirely.
 *
 * Cross-request invalidation: the registry serializes its current
 * state into the cache key via the `wp_admin_workspaces_cache_signals`
 * filter, so a registration delta between page loads (e.g. plugin
 * toggles a feature flag that changes which items it registers)
 * automatically picks a different cache bucket on the next hit. No
 * explicit `flush()` needed for deterministic registrations.
 *
 * @param string $id   Menu-item id (must be unique within the registry).
 * @param array  $args Args. See `WP_Admin_Workspaces_Menu_Items::register`.
 * @return string|WP_Error Id on success, WP_Error on failure.
 */
function wp_admin_workspaces_register_menu_item( $id, $args ) {
	return WP_Admin_Workspaces_Menu_Items::register( $id, $args );
}

/**
 * Register an admin route — CIAB compatibility shim (spec §13 #11).
 *
 * Mechanical port of CIAB's `next_admin_register_admin_route()`. The
 * arg signature collapses CIAB's positional
 * (`$path, $content_module, $route_module, $before_load, $static_data, $gc_time`)
 * into `($path, [ 'app' => …, 'config' => […], 'static_data' => […], 'gc_time' => … ])`.
 * `app` replaces `content_module`, `static_data` is folded into `config`
 * for forward compatibility (explicit `config` keys win on collision),
 * and `gc_time` is accepted but ignored (TanStack-specific cache GC,
 * no workspace equivalent — emits a one-time `WP_DEBUG` notice).
 *
 * Timing: same as `wp_admin_workspaces_register_menu_item()` — call from
 * `init` priority 9 or earlier so the cascade resolver picks the route
 * up on its first memoized run. Cross-request cache invalidation also
 * works the same way: the registry's serialized state contributes to
 * the resolver cache key via the `wp_admin_workspaces_cache_signals` filter.
 *
 * @param string $path Route path (`/posts`, `/posts/{id}`, `/media/*`).
 * @param array  $args Args. See `WP_Admin_Workspaces_Admin_Routes::register`.
 * @return string|WP_Error Path on success, WP_Error on failure.
 */
function wp_admin_workspaces_register_route( $path, $args ) {
	return WP_Admin_Workspaces_Admin_Routes::register( $path, $args );
}

/**
 * Manifest registration on init.
 *
 * Two phases at priority 8 (before main workspace init at 10) so manifests
 * are available when the kernel's inline-script handoff is composed:
 *
 *  1. Workspace-bundled core manifests — registered explicitly. App
 *     manifests live under `src/apps/<name>/app.json`, engine
 *     manifests under `src/runtime/engines/<name>/engine.json` —
 *     co-located with their JS source rather than at the convention
 *     plugin-root path. They're framework defaults, not pluggable.
 *
 *  2. Plugin-contributed manifests — auto-discovered at the convention
 *     path `<plugin>/apps/<name>/app.json` and
 *     `<plugin>/engines/<name>/engine.json`. Plugins can also extend
 *     discovery by adding paths via the
 *     `wp_admin_workspaces_manifest_discovery_paths` filter (useful for
 *     plugins that ship manifests at a non-standard location).
 */
add_action( 'init', function () {
	$registry = WP_Admin_Workspaces_Manifest_Registry::instance();

	// 1. Workspace-bundled core manifests. Co-located with their JS source
	// rather than at the plugin-root convention path. `discover()`
	// scans `<base>/apps/<name>/app.json` + `<base>/engines/<name>/engine.json`;
	// `src/` covers all bundled apps, `src/runtime/` covers the engines
	// (still co-located with their layout JS).
	$registry->discover( WP_ADMIN_WORKSPACES_PATH . 'src/' );
	$registry->discover( WP_ADMIN_WORKSPACES_PATH . 'src/runtime/' );

	// 2. Convention-path discovery for the workspace plugin itself + plugins
	// extending the discovery surface.
	$registry->discover( WP_ADMIN_WORKSPACES_PATH );

	$additional = apply_filters( 'wp_admin_workspaces_manifest_discovery_paths', array() );
	foreach ( (array) $additional as $path ) {
		if ( is_string( $path ) ) {
			$registry->discover( $path );
		}
	}
}, 8 );

// Workspace-as-primary-entry hijack. When a workspace is active (see
// wp_admin_workspaces_is_active()), the workspace takes over the admin
// root (`/wp-admin/`, `index.php`, bare `admin.php`) at admin_init
// priority 0 — there is no longer a `?page=wp-admin-workspaces` menu entry.
// Classic stays reachable via the allowlist + the classic-mode cookie.
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-hijack.php';
WP_Admin_Workspaces_Hijack::init();

// Classic-mode escape hatch — cap-gated `?classic=1` cookie toggle that
// lets an admin drop into classic wp-admin (and back). Runs at admin_init
// priority -10, before the hijack.
require_once WP_ADMIN_WORKSPACES_PATH . 'includes/class-wp-admin-workspaces-classic-mode.php';
WP_Admin_Workspaces_Classic_Mode::init();

/**
 * Register a classic-wp-admin Settings page (Settings → WP Admin Workspaces)
 * that mirrors the workspace's `core:settings-workspace` screen. Without
 * this, a user who toggles the workspace off would have no UI to turn it
 * back on — they'd be stuck in classic with no entry point.
 *
 * Hooks `admin_menu`, which fires on non-root admin requests (the hijack
 * exits before this on root entries when the workspace is active, so it's
 * effectively classic-only).
 */
add_action( 'admin_menu', function () {
	add_options_page(
		__( 'WP Admin Workspaces', 'wp-admin-workspaces' ),
		__( 'WP Admin Workspaces', 'wp-admin-workspaces' ),
		'manage_options',
		'wp-admin-workspaces-workspace',
		'wp_admin_workspaces_render_workspace_settings_page'
	);
} );

/**
 * Classic-side render callback for the workspace toggle. The form posts
 * to options.php with the `wp_admin_workspaces_settings` group, which is the
 * same group `register_setting` uses below — the option goes through the
 * registered `rest_sanitize_boolean` callback either way.
 *
 * The hidden 0-value field paired with the checkbox is the standard WP
 * pattern for capturing an unchecked checkbox (browsers omit unchecked
 * checkboxes from form submission); options.php picks the last value
 * sent, so checked → 1, unchecked → 0.
 */
function wp_admin_workspaces_render_workspace_settings_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$enabled = (bool) get_option( 'wp_admin_workspaces_enabled', true );
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'WP Admin Workspaces', 'wp-admin-workspaces' ); ?></h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'wp_admin_workspaces_settings' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Workspace', 'wp-admin-workspaces' ); ?></th>
					<td>
						<label>
							<input type="hidden" name="wp_admin_workspaces_enabled" value="0" />
							<input type="checkbox" name="wp_admin_workspaces_enabled" value="1" <?php checked( $enabled ); ?> />
							<?php esc_html_e( 'Activate WP Admin Workspace', 'wp-admin-workspaces' ); ?>
						</label>
						<p class="description"><?php esc_html_e( 'When enabled, the workspace replaces classic wp-admin at /wp-admin/. Requires a valid wp-content/workspace.json. Disable to fall back to classic.', 'wp-admin-workspaces' ); ?></p>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/**
 * Enqueue workspace assets for a workspace takeover request.
 *
 * Runs on `admin_enqueue_scripts` during the hijack's admin-header
 * render (and is harmless elsewhere because it self-gates). The
 * `$hook` arg is ignored — `wp_admin_workspaces_is_active_request()` is the
 * sole gate now that the workspace mounts at the admin root rather than a
 * registered page.
 *
 * @param string $hook Admin page hook suffix (unused).
 */
function wp_admin_workspaces_enqueue_assets( $hook = '' ) {
	if ( ! wp_admin_workspaces_is_active_request() ) {
		return;
	}

	$asset_path = WP_ADMIN_WORKSPACES_PATH . 'build/index.asset.php';
	if ( ! file_exists( $asset_path ) ) {
		return;
	}

	$asset = include $asset_path;

	// Filter out script dependencies that aren't registered in this
	// WordPress version (e.g., wp-dataviews requires Gutenberg plugin
	// or may not be registered on all admin pages).
	$deps = array_filter( $asset['dependencies'], function ( $dep ) {
		return wp_scripts()->query( $dep, 'registered' ) || wp_scripts()->query( $dep, 'enqueued' );
	} );

	wp_enqueue_script(
		'wp-admin-workspaces',
		WP_ADMIN_WORKSPACES_URL . 'build/index.js',
		array_values( $deps ),
		$asset['version'],
		true
	);

	// JS i18n: load translations for every `__()`/`_n()`/`sprintf` string in
	// the bundle (and lazily-loaded app chunks, which share the handle's
	// domain). `.json` translation files live in `languages/`; regenerate the
	// `.pot` with `wp i18n make-pot . languages/wp-admin-workspaces.pot`.
	wp_set_script_translations(
		'wp-admin-workspaces',
		'wp-admin-workspaces',
		WP_ADMIN_WORKSPACES_PATH . 'languages'
	);

	// Plugin menu renderers (spec §13 #15). Each registered renderer's
	// script enqueues here, after the main bundle, so a handle declaring
	// `wp-admin-workspaces` as a dependency loads once the kernel has published
	// `window.wpAdminWorkspaces.registerMenuRenderer`.
	WP_Admin_Workspaces_Menu_Renderers::enqueue_assets();

	$config = wp_admin_workspaces_get_active_config();

	// REST preload (spec §13 #9). Cascade-resolved `preload[]` paths
	// hydrate through `rest_preload_api_request` and ship as inline
	// script on `wp-api-fetch` before the workspace bundle runs. Eliminates
	// cold-mount round-trips for `useEntityRecord('root','user',me)`,
	// `loadPostTypeEntities`, and similar resolvers.
	WP_Admin_Workspaces_Preload::inject();

	// Engine-driven style enqueue. Each registered engine declares a
	// `styles` array in its manifest listing the CSS bundles it depends
	// on (WPDS baseline tokens, DataViews stylesheet, MUI bundle, etc.).
	// Only the active engine's styles enqueue — keeps non-WPDS engines
	// from loading WPDS tokens (and vice versa for other DS plugins).
	$active_engine_id      = is_array( $config )
		? ( $config['workspace']['engine'] ?? $config['engine'] ?? null )
		: null;
	$active_engine_manifest = $active_engine_id ? WP_Admin_Workspaces_Manifest_Registry::instance()->get_engine( $active_engine_id ) : null;

	if ( is_array( $active_engine_manifest ) && isset( $active_engine_manifest['styles'] ) && is_array( $active_engine_manifest['styles'] ) ) {
		foreach ( $active_engine_manifest['styles'] as $style ) {
			if ( ! isset( $style['handle'], $style['src'] ) ) {
				continue;
			}
			$src  = $style['src'];
			$deps = isset( $style['deps'] ) && is_array( $style['deps'] ) ? $style['deps'] : array();
			// Plugin-relative path → resolve against plugin URL. Absolute
			// URLs pass through unchanged.
			$resolved_src = ( strpos( $src, '//' ) === 0 || preg_match( '#^https?://#', $src ) ) ? $src : WP_ADMIN_WORKSPACES_URL . ltrim( $src, '/' );
			wp_enqueue_style( $style['handle'], $resolved_src, $deps, $asset['version'] );
		}
	}

	// Block editor styles — needed by SimpleEditorApp (BlockEditorProvider + BlockList).
	wp_enqueue_style( 'wp-block-editor' );
	wp_enqueue_style( 'wp-block-library' );
	wp_enqueue_style( 'wp-format-library' );

	wp_enqueue_style(
		'wp-admin-workspaces',
		WP_ADMIN_WORKSPACES_URL . 'build/index.css',
		array( 'wp-components' ),
		$asset['version']
	);

	$current_user = wp_get_current_user();

	$manifest_registry = WP_Admin_Workspaces_Manifest_Registry::instance();

	// Server-side visibility prune: ship only the screens + menu this user can
	// reach. The full $config stays available above for engine/preload/style
	// selection (user-invariant); everything user-facing below reads the
	// pruned copy so the page source never carries an unreachable screen's
	// permissions/legacy maps or a role-gated nav item the client can't gate.
	$client_config = wp_admin_workspaces_prune_config_for_user( $config, get_current_user_id() );

	wp_add_inline_script( 'wp-admin-workspaces', 'window.wpAdminWorkspaces = ' . wp_json_encode( array(
		'config'        => $client_config,
		'siteUrl'       => get_site_url(),
		'homeUrl'       => home_url(),
		'adminUrl'      => admin_url(),
		'dashboardUrl'  => admin_url(),
		'pluginUrl'     => WP_ADMIN_WORKSPACES_URL,
		// Classic→workspace legacy-route map for the admin-link interceptor
		// (W4). Keyed by workspace route path → { legacy_path, legacy_query,
		// legacy_params }. Empty until screens / programmatic routes declare
		// `legacy_path`.
		'adminRoutes'   => WP_Admin_Workspaces_Admin_Routes::legacy_map( $client_config ),
		'restUrl'       => get_rest_url(),
		'nonce'         => wp_create_nonce( 'wp_rest' ),
		'userId'        => get_current_user_id(),
		'siteName'      => get_bloginfo( 'name' ),
		'workspaces'        => wp_admin_workspaces_get_available_workspaces(),
		// True when a wp-content/workspace.json override is active — it wins over
		// the active-workspace option, so the workspace switcher hides + switchWorkspace()
		// refuses (writing the option would be a silent no-op).
		'fileActive' => class_exists( 'WP_Admin_Workspaces_Origin_File' ) && WP_Admin_Workspaces_Origin_File::exists_and_valid(),
		// v3 3d.5 Item 2 — opt-in surface for JS deprecation warnings in
		// production builds. PHP `_deprecated_hook` is gated by
		// `WP_DEBUG_LOG` only and fires regardless of build mode; the
		// JS shims default to `NODE_ENV !== 'production'` so prod builds
		// stay silent. Site admins with `WP_DEBUG` on get JS warnings
		// even when consuming a minified workspace bundle. Removed in v3.1
		// when the shims themselves go away.
		'debug'         => defined( 'WP_DEBUG' ) && WP_DEBUG,
		'user'          => array(
			'displayName' => $current_user->display_name,
			'avatarUrl'   => get_avatar_url( $current_user->ID, array( 'size' => 32 ) ),
			'profileUrl'  => '#/profile',
			'logoutUrl'   => wp_logout_url( admin_url( '/' ) ),
		),
		'settingsGeneral' => current_user_can( 'manage_options' )
			? wp_admin_workspaces_get_settings_general_data()
			: null,
		// Interface-language options for the profile editor's `locale` field.
		// Per-user (the profile form is self-service), so it deliberately offers
		// only Site Default + English + already-installed locales — exactly the
		// set the REST `locale` field accepts — and skips the translations-API
		// HTTP call entirely when nothing extra is installed.
		'profileLanguages' => is_user_logged_in()
			? wp_admin_workspaces_get_profile_languages()
			: array(),
		'capabilities'  => wp_admin_workspaces_resolve_capabilities( $client_config ),
		// V2.M1 — manifest payload. Empty until plugins ship app.json /
		// engine.json files; the kernel reads from this map alongside
		// the imperative registry during the v1→v2 transition.
		'manifests'     => array(
			'apps'    => $manifest_registry->list_apps(),
			'engines' => $manifest_registry->list_engines(),
		),
		// V2.M5 — DTCG primitives layer. Site → theme → plugin → core
		// origins merged here. Empty object when no origin contributes.
		// `compileStyles` consumes this when resolving non-`styles.*`
		// curly-brace aliases in admin.json `styles`. Token serialization
		// is skipped entirely when the resolved styles tree references
		// zero token aliases — the DTCG layer is dead weight for workspaces
		// that only set seeds + slot overrides. The empty-path cast to
		// stdClass keeps the JS shape stable: `wp_json_encode( array() )`
		// emits `[]`, but the kernel + downstream typedef `tokens` as an
		// object — `(object) array()` serializes as `{}`.
		'tokens'        => wp_admin_workspaces_styles_reference_tokens( $config )
			? WP_Admin_Workspaces_Tokens::resolve()
			: (object) array(),
		// v3 — flattened engine-modes catalog. The active engine's
		// `modes` block is walked for `extends` chains (depth-limited),
		// then the `wp_admin_workspaces_engine_modes_{engineId}` filter runs
		// so plugins can contribute additional modes. Empty object when
		// no engine is resolved (degenerate; the workspace would fail to
		// mount upstream of this anyway).
		'engineModes'   => $active_engine_manifest
			? WP_Admin_Workspaces_Modes::resolve_engine_modes( $active_engine_manifest )
			: WP_Admin_Workspaces_Modes::synthesize_default_catalog(),
		// #128 — admin-bar runtime harvest. Plugin admin-bar nodes the
		// workspace doesn't own first-class (site-hub / user-menu / +New are
		// skipped), folded submenus → dropdowns. `core:toolbar-actions`
		// reads this global. Empty array when no plugin registers a node.
		'adminBar'      => WP_Admin_Workspaces_Chrome_Harvest::harvest_admin_bar(),
		// #128 — buffered global `admin_notices` HTML (admin trust, same as
		// classic). `core:notices-banner` renders it alongside its
		// `@wordpress/notices` source. Empty string when none fire.
		// Documented limitation: only GLOBAL notices that fire on the
		// workspace's own page load are captured (per-screen notices keyed on
		// `$pagenow` don't fire) — see the harvest class docblock.
		'adminNotices'  => WP_Admin_Workspaces_Chrome_Harvest::capture_admin_notices(),
	) ) . ';', 'before' );

	wp_add_inline_style( 'wp-admin-workspaces', '
		#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter { display: none !important; }
		#wpcontent { margin-left: 0 !important; }
		#wpbody-content { padding-bottom: 0; }
		html.wp-toolbar { padding-top: 0 !important; }
		#wp-admin-workspaces { position: fixed; inset: 0; z-index: 99999; }
	' );
}
add_action( 'admin_enqueue_scripts', 'wp_admin_workspaces_enqueue_assets' );

/**
 * Read the active admin.json configuration through the M2 cascade resolver.
 *
 * Five origins (core / plugin / site / role / user) are loaded, filtered,
 * and merged into a single resolved doc. The legacy single-file loader is
 * gone — every workspace file goes through the same pipeline so behavior is
 * uniform whether the workspace ships with the plugin, lives in DB options,
 * or is contributed by a programmatic registration.
 */
function wp_admin_workspaces_get_active_config() {
	return WP_Admin_Workspaces_Resolver::resolve();
}

/**
 * Whether the workspace should take over the admin.
 *
 * Single source of truth for the workspace-as-primary-entry hijack and
 * the classic-mode escape hatch. True when EITHER:
 *   - a valid `wp-content/workspace.json` override file is present, OR
 *   - the legacy `wp_admin_workspaces_active_workspace` option was explicitly
 *     written (back-compat for installs that selected a workspace before the
 *     file-based trigger landed).
 *
 * A fresh install with neither returns false, so the workspace never
 * mounts and classic wp-admin is served untouched.
 *
 * @return bool
 */
function wp_admin_workspaces_is_active() {
	// Explicit OFF wins over file/legacy triggers. Settings → Workspace
	// (workspace) and Settings → WP Admin Workspaces (classic) surface this as a
	// checkbox; the option defaults to enabled, so a fresh install with a
	// file present still flips active true.
	if ( ! get_option( 'wp_admin_workspaces_enabled', true ) ) {
		return false;
	}
	if ( class_exists( 'WP_Admin_Workspaces_Origin_File' ) && WP_Admin_Workspaces_Origin_File::exists_and_valid() ) {
		return true;
	}
	$active_workspace = get_option( 'wp_admin_workspaces_active_workspace', null );
	return is_string( $active_workspace ) && $active_workspace !== '';
}

/**
 * Whether the current request is a workspace takeover (the W2 hijack
 * fired / will fire). Thin wrapper over WP_Admin_Workspaces_Hijack so the
 * asset-enqueue gate and other callers don't reach into the class.
 *
 * @return bool
 */
function wp_admin_workspaces_is_active_request() {
	return class_exists( 'WP_Admin_Workspaces_Hijack' ) && WP_Admin_Workspaces_Hijack::is_active_request();
}

/**
 * Sanitize + validate the wp_admin_workspaces_active_workspace option write.
 *
 * Returns the sanitized slug if a matching workspace file exists; returns
 * the previous option value (or empty string for the first write)
 * when the slug is unknown. Empty string passes through so the
 * resolver's fallback chain still resolves (legacy active_config →
 * default).
 */
function wp_admin_workspaces_sanitize_active_workspace( $value ) {
	$sanitized = sanitize_file_name( (string) $value );
	if ( $sanitized === '' ) {
		return '';
	}
	$path = WP_ADMIN_WORKSPACES_PATH . 'workspaces/' . $sanitized . '.json';
	if ( file_exists( $path ) ) {
		return $sanitized;
	}
	if ( class_exists( 'WP_Admin_Workspaces_Registry' ) && WP_Admin_Workspaces_Registry::has( $sanitized ) ) {
		return $sanitized;
	}

	add_settings_error(
		'wp_admin_workspaces_active_workspace',
		'wp_admin_workspaces_unknown_shell',
		sprintf(
			/* translators: %s: workspace slug */
			__( 'Unknown workspace: "%s". The previous active workspace was kept.', 'wp-admin-workspaces' ),
			esc_html( $sanitized )
		),
		'error'
	);

	$previous = get_option( 'wp_admin_workspaces_active_workspace', '' );
	return $previous;
}

/**
 * Pre-compute capability decisions for every cap declared in the resolved
 * config. Walks regions[*].capability + applications[*].capability, plus
 * built-in source capability floors. The runtime sees an absolute
 * `{cap: bool}` map for everything that matters during initial render;
 * the /wp-admin-workspaces/v1/can/{cap} endpoint covers anything plugin code
 * looks up dynamically.
 *
 * Cost: each unique declared cap costs one `current_user_can()` call.
 * A 50-app workspace with 30 unique caps = 30 cap checks per page load on
 * a cold resolver-cache miss. The M2.7 resolver cache memoizes the
 * entire resolved config + cap precomputation across requests, so this
 * cost only fires when origin signals (option / user-meta / file-mtime)
 * change. Hot path = zero cap checks.
 */
/**
 * Prune screens + menu the given user can't reach BEFORE the resolved config
 * is serialized to the page. Without this the full admin IA — every screen,
 * each screen's `permissions` block, `legacy_path` maps, the whole menu tree —
 * ships in page source to every logged-in user down to subscriber, with
 * capability gating applied client-side only (and roles not evaluable on the
 * client at all). Entity *data* is still REST-gated; this closes the
 * structural/metadata leak and makes the server the authority for visibility,
 * mirroring how wp-admin server-prunes its own menu by capability.
 *
 * Operates on a COPY — callers keep the full resolved doc for server-side use
 * (REST screen-permission floors must still see every screen). Scope is
 * screens + menu: the `regions`/`routes` escape hatches and `commands` are
 * left intact (rarely role-gated; a command pointing at a pruned screen just
 * resolves to no route). The `workspace.default-screen` is always kept so the
 * kernel always has a landing route — its mounted app cap-gates itself.
 *
 * @param array $config  Full resolved admin.json doc.
 * @param int   $user_id Current user id.
 * @return array Pruned copy.
 */
function wp_admin_workspaces_prune_config_for_user( $config, $user_id ) {
	if ( ! is_array( $config ) || ! class_exists( 'WP_Admin_Workspaces_Permissions' ) ) {
		return $config;
	}
	$user_id = (int) $user_id;

	/**
	 * Escape hatch — return false to ship the full unpruned config (e.g. to
	 * debug a workspace whose screens vanish unexpectedly). Default true.
	 *
	 * @param bool  $prune   Whether to prune.
	 * @param array $config  The resolved doc.
	 * @param int   $user_id Current user id.
	 */
	if ( ! apply_filters( 'wp_admin_workspaces_prune_unreachable', true, $config, $user_id ) ) {
		return $config;
	}

	$default_screen = isset( $config['workspace']['default-screen'] ) && is_string( $config['workspace']['default-screen'] )
		? (string) $config['workspace']['default-screen']
		: '';

	// 1. Prune screens whose resolved permissions the user fails.
	$removed = array();
	if ( isset( $config['screens'] ) && is_array( $config['screens'] ) ) {
		foreach ( $config['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			if ( (string) $screen_id === $default_screen ) {
				continue;
			}
			$resolved = WP_Admin_Workspaces_Permissions::resolve(
				$screen['permissions'] ?? null,
				WP_Admin_Workspaces_Permissions::app_floor_for( $screen )
			);
			if ( ! WP_Admin_Workspaces_Permissions::user_passes( $user_id, $resolved ) ) {
				unset( $config['screens'][ $screen_id ] );
				$removed[ (string) $screen_id ] = true;
			}
		}
	}

	// 2. Prune menu nodes bound to a removed screen, or carrying their own
	//    failing permissions (the role-gated nav-item leak the client can't
	//    evaluate). Reachable children of a pruned node are hoisted, not lost.
	if ( isset( $config['menu'] ) && is_array( $config['menu'] ) ) {
		$config['menu'] = wp_admin_workspaces_prune_menu_for_user( $config['menu'], $removed, $user_id, 0 );
	}

	return $config;
}

/**
 * Recursive helper for {@see wp_admin_workspaces_prune_config_for_user()}. Drops
 * menu nodes bound to a removed screen id and nodes whose own `permissions`
 * fail for the user.
 *
 * When a node is dropped it recurses into `items` first and HOISTS the
 * surviving (reachable) children up to the dropped node's level rather than
 * discarding the whole subtree — otherwise a reachable child nested only under
 * an unreachable parent (e.g. `profile`, `read`-floor, living solely at
 * `menu.users.items.profile` under the admin-only `users` node) would vanish
 * from a non-admin's menu even though the screen itself survives. Mirrors
 * `WP_Admin_Workspaces_Menu_Items::drop_deeper_duplicates()`.
 *
 * @param array $tree            Menu (sub-)tree.
 * @param array $removed_screens Map of removed screen id → true.
 * @param int   $user_id         Current user id.
 * @param int   $depth           Recursion guard.
 * @return array
 */
function wp_admin_workspaces_prune_menu_for_user( $tree, $removed_screens, $user_id, $depth ) {
	if ( ! is_array( $tree ) || $depth > 20 ) {
		return $tree;
	}
	$out = array();
	foreach ( $tree as $id => $item ) {
		// Recurse first so reachable children can be hoisted if this node
		// itself turns out to be unreachable.
		$children = null;
		if ( is_array( $item ) && isset( $item['items'] ) && is_array( $item['items'] ) ) {
			$children = wp_admin_workspaces_prune_menu_for_user( $item['items'], $removed_screens, $user_id, $depth + 1 );
		}

		// Is this node itself unreachable — bound to a pruned screen, or its
		// own (possibly screen-inherited) permissions fail?
		$drop = isset( $removed_screens[ (string) $id ] );
		if ( ! $drop && is_array( $item ) && isset( $item['permissions'] ) && is_array( $item['permissions'] ) ) {
			$resolved = WP_Admin_Workspaces_Permissions::resolve( $item['permissions'], array() );
			if ( ! WP_Admin_Workspaces_Permissions::user_passes( $user_id, $resolved ) ) {
				$drop = true;
			}
		}

		if ( $drop ) {
			// Hoist the surviving children so a reachable item nested only
			// under this unreachable node isn't lost with it.
			if ( is_array( $children ) ) {
				foreach ( $children as $child_id => $child_item ) {
					if ( ! isset( $out[ $child_id ] ) ) {
						$out[ $child_id ] = $child_item;
					}
				}
			}
			continue;
		}

		if ( is_array( $children ) ) {
			$item['items'] = $children;
		}
		$out[ $id ] = $item;
	}
	return $out;
}

function wp_admin_workspaces_resolve_capabilities( $config ) {
	$declared = array();

	// Escape-hatch `regions` block (recursive). A region may declare a
	// `capability`, and a nav-style app embedded in a region may declare
	// per-item caps in `region.config.items`. Walk both so they reach the
	// runtime cap-map.
	$collect_from_regions = function ( $regions ) use ( &$declared, &$collect_from_regions ) {
		if ( ! is_array( $regions ) ) {
			return;
		}
		foreach ( $regions as $region ) {
			if ( ! is_array( $region ) ) {
				continue;
			}
			if ( isset( $region['capability'] ) && is_string( $region['capability'] ) ) {
				$declared[ $region['capability'] ] = true;
			}
			$items = $region['config']['items'] ?? null;
			if ( is_array( $items ) ) {
				wp_admin_workspaces_collect_nav_item_caps( $items, $declared );
			}
			if ( ! empty( $region['regions'] ) && is_array( $region['regions'] ) ) {
				$collect_from_regions( $region['regions'] );
			}
		}
	};

	if ( isset( $config['regions'] ) && is_array( $config['regions'] ) ) {
		$collect_from_regions( $config['regions'] );
	}

	// Per-screen permissions block. screens[id].permissions has
	// `capabilities[]` + `roles[]`; we collect the cap slugs so the
	// runtime cap-map covers v3 screens the same way v2 region.capability
	// strings were collected. Roles are evaluated separately (membership
	// check, not a capability check).
	if ( isset( $config['screens'] ) && is_array( $config['screens'] ) ) {
		foreach ( $config['screens'] as $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			$caps = $screen['permissions']['capabilities'] ?? array();
			if ( is_array( $caps ) ) {
				foreach ( $caps as $cap ) {
					if ( is_string( $cap ) && $cap !== '' ) {
						$declared[ $cap ] = true;
					}
				}
			}
		}
	}

	// Menu items can carry their own `permissions.capabilities[]` when
	// they don't inherit from a bound screen (e.g. standalone link
	// items registered via `wp_admin_workspaces_register_menu_item()`). Walk
	// the menu tree so those caps reach the runtime cap-map too — without
	// this, `userCan()` would default-false on inline-permissioned menu
	// items that have no screen binding.
	if ( isset( $config['menu'] ) && is_array( $config['menu'] ) ) {
		wpas_collect_menu_item_caps( $config['menu'], $declared );
	}

	// Built-in source capability floors (mirrors registry/builtins.js
	// `capabilities` arrays). Kept tight to the surface authors actually
	// declare — adding every WP cap here would inflate the inline script.
	foreach ( array( 'list_users', 'moderate_comments', 'manage_options', 'edit_theme_options' ) as $cap ) {
		$declared[ $cap ] = true;
	}

	$out = array();
	foreach ( array_keys( $declared ) as $cap ) {
		$out[ $cap ] = current_user_can( $cap );
	}
	return $out;
}

/**
 * Walk a v3 menu tree (recursive `items` map) and collect every cap slug
 * declared on `permissions.capabilities[]`. Mirrors the screen-perms walk
 * for menu items that don't inherit perms from a bound screen.
 */
function wpas_collect_menu_item_caps( $menu, &$declared ) {
	if ( ! is_array( $menu ) ) {
		return;
	}
	foreach ( $menu as $item ) {
		if ( ! is_array( $item ) ) {
			continue;
		}
		$caps = $item['permissions']['capabilities'] ?? array();
		if ( is_array( $caps ) ) {
			foreach ( $caps as $cap ) {
				if ( is_string( $cap ) && $cap !== '' ) {
					$declared[ $cap ] = true;
				}
			}
		}
		if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
			wpas_collect_menu_item_caps( $item['items'], $declared );
		}
	}
}

/**
 * Walk a navigation items[] tree (the v2 navigation app's `config.items`
 * shape — same as v1's `navigation` array but inline-described per item)
 * and collect every `capability` declaration. Recurses into `screen`/
 * `group` children.
 */
function wp_admin_workspaces_collect_nav_item_caps( $items, &$declared ) {
	if ( ! is_array( $items ) ) {
		return;
	}
	foreach ( $items as $item ) {
		if ( ! is_array( $item ) ) {
			continue;
		}
		if ( isset( $item['capability'] ) && is_string( $item['capability'] ) ) {
			$declared[ $item['capability'] ] = true;
		}
		if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
			wp_admin_workspaces_collect_nav_item_caps( $item['items'], $declared );
		}
	}
}

/**
 * Scan the resolved styles tree for any token alias. Returns true if any
 * string leaf matches the alias pattern `{<path>}` where `<path>` does
 * NOT start with `styles.` (within-doc aliases are resolved without
 * touching the DTCG tokens table). Used to skip token serialization when
 * the workspace ships seeds + slot overrides only — the DTCG layer would be
 * dead weight on the wire.
 *
 * Contract: DTCG aliases are valid ONLY under `admin.json#styles`. App
 * manifests (`app.json#dataView`, etc.), engine `default-style` blocks,
 * and any other config surface MUST NOT carry `{tokens.*}` references —
 * the detector deliberately does not scan them, so a stray alias outside
 * `styles` would silently emit `var(--token-…)` fallbacks at runtime.
 * Author tokens under `styles` (top-level, per-region, or per-app) and
 * cross-reference from other config surfaces via `{styles.path}` if
 * needed.
 *
 * @param array $config Resolved admin.json config.
 * @return bool
 */
function wp_admin_workspaces_styles_reference_tokens( $config ) {
	if ( ! is_array( $config ) || empty( $config['styles'] ) || ! is_array( $config['styles'] ) ) {
		return false;
	}
	return wp_admin_workspaces_tree_has_token_alias( $config['styles'] );
}

/**
 * Recursively test whether a styles subtree contains a foreign token alias.
 *
 * @param mixed $node Styles node (string leaf or nested array).
 * @return bool
 */
function wp_admin_workspaces_tree_has_token_alias( $node ) {
	if ( is_string( $node ) ) {
		if ( ! preg_match( '/^\{([^}]+)\}$/', $node, $m ) ) {
			return false;
		}
		// Within-doc aliases (`{styles.path}`) resolve from admin.json
		// directly; they don't reach the tokens table. Only "foreign"
		// aliases (`{color.brand.500}`, `{size.lg}`, etc.) need the
		// DTCG tree.
		return strpos( $m[1], 'styles.' ) !== 0;
	}
	if ( ! is_array( $node ) ) {
		return false;
	}
	foreach ( $node as $value ) {
		if ( wp_admin_workspaces_tree_has_token_alias( $value ) ) {
			return true;
		}
	}
	return false;
}

/**
 * Register the workspace settings.
 *
 * Also extend core `general` + `reading` options so the Settings apps can
 * read/write them via /wp/v2/settings. Core registers blogname/blogdescription/
 * url/email/timezone/date_format/time_format/start_of_week/language +
 * show_on_front/page_on_front/page_for_posts/posts_per_page but skips home,
 * users_can_register, default_role (general) and posts_per_rss, rss_use_excerpt
 * (reading). Without these shims those controls render, accept input, report
 * "Settings saved.", and silently discard the value because the REST settings
 * controller only iterates options carrying `show_in_rest` (issue #106). The
 * manual-UTC-offset case is handled separately by the `rest_pre_update_setting`
 * filter below, since it has no dedicated REST-registerable option.
 */
add_action( 'init', function () {
	// Active workspace (canonical v1 key). Sole setting on the
	// `wp_admin_workspaces_settings` page-form group so options.php doesn't
	// NULL-out adjacent options when the form posts.
	//
	// Sanitize-and-validate: core's sanitize_file_name fatals on NULL
	// since PHP 8.1 (see wp_is_valid_utf8 in /wp-includes/utf8.php), so
	// the (string) coercion is required. Then verify the sanitized
	// slug corresponds to a workspace file on disk — unknown slugs return
	// the previous value, preserving the working state instead of
	// putting the admin in a "Workspace configuration not found" state on
	// the next load. WP-CLI `wp admin-workspace activate <slug>` and the
	// JS `switchWorkspace()` both pre-validate, but this is the
	// belt-and-suspenders against direct option writes (e.g. via
	// `wp option update`).
	register_setting( 'wp_admin_workspaces_settings', 'wp_admin_workspaces_active_workspace', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => 'wp_admin_workspaces_sanitize_active_workspace',
		'show_in_rest'      => true,
	) );

	// Persistent "Activate WP Admin Workspace" toggle. The site-entity
	// (/wp/v2/settings) exposes this to the workspace's DataForm settings
	// screen (`core:settings-workspace`); the classic-side `add_options_page`
	// below writes it through the standard options.php submission. When
	// false, wp_admin_workspaces_is_active() returns false regardless of
	// file presence — the user sees classic until they re-enable.
	register_setting( 'wp_admin_workspaces_settings', 'wp_admin_workspaces_enabled', array(
		'type'              => 'boolean',
		'default'           => true,
		'sanitize_callback' => 'rest_sanitize_boolean',
		'show_in_rest'      => true,
	) );

	// Cascade-origin options live in a separate group — REST-exposed but
	// not edited by the settings page. Keeping them off the page-form
	// group avoids the "form posts only one option, options.php NULLs the
	// rest" failure mode the MVP migration hit on PHP 8.1+.
	register_setting( 'wp_admin_workspaces_cascade', 'wp_admin_workspaces_site_config', array(
		'type'         => 'object',
		'default'      => array(),
		'show_in_rest' => array(
			'schema' => array(
				'type'                 => 'object',
				'additionalProperties' => true,
			),
		),
	) );

	register_setting( 'wp_admin_workspaces_cascade', 'wp_admin_workspaces_role_config', array(
		'type'         => 'object',
		'default'      => array(),
		'show_in_rest' => array(
			'schema' => array(
				'type'                 => 'object',
				'additionalProperties' => true,
			),
		),
	) );

	if ( ! is_multisite() ) {
		register_setting( 'general', 'home', array(
			'show_in_rest' => array(
				'name'   => 'home',
				'schema' => array( 'format' => 'uri' ),
			),
			'type'         => 'string',
			'description'  => __( 'Site address (front-end URL).', 'wp-admin-workspaces' ),
		) );

		register_setting( 'general', 'users_can_register', array(
			'show_in_rest' => true,
			'type'         => 'boolean',
			'description'  => __( 'Allow new user registration.', 'wp-admin-workspaces' ),
		) );

		register_setting( 'general', 'default_role', array(
			'show_in_rest' => true,
			'type'         => 'string',
			'description'  => __( 'Default role for new users.', 'wp-admin-workspaces' ),
		) );
	}

	// Reading-group options the SettingsReadingApp renders but core never
	// REST-registers. Not multisite-sensitive, so register unconditionally.
	// Feed templates read these via get_option(); the boolean cast of
	// rss_use_excerpt stores '1'/'' which those truthy checks honor.
	register_setting( 'reading', 'posts_per_rss', array(
		'show_in_rest' => array(
			// Floor of 1 mirrors the classic options-reading.php `min=1`
			// number input and the app's clampPerPage — a 0/negative feed
			// length is meaningless. The schema validator rejects out-of-range
			// writes (the type-only schema would otherwise accept `-3`).
			'schema' => array( 'minimum' => 1 ),
		),
		'type'         => 'integer',
		'default'      => 10,
		'description'  => __( 'Number of items shown in syndication feeds.', 'wp-admin-workspaces' ),
	) );

	register_setting( 'reading', 'rss_use_excerpt', array(
		'show_in_rest' => true,
		'type'         => 'boolean',
		'default'      => false,
		'description'  => __( 'Whether syndication feeds show an excerpt rather than full text.', 'wp-admin-workspaces' ),
	) );

	// --- Media options (issue #117) -----------------------------------------
	// Core never REST-registers the image-size / uploads options that
	// options-media.php saves through the legacy form handler. Re-register them
	// in the `media` group with `show_in_rest` so SettingsMediaApp can read +
	// write them via /wp/v2/settings. No save side effects: these are plain
	// option writes (update_option fires its own hooks). Image dimensions are
	// non-negative integers (0 = "do not generate this size"); the crop and
	// year/month-folder flags are booleans. The integer schema floor of 0
	// rejects negative writes the same way the classic `min=0` number inputs do.
	$wpas_media_size_options = array(
		'thumbnail_size_w' => 150,
		'thumbnail_size_h' => 150,
		'medium_size_w'    => 300,
		'medium_size_h'    => 300,
		'large_size_w'     => 1024,
		'large_size_h'     => 1024,
	);
	foreach ( $wpas_media_size_options as $wpas_media_opt => $wpas_media_default ) {
		register_setting( 'media', $wpas_media_opt, array(
			'show_in_rest' => array(
				// Mirror the classic options-media.php `min=0` number inputs:
				// a negative dimension is meaningless. The type-only schema
				// would otherwise accept `-1`.
				'schema' => array( 'minimum' => 0 ),
			),
			'type'         => 'integer',
			'default'      => $wpas_media_default,
			'description'  => __( 'Image size dimension (pixels).', 'wp-admin-workspaces' ),
		) );
	}

	register_setting( 'media', 'thumbnail_crop', array(
		'show_in_rest' => true,
		'type'         => 'boolean',
		'default'      => true,
		'description'  => __( 'Whether thumbnails are cropped to exact dimensions.', 'wp-admin-workspaces' ),
	) );

	register_setting( 'media', 'uploads_use_yearmonth_folders', array(
		'show_in_rest' => true,
		'type'         => 'boolean',
		'default'      => true,
		'description'  => __( 'Whether uploads are organized into month- and year-based folders.', 'wp-admin-workspaces' ),
	) );

	// --- Discussion options (issue #118) ------------------------------------
	// Core registers only `default_comment_status` / `default_ping_status` for
	// REST; every other Discussion option is saved exclusively through the
	// legacy options-discussion.php form handler. Re-register the full standard
	// set with `show_in_rest` so SettingsDiscussionApp can read + write them via
	// /wp/v2/settings in one PUT.
	//
	// Sanitize fidelity mirrors classic wp-admin: booleans round-trip as core's
	// '1' / '' string shape ($wpdb stringifies the rest_sanitize_boolean PHP
	// bool the same way core's hand-rolled '1'/'' writes do); enums use a string
	// type + `enum` schema so out-of-range values 400; integers clamp to the
	// classic mins (thread depth to [1, thread_comments_depth_max]); textareas
	// stay strings, newline-normalized. The settings controller's manage_options
	// floor gates every write — no per-option auth_callback needed.

	// Booleans — comment rules, moderation flags, notifications, group toggles.
	$wpas_discussion_bools = array(
		'default_pingback_flag'        => true,
		'require_name_email'           => true,
		'comment_registration'         => false,
		'close_comments_for_old_posts' => false,
		'show_comments_cookies_opt_in' => true,
		'thread_comments'              => true,
		'page_comments'                => false,
		'comments_notify'              => true,
		'moderation_notify'            => true,
		'comment_moderation'           => false,
		'comment_previously_approved'  => true,
		'show_avatars'                 => true,
	);
	foreach ( $wpas_discussion_bools as $wpas_disc_opt => $wpas_disc_default ) {
		register_setting( 'discussion', $wpas_disc_opt, array(
			'show_in_rest'      => true,
			'type'              => 'boolean',
			'default'           => $wpas_disc_default,
			'sanitize_callback' => 'rest_sanitize_boolean',
		) );
	}

	// Integer clamps — mirror the classic number-input mins. The floor lives in
	// the `sanitize_callback`, NOT a schema `minimum`: the settings REST
	// controller validates each arg against its schema BEFORE the sanitize
	// callback runs, so a schema `minimum` would 400 a sub-floor write before the
	// clamp-up can fire. Dropping it lets the value reach the callback, making
	// `max( floor, … )` the sole `[floor, max]` authority (mirroring classic
	// wp-admin, which clamps rather than rejects). `type: 'integer'` still
	// rejects non-integers at the schema layer.
	register_setting( 'discussion', 'close_comments_days_old', array(
		'show_in_rest'      => true,
		'type'              => 'integer',
		'default'           => 14,
		'sanitize_callback' => static function ( $value ) {
			return max( 0, (int) $value );
		},
	) );

	register_setting( 'discussion', 'comments_per_page', array(
		'show_in_rest'      => true,
		'type'              => 'integer',
		'default'           => 50,
		'sanitize_callback' => static function ( $value ) {
			return max( 1, (int) $value );
		},
	) );

	register_setting( 'discussion', 'comment_max_links', array(
		'show_in_rest'      => true,
		'type'              => 'integer',
		'default'           => 2,
		'sanitize_callback' => static function ( $value ) {
			return max( 0, (int) $value );
		},
	) );

	// Thread depth clamps to [1, thread_comments_depth_max]. Core's default max
	// is 10 (filterable via `thread_comments_depth_max`); honor the live filter
	// server-side so a theme raising the max still validates. The workspace's UI
	// hardcodes 10 as a documented parity caveat (no read endpoint for the max).
	// As above, the clamp is the sole authority — no schema `minimum` (it would
	// 400 a sub-floor write before the sanitize clamp-up to 1 could run).
	register_setting( 'discussion', 'thread_comments_depth', array(
		'show_in_rest'      => true,
		'type'              => 'integer',
		'default'           => 5,
		'sanitize_callback' => static function ( $value ) {
			$max = (int) apply_filters( 'thread_comments_depth_max', 10 );
			$max = max( 1, $max );
			return min( $max, max( 1, (int) $value ) );
		},
	) );

	// Enums — string type + `enum` schema so out-of-range values are rejected
	// with a 400 by the schema validator.
	$wpas_discussion_enums = array(
		'avatar_rating'         => array(
			'enum'    => array( 'G', 'PG', 'R', 'X' ),
			'default' => 'G',
		),
		'avatar_default'        => array(
			// Core's built-in set (filterable via `avatar_defaults`). The workspace
			// uses this fixed set as a documented parity caveat — themes adding
			// defaults via the filter won't appear in the workspace picker.
			'enum'    => array(
				'mystery',
				'blank',
				'gravatar_default',
				'identicon',
				'wavatar',
				'monsterid',
				'retro',
				'robohash',
				'initials',
				'color',
			),
			'default' => 'mystery',
		),
		'comment_order'         => array(
			'enum'    => array( 'asc', 'desc' ),
			'default' => 'asc',
		),
		'default_comments_page' => array(
			'enum'    => array( 'newest', 'oldest' ),
			'default' => 'newest',
		),
	);
	foreach ( $wpas_discussion_enums as $wpas_disc_opt => $wpas_disc_meta ) {
		register_setting( 'discussion', $wpas_disc_opt, array(
			'show_in_rest' => array(
				'schema' => array( 'enum' => $wpas_disc_meta['enum'] ),
			),
			'type'         => 'string',
			'default'      => $wpas_disc_meta['default'],
		) );
	}

	// Textareas — newline-separated keyword / IP lists. Normalize CRLF → LF so
	// the stored value matches what classic wp-admin writes (it splits on \n).
	$wpas_discussion_keys_sanitize = static function ( $value ) {
		return str_replace( "\r\n", "\n", (string) $value );
	};
	register_setting( 'discussion', 'moderation_keys', array(
		'show_in_rest'      => true,
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => $wpas_discussion_keys_sanitize,
	) );
	register_setting( 'discussion', 'disallowed_keys', array(
		'show_in_rest'      => true,
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => $wpas_discussion_keys_sanitize,
	) );
} );

/**
 * Route a manual UTC-offset timezone write to `gmt_offset`.
 *
 * The Timezone select (wp_admin_workspaces_get_settings_general_data) offers a
 * "Manual offsets" optgroup of `UTC±X` values alongside the IANA city zones.
 * Both write the single REST `timezone` field (core option `timezone_string`).
 * For a `UTC±X` value `sanitize_option('timezone_string')` rejects the
 * non-IANA string and reverts to the stored value, so the save is silently
 * lost (issue #106) — and `gmt_offset`, the option classic wp-admin actually
 * writes for an offset, is not REST-registerable on its own (it carries no
 * independent control). Intercept the write before `update_option()` runs and
 * mirror `wp-admin/options.php`: a `UTC±X` selection sets `gmt_offset` and
 * clears `timezone_string`; any other value (an IANA zone, or bare `UTC`)
 * stores `timezone_string` and leaves `gmt_offset` untouched — core's
 * `wp_timezone_override_offset()` (on the `pre_option_gmt_offset` read filter)
 * makes `get_option('gmt_offset')` report the zone's current offset while a
 * zone is set, so the stored value is moot.
 *
 * Keyed on `option_name` rather than the REST field name so it stays correct
 * if core renames the exposed field. The /wp/v2/settings endpoint already
 * gates the write on `manage_options`.
 *
 * @param bool   $updated Whether the setting was already handled by a prior filter.
 * @param string $name    REST setting name being written.
 * @param mixed  $value   The incoming setting value (core passes `$request[ $name ]` here).
 * @param array  $args    Registered option args (includes `option_name`).
 * @return bool Whether the setting write was handled here.
 */
add_filter( 'rest_pre_update_setting', function ( $updated, $name, $value, $args ) {
	if ( $updated || empty( $args['option_name'] ) || 'timezone_string' !== $args['option_name'] ) {
		return $updated;
	}

	if ( is_string( $value ) && preg_match( '/^UTC[+-]/', $value ) ) {
		// Manual offset: store gmt_offset, clear the zone. With timezone_string
		// empty, get_option('gmt_offset') returns the stored number (the
		// pre_option_gmt_offset override below only fires while a zone is set),
		// so the offset sticks.
		update_option( 'gmt_offset', (float) substr( $value, 3 ) );
		update_option( 'timezone_string', '' );
	} else {
		// IANA zone (or bare `UTC`): store the zone and leave gmt_offset alone.
		// Core hooks wp_timezone_override_offset() onto `pre_option_gmt_offset`,
		// so get_option('gmt_offset') returns the zone's *current* offset
		// (ignoring the stored value) whenever timezone_string is non-empty —
		// writing gmt_offset here would be pointless, and wp_timezone() prefers
		// the zone regardless.
		update_option( 'timezone_string', $value );
	}

	return true;
}, 10, 4 );

/**
 * Build the interface-language options the profile editor offers for the user
 * `locale` field.
 *
 * Unlike the Site Language list (admin-only, includes downloadable
 * translations), this is per-user and offers only Site Default, English, and
 * locales already installed — exactly the set the REST `locale` field accepts
 * (its enum is `en_US` + `get_available_languages()`, plus `''` for the site
 * default). Installing a new language pack on save is a wp-admin-only
 * sub-feature, deliberately NOT surfaced here.
 *
 * The profile form is self-service (every logged-in user mounts it), so this
 * avoids the translations-API HTTP fetch entirely in the common case where no
 * extra languages are installed — only resolving native names when there is
 * actually an installed locale to label.
 *
 * @return array<int, array{value:string,label:string}> Flat select options
 *                                                       (`{ value, label }`).
 */
function wp_admin_workspaces_get_profile_languages() {
	$installed = get_available_languages();

	$options = array(
		array( 'value' => '', 'label' => __( 'Site Default', 'wp-admin-workspaces' ) ),
		array( 'value' => 'en_US', 'label' => 'English (United States)' ),
	);

	if ( empty( $installed ) ) {
		return $options;
	}

	require_once ABSPATH . 'wp-admin/includes/translation-install.php';
	$translations = wp_get_available_translations();
	foreach ( $installed as $locale ) {
		$options[] = array(
			'value' => $locale,
			'label' => isset( $translations[ $locale ]['native_name'] )
				? $translations[ $locale ]['native_name']
				: $locale,
		);
	}

	return $options;
}

/**
 * Build the data payload that SettingsGeneralApp consumes (timezone groups,
 * languages, roles, date/time format presets, format previews). Uses the same
 * core helpers wp-admin/options-general.php uses so the app stays in lockstep.
 */
function wp_admin_workspaces_get_settings_general_data() {
	require_once ABSPATH . 'wp-admin/includes/translation-install.php';

	// Languages (locales installed + downloadable translations).
	$installed_languages = get_available_languages();
	$translations        = wp_get_available_translations();

	$language_options = array(
		array( 'value' => '', 'label' => 'English (United States)' ),
	);
	$installed_group = array();
	foreach ( $installed_languages as $locale ) {
		$label = isset( $translations[ $locale ]['native_name'] )
			? $translations[ $locale ]['native_name']
			: $locale;
		$installed_group[] = array( 'value' => $locale, 'label' => $label );
	}
	$available_group = array();
	if ( current_user_can( 'install_languages' ) && wp_can_install_language_pack() ) {
		foreach ( $translations as $locale => $data ) {
			if ( in_array( $locale, $installed_languages, true ) ) {
				continue;
			}
			$available_group[] = array(
				'value' => $locale,
				'label' => isset( $data['native_name'] ) ? $data['native_name'] : $locale,
			);
		}
	}

	// Timezones, grouped by continent. Mirrors wp_timezone_choice() output.
	$tz_identifiers = timezone_identifiers_list();
	$tz_groups      = array(
		array( 'label' => __( 'UTC', 'wp-admin-workspaces' ), 'options' => array(
			array( 'value' => 'UTC', 'label' => 'UTC' ),
		) ),
	);
	$by_continent = array();
	foreach ( $tz_identifiers as $zone ) {
		if ( $zone === 'UTC' ) {
			continue;
		}
		$parts     = explode( '/', $zone );
		$continent = $parts[0];
		if ( ! in_array( $continent, array( 'Africa', 'America', 'Antarctica', 'Arctic', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific' ), true ) ) {
			continue;
		}
		$by_continent[ $continent ][] = array(
			'value' => $zone,
			'label' => str_replace( array( $continent . '/', '_' ), array( '', ' ' ), $zone ),
		);
	}
	foreach ( $by_continent as $continent => $zones ) {
		$tz_groups[] = array(
			'label'   => $continent,
			'options' => $zones,
		);
	}
	// Manual UTC offsets (UTC-12 through UTC+14, half/quarter step).
	$offset_options = array();
	$offset_range   = array( -12, -11.5, -11, -10.5, -10, -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 7.5, 8, 8.5, 8.75, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.75, 13, 13.75, 14 );
	foreach ( $offset_range as $offset ) {
		$value = 'UTC' . ( $offset >= 0 ? '+' : '' ) . $offset;
		$offset_options[] = array( 'value' => $value, 'label' => $value );
	}
	$tz_groups[] = array(
		'label'   => __( 'Manual offsets', 'wp-admin-workspaces' ),
		'options' => $offset_options,
	);

	// Roles for new-user default.
	$roles_raw = wp_roles()->get_names();
	$role_options = array();
	foreach ( $roles_raw as $slug => $name ) {
		$role_options[] = array(
			'value' => $slug,
			'label' => translate_user_role( $name ),
		);
	}

	// Date/time format presets (same filters core uses).
	$date_formats = array_unique( apply_filters( 'date_formats', array( __( 'F j, Y' ), 'Y-m-d', 'm/d/Y', 'd/m/Y' ) ) );
	$time_formats = array_unique( apply_filters( 'time_formats', array( __( 'g:i a' ), 'g:i A', 'H:i' ) ) );

	$current_offset = get_option( 'gmt_offset' );
	$current_tz     = get_option( 'timezone_string' );
	if ( empty( $current_tz ) ) {
		if ( 0 == $current_offset ) {
			$current_tz = 'UTC+0';
		} elseif ( $current_offset < 0 ) {
			$current_tz = 'UTC' . $current_offset;
		} else {
			$current_tz = 'UTC+' . $current_offset;
		}
	}

	return array(
		'languages' => array(
			'installed' => $installed_group,
			'available' => $available_group,
			'default'   => $language_options,
		),
		'timezone'    => array(
			'groups'  => $tz_groups,
			'current' => $current_tz,
			'utcNow'  => date_i18n( 'Y-m-d H:i:s', false, true ),
			'localNow' => date_i18n( 'Y-m-d H:i:s' ),
		),
		'roles'       => $role_options,
		'dateFormats' => array_values( array_map( function ( $fmt ) {
			return array( 'value' => $fmt, 'label' => date_i18n( $fmt ) );
		}, $date_formats ) ),
		'timeFormats' => array_values( array_map( function ( $fmt ) {
			return array( 'value' => $fmt, 'label' => date_i18n( $fmt ) );
		}, $time_formats ) ),
		'isMultisite' => is_multisite(),
		'siteurlConst' => defined( 'WP_SITEURL' ),
		'homeConst'    => defined( 'WP_HOME' ),
		'pendingAdminEmail' => get_option( 'new_admin_email' ),
		'weekdays'     => array_map( function ( $i ) {
			global $wp_locale;
			return array( 'value' => (string) $i, 'label' => $wp_locale->get_weekday( $i ) );
		}, range( 0, 6 ) ),
	);
}

/**
 * List available workspace configurations from the workspaces/ directory plus
 * any workspaces contributed via `wp_admin_workspaces_register_workspace()`. When a
 * programmatic registration shares a slug with a file-based workspace, the
 * programmatic version wins (mirrors resolver precedence).
 */
function wp_admin_workspaces_get_available_workspaces() {
	$by_slug = array();
	$dir     = WP_ADMIN_WORKSPACES_PATH . 'workspaces/';

	foreach ( glob( $dir . '*.json' ) ?: array() as $file ) {
		$data = json_decode( file_get_contents( $file ), true );
		if ( ! is_array( $data ) ) {
			continue;
		}
		$slug             = basename( $file, '.json' );
		$by_slug[ $slug ] = array(
			'slug'             => $slug,
			'title'            => $data['title'] ?? $slug,
			'description'      => $data['description'] ?? '',
			'user-switchable'  => ! empty( $data['user-switchable'] ),
		);
	}

	if ( class_exists( 'WP_Admin_Workspaces_Registry' ) ) {
		foreach ( WP_Admin_Workspaces_Registry::all() as $slug => $data ) {
			$by_slug[ $slug ] = array(
				'slug'             => $slug,
				'title'            => $data['title'] ?? $slug,
				'description'      => $data['description'] ?? '',
				'user-switchable'  => ! empty( $data['user-switchable'] ),
			);
		}
	}

	return array_values( $by_slug );
}
