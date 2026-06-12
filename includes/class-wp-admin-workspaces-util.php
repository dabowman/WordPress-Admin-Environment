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

	/**
	 * Max recursion depth for patch merging / key counting. Pathological
	 * nested payloads (legitimate or adversarial) can't push past this,
	 * even though PHP's memory_limit would catch true exhaustion.
	 */
	const PATCH_MAX_DEPTH = 10;

	/**
	 * Deep-merge a partial patch onto a base tree.
	 *
	 * Shared by the `/user-prefs` REST transport and the customization
	 * abilities so both write paths have identical semantics. `null`
	 * handling is the one knob: the user slice treats `null` as "delete
	 * this stored key" (tombstones are a no-op at the user tier anyway, so
	 * a stored null is just noise), while the site slice must KEEP nulls —
	 * they are honored tombstones the cascade's `merge_with_tombstones()`
	 * consumes.
	 *
	 * At the depth cap the patch side replaces wholesale so the structure
	 * terminates predictably.
	 *
	 * @param mixed $base         Existing tree.
	 * @param mixed $patch        Partial patch.
	 * @param bool  $null_deletes True: null removes the key from the stored
	 *                            tree (user-prefs semantics). False: null is
	 *                            stored verbatim (site tombstone semantics).
	 * @param int   $depth        Current depth.
	 * @return mixed
	 */
	public static function deep_merge_patch( $base, $patch, $null_deletes = true, $depth = 0 ) {
		if ( $depth >= self::PATCH_MAX_DEPTH ) {
			return $patch;
		}
		if ( ! is_array( $base ) ) {
			return $patch;
		}
		if ( ! is_array( $patch ) ) {
			return $patch === null && $null_deletes ? $base : $patch;
		}
		$out = $base;
		foreach ( $patch as $k => $v ) {
			if ( $v === null ) {
				if ( $null_deletes ) {
					unset( $out[ $k ] );
				} else {
					$out[ $k ] = null;
				}
				continue;
			}
			$out[ $k ] = is_array( $v ) && is_array( $base[ $k ] ?? null )
				? self::deep_merge_patch( $base[ $k ], $v, $null_deletes, $depth + 1 )
				: $v;
		}
		return $out;
	}

	/**
	 * Count keys across a nested array, bounded by the merge depth so a
	 * pathological payload can't make the counter itself expensive.
	 *
	 * @param mixed $value     Decoded JSON value.
	 * @param int   $short_at  Stop counting once the total crosses this
	 *                         (caller only cares whether the cap was hit).
	 * @param int   $depth     Current depth.
	 * @return int
	 */
	public static function count_keys( $value, $short_at = PHP_INT_MAX, $depth = 0 ) {
		if ( ! is_array( $value ) || $depth >= self::PATCH_MAX_DEPTH ) {
			return 0;
		}
		$count = count( $value );
		foreach ( $value as $v ) {
			if ( is_array( $v ) ) {
				$count += self::count_keys( $v, $short_at, $depth + 1 );
				if ( $count > $short_at ) {
					return $count;
				}
			}
		}
		return $count;
	}
}
