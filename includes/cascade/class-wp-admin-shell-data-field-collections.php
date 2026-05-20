<?php
/**
 * Data-field collections registry.
 *
 * Plugins register named field bundles bound to an entity `(kind, name)`
 * pair via `wp_admin_shell_register_data_field_collection()`. The registry
 * contributes to the cascade through the synthetic `plugin` origin so
 * site/role/user overrides can extend or replace collections via the
 * same admin.json `settings.dataFields` block.
 *
 * v3 rename: v2's top-level `fieldCollections` block moved under
 * `settings.dataFields`. The per-descriptor word `field` stays — matches
 * `@wordpress/dataviews` upstream. Class + function names gain the
 * `Data_` / `data_` prefix to match the surrounding restoration sweep.
 *
 * Schema: see `docs/schemas/admin-v3.json#/$defs/dataFieldCollection`.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Data_Field_Collections {

	/**
	 * Global registry: id → collection doc.
	 *
	 * @var array<string, array>
	 */
	private static $registry = array();

	/**
	 * Whether a `fieldsModule` warning has fired for a given id. C2
	 * phase: `fieldsModule` is reserved but not resolved. Warn once.
	 *
	 * @var array<string, bool>
	 */
	private static $warned_modules = array();

	/**
	 * Whether the legacy-function deprecation notice has fired this
	 * request. Avoid spamming WP_DEBUG when a plugin calls the legacy
	 * shim repeatedly.
	 *
	 * @var bool
	 */
	private static $legacy_warned = false;

	/**
	 * Register a field collection.
	 *
	 * @param string      $id            Collection id (slash-namespacing allowed, e.g. `core/post-fields`).
	 * @param string      $kind          Entity kind (`postType`, `root`, `taxonomy`).
	 * @param string|null $name          Entity name. `null` = universal across all names of the kind.
	 * @param array       $fields        Field descriptors. See `dataViewField` $def.
	 * @param string|null $fields_module Reserved. Native ESM script-module handle. Not resolved yet.
	 *
	 * @return string|WP_Error Collection id on success, WP_Error on failure.
	 */
	public static function register( $id, $kind, $name, $fields, $fields_module = null ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return new WP_Error(
				'wp_admin_shell_data_field_collection_invalid_id',
				__( 'Data field collection id must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( ! is_string( $kind ) || $kind === '' ) {
			return new WP_Error(
				'wp_admin_shell_data_field_collection_invalid_kind',
				__( 'Data field collection kind must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( $name !== null && ( ! is_string( $name ) || $name === '' ) ) {
			return new WP_Error(
				'wp_admin_shell_data_field_collection_invalid_name',
				__( 'Data field collection name must be a non-empty string or null (universal).', 'wp-admin-shell' )
			);
		}
		if ( ! is_array( $fields ) ) {
			return new WP_Error(
				'wp_admin_shell_data_field_collection_invalid_fields',
				__( 'Data field collection fields must be an array.', 'wp-admin-shell' )
			);
		}
		if ( isset( self::$registry[ $id ] ) ) {
			return new WP_Error(
				'wp_admin_shell_data_field_collection_duplicate_id',
				/* translators: %s: collection id */
				sprintf( __( 'Data field collection %s is already registered. Use a different id.', 'wp-admin-shell' ), $id )
			);
		}

		$doc = array(
			'kind'   => self::sanitize_segment( $kind ),
			'name'   => $name === null ? null : self::sanitize_segment( $name ),
			'fields' => $fields,
		);

		if ( $fields_module !== null ) {
			if ( ! is_string( $fields_module ) || $fields_module === '' ) {
				return new WP_Error(
					'wp_admin_shell_data_field_collection_invalid_module',
					__( 'fieldsModule must be a non-empty string or omitted.', 'wp-admin-shell' )
				);
			}
			$doc['fieldsModule'] = $fields_module;
			self::maybe_warn_module( $id, $fields_module );
		}

		self::$registry[ $id ] = $doc;
		return $id;
	}

	/**
	 * Read the full registry. Used by the resolver pass that injects
	 * registered collections into the `plugin` origin.
	 *
	 * @return array<string, array>
	 */
	public static function all() {
		return self::$registry;
	}

	/**
	 * Find every collection matching `(kind, name)`. Exact-name matches
	 * are returned alongside universal (`name === null`) entries for the
	 * same kind. Same-id duplicates are impossible — `register()` rejects
	 * a second call with the same id.
	 *
	 * @param string $kind Entity kind.
	 * @param string $name Entity name.
	 * @return array<string, array> Map of id → collection doc.
	 */
	public static function find_for( $kind, $name ) {
		$out = array();
		foreach ( self::$registry as $id => $doc ) {
			if ( $doc['kind'] !== $kind ) {
				continue;
			}
			if ( $doc['name'] === null || $doc['name'] === $name ) {
				$out[ $id ] = $doc;
			}
		}
		return $out;
	}

	/**
	 * Look up a single collection by id.
	 *
	 * @param string $id Collection id.
	 * @return array|null
	 */
	public static function get( $id ) {
		return self::$registry[ $id ] ?? null;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$registry       = array();
		self::$warned_modules = array();
		self::$legacy_warned  = false;
	}

	/**
	 * Sanitize a kind/name segment. Mirrors CIAB:
	 * preserves camelCase, drops everything outside `[A-Za-z0-9_-]`.
	 *
	 * @param string $value
	 * @return string
	 */
	public static function sanitize_segment( $value ) {
		return preg_replace( '/[^A-Za-z0-9_-]/', '', $value );
	}

	/**
	 * Mark the legacy-function notice as having fired this request.
	 * Returns true the first time it's called per-request; false
	 * thereafter. Test-aware: `reset()` clears the flag too.
	 *
	 * @return bool True on first invocation, false on subsequent calls.
	 */
	public static function note_legacy_call() {
		if ( self::$legacy_warned ) {
			return false;
		}
		self::$legacy_warned = true;
		return true;
	}

	/**
	 * One-time dev warning that a registered fieldsModule is currently
	 * inert. C2 phase punts ESM script-module resolution; the schema
	 * reserves the field for forward compatibility.
	 */
	private static function maybe_warn_module( $id, $module ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		if ( ! empty( self::$warned_modules[ $id ] ) ) {
			return;
		}
		self::$warned_modules[ $id ] = true;
		// translators: 1: collection id, 2: module handle.
		$message = sprintf(
			/* translators: %1$s: collection id, %2$s: fieldsModule handle */
			__( 'Data field collection %1$s declared fieldsModule "%2$s". The shell does not resolve fieldsModule in this release; the value is reserved for future native script-modules support.', 'wp-admin-shell' ),
			$id,
			$module
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

/**
 * Public API — register a data-field collection.
 *
 * Renamed from v2's `wp_admin_shell_register_field_collection()` as part
 * of the v3 dataview-registry restoration. The legacy function name
 * survives below as a thin deprecation wrapper for one release cycle.
 *
 * @param string      $id            Collection id.
 * @param string      $kind          Entity kind.
 * @param string|null $name          Entity name or null (universal).
 * @param array       $fields        Field descriptors.
 * @param string|null $fields_module Optional, reserved.
 * @return string|WP_Error
 */
function wp_admin_shell_register_data_field_collection( $id, $kind, $name, $fields, $fields_module = null ) {
	return WP_Admin_Shell_Data_Field_Collections::register( $id, $kind, $name, $fields, $fields_module );
}

/**
 * Legacy alias — deprecated in favor of
 * `wp_admin_shell_register_data_field_collection()`. Emits a one-time
 * `_doing_it_wrong` notice per request when `WP_DEBUG` is on; otherwise
 * silently forwards.
 *
 * @param string      $id            Collection id.
 * @param string      $kind          Entity kind.
 * @param string|null $name          Entity name or null (universal).
 * @param array       $fields        Field descriptors.
 * @param string|null $fields_module Optional, reserved.
 * @return string|WP_Error
 */
function wp_admin_shell_register_field_collection( $id, $kind, $name, $fields, $fields_module = null ) {
	if ( defined( 'WP_DEBUG' ) && WP_DEBUG && WP_Admin_Shell_Data_Field_Collections::note_legacy_call() ) {
		_doing_it_wrong(
			'wp_admin_shell_register_field_collection',
			esc_html__( 'Use wp_admin_shell_register_data_field_collection() instead. The legacy name is preserved for one release cycle as part of the v3 dataview-registry rename.', 'wp-admin-shell' ),
			'v3.0.0'
		);
	}
	return wp_admin_shell_register_data_field_collection( $id, $kind, $name, $fields, $fields_module );
}

/**
 * Cascade contribution — registered collections enter the resolver
 * through the `plugin` origin so site/role/user overrides can extend
 * or override via admin.json's `settings.dataFields` block. Runs at
 * filter priority 5 so plugin authors using
 * add_filter('wp_admin_shell_data_plugin', ...) directly win over
 * programmatic registrations (matches the convention for
 * shell_register_app / register_engine).
 */
add_filter( 'wp_admin_shell_data_plugin', function ( $doc ) {
	$collections = WP_Admin_Shell_Data_Field_Collections::all();
	if ( empty( $collections ) ) {
		return $doc;
	}
	if ( ! isset( $doc['settings'] ) || ! is_array( $doc['settings'] ) ) {
		$doc['settings'] = array();
	}
	if ( ! isset( $doc['settings']['dataFields'] ) || ! is_array( $doc['settings']['dataFields'] ) ) {
		$doc['settings']['dataFields'] = array();
	}
	foreach ( $collections as $id => $collection_doc ) {
		// admin.json declarations win — only inject when no inline
		// declaration claims the id.
		if ( ! isset( $doc['settings']['dataFields'][ $id ] ) ) {
			$doc['settings']['dataFields'][ $id ] = $collection_doc;
		}
	}
	return $doc;
}, 5 );
