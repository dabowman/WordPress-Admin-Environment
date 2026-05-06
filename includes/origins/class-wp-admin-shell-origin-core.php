<?php
/**
 * Core origin loader.
 *
 * Provides the bundled defaults baseline for the cascade resolver. v2
 * admin.json shells (top-level `engine` + `regions` + `routes`) pass
 * through unchanged — the loader is just `file_get_contents` +
 * `json_decode` plus the empty fallback.
 *
 * v0 (MVP flat) inputs are no longer supported. Pre-v2 shells must be
 * migrated by hand (or via `wp admin-shell upgrade-config`) before
 * activation. The previous v0 → v1 partitioned synthesis is retired.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Origin_Core {

	const ENGINE_ID = 'core:default';

	public static function load( $shell_path ) {
		if ( ! file_exists( $shell_path ) ) {
			return self::empty_doc();
		}
		$json = file_get_contents( $shell_path );
		$raw  = json_decode( $json, true );
		if ( ! is_array( $raw ) ) {
			return self::empty_doc();
		}
		// Pre-v2 shapes (v0 flat / v1 partitioned) flow through too —
		// the runtime now rejects them at compose time. Returning the
		// raw doc keeps the cascade resolver's per-origin merge stable;
		// invalid docs fall through to no engine + no regions and the
		// kernel renders the fallback view.
		return $raw;
	}

	/**
	 * Backwards-compat shim. The cascade resolver previously called
	 * `normalize_v0` on every loaded doc. The v0 normalizer is gone;
	 * the loader returns docs as-is. Kept here as an alias so existing
	 * callers that import the class don't break.
	 */
	public static function normalize_v0( $raw ) {
		return is_array( $raw ) ? $raw : self::empty_doc();
	}

	/**
	 * Minimal v2 admin.json doc returned when the shell file is missing
	 * or malformed. Contains only what the kernel needs to render a
	 * non-empty fallback: an engine, a single content region with a
	 * route-key, and a default route. The kernel's "no route matched"
	 * placeholder copy then surfaces — better UX than a blank screen.
	 */
	public static function empty_doc() {
		return array(
			'$schema'  => '../docs/schemas/admin-v2.json',
			'version'  => 1,
			'$wpds'    => '6.9',
			'name'     => 'empty',
			'title'    => 'Empty',
			'engine'   => self::ENGINE_ID,
			'regions'  => array(
				'content' => array(
					'template' => 'core:main',
					'routing'  => array( 'route-key' => '_self' ),
				),
			),
			'routes'   => array(),
			'default-route' => '/',
			'styles'   => array(),
		);
	}
}
