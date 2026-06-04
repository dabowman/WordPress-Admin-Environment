<?php
/**
 * Core origin loader.
 *
 * Provides the bundled defaults baseline for the cascade resolver. The
 * loader is just `file_get_contents` + `json_decode` plus the empty
 * fallback returned when the shell file is missing or malformed.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Origin_Core {

	const ENGINE_ID = 'core:default';

	/**
	 * Slug of the shipped default baseline. This is the admin.json that
	 * fills the cascade `core` slot when a `wp-content/admin.json`
	 * override file is present — the file then layers over it as a
	 * partial delta (theme.json model). The file still lives in `shells/`
	 * for back-compat (the option-driven selector + the shape-test sweep
	 * still reference it there); only its cascade ROLE changed.
	 */
	const BASELINE_SLUG = 'wp-admin-default';

	/**
	 * Load the shipped default baseline (`shells/wp-admin-default.json`).
	 * Falls back to {@see empty_doc()} when the file is missing/malformed.
	 *
	 * @return array
	 */
	public static function load_baseline() {
		$base = defined( 'WP_ADMIN_WORKSPACES_PATH' ) ? WP_ADMIN_WORKSPACES_PATH : '';
		return self::load( $base . 'shells/' . self::BASELINE_SLUG . '.json' );
	}

	public static function load( $shell_path ) {
		if ( ! file_exists( $shell_path ) ) {
			return self::empty_doc();
		}
		$json = file_get_contents( $shell_path );
		$raw  = json_decode( $json, true );
		if ( ! is_array( $raw ) ) {
			return self::empty_doc();
		}
		return $raw;
	}

	/**
	 * Minimal v3 admin.json doc returned when the shell file is missing
	 * or malformed. Carries just what the kernel needs to render a
	 * non-empty fallback: an engine, a default screen, and one screen at
	 * `/`. The kernel synthesizes the region tree + routes from these.
	 */
	public static function empty_doc() {
		return array(
			'$schema'   => '../docs/schemas/admin.json',
			'version'   => 3,
			'$wpds'     => '6.9',
			'name'      => 'empty',
			'title'     => 'Empty',
			'workspace' => array(
				'engine'         => self::ENGINE_ID,
				'default-screen' => 'home',
			),
			'screens'   => array(
				'home' => array(
					'label' => 'Home',
					'path'  => '/',
					'app'   => 'core:dashboard-host',
				),
			),
			'styles'    => array(),
		);
	}
}
