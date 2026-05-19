<?php
/**
 * View-config resolver — v3 shape.
 *
 * v3 collapses v2's `viewConfigs[kind][name][variant]` registry into a
 * two-layer model:
 *
 *   1. **Global**: `settings.views.<kind>.<name>` — the cascade-resolved
 *      view definition for an entity. No `_default` / variant nesting;
 *      variants are expressed as separate screens with their own inline
 *      `view` override.
 *   2. **Per-screen inline**: `screens.<id>.view` — a partial that
 *      deep-merges with the global definition. Used by drafts / pending /
 *      trash style sibling screens that share an entity shape but want
 *      to filter / re-action the surface.
 *
 * Field collections live at `settings.fields[<collection-id>]` (the v3
 * home of the v2 `fieldCollections` block — same shape, moved under the
 * `settings` registries grouping). View definitions reference a
 * collection via `fieldsRef`; resolution merges ref-wins-inline-overrides.
 *
 * The filter hook keeps its v2 name minus the variant qualifier:
 * `wp_admin_shell_view_config_{$kind}_{$name}`. No `..._{variant}` form
 * exists in v3 (no variants).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_View_Config {

	/**
	 * Resolve a global view definition for `(kind, name)`.
	 *
	 * Walks `settings.views[$kind][$name]` from the cascade-resolved tree,
	 * resolves any `fieldsRef` against `settings.fields`, then runs
	 * `wp_admin_shell_view_config_{$kind}_{$name}` on the resolved doc.
	 *
	 * @param string     $kind   Entity kind.
	 * @param string     $name   Entity name.
	 * @param array|null $config Optional pre-resolved cascade tree. Tests pass this;
	 *                           production code passes null to let the resolver load it.
	 * @return array Resolved view-config doc. Empty array when no entry exists.
	 */
	public static function resolve_global( $kind, $name, $config = null ) {
		$kind = WP_Admin_Shell_Field_Collections::sanitize_segment( (string) $kind );
		$name = WP_Admin_Shell_Field_Collections::sanitize_segment( (string) $name );
		if ( $kind === '' || $name === '' ) {
			return array();
		}

		if ( $config === null ) {
			$config = wp_admin_shell_get_active_config();
		}

		$doc = $config['settings']['views'][ $kind ][ $name ] ?? array();
		if ( ! is_array( $doc ) ) {
			$doc = array();
		}

		$doc = self::apply_fields_ref( $doc, $config );

		$filter = sprintf( 'wp_admin_shell_view_config_%s_%s', $kind, $name );
		$doc    = apply_filters( $filter, $doc, $kind, $name );

		return is_array( $doc ) ? $doc : array();
	}

	/**
	 * Resolve the view document for a specific screen.
	 *
	 * 1. Look up `screens[$screen_id]`.
	 * 2. Determine the `(kind, name)` pair the screen consumes — explicit
	 *    `viewKind`/`viewName` on the screen take precedence; otherwise
	 *    fall through to the app manifest of the screen's primary app
	 *    (`screen.app` shorthand or first `screen.apps[]` entry).
	 * 3. Resolve the global view for that pair.
	 * 4. Deep-merge the screen's inline `view` partial on top.
	 *
	 * @param string     $screen_id Screen id.
	 * @param array|null $config    Optional pre-resolved cascade tree.
	 * @return array Resolved per-screen view doc. Empty array when the
	 *               screen has no view (no inline `view` and no resolvable
	 *               global pair).
	 */
	public static function resolve_screen_view( $screen_id, $config = null ) {
		if ( ! is_string( $screen_id ) || $screen_id === '' ) {
			return array();
		}
		if ( $config === null ) {
			$config = wp_admin_shell_get_active_config();
		}

		$screen = $config['screens'][ $screen_id ] ?? null;
		if ( ! is_array( $screen ) ) {
			return array();
		}

		list( $kind, $name ) = self::infer_kind_name( $screen );

		$global = array();
		if ( $kind !== '' && $name !== '' ) {
			$global = self::resolve_global( $kind, $name, $config );
		}

		$inline = isset( $screen['view'] ) && is_array( $screen['view'] )
			? $screen['view']
			: array();

		if ( empty( $inline ) ) {
			return $global;
		}

		$merged = self::deep_merge_view( $global, $inline );

		// fieldsRef declared on the inline screen view overrides the global's ref.
		// Re-run the ref resolution against the merged doc so the inline-author's
		// intent (collection swap or addition) wins. When inline `view` carries
		// no `fieldsRef`, the global ref still applies and the fields array has
		// already been merged in `resolve_global`.
		if ( isset( $inline['fieldsRef'] ) && is_string( $inline['fieldsRef'] ) && $inline['fieldsRef'] !== '' ) {
			$merged = self::apply_fields_ref( $merged, $config );
		}

		return $merged;
	}

	/**
	 * Apply a view doc's `fieldsRef` against `settings.fields` — collection
	 * supplies the base fields, inline `fields` array overrides per-id.
	 *
	 * @param array $doc    View doc to resolve. May or may not carry `fieldsRef`.
	 * @param array $config The full cascade-resolved config (for `settings.fields` lookup).
	 * @return array Doc with `fields` merged and `_resolvedFieldsRef` stamp when ref resolved.
	 */
	private static function apply_fields_ref( $doc, $config ) {
		if ( empty( $doc['fieldsRef'] ) || ! is_string( $doc['fieldsRef'] ) ) {
			return $doc;
		}

		$ref        = $doc['fieldsRef'];
		$collection = $config['settings']['fields'][ $ref ] ?? null;
		if ( ! is_array( $collection ) || empty( $collection['fields'] ) || ! is_array( $collection['fields'] ) ) {
			return $doc;
		}

		$inline_fields             = isset( $doc['fields'] ) && is_array( $doc['fields'] ) ? $doc['fields'] : array();
		$doc['fields']             = self::merge_fields( $collection['fields'], $inline_fields );
		$doc['_resolvedFieldsRef'] = $ref;

		return $doc;
	}

	/**
	 * Deep-merge an inline screen view delta on top of the global view doc.
	 *
	 *   - Scalars + plain assoc objects: per-key recursive merge.
	 *   - `fields` array: merge by `id`, per-field shallow override (same
	 *     semantics as the cascade resolver's keyed-array merge, kept
	 *     local so this resolver remains independent of the resolver
	 *     pipeline).
	 *   - `actions` array: same id-keyed merge.
	 *   - `null` value tombstones the key (matches v3 cascade semantics).
	 *
	 * @param array $base    Global resolved doc.
	 * @param array $overlay Inline screen-view partial.
	 * @return array
	 */
	private static function deep_merge_view( $base, $overlay ) {
		if ( ! is_array( $overlay ) ) {
			return $base;
		}
		if ( ! is_array( $base ) ) {
			return $overlay;
		}

		$out = $base;
		foreach ( $overlay as $key => $value ) {
			if ( $value === null ) {
				unset( $out[ $key ] );
				continue;
			}

			if ( $key === 'fields' && is_array( $value ) ) {
				$base_fields   = isset( $out['fields'] ) && is_array( $out['fields'] ) ? $out['fields'] : array();
				$out['fields'] = self::merge_id_keyed( $base_fields, $value );
				continue;
			}

			if ( $key === 'actions' && is_array( $value ) ) {
				$base_actions   = isset( $out['actions'] ) && is_array( $out['actions'] ) ? $out['actions'] : array();
				$out['actions'] = self::merge_id_keyed( $base_actions, $value );
				continue;
			}

			if (
				is_array( $value ) &&
				isset( $out[ $key ] ) &&
				is_array( $out[ $key ] ) &&
				self::is_assoc( $value ) &&
				self::is_assoc( $out[ $key ] )
			) {
				$out[ $key ] = self::deep_merge_view( $out[ $key ], $value );
				continue;
			}

			$out[ $key ] = $value;
		}
		return $out;
	}

	/**
	 * Merge a `fields[]` / `actions[]` overlay onto a base array.
	 *
	 * Base entries are kept in order. Overlay entries with a matching `id`
	 * shallow-override the base entry per-key. Overlay entries with a new
	 * `id` append after the base. An overlay entry `{ id, __tombstone: true }`
	 * removes the matching base entry. Garbage entries (no `id`) are
	 * dropped.
	 *
	 * Mirrors the cascade resolver's keyed-array merge for these two
	 * specific arrays without dragging the full resolver pipeline into
	 * the view-config resolver. Same id contract as v3 spec §10.
	 *
	 * @param array $base    Base list.
	 * @param array $overlay Overlay list.
	 * @return array
	 */
	private static function merge_id_keyed( $base, $overlay ) {
		$overlay_by_id = array();
		$overlay_order = array();
		$tombstones    = array();
		foreach ( $overlay as $entry ) {
			if ( ! is_array( $entry ) || ! isset( $entry['id'] ) ) {
				continue;
			}
			$id                   = $entry['id'];
			$overlay_by_id[ $id ] = $entry;
			$overlay_order[]      = $id;
			if ( ! empty( $entry['__tombstone'] ) ) {
				$tombstones[ $id ] = true;
			}
		}

		$out  = array();
		$seen = array();
		foreach ( $base as $entry ) {
			if ( ! is_array( $entry ) || ! isset( $entry['id'] ) ) {
				continue;
			}
			$id = $entry['id'];
			if ( isset( $tombstones[ $id ] ) ) {
				$seen[ $id ] = true;
				continue;
			}
			if ( isset( $overlay_by_id[ $id ] ) ) {
				$override = $overlay_by_id[ $id ];
				unset( $override['__tombstone'] );
				$out[] = array_merge( $entry, $override );
			} else {
				$out[] = $entry;
			}
			$seen[ $id ] = true;
		}

		foreach ( $overlay_order as $id ) {
			if ( isset( $seen[ $id ] ) ) {
				continue;
			}
			if ( isset( $tombstones[ $id ] ) ) {
				continue;
			}
			$entry = $overlay_by_id[ $id ];
			unset( $entry['__tombstone'] );
			$out[] = $entry;
		}

		return $out;
	}

	/**
	 * Infer the `(kind, name)` pair the screen consumes for view-config
	 * resolution.
	 *
	 * Order of precedence:
	 *   1. Explicit `viewKind` + `viewName` on the screen — escape hatch
	 *      for screens that mount an app whose manifest doesn't declare
	 *      a `view` block.
	 *   2. The screen's primary-app manifest `view` block: `view.kind` +
	 *      `view.name`. For the shorthand `screen.app` form, the primary
	 *      app is `screen.app`. For long-form `screen.apps[]` the primary
	 *      is the first entry whose manifest declares a `view`.
	 *   3. Empty pair — no view resolution possible.
	 *
	 * The name from the manifest may be overridden by `screen.config[<key>]`
	 * — concretely, when the manifest's `view.kind === 'postType'` we read
	 * `screen.config.postType`; for `taxonomy` we read `screen.config.taxonomy`.
	 * Anything else, the manifest's literal `view.name` wins.
	 *
	 * @param array $screen Resolved screen entry.
	 * @return array{0:string,1:string} `[ $kind, $name ]`. Empty strings when undetermined.
	 */
	private static function infer_kind_name( $screen ) {
		if (
			isset( $screen['viewKind'] ) && is_string( $screen['viewKind'] ) &&
			isset( $screen['viewName'] ) && is_string( $screen['viewName'] )
		) {
			return array(
				WP_Admin_Shell_Field_Collections::sanitize_segment( $screen['viewKind'] ),
				WP_Admin_Shell_Field_Collections::sanitize_segment( $screen['viewName'] ),
			);
		}

		$app_id = null;
		if ( isset( $screen['app'] ) && is_string( $screen['app'] ) ) {
			$app_id = $screen['app'];
		} elseif ( isset( $screen['apps'] ) && is_array( $screen['apps'] ) ) {
			foreach ( $screen['apps'] as $entry ) {
				if ( is_array( $entry ) && isset( $entry['app'] ) && is_string( $entry['app'] ) ) {
					$app_id = $entry['app'];
					break;
				}
			}
		}
		if ( $app_id === null ) {
			return array( '', '' );
		}

		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return array( '', '' );
		}
		$manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( $app_id );
		if ( ! is_array( $manifest ) || empty( $manifest['view'] ) || ! is_array( $manifest['view'] ) ) {
			return array( '', '' );
		}

		$kind = isset( $manifest['view']['kind'] ) && is_string( $manifest['view']['kind'] )
			? $manifest['view']['kind']
			: '';
		$name = isset( $manifest['view']['name'] ) && is_string( $manifest['view']['name'] )
			? $manifest['view']['name']
			: '';

		$config = isset( $screen['config'] ) && is_array( $screen['config'] ) ? $screen['config'] : array();
		if ( $kind === 'postType' && isset( $config['postType'] ) && is_string( $config['postType'] ) && $config['postType'] !== '' ) {
			$name = $config['postType'];
		} elseif ( $kind === 'taxonomy' && isset( $config['taxonomy'] ) && is_string( $config['taxonomy'] ) && $config['taxonomy'] !== '' ) {
			$name = $config['taxonomy'];
		}

		return array(
			WP_Admin_Shell_Field_Collections::sanitize_segment( $kind ),
			WP_Admin_Shell_Field_Collections::sanitize_segment( $name ),
		);
	}

	/**
	 * Inject app manifest `view` baselines into the resolved tree at
	 * `settings.views[<kind>][<name>]`.
	 *
	 * Spec §13 #7: each app's `view` block fills the pair it binds to
	 * only when nothing in the cascade declared it. Declared pairs are
	 * authoritative — admin.json / site / role / user wins outright, no
	 * deep-merge. To extend a manifest baseline, hook
	 * `wp_admin_shell_view_config_{$kind}_{$name}`.
	 *
	 * v3 reads the manifest field renamed `view` (v2 used `viewConfig`).
	 * No variant nesting on the registry side — manifest-declared variants
	 * become irrelevant once they're not addressed by registry path. The
	 * baseline strips any `variant` key.
	 *
	 * @param array $doc Post-merge resolved document.
	 * @return array
	 */
	public static function inject_app_baselines( $doc ) {
		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return $doc;
		}
		$apps = WP_Admin_Shell_Manifest_Registry::instance()->list_apps();
		if ( empty( $apps ) ) {
			return $doc;
		}
		if ( ! isset( $doc['settings'] ) || ! is_array( $doc['settings'] ) ) {
			$doc['settings'] = array();
		}
		if ( ! isset( $doc['settings']['views'] ) || ! is_array( $doc['settings']['views'] ) ) {
			$doc['settings']['views'] = array();
		}

		foreach ( $apps as $app ) {
			if ( ! is_array( $app ) || empty( $app['view'] ) || ! is_array( $app['view'] ) ) {
				continue;
			}
			$vc   = $app['view'];
			$kind = isset( $vc['kind'] ) && is_string( $vc['kind'] ) ? $vc['kind'] : '';
			$name = isset( $vc['name'] ) && is_string( $vc['name'] ) ? $vc['name'] : '';
			if ( $kind === '' || $name === '' ) {
				continue;
			}

			$entry = $vc;
			unset( $entry['kind'], $entry['name'], $entry['variant'] );

			if ( ! isset( $doc['settings']['views'][ $kind ] ) ) {
				$doc['settings']['views'][ $kind ] = array();
			}
			if ( ! isset( $doc['settings']['views'][ $kind ][ $name ] ) ) {
				$doc['settings']['views'][ $kind ][ $name ] = $entry;
			}
		}

		return $doc;
	}

	/**
	 * Merge inline fields over a collection's base fields. Both arrays
	 * are lists of field descriptors keyed by `id`. Inline overrides win
	 * per-field (shallow merge); collection fields not redeclared carry
	 * through. Inline-only ids are appended after the base list
	 * (preserves collection field order).
	 *
	 * Used by `fieldsRef` resolution. Public so the JS-side merge mirror
	 * can be tested against the same surface.
	 *
	 * @param array $base   Collection fields.
	 * @param array $inline Inline-declared fields.
	 * @return array
	 */
	public static function merge_fields( $base, $inline ) {
		$inline_by_id = array();
		foreach ( $inline as $field ) {
			if ( is_array( $field ) && isset( $field['id'] ) ) {
				$inline_by_id[ $field['id'] ] = $field;
			}
		}

		$out      = array();
		$seen_ids = array();

		foreach ( $base as $field ) {
			if ( ! is_array( $field ) || ! isset( $field['id'] ) ) {
				continue;
			}
			$id              = $field['id'];
			$seen_ids[ $id ] = true;
			if ( isset( $inline_by_id[ $id ] ) ) {
				$out[] = array_merge( $field, $inline_by_id[ $id ] );
			} else {
				$out[] = $field;
			}
		}

		foreach ( $inline as $field ) {
			if ( ! is_array( $field ) || ! isset( $field['id'] ) ) {
				continue;
			}
			if ( isset( $seen_ids[ $field['id'] ] ) ) {
				continue;
			}
			$seen_ids[ $field['id'] ] = true;
			$out[]                    = $field;
		}

		return $out;
	}

	/**
	 * Helper — true for assoc array (non-empty, string keys).
	 *
	 * @param mixed $arr
	 * @return bool
	 */
	private static function is_assoc( $arr ) {
		if ( ! is_array( $arr ) || empty( $arr ) ) {
			return false;
		}
		return array_keys( $arr ) !== range( 0, count( $arr ) - 1 );
	}
}

// Post-merge so admin.json (and downstream origins) are authoritative.
add_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_View_Config', 'inject_app_baselines' ), 5 );
