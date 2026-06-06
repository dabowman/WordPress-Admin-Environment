<?php
/**
 * Shared low-level helpers used across the cascade + tokens engines.
 *
 * Deliberately dependency-free and side-effect-free so it can load
 * before any other plugin class (it is required first in the bootstrap
 * order). Keep this class a thin home for genuinely shared primitives —
 * anything domain-specific belongs with its subsystem, not here.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Util {

	/**
	 * True when `$arr` is a non-empty associative array (has at least one
	 * non-sequential / string key).
	 *
	 * This is the canonical implementation. An EMPTY array returns `false`
	 * here — PHP cannot distinguish `[]` from `{}` after `json_decode`, and
	 * the merge/tokens cascades treat an empty array as "no override at this
	 * depth" rather than an empty object. Callers that need the opposite
	 * empty-is-assoc convention (e.g. `WP_Admin_Workspaces_Modes`, which lets
	 * a child populate an empty parent) keep their own local helper on
	 * purpose — do not fold those into this one.
	 *
	 * @param mixed $arr Value to test.
	 * @return bool
	 */
	public static function is_assoc( $arr ) {
		if ( ! is_array( $arr ) || empty( $arr ) ) {
			return false;
		}
		return array_keys( $arr ) !== range( 0, count( $arr ) - 1 );
	}
}
