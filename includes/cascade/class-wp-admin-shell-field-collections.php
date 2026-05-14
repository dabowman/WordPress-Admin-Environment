<?php
/**
 * Field-collections registry.
 *
 * Plugins register named field bundles bound to an entity `(kind, name)`
 * pair via `wp_admin_shell_register_field_collection()`. The registry
 * contributes to the cascade through the synthetic `plugin` origin so
 * site/role/user overrides can extend or replace collections via the
 * same admin.json `fieldCollections` block.
 *
 * Schema: see `docs/schemas/admin-v2.json#/$defs/fieldCollection`.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Field_Collections {

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
	 * @param array       $fields        Field descriptors. See `viewConfigField` $def.
	 * @param string|null $fields_module Reserved. Native ESM script-module handle. Not resolved in C2.
	 *
	 * @return string|WP_Error Collection id on success, WP_Error on failure.
	 */
	public static function register( $id, $kind, $name, $fields, $fields_module = null ) {
		if ( ! is_string( $id ) || $id === '' ) {
			return new WP_Error(
				'wp_admin_shell_field_collection_invalid_id',
				__( 'Field collection id must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( ! is_string( $kind ) || $kind === '' ) {
			return new WP_Error(
				'wp_admin_shell_field_collection_invalid_kind',
				__( 'Field collection kind must be a non-empty string.', 'wp-admin-shell' )
			);
		}
		if ( $name !== null && ( ! is_string( $name ) || $name === '' ) ) {
			return new WP_Error(
				'wp_admin_shell_field_collection_invalid_name',
				__( 'Field collection name must be a non-empty string or null (universal).', 'wp-admin-shell' )
			);
		}
		if ( ! is_array( $fields ) ) {
			return new WP_Error(
				'wp_admin_shell_field_collection_invalid_fields',
				__( 'Field collection fields must be an array.', 'wp-admin-shell' )
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
					'wp_admin_shell_field_collection_invalid_module',
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
	 * win when both an exact and a universal (`name === null`) entry are
	 * registered for the same kind. Same-id duplicates impossible — the
	 * registry rejects them on `register()`.
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
	 * Sanitize a variant segment. Same as kind/name but allows slash
	 * for namespacing.
	 *
	 * @param string $value
	 * @return string
	 */
	public static function sanitize_variant( $value ) {
		return preg_replace( '#[^A-Za-z0-9_/-]#', '', $value );
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
			__( 'Field collection %1$s declared fieldsModule "%2$s". The shell does not resolve fieldsModule in this release; the value is reserved for future native script-modules support.', 'wp-admin-shell' ),
			$id,
			$module
		);
		trigger_error( esc_html( $message ), E_USER_NOTICE );
	}
}

/**
 * Public API — spec §13 #8.
 *
 * @param string      $id            Collection id.
 * @param string      $kind          Entity kind.
 * @param string|null $name          Entity name or null (universal).
 * @param array       $fields        Field descriptors.
 * @param string|null $fields_module Optional, reserved.
 * @return string|WP_Error
 */
function wp_admin_shell_register_field_collection( $id, $kind, $name, $fields, $fields_module = null ) {
	return WP_Admin_Shell_Field_Collections::register( $id, $kind, $name, $fields, $fields_module );
}

/**
 * Cascade contribution — registered collections enter the resolver
 * through the `plugin` origin so site/role/user overrides can extend
 * or override via admin.json. Runs at filter priority 5 so plugin
 * authors using add_filter('wp_admin_shell_data_plugin', ...) directly
 * win over programmatic registrations (matches the convention for
 * shell_register_app / register_engine).
 */
add_filter( 'wp_admin_shell_data_plugin', function ( $doc ) {
	$collections = WP_Admin_Shell_Field_Collections::all();
	if ( empty( $collections ) ) {
		return $doc;
	}
	if ( ! isset( $doc['fieldCollections'] ) || ! is_array( $doc['fieldCollections'] ) ) {
		$doc['fieldCollections'] = array();
	}
	foreach ( $collections as $id => $collection_doc ) {
		// admin.json declarations win — only inject when no inline
		// declaration claims the id.
		if ( ! isset( $doc['fieldCollections'][ $id ] ) ) {
			$doc['fieldCollections'][ $id ] = $collection_doc;
		}
	}
	return $doc;
}, 5 );
