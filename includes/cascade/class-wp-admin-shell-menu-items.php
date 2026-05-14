<?php
/**
 * Menu-items registry — CIAB-compatible nav-item shim.
 *
 * Plugins call `wp_admin_shell_register_menu_item( $id, $args )` (the
 * mechanical `s/next_admin_/wp_admin_shell_/g` rename of CIAB's
 * `next_admin_register_menu_item()`) to declare nav entries at runtime.
 * The registry contributes them to the cascade through the synthetic
 * `plugin` origin so site/role/user origins can still override per the
 * usual rules.
 *
 * CIAB args mirror 1:1 (`to` / `label` / `icon` / `badge` / `parent` /
 * `parent_type` / `position`). The shell adds an optional `region` arg
 * to disambiguate target nav region (defaults to the first
 * `app: 'core:navigation'` region in the resolved tree) and an optional
 * `capability` arg — CIAB pages do their own `current_user_can()` checks
 * inline; the shell drops those in favour of the 4-layer cap model.
 *
 * `parent_type=dropdown` is not supported (shell nav only ships
 * drilldown today). Falls back to drilldown with a `WP_DEBUG` notice.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Menu_Items {

	/**
	 * Registry: id → registered item args (with id stamped in).
	 *
	 * @var array<string, array>
	 */
	private static $registry = array();

	/**
	 * Per-id `dropdown → drilldown` warn-once map.
	 *
	 * @var array<string, bool>
	 */
	private static $warned_dropdown = array();

	/**
	 * Register a menu item.
	 *
	 * Screen emission heuristic: a registered item becomes a `screen`
	 * (drilldown parent) when EITHER it explicitly declares
	 * `parent_type=drilldown` OR another registered item in the same
	 * region bucket references it as `parent`. The latter is the
	 * ergonomic shortcut so plugin authors don't have to register a
	 * "parent shell" item separately when they already have children.
	 *
	 * Screen-id constraint: the registered `$id` is reused verbatim as
	 * the navigation app's drilldown `screen` key, which routes through
	 * the `?screen=<id>` URL slot. Pick ids that survive URL encoding
	 * (alnum + `-` + `_`) and check for collisions with inline
	 * admin.json `screen` ids — the shim does not namespace.
	 *
	 * Cross-region parent caveat: `parent`/child resolution runs per
	 * region bucket. A child whose `parent` lives in a different region
	 * silently lands as a root in the child's bucket. Keep parent +
	 * child in the same region (or use admin.json directly).
	 *
	 * @param string $id   Unique menu-item id (URL-safe; namespaces yourself if you need collision avoidance with inline admin.json screens).
	 * @param array  $args {
	 *     CIAB-flavored args.
	 *
	 *     @type string          $to          Route path (`/posts`), in-shell hash (`#/posts`), or absolute URL.
	 *                                        Required unless the item is a parent (carries `parent_type`).
	 *     @type string          $label       Visible label. Required.
	 *     @type string|null     $icon        Icon name resolved through the engine icon registry.
	 *     @type string|int|null $badge       Optional badge content.
	 *     @type string|null     $parent      Parent menu-item id when nesting under a drilldown screen.
	 *     @type string|null     $parent_type `drilldown` (default for parents) or `dropdown` (falls back).
	 *     @type int|null        $position    Sort key — lower numbers render first. Null = registration order.
	 *     @type string|null     $region      Target nav region id (or slash-separated path, e.g. `sidebar/nav`).
	 *                                        Defaults to the first `core:navigation` region in the tree.
	 *     @type string|null     $capability  WP capability gate. Picked up by the shell's existing cap layer.
	 *     @type bool|null       $external    Mark as external link (rendered with target="_blank" semantics).
	 *                                        `true` = always external; `false` = always internal (escape hatch
	 *                                        for absolute URLs that should still hash-route); `null` (default)
	 *                                        = auto-detect from `to` (absolute URL → external).
	 *     @type string|null     $description Drilldown screen description. Ignored on link items.
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
			'to'          => '',
			'label'       => '',
			'icon'        => null,
			'badge'       => null,
			'parent'      => null,
			'parent_type' => null,
			'position'    => null,
			'region'      => null,
			'capability'  => null,
			'external'    => null,
			'description' => null,
		);
		$args = array_merge( $defaults, $args );

		if ( ! is_string( $args['label'] ) || $args['label'] === '' ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_label',
				__( 'Menu item "label" must be a non-empty string.', 'wp-admin-shell' )
			);
		}

		$has_to     = is_string( $args['to'] ) && $args['to'] !== '';
		$has_parent = ! empty( $args['parent_type'] );
		if ( ! $has_to && ! $has_parent ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_args',
				__( 'Menu item must declare either "to" (link) or "parent_type" (drilldown parent).', 'wp-admin-shell' )
			);
		}

		if ( $args['parent_type'] !== null && $args['parent_type'] !== 'drilldown' && $args['parent_type'] !== 'dropdown' ) {
			return new WP_Error(
				'wp_admin_shell_menu_item_invalid_parent_type',
				__( 'Menu item "parent_type" must be "drilldown" or "dropdown".', 'wp-admin-shell' )
			);
		}

		if ( $args['parent_type'] === 'dropdown' ) {
			self::warn_dropdown_fallback( $id );
			$args['parent_type'] = 'drilldown';
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
		self::$registry        = array();
		self::$warned_dropdown = array();
	}

	/**
	 * Locate the path of the first region in `$doc` whose `app` is
	 * `core:navigation`. Returns slash-separated path (e.g. `sidebar/nav`)
	 * or null when no nav region is present.
	 *
	 * @param array $doc Resolved (or partial) admin.json tree.
	 * @return string|null
	 */
	public static function find_default_nav_region_id( $doc ) {
		if ( ! is_array( $doc ) ) {
			return null;
		}
		$regions = $doc['regions'] ?? null;
		if ( ! is_array( $regions ) ) {
			return null;
		}
		return self::walk_for_app( $regions, 'core:navigation' );
	}

	/**
	 * Resolve an explicit `region` arg against the doc. Accepts either a
	 * bare region id (matched anywhere in the tree, first hit wins) or a
	 * slash-separated full path.
	 *
	 * @param array  $doc       Resolved admin.json tree.
	 * @param string $region_id Region id or slash-path.
	 * @return string|null Resolved slash-path, null when not found.
	 */
	public static function find_region_path( $doc, $region_id ) {
		if ( ! is_array( $doc ) || ! is_string( $region_id ) || $region_id === '' ) {
			return null;
		}
		$regions = $doc['regions'] ?? null;
		if ( ! is_array( $regions ) ) {
			return null;
		}
		return self::walk_for_id( $regions, $region_id );
	}

	/**
	 * Cascade contribution. Runs at priority 5 on the
	 * `wp_admin_shell_data_plugin` filter (mirrors field-collections).
	 *
	 * Items already declared in admin.json win — the shim only appends
	 * new ids and never overwrites a `screen` parent the doc declared.
	 *
	 * @param array $doc Plugin-origin admin.json doc.
	 * @return array
	 */
	public static function contribute( $doc ) {
		if ( empty( self::$registry ) ) {
			return $doc;
		}

		$by_region          = array();
		$default_region_id  = null;
		$default_resolved   = false;

		foreach ( self::sorted_items() as $item ) {
			$region_id = $item['region'] ?? null;
			if ( $region_id === null || $region_id === '' ) {
				if ( ! $default_resolved ) {
					$default_region_id = self::find_default_nav_region_id( $doc );
					$default_resolved  = true;
				}
				$region_path = $default_region_id;
			} else {
				$region_path = self::find_region_path( $doc, $region_id );
			}
			if ( ! $region_path ) {
				continue; // No matching region in this shell — silently drop.
			}
			$by_region[ $region_path ][] = $item;
		}

		foreach ( $by_region as $region_path => $items_for_region ) {
			$tree = self::build_tree( $items_for_region );
			if ( empty( $tree ) ) {
				continue;
			}
			$doc = self::append_region_items( $doc, $region_path, $tree );
		}

		return $doc;
	}

	/**
	 * Sort the registry by `position` (null sorts last, registration
	 * order preserved within ties).
	 */
	private static function sorted_items() {
		$items   = array_values( self::$registry );
		$indexed = array();
		foreach ( $items as $i => $item ) {
			$indexed[] = array( 'i' => $i, 'item' => $item );
		}
		usort( $indexed, function ( $a, $b ) {
			$pa = $a['item']['position'] ?? null;
			$pb = $b['item']['position'] ?? null;
			$va = $pa === null ? PHP_INT_MAX : (int) $pa;
			$vb = $pb === null ? PHP_INT_MAX : (int) $pb;
			if ( $va === $vb ) {
				return $a['i'] <=> $b['i'];
			}
			return $va < $vb ? -1 : 1;
		} );
		return array_map( function ( $row ) { return $row['item']; }, $indexed );
	}

	/**
	 * Convert a flat list of registered items into the shell's nav-item
	 * tree shape. Items with `parent` matching another item's id nest
	 * under that parent's converted `screen` form.
	 */
	private static function build_tree( $items ) {
		$id_set       = array();
		$children_of  = array();
		$roots        = array();
		foreach ( $items as $item ) {
			$id_set[ $item['id'] ] = true;
		}
		foreach ( $items as $item ) {
			$parent = $item['parent'] ?? null;
			if ( $parent && isset( $id_set[ $parent ] ) ) {
				$children_of[ $parent ][] = $item;
			} else {
				$roots[] = $item;
			}
		}

		$build = function ( $item ) use ( &$build, &$children_of ) {
			$kids_input = $children_of[ $item['id'] ] ?? array();
			$kids       = array_map( $build, $kids_input );
			$is_screen  = ! empty( $kids ) || ( $item['parent_type'] ?? null ) === 'drilldown';
			return $is_screen
				? self::to_shell_screen( $item, $kids )
				: self::to_shell_link( $item );
		};

		return array_values( array_map( $build, $roots ) );
	}

	private static function to_shell_link( $item ) {
		$shell = array(
			'label' => (string) $item['label'],
			'href'  => self::convert_to_to_href( $item['to'] ?? '' ),
		);
		if ( ! empty( $item['icon'] ) ) {
			$shell['icon'] = (string) $item['icon'];
		}
		if ( array_key_exists( 'badge', $item ) && $item['badge'] !== null ) {
			$shell['badge'] = $item['badge'];
		}
		if ( ! empty( $item['capability'] ) ) {
			$shell['capability'] = (string) $item['capability'];
		}
		// Explicit `external` arg wins over absolute-URL auto-detect:
		// `external => true` always flags; `external => false` always
		// suppresses (escape hatch for absolute URLs that should still
		// hash-route through the shell, e.g. signed S3 viewer redirects);
		// `external === null` (default) falls back to URL sniffing.
		if ( $item['external'] === true ) {
			$shell['external'] = true;
		} elseif ( $item['external'] === null && self::is_absolute_url( $item['to'] ?? '' ) ) {
			$shell['external'] = true;
		}
		return $shell;
	}

	private static function to_shell_screen( $item, $kids ) {
		$shell = array(
			'screen' => (string) $item['id'],
			'label'  => (string) $item['label'],
			'items'  => array_values( $kids ),
		);
		if ( ! empty( $item['icon'] ) ) {
			$shell['icon'] = (string) $item['icon'];
		}
		if ( ! empty( $item['description'] ) ) {
			$shell['description'] = (string) $item['description'];
		}
		if ( ! empty( $item['capability'] ) ) {
			$shell['capability'] = (string) $item['capability'];
		}
		return $shell;
	}

	private static function convert_to_to_href( $to ) {
		$to = (string) $to;
		if ( $to === '' ) {
			return '';
		}
		if ( self::is_absolute_url( $to ) ) {
			return $to;
		}
		if ( $to[0] === '#' ) {
			return $to;
		}
		if ( $to[0] === '/' ) {
			return '#' . $to;
		}
		return $to;
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
	 * Append nav items into `regions.<path>.config.items[]`, preserving
	 * any existing items in admin.json.
	 */
	private static function append_region_items( $doc, $region_path, $items ) {
		$segments = explode( '/', $region_path );
		$path     = array_merge( array( 'regions' ), self::regions_path_keys( $segments ), array( 'config', 'items' ) );
		return self::set_in_path( $doc, $path, function ( $existing ) use ( $items ) {
			$existing = is_array( $existing ) ? $existing : array();
			return array_merge( $existing, $items );
		} );
	}

	/**
	 * Convert a list of region-id segments into the actual key path.
	 * Nested regions live under `regions.<id>.regions.<child-id>...`.
	 *
	 * `['sidebar']`           → `['sidebar']`
	 * `['sidebar', 'nav']`    → `['sidebar', 'regions', 'nav']`
	 */
	private static function regions_path_keys( $segments ) {
		$out   = array();
		$first = true;
		foreach ( $segments as $seg ) {
			if ( $first ) {
				$out[] = $seg;
				$first = false;
			} else {
				$out[] = 'regions';
				$out[] = $seg;
			}
		}
		return $out;
	}

	private static function set_in_path( $doc, $path, $update_callback ) {
		if ( ! is_array( $doc ) ) {
			$doc = array();
		}
		return self::set_in_path_internal( $doc, $path, $update_callback, 0 );
	}

	private static function set_in_path_internal( $doc, $path, $update_callback, $idx ) {
		$key     = $path[ $idx ];
		$is_last = $idx === count( $path ) - 1;
		if ( $is_last ) {
			$doc[ $key ] = $update_callback( $doc[ $key ] ?? null );
		} else {
			$child       = isset( $doc[ $key ] ) && is_array( $doc[ $key ] ) ? $doc[ $key ] : array();
			$doc[ $key ] = self::set_in_path_internal( $child, $path, $update_callback, $idx + 1 );
		}
		return $doc;
	}

	/**
	 * Recursively walk the regions tree looking for the first region
	 * with `app === $target_app`. Returns its slash-path or null.
	 */
	private static function walk_for_app( $regions, $target_app, $path_prefix = '' ) {
		foreach ( $regions as $id => $region ) {
			if ( ! is_array( $region ) ) {
				continue;
			}
			$full_id = $path_prefix === '' ? (string) $id : $path_prefix . '/' . $id;
			if ( ( $region['app'] ?? null ) === $target_app ) {
				return $full_id;
			}
			if ( isset( $region['regions'] ) && is_array( $region['regions'] ) ) {
				$found = self::walk_for_app( $region['regions'], $target_app, $full_id );
				if ( $found ) {
					return $found;
				}
			}
		}
		return null;
	}

	/**
	 * Locate a region by id (bare or slash-path). Bare ids match the last
	 * segment anywhere in the tree; slash-paths must match in full.
	 */
	private static function walk_for_id( $regions, $target, $path_prefix = '' ) {
		$has_slash = strpos( $target, '/' ) !== false;
		foreach ( $regions as $id => $region ) {
			if ( ! is_array( $region ) ) {
				continue;
			}
			$full_id = $path_prefix === '' ? (string) $id : $path_prefix . '/' . $id;
			if ( $has_slash ) {
				if ( $full_id === $target ) {
					return $full_id;
				}
			} elseif ( (string) $id === $target ) {
				return $full_id;
			}
			if ( isset( $region['regions'] ) && is_array( $region['regions'] ) ) {
				$found = self::walk_for_id( $region['regions'], $target, $full_id );
				if ( $found ) {
					return $found;
				}
			}
		}
		return null;
	}

	private static function warn_dropdown_fallback( $id ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		if ( ! empty( self::$warned_dropdown[ $id ] ) ) {
			return;
		}
		self::$warned_dropdown[ $id ] = true;
		$message = sprintf(
			/* translators: %s: menu item id */
			__( 'Menu item %s declared parent_type=dropdown. The shell does not ship a dropdown nav primitive in this release; falling back to drilldown.', 'wp-admin-shell' ),
			$id
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

add_filter( 'wp_admin_shell_data_plugin', array( 'WP_Admin_Shell_Menu_Items', 'contribute' ), 5 );
