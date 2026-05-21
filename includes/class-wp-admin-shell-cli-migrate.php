<?php
/**
 * v2 → v3 admin.json migration helper (Phase 3d.2).
 *
 * Mechanical static rewriter that takes a v2-shaped admin.json shell and
 * emits a v3-shape equivalent. Plugin authors carrying v2 shells use this
 * to mechanically transition. The rewriter codifies the same
 * transformations as `WP_Admin_Shell_V3_Compiler` does at runtime, but
 * produces authoring-time JSON output instead of a hydrated PHP array.
 *
 * Two consumers:
 *
 *   1. `WP_Admin_Shell_CLI_Migrate` — the `WP_CLI_Command` subclass that
 *      drives the `wp admin-shell migrate-shell <slug-or-path>` command.
 *      Owns IO, arg-parsing, and validation diagnostics.
 *   2. `WP_Admin_Shell_Migrate_Rewriter::rewrite( $v2_doc )` — pure-PHP
 *      array → array transformation. No side effects beyond the returned
 *      doc. Unit tests exercise this entry point directly.
 *
 * Transformations applied (input ordered roughly by output-doc position):
 *
 *   - `version: 1` → `version: 3` (top-level).
 *   - `$schema` updated to point at admin-v3.json (relative form).
 *   - `engine`        → `workspace.engine`.
 *   - `default-route` → `workspace.default-screen` (resolved to a screen id).
 *   - `styles.branding.{logo,title}` → `workspace.branding.{logo,title}`.
 *   - `routes[path]`  → `screens[<id>]` with id derived from path.
 *   - `iframe-fallback`+`config.url` → `app: iframe:<url>` shorthand.
 *   - `route.config.variant` → synthesized `screen.dataViewRef`
 *     ("<kind>/<name>/<variant>"). kind/name inferred from app manifest
 *     when available; fallback `postType/<config.postType>` heuristic.
 *   - `viewConfigs`     → `settings.dataViews` (shape unchanged).
 *   - `fieldCollections`→ `settings.dataFields` (shape unchanged).
 *   - `bindings[]`       → `commands[]` (id synthesized per entry).
 *   - `preload[]`       → `preload[]` (unchanged).
 *   - `regions`         → dropped when chrome-only; toolbar-slot widgets
 *     surface in `workspace.widgets.<slot>` (best-effort — most shells
 *     carry no custom regions).
 *
 * Out-of-scope (refused or warned, not rewritten):
 *
 *   - Two-way conversion (v3 → v2).
 *   - Wholesale region-tree rewrites (the v2 region block is rarely
 *     authored; when present the rewriter preserves it under v3's
 *     escape-hatch `regions` block).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

/**
 * Pure-PHP rewriter: v2 admin.json doc → v3 admin.json doc.
 *
 * No filesystem, no WP_CLI, no globals. Safe to unit-test under
 * `wp eval-file`.
 */
class WP_Admin_Shell_Migrate_Rewriter {

	/**
	 * Detect whether a doc is v2 (or v1/v0 — anything pre-v3). Used by the
	 * CLI to refuse v3 inputs.
	 *
	 * @param array $doc
	 * @return bool
	 */
	public static function is_pre_v3( $doc ) {
		if ( ! is_array( $doc ) ) {
			return false;
		}
		if ( isset( $doc['version'] ) && (int) $doc['version'] === 3 ) {
			return false;
		}
		if ( isset( $doc['screens'] ) && is_array( $doc['screens'] ) ) {
			return false;
		}
		if ( isset( $doc['workspace'] ) && is_array( $doc['workspace'] ) ) {
			return false;
		}
		return true;
	}

	/**
	 * Main entry point: take a v2-shape admin.json array, return a
	 * v3-shape array. Pure — no IO, no global writes.
	 *
	 * @param array $v2       Source doc.
	 * @param array $opts {
	 *     Optional rewrite options.
	 *
	 *     @type string $schema_ref Custom `$schema` reference; defaults
	 *                              to `../docs/schemas/admin-v3.json`
	 *                              (matches 3d.1 in-repo convention).
	 * }
	 * @param array $warnings Out-param. Receives a list of non-fatal
	 *                        translation issues the caller should
	 *                        surface (e.g. orphan `default-route`,
	 *                        preserved `regions` block, etc.).
	 *                        Empty array on clean migration.
	 * @return array v3-shape doc.
	 */
	public static function rewrite( $v2, $opts = array(), &$warnings = null ) {
		if ( $warnings === null ) {
			$warnings = array();
		}
		if ( ! is_array( $v2 ) ) {
			return array();
		}

		$schema_ref = isset( $opts['schema_ref'] ) && is_string( $opts['schema_ref'] ) && $opts['schema_ref'] !== ''
			? $opts['schema_ref']
			: '../docs/schemas/admin-v3.json';

		// Build the screens block first so workspace.default-screen can
		// reference one of the synthesized ids.
		$path_to_screen_id = array();
		$screens           = self::build_screens(
			isset( $v2['routes'] ) && is_array( $v2['routes'] ) ? $v2['routes'] : array(),
			$path_to_screen_id
		);

		// Workspace block — engine, default-screen, branding.
		$workspace = array();
		if ( isset( $v2['engine'] ) && is_string( $v2['engine'] ) ) {
			$workspace['engine'] = $v2['engine'];
		}

		$default_route = isset( $v2['default-route'] ) && is_string( $v2['default-route'] )
			? $v2['default-route']
			: '';
		if ( $default_route !== '' ) {
			if ( isset( $path_to_screen_id[ $default_route ] ) ) {
				$workspace['default-screen'] = $path_to_screen_id[ $default_route ];
			} else {
				// Orphan default-route — v2 carried a path that doesn't
				// match any of the synthesized screen ids. The output
				// drops `workspace.default-screen` silently; warn the
				// caller so they can hand-pick a default post-migration.
				$warnings[] = sprintf(
					'default-route `%s` does not resolve to any synthesized screen — `workspace.default-screen` omitted from output.',
					$default_route
				);
			}
		}

		// styles.branding.{logo,title} → workspace.branding.{logo,title}.
		$branding = array();
		if ( isset( $v2['styles']['branding'] ) && is_array( $v2['styles']['branding'] ) ) {
			$src = $v2['styles']['branding'];
			if ( array_key_exists( 'logo', $src ) ) {
				$branding['logo'] = $src['logo'];
			}
			if ( array_key_exists( 'title', $src ) ) {
				$branding['title'] = $src['title'];
			}
		}
		if ( ! empty( $branding ) ) {
			$workspace['branding'] = $branding;
		}

		// settings block (only emitted when content exists).
		$settings = array();
		if ( isset( $v2['viewConfigs'] ) && is_array( $v2['viewConfigs'] ) ) {
			$settings['dataViews'] = $v2['viewConfigs'];
		}
		if ( isset( $v2['fieldCollections'] ) && is_array( $v2['fieldCollections'] ) ) {
			$settings['dataFields'] = $v2['fieldCollections'];
		}

		// bindings[] → commands[] (id synthesized).
		$commands = self::build_commands(
			isset( $v2['bindings'] ) && is_array( $v2['bindings'] ) ? $v2['bindings'] : array(),
			isset( $v2['commands'] ) && is_array( $v2['commands'] ) ? $v2['commands'] : array()
		);

		// Compose the output doc. Top-level field order matches the
		// canonical v3 templates (wp-admin-default.json):
		//   $schema, version, $wpds, name, title, description,
		//   user-switchable, workspace, settings, screens, menu,
		//   commands, styles, preload.
		$out = array();
		$out['$schema'] = $schema_ref;
		$out['version'] = 3;
		if ( isset( $v2['$wpds'] ) && is_string( $v2['$wpds'] ) ) {
			$out['$wpds'] = $v2['$wpds'];
		} else {
			$out['$wpds'] = '6.9';
		}
		if ( isset( $v2['name'] ) && is_string( $v2['name'] ) ) {
			$out['name'] = $v2['name'];
		}
		if ( isset( $v2['title'] ) && is_string( $v2['title'] ) ) {
			$out['title'] = $v2['title'];
		}
		if ( isset( $v2['description'] ) && is_string( $v2['description'] ) ) {
			$out['description'] = $v2['description'];
		}
		if ( isset( $v2['userSwitchable'] ) ) {
			$out['user-switchable'] = (bool) $v2['userSwitchable'];
		} elseif ( isset( $v2['user-switchable'] ) ) {
			$out['user-switchable'] = (bool) $v2['user-switchable'];
		}

		$out['workspace'] = $workspace;

		if ( ! empty( $settings ) ) {
			$out['settings'] = $settings;
		}

		$out['screens'] = $screens;

		// menu — v2 had no top-level menu block (nav was app-config-internal).
		// Leave absent so the engine's defaultRegions render the legacy
		// navigation app. Authors hand-add a v3 menu tree post-migration.

		if ( ! empty( $commands ) ) {
			$out['commands'] = $commands;
		}

		// styles — preserved verbatim except for the migrated
		// `branding` block (already pulled into workspace.branding).
		if ( isset( $v2['styles'] ) && is_array( $v2['styles'] ) ) {
			$styles = $v2['styles'];
			unset( $styles['branding'] );
			if ( ! empty( $styles ) ) {
				$out['styles'] = $styles;
			}
		}

		// preload — unchanged.
		if ( isset( $v2['preload'] ) && is_array( $v2['preload'] ) ) {
			$out['preload'] = $v2['preload'];
		}

		// regions — v2 escape hatch. Preserve under v3's same-named escape
		// hatch block. Most shells won't carry one. v3's region shape may
		// diverge from v2's (e.g. mirror-mode `routing.mode` declarations
		// added in 3c.4); hand-review any preserved block.
		if ( isset( $v2['regions'] ) && is_array( $v2['regions'] ) && ! empty( $v2['regions'] ) ) {
			$out['regions'] = $v2['regions'];
			$warnings[]     = 'regions block preserved verbatim under the v3 escape hatch — v3 region shape may diverge from v2; hand-review.';
		}

		return $out;
	}

	/**
	 * Walk v2 routes[] and synthesize v3 screens[].
	 *
	 * Each route becomes one screen. Mutates `$path_to_screen_id` so the
	 * caller can resolve `default-route` paths back to synthesized ids.
	 *
	 * @param array $routes            v2 routes block.
	 * @param array &$path_to_screen_id Out-parameter: path → screen id map.
	 * @return array v3 screens block.
	 */
	public static function build_screens( $routes, &$path_to_screen_id = array() ) {
		$screens           = array();
		$used_ids          = array();
		$path_to_screen_id = array();

		foreach ( $routes as $path => $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$path_str = (string) $path;

			$base_id = self::screen_id_from_path( $path_str );
			if ( $base_id === '' ) {
				continue;
			}
			$id = self::ensure_unique_id( $base_id, $used_ids );
			$used_ids[ $id ]               = true;
			$path_to_screen_id[ $path_str ] = $id;

			$screen          = array();
			$screen['label'] = self::derive_label_from_path( $path_str );
			$screen['path']  = $path_str;

			$app    = isset( $entry['app'] ) && is_string( $entry['app'] ) ? $entry['app'] : '';
			$config = isset( $entry['config'] ) && is_array( $entry['config'] ) ? $entry['config'] : array();

			// iframe collapse: `core:iframe-fallback` + `config.url: X` →
			// `app: iframe:X`. The v3 compiler's `translate_iframe_app_refs`
			// reverses this at resolve time.
			if ( $app === 'core:iframe-fallback' && isset( $config['url'] ) && is_string( $config['url'] ) && $config['url'] !== '' ) {
				$app = 'iframe:' . $config['url'];
				unset( $config['url'] );
			}

			// Promote route.config.variant to screen.dataViewRef. The
			// kind/name segments are inferred from the app manifest's
			// `dataView` block (when readable), with a heuristic fallback
			// to (postType, config.postType) when the manifest path is
			// unreadable in a CLI-without-WP context.
			if ( isset( $config['variant'] ) && is_string( $config['variant'] ) && $config['variant'] !== '' ) {
				$variant = $config['variant'];
				$triple  = self::infer_kind_name( $app, $config );
				if ( $triple !== null ) {
					$screen['dataViewRef'] = $triple['kind'] . '/' . $triple['name'] . '/' . $variant;
					// Strip the variant from the screen config now that
					// it lives on dataViewRef. Per migration directive #3.
					unset( $config['variant'] );
				}
			}

			if ( $app !== '' ) {
				$screen['app'] = $app;
			}
			if ( ! empty( $config ) ) {
				$screen['config'] = $config;
			}

			// Permissions (capability/role gating) — v2 routes carried no
			// permissions block. The v3 schema's `screens[*].permissions`
			// defaults to admin-only on absence, which is the closest
			// equivalent. Plugin authors hand-author finer grants
			// post-migration. No migration-time inference attempted.

			$screens[ $id ] = $screen;
		}

		return $screens;
	}

	/**
	 * Synthesize a stable screen id from a route path.
	 *
	 *   /posts                 → posts
	 *   /posts/drafts          → posts-drafts
	 *   /posts/{id}/edit       → posts-id-edit
	 *   /                      → home
	 *
	 * @param string $path
	 * @return string Screen id (empty when path produces nothing useful).
	 */
	public static function screen_id_from_path( $path ) {
		if ( ! is_string( $path ) ) {
			return '';
		}
		$path = trim( $path );
		if ( $path === '' || $path === '/' ) {
			return 'home';
		}
		// Strip leading/trailing slashes, drop {curly} braces.
		$slug = trim( $path, '/' );
		$slug = str_replace( array( '{', '}' ), '', $slug );
		// Replace any non-alphanum run with a single hyphen.
		$slug = strtolower( preg_replace( '#[^a-z0-9]+#i', '-', $slug ) );
		$slug = trim( $slug, '-' );
		if ( $slug === '' ) {
			return '';
		}
		// Screen-id schema pattern requires starting with [a-z]. Prefix a
		// stub when the first char is numeric.
		if ( ! preg_match( '/^[a-z]/', $slug ) ) {
			$slug = 'screen-' . $slug;
		}
		if ( strlen( $slug ) > 60 ) {
			$slug = substr( $slug, 0, 60 );
			$slug = rtrim( $slug, '-' );
		}
		return $slug;
	}

	/**
	 * Disambiguate a base id against an in-progress used-ids set.
	 * Appends `-2`, `-3`, … on collision.
	 *
	 * @param string $base
	 * @param array  $used_ids
	 * @return string
	 */
	public static function ensure_unique_id( $base, $used_ids ) {
		if ( ! isset( $used_ids[ $base ] ) ) {
			return $base;
		}
		$i = 2;
		while ( isset( $used_ids[ $base . '-' . $i ] ) ) {
			$i++;
		}
		return $base . '-' . $i;
	}

	/**
	 * Derive a human-readable label from the route path's last segment.
	 *
	 *   /posts            → Posts
	 *   /posts/drafts     → Drafts
	 *   /tools/site-health→ Site Health
	 *   /                 → Home
	 *
	 * @param string $path
	 * @return string
	 */
	public static function derive_label_from_path( $path ) {
		if ( ! is_string( $path ) || $path === '' || $path === '/' ) {
			return 'Home';
		}
		$parts = array_values( array_filter( explode( '/', $path ), 'strlen' ) );
		if ( empty( $parts ) ) {
			return 'Home';
		}
		// Last meaningful (non-{param}) segment.
		$last = '';
		foreach ( array_reverse( $parts ) as $seg ) {
			if ( strpos( $seg, '{' ) === false ) {
				$last = $seg;
				break;
			}
		}
		if ( $last === '' ) {
			$last = $parts[0];
		}
		$last = str_replace( array( '-', '_' ), ' ', $last );
		return ucwords( $last );
	}

	/**
	 * Resolve the (kind, name) pair a route's variant should bind to.
	 *
	 * Two paths:
	 *   1. App manifest registry lookup. When the manifest exposes a
	 *      `dataView: { kind, name }` baseline, that wins.
	 *   2. Fallback heuristic: when `config.postType` is set, assume
	 *      (`postType`, `config.postType`). When `config.taxonomy` is set,
	 *      assume (`taxonomy`, `config.taxonomy`).
	 *
	 * Returns null when neither path resolves — the caller falls back to
	 * leaving the variant in `config` (v3 compiler back-compat path picks
	 * it up via manifest inference at runtime).
	 *
	 * @param string $app    App id (e.g. `core:posts`).
	 * @param array  $config Route config block.
	 * @return array|null { kind: string, name: string } or null.
	 */
	public static function infer_kind_name( $app, $config ) {
		// Manifest lookup — only when the registry is loaded (test/CLI
		// contexts may run without it).
		if ( $app !== '' && class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			$registry = WP_Admin_Shell_Manifest_Registry::instance();
			$manifest = $registry->get_app( $app );
			if (
				is_array( $manifest )
				&& isset( $manifest['dataView']['kind'], $manifest['dataView']['name'] )
				&& is_string( $manifest['dataView']['kind'] )
				&& is_string( $manifest['dataView']['name'] )
			) {
				return array(
					'kind' => $manifest['dataView']['kind'],
					'name' => $manifest['dataView']['name'],
				);
			}
		}

		// Heuristic fallbacks.
		if ( isset( $config['postType'] ) && is_string( $config['postType'] ) && $config['postType'] !== '' ) {
			return array(
				'kind' => 'postType',
				'name' => $config['postType'],
			);
		}
		if ( isset( $config['taxonomy'] ) && is_string( $config['taxonomy'] ) && $config['taxonomy'] !== '' ) {
			return array(
				'kind' => 'taxonomy',
				'name' => $config['taxonomy'],
			);
		}

		return null;
	}

	/**
	 * v2 bindings[] → v3 commands[]. Synthesizes ids by slugifying labels
	 * (or shortcut strings when no label is set). Preserves any v2 commands
	 * block that already exists alongside bindings.
	 *
	 * @param array $bindings v2 bindings block.
	 * @param array $existing v2-or-v3 `commands` block (rare).
	 * @return array v3 commands block.
	 */
	public static function build_commands( $bindings, $existing = array() ) {
		$commands = array();
		$used_ids = array();

		// Preserve any pre-existing commands first (rare in v2; if present
		// they're forward-compatible).
		foreach ( $existing as $cmd ) {
			if ( ! is_array( $cmd ) ) {
				continue;
			}
			$id = isset( $cmd['id'] ) && is_string( $cmd['id'] ) && $cmd['id'] !== ''
				? $cmd['id']
				: '';
			if ( $id === '' ) {
				continue;
			}
			$used_ids[ $id ] = true;
			$commands[]      = $cmd;
		}

		foreach ( $bindings as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$shortcut = isset( $entry['shortcut'] ) ? (string) $entry['shortcut'] : '';
			$invoke   = isset( $entry['invoke'] ) ? (string) $entry['invoke'] : '';
			$navigate = isset( $entry['navigate'] ) ? (string) $entry['navigate'] : '';
			$label    = isset( $entry['label'] ) ? (string) $entry['label'] : '';

			if ( $shortcut === '' && $invoke === '' && $navigate === '' ) {
				continue;
			}

			$id_seed = $label !== '' ? $label : ( $invoke !== '' ? $invoke : $shortcut );
			$base_id = self::slugify_command_id( $id_seed );
			if ( $base_id === '' ) {
				$base_id = 'cmd';
			}
			$id              = self::ensure_unique_id( $base_id, $used_ids );
			$used_ids[ $id ] = true;

			$cmd = array( 'id' => $id );
			if ( $shortcut !== '' ) {
				$cmd['shortcut'] = $shortcut;
			}
			if ( $invoke !== '' ) {
				$cmd['invoke'] = $invoke;
			}
			if ( $navigate !== '' ) {
				$cmd['navigate'] = $navigate;
			}
			if ( $label !== '' ) {
				$cmd['label'] = $label;
			}
			$commands[] = $cmd;
		}

		return $commands;
	}

	/**
	 * Slugify a command id seed. Lowercases, replaces non-alnum with
	 * hyphens, strips trailing hyphens.
	 *
	 *   "Open Command Palette" → "open-command-palette"
	 *   "Mod+K"                → "mod-k"
	 *   "core:command-palette" → "core-command-palette"
	 *
	 * @param string $seed
	 * @return string
	 */
	public static function slugify_command_id( $seed ) {
		if ( ! is_string( $seed ) || $seed === '' ) {
			return '';
		}
		$slug = strtolower( preg_replace( '#[^a-z0-9]+#i', '-', $seed ) );
		$slug = trim( $slug, '-' );
		if ( $slug === '' ) {
			return '';
		}
		// Command id schema: minLength 1 — no first-char constraint, but
		// keep a sensible prefix when the slug starts numeric.
		if ( ! preg_match( '/^[a-z]/', $slug ) ) {
			$slug = 'cmd-' . $slug;
		}
		if ( strlen( $slug ) > 60 ) {
			$slug = substr( $slug, 0, 60 );
			$slug = rtrim( $slug, '-' );
		}
		return $slug;
	}

	/**
	 * Lightweight v3 shape validation against the admin-v3.json schema's
	 * top-level required fields, enums, and patterns. Catches the obvious
	 * authoring drift; defers full JSON-Schema 2020-12 validation to the
	 * Node-side Ajv sweep.
	 *
	 * Returns an array of human-readable error strings — empty when the
	 * doc passes the lightweight checks.
	 *
	 * @param array $doc
	 * @return array
	 */
	public static function lightweight_validate( $doc ) {
		$errors = array();
		if ( ! is_array( $doc ) ) {
			return array( 'Document is not an array.' );
		}

		// Required top-level fields.
		foreach ( array( 'version', '$wpds', 'name', 'workspace', 'screens' ) as $required ) {
			if ( ! array_key_exists( $required, $doc ) ) {
				$errors[] = "Missing required top-level field: {$required}";
			}
		}

		if ( isset( $doc['version'] ) && (int) $doc['version'] !== 3 ) {
			$errors[] = 'Top-level `version` must be the integer 3.';
		}

		if ( isset( $doc['$wpds'] ) ) {
			if ( ! is_string( $doc['$wpds'] ) || ! preg_match( '/^[0-9]+\.[0-9]+(\.[0-9]+)?$/', $doc['$wpds'] ) ) {
				$errors[] = '`$wpds` must match WPDS version pattern (e.g. "6.9").';
			}
		}

		if ( isset( $doc['name'] ) ) {
			if ( ! is_string( $doc['name'] ) || ! preg_match( '/^[a-z][a-z0-9-]*$/', $doc['name'] ) ) {
				$errors[] = '`name` must be kebab-case starting with a letter.';
			}
		}

		if ( isset( $doc['workspace'] ) ) {
			if ( ! is_array( $doc['workspace'] ) ) {
				$errors[] = '`workspace` must be an object.';
			} elseif ( ! isset( $doc['workspace']['engine'] ) ) {
				$errors[] = '`workspace.engine` is required.';
			} elseif ( ! is_string( $doc['workspace']['engine'] ) || ! preg_match(
				'#^(core:[a-z][a-z0-9]*(-[a-z0-9]+)*|plugin:[a-z][a-z0-9-]*/[a-z][a-z0-9]*(-[a-z0-9]+)*)$#',
				$doc['workspace']['engine']
			) ) {
				$errors[] = '`workspace.engine` must be a namespaced id (core:* or plugin:*/*).';
			}
		}

		if ( isset( $doc['screens'] ) ) {
			if ( ! is_array( $doc['screens'] ) || empty( $doc['screens'] ) ) {
				$errors[] = '`screens` must be a non-empty object.';
			} else {
				foreach ( $doc['screens'] as $sid => $screen ) {
					if ( ! is_string( $sid ) || ! preg_match( '/^[a-z][a-z0-9-]*$/', $sid ) ) {
						$errors[] = "Screen id `{$sid}` is not kebab-case starting with a letter.";
					}
					if ( ! is_array( $screen ) ) {
						$errors[] = "Screen `{$sid}` is not an object.";
						continue;
					}
					// shorthand+long-form mutual exclusion.
					if ( isset( $screen['app'] ) && isset( $screen['apps'] ) ) {
						$errors[] = "Screen `{$sid}` declares both `app` shorthand and `apps[]` long form.";
					}
					if ( isset( $screen['app'] ) && ! is_string( $screen['app'] ) ) {
						$errors[] = "Screen `{$sid}` has non-string `app`.";
					}
					if (
						isset( $screen['path'] )
						&& ( ! is_string( $screen['path'] )
							|| ! preg_match( '#^/[A-Za-z0-9_/{}\-]*$#', $screen['path'] ) )
					) {
						$errors[] = "Screen `{$sid}` has invalid `path` pattern.";
					}
					if (
						isset( $screen['dataViewRef'] )
						&& ( ! is_string( $screen['dataViewRef'] )
							|| ! preg_match(
								'#^[A-Za-z][A-Za-z0-9_-]*/[A-Za-z][A-Za-z0-9_-]*/(_default|[A-Za-z0-9][A-Za-z0-9_-]*)$#',
								$screen['dataViewRef']
							) )
					) {
						$errors[] = "Screen `{$sid}` has invalid `dataViewRef` (expected kind/name/variant).";
					}
				}
			}
		}

		if ( isset( $doc['commands'] ) && is_array( $doc['commands'] ) ) {
			foreach ( $doc['commands'] as $i => $cmd ) {
				if ( ! is_array( $cmd ) ) {
					continue;
				}
				if ( ! isset( $cmd['id'] ) || ! is_string( $cmd['id'] ) || $cmd['id'] === '' ) {
					$errors[] = "Command index {$i} missing required `id`.";
				}
			}
		}

		return $errors;
	}

	/**
	 * Encode a v3 doc as JSON with the conventions used by the bundled
	 * shells: tab indentation, no escaped slashes / unicode.
	 *
	 * @param array $doc
	 * @return string
	 */
	public static function encode_json( $doc ) {
		$flags = JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
		$json  = wp_json_encode( $doc, $flags );
		if ( ! is_string( $json ) ) {
			return '';
		}
		// wp_json_encode uses 4-space indent under JSON_PRETTY_PRINT; the
		// shells/ files are tab-indented to match WP JS coding standards
		// (eslint --fix tabifies them). Convert leading 4-space runs to
		// tabs to match. Each leading group of 4 spaces becomes one tab.
		$lines = explode( "\n", $json );
		foreach ( $lines as $idx => $line ) {
			if ( preg_match( '/^( +)/', $line, $m ) ) {
				$spaces  = strlen( $m[1] );
				$tabs    = (int) floor( $spaces / 4 );
				$remainder = str_repeat( ' ', $spaces - ( $tabs * 4 ) );
				$lines[ $idx ] = str_repeat( "\t", $tabs ) . $remainder . substr( $line, $spaces );
			}
		}
		return implode( "\n", $lines ) . "\n";
	}
}


/**
 * Helpers shared by the CLI driver (in class-wp-admin-shell-cli.php) and
 * potentially other callers. Kept on the Rewriter class because they're
 * pure path-resolution / output-path utilities — no WP-CLI dependency.
 */
class WP_Admin_Shell_Migrate_CLI_Helpers {

	/**
	 * Resolve the `<slug-or-path>` arg to an absolute filesystem path.
	 * Slugs are resolved against `shells/<slug>.json`; paths are
	 * accepted verbatim when they exist.
	 *
	 * @param string $source
	 * @return string Absolute path, or empty string when unresolvable.
	 */
	public static function resolve_source( $source ) {
		if ( ! is_string( $source ) || $source === '' ) {
			return '';
		}
		// Absolute path?
		if ( $source[0] === '/' || preg_match( '/^[A-Za-z]:[\\\\\/]/', $source ) ) {
			return is_file( $source ) ? $source : '';
		}
		// Relative path — try cwd first.
		$cwd     = function_exists( 'getcwd' ) ? getcwd() : false;
		if ( is_string( $cwd ) && $cwd !== '' ) {
			$cwd_path = $cwd . '/' . $source;
			if ( is_file( $cwd_path ) ) {
				return $cwd_path;
			}
		}
		// Slug lookup. sanitize_file_name strips path separators.
		$slug = function_exists( 'sanitize_file_name' )
			? sanitize_file_name( $source )
			: preg_replace( '#[^A-Za-z0-9._-]#', '-', $source );
		if ( defined( 'WP_ADMIN_SHELL_PATH' ) ) {
			$path = WP_ADMIN_SHELL_PATH . 'shells/' . $slug . '.json';
			if ( is_file( $path ) ) {
				return $path;
			}
		}
		return '';
	}

	/**
	 * Default output path: replace the source's `.json` suffix with
	 * `.v3.json`. Sources already carrying a `.v3.json` suffix keep it
	 * (no `.v3.v3.json` doubling). Sources without `.json` get
	 * `.v3.json` appended.
	 *
	 * @param string $source_path
	 * @return string
	 */
	public static function default_output_path( $source_path ) {
		// `.v3.json` already present — overwrite-in-place semantics for
		// re-running the migration against its own output (test fixtures
		// + idempotency-checks). The CLI's destination-collision guard
		// catches the actual file-exists case; this only avoids the
		// `.v3.v3.json` suffix.
		if ( substr( $source_path, -8 ) === '.v3.json' ) {
			return $source_path;
		}
		if ( substr( $source_path, -5 ) === '.json' ) {
			return substr( $source_path, 0, -5 ) . '.v3.json';
		}
		return $source_path . '.v3.json';
	}
}
