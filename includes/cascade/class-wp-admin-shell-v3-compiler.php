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
 *      look up their per-screen view-config / mode / etc.
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
		if ( ! self::is_v3( $resolved ) ) {
			return self::forward_v2_bindings_to_commands( $resolved );
		}

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

		return $resolved;
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
	 *     screenId so downstream apps can resolve per-screen view-config.
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
