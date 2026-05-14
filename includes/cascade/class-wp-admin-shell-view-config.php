<?php
/**
 * View-config resolver.
 *
 * Resolves a `(kind, name, variant)` triple to a view-config document:
 *
 *   1. Walk the resolved cascade tree for `viewConfigs[$kind][$name][$variant|'_default']`.
 *   2. If the doc declares `fieldsRef`, look up `fieldCollections[$ref]`
 *      and merge fields: ref provides the base; inline `fields` override
 *      per-field by `id`.
 *   3. Run filter `wp_admin_shell_view_config_{$kind}_{$name}` (base) and
 *      `wp_admin_shell_view_config_{$kind}_{$name}_{$variant}` (variant)
 *      on the resolved doc.
 *
 * Per-variant cascade resolution — see `project_c2_view_config_design`
 * memory: each triple resolves independently; no implicit parent merge
 * from base to variant.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_View_Config {

	/**
	 * Resolve a view-config triple.
	 *
	 * @param string      $kind    Entity kind.
	 * @param string      $name    Entity name.
	 * @param string|null $variant Variant id or null for base.
	 * @param array|null  $config  Optional pre-resolved cascade tree. Tests pass this; production
	 *                             code passes null to let the resolver load it.
	 * @return array Resolved view-config doc. Empty array when no entry exists.
	 */
	public static function resolve( $kind, $name, $variant = null, $config = null ) {
		$kind    = WP_Admin_Shell_Field_Collections::sanitize_segment( (string) $kind );
		$name    = WP_Admin_Shell_Field_Collections::sanitize_segment( (string) $name );
		$variant = $variant === null || $variant === ''
			? null
			: WP_Admin_Shell_Field_Collections::sanitize_variant( (string) $variant );
		// `_default` is the in-tree sentinel for the base bucket — not a
		// legal user-facing variant id. Normalize to null so the base
		// filter fires alone (no variant-qualified `..._default` filter).
		if ( $variant === '_default' ) {
			$variant = null;
		}

		if ( $config === null ) {
			$config = wp_admin_shell_get_active_config();
		}

		$variant_key = $variant === null ? '_default' : $variant;
		$doc         = $config['viewConfigs'][ $kind ][ $name ][ $variant_key ] ?? array();

		if ( ! is_array( $doc ) ) {
			$doc = array();
		}

		// Resolve fieldsRef → fieldCollections lookup + ref-wins-inline merge.
		if ( ! empty( $doc['fieldsRef'] ) && is_string( $doc['fieldsRef'] ) ) {
			$ref           = $doc['fieldsRef'];
			$collection    = $config['fieldCollections'][ $ref ] ?? null;
			$inline_fields = isset( $doc['fields'] ) && is_array( $doc['fields'] ) ? $doc['fields'] : array();

			if ( is_array( $collection ) && isset( $collection['fields'] ) && is_array( $collection['fields'] ) ) {
				$doc['fields']  = self::merge_fields( $collection['fields'], $inline_fields );
				$doc['_resolvedFieldsRef'] = $ref;
			}
		}

		// Run filters. Base filter always; variant-qualified filter when present.
		$filter_base = sprintf( 'wp_admin_shell_view_config_%s_%s', $kind, $name );
		$doc         = apply_filters( $filter_base, $doc, $kind, $name, $variant );

		if ( $variant !== null ) {
			$filter_variant = sprintf( 'wp_admin_shell_view_config_%s_%s_%s', $kind, $name, $variant );
			$doc            = apply_filters( $filter_variant, $doc, $kind, $name, $variant );
		}

		return is_array( $doc ) ? $doc : array();
	}

	/**
	 * List registered variants for `(kind, name)`. Walks the cascade
	 * tree's `viewConfigs[$kind][$name]` and returns the keys (with
	 * `_default` mapped to null for API consumers).
	 *
	 * @param string     $kind   Entity kind.
	 * @param string     $name   Entity name.
	 * @param array|null $config Optional pre-resolved tree.
	 * @return array<int, string|null>
	 */
	public static function variants_for( $kind, $name, $config = null ) {
		$kind = WP_Admin_Shell_Field_Collections::sanitize_segment( (string) $kind );
		$name = WP_Admin_Shell_Field_Collections::sanitize_segment( (string) $name );

		if ( $config === null ) {
			$config = wp_admin_shell_get_active_config();
		}

		$bucket = $config['viewConfigs'][ $kind ][ $name ] ?? array();
		if ( ! is_array( $bucket ) ) {
			return array();
		}

		$out = array();
		foreach ( $bucket as $variant_key => $_doc ) {
			$out[] = $variant_key === '_default' ? null : $variant_key;
		}
		return $out;
	}

	/**
	 * Inject app manifest `viewConfig` baselines into the resolved tree.
	 *
	 * Spec §13 #7: each app's `viewConfig` block fills the triple it
	 * binds to only when nothing in the cascade declared it. Declared
	 * triples are authoritative — admin.json / site / role / user wins
	 * outright, no deep-merge. To extend (not replace) a manifest
	 * baseline, hook the per-triple filter
	 * `wp_admin_shell_view_config_{$kind}_{$name}`.
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
		if ( ! isset( $doc['viewConfigs'] ) || ! is_array( $doc['viewConfigs'] ) ) {
			$doc['viewConfigs'] = array();
		}

		foreach ( $apps as $app ) {
			if ( ! is_array( $app ) || empty( $app['viewConfig'] ) || ! is_array( $app['viewConfig'] ) ) {
				continue;
			}
			$vc      = $app['viewConfig'];
			$kind    = $vc['kind'];
			$name    = $vc['name'];
			$variant = isset( $vc['variant'] ) && $vc['variant'] !== ''
				? $vc['variant']
				: '_default';

			// Strip binding keys — bucket position names them.
			$entry = $vc;
			unset( $entry['kind'], $entry['name'], $entry['variant'] );

			if ( ! isset( $doc['viewConfigs'][ $kind ] ) ) {
				$doc['viewConfigs'][ $kind ] = array();
			}
			if ( ! isset( $doc['viewConfigs'][ $kind ][ $name ] ) ) {
				$doc['viewConfigs'][ $kind ][ $name ] = array();
			}
			if ( ! isset( $doc['viewConfigs'][ $kind ][ $name ][ $variant ] ) ) {
				$doc['viewConfigs'][ $kind ][ $name ][ $variant ] = $entry;
			}
		}

		return $doc;
	}

	/**
	 * Merge inline fields over a collection's base fields. Both arrays
	 * are lists of field descriptors keyed by `id`. Inline overrides
	 * win per-field; collection fields not redeclared carry through.
	 * Inline-only ids are appended after the base list (preserves
	 * collection field order).
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
			$id        = $field['id'];
			$seen_ids[ $id ] = true;
			if ( isset( $inline_by_id[ $id ] ) ) {
				// Per-field override: shallow merge so inline can override
				// individual props without restating the whole descriptor.
				$out[] = array_merge( $field, $inline_by_id[ $id ] );
			} else {
				$out[] = $field;
			}
		}

		// Append inline-only fields not present in base. Track appended
		// ids so duplicate inline entries (`[{id:'x'},{id:'x'}]`) don't
		// stack — first wins, rest dropped.
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
}

// Post-merge so admin.json (and downstream origins) are authoritative.
add_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_View_Config', 'inject_app_baselines' ), 5 );
