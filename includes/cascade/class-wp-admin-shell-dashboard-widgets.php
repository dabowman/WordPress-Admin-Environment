<?php
/**
 * Dashboard-widgets registry (v3 reshape — 3c.1).
 *
 * Plugins register a widget app for the dashboard grid via
 * `wp_admin_shell_register_dashboard_widget()`. In v3 the registry
 * contributes a screen-app entry under the target screen
 * (`dashboard-widgets` by default) instead of writing into the v2
 * top-level `dashboardWidgets` block. The cascade pipeline then
 * merges these entries with any admin.json `screens[id].apps[]`
 * declarations via the normal id-keyed array merge.
 *
 * Schema:
 *   - `screens[id].apps[]` entries shape: see
 *     `docs/schemas/admin-v3.json#/$defs/appsEntry`.
 *   - Manifest `slotHints` shape: see
 *     `docs/schemas/admin-app-v3.json#/$defs/slotHints`.
 *
 * Two flavors preserved verbatim from v2:
 *
 *   1. **Override flavor.** `$args` carries placement/size only
 *      (`position`, `defaultSize`, `minSize`, `title`, `hidden`).
 *      The app must already be registered (manifest exists). The
 *      registry contributes a `screens[<target>].apps[]` entry
 *      pointing at the app id with `slot: 'grid'` + the supplied
 *      size/position. `hidden: true` translates to an array
 *      tombstone via the cascade's `__tombstone` marker.
 *
 *   2. **Standalone flavor.** `$args` additionally carries `script`
 *      (and optional `role`, `title`, `capabilities`, `slotHints`).
 *      The function registers a synthetic app manifest so the host
 *      can mount the widget without a separate
 *      `wp_admin_shell_register_app()` call. The synthetic manifest
 *      carries `slotHints` derived from the placement args.
 *
 * v2 back-compat — the v3 compiler translates the legacy
 * top-level `dashboardWidgets` block to screen-app entries at
 * resolve time (see `WP_Admin_Shell_V3_Compiler::translate_v2_dashboard_widgets`).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Dashboard_Widgets {

	/**
	 * Default target screen id when callers don't override via
	 * `$args['screen']`.
	 */
	const DEFAULT_TARGET_SCREEN = 'dashboard-widgets';

	/**
	 * Per-widget registration records.
	 *
	 * Each record carries enough information to (a) synthesize a
	 * `screens[<target>].apps[]` entry at cascade time and (b)
	 * preserve introspection — `get()` / `all()` return these.
	 *
	 * @var array<string, array{
	 *     app_id: string,
	 *     entry_id: string,
	 *     target_screen: string,
	 *     args: array,
	 * }>
	 */
	private static $registrations = array();

	/**
	 * Synthetic manifests queued for forwarding to the manifest
	 * registry. Drained by `flush_pending_registrations()`, called from
	 * the `init` priority-7 manifest-discovery pass (after the registry
	 * class is loaded) + lazily by the `wp_admin_shell_data_plugin`
	 * filter contribution.
	 *
	 * @var array<string, array>
	 */
	private static $pending_registrations = array();

	/**
	 * Register a dashboard widget.
	 *
	 * @param string $id   App id (namespaced — `core:` or `plugin:slug/name`).
	 * @param array  $args Configuration. See class docblock.
	 * @return string|WP_Error App id on success, WP_Error on failure.
	 */
	public static function register( $id, $args = array() ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_invalid_id',
				__( 'Dashboard widget id must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( ! preg_match(
			'/^(core:[a-z][a-z0-9]*(-[a-z0-9]+)*|plugin:[a-z][a-z0-9-]*\/[a-z][a-z0-9]*(-[a-z0-9]+)*)$/',
			$id
		) ) {
			return new WP_Error(
				'wp_admin_shell_dashboard_widget_invalid_namespace',
				/* translators: %s: app id */
				sprintf( __( 'Dashboard widget id %s must be namespaced (core:* or plugin:slug/name).', 'wp-admin-shell' ), $id )
			);
		}
		if ( ! is_array( $args ) ) {
			$args = array();
		}

		$target_screen = isset( $args['screen'] ) && is_string( $args['screen'] ) && $args['screen'] !== ''
			? $args['screen']
			: self::DEFAULT_TARGET_SCREEN;

		// Merge top-level placement keys with nested slotHints — one
		// source of truth flows to both the screen-app entry and the
		// synthetic manifest's slotHints. Top-level keys win over
		// nested when both supplied.
		$inline_hints = isset( $args['slotHints'] ) && is_array( $args['slotHints'] )
			? $args['slotHints']
			: array();
		$placement = $inline_hints;
		foreach ( array( 'defaultSize', 'minSize', 'position' ) as $key ) {
			if ( array_key_exists( $key, $args ) ) {
				$placement[ $key ] = $args[ $key ];
			}
		}

		self::$registrations[ $id ] = array(
			'app_id'        => $id,
			'entry_id'      => self::derive_entry_id( $id ),
			'target_screen' => $target_screen,
			'args'          => $args,
			'placement'     => $placement,
		);

		// Standalone flavor: $args carries 'script' → synthesize a
		// manifest. The script handle is required for an app the kernel
		// can mount; without it, treat the call as override-only.
		if ( isset( $args['script'] ) && is_string( $args['script'] ) ) {
			$manifest = array(
				'id'      => $id,
				'version' => 1,
				'title'   => isset( $args['title'] ) && is_string( $args['title'] )
					? $args['title']
					: $id,
				'role'    => isset( $args['role'] ) && is_string( $args['role'] )
					? $args['role']
					: 'region',
				'script'  => $args['script'],
			);
			if ( isset( $args['capabilities'] ) && is_array( $args['capabilities'] ) ) {
				$manifest['capabilities'] = array_values( $args['capabilities'] );
			}
			if ( ! empty( $placement ) ) {
				// Strip placement-only fields when promoting to slotHints.
				// `position` / `defaultSize` / `minSize` all belong in
				// slotHints; `title` is not a slotHints field.
				$hints = array();
				foreach ( array( 'defaultSize', 'minSize', 'position' ) as $key ) {
					if ( isset( $placement[ $key ] ) ) {
						$hints[ $key ] = $placement[ $key ];
					}
				}
				if ( ! empty( $hints ) ) {
					$manifest['slotHints'] = $hints;
				}
			}
			// Forward the manifest to the registry — but defer the
			// actual register_app() call until the manifest-registry
			// class is guaranteed loaded + the `init` priority-7
			// manifest-discovery pass has run. Calling synchronously
			// from a mu-plugin / early `plugins_loaded` would fatal on
			// `Class "WP_Admin_Shell_Manifest_Registry" not found`.
			self::$pending_registrations[ $id ] = $manifest;
		}

		return $id;
	}

	/**
	 * Flush queued synthetic-manifest registrations into the manifest
	 * registry. Idempotent — already-registered ids no-op via the
	 * registry's own duplicate-id rejection. Called from the
	 * `init` priority-7 hook + lazily by `wp_admin_shell_data_plugin`.
	 */
	public static function flush_pending_registrations() {
		if ( empty( self::$pending_registrations ) ) {
			return;
		}
		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return;
		}
		$registry = WP_Admin_Shell_Manifest_Registry::instance();
		foreach ( self::$pending_registrations as $id => $manifest ) {
			$registry->register_app( $manifest );
		}
		self::$pending_registrations = array();
	}

	/**
	 * Read every registration record.
	 *
	 * @return array<string, array>
	 */
	public static function all() {
		return self::$registrations;
	}

	/**
	 * Look up one registration by app id.
	 *
	 * @param string $id App id.
	 * @return array|null
	 */
	public static function get( $id ) {
		return self::$registrations[ $id ] ?? null;
	}

	/**
	 * Build the `appsEntry`-shaped entry a registration contributes
	 * into `screens[<target>].apps[]`.
	 *
	 * @param array $record Registration record from `self::$registrations`.
	 * @return array `{ id, app, slot, size?, position? }` plus optional
	 *               `__tombstone` when the record carries `hidden: true`.
	 */
	public static function build_screen_app_entry( $record ) {
		$entry = array(
			'id'   => $record['entry_id'],
			'app'  => $record['app_id'],
			'slot' => 'grid',
		);

		if ( ! empty( $record['args']['hidden'] ) ) {
			// Hidden translates to a cascade-tombstone — the array
			// merger drops a matching entry from the resolved doc.
			$entry['__tombstone'] = true;
			return $entry;
		}

		$placement = isset( $record['placement'] ) && is_array( $record['placement'] )
			? $record['placement']
			: array();

		if ( isset( $placement['defaultSize'] ) && is_array( $placement['defaultSize'] ) ) {
			$entry['size'] = $placement['defaultSize'];
		}
		if ( isset( $placement['position'] ) ) {
			$entry['position'] = $placement['position'];
		}

		// `title` is NOT a valid `appsEntry` field per admin-v3.json
		// (`additionalProperties: false`). The widget's display title
		// flows through the synthesized manifest's `title` field (set
		// by `register()` when the standalone-flavor `script` arg is
		// present) and is resolved by `composeScreenWidgets` via the
		// manifest registry. Programmatic-only callers can override
		// the title at the manifest layer or via admin.json.

		return $entry;
	}

	/**
	 * Derive an entry id from an app id.
	 *
	 * Strategy: drop the namespace prefix (`core:` or `plugin:<slug>/`)
	 * and lowercase + kebab-case the suffix. The result matches the
	 * v3 appsEntry id pattern `^[a-z][a-z0-9-]*$`.
	 *
	 * For `plugin:<slug>/<name>` the slug + name are preserved (joined
	 * with `-`) so two plugins shipping the same widget name (`acme/widget`
	 * + `bravo/widget`) don't collide on the same entry id.
	 *
	 * Examples:
	 *   - `core:dashboard-widget-recent-posts` → `dashboard-widget-recent-posts`
	 *   - `plugin:acme/sales-stats`            → `acme-sales-stats`
	 *
	 * @param string $app_id
	 * @return string
	 */
	public static function derive_entry_id( $app_id ) {
		// Strip namespace prefix.
		if ( strpos( $app_id, 'core:' ) === 0 ) {
			$suffix = substr( $app_id, 5 );
		} elseif ( strpos( $app_id, 'plugin:' ) === 0 ) {
			// Keep the slug + name joined with `-` so `acme/widget` and
			// `bravo/widget` produce distinct entry ids. The previous
			// "drop the slug" shorthand silently collided across plugins.
			$suffix = substr( $app_id, 7 );
		} else {
			$suffix = $app_id;
		}
		$suffix = strtolower( $suffix );
		// Collapse non-[a-z0-9] runs to a single `-`.
		$suffix = preg_replace( '/[^a-z0-9]+/', '-', $suffix );
		$suffix = trim( $suffix, '-' );
		if ( $suffix === '' ) {
			return 'widget';
		}
		// Ensure leading char is a letter (pattern requirement).
		if ( ! preg_match( '/^[a-z]/', $suffix ) ) {
			$suffix = 'w-' . $suffix;
		}
		return $suffix;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$registrations         = array();
		self::$pending_registrations = array();
	}
}

/**
 * Public API — spec §13 #13.
 *
 * @param string $id   App id.
 * @param array  $args Optional configuration. Recognized keys:
 *                     - `title`        (string) Override the widget title at the entry layer.
 *                     - `defaultSize`  (array)  `{ w, h }` cells — fed as `size` on the screen-app entry.
 *                     - `minSize`      (array)  `{ w, h }` cells — forwarded into synthetic manifest's `slotHints.minSize` (standalone only).
 *                     - `position`     (string|array) `'auto'` or `{ row, col }`.
 *                     - `hidden`       (bool)   Tombstone the entry — removes a matching admin.json entry from the merged screen.
 *                     - `screen`       (string) Target screen id (default: `dashboard-widgets`).
 *                     - `script`       (string) Triggers standalone flavor: synthesize an app manifest.
 *                     - `role`         (string) For standalone flavor — ARIA role (default `region`).
 *                     - `capabilities` (array)  For standalone flavor — required caps.
 *                     - `slotHints`    (array)  For standalone flavor — manifest slotHints block (alternative to flat defaultSize/minSize/position).
 * @return string|WP_Error
 */
function wp_admin_shell_register_dashboard_widget( $id, $args = array() ) {
	return WP_Admin_Shell_Dashboard_Widgets::register( $id, $args );
}

/**
 * Cascade contribution — registered entries enter the resolver through
 * the `plugin` origin so site/role/user origins can extend or replace
 * via admin.json's `screens[<target>].apps[]` array. Priority 5 (same
 * as field-collections) so plugin authors using
 * `add_filter('wp_admin_shell_data_plugin', …)` directly win.
 *
 * Per-entry-id collision rule: an admin.json declaration with the same
 * entry id wins via the cascade's standard id-keyed array merge — the
 * higher origin's entry deep-merges over the lower one.
 *
 * Tombstones: when a record carries `hidden: true`, the contributed
 * entry shape includes `__tombstone: true`, which signals
 * `WP_Admin_Shell_Merge::merge_keyed_arrays` to drop the matching id
 * from the merged screen.
 */
add_filter( 'wp_admin_shell_data_plugin', function ( $doc ) {
	// Lazy flush — if a plugin registered widgets before the `init`
	// pass below ran, drain the queue now so the manifest registry
	// reflects them.
	WP_Admin_Shell_Dashboard_Widgets::flush_pending_registrations();

	$records = WP_Admin_Shell_Dashboard_Widgets::all();
	if ( empty( $records ) ) {
		return $doc;
	}

	if ( ! isset( $doc['screens'] ) || ! is_array( $doc['screens'] ) ) {
		$doc['screens'] = array();
	}

	foreach ( $records as $record ) {
		$target = $record['target_screen'];
		if ( ! isset( $doc['screens'][ $target ] ) || ! is_array( $doc['screens'][ $target ] ) ) {
			$doc['screens'][ $target ] = array();
		}
		if ( ! isset( $doc['screens'][ $target ]['apps'] ) || ! is_array( $doc['screens'][ $target ]['apps'] ) ) {
			$doc['screens'][ $target ]['apps'] = array();
		}

		// Idempotency guard — if the resolver pipeline runs twice in one
		// request (cache miss after shell switch, test harness, etc.), a
		// bare `apps[] []=` would duplicate the entry. Check for an
		// existing entry with the same id and skip when present.
		// Admin.json-authored entries also win against this contribution
		// via the same id — first-write wins.
		$entry_id = $record['entry_id'];
		$already_present = false;
		foreach ( $doc['screens'][ $target ]['apps'] as $existing ) {
			if (
				is_array( $existing ) &&
				isset( $existing['id'] ) &&
				$existing['id'] === $entry_id
			) {
				$already_present = true;
				break;
			}
		}
		if ( $already_present ) {
			continue;
		}

		$doc['screens'][ $target ]['apps'][] = WP_Admin_Shell_Dashboard_Widgets::build_screen_app_entry( $record );
	}

	return $doc;
}, 5 );

/**
 * Flush queued synthetic-manifest registrations into the manifest
 * registry at the same priority the shell's main file uses for
 * convention-path manifest discovery (`init` priority 7). Plugin
 * authors hooking earlier than this fire safely because `register()`
 * only stashes the manifest — the registry call happens here.
 */
add_action( 'init', array( 'WP_Admin_Shell_Dashboard_Widgets', 'flush_pending_registrations' ), 7 );
