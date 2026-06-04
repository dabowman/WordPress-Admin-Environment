<?php
/**
 * Classic dashboard-widget bridge (#134).
 *
 * The classic wp-admin dashboard is a runtime structure with no clean REST
 * representation: core + plugins register meta-boxes into
 * `$GLOBALS['wp_meta_boxes']['dashboard']` at request time (via
 * `wp_add_dashboard_widget()` / `add_meta_box()`). The workspace HARVESTS those
 * meta-boxes server-side and folds the un-ported PLUGIN widgets into the
 * dashboard-host grid as tiles, so a third-party dashboard widget surfaces in
 * the workspace without anyone writing workspace config.
 *
 * This is the dashboard sibling of the #128 admin-bar / notices chrome
 * harvest — the runtime-harvest pattern (skip-core-first, ingest-rest, expose
 * a skip-list filter). See `docs/runtime-harvest-pattern.md`.
 *
 * **Harvest pass.** At `wp_admin_workspaces_data_plugin` priority 6 (after the
 * dashboard-widgets registry contribution at priority 5, so author-registered
 * tiles win an id collision), the bridge:
 *
 *   1. Ensures the dashboard meta-boxes are registered — runs
 *      `wp_dashboard_setup()` (idempotent; guarded so it only fires once per
 *      request and only when the dashboard API is loadable).
 *   2. Walks `$wp_meta_boxes['dashboard']` across every context
 *      (`normal` / `side` / `column3` / `column4`) and priority bucket.
 *   3. SKIPS the core widgets the workspace already ships as native tiles after
 *      #133 (`dashboard_right_now`, `dashboard_activity`,
 *      `dashboard_quick_press`, the recent-drafts box, `dashboard_primary` /
 *      `dashboard_php_nag`). Extensible via the
 *      `wp_admin_workspaces_dashboard_core_widget_ids` filter.
 *   4. Synthesizes a `screens[dashboard-widgets].apps[]` entry for each
 *      surviving plugin widget — `slot: 'grid'`, `app:
 *      'core:dashboard-widget-classic'` (the captured-HTML tile renderer),
 *      `config: { widgetId, title }` so the single tile app knows which
 *      classic widget to fetch + render.
 *
 * **Render (app-space).** The tile app (`core:dashboard-widget-classic`)
 * lazily fetches the captured widget HTML from
 * `GET /wp-admin-workspaces/v1/dashboard-widget/{id}` (per-tile, so a slow plugin
 * widget doesn't block the grid) and renders it at admin trust, with a
 * per-tile iframe fallback to classic `index.php` for widgets whose enqueued
 * JS won't run in captured HTML.
 *
 * **Boundary.** Harvest = PHP data emission (this class). Rendering = app
 * space (the tile). The kernel never learns about the bridge.
 *
 * **Trust.** Captured widget HTML is admin-context — the same author-trust
 * boundary at which classic wp-admin renders it. The workspace only renders it
 * inside the already-admin-gated workspace. Identical exposure to the #128
 * notices buffer (see that class' awareness note).
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Dashboard_Bridge {

	/**
	 * Default target screen id the bridge contributes tiles into. Matches
	 * the dashboard-widgets registry default so author tiles + harvested
	 * tiles land on the same grid.
	 */
	const TARGET_SCREEN = 'dashboard-widgets';

	/**
	 * The shared captured-HTML tile app every harvested widget mounts. One
	 * app, per-tile `config.widgetId` — the app fetches that widget's HTML
	 * from the lazy REST endpoint.
	 */
	const TILE_APP = 'core:dashboard-widget-classic';

	/**
	 * Dashboard meta-box contexts wp-admin lays widgets into. `column3` /
	 * `column4` exist for high-column-count dashboards (rare but real).
	 *
	 * @var string[]
	 */
	private static $CONTEXTS = array( 'normal', 'side', 'column3', 'column4' );

	/**
	 * Core dashboard widget ids the workspace ships as NATIVE tiles after #133,
	 * so the bridge skips them to avoid double-rendering. Extensible via the
	 * `wp_admin_workspaces_dashboard_core_widget_ids` filter.
	 *
	 *   - `dashboard_right_now`     → `core:dashboard-widget-at-a-glance`.
	 *   - `dashboard_activity`      → `core:dashboard-widget-activity`
	 *                                  (recent comments + scheduled/recent posts).
	 *   - `dashboard_quick_press`   → `core:dashboard-widget-quick-draft`.
	 *   - `dashboard_recent_drafts` → folded into the quick-draft tile; also
	 *     registered standalone on some installs.
	 *   - `dashboard_primary` / `dashboard_secondary` → WordPress events/news
	 *     feed; workspace omits.
	 *   - `dashboard_php_nag`       → PHP-version nag; surfaced via the workspace's
	 *     own notices / site-health surfaces.
	 *   - `dashboard_browser_nag`   → legacy browser nag; not mirrored.
	 *   - `welcome_panel`           → dashboard welcome panel; workspace greeting
	 *     replaces it.
	 *
	 * @var string[]
	 */
	private static $CORE_WIDGET_IDS = array(
		'dashboard_right_now',
		'dashboard_activity',
		'dashboard_quick_press',
		'dashboard_recent_drafts',
		'dashboard_primary',
		'dashboard_secondary',
		'dashboard_php_nag',
		'dashboard_browser_nag',
		'welcome_panel',
	);

	/**
	 * Request-scoped guard so `wp_dashboard_setup()` runs at most once.
	 * @var bool
	 */
	private static $setup_done = false;

	/**
	 * Request-scoped memo of the filtered core-widget-id skip set.
	 * @var string[]|null
	 */
	private static $core_widget_ids_cache = null;

	/**
	 * Resolve the filtered set of core dashboard widget ids to skip.
	 * Mirrors the chrome-harvest / menu-bridge memo pattern: the filter
	 * dispatches once per request, and the result is shape-validated so a
	 * misbehaving callback can't poison the lookup with non-strings.
	 *
	 * @return string[]
	 */
	public static function core_widget_ids() {
		if ( self::$core_widget_ids_cache !== null ) {
			return self::$core_widget_ids_cache;
		}
		$filtered = apply_filters(
			'wp_admin_workspaces_dashboard_core_widget_ids',
			self::$CORE_WIDGET_IDS
		);
		if ( ! is_array( $filtered ) ) {
			$filtered = self::$CORE_WIDGET_IDS;
		}
		self::$core_widget_ids_cache = array_values( array_filter( $filtered, 'is_string' ) );
		return self::$core_widget_ids_cache;
	}

	/**
	 * Is this dashboard widget id one the workspace already renders first-class?
	 *
	 * @param string $id Meta-box id.
	 * @return bool
	 */
	public static function is_core_widget( $id ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return false;
		}
		return in_array( $id, self::core_widget_ids(), true );
	}

	/**
	 * Ensure the dashboard meta-boxes are registered. `wp_dashboard_setup()`
	 * fires the `wp_dashboard_setup` action plugins hook to call
	 * `wp_add_dashboard_widget()`. Loads the wp-admin dashboard API (normally
	 * only included on the dashboard screen) before calling.
	 *
	 * **Screen context.** `wp_add_dashboard_widget()` → `add_meta_box()` files
	 * each widget under `$wp_meta_boxes[ get_current_screen()->id ]`. In every
	 * context this bridge runs the current screen is NOT `dashboard`: the workspace
	 * render sets `wp-admin-workspaces` (see `WP_Admin_Workspaces_Hijack`), and a REST
	 * request has no admin screen at all (`get_current_screen()` is null, so
	 * `add_meta_box()` hits its `! isset( $screen->id )` guard and registers
	 * nothing). Either way `$wp_meta_boxes['dashboard']` stays empty and the
	 * harvest finds nothing. So we FORCE the dashboard screen around the
	 * `wp_dashboard_setup()` call, then RESTORE the prior screen so the
	 * surrounding workspace-render / REST context isn't corrupted.
	 *
	 * Idempotent — guarded by `$setup_done`. `wp_dashboard_setup()` itself
	 * is safe to call twice (it re-registers into the same buckets), but the
	 * guard avoids re-dispatching the action's side effects needlessly.
	 *
	 * Perf note: on a config cache-miss this dispatches the full
	 * `wp_dashboard_setup` action (every plugin's widget registration) just to
	 * harvest titles — bounded to once per request via `$setup_done`, and the
	 * heavier per-widget render is deferred to the lazy REST endpoint.
	 *
	 * @return bool True when setup ran (or had already run), false when the
	 *              dashboard API couldn't be loaded.
	 */
	public static function ensure_dashboard_setup() {
		if ( self::$setup_done ) {
			return true;
		}
		if ( ! function_exists( 'wp_dashboard_setup' ) ) {
			$path = ABSPATH . 'wp-admin/includes/dashboard.php';
			if ( ! file_exists( $path ) ) {
				return false;
			}
			require_once $path;
		}
		if ( ! function_exists( 'wp_dashboard_setup' ) ) {
			return false;
		}

		// `set_current_screen()` / `get_current_screen()` live in
		// wp-admin/includes/screen.php — loaded on admin requests but NOT in a
		// plain REST context. Require it before forcing the screen.
		if ( ! function_exists( 'set_current_screen' ) || ! function_exists( 'get_current_screen' ) ) {
			$screen_path = ABSPATH . 'wp-admin/includes/screen.php';
			if ( file_exists( $screen_path ) ) {
				require_once $screen_path;
			}
		}
		$can_force_screen = function_exists( 'set_current_screen' ) && function_exists( 'get_current_screen' );

		$prior_screen = $can_force_screen ? get_current_screen() : null;
		if ( $can_force_screen ) {
			set_current_screen( 'dashboard' );
		}

		try {
			wp_dashboard_setup();
		} finally {
			// Restore the prior screen so the workspace render / REST request that
			// called us isn't left pointing at `dashboard`. A null prior screen
			// (REST) is restored by passing the WP_Screen-less sentinel; passing
			// the prior screen object is the documented round-trip.
			if ( $can_force_screen ) {
				if ( $prior_screen instanceof WP_Screen ) {
					set_current_screen( $prior_screen );
				} elseif ( is_object( $prior_screen ) && isset( $prior_screen->id ) ) {
					set_current_screen( $prior_screen->id );
				} else {
					// No prior screen (REST) — clear the forced dashboard screen.
					unset( $GLOBALS['current_screen'] );
				}
			}
		}

		self::$setup_done = true;
		return true;
	}

	/**
	 * Walk `$wp_meta_boxes['dashboard']` and return the surviving PLUGIN
	 * widgets as bridge records, skipping the core widgets the workspace ships
	 * native.
	 *
	 * Record shape (one per surviving widget):
	 *
	 *   {
	 *     widget_id: string,   // meta-box id (REST endpoint key)
	 *     entry_id:  string,   // schema-safe screen-app entry id
	 *     title:     string,   // widget title (tags stripped — display label)
	 *   }
	 *
	 * The meta-box `context` (normal/side/column3/column4) is intentionally
	 * NOT captured: tiles always land in the host grid's `slot: 'grid'` flow,
	 * so the classic column placement is never honored — emitting it would
	 * imply a fidelity the host doesn't provide.
	 *
	 * @return array<int, array>
	 */
	public static function harvest_widgets() {
		if ( ! self::ensure_dashboard_setup() ) {
			return array();
		}

		global $wp_meta_boxes;
		if ( ! is_array( $wp_meta_boxes ) || ! isset( $wp_meta_boxes['dashboard'] ) || ! is_array( $wp_meta_boxes['dashboard'] ) ) {
			return array();
		}

		$records      = array();
		$seen_ids     = array();
		$seen_entries = array();
		$dashboard    = $wp_meta_boxes['dashboard'];

		foreach ( self::$CONTEXTS as $context ) {
			if ( ! isset( $dashboard[ $context ] ) || ! is_array( $dashboard[ $context ] ) ) {
				continue;
			}
			foreach ( $dashboard[ $context ] as $boxes ) {
				if ( ! is_array( $boxes ) ) {
					continue;
				}
				foreach ( $boxes as $widget_id => $box ) {
					$widget_id = (string) $widget_id;
					// A removed meta-box is stored as `false` in the bucket.
					if ( $widget_id === '' || $box === false || ! is_array( $box ) ) {
						continue;
					}
					if ( self::is_core_widget( $widget_id ) ) {
						continue;
					}
					// Same widget id can appear in more than one bucket after
					// re-registration; keep the first occurrence.
					if ( isset( $seen_ids[ $widget_id ] ) ) {
						continue;
					}
					// No callback → nothing the REST endpoint could render.
					if ( ! isset( $box['callback'] ) || ! is_callable( $box['callback'] ) ) {
						continue;
					}
					$seen_ids[ $widget_id ] = true;

					$raw_title = isset( $box['title'] ) ? (string) $box['title'] : $widget_id;
					// Titles can carry config-link markup (e.g. the RSS
					// widgets' gear). Strip tags for the tile header label.
					$title = trim( wp_strip_all_tags( $raw_title ) );
					if ( $title === '' ) {
						$title = $widget_id;
					}

					// Two DISTINCT raw widget ids can kebab-normalize to the
					// same entry_id (e.g. `Acme_Box` + `acme-box`). The cascade
					// dedupes on entry_id, so without disambiguation the second
					// tile would be silently dropped. On collision, append a
					// short hash of the raw id so two real widgets can't merge.
					$entry_id = self::derive_entry_id( $widget_id );
					if ( isset( $seen_entries[ $entry_id ] ) ) {
						$entry_id = $entry_id . '-' . substr( md5( $widget_id ), 0, 6 );
						if ( function_exists( '_doing_it_wrong' ) ) {
							_doing_it_wrong(
								__METHOD__,
								sprintf(
									/* translators: 1: widget id, 2: disambiguated entry id */
									esc_html__( 'Dashboard widget id "%1$s" collided with another widget on the derived tile id; disambiguated to "%2$s".', 'wp-admin-workspaces' ),
									esc_html( $widget_id ),
									esc_html( $entry_id )
								),
								'1.0.0'
							);
						}
					}
					$seen_entries[ $entry_id ] = true;

					$records[] = array(
						'widget_id' => $widget_id,
						'entry_id'  => $entry_id,
						'title'     => $title,
					);
				}
			}
		}

		return $records;
	}

	/**
	 * Build the `appsEntry`-shaped tile for a harvested widget record. Each
	 * tile mounts the shared captured-HTML app with per-tile config naming
	 * the classic widget id + display title.
	 *
	 * @param array $record Harvest record from `harvest_widgets()`.
	 * @return array `{ id, app, slot, config }`.
	 */
	public static function build_tile_entry( $record ) {
		return array(
			'id'     => $record['entry_id'],
			'app'    => self::TILE_APP,
			'slot'   => 'grid',
			'config' => array(
				'widgetId' => $record['widget_id'],
				'title'    => $record['title'],
			),
		);
	}

	/**
	 * Derive a schema-safe screen-app entry id (`^[a-z][a-z0-9-]*$`) from a
	 * classic widget meta-box id. The classic id can contain underscores,
	 * uppercase, or other characters (`dashboard_php_nag`, `My_Plugin-Box`);
	 * normalize to kebab-case and namespace under `classic-` so harvested
	 * tiles can't collide with author / registry entry ids.
	 *
	 * @param string $widget_id Meta-box id.
	 * @return string
	 */
	public static function derive_entry_id( $widget_id ) {
		$suffix = strtolower( (string) $widget_id );
		$suffix = preg_replace( '/[^a-z0-9]+/', '-', $suffix );
		$suffix = trim( $suffix, '-' );
		if ( $suffix === '' ) {
			$suffix = 'widget';
		}
		return 'classic-' . $suffix;
	}

	/**
	 * Reset request-scoped state. Test-only — the harvest reads runtime
	 * state (registered dashboard meta-boxes) that tests mutate between
	 * scenarios.
	 */
	public static function reset() {
		self::$setup_done            = false;
		self::$core_widget_ids_cache = null;
	}
}

/**
 * Cascade contribution — synthesize a tile for each surviving plugin
 * dashboard widget into `screens[dashboard-widgets].apps[]`.
 *
 * Priority 6 (after the dashboard-widgets registry at priority 5 + the menu
 * bridge / dataView baselines) so author-registered tiles + workspace.json
 * declarations win an entry-id collision via the cascade's id-keyed array
 * merge — the bridge only appends ids no one else already claimed.
 */
add_filter( 'wp_admin_workspaces_data_plugin', function ( $doc ) {
	$records = WP_Admin_Workspaces_Dashboard_Bridge::harvest_widgets();
	if ( empty( $records ) ) {
		return $doc;
	}

	if ( ! isset( $doc['screens'] ) || ! is_array( $doc['screens'] ) ) {
		$doc['screens'] = array();
	}
	$target = WP_Admin_Workspaces_Dashboard_Bridge::TARGET_SCREEN;
	if ( ! isset( $doc['screens'][ $target ] ) || ! is_array( $doc['screens'][ $target ] ) ) {
		$doc['screens'][ $target ] = array();
	}
	if ( ! isset( $doc['screens'][ $target ]['apps'] ) || ! is_array( $doc['screens'][ $target ]['apps'] ) ) {
		$doc['screens'][ $target ]['apps'] = array();
	}

	// Collect the entry ids already present so the bridge never duplicates an
	// id an author / the registry already claimed (first-write wins) and stays
	// idempotent if the pipeline runs twice in one request.
	$existing_ids = array();
	foreach ( $doc['screens'][ $target ]['apps'] as $existing ) {
		if ( is_array( $existing ) && isset( $existing['id'] ) && is_string( $existing['id'] ) ) {
			$existing_ids[ $existing['id'] ] = true;
		}
	}

	foreach ( $records as $record ) {
		if ( isset( $existing_ids[ $record['entry_id'] ] ) ) {
			continue;
		}
		$existing_ids[ $record['entry_id'] ] = true;
		$doc['screens'][ $target ]['apps'][] = WP_Admin_Workspaces_Dashboard_Bridge::build_tile_entry( $record );
	}

	return $doc;
}, 6 );
