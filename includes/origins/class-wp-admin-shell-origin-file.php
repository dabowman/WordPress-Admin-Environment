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
 * Trust tier (intended). The override lands in the `plugin` slot — a
 * TRUSTED origin merged via `merge_authoritative`, bypassing the
 * `Customizable` deny-list + `Permissions` shrink-only enforcement that
 * gate the consumer origins (site/role/user). So the file may add+remove
 * baseline screens (null tombstones), grow `screens[].permissions`, and
 * change `workspace.engine` — the same authority as the bundled plugin.
 * That is correct: writing `wp-content/admin.json` requires filesystem
 * access, which already implies running arbitrary plugin code, so there's
 * no privilege boundary to defend here. See spec §19.
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
		// Force a fresh stat — the realpath cache can lie when the file was
		// removed between requests (PHP keeps a cached "exists + readable"
		// entry that survives until the next clearstatcache, and some Docker
		// bind-mount setups are flaky enough that even is_readable() returns
		// the stale answer). is_file() blocks dir paths the filter might
		// return.
		clearstatcache( true, $path );
		if ( ! is_readable( $path ) || ! is_file( $path ) ) {
			self::$memo['doc'] = null;
			return null;
		}

		// Size guard — the override is structural config, not a data file.
		// Caps the read + the json_decode work on a cache-cold admin request.
		// `@`-suppressed because we already handle a false return; without
		// it, a race between the readability check and the stat would leak
		// a `filesize(): stat failed` warning to output.
		$size = @filesize( $path );
		if ( false === $size ) {
			self::$memo['doc'] = null;
			return null;
		}
		if ( $size > self::MAX_BYTES ) {
			self::warn_invalid( $path );
			self::$memo['doc'] = null;
			return null;
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged -- handled below; suppression keeps a stat-race from emitting "Failed to open stream".
		$json = @file_get_contents( $path );
		if ( false === $json || '' === $json ) {
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
		clearstatcache( true, $path );
		if ( ! is_readable( $path ) || ! is_file( $path ) ) {
			return 0;
		}
		$mtime = @filemtime( $path );
		return false !== $mtime ? (int) $mtime : 0;
	}

	/**
	 * Cache signal — `mtime:size`. Mixing in the size catches the common
	 * size-changing edit that lands in the same filesystem second (mtime is
	 * 1s-resolution). An equal-byte-length edit within the same second still
	 * shares a signal and ages out via the cache TTL rather than
	 * invalidating immediately — acceptable; a per-request content hash
	 * would cost a full read on every admin page.
	 *
	 * @return string
	 */
	public static function signal() {
		$path = self::path();
		clearstatcache( true, $path );
		if ( ! is_readable( $path ) || ! is_file( $path ) ) {
			return '0:0';
		}
		$mtime = @filemtime( $path );
		$size  = @filesize( $path );
		if ( false === $mtime || false === $size ) {
			return '0:0';
		}
		return (int) $mtime . ':' . (int) $size;
	}

	/**
	 * Partial-permissive structural gate. The decoded value must be a
	 * non-empty JSON object (associative array); a scalar, a JSON array, or
	 * an empty object (`{}`) all fail — an empty override is "no override".
	 *
	 * PHP ships no JSON-Schema validator (schema conformance is the JS-side
	 * Ajv `test:schema` sweep), so this is a light structural sanity check,
	 * not full validation: any present known top-level block must be the
	 * right container type (object), so a grossly malformed file (e.g.
	 * `"screens": "oops"`) falls back to the baseline instead of corrupting
	 * the merged tree. Per-field completeness is still enforced post-merge
	 * by run-shape-tests.php.
	 *
	 * @param mixed $doc Decoded JSON.
	 * @return bool
	 */
	private static function is_valid_partial( $doc ) {
		if ( ! is_array( $doc ) || empty( $doc ) || ! WP_Admin_Shell_Merge::is_assoc( $doc ) ) {
			return false;
		}
		// Known object-shaped top-level blocks must be objects (assoc arrays)
		// when present. `preload` / `routes` are lists; `version` etc. are
		// scalars — not checked here. A non-empty JSON array (`"screens": []`
		// with entries, or `"screens": [1,2]`) is also rejected: `is_array` is
		// true for lists, so a scalar check alone lets a list-shaped block
		// through to `merge_authoritative` against the assoc baseline. An empty
		// array (`[]`) is ambiguous with `{}` and harmless, so it's allowed.
		foreach ( array( 'workspace', 'settings', 'screens', 'menu', 'commands', 'styles' ) as $block ) {
			if ( ! isset( $doc[ $block ] ) ) {
				continue;
			}
			if ( ! is_array( $doc[ $block ] ) ) {
				return false;
			}
			if ( ! empty( $doc[ $block ] ) && ! WP_Admin_Shell_Merge::is_assoc( $doc[ $block ] ) ) {
				return false;
			}
		}
		return true;
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
