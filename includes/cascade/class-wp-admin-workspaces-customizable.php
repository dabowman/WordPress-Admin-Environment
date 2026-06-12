<?php
/**
 * `customizable` enforcement (spec §4.4.2).
 *
 * Each workspace.json entry may declare:
 *   - `customizable: true`        — every field on this entry is writable downstream
 *   - `customizable: false`       — entry is locked; no fields writable
 *   - `customizable: [path,...]`  — only listed dotted paths are writable
 *
 * The default (absent declaration) is *locked* — same posture as block
 * supports. This is enforced *before* the merge step so blocked fields
 * never enter the merged tree.
 *
 * `filter_writes` operates on a single entry. `filter_doc` walks a full
 * workspace.json doc and applies the filter at the document, regions/applications
 * keyed-array level, the styles tree, and the v3 top-level blocks
 * (workspace / menu / screens / commands / preload / regions / routes).
 *
 * Trust tiers (per `docs/schema-sketch.md`):
 *   - `core` / `engine` / `plugin` / `site` — author the doc shape. Pass
 *     through verbatim. `customizable` is THEIR declaration about what
 *     downstream may touch; they are exempt.
 *   - `role` / `user` — consumer origins. Subject to per-field path
 *     allowlist enforcement on every v3 top-level block.
 *
 * Hardcoded deny-list. Consumer-origin writes to any of these paths are
 * rejected even if the upstream declares a matching `customizable` entry:
 *   - `screens.<id>.permissions` (the security gate)
 *   - `screens.<id>.app` (controls which app mounts)
 *   - `commands[].invoke` (the action target)
 *   - `engine` (the top-level runtime-engine field)
 *
 * Emergency bypass — undocumented. The `wp_admin_workspaces_customizable_bypass`
 * filter (default-off) short-circuits the entire per-field walker. Intended
 * as a dev-time "uh-oh" lever, NOT a long-term contract — production code
 * MUST NOT depend on it.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Customizable {

	const FIELD = 'customizable';

	/** Trust tiers that author the doc — exempt from per-field enforcement. */
	const TRUSTED_ORIGINS = array( 'core', 'engine', 'plugin', 'site' );

	/** Origins subject to per-field path-allowlist enforcement. */
	const CONSUMER_ORIGINS = array( 'role', 'user' );

	/**
	 * v3 top-level blocks gated by per-field enforcement on consumer origins.
	 *
	 * `default-screen` rides this list so the trusted `site` origin can set
	 * it (filter_doc rebuilds consumer/site docs from only the blocks named
	 * here — before it was listed, a site-origin `default-screen` was
	 * silently dropped, contradicting the documented "site may declare any
	 * block shape" trust-tier rule). Consumer origins (role/user) still
	 * can't touch it: it's a scalar at the top of the block, and
	 * `filter_v3_block` rejects scalar replacements from consumers outright.
	 */
	const V3_TOP_LEVEL_BLOCKS = array( 'menu', 'screens', 'commands', 'workspace', 'preload', 'regions', 'routes', 'default-screen' );

	/**
	 * Hardcoded deny patterns. Each pattern is a dotted path against the
	 * v3 doc; `*` matches any single segment (a single id), and trailing
	 * `**` is implicit (the prefix is the path, anything under it is
	 * denied). Order doesn't matter — every pattern is checked.
	 *
	 * These paths are NEVER writable from role / user origins, even with a
	 * matching `customizable` allowlist entry. The security gate
	 * (screens.<id>.permissions), the app mount target (screens.<id>.app),
	 * the command invoke target (commands.*.invoke), and the runtime
	 * engine (the top-level `engine` field) all sit here.
	 */
	const DENY_PATTERNS = array(
		'screens.*.permissions',
		// `**` = any depth: the menu is a recursive tree (nested `items`), so a
		// nav node's `permissions` can live at `menu.<id>.items.<id>.permissions`.
		// Deny at every depth so a consumer origin can't broaden nav-link
		// visibility (cosmetic — real gates hold via screens.*.permissions and
		// server-side enforcement — but visibility is still a leak).
		'menu.**.permissions',
		'screens.*.app',
		'commands.*.invoke',
		'engine',
	);

	/**
	 * Read the customizable declaration from an entry.
	 */
	private static function read_decl( $entry ) {
		if ( ! is_array( $entry ) ) {
			return null;
		}
		if ( array_key_exists( self::FIELD, $entry ) ) {
			return $entry[ self::FIELD ];
		}
		return null;
	}

	/**
	 * Filter a downstream-origin patch against an upstream entry's
	 * `customizable` declaration. Returns only the writable subset.
	 */
	public static function filter_writes( $upstream_entry, $downstream_patch ) {
		if ( ! is_array( $downstream_patch ) ) {
			return array();
		}
		if ( ! is_array( $upstream_entry ) ) {
			return $downstream_patch;
		}

		$decl = self::read_decl( $upstream_entry );

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
	 * `customizable` for styles, plus per-field enforcement on v3
	 * top-level blocks for consumer origins.
	 *
	 * @param array       $upstream    The merged upstream tree.
	 * @param array       $downstream  The single-origin doc to filter.
	 * @param string|null $origin      The origin name (`role` / `user` /
	 *                                 etc). When null, trust-tier behavior
	 *                                 is assumed (back-compat with tests
	 *                                 that called the 2-arg form).
	 */
	public static function filter_doc( $upstream, $downstream, $origin = null ) {
		if ( ! is_array( $downstream ) ) {
			return array();
		}
		if ( ! is_array( $upstream ) ) {
			return $downstream;
		}

		// Emergency bypass for dev-time only — production code MUST NOT
		// depend on this filter. Removed from documentation deliberately;
		// the only sane caller is an integration test exercising what
		// breaks when enforcement misfires.
		if ( apply_filters( 'wp_admin_workspaces_customizable_bypass', false ) ) {
			return $downstream;
		}

		$is_consumer = $origin !== null && in_array( $origin, self::CONSUMER_ORIGINS, true );

		$out = array();

		if ( isset( $downstream['settings'] ) && is_array( $downstream['settings'] ) ) {
			$out['settings'] = self::filter_settings(
				$upstream['settings'] ?? array(),
				$downstream['settings']
			);
		}

		if ( isset( $downstream['styles'] ) && is_array( $downstream['styles'] ) ) {
			$styles_decl = self::read_decl( $upstream['styles'] ?? array() );
			$out['styles'] = self::filter_subtree(
				$upstream['styles'] ?? array(),
				$downstream['styles'],
				$styles_decl
			);
		}

		// v3 top-level blocks. Trust-tier origins (core/engine/plugin/site)
		// author the doc — pass through verbatim. Consumer origins
		// (role/user) get the per-field walker: hardcoded deny-list rejects
		// security-critical paths; remaining fields require an explicit
		// `customizable` path-allowlist entry on the matching upstream
		// node (default-deny).
		foreach ( self::V3_TOP_LEVEL_BLOCKS as $block ) {
			if ( ! array_key_exists( $block, $downstream ) ) {
				continue;
			}
			if ( ! $is_consumer ) {
				$out[ $block ] = $downstream[ $block ];
				continue;
			}
			$filtered = self::filter_v3_block(
				$block,
				$upstream[ $block ] ?? null,
				$downstream[ $block ],
				(string) $origin
			);
			if ( $filtered !== self::SENTINEL ) {
				$out[ $block ] = $filtered;
			}
		}

		// Root-level scalars (name/title/description/version) are never
		// writable by a downstream origin — they identify the workspace.

		return $out;
	}

	/**
	 * Describe every path a CONSUMER origin (role/user) may write, given a
	 * resolved/merged doc. The inverse view of `filter_doc`: instead of
	 * filtering a patch, it reports the allowlist so a client (the
	 * customization abilities, the appearance-preferences UI) can discover
	 * what is writable before attempting a write.
	 *
	 * Mirrors `filter_doc`'s enforcement surfaces exactly — only
	 * declarations enforcement actually honors are reported:
	 *   - `styles`: the ROOT `customizable` declaration only (nested styles
	 *     declarations are not consulted by `filter_doc`).
	 *   - `settings.applications` / `settings.regions`: per-entry
	 *     declarations (`filter_writes`).
	 *   - v3 top-level blocks: declarations at ANY depth
	 *     (`path_is_allowed` walks every ancestor).
	 *
	 * Returns a list of `{ path, mode }` entries:
	 *   - mode `subtree` — a `customizable: true` node; everything under
	 *     `path` is writable EXCEPT paths matching the hardcoded deny-list
	 *     (callers must surface `DENY_PATTERNS` alongside).
	 *   - mode `exact` — an allowlist entry; only a leaf at exactly `path`
	 *     is writable (`tail_matches_any` is an exact-tail match).
	 *
	 * Entries whose own path matches `DENY_PATTERNS` are dropped — the
	 * deny-list beats any allowlist.
	 *
	 * @param array $doc The cascade-merged (or resolved) doc whose
	 *                   `customizable` declarations to read.
	 * @return array[] List of `array( 'path' => string, 'mode' => string )`.
	 */
	public static function describe_writable_paths( $doc ) {
		$out = array();
		if ( ! is_array( $doc ) ) {
			return $out;
		}

		// styles — root declaration only (mirrors filter_doc → filter_subtree).
		$styles_decl = self::read_decl( $doc['styles'] ?? null );
		if ( $styles_decl === true ) {
			$out[] = array(
				'path' => 'styles',
				'mode' => 'subtree',
			);
		} elseif ( is_array( $styles_decl ) ) {
			foreach ( $styles_decl as $path ) {
				if ( is_string( $path ) ) {
					$out[] = array(
						'path' => 'styles.' . $path,
						'mode' => 'exact',
					);
				}
			}
		}

		// settings.applications / settings.regions — per-entry declarations
		// (mirrors filter_doc → filter_settings → filter_writes).
		foreach ( array( 'applications', 'regions' ) as $coll ) {
			$entries = $doc['settings'][ $coll ] ?? null;
			if ( ! is_array( $entries ) ) {
				continue;
			}
			foreach ( self::index_by_key( $entries, 'id' ) as $id => $entry ) {
				$decl = self::read_decl( $entry );
				$base = "settings.{$coll}.{$id}";
				if ( $decl === true ) {
					$out[] = array(
						'path' => $base,
						'mode' => 'subtree',
					);
				} elseif ( is_array( $decl ) ) {
					foreach ( $decl as $path ) {
						if ( is_string( $path ) ) {
							$out[] = array(
								'path' => $base . '.' . $path,
								'mode' => 'exact',
							);
						}
					}
				}
			}
		}

		// v3 top-level blocks — declarations honored at any depth
		// (mirrors filter_doc → filter_v3_block → path_is_allowed).
		foreach ( self::V3_TOP_LEVEL_BLOCKS as $block ) {
			if ( isset( $doc[ $block ] ) && is_array( $doc[ $block ] ) ) {
				self::collect_decl_paths( $doc[ $block ], $block, $out );
			}
		}

		// The hardcoded deny-list beats every allowlist — drop entries it
		// would reject anyway. (A `subtree` entry may still CONTAIN denied
		// paths — e.g. `screens.foo` subtree with `screens.foo.permissions`
		// denied — which is why callers surface DENY_PATTERNS alongside.)
		$out = array_values( array_filter(
			$out,
			function ( $entry ) {
				return ! self::path_matches_any_pattern( $entry['path'], self::DENY_PATTERNS );
			}
		) );

		return $out;
	}

	/**
	 * Flatten a doc/patch into dotted leaf paths using the SAME walker
	 * enforcement uses (`collect_leaves`), so the abilities' pre-flight
	 * applied/rejected diff compares like with like. Keeping this here —
	 * next to the enforcement walker — is deliberate: any change to leaf
	 * collection (keyed-list detection, key fields) updates both in one
	 * place instead of silently desyncing an external copy.
	 *
	 * @param array $tree Doc or patch tree.
	 * @return string[] Dotted leaf paths.
	 */
	public static function flatten_leaf_paths( $tree ) {
		if ( ! is_array( $tree ) ) {
			return array();
		}
		$leaves = array();
		foreach ( $tree as $k => $v ) {
			self::collect_leaves( $v, (string) $k, $leaves );
		}
		return array_keys( $leaves );
	}

	/**
	 * Recursive worker for `describe_writable_paths` over a v3 block —
	 * collect `{ path, mode }` entries for every `customizable` declaration
	 * in the subtree. Keyed lists step by `id`/`slug`/`name` exactly like
	 * `collect_leaves` so the reported paths match what enforcement checks.
	 *
	 * @param array  $node Subtree to walk.
	 * @param string $path Dotted path of the subtree (block name first).
	 * @param array  $out  Accumulator (by reference).
	 */
	private static function collect_decl_paths( $node, $path, &$out ) {
		if ( ! is_array( $node ) ) {
			return;
		}
		$decl = self::read_decl( $node );
		if ( $decl === true ) {
			$out[] = array(
				'path' => $path,
				'mode' => 'subtree',
			);
			// Everything under this node is already writable — the
			// shallowest matching declaration wins in `path_is_allowed`, so
			// deeper declarations can't restrict it. Skip the descent; it
			// would only emit redundant entries inside the subtree.
			return;
		}
		if ( is_array( $decl ) ) {
			foreach ( $decl as $rel ) {
				if ( is_string( $rel ) ) {
					$out[] = array(
						'path' => $path . '.' . $rel,
						'mode' => 'exact',
					);
				}
			}
		}

		if ( WP_Admin_Workspaces_Merge::is_assoc( $node ) ) {
			foreach ( $node as $k => $v ) {
				if ( $k === self::FIELD ) {
					continue;
				}
				if ( is_array( $v ) ) {
					self::collect_decl_paths( $v, $path . '.' . $k, $out );
				}
			}
			return;
		}

		// List-form. Keyed (id/slug/name) steps by id; plain lists by index.
		$key   = null;
		$first = reset( $node );
		if ( is_array( $first ) ) {
			foreach ( array( 'id', 'slug', 'name' ) as $k ) {
				if ( array_key_exists( $k, $first ) ) {
					$key = $k;
					break;
				}
			}
		}
		if ( $key !== null ) {
			foreach ( $node as $entry ) {
				if ( is_array( $entry ) && isset( $entry[ $key ] ) ) {
					self::collect_decl_paths( $entry, $path . '.' . $entry[ $key ], $out );
				}
			}
			return;
		}
		foreach ( $node as $i => $entry ) {
			if ( is_array( $entry ) ) {
				self::collect_decl_paths( $entry, $path . '.' . $i, $out );
			}
		}
	}

	/**
	 * Filter a single v3 top-level block against the hardcoded deny-list +
	 * per-field allowlist for consumer origins. Returns the surviving
	 * subtree (may be empty), or the SENTINEL when nothing survives so the
	 * caller can omit the block entirely from the merged output.
	 *
	 * Algorithm. Flatten the downstream value into dot-paths
	 * (`menu.tools.items.import.label`). Per leaf:
	 *   - Reject if it matches DENY_PATTERNS — log + drop.
	 *   - Otherwise consult the closest ancestor `customizable` declaration
	 *     in the upstream tree:
	 *       - true                 → allow this leaf
	 *       - false / absent       → deny (default-deny)
	 *       - array of dotted paths → allow iff this leaf's path matches
	 *         (relative to the ancestor that declared the entry).
	 *
	 * @return array|string The filtered subtree, or `SENTINEL` when empty.
	 */
	private static function filter_v3_block( $block, $upstream_block, $downstream_block, $origin ) {
		if ( ! is_array( $downstream_block ) ) {
			// Scalar / null at the top of a v3 block isn't a thing we want
			// to allow from consumer origins — they have no way to
			// declare a scalar gate. Drop outright.
			self::log_consumer_drop( $origin, "{$block}", 'scalar-replacement' );
			return self::SENTINEL;
		}
		$leaves   = array();
		self::collect_leaves( $downstream_block, $block, $leaves );

		// Capture every list-shape path the downstream block carried so we
		// can rebuild list-shape in the output. Without this, the
		// rehydrate step turns `commands: [{id:'save', shortcut:'…'}]`
		// (list-of-keyed-objects) into `commands: {save: {shortcut:'…'}}`
		// (assoc map). The merge engine then sees shape-mismatch base vs
		// over and *replaces the entire base list*, silently corrupting
		// the cascade. Catastrophic for `commands[]` consumers, latent
		// risk for `preload[]` / `routes[]` lists too. See PR #61 review
		// finding #1.
		$list_shape_paths = array();
		self::collect_list_shapes( $downstream_block, $block, $list_shape_paths );

		$surviving = array();
		foreach ( $leaves as $path => $value ) {
			if ( self::path_matches_any_pattern( $path, self::DENY_PATTERNS ) ) {
				self::log_consumer_drop( $origin, $path, 'hardcoded-deny' );
				continue;
			}
			if ( ! self::path_is_allowed( $path, $upstream_block, $block ) ) {
				self::log_consumer_drop( $origin, $path, 'no-customizable-allowlist' );
				continue;
			}
			$surviving[ $path ] = $value;
		}

		if ( empty( $surviving ) ) {
			return self::SENTINEL;
		}

		// Rehydrate a partial-shape subtree from the surviving leaves.
		// Each leaf path begins with the block name so strip that prefix
		// before re-assembling.
		$out = array();
		$prefix_len = strlen( $block ) + 1;
		foreach ( $surviving as $path => $value ) {
			$rel = substr( $path, $prefix_len );
			self::dot_set( $out, $rel, $value );
		}

		// Restore list-of-keyed-objects shape at every path the downstream
		// block carried as a list. Without this the rehydrated output is
		// an assoc map keyed by id and the downstream merge step
		// shape-mismatches against the list-shape upstream.
		if ( ! empty( $list_shape_paths ) ) {
			$out = self::restore_list_shapes( $out, $list_shape_paths, $block );
		}

		return $out;
	}

	/**
	 * Walk the downstream block and record every path that holds a
	 * list-of-keyed-objects. Returns a map of dotted path (including the
	 * block name) → key-field name (`id` / `slug` / `name`).
	 *
	 * Mirrors the same id-detection used in `collect_leaves` so the
	 * collected paths match exactly what gets flattened. Plain integer-
	 * indexed lists are NOT captured — the rehydrate path uses the same
	 * `0`, `1`, `2` keys for both list-form and map-form, so they
	 * round-trip without intervention via `array_values()` at restore
	 * time.
	 */
	private static function collect_list_shapes( $value, $path_prefix, &$out ) {
		if ( ! is_array( $value ) || empty( $value ) ) {
			return;
		}
		if ( WP_Admin_Workspaces_Merge::is_assoc( $value ) ) {
			foreach ( $value as $k => $v ) {
				self::collect_list_shapes( $v, $path_prefix . '.' . $k, $out );
			}
			return;
		}
		// List-form. Detect key field same way collect_leaves does so
		// the resulting paths line up.
		$key = null;
		$first = reset( $value );
		if ( is_array( $first ) ) {
			foreach ( array( 'id', 'slug', 'name' ) as $k ) {
				if ( array_key_exists( $k, $first ) ) {
					$key = $k;
					break;
				}
			}
		}
		if ( $key !== null ) {
			// Record this path as a keyed-list — the rehydrated map at
			// this path must be re-listified at restore time.
			$out[ $path_prefix ] = $key;
			foreach ( $value as $entry ) {
				if ( ! is_array( $entry ) || ! isset( $entry[ $key ] ) ) {
					continue;
				}
				$id = $entry[ $key ];
				self::collect_list_shapes( $entry, $path_prefix . '.' . $id, $out );
			}
			return;
		}
		// Plain integer-indexed list. Track shape so restore can call
		// `array_values()` to drop the numeric keys' association. Use a
		// special sentinel key value for "no id field — just relist".
		$out[ $path_prefix ] = self::LIST_INDEX_SENTINEL;
		foreach ( $value as $i => $entry ) {
			self::collect_list_shapes( $entry, $path_prefix . '.' . $i, $out );
		}
	}

	/**
	 * Walk the rehydrated output and convert every assoc map at a
	 * captured list-shape path back into a list. For keyed lists, the
	 * map's keys become the entries' `id`/`slug`/`name` field; for
	 * integer-indexed lists, `array_values()` strips the numeric keys.
	 *
	 * @param array  $out             The rehydrated output tree.
	 * @param array  $list_shape_paths Map of dotted path → key field or
	 *                                LIST_INDEX_SENTINEL.
	 * @param string $block_name      Block name (so paths can be
	 *                                resolved relative to it).
	 */
	private static function restore_list_shapes( $out, $list_shape_paths, $block_name ) {
		// Walk longest paths first — deeper paths must be relisted before
		// their containing path is relisted, otherwise the parent walk
		// would walk a still-map child and miss the relist.
		$paths = array_keys( $list_shape_paths );
		usort( $paths, function ( $a, $b ) {
			return substr_count( $b, '.' ) - substr_count( $a, '.' );
		} );

		foreach ( $paths as $full_path ) {
			$key_field = $list_shape_paths[ $full_path ];
			// Strip the block-name prefix to get the relative path in $out.
			$rel = ( $full_path === $block_name )
				? ''
				: substr( $full_path, strlen( $block_name ) + 1 );

			$container_path = $rel === '' ? null : explode( '.', $rel );
			$node           = self::dot_ref( $out, $container_path );
			if ( ! is_array( $node ) || empty( $node ) || ! WP_Admin_Workspaces_Merge::is_assoc( $node ) ) {
				continue;
			}
			$relisted = array();
			if ( $key_field === self::LIST_INDEX_SENTINEL ) {
				$relisted = array_values( $node );
			} else {
				foreach ( $node as $id => $body ) {
					if ( is_array( $body ) ) {
						$row                = $body;
						$row[ $key_field ]  = $id;
						$relisted[]         = $row;
					}
				}
			}
			self::dot_set_ref( $out, $container_path, $relisted );
		}
		return $out;
	}

	const LIST_INDEX_SENTINEL = "\0__list_index__\0";

	/**
	 * Resolve a value reference at a path; returns null if any segment
	 * misses. Null `$path` segments means the root array itself.
	 */
	private static function dot_ref( $arr, $path_segments ) {
		if ( $path_segments === null ) {
			return $arr;
		}
		$cur = $arr;
		foreach ( $path_segments as $seg ) {
			if ( ! is_array( $cur ) || ! array_key_exists( $seg , $cur ) ) {
				return null;
			}
			$cur = $cur[ $seg ];
		}
		return $cur;
	}

	/**
	 * Assign a value at a path. Null `$path` segments replaces the root
	 * entirely (used when the block itself is a list).
	 */
	private static function dot_set_ref( &$arr, $path_segments, $value ) {
		if ( $path_segments === null ) {
			$arr = $value;
			return;
		}
		$cur = &$arr;
		foreach ( $path_segments as $i => $seg ) {
			if ( $i === count( $path_segments ) - 1 ) {
				$cur[ $seg ] = $value;
				return;
			}
			if ( ! isset( $cur[ $seg ] ) || ! is_array( $cur[ $seg ] ) ) {
				$cur[ $seg ] = array();
			}
			$cur = &$cur[ $seg ];
		}
	}

	/**
	 * Flatten an arbitrary subtree into a flat path → leaf-value map.
	 * `$path_prefix` is the dotted prefix (block name + accumulated keys);
	 * the result keys carry the FULL dotted path so deny-pattern matching
	 * + allowlist comparison can operate on global paths uniformly.
	 *
	 * Arrays of objects with an `id` field flatten by id (`commands.<id>.invoke`),
	 * matching how the merge engine treats keyed arrays. Plain lists
	 * flatten by integer index (`preload.0`).
	 */
	private static function collect_leaves( $value, $path_prefix, &$out ) {
		if ( ! is_array( $value ) ) {
			$out[ $path_prefix ] = $value;
			return;
		}
		if ( empty( $value ) ) {
			$out[ $path_prefix ] = $value;
			return;
		}
		if ( WP_Admin_Workspaces_Merge::is_assoc( $value ) ) {
			foreach ( $value as $k => $v ) {
				self::collect_leaves( $v, $path_prefix . '.' . $k, $out );
			}
			return;
		}
		// List-form. Try keyed (id/slug/name) first; fall back to integer index.
		$key = null;
		$first = reset( $value );
		if ( is_array( $first ) ) {
			foreach ( array( 'id', 'slug', 'name' ) as $k ) {
				if ( array_key_exists( $k, $first ) ) {
					$key = $k;
					break;
				}
			}
		}
		if ( $key !== null ) {
			foreach ( $value as $entry ) {
				if ( ! is_array( $entry ) || ! isset( $entry[ $key ] ) ) {
					continue;
				}
				$id = $entry[ $key ];
				self::collect_leaves( $entry, $path_prefix . '.' . $id, $out );
			}
			return;
		}
		foreach ( $value as $i => $entry ) {
			self::collect_leaves( $entry, $path_prefix . '.' . $i, $out );
		}
	}

	/**
	 * Path-pattern match. Pattern uses `*` as a single-segment wildcard:
	 *   `screens.*.permissions` matches `screens.users.permissions` (3 segments)
	 *   `screens.*.permissions.capabilities` matches the deeper leaf too —
	 *   match is "pattern is a prefix-or-exact of path" so subtree wins.
	 */
	private static function path_matches_any_pattern( $path, $patterns ) {
		$path_segments = explode( '.', $path );
		foreach ( $patterns as $pattern ) {
			if ( self::glob_match_segments( explode( '.', $pattern ), $path_segments, 0, 0 ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Segment glob matcher. `*` matches exactly one segment; `**` matches zero
	 * or more segments. The pattern carries an implicit trailing `**` (it's a
	 * prefix match — anything under the matched path is also denied), so once
	 * the pattern is exhausted the path matches regardless of trailing
	 * segments. This is what lets `menu.**.permissions` deny a `permissions`
	 * block at any depth in the nested menu tree.
	 *
	 * @param string[] $pat  Pattern segments.
	 * @param string[] $path Path segments.
	 * @param int      $pi   Pattern index.
	 * @param int      $si   Path index.
	 * @return bool
	 */
	private static function glob_match_segments( $pat, $path, $pi, $si ) {
		$pn = count( $pat );
		$sn = count( $path );
		while ( $pi < $pn ) {
			$seg = $pat[ $pi ];
			if ( '**' === $seg ) {
				// Match the rest of the pattern at every remaining position,
				// including consuming zero segments here.
				for ( $k = $si; $k <= $sn; $k++ ) {
					if ( self::glob_match_segments( $pat, $path, $pi + 1, $k ) ) {
						return true;
					}
				}
				return false;
			}
			if ( $si >= $sn ) {
				return false;
			}
			if ( '*' !== $seg && $seg !== $path[ $si ] ) {
				return false;
			}
			++$pi;
			++$si;
		}
		// Pattern exhausted → implicit trailing `**`: any remaining path
		// segments are fine (prefix match preserved).
		return true;
	}

	/**
	 * Default-deny per-field allowlist check. Walk every node along the
	 * downstream path looking for a `customizable` declaration on the
	 * corresponding upstream node. The closest declaration to the leaf
	 * wins:
	 *   - true → allow
	 *   - false / absent → keep walking up; if nothing declares, deny
	 *   - array → allow iff the remaining path-tail (from this node's
	 *     position down to the leaf) matches any allowlist entry
	 *
	 * @param string     $path           Full dotted path (block name first).
	 * @param array|null $upstream_block The upstream block subtree.
	 * @param string     $block_name     Block name (so we strip the prefix).
	 */
	private static function path_is_allowed( $path, $upstream_block, $block_name ) {
		if ( ! is_array( $upstream_block ) ) {
			return false;
		}
		$rel_segments = explode( '.', substr( $path, strlen( $block_name ) + 1 ) );

		// Walk upstream from root toward the leaf, checking each ancestor.
		// The deepest matching `customizable: true` or matching-allowlist
		// wins; absent declarations keep walking; only if NO ancestor
		// declares do we default-deny.
		$cur          = $upstream_block;
		$prefix_walked = array();
		// Root-level customizable.
		$root_decl = self::read_decl( $upstream_block );
		if ( $root_decl === true ) {
			return true;
		}
		if ( is_array( $root_decl ) && self::tail_matches_any( $rel_segments, $root_decl ) ) {
			return true;
		}

		foreach ( $rel_segments as $i => $seg ) {
			if ( ! is_array( $cur ) ) {
				return false;
			}
			// Step into the node. List form needs id lookup.
			$next = null;
			if ( WP_Admin_Workspaces_Merge::is_assoc( $cur ) ) {
				$next = $cur[ $seg ] ?? null;
			} else {
				foreach ( $cur as $entry ) {
					if ( ! is_array( $entry ) ) {
						continue;
					}
					foreach ( array( 'id', 'slug', 'name' ) as $k ) {
						if ( array_key_exists( $k, $entry ) && (string) $entry[ $k ] === (string) $seg ) {
							$next = $entry;
							break 2;
						}
					}
				}
			}
			if ( $next === null ) {
				return false;
			}
			$prefix_walked[] = $seg;
			$node_decl = is_array( $next ) ? self::read_decl( $next ) : null;
			if ( $node_decl === true ) {
				return true;
			}
			if ( is_array( $node_decl ) ) {
				$tail = array_slice( $rel_segments, $i + 1 );
				if ( self::tail_matches_any( $tail, $node_decl ) ) {
					return true;
				}
			}
			$cur = $next;
		}
		return false;
	}

	/**
	 * Match a path tail (e.g. `[ 'tools', 'items', 'import', 'label' ]`)
	 * against an allowlist of dotted paths (`[ 'tools.items.import.label' ]`).
	 * The whole tail must match exactly OR be a prefix of an allowlist
	 * entry's matching segments.
	 */
	private static function tail_matches_any( $tail_segments, $allowlist ) {
		$tail_path = implode( '.', $tail_segments );
		foreach ( $allowlist as $entry ) {
			if ( ! is_string( $entry ) ) {
				continue;
			}
			if ( $entry === $tail_path ) {
				return true;
			}
		}
		return false;
	}

	private static function log_consumer_drop( $origin, $path, $reason ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}
		error_log( sprintf(
			'[wp-admin-workspaces] customizable enforcement: dropped %s-origin write to "%s" (reason: %s)',
			$origin,
			$path,
			$reason
		) );
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
			if ( is_array( $entries ) && WP_Admin_Workspaces_Merge::is_assoc( $entries ) ) {
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
		if ( is_array( $entries ) && WP_Admin_Workspaces_Merge::is_assoc( $entries ) ) {
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
