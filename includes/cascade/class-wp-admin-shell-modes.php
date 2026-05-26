<?php
/**
 * Mode-catalog resolver (v3).
 *
 * Engines declare a `modes` catalog in their `engine.json` mapping mode
 * names to per-region states (`hidden`, `compact`, `minimal`, `fullWidth`,
 * etc.). Screens declare which mode they want via `screens[id].mode`. The
 * resolver flattens the engine's catalog by walking each entry's `extends`
 * chain (depth limit 10, circular-ref guarded), then runs the
 * `wp_admin_shell_engine_modes_{engineId}` filter to let plugins extend
 * the catalog (the filter contributes through the `plugin` cascade origin,
 * conceptually).
 *
 * The resolver does NOT perform the per-screen merge — that's done in JS
 * at render time so the active screen's `regions` override flows in without
 * a server round trip. The PHP side only produces the flat, plugin-extended
 * engine catalog that ships in the inline `window.wpAdminShell.config` payload
 * under `engineModes`.
 *
 * See:
 *   - docs/schema-sketch.md §Modes
 *   - docs/core-default-engine.md
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Modes {

	const MAX_EXTENDS_DEPTH = 10;

	/**
	 * Synthesize a minimal mode catalog containing only `default`.
	 *
	 * Used when an engine ships no `modes` block (e.g. v2 engine manifests
	 * before v3 adoption). The default mode has no region states — every
	 * region renders normally. This preserves v2 behavior precisely when no
	 * mode is declared.
	 *
	 * @return array<string, array>
	 */
	public static function synthesize_default_catalog() {
		return array(
			'default' => array(
				'label'   => 'Default',
				'regions' => array(),
			),
		);
	}

	/**
	 * Resolve an engine manifest's `modes` catalog.
	 *
	 * Walks every entry's `extends` chain bottom-up, deep-merging each
	 * level on top of its parent. Depth limit `MAX_EXTENDS_DEPTH` catches
	 * runaway / circular chains — when an entry would exceed the limit
	 * (or chain back to itself / a child), the partially-resolved entry is
	 * returned with `_extendsChainError` set so callers can surface a
	 * diagnostic. Other entries in the catalog resolve unaffected.
	 *
	 * Synthesizes a `default`-only catalog when the manifest declares no
	 * `modes` block at all — preserves v2 behavior.
	 *
	 * @param array $engine_manifest Engine manifest array (must have `id`).
	 * @return array<string, array> Flat catalog: mode-id → resolved doc.
	 */
	public static function resolve_engine_modes( $engine_manifest ) {
		if ( ! is_array( $engine_manifest ) ) {
			return self::synthesize_default_catalog();
		}

		$catalog = isset( $engine_manifest['modes'] ) && is_array( $engine_manifest['modes'] )
			? $engine_manifest['modes']
			: array();

		// Engines without a modes block get a synthesized default.
		if ( empty( $catalog ) ) {
			$catalog = self::synthesize_default_catalog();
		}

		// Engines declaring modes but missing `default` get one injected so
		// the v3 contract holds (every catalog has a default). This is a
		// belt-and-suspenders pass; the schema enforces `default` as
		// required, but a hand-rolled manifest bypassing validation should
		// still produce a working catalog.
		if ( ! isset( $catalog['default'] ) ) {
			$catalog = array_merge(
				array( 'default' => array( 'label' => 'Default', 'regions' => array() ) ),
				$catalog
			);
		}

		$resolved = array();
		foreach ( $catalog as $mode_id => $mode_def ) {
			if ( ! is_string( $mode_id ) || $mode_id === '' ) {
				continue;
			}
			if ( ! is_array( $mode_def ) ) {
				continue;
			}
			$resolved[ $mode_id ] = self::flatten_extends( $mode_id, $catalog );
		}

		// Plugin filter — additive: plugins ship extra modes via
		// `wp_admin_shell_engine_modes_{engineId}`. Filter fires with the
		// already-flattened catalog; plugin-contributed entries may also
		// declare `extends`, so re-flatten the result against itself.
		$engine_id = isset( $engine_manifest['id'] ) && is_string( $engine_manifest['id'] )
			? $engine_manifest['id']
			: '';
		if ( $engine_id !== '' ) {
			$resolved = self::apply_plugin_filter( $resolved, $engine_id );
		}

		return $resolved;
	}

	/**
	 * Run the plugin filter for an engine's mode catalog.
	 *
	 * Plugins extend an engine's catalog by adding entries via:
	 *
	 *     add_filter( 'wp_admin_shell_engine_modes_{engineId}', function( $modes ) {
	 *         $modes[ 'kiosk' ] = [ 'label' => 'Kiosk', 'regions' => [ ... ] ];
	 *         return $modes;
	 *     } );
	 *
	 * After the filter runs, the catalog is re-flattened so plugin-
	 * contributed `extends` chains resolve against the now-full catalog.
	 *
	 * @param array  $modes     Pre-filter (already flattened) catalog.
	 * @param string $engine_id Engine id used in the filter name.
	 * @return array
	 */
	public static function apply_plugin_filter( $modes, $engine_id ) {
		$filter_name = 'wp_admin_shell_engine_modes_' . $engine_id;
		$filtered    = apply_filters( $filter_name, $modes, $engine_id );
		if ( ! is_array( $filtered ) ) {
			return $modes;
		}

		// Re-flatten — plugin entries may declare `extends`.
		$flattened = array();
		foreach ( $filtered as $mode_id => $mode_def ) {
			if ( ! is_string( $mode_id ) || $mode_id === '' || ! is_array( $mode_def ) ) {
				continue;
			}
			$flattened[ $mode_id ] = self::flatten_extends( $mode_id, $filtered );
		}
		return $flattened;
	}

	/**
	 * Resolve a single mode's `extends` chain.
	 *
	 * Walks parents top-down (root ancestor → target) accumulating a
	 * deep-merged document at each level. Cycle / depth violations are
	 * caught and recorded on the partial result via `_extendsChainError`
	 * so the caller can surface a diagnostic without poisoning the rest of
	 * the catalog.
	 *
	 * @param string $mode_id Mode id to resolve.
	 * @param array  $catalog Full catalog this id participates in.
	 * @param array  $visited Visited mode ids (for cycle detection).
	 * @param int    $depth   Current recursion depth.
	 * @return array Flattened mode entry.
	 */
	private static function flatten_extends( $mode_id, $catalog, $visited = array(), $depth = 0 ) {
		if ( $depth >= self::MAX_EXTENDS_DEPTH ) {
			return array(
				'label'               => $mode_id,
				'_extendsChainError'  => sprintf( 'Mode "%s" exceeded extends-chain depth limit (%d).', $mode_id, self::MAX_EXTENDS_DEPTH ),
				'regions'             => array(),
			);
		}
		if ( in_array( $mode_id, $visited, true ) ) {
			return array(
				'label'               => $mode_id,
				'_extendsChainError'  => sprintf( 'Mode "%s" produced a circular extends chain.', $mode_id ),
				'regions'             => array(),
			);
		}
		if ( ! isset( $catalog[ $mode_id ] ) || ! is_array( $catalog[ $mode_id ] ) ) {
			return array(
				'label'               => $mode_id,
				'_extendsChainError'  => sprintf( 'Mode "%s" referenced via extends but not declared.', $mode_id ),
				'regions'             => array(),
			);
		}

		$entry  = $catalog[ $mode_id ];
		$parent = isset( $entry['extends'] ) && is_string( $entry['extends'] ) && $entry['extends'] !== ''
			? $entry['extends']
			: null;

		// Resolve parent first, then layer this entry on top.
		if ( $parent !== null ) {
			$resolved_parent = self::flatten_extends(
				$parent,
				$catalog,
				array_merge( $visited, array( $mode_id ) ),
				$depth + 1
			);
			$resolved = self::deep_merge( $resolved_parent, $entry );
		} else {
			$resolved = $entry;
		}

		// `extends` is metadata that doesn't belong in the resolved doc —
		// strip it so consumers don't see the unresolved indirection.
		unset( $resolved['extends'] );

		// Ensure required fields exist.
		if ( ! isset( $resolved['regions'] ) || ! is_array( $resolved['regions'] ) ) {
			$resolved['regions'] = array();
		}
		if ( ! isset( $resolved['label'] ) || ! is_string( $resolved['label'] ) ) {
			$resolved['label'] = $mode_id;
		}

		return $resolved;
	}

	/**
	 * Deep-merge two arrays — `$over` wins on every overlapping leaf.
	 *
	 * Used by `flatten_extends` to layer a child mode on top of its
	 * parent. Mirrors the JS resolver's deepMerge contract: scalars and
	 * non-array values are replaced; associative arrays merge recursively;
	 * plain arrays (list-shaped) are replaced wholesale. Region-state maps
	 * are associative — `regions.{id}.{key}` merges per-key.
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

	/**
	 * Detect whether an array is associative (string keys) or list-shaped
	 * (sequential int keys). Region-state maps are always associative;
	 * field/action arrays are list-shaped. Mirrors the JS heuristic.
	 *
	 * @param mixed $value
	 * @return bool
	 */
	private static function is_assoc( $value ) {
		if ( ! is_array( $value ) ) {
			return false;
		}
		if ( $value === array() ) {
			return true; // Empty → treat as assoc so a child can populate it.
		}
		return array_keys( $value ) !== range( 0, count( $value ) - 1 );
	}
}
