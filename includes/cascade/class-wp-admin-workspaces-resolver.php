<?php
/**
 * Cascade resolver — merges the five origins into a single config tree.
 *
 * Origins (highest → lowest precedence):
 *   user   — wp_admin_workspaces_user_prefs (current user only)
 *   role   — wp_admin_workspaces_role_config[<role>]
 *   site   — wp_admin_workspaces_site_config option
 *   plugin — wp-content/workspace.json override (partial delta) when present;
 *            otherwise the back-compat selected shell (full, replaces the
 *            baseline)
 *   engine — synthetic: the active engine's default-styles
 *   core   — the wp-admin-default baseline when an override file is
 *            present; otherwise the empty guard baseline
 *
 * Each origin is loaded into a normalized doc, optionally filtered with
 * `wp_admin_workspaces_data_{origin}`, run through `customizable` filtering
 * against the upstream merged tree, and merged with restrict-only
 * semantics. After all origins fold in, `wp_admin_workspaces_data` runs as
 * the final filter.
 *
 * Cache + filter timing.
 * The resolver memoizes through WP_Admin_Workspaces_Cache (object cache +
 * transient). On a cache hit, origin loaders AND filters are skipped —
 * the merged tree returns directly. This matches `WP_Theme_JSON_Resolver`
 * behavior. Implications for plugin authors:
 *
 *   - `wp_admin_workspaces_data_*` filter changes do not take effect until
 *     the next natural cache invalidation (option/meta write,
 *     plugin/theme activation, role change) or a manual flush via
 *     `WP_Admin_Workspaces_Cache::flush()`.
 *   - Plugins hooking the filter at activation time get a flush
 *     automatically (the `activated_plugin` action triggers it).
 *   - Plugins hooking conditionally (e.g. only when a setting toggles)
 *     should call the flush themselves on the trigger.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Resolver {

	const ORIGINS_ORDER = array( 'core', 'engine', 'plugin', 'site', 'role', 'user' );

	/** @var array Per-request resolved-doc memo, keyed by cache key. */
	private static $request_memo = array();

	public static function resolve( $context = array() ) {
		$context['workspace'] = $context['workspace'] ?? self::active_workspace_slug();

		$cache_key = class_exists( 'WP_Admin_Workspaces_Cache' )
			? WP_Admin_Workspaces_Cache::key_for( $context )
			: null;

		// Request-scope memo — zero cost on repeat calls within a single
		// request (the WP_Object_Cache layer adds ~0.2ms per hit; this
		// avoids that for callers that resolve multiple times per request).
		if ( $cache_key !== null && isset( self::$request_memo[ $cache_key ] ) ) {
			return self::$request_memo[ $cache_key ];
		}

		if ( $cache_key !== null ) {
			$cached = WP_Admin_Workspaces_Cache::get( $cache_key );
			if ( $cached !== null ) {
				self::$request_memo[ $cache_key ] = $cached;
				return $cached;
			}
		}

		$origins  = self::load_origins( $context );
		$resolved = self::resolve_with( $origins );

		if ( $cache_key !== null ) {
			WP_Admin_Workspaces_Cache::set( $cache_key, $resolved );
			self::$request_memo[ $cache_key ] = $resolved;
		}
		return $resolved;
	}

	/**
	 * Reset the per-request memo. Test-only — production code relies on
	 * the memo lasting the entire request.
	 */
	public static function reset_request_memo() {
		self::$request_memo = array();
	}

	/**
	 * Resolve from a pre-loaded origin map. Useful for tests and for the
	 * cache layer (M2.7) that hands a hydrated map back to the pipeline
	 * without redoing disk / option reads.
	 *
	 * @param array $origins  [ 'core' => array, 'plugin' => array, ... ]
	 */
	const TRUSTED_ORIGINS  = array( 'core', 'engine', 'plugin' );
	const CONSUMER_ORIGINS = array( 'site', 'role', 'user' );

	public static function resolve_with( $origins ) {
		$merged = array();

		// Phase 1 — trusted origins (authoritative).
		foreach ( self::TRUSTED_ORIGINS as $origin ) {
			$doc = $origins[ $origin ] ?? array();
			if ( ! is_array( $doc ) ) {
				continue;
			}
			$doc    = apply_filters( "wp_admin_workspaces_data_{$origin}", $doc );
			$tagged = WP_Admin_Workspaces_Merge::tag_origin( $doc, $origin );
			$merged = WP_Admin_Workspaces_Merge::merge_authoritative( $merged, $tagged );
		}

		// Phase 2 — consumer origins (additive, customizable-filtered).
		// Site sits at the top of the trust tier (core/engine/plugin/site may
		// add+remove; role/user may only remove). Site uses
		// `merge_with_tombstones()` — additive on keyed arrays but tombstones
		// honored. Role/user use strict `merge()` (tombstones no-op). The
		// permissions trust-tier (shrink-only) enforcement runs against
		// `screens[].permissions` BEFORE the merge so role/user can't grow
		// the OR-set even on screens they introduce.
		foreach ( self::CONSUMER_ORIGINS as $origin ) {
			$doc = $origins[ $origin ] ?? array();
			if ( ! is_array( $doc ) ) {
				continue;
			}
			$doc    = apply_filters( "wp_admin_workspaces_data_{$origin}", $doc );
			$doc    = WP_Admin_Workspaces_Customizable::filter_doc( $merged, $doc, $origin );
			$doc    = WP_Admin_Workspaces_Permissions::enforce_origin_tier( $doc, $merged, $origin );
			$tagged = WP_Admin_Workspaces_Merge::tag_origin( $doc, $origin );
			$merged = $origin === 'site'
				? WP_Admin_Workspaces_Merge::merge_with_tombstones( $merged, $tagged )
				: WP_Admin_Workspaces_Merge::merge( $merged, $tagged );
		}

		/**
		 * Filter the fully cascade-merged admin.json doc.
		 *
		 * Fires after every origin has merged. Callbacks receive the
		 * author-shape v3 doc — `workspace` / `screens` / `menu` /
		 * `commands` / `settings`. The kernel derives the runtime surfaces
		 * (`engine` / `routes` / `regions` / `default-route`) from these
		 * blocks JS-side, so mutating a screen / menu item / command here
		 * flows straight through to the runtime.
		 *
		 * Plugin authors contributing screens, menu items, or commands
		 * should prefer the per-origin `wp_admin_workspaces_data_{origin}`
		 * filters at priority 5 — those fire before this hook, before
		 * `customizable` filtering, and before the merge, so the
		 * contribution flows through the cascade naturally (and reaches
		 * the `inject_app_baselines` pass for dataView baselines).
		 *
		 * @param array $merged The cascade-merged author-shape doc.
		 */
		$merged = apply_filters( 'wp_admin_workspaces_data', $merged );
		$merged = WP_Admin_Workspaces_Merge::strip_origin_tags( $merged );

		// Stamp the resolved per-screen DataView doc onto each v3 screen
		// (the resolved (kind, name, variant) triple + the screen's inline
		// `dataView` overlay, with the `wp_admin_workspaces_data_view_config_*`
		// filters applied) so the JS `useDataView` hook's synchronous fast
		// path resolves without a REST round-trip. Runs last, after the
		// `wp_admin_workspaces_data` filter and origin-tag stripping. The kernel
		// derives `routes` / `regions` / `default-route` / `commands` from
		// the v3 blocks JS-side — PHP serializes the author-shape doc.
		if ( class_exists( 'WP_Admin_Workspaces_Data_View_Config' ) ) {
			$merged = WP_Admin_Workspaces_Data_View_Config::stamp_screen_data_views( $merged );
		}

		return $merged;
	}

	/**
	 * Load each origin's doc from disk / DB.
	 *
	 * Plan §M2 source-layout calls for one origin class per origin
	 * (`origins/{core,plugin,site,role,user}.php`). v1 keeps the
	 * core origin as its own class (because of the v0 → v1 normalizer
	 * surface) and inlines plugin/site/role/user as private methods on
	 * the resolver. Functionally equivalent to the planned split; if a
	 * future origin grows complex enough to need its own class
	 * (programmatic plugin shells, network site config), extract then.
	 */
	public static function load_origins( $context = array() ) {
		$plugin_dir = trailingslashit( WP_ADMIN_WORKSPACES_PATH );

		// File-override path (theme.json model). A valid
		// `wp-content/workspace.json` is a PARTIAL delta layered on the
		// `wp-admin-default` baseline: the baseline fills the `core` slot,
		// the file fills `plugin`, and the field-aware merge folds the
		// file's keys over the baseline. The file wins over the legacy
		// active-shell option. A one-key `{ "styles": … }` file retints
		// the chrome while every baseline screen / menu / command survives.
		$file_doc = class_exists( 'WP_Admin_Workspaces_Origin_File' )
			? WP_Admin_Workspaces_Origin_File::load()
			: null;

		if ( is_array( $file_doc ) ) {
			$plugin_doc       = $file_doc;
			$core_doc         = WP_Admin_Workspaces_Origin_Core::load_baseline();
			$effective_engine = $plugin_doc['workspace']['engine']
				?? $plugin_doc['engine']
				?? ( is_array( $core_doc ) ? ( $core_doc['workspace']['engine'] ?? $core_doc['engine'] ?? null ) : null );
		} else {
			// Back-compat path — a selected full shell occupies the
			// `plugin` slot and REPLACES the baseline (unchanged from
			// pre-0.1.0 behavior). Programmatic registrations win over
			// file-based shells of the same slug (spec §13 #6).
			$workspace_slug = $context['workspace'] ?? self::active_workspace_slug();

			if ( class_exists( 'WP_Admin_Workspaces_Registry' ) && WP_Admin_Workspaces_Registry::has( $workspace_slug ) ) {
				$plugin_doc = WP_Admin_Workspaces_Registry::get( $workspace_slug );
			} else {
				$workspace_path = $plugin_dir . 'workspaces/' . sanitize_file_name( $workspace_slug ) . '.json';
				$plugin_doc = WP_Admin_Workspaces_Origin_Core::load( $workspace_path );
			}

			// A full selected shell declaring an engine (v2 root `engine`
			// or v1 `settings.shell.layoutEngine`) replaces the baseline —
			// merging the v1-shaped empty_doc under it would inject
			// conflicting keys. Otherwise the empty_doc guards against a
			// missing shell.
			$has_plugin_engine =
				( is_array( $plugin_doc ) && (
					isset( $plugin_doc['engine'] ) ||
					isset( $plugin_doc['workspace']['engine'] ) ||
					isset( $plugin_doc['settings']['shell']['layoutEngine'] )
				) );
			$core_doc         = $has_plugin_engine ? array() : WP_Admin_Workspaces_Origin_Core::empty_doc();
			$effective_engine = is_array( $plugin_doc )
				? ( $plugin_doc['workspace']['engine'] ?? $plugin_doc['engine'] ?? null )
				: null;
		}

		return array(
			'core'   => $core_doc,
			'engine' => self::engine_origin( $effective_engine ),
			'plugin' => $plugin_doc,
			'site'   => is_array( get_option( 'wp_admin_workspaces_site_config', array() ) ) ? get_option( 'wp_admin_workspaces_site_config', array() ) : array(),
			'role'   => self::role_origin(),
			'user'   => self::user_origin(),
		);
	}

	/**
	 * Engine origin — synthetic doc carrying the active engine's
	 * `default-styles` manifest block. Sits between `core` (baseline) and
	 * `plugin` (override) in the cascade so the engine's visual identity
	 * ships with the engine but admin.json wins on every overlapping key.
	 *
	 * The effective engine id is resolved by the caller — for an override
	 * file that omits `workspace.engine`, it falls back to the baseline's
	 * engine, so a partial override never loses the engine's default
	 * styles.
	 *
	 * Returns an empty array when:
	 *   - No engine id is resolved (legacy v0 shells default to
	 *     `core:default` at the JS layer; PHP doesn't infer here).
	 *   - The engine manifest registry is unavailable (e.g. tests calling
	 *     `resolve_with` directly with hand-rolled origin arrays).
	 *   - The engine manifest declares no `default-styles`.
	 *
	 * @param string|null $engine_id  The resolved active engine id.
	 * @return array
	 */
	private static function engine_origin( $engine_id ) {
		if ( ! is_string( $engine_id ) || $engine_id === '' ) {
			return array();
		}
		if ( ! class_exists( 'WP_Admin_Workspaces_Manifest_Registry' ) ) {
			return array();
		}
		$manifest = WP_Admin_Workspaces_Manifest_Registry::instance()->get_engine( $engine_id );
		if ( ! is_array( $manifest ) ) {
			return array();
		}
		$defaults = $manifest['default-styles'] ?? null;
		if ( ! is_array( $defaults ) || empty( $defaults ) ) {
			return array();
		}
		return array( 'styles' => $defaults );
	}

	private static function role_origin() {
		$role_config = get_option( 'wp_admin_workspaces_role_config', array() );
		if ( ! is_array( $role_config ) ) {
			return array();
		}
		$user = wp_get_current_user();
		if ( ! $user || empty( $user->roles ) ) {
			return array();
		}
		// First role wins. Multi-role merging is a v2 concern.
		foreach ( (array) $user->roles as $role ) {
			if ( isset( $role_config[ $role ] ) && is_array( $role_config[ $role ] ) ) {
				return $role_config[ $role ];
			}
		}
		return array();
	}

	private static function user_origin() {
		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			return array();
		}
		$prefs = get_user_meta( $user_id, 'wp_admin_workspaces_user_prefs', true );
		return is_array( $prefs ) ? $prefs : array();
	}

	/**
	 * Active shell slug — site default with role/user override.
	 */
	public static function active_workspace_slug() {
		$slug = get_option( 'wp_admin_workspaces_active_workspace', 'wp-admin-default' );

		// Role override (per-role shell selection).
		$role_config = get_option( 'wp_admin_workspaces_role_config', array() );
		$user        = wp_get_current_user();
		if ( $user && ! empty( $user->roles ) && is_array( $role_config ) ) {
			foreach ( (array) $user->roles as $role ) {
				if ( isset( $role_config[ $role ]['workspace'] ) ) {
					$slug = $role_config[ $role ]['workspace'];
					break;
				}
			}
		}

		// User override — only if active shell allows it.
		$user_id = get_current_user_id();
		if ( $user_id ) {
			$prefs = get_user_meta( $user_id, 'wp_admin_workspaces_user_prefs', true );
			if ( is_array( $prefs ) && ! empty( $prefs['workspace'] ) ) {
				if ( self::workspace_allows_user_switch( $prefs['workspace'] ) ) {
					$slug = $prefs['workspace'];
				}
			}
		}

		return sanitize_file_name( $slug );
	}

	private static function workspace_allows_user_switch( $workspace_slug ) {
		$path = WP_ADMIN_WORKSPACES_PATH . 'workspaces/' . sanitize_file_name( $workspace_slug ) . '.json';
		if ( ! file_exists( $path ) ) {
			return false;
		}
		$doc = json_decode( file_get_contents( $path ), true );
		return is_array( $doc ) && ! empty( $doc['user-switchable'] );
	}
}
