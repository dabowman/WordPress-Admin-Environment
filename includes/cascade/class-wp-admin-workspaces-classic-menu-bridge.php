<?php
/**
 * Classic wp-admin menu bridge (3c.3).
 *
 * Walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` after `admin_menu` has
 * fired and synthesizes v3 workspace.json entries for third-party plugin
 * registrations the workspace does NOT already mirror natively. Core
 * wp-admin slugs (`index.php`, `edit.php`, `upload.php`, settings pages,
 * etc.) are skipped — the workspace ships first-class screens for those.
 *
 * For each ingested top-level menu entry the bridge synthesizes TWO
 * additions to the resolved workspace.json doc:
 *
 *   1. `screens[<id>]` — a v3 screen pointing at the iframe-fallback
 *      app with `config.url` set to the original wp-admin slug so the
 *      page renders inside the workspace chrome.
 *   2. `menu.ingested.items[<id>]` — placement under a single
 *      "Plugins" container at the menu root.
 *
 * Submenus are nested similarly:
 *
 *   - Submenus under a third-party parent slug nest under the parent's
 *     ingested screen id in the menu tree.
 *   - Submenus under a core wp-admin parent slug (`tools.php`, etc.)
 *     get synthesized container entries at `menu.ingested.items[<id>]`
 *     so the children still appear, just under the original parent's
 *     label.
 *   - Children that themselves match core slugs are skipped to avoid
 *     double-bridging.
 *
 * **Hook timing.** The bridge contributes through the
 * `wp_admin_workspaces_data_plugin` filter at **priority 6** — after
 * `WP_Admin_Workspaces_Menu_Items::contribute()` (priority 5),
 * `WP_Admin_Workspaces_Admin_Routes::contribute()` (priority 5), and
 * `WP_Admin_Workspaces_Dashboard_Widgets::contribute()` (priority 5). The
 * later priority means an explicit `wp_admin_workspaces_register_menu_item()`
 * call wins on entry-id collision via the idempotency guard.
 *
 * **Core detection.** A static slug list (see `$CORE_SLUGS`) covers
 * every default wp-admin top-level entry plus the well-known submenu
 * scripts. Plugins / sites can extend the skip list via the
 * `wp_admin_workspaces_classic_menu_core_slugs` filter when they
 * additionally ship a custom CPT that the workspace mirrors natively.
 *
 * **Menu icon harvesting (#127).** `map_icon()` resolves a
 * `dashicons-*` class to a kernel-registry icon *name*; for the icon
 * shapes the name-based registry can't resolve — data-URI SVGs and
 * plain image URLs — `map_icon_source()` emits an **arbitrary-icon
 * escape-hatch** descriptor (`{ type: 'url'|'dashicon', value }`) that
 * rides alongside the entry as `iconSource`. The engine nav renderers
 * render that descriptor through a pass-through `<img src>` / dashicon
 * `<span>` (engine-side; the kernel stays name-based + DS-neutral).
 *
 * **Core-parented submenu nesting (#127).** A plugin submenu parented
 * to a *core* wp-admin slug the workspace mirrors natively (`tools.php` →
 * Tools, `options-general.php` → Settings) is nested under the REAL
 * workspace parent screen's menu entry instead of the generic `ingested`
 * container. The map lives in `$CORE_PARENT_MENU` (core parent slug →
 * workspace menu id). Core parents the workspace does NOT mirror natively fall
 * back to the shared `ingested` container as before.
 *
 * **Menu position (#127).** The numeric `position` wp-admin assigns a
 * top-level entry (`add_menu_page( …, $position )`) is carried onto the
 * synthesized `menu.*` item so the resolved nav tree orders ingested
 * plugin entries the same as classic.
 *
 * **Out of scope.** Removing the original entries from
 * `$GLOBALS['menu']` (the bridge is purely additive — wp-admin's native
 * nav is unaffected).
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Classic_Menu_Bridge {

	/**
	 * Default container under which all ingested items + screens land
	 * in the v3 `menu` tree. The container's label defaults to
	 * "Plugins" — workspace.json can override with
	 * `menu.ingested.label: "Custom Label"` at any cascade origin
	 * (site/role/user) and the bridge preserves it (the bridge only
	 * writes to `menu.ingested.items`).
	 */
	const DEFAULT_CONTAINER = 'ingested';

	/**
	 * Slug → v3 path map for the well-known core wp-admin entries.
	 * Used only when an workspace.json workspace omits the corresponding
	 * workspace-native screen — the slug short-circuits to `is_core_slug`
	 * by default so this table is defensive rather than load-bearing.
	 *
	 * @var array<string, string>
	 */
	private static $CORE_PATH_MAP = array(
		'index.php'                  => '/dashboard',
		'edit.php'                   => '/posts',
		'edit.php?post_type=page'    => '/pages',
		'upload.php'                 => '/media',
		'edit-comments.php'          => '/comments',
		'themes.php'                 => '/appearance/themes',
		'plugins.php'                => '/plugins',
		'users.php'                  => '/users',
		'tools.php'                  => '/tools',
		'options-general.php'        => '/settings',
		'site-health.php'            => '/tools/site-health',
	);

	/**
	 * Core wp-admin parent slug → workspace menu id (#127). When a plugin
	 * adds a submenu under one of these core parents (e.g. an "Export"
	 * tool under `tools.php`, or a settings page under
	 * `options-general.php`), the bridge nests the ingested child under
	 * the REAL workspace parent's menu entry instead of the generic
	 * `ingested` container — matching where classic wp-admin would slot
	 * it. The id values are the bundled workspace's top-level menu ids; an
	 * workspace.json that renames/relocates the parent simply won't match
	 * and the child falls back to the `ingested` container (safe).
	 *
	 * @var array<string, string>
	 */
	private static $CORE_PARENT_MENU = array(
		'tools.php'           => 'tools',
		'options-general.php' => 'settings',
	);

	/**
	 * Static list of core wp-admin slugs the workspace already mirrors
	 * natively. The bridge skips these in both directions: as menu
	 * parents (skipped from ingestion outright) and as submenu
	 * children (skipped to avoid double-bridging).
	 *
	 * Plugins extending wp-admin's submenu tree under one of these
	 * parents (e.g. adding pages under `tools.php`) get their submenu
	 * children ingested with a synthesized parent container so the
	 * children are still reachable through the bridge.
	 *
	 * Expand via the `wp_admin_workspaces_classic_menu_core_slugs` filter
	 * when a plugin workspace mirrors additional CPT/screens natively.
	 *
	 * @var string[]
	 */
	private static $CORE_SLUGS = array(
		// Top-level wp-admin entries.
		'index.php',
		'edit.php',
		'edit.php?post_type=page',
		'edit.php?post_type=attachment',
		'upload.php',
		'edit-comments.php',
		'themes.php',
		'nav-menus.php',
		'customize.php',
		'plugins.php',
		'users.php',
		'profile.php',
		'tools.php',
		'import.php',
		'export.php',
		'site-health.php',
		'options-general.php',
		'options-writing.php',
		'options-reading.php',
		'options-discussion.php',
		'options-media.php',
		'options-permalink.php',
		'options-privacy.php',
		'update-core.php',
		// Common submenu entries shipped under the above parents.
		'post-new.php',
		'edit-tags.php',
		'edit-tags.php?taxonomy=category',
		'edit-tags.php?taxonomy=post_tag',
		'media-new.php',
		'user-new.php',
		// The workspace's own classic Settings page (`add_options_page` →
		// `options-general.php?page=wp-admin-workspaces-workspace`). It's a non-core
		// child of a core parent, so without this skip the bridge would
		// synthesize an `ingested-*` entry linking back into classic.
		'wp-admin-workspaces-workspace',
	);

	/**
	 * Walk `$GLOBALS['menu']` + `$GLOBALS['submenu']` and return a
	 * normalized list of records describing the synthesized entries.
	 *
	 * Pure-ish: reads two PHP globals, returns a plain array, leaves
	 * no static state behind. Safe to call repeatedly — idempotent at
	 * the resolver layer.
	 *
	 * Record shape:
	 *
	 *   {
	 *     id:           string,   // ingested-<slugified> screen id
	 *     slug:         string,   // original wp-admin slug
	 *     label:        string,   // menu page title (escaped, plain text)
	 *     capability:   string,   // capability required (from $GLOBALS['menu'])
	 *     icon:         string,   // resolved icon name (may be 'menu' fallback)
	 *     iconSource:   array|null, // arbitrary-icon escape-hatch
	 *                             // descriptor for data-URI / image-URL /
	 *                             // dashicon-class icons the name registry
	 *                             // can't resolve: { type, value }.
	 *     position:     int|null, // numeric menu position (#127).
	 *     path:         string,   // synthesized v3 screen path
	 *     children: [
	 *       {
	 *         id:         string,
	 *         slug:       string,
	 *         label:      string,
	 *         capability: string,
	 *         path:       string,
	 *       }
	 *     ],
	 *     parent_is_core: bool,   // when true, child entries get a
	 *                             // synthesized container item using
	 *                             // the parent slug's label.
	 *     parent_slug:    string, // (parent_is_core records only) original
	 *                             // core parent slug → real workspace menu id.
	 *   }
	 *
	 * @param string[] $native_legacy_paths Optional set of wp-admin slugs
	 *                                       already claimed by native workspace
	 *                                       screens via `legacy_path`. Entries
	 *                                       matching these slugs are skipped to
	 *                                       prevent duplicate nav entries (#252).
	 * @return array<int, array>
	 */
	public static function scan( $native_legacy_paths = array() ) {
		// Request-scoped memo. `contribute()` and the cache-signal hook
		// both call scan(); without the memo we'd walk $GLOBALS twice
		// per request and dispatch the core-slug filter 30+ times.
		// The signature snapshot guards against late mutations to the
		// globals (rare; mainly test harnesses) and against different
		// $native_legacy_paths inputs (mainly tests calling scan() directly).
		static $cache_signature = null;
		static $cache_result    = null;
		$menu_globals    = isset( $GLOBALS['menu'] ) && is_array( $GLOBALS['menu'] )
			? $GLOBALS['menu']
			: array();
		$submenu_globals = isset( $GLOBALS['submenu'] ) && is_array( $GLOBALS['submenu'] )
			? $GLOBALS['submenu']
			: array();
		$signature = md5( serialize( array( $menu_globals, $submenu_globals, $native_legacy_paths ) ) );
		if ( $cache_signature === $signature && is_array( $cache_result ) ) {
			return $cache_result;
		}

		$menu    = $menu_globals;
		$submenu = $submenu_globals;

		$records = array();

		// Index $menu by slug so we can detect "core parent w/ plugin
		// children" cases in the submenu walk.
		$menu_by_slug = array();
		foreach ( $menu as $entry ) {
			if ( ! is_array( $entry ) || ! isset( $entry[2] ) ) {
				continue;
			}
			$menu_by_slug[ (string) $entry[2] ] = $entry;
		}

		// First pass: ingest third-party top-level menu entries. The
		// array KEY of a `$GLOBALS['menu']` row is the numeric position
		// wp-admin sorts by (`add_menu_page( …, $position )`); carry it
		// onto the record so the resolved nav tree orders ingested
		// plugin entries the same as classic (#127).
		foreach ( $menu as $position => $entry ) {
			if ( ! is_array( $entry ) || ! isset( $entry[2] ) ) {
				continue;
			}
			$slug = (string) $entry[2];
			if ( $slug === '' ) {
				continue;
			}
			// Skip wp-admin separator rows — visual dividers, not pages.
			// They carry a `wp-menu-separator` CSS class (entry index 4)
			// and a synthetic `separatorN` slug.
			$css = isset( $entry[4] ) && is_string( $entry[4] ) ? $entry[4] : '';
			if ( strpos( $css, 'wp-menu-separator' ) !== false ) {
				continue;
			}
			if ( self::is_core_slug( $slug ) || in_array( $slug, $native_legacy_paths, true ) ) {
				continue;
			}

			$label      = isset( $entry[0] ) ? self::strip_label( (string) $entry[0] ) : $slug;
			$capability = isset( $entry[1] ) && is_string( $entry[1] ) ? $entry[1] : 'read';
			$wp_icon    = isset( $entry[6] ) && is_string( $entry[6] ) ? $entry[6] : '';
			$icon       = self::map_icon( $wp_icon );

			$record = array(
				'id'             => self::derive_screen_id( $slug ),
				'slug'           => $slug,
				'label'          => $label,
				'capability'     => $capability,
				'icon'           => $icon ?? 'menu',
				'iconSource'     => self::map_icon_source( $wp_icon ),
				'position'       => is_numeric( $position ) ? (int) $position : null,
				'path'           => self::derive_path( $slug ),
				'children'       => array(),
				'parent_is_core' => false,
			);

			if ( isset( $submenu[ $slug ] ) && is_array( $submenu[ $slug ] ) ) {
				$record['children'] = self::scan_children( $submenu[ $slug ], $native_legacy_paths );
			}

			$records[] = $record;
		}

		// Second pass: submenus parented to a CORE wp-admin slug get a
		// synthesized container in the ingested tree so the children
		// still surface. Skip when the parent slug isn't in the menu
		// at all (orphaned submenu — wp-admin throws these away too).
		foreach ( $submenu as $parent_slug => $children_array ) {
			if ( ! is_string( $parent_slug ) || $parent_slug === '' ) {
				continue;
			}
			if ( ! is_array( $children_array ) ) {
				continue;
			}
			if ( ! self::is_core_slug( $parent_slug ) ) {
				continue; // Already handled above.
			}
			if ( ! isset( $menu_by_slug[ $parent_slug ] ) ) {
				continue; // Orphan submenu.
			}

			$ingested_children = self::scan_children( $children_array, $native_legacy_paths );
			if ( empty( $ingested_children ) ) {
				continue;
			}

			$parent_entry = $menu_by_slug[ $parent_slug ];
			$parent_label = isset( $parent_entry[0] )
				? self::strip_label( (string) $parent_entry[0] )
				: $parent_slug;
			$wp_icon  = isset( $parent_entry[6] ) && is_string( $parent_entry[6] ) ? $parent_entry[6] : '';
			$icon     = self::map_icon( $wp_icon );

			$records[] = array(
				'id'             => self::derive_screen_id( $parent_slug ),
				'slug'           => $parent_slug,
				'label'          => $parent_label,
				'capability'     => '', // Container only — no bound screen.
				'icon'           => $icon ?? 'menu',
				'iconSource'     => self::map_icon_source( $wp_icon ),
				'position'       => null,
				'path'           => '',
				'children'       => $ingested_children,
				'parent_is_core' => true,
				'parent_slug'    => $parent_slug,
			);
		}

		$cache_signature = $signature;
		$cache_result    = $records;
		return $records;
	}

	/**
	 * Request-scoped memo of the filtered core-slug set. `is_core_slug()`
	 * runs per menu/submenu entry; without this, the filter dispatches
	 * 30+ times per scan() walk. Also `array_filter( …, 'is_string' )`
	 * shape-validates the filter result so a callback returning
	 * `[ 'edit.php', 42, false ]` doesn't poison the in_array lookup
	 * with non-string entries.
	 *
	 * @return string[]
	 */
	private static function core_slugs() {
		if ( self::$core_slugs_cache !== null ) {
			return self::$core_slugs_cache;
		}
		$filtered = apply_filters(
			'wp_admin_workspaces_classic_menu_core_slugs',
			self::$CORE_SLUGS
		);
		if ( ! is_array( $filtered ) ) {
			$filtered = self::$CORE_SLUGS;
		}
		self::$core_slugs_cache = array_values( array_filter( $filtered, 'is_string' ) );
		return self::$core_slugs_cache;
	}

	/**
	 * Class-static memo backing `core_slugs()`. Reset()-able.
	 * @var string[]|null
	 */
	private static $core_slugs_cache = null;

	/**
	 * Walk one submenu array (`$GLOBALS['submenu'][<parent>]`) and
	 * return ingested child records. Skips entries whose slug matches
	 * `is_core_slug` or whose slug is already claimed by a native
	 * workspace screen via `legacy_path` (the `$native_legacy_paths` set
	 * built from the prior-merged doc by `contribute()`).
	 *
	 * @param array<int, array> $children            The submenu rows under one parent.
	 * @param string[]          $native_legacy_paths  Slugs already claimed natively.
	 * @return array<int, array>
	 */
	private static function scan_children( $children, $native_legacy_paths = array() ) {
		$out = array();
		foreach ( $children as $child ) {
			if ( ! is_array( $child ) || ! isset( $child[2] ) ) {
				continue;
			}
			$slug = (string) $child[2];
			if ( $slug === '' ) {
				continue;
			}
			if ( self::is_core_slug( $slug ) || in_array( $slug, $native_legacy_paths, true ) ) {
				continue;
			}
			$out[] = array(
				'id'         => self::derive_screen_id( $slug ),
				'slug'       => $slug,
				'label'      => isset( $child[0] ) ? self::strip_label( (string) $child[0] ) : $slug,
				'capability' => isset( $child[1] ) && is_string( $child[1] ) ? $child[1] : 'read',
				'path'       => self::derive_path( $slug ),
			);
		}
		return $out;
	}

	/**
	 * Is this slug a known wp-admin core entry that the workspace already
	 * mirrors natively? Filterable via
	 * `wp_admin_workspaces_classic_menu_core_slugs`.
	 *
	 * @param string $slug
	 * @return bool
	 */
	public static function is_core_slug( $slug ) {
		if ( ! is_string( $slug ) || $slug === '' ) {
			return false;
		}
		$core_slugs = self::core_slugs();
		if ( in_array( $slug, $core_slugs, true ) ) {
			return true;
		}
		// edit.php?post_type=<core CPT> — `post`, `page`, `attachment`
		// — is workspace-native via the posts app even when the explicit
		// query-stringed slug isn't pre-registered.
		if ( strpos( $slug, 'edit.php?post_type=' ) === 0 ) {
			$cpt = substr( $slug, strlen( 'edit.php?post_type=' ) );
			if ( in_array( $cpt, array( 'post', 'page', 'attachment' ), true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Map a wp-admin slug to a v3 screen path. Core slugs short-circuit
	 * to known mappings; everything else lands at `/admin/<slugified>`.
	 *
	 * @param string $slug Original wp-admin slug.
	 * @return string V3 path (always begins with `/`).
	 */
	public static function derive_path( $slug ) {
		if ( ! is_string( $slug ) || $slug === '' ) {
			// Empty/invalid slug — return empty string so callers can
			// reject upstream. Mirrors `derive_screen_id` empty-handling
			// (both return falsy values for invalid input rather than
			// the previous mixed `/admin` + `ingested-unknown` sentinels).
			return '';
		}
		if ( isset( self::$CORE_PATH_MAP[ $slug ] ) ) {
			return self::$CORE_PATH_MAP[ $slug ];
		}
		// `admin.php?page=woocommerce` is a common Settings-style entry —
		// strip the `admin.php?page=` prefix so the path stays readable.
		if ( strpos( $slug, 'admin.php?page=' ) === 0 ) {
			$tail = substr( $slug, strlen( 'admin.php?page=' ) );
			return '/admin/' . self::slugify( $tail );
		}
		return '/admin/' . self::slugify( $slug );
	}

	/**
	 * Derive a stable, slug-pattern-safe v3 screen id from a wp-admin
	 * slug. Format: `ingested-<slugified>`.
	 *
	 * Matches the v3 admin-v3.json `screens` patternProperties regex
	 * `^[a-z][a-z0-9-]*$`.
	 *
	 * @param string $slug Original wp-admin slug.
	 * @return string Screen id.
	 */
	public static function derive_screen_id( $slug ) {
		if ( ! is_string( $slug ) || $slug === '' ) {
			// Empty/invalid slug — return empty string. Mirrors
			// derive_path()'s empty-handling. contribute() guards
			// upstream so this is defensive.
			return '';
		}
		// Strip `admin.php?page=` prefix when present — saves a few
		// chars on the common-case path.
		if ( strpos( $slug, 'admin.php?page=' ) === 0 ) {
			$slug = substr( $slug, strlen( 'admin.php?page=' ) );
		}
		$slugified = self::slugify( $slug );
		if ( $slugified === '' ) {
			return '';
		}
		return 'ingested-' . $slugified;
	}

	/**
	 * Map a wp-admin icon string (dashicons-name, data-URI, empty) to
	 * a kernel-registry icon name.
	 *
	 * - `dashicons-foo` → `foo` (engine icon registry resolves).
	 * - `data:image/svg+xml;…` → null (caller falls back to `menu`).
	 *   Future iteration: harvest + register the embedded SVG.
	 * - `none`, `div`, `''` → null (caller falls back to `menu`).
	 *
	 * @param string $wp_icon
	 * @return string|null
	 */
	public static function map_icon( $wp_icon ) {
		if ( ! is_string( $wp_icon ) || $wp_icon === '' ) {
			return null;
		}
		if ( $wp_icon === 'none' || $wp_icon === 'div' ) {
			return null;
		}
		if ( strpos( $wp_icon, 'dashicons-' ) === 0 ) {
			$name = substr( $wp_icon, strlen( 'dashicons-' ) );
			$name = preg_replace( '/[^a-z0-9-]/', '', strtolower( $name ) );
			if ( $name === '' ) {
				return null;
			}
			return $name;
		}
		// Data URI / image URL — not a name. `map_icon_source()` emits
		// an arbitrary-icon escape-hatch descriptor for these; the
		// name-based `icon` field falls back to `menu`.
		if ( strpos( $wp_icon, 'data:' ) === 0 ) {
			return null;
		}
		// Bare path / unknown shape — punt.
		return null;
	}

	/**
	 * Emit an arbitrary-icon escape-hatch descriptor (#127) for the icon
	 * shapes the kernel's name-based registry (`resolveIcon`) can't
	 * resolve — data-URI SVGs and plain image URLs that wp-admin accepts
	 * as the `$icon_url` argument to `add_menu_page()`. The engine nav
	 * renderers render the descriptor through a pass-through `<img src>` /
	 * dashicon `<span>` (engine-side; the kernel stays name-based).
	 *
	 * Returns null for icon shapes the name registry DOES cover
	 * (`dashicons-*` → name) and for the empty / sentinel cases —
	 * `icon` carries those.
	 *
	 *   - `data:image/...;...`            → { type: 'url', value }
	 *   - `http(s)://.../foo.png` (or a   → { type: 'url', value }
	 *     site-relative `/wp-content/...`
	 *     image path)
	 *   - `dashicons-foo`                 → null (name registry covers it)
	 *   - `none`, `div`, `''`             → null
	 *
	 * @param string $wp_icon Raw wp-admin menu icon string.
	 * @return array{type:string,value:string}|null
	 */
	public static function map_icon_source( $wp_icon ) {
		if ( ! is_string( $wp_icon ) || $wp_icon === '' ) {
			return null;
		}
		if ( $wp_icon === 'none' || $wp_icon === 'div' ) {
			return null;
		}
		// Dashicons resolve through the name registry — no escape hatch.
		if ( strpos( $wp_icon, 'dashicons-' ) === 0 ) {
			return null;
		}
		// Data-URI SVG / PNG — render directly via <img src>.
		if ( strpos( $wp_icon, 'data:' ) === 0 ) {
			return array(
				'type'  => 'url',
				'value' => $wp_icon,
			);
		}
		// Image URL: absolute http(s), protocol-relative, or a
		// site-relative path (wp-admin commonly passes a plugin asset URL
		// like `plugins_url( 'icon.png', __FILE__ )`). Recognize an image
		// extension OR an http(s)/protocol-relative URL.
		$is_http     = (bool) preg_match( '#^(https?:)?//#i', $wp_icon );
		$is_rel_path = ( $wp_icon[0] === '/' );
		$looks_image = (bool) preg_match( '/\.(svg|png|gif|jpe?g|webp|ico)(\?.*)?$/i', $wp_icon );
		if ( $is_http || ( $is_rel_path && $looks_image ) ) {
			return array(
				'type'  => 'url',
				'value' => $wp_icon,
			);
		}
		return null;
	}

	/**
	 * Extract every `legacy_path` string declared by screens in a merged doc.
	 * Used by `contribute()` to build the dynamic skip set for `scan()`: any
	 * wp-admin slug already claimed via `legacy_path` by a prior-origin
	 * screen must not be re-ingested by the bridge (#252).
	 *
	 * @param array $merged_doc A partially- or fully-merged workspace.json doc.
	 * @return string[]
	 */
	private static function extract_native_legacy_paths( $merged_doc ) {
		if ( ! isset( $merged_doc['screens'] ) || ! is_array( $merged_doc['screens'] ) ) {
			return array();
		}
		$paths = array();
		foreach ( $merged_doc['screens'] as $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			if ( isset( $screen['legacy_path'] ) && is_string( $screen['legacy_path'] ) && $screen['legacy_path'] !== '' ) {
				$paths[] = $screen['legacy_path'];
			}
		}
		return $paths;
	}

	/**
	 * Cascade contribution. Walks `scan()` and merges synthesized
	 * `screens[<id>]` + `menu.ingested.items[<id>]` entries into the
	 * plugin-origin workspace.json doc. Idempotent: any entry id already
	 * present in `screens` or `menu.ingested.items` is left untouched
	 * so:
	 *
	 *   - workspace.json declarations at any origin keep authority.
	 *   - The filter firing twice in one request doesn't duplicate.
	 *
	 * @param array $doc          Plugin-origin workspace.json doc.
	 * @param array $prior_merged The merged doc from origins that ran before
	 *                            plugin (core + engine). Passed as an extra
	 *                            arg by `resolve_with()` since this fix. Used
	 *                            to derive the dynamic skip set of legacy_path
	 *                            slugs already claimed natively, preventing
	 *                            duplicate nav entries (#252). Defaults to
	 *                            empty array (graceful degradation in direct
	 *                            test calls and back-compat callers).
	 * @return array
	 */
	public static function contribute( $doc, $prior_merged = array() ) {
		if ( ! is_array( $doc ) ) {
			$doc = array();
		}
		// Build the dynamic skip set from screens declared in prior origins.
		// This catches slugs (e.g. theme-editor.php, plugin-editor.php) that
		// are absent from the static $CORE_SLUGS list but are already claimed
		// natively via a screen's `legacy_path` field. Future native screens
		// with a legacy_path automatically stop regressing into duplicates.
		$native_legacy_paths = self::extract_native_legacy_paths(
			is_array( $prior_merged ) ? $prior_merged : array()
		);
		$records = self::scan( $native_legacy_paths );
		if ( empty( $records ) ) {
			return $doc;
		}

		if ( ! isset( $doc['screens'] ) || ! is_array( $doc['screens'] ) ) {
			$doc['screens'] = array();
		}
		if ( ! isset( $doc['menu'] ) || ! is_array( $doc['menu'] ) ) {
			$doc['menu'] = array();
		}

		foreach ( $records as $record ) {
			$id = $record['id'];

			if ( $record['parent_is_core'] ) {
				// Submenu parented to a CORE wp-admin slug. When that core
				// parent maps to a REAL workspace menu the workspace mirrors
				// natively (`tools.php` → Tools, `options-general.php` →
				// Settings — #127), nest the ingested children directly
				// under that workspace parent's existing menu node instead of
				// the generic `ingested` container, matching where classic
				// wp-admin slots them. A core parent the workspace doesn't
				// mirror falls back to the shared `ingested` container.
				$parent_slug   = isset( $record['parent_slug'] ) ? $record['parent_slug'] : '';
				$workspace_menu_id = ( $parent_slug !== '' && isset( self::$CORE_PARENT_MENU[ $parent_slug ] ) )
					? self::$CORE_PARENT_MENU[ $parent_slug ]
					: null;

				if ( $workspace_menu_id !== null ) {
					// Nest children straight under the workspace parent's menu
					// node (e.g. `menu.tools.items[...]`). The workspace parent
					// node already exists in the baseline menu tree; if it
					// somehow doesn't, create a bare node so the children
					// still surface (label/icon come from the matching
					// screen via `bind_screens`).
					if ( ! isset( $doc['menu'][ $workspace_menu_id ] ) || ! is_array( $doc['menu'][ $workspace_menu_id ] ) ) {
						$doc['menu'][ $workspace_menu_id ] = array();
					}
					if ( ! isset( $doc['menu'][ $workspace_menu_id ]['items'] ) || ! is_array( $doc['menu'][ $workspace_menu_id ]['items'] ) ) {
						$doc['menu'][ $workspace_menu_id ]['items'] = array();
					}
					$child_items = &$doc['menu'][ $workspace_menu_id ]['items'];
					foreach ( $record['children'] as $child ) {
						self::synthesize_child( $doc, $child_items, $child );
					}
					unset( $child_items );
					continue;
				}

				// Fallback: group beneath the shared `ingested` container
				// (label "Plugins"), created lazily so it never renders
				// empty.
				self::ensure_container( $doc );
				$container_items = &$doc['menu'][ self::DEFAULT_CONTAINER ]['items'];

				// Hidden stub screen — container only, no bound page.
				// Authors override the icon menu-side at
				// `menu.ingested.items[<id>]`, not on the hidden screen.
				if ( ! isset( $doc['screens'][ $id ] ) ) {
					$doc['screens'][ $id ] = array(
						'label'  => $record['label'],
						'hidden' => true,
					);
				}
				if ( ! isset( $container_items[ $id ] ) ) {
					$menu_item = array( 'label' => $record['label'] );
					if ( $record['icon'] !== '' ) {
						$menu_item['icon'] = $record['icon'];
					}
					if ( ! empty( $record['iconSource'] ) ) {
						$menu_item['iconSource'] = $record['iconSource'];
					}
					$container_items[ $id ] = $menu_item;
				}
				if ( ! empty( $record['children'] ) ) {
					if ( ! isset( $container_items[ $id ]['items'] ) || ! is_array( $container_items[ $id ]['items'] ) ) {
						$container_items[ $id ]['items'] = array();
					}
					$child_items = &$container_items[ $id ]['items'];
					foreach ( $record['children'] as $child ) {
						self::synthesize_child( $doc, $child_items, $child );
					}
					unset( $child_items );
				}
				unset( $container_items );
				continue;
			}

			// Genuine third-party TOP-LEVEL menu (e.g. Gutenberg). Surface
			// it as a top-level menu entry — a sibling of the workspace's own
			// screens — NOT nested under the `ingested` container. The menu
			// item is left bare; `bind_screens` (priority 5, post-merge)
			// folds the screen's label/icon/href from the matching id.
			if ( ! isset( $doc['screens'][ $id ] ) ) {
				$screen = array(
					'label' => $record['label'],
					'icon'  => $record['icon'],
					'path'  => $record['path'],
					'app'   => self::iframe_app_id( $record['slug'] ),
				);
				if ( ! empty( $record['iconSource'] ) ) {
					$screen['iconSource'] = $record['iconSource'];
				}
				if ( $record['capability'] !== '' ) {
					$screen['permissions'] = array(
						'capabilities' => array( $record['capability'] ),
					);
				}
				$doc['screens'][ $id ] = $screen;
			}
			if ( ! isset( $doc['menu'][ $id ] ) ) {
				$menu_node = array();
				// Carry the numeric wp-admin menu position so the resolved
				// nav tree orders this ingested entry the same as classic
				// (#127). `bind_screens` folds label/icon/href from the
				// matching screen; position + iconSource ride alongside.
				if ( $record['position'] !== null ) {
					$menu_node['position'] = $record['position'];
				}
				if ( ! empty( $record['iconSource'] ) ) {
					$menu_node['iconSource'] = $record['iconSource'];
				}
				$doc['menu'][ $id ] = $menu_node;
			}
			if ( ! empty( $record['children'] ) ) {
				if ( ! isset( $doc['menu'][ $id ]['items'] ) || ! is_array( $doc['menu'][ $id ]['items'] ) ) {
					$doc['menu'][ $id ]['items'] = array();
				}
				$child_items = &$doc['menu'][ $id ]['items'];
				foreach ( $record['children'] as $child ) {
					self::synthesize_child( $doc, $child_items, $child );
				}
				unset( $child_items );
			}
		}

		return $doc;
	}

	/**
	 * Ensure the shared `ingested` container exists. Preserves an
	 * workspace.json-declared container (custom label / hidden flag), only
	 * force-filling its `items` array.
	 *
	 * @param array $doc Plugin-origin workspace.json doc (by reference).
	 */
	private static function ensure_container( &$doc ) {
		if ( ! isset( $doc['menu'][ self::DEFAULT_CONTAINER ] ) || ! is_array( $doc['menu'][ self::DEFAULT_CONTAINER ] ) ) {
			$doc['menu'][ self::DEFAULT_CONTAINER ] = array(
				'label'    => __( 'Plugins', 'wp-admin-workspaces' ),
				'icon'     => 'plugins',
				'position' => 200,
				'items'    => array(),
			);
		} elseif ( ! isset( $doc['menu'][ self::DEFAULT_CONTAINER ]['items'] ) || ! is_array( $doc['menu'][ self::DEFAULT_CONTAINER ]['items'] ) ) {
			$doc['menu'][ self::DEFAULT_CONTAINER ]['items'] = array();
		}
	}

	/**
	 * Synthesize one ingested child into a menu-items map (by reference),
	 * plus its backing screen when the child is a real admin page.
	 *
	 * External `http(s)://` children become anchor menu items (no bound
	 * screen); everything else becomes an `iframe:`-backed screen + a
	 * bare menu item (href bound later from the screen path).
	 *
	 * @param array $doc         Plugin-origin doc (by reference).
	 * @param array $child_items Parent's `items` map (by reference).
	 * @param array $child       Child record from `scan_children()`.
	 */
	private static function synthesize_child( &$doc, &$child_items, $child ) {
		$child_id = $child['id'];

		if ( self::is_external_slug( $child['slug'] ) ) {
			if ( ! isset( $child_items[ $child_id ] ) ) {
				$child_items[ $child_id ] = array(
					'label'    => $child['label'],
					'href'     => $child['slug'],
					'external' => true,
				);
			}
			return;
		}

		if ( ! isset( $doc['screens'][ $child_id ] ) ) {
			$child_screen = array(
				'label' => $child['label'],
				'icon'  => 'menu',
				'path'  => $child['path'],
				'app'   => self::iframe_app_id( $child['slug'] ),
			);
			if ( $child['capability'] !== '' ) {
				$child_screen['permissions'] = array(
					'capabilities' => array( $child['capability'] ),
				);
			}
			$doc['screens'][ $child_id ] = $child_screen;
		}
		if ( ! isset( $child_items[ $child_id ] ) ) {
			$child_items[ $child_id ] = array();
		}
	}

	/**
	 * Build the namespaced `iframe:<slug>` app id for an ingested
	 * screen. The workspace's iframe-fallback app handler picks up the
	 * slug at mount time and renders `<adminUrl>/<slug>` inside an
	 * iframe with chrome hidden.
	 *
	 * @param string $slug Original wp-admin slug.
	 * @return string
	 */
	private static function iframe_app_id( $slug ) {
		return 'iframe:' . self::admin_url_for_slug( $slug );
	}

	/**
	 * Resolve a wp-admin menu slug to the URL that actually loads its
	 * page, mirroring core's `menu_page_url()` logic: a slug containing
	 * `.php` is a direct admin file (keep any query string as-is);
	 * anything else is a registered page reached through
	 * `admin.php?page=<slug>`. Without this the iframe-fallback would
	 * request `<adminUrl>/<slug>` (e.g. `/wp-admin/gutenberg`) → 404.
	 *
	 * @param string $slug Original wp-admin menu slug.
	 * @return string Loadable admin URL (relative to adminUrl).
	 */
	private static function admin_url_for_slug( $slug ) {
		$slug = (string) $slug;
		if ( strpos( $slug, '.php' ) !== false ) {
			return $slug;
		}
		return 'admin.php?page=' . $slug;
	}

	/**
	 * Is this menu slug an absolute external link (registered with a
	 * full `http(s)://` URL as its slug, as Gutenberg's Support /
	 * Documentation entries are)? Such entries are anchor links, not
	 * iframe-mountable admin pages.
	 *
	 * @param string $slug
	 * @return bool
	 */
	private static function is_external_slug( $slug ) {
		return is_string( $slug ) && (bool) preg_match( '#^https?://#i', $slug );
	}

	/**
	 * Lowercase + kebab-case a string, collapsing any non-[a-z0-9]
	 * run to a single `-`. Mirrors
	 * `WP_Admin_Workspaces_Dashboard_Widgets::derive_entry_id`'s suffix
	 * normalizer.
	 *
	 * @param string $value
	 * @return string
	 */
	private static function slugify( $value ) {
		$lower    = strtolower( (string) $value );
		$slugged  = preg_replace( '/[^a-z0-9]+/', '-', $lower );
		$trimmed  = trim( (string) $slugged, '-' );
		return $trimmed;
	}

	/**
	 * Strip HTML + the trailing update-count `<span>` markup wp-admin
	 * tacks onto page titles so the bridge emits a clean label.
	 *
	 * @param string $label
	 * @return string
	 */
	private static function strip_label( $label ) {
		// wp-admin appends update bubbles inline:
		//   "Plugins <span class='update-plugins count-3'><span class='plugin-count'>3</span></span>"
		// Strip everything inside <span> tags first to drop the count,
		// then strip remaining markup defensively.
		$without_spans = preg_replace( '#<span[^>]*>.*?</span>#is', '', (string) $label );
		$clean         = wp_strip_all_tags( (string) $without_spans );
		$trimmed       = trim( $clean );
		return $trimmed !== '' ? $trimmed : (string) $label;
	}

	/**
	 * Reset bridge state. Test-only. The bridge holds no persistent
	 * state (scan() reads globals on every call), but two static memos
	 * live inside scan() + core_slugs() to avoid re-walking globals and
	 * re-running the filter chain on every call within a single request.
	 * Tests mutate $GLOBALS between scenarios + change the filter
	 * registration, so the memos must be drained on reset().
	 */
	public static function reset() {
		// Re-invoke scan() once with empty globals so its static memo
		// cache hits a known-empty signature. Subsequent calls in the
		// test rebuild from real $GLOBALS state.
		$saved_menu    = isset( $GLOBALS['menu'] ) ? $GLOBALS['menu'] : null;
		$saved_submenu = isset( $GLOBALS['submenu'] ) ? $GLOBALS['submenu'] : null;
		$GLOBALS['menu']    = array();
		$GLOBALS['submenu'] = array();
		self::scan();
		if ( $saved_menu === null ) {
			unset( $GLOBALS['menu'] );
		} else {
			$GLOBALS['menu'] = $saved_menu;
		}
		if ( $saved_submenu === null ) {
			unset( $GLOBALS['submenu'] );
		} else {
			$GLOBALS['submenu'] = $saved_submenu;
		}
		// Drain the filtered core-slug memo so tests can register a
		// new `wp_admin_workspaces_classic_menu_core_slugs` filter between
		// scenarios and see it take effect on the next scan.
		self::$core_slugs_cache = null;
	}
}

/**
 * Cascade contribution.
 *
 * Priority 6 places the bridge in the plugin origin AFTER:
 *   - menu-items shim (priority 5),
 *   - admin-routes shim (priority 5),
 *   - dashboard-widgets shim (priority 5),
 * so an explicit `wp_admin_workspaces_register_menu_item()` call wins via
 * the idempotency guard (first writer wins on entry id) and a plugin
 * author hooking `wp_admin_workspaces_data_plugin` at default priority 10
 * still wins on top.
 *
 * Accepts 2 args: the plugin-origin doc (value being filtered) plus the
 * already-merged core+engine doc passed as an extra arg by `resolve_with()`
 * since #252. The second arg lets `contribute()` derive which legacy_path
 * slugs are already claimed natively, preventing duplicate nav entries.
 */
add_filter(
	'wp_admin_workspaces_data_plugin',
	array( 'WP_Admin_Workspaces_Classic_Menu_Bridge', 'contribute' ),
	6,
	2
);

/**
 * Contribute a cache-invalidation signal so a delta in
 * `$GLOBALS['menu']` (third-party plugin (de)activated) forces a
 * fresh resolver run cross-request without an explicit cache flush.
 *
 * Context: the bridge reads from globals populated by `admin_menu`
 * which fires per-request, so this is the only signal that captures
 * the menu shape. Hashes the scan output (the same data the
 * contribute() pass writes) — purely structural, no secrets.
 */
add_filter(
	'wp_admin_workspaces_cache_signals',
	function ( $signals ) {
		// Avoid running `scan()` during early requests when neither
		// global is populated — both null/missing → empty scan → no
		// signal.
		if ( ! isset( $GLOBALS['menu'] ) && ! isset( $GLOBALS['submenu'] ) ) {
			return $signals;
		}
		$records = WP_Admin_Workspaces_Classic_Menu_Bridge::scan();
		if ( ! empty( $records ) ) {
			$signals['classic_menu_bridge'] = md5( wp_json_encode( $records ) );
		}
		return $signals;
	}
);
