<?php
/**
 * Menu-items registry — v3 nested-tree shim.
 *
 * Plugins call `wp_admin_shell_register_menu_item( $id, $args )` to declare
 * menu entries at runtime. The registry contributes them to the v3 `menu`
 * tree at the right depth through the `plugin` cascade origin so
 * site/role/user origins can still override per the usual rules.
 *
 * v3 menu shape (from `docs/v3/schema-sketch.md` §Menu shape):
 *
 *   - Tree of nested items keyed by id at every depth.
 *   - Item whose id matches a `screens` id is implicitly bound to that
 *     screen — `label`, `icon`, `description`, `permissions` flow from
 *     the screen automatically.
 *   - Items not matching a screen are standalone artifacts (group
 *     containers, external links, separators).
 *   - Cascade is array-merge-by-id at every depth; null tombstones any
 *     item + its subtree.
 *
 * This class handles two distinct passes:
 *
 *   1. **Plugin-origin contribution.** `contribute()` runs on the
 *      `wp_admin_shell_data_plugin` filter at priority 5. It walks the
 *      registry, finds each item's resolved depth (root or under a
 *      `parent`), and merges the new entries into `$doc['menu']`. Items
 *      with a non-existent `parent` land at root with a WP_DEBUG notice.
 *
 *   2. **Screen-binding pass.** `bind_screens()` runs on the final
 *      `wp_admin_shell_data` filter (after all origins have folded in).
 *      It walks the merged `menu` tree, looks each item id up in
 *      `screens`, and copies the screen's `label` / `icon` /
 *      `description` / `permissions` into the menu item where the item
 *      itself doesn't declare them (menu-item field wins on per-field
 *      collision). This is what makes `{ "posts": { "position": 30 } }`
 *      render with the Posts label, icon, and capability gate without
 *      any author boilerplate.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Menu_Items {

	/** Maximum drilldown / nesting depth honored when resolving parents. */
	const MAX_DEPTH = 10;

	/**
	 * Registry: id → registered item args (with id stamped in).
	 *
	 * @var array<string, array>
	 */
	private static $registry = array();

	/**
	 * Register a menu item.
	 *
	 * @param string $id   Unique menu-item id. Conventionally matches a `screens` id
	 *                     to inherit label/icon/permissions; otherwise the item is
	 *                     a standalone artifact (container, link, separator).
	 * @param array  $args {
	 *     v3 menu-item args. Most fields are optional — set what you need.
	 *
	 *     @type string|null   $label       Override of the bound screen's label. Required
	 *                                      for items NOT matching a screen.
	 *     @type string|null   $icon        Override of the bound screen's icon. Required
	 *                                      for items NOT matching a screen and not a
	 *                                      separator.
	 *     @type string|null   $description Tooltip / drilldown subtitle.
	 *     @type int|null      $position    Sort key — lower numbers render first. Null
	 *                                      = registration order.
	 *     @type string|null   $parent      Parent menu-item id (anywhere in the tree).
	 *                                      Null = root.
	 *     @type string|null   $href        External / in-shell link target. Token
	 *                                      interpolation (`{site_url}`) handled at the
	 *                                      renderer.
	 *     @type bool|null     $external    With `href`, opens in a new tab. Default
	 *                                      false; auto-set true for absolute URLs when
	 *                                      `external` is omitted.
	 *     @type bool|null     $separator   Renders as a visual separator. Other fields
	 *                                      ignored.
	 *     @type bool|null     $hidden      Suppresses the item from rendering (subtree
	 *                                      still addressable by cascade).
	 * }
	 *
	 * @return string|WP_Error Menu-item id on success, WP_Error on failure.
	 */
	public static function register( $id, $args ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_id',
				__( 'Menu item id must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( ! is_array( $args ) ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_args',
				__( 'Menu item args must be an array.', 'wp-admin-shell' )
			);
		}
		if ( isset( self::$registry[ $id ] ) ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_duplicate_id',
				/* translators: %s: menu item id */
				sprintf( __( 'Menu item %s is already registered. Use a different id.', 'wp-admin-shell' ), $id )
			);
		}

		$defaults = array(
			'label'       => null,
			'icon'        => null,
			'description' => null,
			'position'    => null,
			'parent'      => null,
			'href'        => null,
			'external'    => null,
			'separator'   => null,
			'hidden'      => null,
		);
		$args = array_merge( $defaults, $args );

		// Validation — labels are optional at the registry level because
		// screen-binding can supply them. Standalone items (no screen
		// match) without a label render with the id as a fallback —
		// authors who care should declare a label.
		if ( $args['label'] !== null && ( ! is_string( $args['label'] ) || $args['label'] === '' ) ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_label',
				__( 'Menu item "label" must be a non-empty string when set.', 'wp-admin-shell' )
			);
		}

		if ( $args['href'] !== null && ! self::is_safe_href( $args['href'] ) ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_unsafe_scheme',
				/* translators: %s: rejected `href` value */
				sprintf( __( 'Menu item "href" value %s uses a scheme that is not in the allowlist (http/https/ftp/ftps/mailto/tel/sms or relative `/`/`#`).', 'wp-admin-shell' ), $args['href'] )
			);
		}

		if ( $args['parent'] !== null && ( ! is_string( $args['parent'] ) || $args['parent'] === '' ) ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_parent',
				__( 'Menu item "parent" must be a non-empty string id when set.', 'wp-admin-shell' )
			);
		}

		if ( $args['position'] !== null && ! is_int( $args['position'] ) ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_position',
				__( 'Menu item "position" must be an integer or null.', 'wp-admin-shell' )
			);
		}

		self::$registry[ $id ] = array_merge( array( 'id' => $id ), $args );
		return $id;
	}

	/**
	 * Read the full registry. Test/diagnostic surface.
	 *
	 * @return array<string, array>
	 */
	public static function all() {
		return self::$registry;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$registry = array();
	}

	/**
	 * Cascade contribution. Runs at priority 5 on the
	 * `wp_admin_shell_data_plugin` filter.
	 *
	 * Walks the registry, sorts by `position`, and merges each registered
	 * item into the doc's `menu` tree at the resolved depth (root or
	 * under a named `parent`). Items whose `parent` doesn't exist land
	 * at root with a `WP_DEBUG` notice.
	 *
	 * @param array $doc Plugin-origin admin.json doc.
	 * @return array
	 */
	public static function contribute( $doc ) {
		if ( empty( self::$registry ) ) {
			return $doc;
		}

		if ( ! is_array( $doc ) ) {
			$doc = array();
		}
		if ( ! isset( $doc['menu'] ) || ! is_array( $doc['menu'] ) ) {
			$doc['menu'] = array();
		}

		foreach ( self::sorted_items() as $item ) {
			$entry  = self::to_menu_entry( $item );
			$parent = $item['parent'] ?? null;

			if ( $parent !== null && $parent !== '' ) {
				$inserted = self::insert_under_parent( $doc['menu'], $parent, $item['id'], $entry, 0 );
				if ( ! $inserted ) {
					self::warn_missing_parent( $item['id'], $parent );
					// Fall back to root.
					$doc['menu'][ $item['id'] ] = self::merge_entry( $doc['menu'][ $item['id'] ] ?? null, $entry );
				} else {
					$doc['menu'] = $inserted;
				}
			} else {
				// Root insertion — merge with any same-id entry already present.
				$doc['menu'][ $item['id'] ] = self::merge_entry( $doc['menu'][ $item['id'] ] ?? null, $entry );
			}
		}

		return $doc;
	}

	/**
	 * Recursively walk the menu tree looking for the parent id. When
	 * found, inserts/merges `$entry` under `$parent['items']` keyed by
	 * `$child_id`. Returns the mutated tree on success, null when the
	 * parent isn't found at any depth.
	 *
	 * @param array  $tree     Current subtree (keyed by id).
	 * @param string $parent_id Target parent id.
	 * @param string $child_id Id to insert under the parent.
	 * @param array  $entry    Menu-entry payload.
	 * @param int    $depth    Recursion guard.
	 * @return array|null Mutated tree on success, null on miss.
	 */
	private static function insert_under_parent( $tree, $parent_id, $child_id, $entry, $depth ) {
		if ( $depth >= self::MAX_DEPTH ) {
			return null;
		}
		if ( ! is_array( $tree ) ) {
			return null;
		}

		foreach ( $tree as $id => $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			if ( (string) $id === $parent_id ) {
				if ( ! isset( $item['items'] ) || ! is_array( $item['items'] ) ) {
					$item['items'] = array();
				}
				$item['items'][ $child_id ] = self::merge_entry(
					$item['items'][ $child_id ] ?? null,
					$entry
				);
				$tree[ $id ] = $item;
				return $tree;
			}

			if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
				$child = self::insert_under_parent( $item['items'], $parent_id, $child_id, $entry, $depth + 1 );
				if ( $child !== null ) {
					$item['items'] = $child;
					$tree[ $id ]   = $item;
					return $tree;
				}
			}
		}
		return null;
	}

	/**
	 * Merge a registered menu entry with whatever entry is already in
	 * the tree at the same id. Existing fields win on collision —
	 * cascade higher origins (site/role/user) overrode here already, so
	 * the shim must not stomp them. The `items` map merges per-child id.
	 */
	private static function merge_entry( $existing, $incoming ) {
		if ( ! is_array( $existing ) ) {
			return $incoming;
		}
		$merged = $existing;
		foreach ( $incoming as $k => $v ) {
			if ( $k === 'items' && isset( $merged['items'] ) && is_array( $merged['items'] ) ) {
				$merged_items = $merged['items'];
				foreach ( (array) $v as $child_id => $child_entry ) {
					$merged_items[ $child_id ] = self::merge_entry(
						$merged_items[ $child_id ] ?? null,
						$child_entry
					);
				}
				$merged['items'] = $merged_items;
				continue;
			}
			if ( ! array_key_exists( $k, $merged ) ) {
				$merged[ $k ] = $v;
			}
		}
		return $merged;
	}

	/**
	 * Convert a registered item into the v3 menuItem shape. Fields are
	 * only emitted when explicitly set on the registration — empty
	 * fields stay absent so screen-binding can fill them in later.
	 */
	private static function to_menu_entry( $item ) {
		$entry = array();
		if ( $item['label'] !== null && $item['label'] !== '' ) {
			$entry['label'] = (string) $item['label'];
		}
		if ( ! empty( $item['icon'] ) ) {
			$entry['icon'] = (string) $item['icon'];
		}
		if ( ! empty( $item['description'] ) ) {
			$entry['description'] = (string) $item['description'];
		}
		if ( $item['position'] !== null ) {
			$entry['position'] = (int) $item['position'];
		}
		if ( $item['href'] !== null && $item['href'] !== '' ) {
			$entry['href'] = (string) $item['href'];
		}
		// Explicit `external` arg wins over absolute-URL auto-detect;
		// null = auto, true/false = author override.
		if ( $item['external'] === true ) {
			$entry['external'] = true;
		} elseif ( $item['external'] === false ) {
			$entry['external'] = false;
		} elseif ( $item['external'] === null && ! empty( $item['href'] ) && self::is_absolute_url( $item['href'] ) ) {
			$entry['external'] = true;
		}
		if ( $item['separator'] === true ) {
			$entry['separator'] = true;
		}
		if ( $item['hidden'] === true ) {
			$entry['hidden'] = true;
		}
		return $entry;
	}

	/**
	 * Sort the registry by `position` (null sorts last, registration
	 * order preserved within ties).
	 */
	private static function sorted_items() {
		$items   = array_values( self::$registry );
		$indexed = array();
		foreach ( $items as $i => $item ) {
			$indexed[] = array(
				'i'    => $i,
				'item' => $item,
			);
		}
		usort(
			$indexed,
			function ( $a, $b ) {
				$pa = $a['item']['position'] ?? null;
				$pb = $b['item']['position'] ?? null;
				$va = $pa === null ? PHP_INT_MAX : (int) $pa;
				$vb = $pb === null ? PHP_INT_MAX : (int) $pb;
				if ( $va === $vb ) {
					return $a['i'] <=> $b['i'];
				}
				return $va < $vb ? -1 : 1;
			}
		);
		return array_map(
			function ( $row ) {
				return $row['item'];
			},
			$indexed
		);
	}

	/**
	 * Resolver pass: flow screen-bound metadata into menu items.
	 *
	 * Walks the merged `menu` tree recursively. For each item whose id
	 * matches a `screens` entry, copies the screen's `label` / `icon` /
	 * `description` / `permissions` into the menu item where the menu
	 * item itself does not already declare them. The menu-item field
	 * wins on per-field collision so authors can rename / re-icon an
	 * item in the menu without touching the underlying screen.
	 *
	 * Hidden screens (`screens.<id>.hidden: true`) propagate `hidden`
	 * to the matching menu item unless the menu item itself sets a
	 * different value.
	 *
	 * Runs late on the `wp_admin_shell_data` filter so it sees the
	 * fully-resolved cascade (including site/role/user permissions
	 * tightening).
	 *
	 * @param array $doc Fully-resolved admin.json doc.
	 * @return array
	 */
	public static function bind_screens( $doc ) {
		if ( ! is_array( $doc ) ) {
			return $doc;
		}
		if ( ! isset( $doc['menu'] ) || ! is_array( $doc['menu'] ) ) {
			return $doc;
		}
		$screens = ( isset( $doc['screens'] ) && is_array( $doc['screens'] ) )
			? $doc['screens']
			: array();
		if ( empty( $screens ) ) {
			return $doc;
		}
		$doc['menu'] = self::bind_screens_to_tree( $doc['menu'], $screens, 0 );
		return $doc;
	}

	private static function bind_screens_to_tree( $tree, $screens, $depth ) {
		if ( $depth >= self::MAX_DEPTH ) {
			return $tree;
		}
		if ( ! is_array( $tree ) ) {
			return $tree;
		}
		$out = array();
		foreach ( $tree as $id => $item ) {
			if ( ! is_array( $item ) ) {
				$out[ $id ] = $item;
				continue;
			}

			$screen = $screens[ $id ] ?? null;
			if ( is_array( $screen ) ) {
				// Flow screen fields into the menu item where it doesn't declare them.
				if ( ! isset( $item['label'] ) && isset( $screen['label'] ) ) {
					$item['label'] = $screen['label'];
				}
				if ( ! isset( $item['icon'] ) && isset( $screen['icon'] ) ) {
					$item['icon'] = $screen['icon'];
				}
				if ( ! isset( $item['description'] ) && isset( $screen['description'] ) ) {
					$item['description'] = $screen['description'];
				}
				if ( ! isset( $item['permissions'] ) && isset( $screen['permissions'] ) && is_array( $screen['permissions'] ) ) {
					$item['permissions'] = $screen['permissions'];
				}
				// Stamp the bound screen's path so the renderer can build hrefs
				// for items that don't declare one. Non-authoritative; renderer
				// may override.
				if ( ! isset( $item['href'] ) && isset( $screen['path'] ) && is_string( $screen['path'] ) && $screen['path'] !== '' ) {
					$item['href'] = '#' . $screen['path'];
				}
				// `hidden: true` on a screen hides the menu binding unless the
				// menu item explicitly overrides.
				if ( ! isset( $item['hidden'] ) && ! empty( $screen['hidden'] ) ) {
					$item['hidden'] = true;
				}
			}

			if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
				$item['items'] = self::bind_screens_to_tree( $item['items'], $screens, $depth + 1 );
			}

			$out[ $id ] = $item;
		}
		return $out;
	}

	private static function is_absolute_url( $value ) {
		if ( ! is_string( $value ) || $value === '' ) {
			return false;
		}
		if ( strpos( $value, '//' ) === 0 ) {
			return true;
		}
		return (bool) preg_match( '#^[a-z][a-z0-9+.\-]*://#i', $value );
	}

	/**
	 * Reject `javascript:`, `data:`, `vbscript:`, custom-app schemes etc.
	 * Allowlist: relative paths (`/`, `#`, plain), http(s), ftp(s),
	 * mailto, tel, sms. Anything else with a `:` is rejected at register
	 * time so it never reaches a React `<a href>`.
	 *
	 * Navigation-only validator; not for redirect targets or storage.
	 * Use `wp_validate_redirect()` for redirects, `esc_url_raw()` for
	 * storage.
	 *
	 * Defense-in-depth normalization. HTML5 mandates browsers strip
	 * leading ASCII whitespace from `href` before navigation, so
	 * `" //evil.example.com"` would route to `//evil.example.com`
	 * post-strip. We `trim()` first so the leading-`//` check catches
	 * whitespace-padded protocol-relative URLs. Backslash variants
	 * (`\\evil.example.com`, `\/\/evil.example.com`) are rejected too —
	 * modern browsers usually don't navigate them as protocol-relative
	 * per WHATWG, but legacy WebViews and Edge/IE historically did.
	 * Cheap belt-and-suspenders.
	 */
	private static function is_safe_href( $href ) {
		if ( ! is_string( $href ) ) {
			return true;
		}
		// Strip leading + trailing whitespace before any check. HTML5
		// stripping makes leading whitespace navigationally invisible,
		// so the post-strip value is what the browser sees. We validate
		// THAT, not the raw input. The explicit charlist adds form-feed
		// (`\x0c`) on top of PHP's default set (` \t\n\r\0\x0b`) — WHATWG
		// counts FF as a stripped ASCII whitespace character, so a
		// `"\x0c//evil.example.com"` would otherwise navigate post-strip.
		$href = trim( $href, " \t\n\r\0\x0b\x0c" );
		if ( $href === '' ) {
			return true;
		}
		// Protocol-relative URLs (`//evil.example.com`) inherit the page's
		// scheme and route through the browser to an attacker-chosen host.
		// Reject outright — authors who want cross-origin links must
		// declare a full https:// scheme.
		if ( strpos( $href, '//' ) === 0 ) {
			return false;
		}
		// Backslash variants. `\\evil.example.com` is treated as
		// protocol-relative by some legacy WebViews; `\/\/evil.example.com`
		// is the literal escape that some payloads use. Reject both.
		if ( strpos( $href, '\\\\' ) === 0 ) {
			return false;
		}
		if ( strpos( $href, '\\/\\/' ) === 0 ) {
			return false;
		}
		// Token-only hrefs (`{site_url}`, `{home_url}`) are safe — they
		// get interpolated by the renderer.
		if ( $href[0] === '{' ) {
			return true;
		}
		// Leading `/` or `#` covers root-relative and hash routes.
		if ( $href[0] === '/' || $href[0] === '#' ) {
			return true;
		}
		if ( preg_match( '#^(https?|ftps?)://#i', $href ) ) {
			return true;
		}
		if ( preg_match( '#^(mailto|tel|sms):#i', $href ) ) {
			return true;
		}
		// Relative path with no scheme separator is fine; anything else
		// with `:` is rejected. This catches `javascript:`, `data:`,
		// `vbscript:`, and any other custom-app scheme.
		return strpos( $href, ':' ) === false;
	}

	private static function warn_missing_parent( $id, $parent_id ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		$message = sprintf(
			/* translators: 1: menu item id, 2: missing parent id */
			__( 'Menu item %1$s declared parent %2$s but no such item exists in the menu tree. Falling back to root.', 'wp-admin-shell' ),
			$id,
			$parent_id
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

// Plugin-origin contribution — runs at priority 5 so authors hooking
// `wp_admin_shell_data_plugin` at default priority 10 win on overlapping
// fields.
add_filter( 'wp_admin_shell_data_plugin', array( 'WP_Admin_Shell_Menu_Items', 'contribute' ), 5 );

// Screen-binding resolver pass — runs on the final post-cascade filter
// so screens/menu fields resolved across all origins (site/role/user
// overrides included) are visible. Priority 5 keeps room for plugin
// authors who hook `wp_admin_shell_data` at default 10 to see the bound
// tree, and sequences this pass BEFORE
// `WP_Admin_Shell_Data_View_Config::inject_app_baselines` (priority 6)
// so dataView baselines attach to screens already contributed by the
// menu-item shim. See `docs/upgrade-v2-to-v3.md` filter-ordering
// section.
add_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_Menu_Items', 'bind_screens' ), 5 );

// Registry state lives in static class memory — invisible to the
// default cache-signal map. Hook into the cache layer's filter so a
// menu-item registration delta forces a fresh resolver run cross-request.
add_filter(
	'wp_admin_shell_cache_signals',
	function ( $signals ) {
		$registry = WP_Admin_Shell_Menu_Items::all();
		if ( ! empty( $registry ) ) {
			$signals['menu_items'] = md5( wp_json_encode( $registry ) );
		}
		return $signals;
	}
);
