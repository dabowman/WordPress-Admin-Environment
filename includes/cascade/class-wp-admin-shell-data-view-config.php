<?php
/**
 * Data-view-config resolver — v3 restoration shape.
 *
 * v3 restores the 3-axis registry the initial v3 reshape collapsed:
 *
 *   1. **Triple registry**: `settings.dataViews[kind][name][variant]` —
 *      keyed by `_default` for the implicit unqualified base plus any
 *      number of author-defined variants (e.g. `drafts`, `pending`,
 *      `trash`, `active`). Each leaf is a complete `@wordpress/dataviews`
 *      configuration document; variants resolve independently (no
 *      implicit `_default` merge) unless they explicitly declare
 *      `extends: "<other-variant>"`.
 *   2. **Per-screen inline overlay**: `screens.<id>.dataView` — a
 *      partial that deep-merges with the resolved triple. The triple
 *      itself is identified per-screen by `dataViewRef` (preferred),
 *      explicit `dataViewKind`/`dataViewName`/`dataViewVariant`, or
 *      inferred from the screen's primary app manifest's `dataView`
 *      block + `screen.config.{postType,taxonomy,variant}` (v2
 *      back-compat path).
 *   3. **App manifest baselines**: each app's `dataView` block (including
 *      every `variants.<id>`) is injected into
 *      `settings.dataViews[kind][name][<variant>]` at the `core` origin.
 *      admin.json / site / role / user wins per-triple.
 *
 * Field collections live at `settings.dataFields[<collection-id>]` (the
 * v3 home of the v2 `fieldCollections` block — same shape, renamed and
 * moved under the `settings` registries grouping). View definitions
 * reference a collection via `fieldsRef`; resolution merges
 * ref-wins-inline-overrides per-field.
 *
 * Filter hooks (CIAB-compatible naming, `s/next_admin_entity_view_config_/wp_admin_shell_data_view_config_/g`):
 *   - `wp_admin_shell_data_view_config_{kind}_{name}` — always fires
 *     after the triple resolves. Receives `(doc, kind, name, variant)`.
 *   - `wp_admin_shell_data_view_config_{kind}_{name}_{variant}` —
 *     fires after the base filter when `variant !== '_default'`.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Data_View_Config {

	/**
	 * Max `extends` chain depth. Matches `WP_Admin_Shell_Modes`
	 * convention. A chain longer than this short-circuits to the base
	 * doc with a one-time WP_DEBUG notice.
	 */
	const MAX_EXTENDS_DEPTH = 10;

	/**
	 * Cycle / depth warnings already emitted this request. Avoids
	 * spamming `_doing_it_wrong` when the same broken triple resolves
	 * many times in one render pass.
	 *
	 * @var array<string, bool>
	 */
	private static $warned_chains = array();

	/**
	 * Deprecation-shim notice tracking — `_deprecated_hook` only fires
	 * the first time the v2 filter name is invoked per request, per
	 * filter handle. Removed in v3.1.0 along with the v2 alias filter.
	 *
	 * @var array<string, bool>
	 */
	private static $emitted_deprecation_notices = array();

	/**
	 * One-shot guard for the v2 `viewConfigs` migration warning. v3
	 * doesn't read the top-level `viewConfigs` block — admin-customized
	 * overrides on v2-shape shells silently drop on upgrade. The
	 * `wp_admin_shell_data` hook below emits `_doing_it_wrong` at most
	 * once per request when it sees a non-empty orphan block. Removed
	 * in v3.1.0 alongside the v2-shape compatibility layer.
	 *
	 * @var bool
	 */
	private static $emitted_view_configs_orphan_notice = false;

	/**
	 * Reset internal state. Test-only.
	 */
	public static function reset() {
		self::$warned_chains                       = array();
		self::$emitted_deprecation_notices         = array();
		self::$emitted_view_configs_orphan_notice  = false;
	}

	/**
	 * Resolve a `(kind, name, variant)` triple.
	 *
	 * Walks `settings.dataViews[$kind][$name][$variant]` from the
	 * cascade-resolved tree, resolves any `extends` chain (max depth 10,
	 * cycle detection), resolves any `fieldsRef` against
	 * `settings.dataFields`, then runs the base filter
	 * `wp_admin_shell_data_view_config_{$kind}_{$name}` plus the
	 * variant-suffixed filter
	 * `wp_admin_shell_data_view_config_{$kind}_{$name}_{$variant}`
	 * (only when `variant !== '_default'`).
	 *
	 * @param string     $kind    Entity kind.
	 * @param string     $name    Entity name.
	 * @param string     $variant Variant id (default `_default`).
	 * @param array|null $config  Optional pre-resolved cascade tree. Tests pass this;
	 *                            production code passes null to let the resolver load it.
	 * @return array Resolved DataView doc. Empty array when no entry exists.
	 */
	public static function resolve_data_view_triple( $kind, $name, $variant = '_default', $config = null ) {
		$kind    = WP_Admin_Shell_Data_Field_Collections::sanitize_segment( (string) $kind );
		$name    = WP_Admin_Shell_Data_Field_Collections::sanitize_segment( (string) $name );
		$variant = self::sanitize_variant_segment( (string) $variant );

		if ( $kind === '' || $name === '' ) {
			return array();
		}
		if ( $variant === '' ) {
			$variant = '_default';
		}

		if ( $config === null ) {
			$config = wp_admin_shell_get_active_config();
		}

		$doc = self::resolve_extends_chain( $kind, $name, $variant, $config, array() );
		$doc = self::apply_fields_ref( $doc, $config );

		$base_filter = sprintf( 'wp_admin_shell_data_view_config_%s_%s', $kind, $name );
		$doc         = apply_filters( $base_filter, $doc, $kind, $name, $variant );
		if ( ! is_array( $doc ) ) {
			$doc = array();
		}

		// Deprecation shim — fire v2 filter name alongside the new one so
		// CIAB-port plugins compiled against `wp_admin_shell_view_config_*`
		// keep working through one release cycle (removed in v3.1.0).
		$legacy_base_filter = sprintf( 'wp_admin_shell_view_config_%s_%s', $kind, $name );
		if ( has_filter( $legacy_base_filter ) ) {
			self::maybe_emit_deprecation_notice( $legacy_base_filter, 'wp_admin_shell_data_view_config_*' );
			$doc = apply_filters( $legacy_base_filter, $doc, $kind, $name, $variant );
			if ( ! is_array( $doc ) ) {
				$doc = array();
			}
		}

		if ( $variant !== '_default' ) {
			$variant_filter = sprintf( 'wp_admin_shell_data_view_config_%s_%s_%s', $kind, $name, $variant );
			$doc            = apply_filters( $variant_filter, $doc, $kind, $name, $variant );
			if ( ! is_array( $doc ) ) {
				$doc = array();
			}

			$legacy_variant_filter = sprintf( 'wp_admin_shell_view_config_%s_%s_%s', $kind, $name, $variant );
			if ( has_filter( $legacy_variant_filter ) ) {
				self::maybe_emit_deprecation_notice( $legacy_variant_filter, 'wp_admin_shell_data_view_config_*' );
				$doc = apply_filters( $legacy_variant_filter, $doc, $kind, $name, $variant );
				if ( ! is_array( $doc ) ) {
					$doc = array();
				}
			}
		}

		return $doc;
	}

	/**
	 * Emit a one-shot `_deprecated_hook` notice per legacy filter handle
	 * per request. Avoids spam when the same triple resolves many times in
	 * one render pass. Removed in v3.1.0.
	 *
	 * @param string $legacy_handle The v2 filter name being dispatched.
	 * @param string $replacement   The v3 replacement name (for the notice).
	 */
	private static function maybe_emit_deprecation_notice( $legacy_handle, $replacement ) {
		if ( ! empty( self::$emitted_deprecation_notices[ $legacy_handle ] ) ) {
			return;
		}
		self::$emitted_deprecation_notices[ $legacy_handle ] = true;
		if ( function_exists( '_deprecated_hook' ) ) {
			_deprecated_hook( $legacy_handle, '3.0.0-beta.3', $replacement );
		}
	}

	/**
	 * Resolve the DataView document for a specific screen.
	 *
	 * Identity resolution priority:
	 *   1. `screens[$id].dataViewRef` — parsed as `kind/name/variant`.
	 *   2. Explicit `dataViewKind` + `dataViewName` (+ optional
	 *      `dataViewVariant`, defaults to `_default`).
	 *   3. Manifest inference — primary app's `dataView.kind`/`name`
	 *      overridden by `screen.config.postType` / `screen.config.taxonomy`,
	 *      variant defaults to `screen.config.variant` (v2 back-compat)
	 *      then `_default`.
	 *
	 * Once the triple is identified, `resolve_data_view_triple` runs,
	 * then the inline `screens[$id].dataView` overlay deep-merges on top.
	 *
	 * @param string     $screen_id Screen id.
	 * @param array|null $config    Optional pre-resolved cascade tree.
	 * @return array Resolved per-screen DataView doc. Empty array when the
	 *               screen has no DataView (no inline `dataView` and no
	 *               resolvable triple).
	 */
	public static function resolve_screen_data_view( $screen_id, $config = null ) {
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

		list( $kind, $name, $variant ) = self::infer_kind_name_variant( $screen );

		$base = array();
		if ( $kind !== '' && $name !== '' ) {
			$base = self::resolve_data_view_triple( $kind, $name, $variant, $config );
		}

		$inline = isset( $screen['dataView'] ) && is_array( $screen['dataView'] )
			? $screen['dataView']
			: array();

		// Per-screen overlays don't honor `extends` (overlay belongs to
		// the screen, not the registry). Drop it defensively if present.
		unset( $inline['extends'] );

		if ( empty( $inline ) ) {
			return $base;
		}

		$merged = self::deep_merge_view( $base, $inline );

		// fieldsRef declared on the inline screen overlay overrides the
		// registry's ref. Re-run the ref resolution against the merged
		// doc so the inline-author's intent (collection swap or
		// addition) wins. When the overlay carries no `fieldsRef`, the
		// registry's ref still applies and `fields` has already been
		// merged inside `resolve_data_view_triple`.
		if ( isset( $inline['fieldsRef'] ) && is_string( $inline['fieldsRef'] ) && $inline['fieldsRef'] !== '' ) {
			$merged = self::apply_fields_ref( $merged, $config );
		}

		return $merged;
	}

	/**
	 * Stamp `screens[id].dataView._resolved` on every screen the resolver
	 * can produce a DataView doc for. The JS `useDataView` hook's
	 * synchronous fast path reads this stamp; without it, entity-CRUD apps
	 * render with empty fields until the REST fallback resolves.
	 *
	 * Runs as the last resolver step (after the `wp_admin_shell_data`
	 * filter + origin-tag stripping) so the stamped doc reflects every
	 * cascade origin, baseline injection, and the per-triple filters.
	 * Author-declared inline overlays are preserved alongside the
	 * `_resolved` snapshot.
	 *
	 * @param array $resolved Resolved admin.json doc.
	 * @return array
	 */
	public static function stamp_screen_data_views( $resolved ) {
		if ( ! is_array( $resolved ) ) {
			return $resolved;
		}
		if ( ! isset( $resolved['screens'] ) || ! is_array( $resolved['screens'] ) ) {
			return $resolved;
		}

		foreach ( $resolved['screens'] as $screen_id => $screen ) {
			if ( ! is_array( $screen ) ) {
				continue;
			}
			$resolved_view = self::resolve_screen_data_view( $screen_id, $resolved );
			if ( ! is_array( $resolved_view ) || empty( $resolved_view ) ) {
				continue;
			}
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
	 * List every registered variant id under `(kind, name)`.
	 *
	 * Reads `settings.dataViews[$kind][$name]` keys after baselines have
	 * been injected. Powers the `/data-view/variants` REST endpoint.
	 *
	 * @param string     $kind   Entity kind.
	 * @param string     $name   Entity name.
	 * @param array|null $config Optional pre-resolved cascade tree.
	 * @return string[] Sorted list of variant ids. `_default` first when present.
	 */
	public static function list_variants( $kind, $name, $config = null ) {
		$kind = WP_Admin_Shell_Data_Field_Collections::sanitize_segment( (string) $kind );
		$name = WP_Admin_Shell_Data_Field_Collections::sanitize_segment( (string) $name );
		if ( $kind === '' || $name === '' ) {
			return array();
		}
		if ( $config === null ) {
			$config = wp_admin_shell_get_active_config();
		}

		$reg = $config['settings']['dataViews'][ $kind ][ $name ] ?? null;
		if ( ! is_array( $reg ) ) {
			return array();
		}

		$ids = array_keys( $reg );
		// Put `_default` first when present; alpha-sort the rest for
		// deterministic ordering.
		$has_default = in_array( '_default', $ids, true );
		$rest        = array_filter( $ids, function ( $id ) {
			return $id !== '_default';
		} );
		sort( $rest );
		return $has_default ? array_merge( array( '_default' ), $rest ) : $rest;
	}

	/**
	 * Recursive `extends` chain resolver. Cycle-safe + depth-capped.
	 *
	 * @param string $kind
	 * @param string $name
	 * @param string $variant
	 * @param array  $config
	 * @param array  $stack   Stack of variant ids visited so far in this chain.
	 * @return array
	 */
	private static function resolve_extends_chain( $kind, $name, $variant, $config, $stack ) {
		$entry = $config['settings']['dataViews'][ $kind ][ $name ][ $variant ] ?? null;
		if ( ! is_array( $entry ) ) {
			return array();
		}

		// `_default` is the implicit base — silently ignore any
		// `extends` declared on it (schema rejects, but a sloppy author
		// might slip through if validation is disabled).
		if ( $variant === '_default' && isset( $entry['extends'] ) ) {
			self::warn_chain(
				$kind . '/' . $name . '/_default:default_extends',
				sprintf(
					/* translators: 1: kind, 2: name */
					__( 'settings.dataViews.%1$s.%2$s._default declared `extends`. The implicit base cannot extend a sibling; ignoring.', 'wp-admin-shell' ),
					$kind,
					$name
				)
			);
			unset( $entry['extends'] );
		}

		// No parent chain — strip the implementation key and return.
		if ( empty( $entry['extends'] ) ) {
			unset( $entry['extends'] );
			return $entry;
		}

		// Depth + cycle guards.
		if ( count( $stack ) >= self::MAX_EXTENDS_DEPTH ) {
			self::warn_chain(
				$kind . '/' . $name . '/' . $variant . ':depth',
				sprintf(
					/* translators: 1: chain, 2: max depth */
					__( 'settings.dataViews `extends` chain %1$s exceeded max depth %2$d; returning base entry without inheritance.', 'wp-admin-shell' ),
					implode( ' → ', array_merge( $stack, array( $variant ) ) ),
					self::MAX_EXTENDS_DEPTH
				)
			);
			unset( $entry['extends'] );
			return $entry;
		}

		$parent_variant = self::sanitize_variant_segment( (string) $entry['extends'] );
		if ( $parent_variant === '' || in_array( $parent_variant, $stack, true ) || $parent_variant === $variant ) {
			self::warn_chain(
				$kind . '/' . $name . '/' . $variant . ':cycle',
				sprintf(
					/* translators: 1: chain */
					__( 'settings.dataViews `extends` chain %1$s contained a cycle; returning base entry without inheritance.', 'wp-admin-shell' ),
					implode( ' → ', array_merge( $stack, array( $variant, $parent_variant ) ) )
				)
			);
			unset( $entry['extends'] );
			return $entry;
		}

		$next_stack = $stack;
		$next_stack[] = $variant;
		$parent      = self::resolve_extends_chain( $kind, $name, $parent_variant, $config, $next_stack );

		// Strip our own implementation key before merging into the
		// parent — `extends` is an input directive, not an output field.
		unset( $entry['extends'] );

		return self::deep_merge_view( $parent, $entry );
	}

	/**
	 * Apply a view doc's `fieldsRef` against `settings.dataFields` —
	 * collection supplies the base fields, inline `fields` array
	 * overrides per-id.
	 *
	 * @param array $doc    DataView doc to resolve. May or may not carry `fieldsRef`.
	 * @param array $config The full cascade-resolved config (for `settings.dataFields` lookup).
	 * @return array Doc with `fields` merged and `_resolvedFieldsRef` stamp when ref resolved.
	 */
	private static function apply_fields_ref( $doc, $config ) {
		if ( empty( $doc['fieldsRef'] ) || ! is_string( $doc['fieldsRef'] ) ) {
			return $doc;
		}

		$ref        = $doc['fieldsRef'];
		$collection = $config['settings']['dataFields'][ $ref ] ?? null;
		if ( ! is_array( $collection ) || empty( $collection['fields'] ) || ! is_array( $collection['fields'] ) ) {
			return $doc;
		}

		$inline_fields             = isset( $doc['fields'] ) && is_array( $doc['fields'] ) ? $doc['fields'] : array();
		$doc['fields']             = self::merge_fields( $collection['fields'], $inline_fields );
		$doc['_resolvedFieldsRef'] = $ref;

		return $doc;
	}

	/**
	 * Deep-merge an inline screen overlay on top of the resolved base
	 * triple. Same semantics as the v3 reshape's deep_merge_view —
	 * preserved here verbatim so the registry path still benefits from
	 * tombstones + id-keyed `fields[]` / `actions[]` merge.
	 *
	 *   - Scalars + plain assoc objects: per-key recursive merge.
	 *   - `fields` array: merge by `id`, per-field shallow override.
	 *   - `actions` array: same id-keyed merge.
	 *   - `null` value tombstones the key (matches v3 cascade semantics).
	 *
	 * @param array $base    Resolved triple doc.
	 * @param array $overlay Overlay partial.
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
	 * Infer the `(kind, name, variant)` triple a screen consumes.
	 *
	 * Priority:
	 *   1. `screens[$id].dataViewRef` ("kind/name/variant") parsed.
	 *   2. Explicit `dataViewKind` + `dataViewName` + optional
	 *      `dataViewVariant`.
	 *   3. Manifest inference — primary app's `dataView.kind`/`name`
	 *      overridden by `screen.config.postType` / `screen.config.taxonomy`,
	 *      variant defaulted to `screen.config.variant` (v2 back-compat)
	 *      then `_default`.
	 *
	 * @param array $screen Resolved screen entry.
	 * @return array{0:string,1:string,2:string} `[ $kind, $name, $variant ]`.
	 *                                            Empty strings for kind/name when undetermined;
	 *                                            variant defaults to `_default`.
	 */
	public static function infer_kind_name_variant( $screen ) {
		// 1. dataViewRef wins outright.
		if ( isset( $screen['dataViewRef'] ) && is_string( $screen['dataViewRef'] ) && $screen['dataViewRef'] !== '' ) {
			$parsed = self::parse_data_view_ref( $screen['dataViewRef'] );
			if ( $parsed !== null ) {
				return $parsed;
			}
		}

		// 2. Explicit fields.
		if (
			isset( $screen['dataViewKind'] ) && is_string( $screen['dataViewKind'] ) &&
			isset( $screen['dataViewName'] ) && is_string( $screen['dataViewName'] )
		) {
			$variant = isset( $screen['dataViewVariant'] ) && is_string( $screen['dataViewVariant'] ) && $screen['dataViewVariant'] !== ''
				? $screen['dataViewVariant']
				: '_default';
			return array(
				WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $screen['dataViewKind'] ),
				WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $screen['dataViewName'] ),
				self::sanitize_variant_segment( $variant ),
			);
		}

		// 3. Manifest inference.
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
			return array( '', '', '_default' );
		}

		if ( ! class_exists( 'WP_Admin_Shell_Manifest_Registry' ) ) {
			return array( '', '', '_default' );
		}
		$manifest = WP_Admin_Shell_Manifest_Registry::instance()->get_app( $app_id );
		if ( ! is_array( $manifest ) || empty( $manifest['dataView'] ) || ! is_array( $manifest['dataView'] ) ) {
			return array( '', '', '_default' );
		}

		$kind = isset( $manifest['dataView']['kind'] ) && is_string( $manifest['dataView']['kind'] )
			? $manifest['dataView']['kind']
			: '';
		$name = isset( $manifest['dataView']['name'] ) && is_string( $manifest['dataView']['name'] )
			? $manifest['dataView']['name']
			: '';

		$config = isset( $screen['config'] ) && is_array( $screen['config'] ) ? $screen['config'] : array();
		if ( $kind === 'postType' && isset( $config['postType'] ) && is_string( $config['postType'] ) && $config['postType'] !== '' ) {
			$name = $config['postType'];
		} elseif ( $kind === 'taxonomy' && isset( $config['taxonomy'] ) && is_string( $config['taxonomy'] ) && $config['taxonomy'] !== '' ) {
			$name = $config['taxonomy'];
		}

		// v2 back-compat: `route.config.variant` flows into the screen
		// when the v3 compiler synthesizes screens from v2 routes.
		$variant = '_default';
		if ( isset( $config['variant'] ) && is_string( $config['variant'] ) && $config['variant'] !== '' ) {
			$variant = $config['variant'];
		}

		return array(
			WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $kind ),
			WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $name ),
			self::sanitize_variant_segment( $variant ),
		);
	}

	/**
	 * Parse a `dataViewRef` string of shape `kind/name/variant`.
	 *
	 * Returns `[kind, name, variant]` on success, `null` on malformed
	 * input. All three segments are required; missing or malformed
	 * segments invalidate the whole ref.
	 *
	 * @param string $ref
	 * @return array{0:string,1:string,2:string}|null
	 */
	public static function parse_data_view_ref( $ref ) {
		if ( ! is_string( $ref ) || $ref === '' ) {
			return null;
		}
		$parts = explode( '/', $ref );
		if ( count( $parts ) !== 3 ) {
			return null;
		}
		list( $kind, $name, $variant ) = $parts;
		$kind    = WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $kind );
		$name    = WP_Admin_Shell_Data_Field_Collections::sanitize_segment( $name );
		$variant = self::sanitize_variant_segment( $variant );
		if ( $kind === '' || $name === '' || $variant === '' ) {
			return null;
		}
		return array( $kind, $name, $variant );
	}

	/**
	 * Inject app manifest `dataView` baselines into the resolved tree
	 * at `settings.dataViews[<kind>][<name>][<variant>]`.
	 *
	 * Spec §13 #7: each app's `dataView` block fills the triples it
	 * binds to only when nothing in the cascade declared them.
	 * Declared triples are authoritative — admin.json / site / role /
	 * user wins outright, no deep-merge. To extend a manifest baseline,
	 * hook `wp_admin_shell_data_view_config_{$kind}_{$name}[_{$variant}]`.
	 *
	 * v3 restoration: the manifest's `dataView` block carries a
	 * `variants: { <id>: <doc> }` family. Every variant is injected as
	 * its own triple — `_default` plus any author-defined variant ids.
	 * The variant key is PRESERVED in the injected entry (the v3-initial
	 * `unset( $entry['variant'] )` bug is gone).
	 *
	 * Back-compat shape recognition: when the manifest declares a flat
	 * top-level `defaultView` / `fields` / `actions` / etc. instead of
	 * a nested `variants` map, treat the whole block as the `_default`
	 * variant entry. Matches the shape v3-initial manifests use.
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
		if ( ! isset( $doc['settings']['dataViews'] ) || ! is_array( $doc['settings']['dataViews'] ) ) {
			$doc['settings']['dataViews'] = array();
		}

		foreach ( $apps as $app ) {
			if ( ! is_array( $app ) || empty( $app['dataView'] ) || ! is_array( $app['dataView'] ) ) {
				continue;
			}
			$vc   = $app['dataView'];
			$kind = isset( $vc['kind'] ) && is_string( $vc['kind'] ) ? $vc['kind'] : '';
			$name = isset( $vc['name'] ) && is_string( $vc['name'] ) ? $vc['name'] : '';
			if ( $kind === '' || $name === '' ) {
				continue;
			}

			// Detect shape: variants family OR back-compat flat _default.
			$variants = array();
			if ( isset( $vc['variants'] ) && is_array( $vc['variants'] ) && ! empty( $vc['variants'] ) ) {
				$variants = $vc['variants'];
			} else {
				$flat = $vc;
				unset( $flat['kind'], $flat['name'], $flat['variants'] );
				if ( ! empty( $flat ) ) {
					$variants = array( '_default' => $flat );
				}
			}

			if ( empty( $variants ) ) {
				continue;
			}

			if ( ! isset( $doc['settings']['dataViews'][ $kind ] ) ) {
				$doc['settings']['dataViews'][ $kind ] = array();
			}
			if ( ! isset( $doc['settings']['dataViews'][ $kind ][ $name ] ) ) {
				$doc['settings']['dataViews'][ $kind ][ $name ] = array();
			}

			foreach ( $variants as $variant_id => $variant_entry ) {
				if ( ! is_string( $variant_id ) || $variant_id === '' || ! is_array( $variant_entry ) ) {
					continue;
				}
				$variant_id = self::sanitize_variant_segment( $variant_id );
				if ( $variant_id === '' ) {
					continue;
				}
				// admin.json wins per-triple — only inject when nothing
				// at this exact (kind, name, variant) was declared.
				if ( isset( $doc['settings']['dataViews'][ $kind ][ $name ][ $variant_id ] ) ) {
					continue;
				}
				$doc['settings']['dataViews'][ $kind ][ $name ][ $variant_id ] = $variant_entry;
			}
		}

		return $doc;
	}

	/**
	 * Warn when the resolved doc carries a non-empty top-level
	 * `viewConfigs` block.
	 *
	 * v2 admin.json's top-level `viewConfigs` block becomes dead data
	 * under v3 — the v3 resolver reads `settings.dataViews` (3-axis
	 * registry) instead. v2-shape shells lurking in plugin / site / role
	 * / user origins still serialize this block through the cascade, but
	 * nothing downstream consumes it. Admin-customized overrides drop
	 * silently on upgrade.
	 *
	 * Emits a one-shot `_doing_it_wrong` per request (the same resolved
	 * doc is read many times per page render — only the first detection
	 * matters). Removed in v3.1.0 alongside the v2-shape compatibility
	 * layer.
	 *
	 * Hooked at low priority on `wp_admin_shell_data` so we see the
	 * final resolved doc after every other filter has folded in. Does
	 * NOT translate the block — that's the `wp admin-shell migrate-shell`
	 * CLI's job (Phase 3d.2).
	 *
	 * @param array $doc Post-cascade resolved doc.
	 * @return array Same doc, unchanged.
	 */
	public static function warn_legacy_view_configs( $doc ) {
		if ( self::$emitted_view_configs_orphan_notice ) {
			return $doc;
		}
		if ( ! is_array( $doc ) ) {
			return $doc;
		}
		if ( empty( $doc['viewConfigs'] ) || ! is_array( $doc['viewConfigs'] ) ) {
			return $doc;
		}

		self::$emitted_view_configs_orphan_notice = true;
		_doing_it_wrong(
			'wp_admin_shell viewConfigs',
			esc_html__( 'The top-level `viewConfigs` block is a v2 shape that v3 no longer reads. Migrate to `settings.dataViews` via the `wp admin-shell migrate-shell` CLI (Phase 3d.2), or hand-merge each `(kind, name, variant|_default)` entry into the new path. The current `viewConfigs` block will be silently dropped at the v3.1 release.', 'wp-admin-shell' ),
			'v3.0.0'
		);
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
	 * Sanitize a variant id. Allows kebab-case + the leading underscore
	 * reserved for the `_default` token. Slashes are forbidden — the
	 * `dataViewRef: "kind/name/variant"` pointer uses `/` as the path
	 * separator, so allowing them inside a variant id would make refs
	 * ambiguous to parse.
	 *
	 * @param string $value
	 * @return string
	 */
	public static function sanitize_variant_segment( $value ) {
		return preg_replace( '#[^A-Za-z0-9_-]#', '', (string) $value );
	}

	/**
	 * Emit a single `_doing_it_wrong` per broken-chain identity per
	 * request. Keeps the resolver loud-on-misconfig but quiet-on-render.
	 *
	 * @param string $chain_id Unique chain identity (`kind/name/variant:reason`).
	 * @param string $message
	 */
	private static function warn_chain( $chain_id, $message ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		if ( ! empty( self::$warned_chains[ $chain_id ] ) ) {
			return;
		}
		self::$warned_chains[ $chain_id ] = true;
		_doing_it_wrong( __CLASS__, esc_html( $message ), 'v3.0.0' );
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
// Priority 6 — sequenced AFTER `WP_Admin_Shell_Menu_Items::bind_screens` at
// priority 5 so screens contributed by the menu-item shim are visible when
// dataView baselines attach. See `docs/upgrade-v2-to-v3.md` filter-ordering
// section.
add_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_Data_View_Config', 'inject_app_baselines' ), 6 );

// Low-priority orphan-`viewConfigs` migration warning. Runs after every
// other filter has folded in so we see the final resolved doc. One-shot
// per request via static guard. Removed in v3.1.0 alongside the v2-shape
// compatibility layer.
add_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_Data_View_Config', 'warn_legacy_view_configs' ), 999 );
