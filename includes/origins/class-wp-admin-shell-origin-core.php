<?php
/**
 * Core origin loader.
 *
 * Provides the bundled defaults baseline for the cascade resolver. The
 * loader is just `file_get_contents` + `json_decode` plus the empty
 * fallback returned when the shell file is missing or malformed.
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
			'$schema'   => '../docs/schemas/admin-v3.json',
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
					'app'   => 'core:dashboard',
				),
			),
			'styles'    => array(),
		);
	}
}
