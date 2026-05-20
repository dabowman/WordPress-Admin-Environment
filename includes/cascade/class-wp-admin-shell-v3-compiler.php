<?php
/**
 * v3 → v2-runtime compiler (Phase 3c).
 *
 * The v3 admin.json reshapes the document around user-task surfaces —
 * `workspace`, `screens`, `menu`, `commands`, `settings` — instead of the
 * v2 runtime-pipeline surfaces — `regions`, `routes`, `viewConfigs`,
 * `bindings`. The kernel + router + region renderer still consume the v2
 * shape; this compiler bridges from v3 → v2-runtime so the existing
 * runtime mounts a v3 workspace unchanged.
 *
 * Single pass with five jobs:
 *
 *   1. Detect v3 shape. v2 shells pass through unchanged.
 *   2. Synthesize `routes` from `screens`. Each screen with a `path` and
 *      a `slot` of `_self` (or no `slot`, which defaults to `_self`)
 *      becomes a `routes[path] = { app, config }` entry, with the
 *      screen's id injected into the config as `screenId` so apps can
 *      look up their per-screen dataView / mode / etc.
 *   3. Synthesize `regions` from the active engine manifest's
 *      `defaultRegions` block. When the workspace declares `regions`
 *      explicitly (the v2 escape hatch), workspace wins per-field over
 *      engine defaults; otherwise engine defaults become the region tree
 *      directly.
 *   4. Synthesize `default-route` from `workspace.default-screen` — look
 *      up the screen and use its `path`; if the screen has no path
 *      (palette-only), fall back to the first screen with a path.
 *   5. Compile `commands` (v3) and `bindings` (v2 legacy, if a v2 shell
 *      slips through) into a unified `commands[]` block the runtime
 *      consumes. Commands with `shortcut` + `invoke` map to v2 bindings
 *      directly; commands with `navigate` register a synthetic
 *      invoke-handler that calls the URL navigator.
 *
 * The compiler is the LAST resolver step. It runs AFTER cascade merge +
 * AFTER any post-merge work (mode / permission / classic-menu bridging
 * lives elsewhere or runs upstream), and BEFORE the resolved tree is
 * serialized to JS via `wp_add_inline_script`.
 *
 * Cache-aware: the resolver memoizes through `WP_Admin_Shell_Cache`, so
 * the compiler runs once per cache miss. The cache is invalidated on the
 * normal option / meta writes; the compiler itself is pure (no side
 * effects beyond touching `$resolved`).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_V3_Compiler {

	/**
	 * Detect whether a resolved-config doc is v3 shape.
	 *
	 * Three signals; any one returns true:
	 *   - `version === 3` (canonical signal — v3 schemas enforce
	 *     `version: const 3`).
	 *   - top-level `screens` block present (v3-distinctive — v2 has no
	 *     screens block at root).
	 *   - top-level `workspace` block present (v3 install-metadata
	 *     container, also v2-incompatible at root).
	 *
	 * v2 shells go through unchanged.
	 *
	 * @param array $resolved
	 * @return bool
	 */
	public static function is_v3( $resolved ) {
		if ( ! is_array( $resolved ) ) {
			return false;
		}
		if ( isset( $resolved['version'] ) && (int) $resolved['version'] === 3 ) {
			return true;
		}
		if ( isset( $resolved['screens'] ) && is_array( $resolved['screens'] ) ) {
			return true;
		}
		if ( isset( $resolved['workspace'] ) && is_array( $resolved['workspace'] ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Compile a resolved admin.json from v3 → v2-runtime shape.
	 *
	 * v2 shells pass through unchanged. v3 shells get `routes`,
	 * `regions`, `default-route`, and `commands` synthesized; the
	 * v3-only blocks (`workspace`, `screens`, `menu`, `settings`,
	 * `commands` original) remain on the doc so apps can read them.
	 *
	 * @param array $resolved Resolved cascade output.
	 * @return array Compiled doc — v2-runtime-shaped.
	 */
	public static function compile( $resolved ) {
		if ( ! is_array( $resolved ) ) {
			return $resolved;
		}

		// v2 fast-path: legacy `bindings` block → forward into `commands`
		// so the runtime's command consumer has a single source of truth.
		// Then synthesize screens from any `routes[].config.variant`
		// entries so v2 shells render under v3-built apps that read
		// `screenId` / `dataViewVariant`.
		if ( ! self::is_v3( $resolved ) ) {
			$resolved = self::forward_v2_bindings_to_commands( $resolved );
			$resolved = self::synthesize_v2_screens_from_routes( $resolved );
			$resolved = self::translate_v2_dashboard_widgets( $resolved );

			// Run the same `screens[id].dataView._resolved` stamp pass
			// the v3 path does so synthesized screens light up the JS
			// fast path equivalently. The compiler stamps only when the
			// V3-shaped screens block exists, so we have to do it
			// explicitly here for the synthesized v2 case.
			$resolved = self::stamp_screen_data_view_resolved( $resolved );

			// Translate `iframe:<slug>` refs on the v2 path too —
			// v2 shells declared `iframe:update-core.php` directly on
			// routes, and `synthesize_v2_screens_from_routes` copies
			// the ref into the synthesized screen.
			$resolved = self::translate_iframe_app_refs( $resolved );
			return $resolved;
		}

		// Also run on v3 docs to catch admins who upgrade their workspace
		// shape but leave their v2 `dashboardWidgets` block in place
		// during the migration window. Translation is idempotent — when
		// no v2 block exists the function is a no-op.
		$resolved = self::translate_v2_dashboard_widgets( $resolved );

		// Promote workspace.engine → top-level engine. The kernel reads
		// `config.engine`; v3 nests it under workspace.
		if ( ! isset( $resolved['engine'] ) && isset( $resolved['workspace']['engine'] ) ) {
			$resolved['engine'] = (string) $resolved['workspace']['engine'];
		}

		// Promote styles too (workspace doesn't carry styles, but for
		// symmetry — v3 has top-level styles already; nothing to do).

		$screens = isset( $resolved['screens'] ) && is_array( $resolved['screens'] )
			? $resolved['screens']
			: array();

		// 1. routes synthesis.
		$existing_routes = isset( $resolved['routes'] ) && is_array( $resolved['routes'] )
			? $resolved['routes']
			: array();
		$resolved['routes'] = self::synthesize_routes( $screens, $existing_routes );

		// 2. regions synthesis.
		$engine_id        = isset( $resolved['engine'] ) ? (string) $resolved['engine'] : '';
		$engine_manifest  = self::lookup_engine_manifest( $engine_id );
		$default_regions  = is_array( $engine_manifest )
			&& isset( $engine_manifest['defaultRegions'] )
			&& is_array( $engine_manifest['defaultRegions'] )
				? $engine_manifest['defaultRegions']
				: array();
		$workspace_regions = isset( $resolved['regions'] ) && is_array( $resolved['regions'] )
			? $resolved['regions']
			: array();
		$resolved['regions'] = self::synthesize_regions( $default_regions, $workspace_regions );

		// 3. default-route synthesis.
		if ( empty( $resolved['default-route'] ) ) {
			$default_screen_id = isset( $resolved['workspace']['default-screen'] )
				? (string) $resolved['workspace']['default-screen']
				: '';
			$resolved['default-route'] = self::synthesize_default_route( $screens, $default_screen_id );
		}

		// 4. commands compilation. v3 already ships `commands[]`; we
		// preserve it as-is but normalize the shape so downstream
		// consumers see a uniform array of `{id, shortcut?, invoke?,
		// navigate?, label?}` entries.
		$resolved['commands'] = self::compile_commands( $resolved );

		// 5. stamp per-screen resolved DataView doc onto each screen so
		// the JS `useDataView` hook's synchronous fast path works
		// without REST round-trips or client-side kind/name inference.
		// Without this stamp, entity-CRUD apps render with empty fields.
		$resolved = self::stamp_screen_data_view_resolved( $resolved );

		// 6. translate `iframe:<slug>` app refs → `core:iframe-fallback`
		// with `config.url: <slug>`. The JS runtime's `resolveAppInstance`
		// only knows `core:*` / `plugin:*`; without this pass every
		// `iframe:<slug>` reference renders nothing. Covers screens
		// (shorthand + long-form apps[]), synthesized routes, and the
		// classic-menu-bridge ingested entries that all emit
		// `iframe:<original-slug>` for cleanliness.
		$resolved = self::translate_iframe_app_refs( $resolved );

		return $resolved;
	}

	/**
	 * Rewrite `iframe:<slug>` app refs to `core:iframe-fallback` plus a
	 * `config.url` carrying the slug. Walks screens (shorthand `app` +
	 * long-form `apps[i].app`) and the synthesized routes block.
	 *
	 * The rewrite is idempotent — running this twice on the same doc
	 * leaves the second pass as a no-op because no `iframe:` refs
	 * remain. Authors can still emit `iframe:<slug>` shorthand in
	 * shells, manifests, and PHP shims; the compiler unifies them onto
	 * the single core:iframe-fallback mount path.
	 *
	 * @param array $resolved
	 * @return array
	 */
	private static function translate_iframe_app_refs( $resolved ) {
		$rewrite = static function ( $entry ) {
			if ( ! is_array( $entry ) ) {
				return $entry;
			}
			$app = isset( $entry['app'] ) && is_string( $entry['app'] ) ? $entry['app'] : '';
			if ( $app === '' || strpos( $app, 'iframe:' ) !== 0 ) {
				return $entry;
			}
			$slug         = substr( $app, 7 );
			$entry['app'] = 'core:iframe-fallback';
			if ( ! isset( $entry['config'] ) || ! is_array( $entry['config'] ) ) {
				$entry['config'] = array();
			}
			// Author-supplied config.url wins — the rewrite only fills
			// the slot when empty so explicit overrides on the entry
			// (or admin.json's per-screen config) survive.
			if ( ! isset( $entry['config']['url'] ) || $entry['config']['url'] === '' ) {
				$entry['config']['url'] = $slug;
			}
			return $entry;
		};

		if ( isset( $resolved['screens'] ) && is_array( $resolved['screens'] ) ) {
			foreach ( $resolved['screens'] as $screen_id => $screen ) {
				if ( ! is_array( $screen ) ) {
					continue;
				}
				// Shorthand `app` + `config` form.
				$resolved['screens'][ $screen_id ] = $rewrite( $screen );
				// Long-form apps[].
				if (
					isset( $resolved['screens'][ $screen_id ]['apps'] ) &&
					is_array( $resolved['screens'][ $screen_id ]['apps'] )
				) {
					foreach ( $resolved['screens'][ $screen_id ]['apps'] as $i => $apps_entry ) {
						$resolved['screens'][ $screen_id ]['apps'][ $i ] = $rewrite( $apps_entry );
					}
				}
			}
		}

		if ( isset( $resolved['routes'] ) && is_array( $resolved['routes'] ) ) {
			foreach ( $resolved['routes'] as $route_key => $route_entry ) {
				$resolved['routes'][ $route_key ] = $rewrite( $route_entry );
			}
		}

		return $resolved;
	}

	/**
	 * Stamp `screens[id].dataView._resolved` on every screen the
	 * `WP_Admin_Shell_Data_View_Config` resolver can produce a doc for.
	 * Runs after `routes` synthesis so the v2 → v3 back-compat
	 * synthesized screens get stamped equivalently.
	 *
	 * @param array $resolved
	 * @return array
	 */
	private static function stamp_screen_data_view_resolved( $resolved ) {
		if ( ! class_exists( 'WP_Admin_Shell_Data_View_Config' ) ) {
			return $resolved;
		}
		if ( ! isset( $resolved['screens'] ) || ! is_array( $resolved['screens'] ) ) {
			return $resolved;
		}

		foreach ( $resolved['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			$resolved_view = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( $screen_id, $resolved );
			if ( ! is_array( $resolved_view ) || empty( $resolved_view ) ) {
				continue;
			}
			// Preserve any author-declared inline overlay alongside
			// the stamped `_resolved` snapshot — the JS fast path
			// reads `screen.dataView._resolved` first.
			$existing_view = isset( $resolved['screens'][ $screen_id ]['dataView'] )
				&& is_array( $resolved['screens'][ $screen_id ]['dataView'] )
					? $resolved['screens'][ $screen_id ]['dataView']
					: array();
			$existing_view['_resolved']                    = $resolved_view;
			$resolved['screens'][ $screen_id ]['dataView'] = $existing_view;
		}
		return $resolved;
	}

	/**
	 * v2 → v3 back-compat synthesis. Walk the v2 `routes` block and
	 * synthesize a virtual `screens` entry per route entry, copying
	 * `app` / `config` through verbatim. Route `config.variant` stays on
	 * the synthesized `screen.config.variant`; the data-view resolver's
	 * step-3 manifest-inference path reads it directly to reach the
	 * correct `(kind, name, variant)` triple. No separate `dataViewVariant`
	 * key is stamped — the resolver's existing inference is the contract.
	 *
	 * Synthesized screen id derives from the route path — `/posts/drafts`
	 * → `route-posts-drafts`. Path-collision-free because v2 paths are
	 * unique per resolver invariant.
	 *
	 * The synthesized screen also injects `screenId` into `config` so
	 * downstream apps reading `config.screenId` find the synthesized id.
	 *
	 * @param array $resolved
	 * @return array
	 */
	private static function synthesize_v2_screens_from_routes( $resolved ) {
		if ( empty( $resolved['routes'] ) || ! is_array( $resolved['routes'] ) ) {
			return $resolved;
		}

		$screens = isset( $resolved['screens'] ) && is_array( $resolved['screens'] )
			? $resolved['screens']
			: array();

		foreach ( $resolved['routes'] as $path => $route ) {
			if ( ! is_array( $route ) || ! isset( $route['app'] ) ) {
				continue;
			}
			$path_str = (string) $path;
			$screen_id = self::synth_screen_id_from_path( $path_str );
			if ( $screen_id === '' ) {
				continue;
			}
			// Don't clobber a screen that already exists (programmatic
			// `wp_admin_shell_register_workspace` could have written one).
			if ( isset( $screens[ $screen_id ] ) && is_array( $screens[ $screen_id ] ) ) {
				continue;
			}

			$route_config  = isset( $route['config'] ) && is_array( $route['config'] ) ? $route['config'] : array();
			$screen_config = $route_config;
			$screen_config['screenId'] = $screen_id;

			$entry = array(
				'app'    => (string) $route['app'],
				'path'   => $path_str,
				'config' => $screen_config,
			);

			// Note: don't stamp `dataViewVariant` here. The resolver's
			// step-2 path needs ALL THREE of dataViewKind/Name/Variant
			// to fire; stamping just the variant would be dead.
			// `route.config.variant` already copied into `screen.config`
			// above; the resolver's step-3 manifest-inference path reads
			// it from there as the v2 back-compat hook.

			$screens[ $screen_id ] = $entry;

			// Mirror the screenId into the live routes block so apps
			// resolving config.screenId at mount time see it too.
			$resolved['routes'][ $path ]['config'] = $screen_config;
		}

		$resolved['screens'] = $screens;
		return $resolved;
	}

	/**
	 * Stable synthesized-screen id derived from a route path. Replaces
	 * non-alphanum chars with `-`, trims to 64 chars, and prefixes with
	 * `route-`. Empty when the path produces nothing useful.
	 *
	 * @param string $path
	 * @return string
	 */
	private static function synth_screen_id_from_path( $path ) {
		$slug = strtolower( preg_replace( '#[^a-z0-9]+#i', '-', $path ) );
		$slug = trim( $slug, '-' );
		if ( $slug === '' ) {
			return '';
		}
		if ( strlen( $slug ) > 56 ) {
			$slug = substr( $slug, 0, 56 );
			$slug = rtrim( $slug, '-' );
		}
		return 'route-' . $slug;
	}

	/**
	 * v2 → v3 dashboard-widgets back-compat translation.
	 *
	 * When a resolved doc carries the legacy top-level `dashboardWidgets`
	 * block, fold each `dashboardWidgets[<app-id>]` entry into the
	 * target screen's `apps[]` with `slot: 'grid'`. Target screen
	 * preference, first match wins:
	 *
	 *   1. Explicit `screens['dashboard-widgets']` (the v3 default name).
	 *   2. Any screen whose primary app is `core:dashboard-host` (covers
	 *      v2 → v3 synthesis where the route path generates a `route-…`
	 *      screen id).
	 *
	 * Without a target, the function is a no-op — the original block
	 * stays on the doc for one cycle so admins migrating manually can
	 * still introspect it; the v3 dashboard-host ignores it.
	 *
	 * Per-app collision: when the target screen's `apps[]` already lists
	 * the same app id (e.g. a v3-shaped author already wrote the entry),
	 * the v2 block is skipped — author intent wins.
	 *
	 * In WP_DEBUG, a `_doing_it_wrong` notice surfaces so plugin authors
	 * know to migrate.
	 *
	 * @param array $resolved
	 * @return array
	 */
	private static function translate_v2_dashboard_widgets( $resolved ) {
		if ( empty( $resolved['dashboardWidgets'] ) || ! is_array( $resolved['dashboardWidgets'] ) ) {
			return $resolved;
		}

		$target_screen = self::pick_v2_target_screen( $resolved );
		if ( $target_screen === null ) {
			return $resolved;
		}

		if (
			defined( 'WP_DEBUG' ) && WP_DEBUG
			&& function_exists( '_doing_it_wrong' )
		) {
			_doing_it_wrong(
				'admin.json#dashboardWidgets',
				esc_html__(
					'The top-level dashboardWidgets block is a v2 shape. Migrate to screens[dashboard-widgets].apps[] entries with slot:"grid".',
					'wp-admin-shell'
				),
				'3.0.0'
			);
		}

		$screen     = $resolved['screens'][ $target_screen ];
		$apps       = isset( $screen['apps'] ) && is_array( $screen['apps'] ) ? $screen['apps'] : array();
		$existing   = array(); // app-id → true
		$existing_e = array(); // entry-id → true
		foreach ( $apps as $existing_entry ) {
			if ( ! is_array( $existing_entry ) ) {
				continue;
			}
			if ( isset( $existing_entry['app'] ) ) {
				$existing[ (string) $existing_entry['app'] ] = true;
			}
			if ( isset( $existing_entry['id'] ) ) {
				$existing_e[ (string) $existing_entry['id'] ] = true;
			}
		}

		foreach ( $resolved['dashboardWidgets'] as $app_id => $override ) {
			if ( ! is_string( $app_id ) || $app_id === '' ) {
				continue;
			}
			if ( ! is_array( $override ) ) {
				$override = array();
			}
			// Skip widgets explicitly hidden by the v2 admin.json (the
			// v2 contract treated hidden:true as "drop entirely"). No
			// entry contributed.
			if ( ! empty( $override['hidden'] ) ) {
				continue;
			}
			// Author already wrote a v3-shape entry for this app — skip.
			if ( isset( $existing[ $app_id ] ) ) {
				continue;
			}

			$entry_id = WP_Admin_Shell_Dashboard_Widgets::derive_entry_id( $app_id );
			// Avoid colliding with a manually authored entry id.
			if ( isset( $existing_e[ $entry_id ] ) ) {
				continue;
			}

			$entry = array(
				'id'   => $entry_id,
				'app'  => $app_id,
				'slot' => 'grid',
			);
			if ( isset( $override['defaultSize'] ) && is_array( $override['defaultSize'] ) ) {
				$entry['size'] = $override['defaultSize'];
			}
			if ( isset( $override['position'] ) ) {
				$entry['position'] = $override['position'];
			}
			// `title` is NOT a valid `appsEntry` field per admin-v3.json
			// (`additionalProperties: false`). v2 override `title`s flow
			// through the widget app's manifest title or admin.json
			// per-screen overrides; do not stamp it here.
			$apps[]                   = $entry;
			$existing[ $app_id ]      = true;
			$existing_e[ $entry_id ]  = true;
		}

		$resolved['screens'][ $target_screen ]['apps'] = $apps;

		// Drop the v2 `dashboardWidgets` block from the resolved doc once
		// translated. Downstream filters running after the compiler
		// shouldn't react to the legacy shape; the `_doing_it_wrong`
		// notice above warns authors. Note: we intentionally only unset
		// when at least one v2 entry resolved — the early-return at the
		// top of this function handles the empty-block case.
		unset( $resolved['dashboardWidgets'] );

		return $resolved;
	}

	/**
	 * Pick the target screen for v2 → v3 dashboard-widgets translation.
	 *
	 * Resolution order:
	 *   1. `screens['dashboard-widgets']` if present (v3 default).
	 *   2. Any screen whose primary app id is `core:dashboard-host`
	 *      (covers v2 routes synthesized to `route-<path>` screen ids).
	 *
	 * Returns the screen id or null when neither path resolves.
	 *
	 * @param array $resolved
	 * @return string|null
	 */
	private static function pick_v2_target_screen( $resolved ) {
		$default = WP_Admin_Shell_Dashboard_Widgets::DEFAULT_TARGET_SCREEN;
		if (
			isset( $resolved['screens'][ $default ] )
			&& is_array( $resolved['screens'][ $default ] )
		) {
			return $default;
		}
		if ( ! isset( $resolved['screens'] ) || ! is_array( $resolved['screens'] ) ) {
			return null;
		}
		foreach ( $resolved['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			$primary = self::primary_app( $screen );
			if ( $primary && $primary['app'] === 'core:dashboard-host' ) {
				return (string) $screen_id;
			}
		}
		return null;
	}

	/**
	 * Forward a v2 `bindings[]` block into `commands[]` so the runtime
	 * consumes a single block regardless of which admin.json shape ships
	 * the data. v2 bindings have no `id` — synthesize one from the
	 * shortcut + invoke pair (stable within a single resolve).
	 *
	 * @param array $resolved
	 * @return array
	 */
	private static function forward_v2_bindings_to_commands( $resolved ) {
		$commands = isset( $resolved['commands'] ) && is_array( $resolved['commands'] )
			? $resolved['commands']
			: array();
		$bindings = isset( $resolved['bindings'] ) && is_array( $resolved['bindings'] )
			? $resolved['bindings']
			: array();

		foreach ( $bindings as $i => $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$shortcut = isset( $entry['shortcut'] ) ? (string) $entry['shortcut'] : '';
			$invoke   = isset( $entry['invoke'] ) ? (string) $entry['invoke'] : '';
			if ( $shortcut === '' || $invoke === '' ) {
				continue;
			}
			$synth_id = 'v2-binding-' . md5( $shortcut . '|' . $invoke . '|' . $i );
			$commands[] = array(
				'id'       => $synth_id,
				'shortcut' => $shortcut,
				'invoke'   => $invoke,
			);
		}

		$resolved['commands'] = $commands;
		return $resolved;
	}

	/**
	 * Walk every screen and synthesize a `routes` entry from each one
	 * that declares a `path`. Screens whose `slot` is anything other than
	 * `_self` (or absent → defaults to `_self`) get recorded against a
	 * slot-prefixed map; the kernel router knows to read those at
	 * `useRouteForRegion` time.
	 *
	 * Screen → route mapping:
	 *   - app: prefer screen.app (shorthand). Else screen.apps[0].app
	 *     (long form — first entry is primary).
	 *   - config: screen.config (shorthand) deep-merged with
	 *     screen.apps[0].config when apps[] is present. Always inject
	 *     screenId so downstream apps can resolve per-screen dataView.
	 *   - Long-form (apps[]) screens: only the primary app gets a route;
	 *     additional apps mount via the screen's slot composition,
	 *     handled at render time by the kernel.
	 *
	 * Existing `routes` entries (v3 escape hatch) win on collision.
	 *
	 * @param array $screens         Resolved screens block.
	 * @param array $existing_routes Workspace-declared routes (escape hatch).
	 * @return array
	 */
	public static function synthesize_routes( $screens, $existing_routes = array() ) {
		$routes = $existing_routes;

		foreach ( $screens as $screen_id => $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			$path = isset( $screen['path'] ) && is_string( $screen['path'] ) && $screen['path'] !== ''
				? $screen['path']
				: '';
			$slot = isset( $screen['slot'] ) && is_string( $screen['slot'] ) && $screen['slot'] !== ''
				? $screen['slot']
				: '_self';

			// Screens with no path AND a slot that isn't _self (e.g.
			// `palette`) are slot-mounted but URL-addressable via the
			// slot's route-key — they still get an entry, keyed under
			// the slot's namespace.
			if ( $path === '' && $slot === '_self' ) {
				// No path, no alternate slot → nothing to route.
				continue;
			}

			$primary = self::primary_app( $screen );
			if ( $primary === null ) {
				continue;
			}

			$route_entry = array(
				'app'    => $primary['app'],
				'config' => array_merge(
					(array) $primary['config'],
					array( 'screenId' => (string) $screen_id )
				),
			);

			if ( $slot === '_self' ) {
				$route_key = $path !== '' ? $path : '/' . $screen_id;
				if ( ! isset( $routes[ $route_key ] ) ) {
					$routes[ $route_key ] = $route_entry;
				}
			} else {
				// Slot-routed screens. The kernel router reads slots via
				// `useRouteForRegion(region, routesBlock)`; for a slot
				// other than `_self`, the matching region declares
				// `routing.route-key: "<slot>"` and resolves against a
				// slot-specific routes map. Store under a slot-namespaced
				// key the router can look up.
				//
				// Convention: routes for slot `palette` live under
				// `@palette/{path}` so the kernel can identify them.
				// Palette routes typically don't have a meaningful URL
				// path beyond the slot identity — they mount when the
				// `palette` slot is non-empty in the URL.
				$slot_key = '@' . $slot . '/' . ( $path !== '' ? ltrim( $path, '/' ) : $screen_id );
				if ( ! isset( $routes[ $slot_key ] ) ) {
					$routes[ $slot_key ] = $route_entry;
				}
			}
		}

		return $routes;
	}

	/**
	 * Extract the primary app from a screen (shorthand or long form).
	 *
	 * @param array $screen
	 * @return array|null { app: string, config: array } or null if none.
	 */
	private static function primary_app( $screen ) {
		if ( ! is_array( $screen ) ) {
			return null;
		}
		// Shorthand: screen.app + screen.config.
		if ( isset( $screen['app'] ) && is_string( $screen['app'] ) && $screen['app'] !== '' ) {
			return array(
				'app'    => $screen['app'],
				'config' => isset( $screen['config'] ) && is_array( $screen['config'] )
					? $screen['config']
					: array(),
			);
		}
		// Long form: first entry of apps[].
		if ( isset( $screen['apps'] ) && is_array( $screen['apps'] ) && ! empty( $screen['apps'] ) ) {
			$first = reset( $screen['apps'] );
			if ( is_array( $first ) && isset( $first['app'] ) && is_string( $first['app'] ) && $first['app'] !== '' ) {
				return array(
					'app'    => $first['app'],
					'config' => isset( $first['config'] ) && is_array( $first['config'] )
						? $first['config']
						: array(),
				);
			}
		}
		return null;
	}

	/**
	 * Look up an engine manifest in the registry. Best-effort — returns
	 * null when the registry isn't loaded (resolve_with() unit tests).
	 *
	 * @param string $engine_id
	 * @return array|null
	 */
	private static function lookup_engine_manifest( $engine_id ) {
		if ( ! is_string( $engine_id ) || $engine_id === '' ) {
			return null;
		}
		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return null;
		}
		$registry = WP_Admin_Shell_Manifest_Registry::instance();
		return $registry->get_engine( $engine_id );
	}

	/**
	 * Compose the resolved region tree from the engine's `defaultRegions`
	 * + the workspace's explicit `regions` block (v2 escape hatch).
	 *
	 * Workspace declarations win per-field over engine defaults — same
	 * deep-merge contract `wp_admin_shell_data_*` filters expect.
	 *
	 * @param array $engine_defaults
	 * @param array $workspace_regions
	 * @return array
	 */
	public static function synthesize_regions( $engine_defaults, $workspace_regions ) {
		if ( empty( $engine_defaults ) ) {
			return $workspace_regions;
		}
		if ( empty( $workspace_regions ) ) {
			return $engine_defaults;
		}
		return self::deep_merge( $engine_defaults, $workspace_regions );
	}

	/**
	 * Synthesize the `default-route` value the kernel router uses.
	 *
	 * Preferred: look up `workspace.default-screen` → screens[id].path.
	 * Fall back: first screen with a path (sorted by screen id for
	 * determinism).
	 *
	 * @param array  $screens
	 * @param string $default_screen_id
	 * @return string
	 */
	public static function synthesize_default_route( $screens, $default_screen_id = '' ) {
		if ( $default_screen_id !== '' && isset( $screens[ $default_screen_id ]['path'] ) ) {
			$path = (string) $screens[ $default_screen_id ]['path'];
			if ( $path !== '' ) {
				return $path;
			}
		}
		// Fallback: first screen with a path.
		foreach ( $screens as $screen ) {
			if ( is_array( $screen ) && isset( $screen['path'] ) && is_string( $screen['path'] ) && $screen['path'] !== '' ) {
				return $screen['path'];
			}
		}
		return '/';
	}

	/**
	 * Normalize the commands[] block. v3 already ships it; v2 paths
	 * forwarded their bindings into commands earlier. This pass dedupes
	 * by id (later wins to match cascade semantics).
	 *
	 * @param array $resolved
	 * @return array
	 */
	public static function compile_commands( $resolved ) {
		$commands = isset( $resolved['commands'] ) && is_array( $resolved['commands'] )
			? $resolved['commands']
			: array();

		$by_id = array();
		foreach ( $commands as $cmd ) {
			if ( ! is_array( $cmd ) ) {
				continue;
			}
			$id = isset( $cmd['id'] ) && is_string( $cmd['id'] ) && $cmd['id'] !== ''
				? $cmd['id']
				: '';
			if ( $id === '' ) {
				// Anonymous commands (legacy v2 bindings forwarded) get a
				// hash-derived id so cascade lookup still works.
				$id = 'cmd-' . md5( wp_json_encode( $cmd ) );
				$cmd['id'] = $id;
			}
			$by_id[ $id ] = $cmd;
		}

		return array_values( $by_id );
	}

	/**
	 * Recursive deep-merge — `$over` wins per-field. Lists replace
	 * wholesale; assoc maps recurse. Mirrors the JS resolver's contract
	 * the existing cascade-merge engine uses.
	 *
	 * @param array $base
	 * @param array $over
	 * @return array
	 */
	private static function deep_merge( $base, $over ) {
		if ( ! is_array( $base ) ) {
			return $over;
		}
		if ( ! is_array( $over ) ) {
			return $base;
		}
		$result = $base;
		foreach ( $over as $key => $value ) {
			if (
				is_array( $value )
				&& isset( $result[ $key ] )
				&& is_array( $result[ $key ] )
				&& self::is_assoc( $value )
				&& self::is_assoc( $result[ $key ] )
			) {
				$result[ $key ] = self::deep_merge( $result[ $key ], $value );
			} else {
				$result[ $key ] = $value;
			}
		}
		return $result;
	}

	private static function is_assoc( $value ) {
		if ( ! is_array( $value ) ) {
			return false;
		}
		if ( $value === array() ) {
			return true;
		}
		return array_keys( $value ) !== range( 0, count( $value ) - 1 );
	}
}
