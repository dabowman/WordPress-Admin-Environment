<?php
/**
 * File origin loader — `wp-content/admin.json` override.
 *
 * The canonical workspace override. When a site author drops a valid
 * `admin.json` at `WP_CONTENT_DIR`, it loads into the cascade `plugin`
 * slot as a PARTIAL delta layered on the `wp-admin-default` baseline
 * (which occupies the `core` slot). This mirrors the theme.json model:
 * core ships a full default, the site overrides only the keys it cares
 * about. The field-aware merge folds the file's keys over the baseline,
 * so a one-key `{ "styles": { … } }` file retints the chrome while every
 * baseline screen / menu / command survives untouched.
 *
 * Validation is partial-permissive. PHP ships no JSON Schema validator
 * (schema conformance is covered JS-side by the Ajv `test:schema`
 * sweep), so the runtime gate is deliberately light: the decoded value
 * must be a JSON object (associative array), not a scalar or a JSON
 * array. Completeness — the presence of the schema-`required` top-level
 * keys (`version` / `$wpds` / `name` / `workspace` / `screens`) — is NOT
 * required here; the file is a delta, and completeness of the MERGED doc
 * is enforced post-resolution by `run-shape-tests.php`. A malformed file
 * degrades gracefully: the loader returns null, the resolver falls back
 * to the bare baseline, and a `_doing_it_wrong` notice fires under
 * `WP_DEBUG` so the author sees why.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Origin_File {

	/** Maximum override-file size. Structural config, not data — 1 MB is generous. */
	const MAX_BYTES = 1048576;

	/** @var array{loaded:bool,doc:?array} Per-request memo. */
	private static $memo = array(
		'loaded' => false,
		'doc'    => null,
	);

	/**
	 * Absolute path to the override file. Filterable so tests can point
	 * the loader at a fixture instead of the live content dir.
	 *
	 * @return string
	 */
	public static function path() {
		$default = trailingslashit( WP_CONTENT_DIR ) . 'admin.json';

		/**
		 * Filter the absolute path of the workspace override file.
		 *
		 * @param string $default `WP_CONTENT_DIR/admin.json`.
		 */
		return (string) apply_filters( 'wp_admin_shell_admin_json_path', $default );
	}

	/**
	 * Load + partial-permissively validate the override file. Returns the
	 * decoded doc (associative array) or null when the file is absent or
	 * invalid. Memoized per request.
	 *
	 * @return array|null
	 */
	public static function load() {
		if ( self::$memo['loaded'] ) {
			return self::$memo['doc'];
		}
		self::$memo['loaded'] = true;

		$path = self::path();
		if ( ! is_readable( $path ) ) {
			self::$memo['doc'] = null;
			return null;
		}

		// Size guard — the override is structural config, not a data file.
		// Caps the read + the json_decode work on a cache-cold admin request.
		$size = filesize( $path );
		if ( false !== $size && $size > self::MAX_BYTES ) {
			self::warn_invalid( $path );
			self::$memo['doc'] = null;
			return null;
		}

		$json = file_get_contents( $path );
		if ( $json === false || $json === '' ) {
			self::$memo['doc'] = null;
			return null;
		}

		$doc = json_decode( $json, true );
		if ( ! self::is_valid_partial( $doc ) ) {
			self::warn_invalid( $path );
			self::$memo['doc'] = null;
			return null;
		}

		self::$memo['doc'] = $doc;
		return $doc;
	}

	/**
	 * True when a valid override file is present.
	 *
	 * @return bool
	 */
	public static function exists_and_valid() {
		return self::load() !== null;
	}

	/**
	 * File mtime for the cache signal — 0 when absent.
	 *
	 * @return int
	 */
	public static function mtime() {
		$path = self::path();
		return is_readable( $path ) ? (int) filemtime( $path ) : 0;
	}

	/**
	 * Cache signal — `mtime:size`. Mixing in the file size disambiguates an
	 * edit made within the same filesystem second (mtime alone is
	 * 1s-resolution), so a malformed-then-fixed file invalidates promptly.
	 *
	 * @return string
	 */
	public static function signal() {
		$path = self::path();
		if ( ! is_readable( $path ) ) {
			return '0:0';
		}
		return (int) filemtime( $path ) . ':' . (int) filesize( $path );
	}

	/**
	 * Partial-permissive structural gate. The decoded value must be a
	 * non-empty JSON object (associative array). A scalar, a JSON array,
	 * or an empty object (`{}`, which decodes to `array()`) all fail —
	 * an empty override is treated as "no override", leaving the baseline
	 * to render alone.
	 *
	 * @param mixed $doc Decoded JSON.
	 * @return bool
	 */
	private static function is_valid_partial( $doc ) {
		if ( ! is_array( $doc ) || empty( $doc ) ) {
			return false;
		}
		return WP_Admin_Shell_Merge::is_assoc( $doc );
	}

	/**
	 * Emit a developer notice (WP_DEBUG only) explaining why the override
	 * file was ignored.
	 *
	 * @param string $path The file path.
	 */
	private static function warn_invalid( $path ) {
		if ( ! ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
			return;
		}
		$reason = json_last_error() !== JSON_ERROR_NONE
			? json_last_error_msg()
			: 'not a JSON object';
		_doing_it_wrong(
			'WP_Admin_Shell_Origin_File::load',
			sprintf(
				/* translators: 1: file path, 2: reason */
				esc_html__( 'Ignoring %1$s — %2$s. Falling back to the wp-admin-default baseline.', 'wp-admin-shell' ),
				esc_html( $path ),
				esc_html( $reason )
			),
			'0.1.0'
		);
	}

	/**
	 * Reset the per-request memo. Test-only.
	 */
	public static function reset_memo() {
		self::$memo = array(
			'loaded' => false,
			'doc'    => null,
		);
	}
}
