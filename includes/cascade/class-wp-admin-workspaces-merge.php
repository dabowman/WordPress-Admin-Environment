<?php
/**
 * Field-aware merge engine for the cascade resolver.
 *
 * Mirrors `WP_Theme_JSON_Resolver`'s merge semantics adapted to workspace.json:
 *   - scalars         → replace
 *   - objects (assoc) → deep merge
 *   - keyed arrays    → merge by id/slug/name (override matches, append novel)
 *   - plain arrays    → replace
 *
 * `null` is treated as a TOMBSTONE marker (theme.json convention; v3 admin
 * schema spec §10). When a higher origin sets a key to `null`, the key is
 * REMOVED from the merged result regardless of nesting depth. For keyed
 * array entries the tombstone shape is an entry carrying the id field
 * plus `'__tombstone' => true` — this integrates with the existing
 * entry-as-record convention (same shape that already carries `__origin`
 * tags) and lets `merge_keyed_arrays` detect tombstones uniformly without
 * forcing callers to switch from list-form to assoc-form arrays.
 *
 * Tombstones don't propagate downward — they only nullify the specific
 * path they appear at. A later origin can resurrect a tombstoned key by
 * writing a non-null value at the same path.
 *
 * The merge engine ALSO carries a small origin-tag layer (`tag_origin` /
 * `merge_with_restrict`) used by the restrict-only enforcement step in
 * spec §4.4.1. Tags are stripped before the resolver returns the merged
 * config to consumers.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Merge {

	const ORIGIN_KEY = '__origin';

	/** Keys that identify entries in keyed arrays, in priority order. */
	const KEYED_ARRAY_KEYS = array( 'id', 'slug', 'name' );

	/**
	 * Plain field-aware merge — additive on keyed arrays. Use this when
	 * `over` is an UNTRUSTED consumer origin (role/user). It cannot
	 * remove base entries; it can only override fields on entries the
	 * base already declares plus append novel ids the upstream allows.
	 * Tombstones (`null` keys, `__tombstone: true` entries) are ignored
	 * with a WP_DEBUG `_doing_it_wrong` notice.
	 *
	 * `__origin === '__removed'` on a base entry still blocks any same-id
	 * override coming through this path — restrict-only is enforced
	 * regardless of additive vs authoritative semantics.
	 */
	public static function merge( $base, $over ) {
		return self::merge_internal( $base, $over, false, false );
	}

	/**
	 * Additive merge with tombstone authority. Use this for the `site`
	 * origin: behaviorally an additive override (does NOT drop base
	 * entries the override doesn't enumerate), but tombstones (null keys
	 * and `__tombstone: true` entries) ARE honored. Site is the
	 * top-of-trust-tier consumer origin per the v3 trust-tier rule
	 * (core/engine/plugin/site may add+remove; role/user shrink-only).
	 */
	public static function merge_with_tombstones( $base, $over ) {
		return self::merge_internal( $base, $over, false, true );
	}

	/**
	 * Authoritative field-aware merge — enumeration in `over` defines
	 * the new canonical list. Use this when `over` is a *trusted* origin
	 * (core/engine/plugin) declaring the workspace's structure. Anything in
	 * `base` not echoed by `over`'s keyed-array enumeration is
	 * tombstoned, so later additive merges from consumer origins cannot
	 * resurrect it. Tombstones are always honored.
	 *
	 * If `over` does not enumerate a particular keyed array at all (the
	 * key is absent from `over`), the base is preserved untouched — only
	 * arrays the trusted origin actively enumerates participate in the
	 * authoritative-removal pass.
	 */
	public static function merge_authoritative( $base, $over ) {
		return self::merge_internal( $base, $over, true, true );
	}

	private static function merge_internal( $base, $over, $authoritative, $tombstone_authority = null ) {
		// Back-compat: callers that don't pass tombstone_authority get the
		// historical coupling (tombstones honored iff authoritative).
		if ( $tombstone_authority === null ) {
			$tombstone_authority = (bool) $authoritative;
		}
		if ( ! is_array( $over ) ) {
			return $over === null ? $base : $over;
		}
		if ( ! is_array( $base ) ) {
			return $over;
		}
		// An empty override never replaces a populated base; leaves base
		// alone whether the base is assoc or list. (PHP cannot distinguish
		// `[]` from `{}` after json_decode, so an empty array is treated
		// as "no override declared at this depth".)
		if ( empty( $over ) ) {
			return $base;
		}

		$base_is_assoc = self::is_assoc( $base );
		$over_is_assoc = self::is_assoc( $over );

		if ( ! $base_is_assoc && ! $over_is_assoc ) {
			$key = self::detect_key_field( $base ) ?: self::detect_key_field( $over );
			if ( $key ) {
				return self::merge_keyed_arrays( $base, $over, $key, $authoritative, $tombstone_authority );
			}
			return $over; // plain array → replace
		}

		if ( $base_is_assoc !== $over_is_assoc ) {
			return $over;
		}

		$out = $base;
		foreach ( $over as $k => $v ) {
			// Null tombstone: REMOVE the key entirely from the merged
			// result. Mirrors theme.json convention; v3 spec §10. Removal
			// happens at the exact path the null appears — it does not
			// cascade further into the subtree.
			//
			// Gated behind `$tombstone_authority` so only trusted origins
			// (core/engine/plugin) and the site-level option can use
			// tombstones to drop keys. Untrusted consumer origins
			// (role/user) cannot delete entries the trusted baseline
			// ships; a `null` from them is a no-op with a WP_DEBUG notice
			// so the author sees their intent ignored rather than
			// silently dropped.
			if ( $v === null ) {
				if ( $tombstone_authority ) {
					unset( $out[ $k ] );
				} elseif ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					_doing_it_wrong(
						'WP_Admin_Workspaces_Merge::merge',
						sprintf(
							/* translators: %s: key name */
							esc_html__( 'Consumer-origin (role/user) null tombstone for key "%s" ignored — only trust-tier origins (core/engine/plugin/site) may drop keys via null. Author your override as an empty / replacement value instead.', 'wp-admin-workspaces' ),
							esc_html( (string) $k )
						),
						'v3.0'
					);
				}
				continue;
			}
			$out[ $k ] = self::merge_internal( $base[ $k ] ?? null, $v, $authoritative, $tombstone_authority );
		}
		return $out;
	}

	/**
	 * Tag every keyed-array entry in a doc with the origin it came from.
	 * Idempotent — re-tagging overwrites with the new origin.
	 */
	public static function tag_origin( $doc, $origin ) {
		if ( ! is_array( $doc ) ) {
			return $doc;
		}
		if ( self::is_assoc( $doc ) ) {
			foreach ( $doc as $k => $v ) {
				$doc[ $k ] = self::tag_origin( $v, $origin );
			}
			return $doc;
		}
		// List form. If keyed, tag each entry. If plain, leave untouched.
		$key = self::detect_key_field( $doc );
		if ( ! $key ) {
			return $doc;
		}
		foreach ( $doc as $i => $entry ) {
			if ( is_array( $entry ) && ! isset( $entry[ self::ORIGIN_KEY ] ) ) {
				$entry[ self::ORIGIN_KEY ] = $origin;
			}
			$doc[ $i ] = self::tag_origin( $entry, $origin );
		}
		return $doc;
	}

	/**
	 * Back-compat alias for the authoritative merge. Older callers that
	 * imported `merge_with_restrict` continue to work; new code should
	 * use `merge_authoritative` for clarity.
	 */
	public static function merge_with_restrict( $base, $over ) {
		return self::merge_authoritative( $base, $over );
	}

	/**
	 * Strip origin tags from a (possibly merged) doc — call before
	 * delivering to JS or any consumer.
	 */
	public static function strip_origin_tags( $doc ) {
		if ( ! is_array( $doc ) ) {
			return $doc;
		}
		if ( self::is_assoc( $doc ) ) {
			$out = array();
			foreach ( $doc as $k => $v ) {
				if ( $k === self::ORIGIN_KEY ) {
					continue;
				}
				$out[ $k ] = self::strip_origin_tags( $v );
			}
			return $out;
		}
		return array_values( array_map( array( __CLASS__, 'strip_origin_tags' ), $doc ) );
	}

	// ── Internals ─────────────────────────────────────────────────────

	private static function merge_keyed_arrays( $base, $over, $key, $authoritative = false, $tombstone_authority = null ) {
		if ( $tombstone_authority === null ) {
			$tombstone_authority = (bool) $authoritative;
		}
		$over_index     = array();
		$over_order     = array();
		$over_tombstone = array(); // id => true when entry carries `__tombstone`
		foreach ( $over as $entry ) {
			if ( ! is_array( $entry ) || ! isset( $entry[ $key ] ) ) {
				continue;
			}
			$id                  = $entry[ $key ];
			$over_index[ $id ]   = $entry;
			$over_order[]        = $id;
			if ( ! empty( $entry['__tombstone'] ) ) {
				$over_tombstone[ $id ] = true;
			}
		}

		$result  = array();
		$emitted = array();

		// Pass 1: walk base order so existing entries stay in place.
		foreach ( $base as $entry ) {
			if ( ! is_array( $entry ) || ! isset( $entry[ $key ] ) ) {
				continue;
			}
			$id           = $entry[ $key ];
			$base_origin  = $entry[ self::ORIGIN_KEY ] ?? null;
			$is_tombstone = $base_origin === '__removed';

			if ( isset( $over_tombstone[ $id ] ) ) {
				// Higher origin tombstoned this entry — drop it from
				// the merged list entirely. (v3 spec §10.) The id is
				// still marked emitted so Pass 2 doesn't re-add the
				// tombstone marker itself.
				//
				// Gated behind `$tombstone_authority` for the same reason
				// as the null-key tombstone above: untrusted consumer
				// origins (role/user) cannot drop trusted-baseline
				// entries via `__tombstone: true`. Non-authoritative
				// attempts no-op with a WP_DEBUG notice.
				if ( $tombstone_authority ) {
					$emitted[ $id ] = true;
					continue;
				}
				if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
					_doing_it_wrong(
						'WP_Admin_Workspaces_Merge::merge_keyed_arrays',
						sprintf(
							/* translators: %s: entry id */
							esc_html__( 'Consumer-origin (role/user) __tombstone marker for entry "%s" ignored — only trust-tier origins (core/engine/plugin/site) may drop keyed-array entries.', 'wp-admin-workspaces' ),
							esc_html( (string) $id )
						),
						'v3.0'
					);
				}
				// Fall through — entry survives as if tombstone wasn't
				// declared. Pass 1 continues with the base entry intact.
				// Strip the marker off the over-entry first so the
				// merge_internal() below doesn't stamp a stray
				// `__tombstone: true` onto the surviving base entry
				// (it would otherwise propagate to JS).
				unset( $over_index[ $id ]['__tombstone'] );
			}

			if ( isset( $over_index[ $id ] ) ) {
				if ( $is_tombstone ) {
					// Restrict-only: tombstone refuses to be re-added by ANY origin.
					$result[]       = $entry;
					$emitted[ $id ] = true;
					continue;
				}
				$result[]       = self::merge_internal( $entry, $over_index[ $id ], $authoritative, $tombstone_authority );
				$emitted[ $id ] = true;
				continue;
			}

			// Not in over.
			if ( $authoritative ) {
				// Trusted-origin omission ⇒ removal. Tombstone so consumer origins can't resurrect.
				$result[] = array(
					$key             => $id,
					self::ORIGIN_KEY => '__removed',
				);
			} else {
				// Additive: keep base entry untouched.
				$result[] = $entry;
			}
			$emitted[ $id ] = true;
		}

		// Pass 2: append novel-in-over entries (skip tombstones — they
		// can't introduce new entries, only remove existing ones).
		foreach ( $over_order as $id ) {
			if ( isset( $emitted[ $id ] ) ) {
				continue;
			}
			if ( isset( $over_tombstone[ $id ] ) ) {
				continue;
			}
			$result[] = $over_index[ $id ];
		}

		// Pass 3: append non-keyed over entries (separators, etc.).
		foreach ( $over as $entry ) {
			if ( is_array( $entry ) && isset( $entry[ $key ] ) ) {
				continue;
			}
			$result[] = $entry;
		}

		return $result;
	}

	private static function detect_key_field( $list ) {
		if ( ! is_array( $list ) || empty( $list ) ) {
			return null;
		}
		$first = reset( $list );
		if ( ! is_array( $first ) ) {
			return null;
		}
		foreach ( self::KEYED_ARRAY_KEYS as $candidate ) {
			if ( array_key_exists( $candidate, $first ) ) {
				return $candidate;
			}
		}
		return null;
	}

	public static function is_assoc( $arr ) {
		if ( ! is_array( $arr ) || empty( $arr ) ) {
			return false;
		}
		return array_keys( $arr ) !== range( 0, count( $arr ) - 1 );
	}
}
