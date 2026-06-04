<?php
/**
 * Admin-bar + admin-notices runtime harvest (#128).
 *
 * The admin-bar node tree (`WP_Admin_Bar`) and `admin_notices` output are
 * PHP runtime structures with no clean REST representation — core + plugins
 * populate them at request time. The shell harvests them server-side and
 * exposes them to the chrome apps (`core:toolbar-actions`,
 * `core:notices-banner`) so un-ported third-party plugins still surface in
 * the workspace. This is the runtime-harvest pattern (skip-core-first,
 * ingest-rest, expose a skip-list filter) — see
 * `docs/runtime-harvest-pattern.md`.
 *
 * Two passes:
 *
 *   1. **Admin-bar → toolbar.** `harvest_admin_bar()` instantiates a
 *      `WP_Admin_Bar`, runs `do_action( 'admin_bar_menu', $bar )`, and reads
 *      `$bar->get_nodes()`. It SKIPS the core nodes the shell already owns
 *      first-class (`site-hub` renders the site name + visit-site, the
 *      `user-menu` renders the my-account cluster, and `core:toolbar-actions`
 *      builds `+new` natively via #129). The remaining PLUGIN nodes are
 *      emitted as a flat list of top-level entries, each with its harvested
 *      child nodes folded into a `children[]` dropdown. Node `title` strings
 *      are arbitrary admin HTML/icons → rendered via the engine-side
 *      arbitrary-icon escape hatch (`TrustedNodeTitle`), never the kernel's
 *      name-based icon registry.
 *
 *   2. **admin_notices → banner.** `capture_admin_notices()` buffers
 *      (`ob_start`) the output of `do_action( 'admin_notices' )` +
 *      `do_action( 'all_admin_notices' )` on the shell's own render pass and
 *      returns the captured HTML for `core:notices-banner` to render
 *      alongside its `@wordpress/notices` source.
 *
 *      **Documented limitation.** The shell is a SPA, but `admin_notices` is
 *      a *per-page-render* hook. Only notices that fire on the shell's own
 *      page load (global ones, not gated on `$pagenow` / the current screen)
 *      are captured; per-screen notices keyed on a classic screen do NOT
 *      fire and are not surfaced. **Global-only is the accepted interim** —
 *      the proper fix is a notices REST surface (upstream #155).
 *
 *      **Double-dispatch guard.** `capture_admin_notices()` is invoked from
 *      `wp_admin_workspaces_enqueue_assets()` (hooked on `admin_enqueue_scripts`,
 *      fired near the TOP of `wp-admin/admin-header.php`). The hijack then
 *      renders the shell through that same `admin-header.php`, which fires
 *      `do_action( 'admin_notices' )` + `do_action( 'all_admin_notices' )`
 *      AGAIN near the bottom. Without intervention every notice callback
 *      would run twice — double side effects (counters, dismiss-and-set,
 *      follow-up enqueues) plus the same markup rendered both natively (into
 *      `#wpbody-content`, beside the shell mount) AND in the harvested
 *      banner. So once a capture pass runs, the harvest DETACHES the core
 *      notice hooks (`remove_all_actions`) — the later native pass becomes a
 *      no-op, and the captured HTML is the single source rendered by
 *      `core:notices-banner`. Guarded by `$notices_captured` so a second
 *      `capture_admin_notices()` call doesn't re-buffer an already-drained
 *      hook (returns the memoized HTML).
 *
 * **Trust.** Harvested HTML (notice markup, admin-bar node titles) is
 * admin-context — the same author-trust boundary at which classic wp-admin
 * renders it. The shell only renders it inside the already-admin-gated
 * workspace. Awareness note: the threat *surface* isn't byte-identical to
 * classic. An event-handler attribute injected into a node title (e.g.
 * `<img onerror=…>`) executes in the shell SPA's document context — which
 * carries `wp.data`, REST nonces, and the kernel runtime on `window` — not
 * just the classic admin-bar render. It remains the same author-trust call
 * (a plugin that can inject here can already act as admin), so this is an
 * accepted-risk decision, not "zero new exposure".
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Chrome_Harvest {

	/**
	 * Core admin-bar node ids the shell already renders first-class, so
	 * the harvest skips them (and their descendants) to avoid
	 * double-rendering. Extensible via the
	 * `wp_admin_workspaces_admin_bar_core_node_ids` filter.
	 *
	 *   - `wp-logo` + descendants: the WordPress logo / about cluster.
	 *   - `site-name` + descendants: site title + visit-site → `site-hub`.
	 *   - `my-account` / `user-actions` + descendants: the avatar / logout
	 *     cluster → `user-menu`.
	 *   - `new-content` + descendants: the `+New` cluster → built natively
	 *     by `core:toolbar-actions` (#129).
	 *   - `menu-toggle`, `search`: mobile chrome the shell doesn't mirror.
	 *   - `customize`, `edit`, `view`: context links tied to a classic
	 *     screen that don't apply to the SPA shell root.
	 *   - `updates`, `comments`: surfaced by the shell's own nav/badges.
	 *
	 * @var string[]
	 */
	private static $CORE_NODE_IDS = array(
		'wp-logo',
		'wp-logo-external',
		'about',
		'contribute',
		'wporg',
		'documentation',
		'support-forums',
		'feedback',
		'menu-toggle',
		'site-name',
		'view-site',
		'dashboard',
		'appearance',
		'my-account',
		'user-actions',
		'user-info',
		'edit-profile',
		'logout',
		'new-content',
		'search',
		'updates',
		'comments',
		'customize',
		'edit',
		'view',
	);

	/**
	 * Request-scoped memo of the harvested admin-bar node list.
	 * @var array<int, array>|null
	 */
	private static $admin_bar_cache = null;

	/**
	 * Request-scoped memo of the filtered core-node-id skip set.
	 * @var string[]|null
	 */
	private static $core_node_ids_cache = null;

	/**
	 * Request-scoped memo of the captured admin-notices HTML. Set on the
	 * first `capture_admin_notices()` pass; a second call returns this
	 * instead of re-buffering an already-drained hook (the first pass
	 * detaches the core notice actions — see the class docblock).
	 * @var string|null
	 */
	private static $notices_captured = null;

	/**
	 * Resolve the filtered set of core admin-bar node ids to skip.
	 * Mirrors the menu bridge's `core_slugs()` memo: the filter
	 * dispatches once per request, and the result is shape-validated so a
	 * misbehaving callback can't poison the lookup with non-strings.
	 *
	 * @return string[]
	 */
	public static function core_node_ids() {
		if ( self::$core_node_ids_cache !== null ) {
			return self::$core_node_ids_cache;
		}
		$filtered = apply_filters(
			'wp_admin_workspaces_admin_bar_core_node_ids',
			self::$CORE_NODE_IDS
		);
		if ( ! is_array( $filtered ) ) {
			$filtered = self::$CORE_NODE_IDS;
		}
		self::$core_node_ids_cache = array_values( array_filter( $filtered, 'is_string' ) );
		return self::$core_node_ids_cache;
	}

	/**
	 * Is this admin-bar node id one the shell already renders first-class?
	 *
	 * @param string $id Node id.
	 * @return bool
	 */
	public static function is_core_node( $id ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return false;
		}
		return in_array( $id, self::core_node_ids(), true );
	}

	/**
	 * Instantiate a `WP_Admin_Bar`, run the `admin_bar_menu` action so
	 * plugins register their nodes, and return a normalized list of the
	 * top-level PLUGIN nodes (core nodes skipped) with their child nodes
	 * folded into `children[]` dropdowns.
	 *
	 * Record shape (one per surviving top-level node):
	 *
	 *   {
	 *     id:       string,       // admin-bar node id
	 *     title:    string,       // node title HTML (admin trust)
	 *     href:     string|null,  // link target
	 *     meta:     array,        // { target, title (tooltip), ... }
	 *     children: [ { id, title, href, meta }, ... ],
	 *   }
	 *
	 * @return array<int, array>
	 */
	public static function harvest_admin_bar() {
		if ( self::$admin_bar_cache !== null ) {
			return self::$admin_bar_cache;
		}

		// WP_Admin_Bar lives in wp-includes/class-wp-admin-bar.php; it's
		// normally loaded only when the admin bar renders. Guard the
		// class + the helper that core uses to build the default node set.
		if ( ! class_exists( 'WP_Admin_Bar' ) ) {
			$path = ABSPATH . WPINC . '/class-wp-admin-bar.php';
			if ( file_exists( $path ) ) {
				require_once $path;
			}
		}
		if ( ! class_exists( 'WP_Admin_Bar' ) ) {
			self::$admin_bar_cache = array();
			return self::$admin_bar_cache;
		}

		$bar = new WP_Admin_Bar();
		if ( method_exists( $bar, 'initialize' ) ) {
			$bar->initialize();
		}

		// Let core + plugins register their nodes. We run only
		// `admin_bar_menu` (not `wp_before_admin_bar_render`) — that's the
		// hook every plugin uses to `add_node()`; the *_render hooks are
		// for output massaging we don't need.
		do_action( 'admin_bar_menu', $bar );

		$nodes = $bar->get_nodes();
		if ( ! is_array( $nodes ) ) {
			self::$admin_bar_cache = array();
			return self::$admin_bar_cache;
		}

		// Bucket children by parent so we can fold them into dropdowns.
		$children_by_parent = array();
		foreach ( $nodes as $node ) {
			$parent = isset( $node->parent ) ? (string) $node->parent : '';
			if ( $parent === '' ) {
				continue;
			}
			if ( ! isset( $children_by_parent[ $parent ] ) ) {
				$children_by_parent[ $parent ] = array();
			}
			$children_by_parent[ $parent ][] = $node;
		}

		$records = array();
		foreach ( $nodes as $node ) {
			// Top-level nodes only (no parent). Children are folded below.
			$parent = isset( $node->parent ) ? (string) $node->parent : '';
			if ( $parent !== '' ) {
				continue;
			}
			$id = isset( $node->id ) ? (string) $node->id : '';
			if ( $id === '' || self::is_core_node( $id ) ) {
				continue;
			}
			// `group` nodes are invisible containers — skip the wrapper at
			// the top level (rare; defensive). Its descendants stay reachable
			// via the parent map for any real node that parents to it.
			// NOTE: `get_nodes()` returns UNBOUND nodes — the `type` property
			// (`'group'`/`'item'`) is only assigned in `WP_Admin_Bar::_bind()`
			// at render time, which the harvest never runs. The reliable
			// signal on a raw node is the boolean `group` property (set from
			// the `'group' => true` add_node() arg).
			if ( ! empty( $node->group ) ) {
				continue;
			}

			$records[] = array(
				'id'       => $id,
				'title'    => isset( $node->title ) ? (string) $node->title : $id,
				'href'     => isset( $node->href ) && $node->href !== '' ? (string) $node->href : null,
				'meta'     => self::normalize_meta( isset( $node->meta ) ? $node->meta : array() ),
				'children' => self::harvest_children( $id, $children_by_parent ),
			);
		}

		self::$admin_bar_cache = $records;
		return self::$admin_bar_cache;
	}

	/**
	 * Recursively collect a node's child entries (dropdown items),
	 * following `group` containers transparently — core wraps real
	 * submenu items inside an anonymous `<id>-default` group node.
	 *
	 * @param string             $parent_id          Parent node id.
	 * @param array<string,array> $children_by_parent Parent → child nodes.
	 * @param int                $depth              Recursion guard.
	 * @return array<int, array>
	 */
	private static function harvest_children( $parent_id, $children_by_parent, $depth = 0 ) {
		if ( $depth > 4 || ! isset( $children_by_parent[ $parent_id ] ) ) {
			return array();
		}
		$out = array();
		foreach ( $children_by_parent[ $parent_id ] as $child ) {
			$child_id = isset( $child->id ) ? (string) $child->id : '';
			if ( $child_id === '' || self::is_core_node( $child_id ) ) {
				continue;
			}
			$has_href = isset( $child->href ) && $child->href !== '';
			// A group node is an invisible container. On the UNBOUND nodes
			// `get_nodes()` returns, `type` is never set (it's assigned in
			// `_bind()` at render); the reliable signal is the boolean `group`
			// property. Defensively also treat a node with neither href nor
			// title as a container. Flatten its children up into the current
			// level.
			$is_group = ! empty( $child->group )
				|| ( ! $has_href && ( ! isset( $child->title ) || (string) $child->title === '' ) );
			if ( $is_group ) {
				$out = array_merge(
					$out,
					self::harvest_children( $child_id, $children_by_parent, $depth + 1 )
				);
				continue;
			}
			$out[] = array(
				'id'    => $child_id,
				'title' => isset( $child->title ) ? (string) $child->title : $child_id,
				'href'  => $has_href ? (string) $child->href : null,
				'meta'  => self::normalize_meta( isset( $child->meta ) ? $child->meta : array() ),
			);
		}
		return $out;
	}

	/**
	 * Pluck the meta keys the renderer cares about from a node's meta
	 * array — `target` (anchor target) and `title` (tooltip). Drops the
	 * rest (onclick handlers, html blobs, tabindex) so the JSON payload
	 * stays small and we don't ship event-handler strings.
	 *
	 * @param mixed $meta Raw node meta.
	 * @return array{target?:string,tooltip?:string}
	 */
	private static function normalize_meta( $meta ) {
		$out = array();
		if ( ! is_array( $meta ) ) {
			return $out;
		}
		if ( isset( $meta['target'] ) && is_string( $meta['target'] ) && $meta['target'] !== '' ) {
			$out['target'] = $meta['target'];
		}
		if ( isset( $meta['title'] ) && is_string( $meta['title'] ) && $meta['title'] !== '' ) {
			$out['tooltip'] = $meta['title'];
		}
		return $out;
	}

	/**
	 * Buffer the output of the `admin_notices` + `all_admin_notices`
	 * actions and return the captured HTML. Run on the shell's own render
	 * pass (the workspace page load); only global notices that fire there
	 * are captured — see the class docblock's documented limitation.
	 *
	 * @return string Captured admin-notices HTML (may be empty).
	 */
	public static function capture_admin_notices() {
		// Already captured this request — return the memo without
		// re-dispatching. The first pass detached the core notice hooks, so
		// a second buffer would yield nothing AND mislead callers into
		// thinking there were no notices.
		if ( self::$notices_captured !== null ) {
			return self::$notices_captured;
		}

		ob_start();
		/**
		 * Core / plugin global admin notices. Per-screen notices keyed on
		 * `$pagenow` / the current screen do not fire here (the shell page
		 * isn't their screen) and aren't captured — global-only interim.
		 */
		do_action( 'admin_notices' );
		do_action( 'all_admin_notices' );
		$html = ob_get_clean();
		$html = is_string( $html ) ? trim( $html ) : '';

		// Prevent the double-dispatch: `admin-header.php` (which the hijack
		// renders the shell through) fires these same two actions again near
		// the bottom of its output. Detach every callback now so that later
		// native pass is a no-op — no double side effects, and the captured
		// HTML is the single source `core:notices-banner` renders. See the
		// class docblock's "Double-dispatch guard".
		remove_all_actions( 'admin_notices' );
		remove_all_actions( 'all_admin_notices' );

		self::$notices_captured = $html;
		return self::$notices_captured;
	}

	/**
	 * Reset request-scoped memos. Test-only — the harvest reads runtime
	 * state (registered admin-bar hooks) that tests mutate between
	 * scenarios.
	 */
	public static function reset() {
		self::$admin_bar_cache     = null;
		self::$core_node_ids_cache = null;
		self::$notices_captured    = null;
	}
}
