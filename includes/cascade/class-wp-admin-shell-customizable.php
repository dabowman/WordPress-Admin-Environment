<?php
/**
 * userCustomizable enforcement (spec §4.4.2).
 *
 * Each admin.json entry may declare:
 *   - `userCustomizable: true`        — every field on this entry is writable downstream
 *   - `userCustomizable: false`       — entry is locked; no fields writable
 *   - `userCustomizable: [path,...]`  — only listed dotted paths are writable
 *
 * The default (absent declaration) is *locked* — same posture as block
 * supports. This is enforced *before* the merge step so blocked fields
 * never enter the merged tree.
 *
 * `filter_writes` operates on a single entry. `filter_doc` walks a full
 * admin.json doc and applies the filter at the document, regions/applications
 * keyed-array level, and the styles tree (using `userCustomizable` declared
 * on the relevant ancestor node).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Customizable {

	const FIELD = 'userCustomizable';

	/**
	 * Filter a downstream-origin patch against an upstream entry's
	 * `userCustomizable` declaration. Returns only the writable subset.
	 */
	public static function filter_writes( $upstream_entry, $downstream_patch ) {
		if ( ! is_array( $downstream_patch ) ) {
			return array();
		}
		if ( ! is_array( $upstream_entry ) ) {
			return $downstream_patch;
		}

		$decl = $upstream_entry[ self::FIELD ] ?? null;

		if ( $decl === true ) {
			return $downstream_patch;
		}
		if ( $decl === null || $decl === false ) {
			return array();
		}
		if ( ! is_array( $decl ) ) {
			return array();
		}

		$paths = array_values( array_filter( $decl, 'is_string' ) );
		$out   = array();
		foreach ( $paths as $path ) {
			$value = self::dot_get( $downstream_patch, $path, self::SENTINEL );
			if ( $value !== self::SENTINEL ) {
				self::dot_set( $out, $path, $value );
			}
		}
		return $out;
	}

	/**
	 * Filter a downstream doc against an upstream doc — walks
	 * settings.applications / settings.regions per-entry, plus root-level
	 * `userCustomizable` for styles.
	 */
	public static function filter_doc( $upstream, $downstream ) {
		if ( ! is_array( $downstream ) ) {
			return array();
		}
		if ( ! is_array( $upstream ) ) {
			return $downstream;
		}

		$out = array();

		if ( isset( $downstream['settings'] ) && is_array( $downstream['settings'] ) ) {
			$out['settings'] = self::filter_settings(
				$upstream['settings'] ?? array(),
				$downstream['settings']
			);
		}

		if ( isset( $downstream['styles'] ) && is_array( $downstream['styles'] ) ) {
			$styles_decl = $upstream['styles'][ self::FIELD ] ?? null;
			$out['styles'] = self::filter_subtree(
				$upstream['styles'] ?? array(),
				$downstream['styles'],
				$styles_decl
			);
		}

		// Root-level scalars (name/title/description/version) are never
		// writable by a downstream origin — they identify the shell.

		return $out;
	}

	private static function filter_settings( $upstream, $downstream ) {
		$out = array();
		foreach ( array( 'applications', 'regions' ) as $coll ) {
			if ( ! isset( $downstream[ $coll ] ) ) {
				continue;
			}
			$key = $coll === 'regions' ? 'id' : 'id';
			$up_index = self::index_by_key( $upstream[ $coll ] ?? array(), $key );
			$out_list = array();

			$entries = $downstream[ $coll ];
			if ( is_array( $entries ) && WP_Admin_Shell_Merge::is_assoc( $entries ) ) {
				// Map form (regions:{id:body}) — convert to list-of-entries
				// for filtering, return as map.
				$map_form = true;
				$entries = array_map(
					fn( $id, $body ) => array_merge( array( $key => $id ), is_array( $body ) ? $body : array() ),
					array_keys( $entries ),
					array_values( $entries )
				);
			} else {
				$map_form = false;
			}

			foreach ( (array) $entries as $entry ) {
				if ( ! is_array( $entry ) || ! isset( $entry[ $key ] ) ) {
					continue;
				}
				$id   = $entry[ $key ];
				$ups  = $up_index[ $id ] ?? null;
				if ( ! $ups ) {
					// Downstream-introduced new entry — locked unless declared.
					continue;
				}
				$patch = $entry;
				unset( $patch[ $key ] );
				$writable = self::filter_writes( $ups, $patch );
				if ( ! empty( $writable ) ) {
					$out_list[] = array_merge( array( $key => $id ), $writable );
				}
			}

			if ( $map_form ) {
				$as_map = array();
				foreach ( $out_list as $row ) {
					$id = $row[ $key ];
					unset( $row[ $key ] );
					$as_map[ $id ] = $row;
				}
				$out[ $coll ] = $as_map;
			} else {
				$out[ $coll ] = $out_list;
			}
		}
		return $out;
	}

	private static function filter_subtree( $upstream, $downstream, $decl ) {
		if ( $decl === true ) {
			return $downstream;
		}
		if ( $decl === null || $decl === false ) {
			return array();
		}
		if ( ! is_array( $decl ) ) {
			return array();
		}
		$out = array();
		foreach ( $decl as $path ) {
			if ( ! is_string( $path ) ) {
				continue;
			}
			$value = self::dot_get( $downstream, $path, self::SENTINEL );
			if ( $value !== self::SENTINEL ) {
				self::dot_set( $out, $path, $value );
			}
		}
		return $out;
	}

	private static function index_by_key( $entries, $key ) {
		$out = array();
		if ( is_array( $entries ) && WP_Admin_Shell_Merge::is_assoc( $entries ) ) {
			foreach ( $entries as $id => $body ) {
				$row = is_array( $body ) ? $body : array();
				$row[ $key ] = $id;
				$out[ $id ]  = $row;
			}
			return $out;
		}
		foreach ( (array) $entries as $entry ) {
			if ( is_array( $entry ) && isset( $entry[ $key ] ) ) {
				$out[ $entry[ $key ] ] = $entry;
			}
		}
		return $out;
	}

	const SENTINEL = "\0__missing__\0";

	private static function dot_get( $arr, $path, $default ) {
		$parts = explode( '.', $path );
		$cur   = $arr;
		foreach ( $parts as $p ) {
			if ( ! is_array( $cur ) || ! array_key_exists( $p, $cur ) ) {
				return $default;
			}
			$cur = $cur[ $p ];
		}
		return $cur;
	}

	private static function dot_set( &$arr, $path, $value ) {
		$parts = explode( '.', $path );
		$cur   = &$arr;
		foreach ( $parts as $i => $p ) {
			if ( $i === count( $parts ) - 1 ) {
				$cur[ $p ] = $value;
				return;
			}
			if ( ! isset( $cur[ $p ] ) || ! is_array( $cur[ $p ] ) ) {
				$cur[ $p ] = array();
			}
			$cur = &$cur[ $p ];
		}
	}
}
