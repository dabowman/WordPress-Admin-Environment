<?php
/**
 * PHP-side structural validator for v2 manifests (V2.M1 task 4).
 *
 * Rich JSON Schema 2020-12 validation runs at authoring time via Ajv
 * (`npm run test:schema`). PHP performs only the structural checks
 * required to safely register a manifest: required fields are present,
 * types match, identifier patterns parse. Anything richer (conditional
 * rules, allOf branches, allowlist enumerations beyond a small set) is
 * deferred to the JS authoring pipeline — pulling a full JSON Schema
 * library into PHP would mean introducing Composer for one feature.
 *
 * Validation results are cached by (path, mtime) via the existing
 * cascade cache layer so repeated registrations during a request hit
 * the object cache instead of re-parsing JSON.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Manifest_Validator {

	const NAMESPACE_PATTERN = '/^(core:[a-z][a-z0-9]*(-[a-z0-9]+)*|plugin:[a-z][a-z0-9-]*\/[a-z][a-z0-9]*(-[a-z0-9]+)*)$/';
	const SLUG_PATTERN      = '/^[a-z][a-z0-9-]*$/';
	const ARRANGEMENT_PATTERN = '/^[a-z][a-z0-9-]*$/';

	const CACHE_GROUP = 'wp_admin_shell_manifests';

	/**
	 * Required fields per manifest type. Each entry: field => spec.
	 *
	 *   spec.type:    'string' | 'integer' | 'array' | 'object'
	 *   spec.pattern: optional regex for string fields
	 *   spec.min:     optional integer minimum (for integers)
	 *   spec.min_props: optional minimum object property count
	 */
	const APP_SCHEMA = array(
		'id'      => array( 'type' => 'string', 'pattern' => self::NAMESPACE_PATTERN ),
		'version' => array( 'type' => 'integer', 'min' => 1 ),
		'title'   => array( 'type' => 'string' ),
		'role'    => array( 'type' => 'string' ),
		'script'  => array( 'type' => 'string' ),
	);

	const ENGINE_SCHEMA = array(
		'id'                  => array( 'type' => 'string', 'pattern' => self::NAMESPACE_PATTERN ),
		'version'             => array( 'type' => 'integer', 'min' => 1 ),
		'title'               => array( 'type' => 'string' ),
		'specializes-roles'   => array( 'type' => 'array' ),
		'honored-platform'    => array( 'type' => 'array' ),
		'templates'           => array( 'type' => 'object', 'min_props' => 1 ),
		'default-arrangement' => array( 'type' => 'string', 'pattern' => self::ARRANGEMENT_PATTERN ),
		'script'              => array( 'type' => 'string' ),
	);

	/**
	 * Validate a manifest array against a schema constant.
	 *
	 * @param array  $manifest The decoded manifest.
	 * @param string $kind     'app' | 'engine'.
	 *
	 * @return array { 'valid' => bool, 'errors' => string[] }
	 */
	public static function validate( $manifest, $kind ) {
		$errors = array();

		if ( ! is_array( $manifest ) ) {
			return array(
				'valid'  => false,
				'errors' => array( 'manifest must be an associative array' ),
			);
		}

		$schema = self::schema_for( $kind );
		if ( null === $schema ) {
			return array(
				'valid'  => false,
				'errors' => array( "unknown manifest kind: $kind" ),
			);
		}

		foreach ( $schema as $field => $spec ) {
			if ( ! array_key_exists( $field, $manifest ) ) {
				$errors[] = "missing required field: $field";
				continue;
			}
			$value = $manifest[ $field ];
			$err   = self::check_field( $field, $value, $spec );
			if ( $err ) {
				$errors[] = $err;
			}
		}

		// Conditional: app's `block-navigation-on-dirty` requires `dirty-state`.
		if ( 'app' === $kind ) {
			$platform = $manifest['platform'] ?? array();
			if (
				is_array( $platform )
				&& ( $platform['block-navigation-on-dirty'] ?? false )
				&& ! ( $platform['dirty-state'] ?? false )
			) {
				$errors[] = 'platform.block-navigation-on-dirty requires platform.dirty-state';
			}
		}

		return array(
			'valid'  => empty( $errors ),
			'errors' => $errors,
		);
	}

	/**
	 * Validate a manifest file by path. Reads JSON, validates, caches by (path, mtime).
	 *
	 * @param string $path Absolute path to a `app.json` or `engine.json`.
	 * @param string $kind 'app' | 'engine'.
	 *
	 * @return array { 'valid' => bool, 'errors' => string[], 'manifest' => array|null }
	 */
	public static function validate_file( $path, $kind ) {
		if ( ! file_exists( $path ) || ! is_readable( $path ) ) {
			return array(
				'valid'    => false,
				'errors'   => array( "file not found or unreadable: $path" ),
				'manifest' => null,
			);
		}

		$mtime     = filemtime( $path );
		$cache_key = self::cache_key( $path, $mtime, $kind );
		$cached    = wp_cache_get( $cache_key, self::CACHE_GROUP );
		if ( false !== $cached && is_array( $cached ) ) {
			return $cached;
		}

		$raw = file_get_contents( $path );
		if ( false === $raw ) {
			return array(
				'valid'    => false,
				'errors'   => array( "failed to read file: $path" ),
				'manifest' => null,
			);
		}

		$manifest = json_decode( $raw, true );
		if ( null === $manifest && JSON_ERROR_NONE !== json_last_error() ) {
			return array(
				'valid'    => false,
				'errors'   => array( "JSON parse error in $path: " . json_last_error_msg() ),
				'manifest' => null,
			);
		}

		$result             = self::validate( $manifest, $kind );
		$result['manifest'] = $manifest;

		wp_cache_set( $cache_key, $result, self::CACHE_GROUP );
		return $result;
	}

	private static function schema_for( $kind ) {
		switch ( $kind ) {
			case 'app':
				return self::APP_SCHEMA;
			case 'engine':
				return self::ENGINE_SCHEMA;
			default:
				return null;
		}
	}

	private static function check_field( $field, $value, $spec ) {
		$type = $spec['type'];

		switch ( $type ) {
			case 'string':
				if ( ! is_string( $value ) ) {
					return "$field must be a string, got " . gettype( $value );
				}
				if ( '' === $value ) {
					return "$field must be non-empty";
				}
				if ( isset( $spec['pattern'] ) && ! preg_match( $spec['pattern'], $value ) ) {
					return "$field does not match expected format: $value";
				}
				return null;

			case 'integer':
				if ( ! is_int( $value ) ) {
					return "$field must be an integer, got " . gettype( $value );
				}
				if ( isset( $spec['min'] ) && $value < $spec['min'] ) {
					return "$field must be at least {$spec['min']}, got $value";
				}
				return null;

			case 'array':
				if ( ! is_array( $value ) ) {
					return "$field must be an array, got " . gettype( $value );
				}
				// Sequential array vs associative — both pass `is_array` in PHP.
				return null;

			case 'object':
				if ( ! is_array( $value ) || self::is_sequential_array( $value ) ) {
					return "$field must be an object, got " . gettype( $value );
				}
				if ( isset( $spec['min_props'] ) && count( $value ) < $spec['min_props'] ) {
					return "$field must have at least {$spec['min_props']} properties, got " . count( $value );
				}
				return null;

			default:
				return "unknown spec type for $field: $type";
		}
	}

	private static function is_sequential_array( $arr ) {
		if ( empty( $arr ) ) {
			return false;
		}
		return array_keys( $arr ) === range( 0, count( $arr ) - 1 );
	}

	private static function cache_key( $path, $mtime, $kind ) {
		return $kind . ':' . md5( $path . '|' . $mtime );
	}
}
