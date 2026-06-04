<?php
/**
 * Per-request configSchema validation cache (plan §M2.8).
 *
 * Memoizes validation results by `(sourceId, sha1(configJson))` so a
 * given config blob is only validated once per request. v1 ships a
 * permissive default validator (every config is valid) because the
 * built-in sources don't yet declare `configSchema`. M4's app-source
 * landing adds real JSON Schema validators per source.
 *
 * Cross-request caching is intentionally absent: validation is cheap
 * once per request, and the resolver cache (§M2.7) already avoids
 * re-running the cascade across requests when nothing changed. Adding
 * a second cross-request layer here would invalidate on the same signal
 * the resolver cache invalidates on, with no additional benefit.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Config_Validator {

	/** @var array<string, array{ valid: bool, errors: string[] }> */
	private static $cache = array();

	/** @var callable[] keyed by source id */
	private static $validators = array();

	/**
	 * Register a validator callback for a source. Callback receives
	 * `($config, $schema)` and returns either true on success or an
	 * array of error strings.
	 */
	public static function register( $source_id, callable $validator ) {
		self::$validators[ $source_id ] = $validator;
	}

	/**
	 * Validate a config blob against the registered validator for a
	 * source id. Returns the cached result for repeat calls within the
	 * same request.
	 */
	public static function validate( $source_id, $config, $schema = null ) {
		$key = $source_id . '|' . sha1( wp_json_encode( $config ?? null ) );
		if ( isset( self::$cache[ $key ] ) ) {
			return self::$cache[ $key ];
		}

		$validator = self::$validators[ $source_id ] ?? null;
		if ( ! $validator || ! $schema ) {
			$result = array( 'valid' => true, 'errors' => array() );
		} else {
			$out = call_user_func( $validator, $config, $schema );
			if ( $out === true ) {
				$result = array( 'valid' => true, 'errors' => array() );
			} elseif ( is_array( $out ) ) {
				$result = array( 'valid' => empty( $out ), 'errors' => array_values( $out ) );
			} else {
				$result = array( 'valid' => false, 'errors' => array( 'Validator returned an unexpected value.' ) );
			}
		}

		self::$cache[ $key ] = $result;
		return $result;
	}

	public static function reset_cache() {
		self::$cache = array();
	}
}
