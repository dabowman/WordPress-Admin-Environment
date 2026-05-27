<?php
/**
 * Classic wp-admin menu bridge (3c.3).
 *
 * Walks `$GLOBALS['menu']` + `$GLOBALS['submenu']` after `admin_menu` has
 * fired and synthesizes v3 admin.json entries for third-party plugin
 * registrations the shell does NOT already mirror natively. Core
 * wp-admin slugs (`index.php`, `edit.php`, `upload.php`, settings pages,
 * etc.) are skipped — the shell ships first-class screens for those.
 *
 * For each ingested top-level menu entry the bridge synthesizes TWO
 * additions to the resolved admin.json doc:
 *
 *   1. `screens[<id>]` — a v3 screen pointing at the iframe-fallback
 *      app with `config.url` set to the original wp-admin slug so the
 *      page renders inside the shell chrome.
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
 * `wp_admin_shell_data_plugin` filter at **priority 6** — after
 * `WP_Admin_Shell_Menu_Items::contribute()` (priority 5),
 * `WP_Admin_Shell_Admin_Routes::contribute()` (priority 5), and
 * `WP_Admin_Shell_Dashboard_Widgets::contribute()` (priority 5). The
 * later priority means an explicit `wp_admin_shell_register_menu_item()`
 * call wins on entry-id collision via the idempotency guard.
 *
 * **Core detection.** A static slug list (see `$CORE_SLUGS`) covers
 * every default wp-admin top-level entry plus the well-known submenu
 * scripts. Plugins / sites can extend the skip list via the
 * `wp_admin_shell_classic_menu_core_slugs` filter when they
 * additionally ship a custom CPT that the shell mirrors natively.
 *
 * **Out of scope.** Icon SVG harvesting from data-URIs (a future
 * pass — bridge falls back to a generic `menu` icon today). Removing
 * the original entries from `$GLOBALS['menu']` (the bridge is purely
 * additive — wp-admin's native nav is unaffected).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Classic_Menu_Bridge {

	/**
	 * Default container under which all ingested items + screens land
	 * in the v3 `menu` tree. The container's label defaults to
	 * "Plugins" — admin.json can override with
	 * `menu.ingested.label: "Custom Label"` at any cascade origin
	 * (site/role/user) and the bridge preserves it (the bridge only
	 * writes to `menu.ingested.items`).
	 */
	const DEFAULT_CONTAINER = 'ingested';

	/**
	 * Slug → v3 path map for the well-known core wp-admin entries.
	 * Used only when an admin.json shell omits the corresponding
	 * shell-native screen — the slug short-circuits to `is_core_slug`
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
	 * Static list of core wp-admin slugs the shell already mirrors
	 * natively. The bridge skips these in both directions: as menu
	 * parents (skipped from ingestion outright) and as submenu
	 * children (skipped to avoid double-bridging).
	 *
	 * Plugins extending wp-admin's submenu tree under one of these
	 * parents (e.g. adding pages under `tools.php`) get their submenu
	 * children ingested with a synthesized parent container so the
	 * children are still reachable through the bridge.
	 *
	 * Expand via the `wp_admin_shell_classic_menu_core_slugs` filter
	 * when a plugin shell mirrors additional CPT/screens natively.
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
	 *   }
	 *
	 * @return array<int, array>
	 */
	public static function scan() {
		// Request-scoped memo. `contribute()` and the cache-signal hook
		// both call scan(); without the memo we'd walk $GLOBALS twice
		// per request and dispatch the core-slug filter 30+ times.
		// The signature snapshot guards against late mutations to the
		// globals (rare; mainly test harnesses).
		static $cache_signature = null;
		static $cache_result    = null;
		$menu_globals    = isset( $GLOBALS['menu'] ) && is_array( $GLOBALS['menu'] )
			? $GLOBALS['menu']
			: array();
		$submenu_globals = isset( $GLOBALS['submenu'] ) && is_array( $GLOBALS['submenu'] )
			? $GLOBALS['submenu']
			: array();
		$signature = md5( serialize( array( $menu_globals, $submenu_globals ) ) );
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

		// First pass: ingest third-party top-level menu entries.
		foreach ( $menu as $entry ) {
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
			if ( self::is_core_slug( $slug ) ) {
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
				'path'           => self::derive_path( $slug ),
				'children'       => array(),
				'parent_is_core' => false,
			);

			if ( isset( $submenu[ $slug ] ) && is_array( $submenu[ $slug ] ) ) {
				$record['children'] = self::scan_children( $submenu[ $slug ] );
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

			$ingested_children = self::scan_children( $children_array );
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
				'path'           => '',
				'children'       => $ingested_children,
				'parent_is_core' => true,
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
			'wp_admin_shell_classic_menu_core_slugs',
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
	 * `is_core_slug` so we don't double-bridge wp-admin built-ins.
	 *
	 * @param array<int, array> $children The submenu rows under one parent.
	 * @return array<int, array>
	 */
	private static function scan_children( $children ) {
		$out = array();
		foreach ( $children as $child ) {
			if ( ! is_array( $child ) || ! isset( $child[2] ) ) {
				continue;
			}
			$slug = (string) $child[2];
			if ( $slug === '' ) {
				continue;
			}
			if ( self::is_core_slug( $slug ) ) {
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
	 * Is this slug a known wp-admin core entry that the shell already
	 * mirrors natively? Filterable via
	 * `wp_admin_shell_classic_menu_core_slugs`.
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
		// — is shell-native via the posts app even when the explicit
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
		// Data URI — out of scope for v3.3 (no inline SVG harvesting).
		if ( strpos( $wp_icon, 'data:' ) === 0 ) {
			return null;
		}
		// Bare path / unknown shape — punt.
		return null;
	}

	/**
	 * Cascade contribution. Walks `scan()` and merges synthesized
	 * `screens[<id>]` + `menu.ingested.items[<id>]` entries into the
	 * plugin-origin admin.json doc. Idempotent: any entry id already
	 * present in `screens` or `menu.ingested.items` is left untouched
	 * so:
	 *
	 *   - admin.json declarations at any origin keep authority.
	 *   - The filter firing twice in one request doesn't duplicate.
	 *
	 * @param array $doc Plugin-origin admin.json doc.
	 * @return array
	 */
	public static function contribute( $doc ) {
		if ( ! is_array( $doc ) ) {
			$doc = array();
		}
		$records = self::scan();
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
				// Submenu parented to a CORE wp-admin slug (an orphan the
				// shell doesn't mirror natively). Group it beneath the
				// shared `ingested` container (label "Plugins"), created
				// lazily so it never renders empty.
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
			// it as a top-level menu entry — a sibling of the shell's own
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
				if ( $record['capability'] !== '' ) {
					$screen['permissions'] = array(
						'capabilities' => array( $record['capability'] ),
					);
				}
				$doc['screens'][ $id ] = $screen;
			}
			if ( ! isset( $doc['menu'][ $id ] ) ) {
				$doc['menu'][ $id ] = array();
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
	 * admin.json-declared container (custom label / hidden flag), only
	 * force-filling its `items` array.
	 *
	 * @param array $doc Plugin-origin admin.json doc (by reference).
	 */
	private static function ensure_container( &$doc ) {
		if ( ! isset( $doc['menu'][ self::DEFAULT_CONTAINER ] ) || ! is_array( $doc['menu'][ self::DEFAULT_CONTAINER ] ) ) {
			$doc['menu'][ self::DEFAULT_CONTAINER ] = array(
				'label'    => __( 'Plugins', 'wp-admin-shell' ),
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
	 * screen. The shell's iframe-fallback app handler picks up the
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
	 * `WP_Admin_Shell_Dashboard_Widgets::derive_entry_id`'s suffix
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
		// new `wp_admin_shell_classic_menu_core_slugs` filter between
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
 * so an explicit `wp_admin_shell_register_menu_item()` call wins via
 * the idempotency guard (first writer wins on entry id) and a plugin
 * author hooking `wp_admin_shell_data_plugin` at default priority 10
 * still wins on top.
 */
add_filter(
	'wp_admin_shell_data_plugin',
	array( 'WP_Admin_Shell_Classic_Menu_Bridge', 'contribute' ),
	6
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
	'wp_admin_shell_cache_signals',
	function ( $signals ) {
		// Avoid running `scan()` during early requests when neither
		// global is populated — both null/missing → empty scan → no
		// signal.
		if ( ! isset( $GLOBALS['menu'] ) && ! isset( $GLOBALS['submenu'] ) ) {
			return $signals;
		}
		$records = WP_Admin_Shell_Classic_Menu_Bridge::scan();
		if ( ! empty( $records ) ) {
			$signals['classic_menu_bridge'] = md5( wp_json_encode( $records ) );
		}
		return $signals;
	}
);
