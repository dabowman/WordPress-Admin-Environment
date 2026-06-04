<?php
/**
 * Data-field collections registry.
 *
 * Plugins register named field bundles bound to an entity `(kind, name)`
 * pair via `wp_admin_workspaces_register_data_field_collection()`. The registry
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
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Data_Field_Collections {

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
				'wp_admin_workspaces_data_field_collection_invalid_id',
				__( 'Data field collection id must be a non-empty string.', 'wp-admin-workspaces' )
			);
		}
		if ( ! is_string( $kind ) || $kind === '' ) {
			return new WP_Error(
				'wp_admin_workspaces_data_field_collection_invalid_kind',
				__( 'Data field collection kind must be a non-empty string.', 'wp-admin-workspaces' )
			);
		}
		if ( $name !== null && ( ! is_string( $name ) || $name === '' ) ) {
			return new WP_Error(
				'wp_admin_workspaces_data_field_collection_invalid_name',
				__( 'Data field collection name must be a non-empty string or null (universal).', 'wp-admin-workspaces' )
			);
		}
		if ( ! is_array( $fields ) ) {
			return new WP_Error(
				'wp_admin_workspaces_data_field_collection_invalid_fields',
				__( 'Data field collection fields must be an array.', 'wp-admin-workspaces' )
			);
		}
		if ( isset( self::$registry[ $id ] ) ) {
			return new WP_Error(
				'wp_admin_workspaces_data_field_collection_duplicate_id',
				/* translators: %s: collection id */
				sprintf( __( 'Data field collection %s is already registered. Use a different id.', 'wp-admin-workspaces' ), $id )
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
					'wp_admin_workspaces_data_field_collection_invalid_module',
					__( 'fieldsModule must be a non-empty string or omitted.', 'wp-admin-workspaces' )
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
	}

	/**
	 * Sanitize a kind/name segment — preserves camelCase, drops everything
	 * outside `[A-Za-z0-9_-]`.
	 *
	 * @param string $value
	 * @return string
	 */
	public static function sanitize_segment( $value ) {
		return preg_replace( '/[^A-Za-z0-9_-]/', '', $value );
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
			__( 'Data field collection %1$s declared fieldsModule "%2$s". The shell does not resolve fieldsModule in this release; the value is reserved for future native script-modules support.', 'wp-admin-workspaces' ),
			$id,
			$module
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

/**
 * Public API — register a data-field collection.
 *
 * @param string      $id            Collection id.
 * @param string      $kind          Entity kind.
 * @param string|null $name          Entity name or null (universal).
 * @param array       $fields        Field descriptors.
 * @param string|null $fields_module Optional, reserved.
 * @return string|WP_Error
 */
function wp_admin_workspaces_register_data_field_collection( $id, $kind, $name, $fields, $fields_module = null ) {
	return WP_Admin_Workspaces_Data_Field_Collections::register( $id, $kind, $name, $fields, $fields_module );
}

/**
 * Cascade contribution — registered collections enter the resolver
 * through the `plugin` origin so site/role/user overrides can extend
 * or override via admin.json's `settings.dataFields` block. Runs at
 * filter priority 5 so plugin authors using
 * add_filter('wp_admin_workspaces_data_plugin', ...) directly win over
 * programmatic registrations (matches the convention for
 * shell_register_app / register_engine).
 */
add_filter( 'wp_admin_workspaces_data_plugin', function ( $doc ) {
	$collections = WP_Admin_Workspaces_Data_Field_Collections::all();
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

// Registry state lives in static class memory — invisible to the
// default cache-signal map. Hook into the cache layer's filter so a
// field-collection registration delta forces a fresh resolver run cross-request.
add_filter( 'wp_admin_workspaces_cache_signals', function ( $signals ) {
	$registry = WP_Admin_Workspaces_Data_Field_Collections::all();
	if ( ! empty( $registry ) ) {
		$signals['data_field_collections'] = md5( wp_json_encode( $registry ) );
	}
	return $signals;
} );
