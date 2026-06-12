<?php
/**
 * Abilities API surface — workspace customization abilities.
 *
 * Registers the `wp-admin-workspaces/*` abilities (WordPress Abilities API,
 * core in WP 6.9+) that let clients — AI agents via the `wp-abilities/v1`
 * REST namespace first, in-workspace JS later — discover and customize the
 * workspace. Three layers:
 *
 *   - Read primitives (`meta.readonly`): the resolved config, the
 *     customization surface report, the raw user/site origin slices, the
 *     workspace catalog.
 *   - Write primitives: patch the user-prefs slice (user-tier, allowlist
 *     enforced by the cascade) or the site-config slice (trusted tier,
 *     `manage_options`).
 *   - Semantic abilities: task-shaped wrappers (switch workspace, set the
 *     default screen, hide/show a menu item) with validated inputs.
 *
 * The abilities are thin transports over machinery that already exists:
 * `WP_Admin_Workspaces_Resolver` (resolve), `WP_Admin_Workspaces_Customizable`
 * (allowlist + deny-list enforcement, surface description), the
 * `wp_admin_workspaces_site_config` option and `wp_admin_workspaces_user_prefs`
 * user-meta (persisted slices — both already wired to cache invalidation).
 * Enforcement does NOT move here: user-tier writes are stored verbatim
 * (parity with the `/user-prefs` REST transport) and the cascade resolver
 * filters them at read time. What the abilities ADD for agents is feedback —
 * `update-user-prefs` pre-flights the patch against `customizable`
 * enforcement and reports which paths will take effect (`applied`) and which
 * the cascade will ignore (`rejected`).
 *
 * Version gate: feature-detected, not version-pinned. On WordPress < 6.9
 * the `wp_abilities_api_*` hooks never fire and `wp_register_ability()`
 * doesn't exist — registration silently no-ops, matching the plugin's
 * runtime-guard philosophy (see `wp_admin_workspaces_dependencies_met()`).
 *
 * Ability IDs are STABLE API — renaming one is a breaking change for every
 * client that learned it. Catalog + schemas documented in `docs/abilities.md`.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Abilities {

	const CATEGORY = 'wp-admin-workspaces';

	/**
	 * Feature-detect the Abilities API (core in WP 6.9+). Belt-and-braces:
	 * the registration hooks only fire when the API exists, but the
	 * callbacks re-check so a partial polyfill can't half-register.
	 *
	 * @return bool
	 */
	public static function supported() {
		return function_exists( 'wp_register_ability' )
			&& function_exists( 'wp_register_ability_category' );
	}

	/**
	 * Hook registration. Categories MUST register before abilities —
	 * `wp_abilities_api_categories_init` fires before `wp_abilities_api_init`
	 * and registering outside the dedicated hooks is _doing_it_wrong().
	 */
	public static function boot() {
		add_action( 'wp_abilities_api_categories_init', array( __CLASS__, 'register_category' ) );
		add_action( 'wp_abilities_api_init', array( __CLASS__, 'register_abilities' ) );
	}

	public static function register_category() {
		if ( ! self::supported() ) {
			return;
		}
		wp_register_ability_category(
			self::CATEGORY,
			array(
				'label'       => __( 'WP Admin Workspaces', 'wp-admin-workspaces' ),
				'description' => __( 'Inspect and customize the WP Admin Workspaces admin experience: resolved workspace configuration, per-tier customization, workspace switching, menu visibility.', 'wp-admin-workspaces' ),
			)
		);
	}

	public static function register_abilities() {
		if ( ! self::supported() ) {
			return;
		}
		foreach ( self::specs() as $id => $args ) {
			wp_register_ability( $id, $args );
		}
	}

	// ─── Permission callbacks ────────────────────────────────────────────

	public static function permission_logged_in() {
		return is_user_logged_in();
	}

	public static function permission_manage_options() {
		return current_user_can( 'manage_options' );
	}

	// ─── Ability catalog ─────────────────────────────────────────────────

	/**
	 * The ability registration table. IDs are stable API.
	 *
	 * Descriptions are written for machine consumers (LLM agents): they
	 * spell out preconditions, side effects, and which companion ability to
	 * consult, because the description is most of what an agent gets.
	 *
	 * @return array<string, array> id => wp_register_ability() args.
	 */
	private static function specs() {
		$doc_schema = array(
			'type'                 => 'object',
			'additionalProperties' => true,
		);

		return array(

			// ── Read primitives ────────────────────────────────────────

			'wp-admin-workspaces/get-workspace-config' => array(
				'label'               => __( 'Get workspace configuration', 'wp-admin-workspaces' ),
				'description'         => __( 'Returns the fully resolved workspace.json document for the current user — all six cascade origins merged, pruned to the screens and menu items the user can reach. Pass "blocks" to fetch a subset (e.g. ["screens","menu"]) and keep the payload small. Read-only; reflects what the workspace UI actually renders for this user.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'get_workspace_config' ),
				'permission_callback' => array( __CLASS__, 'permission_logged_in' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'blocks' => array(
							'type'        => 'array',
							'items'       => array( 'type' => 'string' ),
							'description' => __( 'Top-level blocks to include (e.g. "screens", "menu", "styles", "commands", "settings"). Omit for the full document.', 'wp-admin-workspaces' ),
						),
					),
				),
				'output_schema'       => $doc_schema,
				'meta'                => array(
					'show_in_rest' => true,
					'readonly'     => true,
				),
			),

			'wp-admin-workspaces/describe-customization-surface' => array(
				'label'               => __( 'Describe the customization surface', 'wp-admin-workspaces' ),
				'description'         => __( 'Reports what the current user is allowed to customize, per tier. The "user" tier is allowlist-enforced: only the returned allowedPaths (mode "subtree" = everything under the path; mode "exact" = that leaf only) survive the cascade, and deniedPatterns are rejected even inside an allowed subtree. An empty allowedPaths list means the active workspace declares nothing user-customizable (the default, locked posture). The "site" tier is trusted (no allowlist) but requires the manage_options capability — its "writable" flag reflects the current user. Consult this before calling update-user-prefs or update-site-config.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'describe_customization_surface' ),
				'permission_callback' => array( __CLASS__, 'permission_logged_in' ),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'tiers'               => array(
							'type'       => 'object',
							'properties' => array(
								'user' => array(
									'type'       => 'object',
									'properties' => array(
										'writable'       => array( 'type' => 'boolean' ),
										'enforcement'    => array(
											'type' => 'string',
											'enum' => array( 'allowlist' ),
										),
										'allowedPaths'   => array(
											'type'  => 'array',
											'items' => array(
												'type'       => 'object',
												'properties' => array(
													'path' => array( 'type' => 'string' ),
													'mode' => array(
														'type' => 'string',
														'enum' => array( 'subtree', 'exact' ),
													),
												),
											),
										),
										'deniedPatterns' => array(
											'type'  => 'array',
											'items' => array( 'type' => 'string' ),
										),
									),
								),
								'site' => array(
									'type'       => 'object',
									'properties' => array(
										'writable'    => array( 'type' => 'boolean' ),
										'enforcement' => array(
											'type' => 'string',
											'enum' => array( 'trusted' ),
										),
									),
								),
							),
						),
						'workspaceFileActive' => array(
							'type'        => 'boolean',
							'description' => __( 'True when a wp-content/workspace.json override file is present; the active-workspace option is ignored while it is.', 'wp-admin-workspaces' ),
						),
						'workspaceSwitchable' => array( 'type' => 'boolean' ),
					),
				),
				'meta'                => array(
					'show_in_rest' => true,
					'readonly'     => true,
				),
			),

			'wp-admin-workspaces/get-user-prefs' => array(
				'label'               => __( 'Get user workspace preferences', 'wp-admin-workspaces' ),
				'description'         => __( 'Returns the current user\'s stored workspace preference slice (the "user" cascade origin) verbatim. Note: stored is not the same as effective — the cascade filters this slice against the workspace\'s customizable allowlist at read time. Use describe-customization-surface to see which of these paths actually take effect.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'get_user_prefs' ),
				'permission_callback' => array( __CLASS__, 'permission_logged_in' ),
				'output_schema'       => $doc_schema,
				'meta'                => array(
					'show_in_rest' => true,
					'readonly'     => true,
				),
			),

			'wp-admin-workspaces/get-site-config' => array(
				'label'               => __( 'Get site workspace configuration', 'wp-admin-workspaces' ),
				'description'         => __( 'Returns the site-tier workspace configuration slice (the wp_admin_workspaces_site_config option) verbatim — the site-wide overrides layered on the active workspace for every user. Null values are tombstones that remove the matching baseline entry. Requires manage_options.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'get_site_config' ),
				'permission_callback' => array( __CLASS__, 'permission_manage_options' ),
				'output_schema'       => $doc_schema,
				'meta'                => array(
					'show_in_rest' => true,
					'readonly'     => true,
				),
			),

			'wp-admin-workspaces/list-workspaces' => array(
				'label'               => __( 'List available workspaces', 'wp-admin-workspaces' ),
				'description'         => __( 'Lists every workspace that can be activated (bundled JSON files plus programmatic registrations), the currently active slug, and whether a wp-content/workspace.json override file is in force (when it is, switch-workspace is unavailable). Workspaces flagged user-switchable may also be selected per-user via the "workspace" key in update-user-prefs.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'list_workspaces' ),
				'permission_callback' => array( __CLASS__, 'permission_logged_in' ),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'workspaces'          => array(
							'type'  => 'array',
							'items' => array(
								'type'       => 'object',
								'properties' => array(
									'slug'            => array( 'type' => 'string' ),
									'title'           => array( 'type' => 'string' ),
									'description'     => array( 'type' => 'string' ),
									'user-switchable' => array( 'type' => 'boolean' ),
								),
							),
						),
						'active'              => array( 'type' => 'string' ),
						'workspaceFileActive' => array( 'type' => 'boolean' ),
					),
				),
				'meta'                => array(
					'show_in_rest' => true,
					'readonly'     => true,
				),
			),

			// ── Write primitives ───────────────────────────────────────

			'wp-admin-workspaces/update-user-prefs' => array(
				'label'               => __( 'Update user workspace preferences', 'wp-admin-workspaces' ),
				'description'         => __( 'Deep-merges a partial patch onto the current user\'s workspace preference slice. A null value deletes the stored key. The patch is STORED verbatim but only paths the active workspace declares customizable take effect in the cascade — the response reports which leaf paths will apply ("applied") and which the cascade will ignore ("rejected"); the "workspace" key (a per-user workspace switch, honored only for user-switchable workspaces) is reported under "outOfBand". Call describe-customization-surface first to learn the writable paths.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'update_user_prefs' ),
				'permission_callback' => array( __CLASS__, 'permission_logged_in' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'prefs' => array(
							'type'                 => 'object',
							'additionalProperties' => true,
							'description'          => __( 'Partial preference document to deep-merge (e.g. {"styles":{"theme":{"accent":"#0073aa"}}}). Null deletes a stored key.', 'wp-admin-workspaces' ),
						),
					),
					'required'   => array( 'prefs' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'prefs'     => $doc_schema,
						'applied'   => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'rejected'  => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'outOfBand' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),

			'wp-admin-workspaces/reset-user-prefs' => array(
				'label'               => __( 'Reset user workspace preferences', 'wp-admin-workspaces' ),
				'description'         => __( 'Deletes the current user\'s entire workspace preference slice, returning them to the workspace defaults resolved from the site, role, and workspace tiers. Irreversible — there is no undo for the discarded preferences.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'reset_user_prefs' ),
				'permission_callback' => array( __CLASS__, 'permission_logged_in' ),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'prefs' => $doc_schema,
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),

			'wp-admin-workspaces/update-site-config' => array(
				'label'               => __( 'Update site workspace configuration', 'wp-admin-workspaces' ),
				'description'         => __( 'Deep-merges a partial patch onto the site-tier workspace configuration, which applies to EVERY user of this site. The site tier is trusted: no customizable allowlist applies, and null values are stored as tombstones that REMOVE the matching entry from the resolved workspace (e.g. {"menu":{"comments":null}} hides the Comments menu item site-wide). To delete a previously stored key from this slice (including undoing a tombstone), list its dotted path in "remove". Requires manage_options.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'update_site_config' ),
				'permission_callback' => array( __CLASS__, 'permission_manage_options' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'config' => array(
							'type'                 => 'object',
							'additionalProperties' => true,
							'description'          => __( 'Partial workspace document to deep-merge. Null values are stored as tombstones (they remove the matching baseline entry at resolve time).', 'wp-admin-workspaces' ),
						),
						'remove' => array(
							'type'        => 'array',
							'items'       => array( 'type' => 'string' ),
							'description' => __( 'Dotted paths to delete from the stored slice (e.g. "menu.comments" to undo a tombstone). Path segments cannot themselves contain dots.', 'wp-admin-workspaces' ),
						),
					),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'config' => $doc_schema,
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),

			// ── Semantic abilities ─────────────────────────────────────

			'wp-admin-workspaces/switch-workspace' => array(
				'label'               => __( 'Switch the active workspace', 'wp-admin-workspaces' ),
				'description'         => __( 'Sets the site-wide active workspace (every user is affected). Fails when the slug is not in list-workspaces, or when a wp-content/workspace.json override file is in force (the file wins over the option, so the switch would be a silent no-op). For a per-user switch, set the "workspace" key via update-user-prefs instead — honored only for workspaces flagged user-switchable. Requires manage_options.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'switch_workspace' ),
				'permission_callback' => array( __CLASS__, 'permission_manage_options' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'workspace' => array(
							'type'        => 'string',
							'description' => __( 'Slug of the workspace to activate (see list-workspaces).', 'wp-admin-workspaces' ),
						),
					),
					'required'   => array( 'workspace' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'active' => array( 'type' => 'string' ),
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),

			'wp-admin-workspaces/set-default-screen' => array(
				'label'               => __( 'Set the default screen', 'wp-admin-workspaces' ),
				'description'         => __( 'Sets which screen the workspace opens on (site-wide, all users) by writing "default-screen" to the site tier. The screen id must exist in the resolved workspace — fetch get-workspace-config with blocks ["screens"] to see valid ids; on failure the error data includes them. Requires manage_options.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'set_default_screen' ),
				'permission_callback' => array( __CLASS__, 'permission_manage_options' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'screen' => array(
							'type'        => 'string',
							'description' => __( 'Screen id (a key of the resolved "screens" map).', 'wp-admin-workspaces' ),
						),
					),
					'required'   => array( 'screen' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'default-screen' => array( 'type' => 'string' ),
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),

			'wp-admin-workspaces/hide-menu-item' => array(
				'label'               => __( 'Hide a menu item', 'wp-admin-workspaces' ),
				'description'         => __( 'Hides a navigation menu item site-wide (every user) by writing a null tombstone at its position in the site tier. Cosmetic only: the underlying screen stays reachable by URL and its capability gates are untouched. The id must exist in the resolved menu tree (fetch get-workspace-config with blocks ["menu"]). Undo with show-menu-item. Requires manage_options.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'hide_menu_item' ),
				'permission_callback' => array( __CLASS__, 'permission_manage_options' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'id' => array(
							'type'        => 'string',
							'description' => __( 'Menu item id (a key in the resolved "menu" tree, at any depth).', 'wp-admin-workspaces' ),
						),
					),
					'required'   => array( 'id' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'id'     => array( 'type' => 'string' ),
						'path'   => array( 'type' => 'string' ),
						'hidden' => array( 'type' => 'boolean' ),
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),

			'wp-admin-workspaces/show-menu-item' => array(
				'label'               => __( 'Show a hidden menu item', 'wp-admin-workspaces' ),
				'description'         => __( 'Restores a menu item previously hidden at the site tier (the inverse of hide-menu-item) by removing its null tombstone from the site configuration slice. Fails when the id is not tombstoned at the site tier — an item hidden by the workspace file or a role/user slice cannot be restored here. Requires manage_options.', 'wp-admin-workspaces' ),
				'category'            => self::CATEGORY,
				'execute_callback'    => array( __CLASS__, 'show_menu_item' ),
				'permission_callback' => array( __CLASS__, 'permission_manage_options' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'id' => array(
							'type'        => 'string',
							'description' => __( 'Menu item id that was hidden via hide-menu-item.', 'wp-admin-workspaces' ),
						),
					),
					'required'   => array( 'id' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'id'     => array( 'type' => 'string' ),
						'hidden' => array( 'type' => 'boolean' ),
					),
				),
				'meta'                => array( 'show_in_rest' => true ),
			),
		);
	}

	// ─── Read callbacks ──────────────────────────────────────────────────

	/**
	 * @param array|null $input Optional `{ blocks: string[] }`.
	 * @return array
	 */
	public static function get_workspace_config( $input = null ) {
		$config = wp_admin_workspaces_get_active_config();
		if ( ! is_array( $config ) ) {
			$config = array();
		}
		// Same visibility prune as the inline payload + /config REST — an
		// agent acting for this user sees what the user's workspace renders.
		$config = wp_admin_workspaces_prune_config_for_user( $config, get_current_user_id() );

		$blocks = is_array( $input ) ? ( $input['blocks'] ?? null ) : null;
		if ( is_array( $blocks ) && ! empty( $blocks ) ) {
			$config = array_intersect_key(
				$config,
				array_fill_keys( array_filter( $blocks, 'is_string' ), true )
			);
		}
		return self::object_if_empty( $config );
	}

	public static function describe_customization_surface() {
		$resolved = wp_admin_workspaces_get_active_config();
		$file_active = self::workspace_file_active();

		return array(
			'tiers'               => array(
				'user' => array(
					// The ability's permission floor is logged-in, and every
					// logged-in user owns a prefs slice.
					'writable'       => true,
					'enforcement'    => 'allowlist',
					'allowedPaths'   => WP_Admin_Workspaces_Customizable::describe_writable_paths(
						is_array( $resolved ) ? $resolved : array()
					),
					'deniedPatterns' => array_values( WP_Admin_Workspaces_Customizable::DENY_PATTERNS ),
				),
				'site' => array(
					'writable'    => current_user_can( 'manage_options' ),
					'enforcement' => 'trusted',
				),
			),
			'workspaceFileActive' => $file_active,
			'workspaceSwitchable' => ! $file_active,
		);
	}

	public static function get_user_prefs() {
		$user_id = get_current_user_id();
		$prefs   = $user_id ? get_user_meta( $user_id, WP_Admin_Workspaces_Prefs_REST::META_KEY, true ) : array();
		return self::object_if_empty( is_array( $prefs ) ? $prefs : array() );
	}

	public static function get_site_config() {
		return self::object_if_empty( self::site_config() );
	}

	public static function list_workspaces() {
		return array(
			'workspaces'          => wp_admin_workspaces_get_available_workspaces(),
			'active'              => WP_Admin_Workspaces_Resolver::active_workspace_slug(),
			'workspaceFileActive' => self::workspace_file_active(),
		);
	}

	// ─── Write callbacks ─────────────────────────────────────────────────

	/**
	 * @param array|null $input `{ prefs: object }`.
	 * @return array|WP_Error
	 */
	public static function update_user_prefs( $input = null ) {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'Login required.', 'wp-admin-workspaces' ),
				array( 'status' => 403 )
			);
		}
		$patch = is_array( $input ) ? ( $input['prefs'] ?? null ) : null;
		if ( ! is_array( $patch ) ) {
			return new WP_Error(
				'rest_invalid_param',
				__( '"prefs" must be an object.', 'wp-admin-workspaces' ),
				array( 'status' => 400 )
			);
		}
		$bounds = self::check_patch_bounds( $patch );
		if ( is_wp_error( $bounds ) ) {
			return $bounds;
		}

		// Pre-flight the cascade's verdict BEFORE storing so the agent
		// learns which paths will take effect. Advisory only — storage stays
		// verbatim (parity with the /user-prefs REST transport) and the
		// resolver re-enforces on every read.
		$report = self::preflight_user_patch( $patch );

		$existing = get_user_meta( $user_id, WP_Admin_Workspaces_Prefs_REST::META_KEY, true );
		if ( ! is_array( $existing ) ) {
			$existing = array();
		}
		$merged = WP_Admin_Workspaces_Util::deep_merge_patch( $existing, $patch, true );
		update_user_meta( $user_id, WP_Admin_Workspaces_Prefs_REST::META_KEY, $merged );

		return array(
			'prefs'     => self::object_if_empty( $merged ),
			'applied'   => $report['applied'],
			'rejected'  => $report['rejected'],
			'outOfBand' => $report['out_of_band'],
		);
	}

	public static function reset_user_prefs() {
		$user_id = get_current_user_id();
		if ( $user_id ) {
			delete_user_meta( $user_id, WP_Admin_Workspaces_Prefs_REST::META_KEY );
		}
		return array( 'prefs' => (object) array() );
	}

	/**
	 * @param array|null $input `{ config?: object, remove?: string[] }`.
	 * @return array|WP_Error
	 */
	public static function update_site_config( $input = null ) {
		$patch  = is_array( $input ) ? ( $input['config'] ?? null ) : null;
		$remove = is_array( $input ) ? ( $input['remove'] ?? array() ) : array();
		if ( ! is_array( $remove ) ) {
			$remove = array();
		}
		if ( ! is_array( $patch ) && empty( $remove ) ) {
			return new WP_Error(
				'rest_invalid_param',
				__( 'Provide "config" (object to merge) and/or "remove" (paths to delete).', 'wp-admin-workspaces' ),
				array( 'status' => 400 )
			);
		}
		if ( is_array( $patch ) ) {
			$bounds = self::check_patch_bounds( $patch );
			if ( is_wp_error( $bounds ) ) {
				return $bounds;
			}
		}

		$config = self::site_config();
		if ( is_array( $patch ) ) {
			// Site-tombstone semantics: nulls are STORED (the cascade's
			// merge_with_tombstones consumes them), not key-deletes.
			$config = WP_Admin_Workspaces_Util::deep_merge_patch( $config, $patch, false );
		}
		foreach ( $remove as $path ) {
			if ( is_string( $path ) && $path !== '' ) {
				self::unset_in_tree( $config, explode( '.', $path ) );
			}
		}

		self::save_site_config( $config );
		return array( 'config' => self::object_if_empty( $config ) );
	}

	// ─── Semantic callbacks ──────────────────────────────────────────────

	/**
	 * @param array|null $input `{ workspace: string }`.
	 * @return array|WP_Error
	 */
	public static function switch_workspace( $input = null ) {
		$slug = is_array( $input ) ? ( $input['workspace'] ?? '' ) : '';
		$slug = is_string( $slug ) ? sanitize_file_name( $slug ) : '';
		if ( $slug === '' ) {
			return new WP_Error(
				'rest_invalid_param',
				__( '"workspace" must be a non-empty workspace slug.', 'wp-admin-workspaces' ),
				array( 'status' => 400 )
			);
		}
		if ( self::workspace_file_active() ) {
			return new WP_Error(
				'wp_admin_workspaces_workspace_file_active',
				__( 'A wp-content/workspace.json override file is active; it wins over the active-workspace option, so switching would have no effect. Remove the file to switch workspaces.', 'wp-admin-workspaces' ),
				array( 'status' => 409 )
			);
		}
		$available = wp_list_pluck( wp_admin_workspaces_get_available_workspaces(), 'slug' );
		if ( ! in_array( $slug, $available, true ) ) {
			return new WP_Error(
				'wp_admin_workspaces_unknown_workspace',
				__( 'Unknown workspace slug.', 'wp-admin-workspaces' ),
				array(
					'status'     => 404,
					'workspaces' => array_values( $available ),
				)
			);
		}
		update_option( 'wp_admin_workspaces_active_workspace', $slug );
		return array( 'active' => $slug );
	}

	/**
	 * @param array|null $input `{ screen: string }`.
	 * @return array|WP_Error
	 */
	public static function set_default_screen( $input = null ) {
		$screen = is_array( $input ) ? ( $input['screen'] ?? '' ) : '';
		$screen = is_string( $screen ) ? trim( $screen ) : '';
		if ( $screen === '' ) {
			return new WP_Error(
				'rest_invalid_param',
				__( '"screen" must be a non-empty screen id.', 'wp-admin-workspaces' ),
				array( 'status' => 400 )
			);
		}
		$resolved = wp_admin_workspaces_get_active_config();
		$screens  = is_array( $resolved ) && isset( $resolved['screens'] ) && is_array( $resolved['screens'] )
			? $resolved['screens']
			: array();
		if ( ! isset( $screens[ $screen ] ) ) {
			return new WP_Error(
				'wp_admin_workspaces_unknown_screen',
				__( 'No screen with that id exists in the resolved workspace.', 'wp-admin-workspaces' ),
				array(
					'status'  => 404,
					'screens' => array_keys( $screens ),
				)
			);
		}

		$config                     = self::site_config();
		$config['default-screen']   = $screen;
		self::save_site_config( $config );

		return array( 'default-screen' => $screen );
	}

	/**
	 * @param array|null $input `{ id: string }`.
	 * @return array|WP_Error
	 */
	public static function hide_menu_item( $input = null ) {
		$id = self::menu_id_input( $input );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$resolved = wp_admin_workspaces_get_active_config();
		$menu     = is_array( $resolved ) && isset( $resolved['menu'] ) && is_array( $resolved['menu'] )
			? $resolved['menu']
			: array();
		$segments = self::find_menu_path( $menu, $id );
		if ( $segments === null ) {
			return new WP_Error(
				'wp_admin_workspaces_unknown_menu_item',
				__( 'No menu item with that id exists in the resolved menu tree.', 'wp-admin-workspaces' ),
				array( 'status' => 404 )
			);
		}

		$config = self::site_config();
		self::set_in_tree( $config, array_merge( array( 'menu' ), $segments ), null );
		self::save_site_config( $config );

		return array(
			'id'     => $id,
			'path'   => 'menu.' . implode( '.', $segments ),
			'hidden' => true,
		);
	}

	/**
	 * @param array|null $input `{ id: string }`.
	 * @return array|WP_Error
	 */
	public static function show_menu_item( $input = null ) {
		$id = self::menu_id_input( $input );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$config   = self::site_config();
		$menu     = isset( $config['menu'] ) && is_array( $config['menu'] ) ? $config['menu'] : array();
		$segments = self::find_null_key_path( $menu, $id );
		if ( $segments === null ) {
			return new WP_Error(
				'wp_admin_workspaces_menu_item_not_hidden',
				__( 'That menu item is not hidden at the site tier. Items hidden by the workspace file or another origin cannot be restored here.', 'wp-admin-workspaces' ),
				array( 'status' => 404 )
			);
		}
		self::unset_in_tree( $config, array_merge( array( 'menu' ), $segments ) );
		self::save_site_config( $config );

		return array(
			'id'     => $id,
			'hidden' => false,
		);
	}

	// ─── Internals ───────────────────────────────────────────────────────

	private static function workspace_file_active() {
		return class_exists( 'WP_Admin_Workspaces_Origin_File' )
			&& WP_Admin_Workspaces_Origin_File::exists_and_valid();
	}

	private static function site_config() {
		$config = get_option( 'wp_admin_workspaces_site_config', array() );
		return is_array( $config ) ? $config : array();
	}

	private static function save_site_config( $config ) {
		// The update_option_wp_admin_workspaces_site_config hook flushes the
		// cascade cache, and the resolver's cache key hashes the option
		// contents, so a same-request re-resolve misses the memo naturally.
		update_option( 'wp_admin_workspaces_site_config', $config );
	}

	/**
	 * JSON-shape nicety: an empty PHP array encodes as `[]`, but every
	 * doc-shaped output here is an object. Schema validation accepts both;
	 * agents parse `{}` more predictably.
	 *
	 * @param array $value Possibly-empty assoc array.
	 * @return array|object
	 */
	private static function object_if_empty( $value ) {
		return empty( $value ) ? (object) array() : $value;
	}

	/**
	 * Shared size bounds with the /user-prefs REST transport — these slices
	 * are structural UI state, not a data store, and they're re-read +
	 * merged on every admin page load.
	 *
	 * @param array $patch Decoded patch.
	 * @return true|WP_Error
	 */
	private static function check_patch_bounds( $patch ) {
		$encoded = wp_json_encode( $patch );
		if ( is_string( $encoded ) && strlen( $encoded ) > WP_Admin_Workspaces_Prefs_REST::MAX_BYTES ) {
			return new WP_Error(
				'rest_request_too_large',
				__( 'Patch payload too large.', 'wp-admin-workspaces' ),
				array( 'status' => 413 )
			);
		}
		if ( WP_Admin_Workspaces_Util::count_keys( $patch, WP_Admin_Workspaces_Prefs_REST::MAX_KEYS ) > WP_Admin_Workspaces_Prefs_REST::MAX_KEYS ) {
			return new WP_Error(
				'rest_request_too_large',
				__( 'Patch payload has too many keys.', 'wp-admin-workspaces' ),
				array( 'status' => 413 )
			);
		}
		return true;
	}

	/**
	 * Run a user-tier patch through the same `customizable` enforcement the
	 * resolver applies, and diff leaf paths to report what will stick.
	 *
	 * The `workspace` key (a string slug) is read out-of-band by
	 * `Resolver::active_workspace_slug()` — it never travels the cascade
	 * merge, so it's excluded from the diff and reported separately.
	 *
	 * @param array $patch The user-prefs patch.
	 * @return array { applied: string[], rejected: string[], out_of_band: string[] }
	 */
	private static function preflight_user_patch( $patch ) {
		$out_of_band = array();
		if ( array_key_exists( 'workspace', $patch ) && ! is_array( $patch['workspace'] ) ) {
			$out_of_band[] = 'workspace';
			unset( $patch['workspace'] );
		}

		$resolved = wp_admin_workspaces_get_active_config();
		$accepted = WP_Admin_Workspaces_Customizable::filter_doc(
			is_array( $resolved ) ? $resolved : array(),
			$patch,
			'user'
		);

		$patch_paths    = array();
		$accepted_paths = array();
		self::flatten_paths( $patch, '', $patch_paths );
		self::flatten_paths( $accepted, '', $accepted_paths );

		return array(
			'applied'     => array_values( array_intersect( $patch_paths, $accepted_paths ) ),
			'rejected'    => array_values( array_diff( $patch_paths, $accepted_paths ) ),
			'out_of_band' => $out_of_band,
		);
	}

	/**
	 * Flatten a tree into dotted leaf paths. Keyed lists (entries carrying
	 * id/slug/name) step by id — mirrors the enforcement walker so the
	 * pre-flight diff compares like with like.
	 *
	 * @param mixed  $value  Subtree.
	 * @param string $prefix Accumulated dotted path.
	 * @param array  $out    Accumulator (by reference).
	 */
	private static function flatten_paths( $value, $prefix, &$out ) {
		if ( ! is_array( $value ) || empty( $value ) ) {
			if ( $prefix !== '' ) {
				$out[] = $prefix;
			}
			return;
		}
		if ( WP_Admin_Workspaces_Util::is_assoc( $value ) ) {
			foreach ( $value as $k => $v ) {
				self::flatten_paths( $v, $prefix === '' ? (string) $k : $prefix . '.' . $k, $out );
			}
			return;
		}
		$key   = null;
		$first = reset( $value );
		if ( is_array( $first ) ) {
			foreach ( array( 'id', 'slug', 'name' ) as $k ) {
				if ( array_key_exists( $k, $first ) ) {
					$key = $k;
					break;
				}
			}
		}
		if ( $key !== null ) {
			foreach ( $value as $entry ) {
				if ( is_array( $entry ) && isset( $entry[ $key ] ) ) {
					self::flatten_paths( $entry, $prefix . '.' . $entry[ $key ], $out );
				}
			}
			return;
		}
		foreach ( $value as $i => $entry ) {
			self::flatten_paths( $entry, $prefix . '.' . $i, $out );
		}
	}

	/**
	 * @param array|null $input Ability input.
	 * @return string|WP_Error Validated menu item id.
	 */
	private static function menu_id_input( $input ) {
		$id = is_array( $input ) ? ( $input['id'] ?? '' ) : '';
		if ( ! is_string( $id ) || trim( $id ) === '' ) {
			return new WP_Error(
				'rest_invalid_param',
				__( '"id" must be a non-empty menu item id.', 'wp-admin-workspaces' ),
				array( 'status' => 400 )
			);
		}
		return trim( $id );
	}

	/**
	 * Locate a menu item id in the resolved menu tree. Items nest under
	 * `items`; the tree is normally an id-keyed map but list-of-keyed
	 * entries are handled too (the merge engine accepts both shapes).
	 *
	 * @param array  $tree Menu tree (or an `items` subtree).
	 * @param string $id   Item id to find.
	 * @return string[]|null Path segments relative to the menu root (e.g.
	 *                       `[ 'users', 'items', 'profile' ]`), or null.
	 */
	private static function find_menu_path( $tree, $id, $prefix = array() ) {
		if ( ! is_array( $tree ) ) {
			return null;
		}
		if ( WP_Admin_Workspaces_Util::is_assoc( $tree ) ) {
			foreach ( $tree as $key => $item ) {
				if ( (string) $key === $id ) {
					return array_merge( $prefix, array( (string) $key ) );
				}
				if ( is_array( $item ) && isset( $item['items'] ) && is_array( $item['items'] ) ) {
					$found = self::find_menu_path(
						$item['items'],
						$id,
						array_merge( $prefix, array( (string) $key, 'items' ) )
					);
					if ( $found !== null ) {
						return $found;
					}
				}
			}
			return null;
		}
		foreach ( $tree as $item ) {
			if ( ! is_array( $item ) || ! isset( $item['id'] ) ) {
				continue;
			}
			$key = (string) $item['id'];
			if ( $key === $id ) {
				return array_merge( $prefix, array( $key ) );
			}
			if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
				$found = self::find_menu_path(
					$item['items'],
					$id,
					array_merge( $prefix, array( $key, 'items' ) )
				);
				if ( $found !== null ) {
					return $found;
				}
			}
		}
		return null;
	}

	/**
	 * Find a key `$id` holding a null tombstone anywhere in a stored
	 * subtree (the shape hide_menu_item wrote).
	 *
	 * @param array  $node Stored site-slice subtree.
	 * @param string $id   Key to find.
	 * @return string[]|null Path segments, or null when not tombstoned.
	 */
	private static function find_null_key_path( $node, $id, $prefix = array() ) {
		if ( ! is_array( $node ) ) {
			return null;
		}
		foreach ( $node as $key => $value ) {
			if ( (string) $key === $id && $value === null ) {
				return array_merge( $prefix, array( (string) $key ) );
			}
			if ( is_array( $value ) ) {
				$found = self::find_null_key_path( $value, $id, array_merge( $prefix, array( (string) $key ) ) );
				if ( $found !== null ) {
					return $found;
				}
			}
		}
		return null;
	}

	/**
	 * Segment-array setter — unlike a dotted-path setter, ids containing
	 * dots survive.
	 */
	private static function set_in_tree( &$arr, $segments, $value ) {
		$cur = &$arr;
		foreach ( $segments as $i => $seg ) {
			if ( $i === count( $segments ) - 1 ) {
				$cur[ $seg ] = $value;
				return;
			}
			if ( ! isset( $cur[ $seg ] ) || ! is_array( $cur[ $seg ] ) ) {
				$cur[ $seg ] = array();
			}
			$cur = &$cur[ $seg ];
		}
	}

	/**
	 * Segment-array unsetter. Returns whether the key existed.
	 */
	private static function unset_in_tree( &$arr, $segments ) {
		$cur  = &$arr;
		$last = array_pop( $segments );
		foreach ( $segments as $seg ) {
			if ( ! isset( $cur[ $seg ] ) || ! is_array( $cur[ $seg ] ) ) {
				return false;
			}
			$cur = &$cur[ $seg ];
		}
		if ( is_array( $cur ) && array_key_exists( $last, $cur ) ) {
			unset( $cur[ $last ] );
			return true;
		}
		return false;
	}
}

WP_Admin_Workspaces_Abilities::boot();
