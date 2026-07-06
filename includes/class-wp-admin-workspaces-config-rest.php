<?php
/**
 * /wp-admin-workspaces/v1/config — freshly resolved workspace config.
 *
 * Companion to the inline `window.wpAdminWorkspaces` payload injected at page
 * load. The in-process workspace re-mount path (issue #28) calls this after
 * `switchWorkspace()` writes the active-workspace option so the kernel can
 * re-render with the new workspace's resolved doc WITHOUT a hard reload.
 *
 * Returns only the workspace-VARIANT slice the kernel swaps on a re-mount:
 *   - `config`       — the cascade-resolved doc, pruned to the user's
 *                      reachable screens/menu (mirrors the inline `config`).
 *   - `capabilities` — the pre-computed cap map for that pruned config.
 *   - `adminRoutes`  — the classic→workspace legacy-route map.
 *   - `tokens`       — the resolved DTCG tree (or `{}`), config-gated.
 *   - `engineModes`  — the flattened modes catalog, engine-variant.
 *
 * Workspace-INVARIANT fields (siteUrl, user, nonce, manifests, …) don't
 * change across a switch, so they stay as injected at page load and are
 * deliberately omitted here. `tokens` and `engineModes` are the exceptions.
 * `tokens`' *values* are site/theme/plugin/core-derived (invariant), but its
 * *presence* is gated per-config — an alias-free workspace ships `{}`, one
 * whose `styles` reference foreign token aliases ships the full DTCG tree.
 * `engineModes` is derived from the active engine manifest, so a cross-engine
 * switch resolves a different catalog. Both must be re-sent on a switch using
 * the same derivation as the inline payload, or the kernel (which reads them
 * off the unchanged global, not `config`) renders against the stale values.
 *
 * The cascade cache is invalidated server-side by the
 * `update_option_wp_admin_workspaces_active_workspace` hook before this is
 * called, so `wp_admin_workspaces_get_active_config()` resolves the new
 * active workspace.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Config_REST {

	const NAMESPACE = 'wp-admin-workspaces/v1';

	public static function register() {
		register_rest_route(
			self::NAMESPACE,
			'/config',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_config' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
				),
			)
		);
	}

	/**
	 * Logged-in gate. Per-screen capability gating is already baked into the
	 * pruned config + capability map (the same prune the inline payload uses),
	 * so an authenticated user only ever sees screens they can reach.
	 *
	 * @return bool
	 */
	public static function permission_check() {
		return is_user_logged_in();
	}

	/**
	 * Resolve + prune the active workspace config for the current user.
	 *
	 * @return WP_REST_Response
	 */
	public static function get_config() {
		$config = wp_admin_workspaces_get_active_config();

		// Server-side visibility prune — identical to the inline payload so a
		// re-mount never carries an unreachable screen's permissions/legacy
		// maps or a role-gated nav item the client can't gate.
		$client_config = wp_admin_workspaces_prune_config_for_user(
			$config,
			get_current_user_id()
		);

		// Resolve the NEW config's active engine manifest the same way the
		// page-load payload does (wp-admin-workspaces.php) — off the unpruned
		// `$config`, which is engine-invariant per user. Drives `engineModes`
		// below; the modes catalog is derived from this manifest.
		$active_engine_id       = is_array( $config )
			? ( $config['engine'] ?? null )
			: null;
		$active_engine_manifest = $active_engine_id
			? WP_Admin_Workspaces_Manifest_Registry::instance()->get_engine( $active_engine_id )
			: null;

		// This GET has no varying query string (the nonce rides the
		// X-WP-Nonce header), so two switches in one session hit the
		// identical URL. Suppress browser/proxy caching so a B→A switch
		// after an A→B switch never serves B's cached config.
		nocache_headers();

		return rest_ensure_response(
			array(
				'config'       => $client_config,
				'capabilities' => wp_admin_workspaces_resolve_capabilities( $client_config ),
				'adminRoutes'  => WP_Admin_Workspaces_Admin_Routes::legacy_map( $client_config ),
				// Config-gated, NOT workspace-invariant: an alias-free
				// workspace ships `{}`; switching to one whose `styles`
				// reference foreign token aliases needs the resolved DTCG
				// tree or those aliases won't resolve on re-mount. Gate the
				// unpruned `$config` exactly as the inline payload does.
				'tokens'       => wp_admin_workspaces_styles_reference_tokens( $config )
					? WP_Admin_Workspaces_Tokens::resolve()
					: (object) array(),
				// Engine-variant, same class as `tokens`: the modes catalog is
				// derived from the active engine manifest, so a cross-engine
				// switch must re-send it or `useMode()` resolves the new
				// workspace's screens against the stale catalog (wrong
				// `data-mode-*`). Mirrors the page-load payload's derivation
				// (active manifest → resolve_engine_modes, else the synthesized
				// default catalog).
				'engineModes'  => $active_engine_manifest
					? WP_Admin_Workspaces_Modes::resolve_engine_modes( $active_engine_manifest )
					: WP_Admin_Workspaces_Modes::synthesize_default_catalog(),
			)
		);
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Workspaces_Config_REST', 'register' ) );
