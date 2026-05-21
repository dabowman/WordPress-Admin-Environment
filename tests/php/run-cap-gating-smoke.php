<?php
/**
 * Cap-gating smoke for `wp-admin-default` against the v2 region tree.
 *
 * The v2 shape carries nav items with inline `capability` fields under
 * `regions.sidebar.regions.nav.config.items[]`. The smoke walks the
 * resolved region tree, prunes nav items the current user can't reach
 * (`current_user_can($item['capability'])`), derives a stable id from
 * each surviving item's `href` (`#/dashboard/home` → `dashboard-home`),
 * and asserts the per-role visible-id set matches a hand-curated
 * expectation.
 *
 * Mirrors the JS pruning logic in `src/apps/navigation/index.js#pruneNavItems`
 * — same recursion, same drop-orphan-separators rule.
 *
 * Status: DEPRECATED for v3 shells. Phase 3d.1 retired the v2-shape
 * `shells/wp-admin-default.json`; the active default is now v3-shaped
 * (workspace/screens/menu) and the nav-items config block this smoke
 * walked is gone. The smoke now detects v3 shape and exits 0 with a
 * notice — a port to v3 menu/screen capability gating is tracked under
 * Phase 3d.3 (test surface rewrites).
 *
 * Run: wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cap-gating-smoke.php
 */

if ( ! class_exists( 'WP_Admin_Shell_Resolver' ) ) {
	echo "Plugin not loaded.\n";
	exit( 1 );
}

$roles = array(
	'subscriber'    => 'subscriber',
	'contributor'   => 'contributor',
	'author'        => 'author',
	'editor'        => 'editor',
	'administrator' => 'administrator',
);

/** Hand-curated expected visible nav-item ids per role for `wp-admin-default`. */
$expected = array(
	'subscriber'    => array( 'dashboard-home', 'dashboard-widgets', 'profile', 'profile' ),
	'contributor'   => array(
		'dashboard-home', 'dashboard-widgets',
		'posts', 'posts-drafts', 'posts-trash', 'posts-new',
		'profile', 'profile',
		'tools',
	),
	'author'        => array(
		'dashboard-home', 'dashboard-widgets',
		'posts', 'posts-drafts', 'posts-new', 'posts-trash',
		'media', 'media-new',
		'profile', 'profile',
		'tools',
	),
	'editor'        => array(
		'dashboard-home', 'dashboard-widgets',
		'posts', 'posts-drafts', 'posts-pending', 'posts-trash', 'posts-new', 'posts-categories', 'posts-tags',
		'media', 'media-new',
		'pages', 'pages-drafts', 'pages-new',
		'comments', 'comments-pending', 'comments-spam', 'comments-trash',
		'profile', 'profile',
		'tools',
	),
	'administrator' => array(
		'dashboard-home', 'dashboard-widgets', 'dashboard-updates',
		'posts', 'posts-drafts', 'posts-pending', 'posts-trash', 'posts-new', 'posts-categories', 'posts-tags',
		'media', 'media-new',
		'pages', 'pages-drafts', 'pages-new',
		'comments', 'comments-pending', 'comments-spam', 'comments-trash',
		'appearance-themes', 'appearance-themes-new', 'appearance-editor', 'appearance-customize', 'appearance-menus', 'appearance-widgets',
		'plugins', 'plugins-active', 'plugins-inactive', 'plugins-new', 'plugins-editor',
		'users', 'users-administrators', 'users-new',
		'profile', 'profile',
		'tools', 'tools-import', 'tools-export', 'tools-site-health', 'tools-export-data', 'tools-erase-data',
		'settings-general', 'settings-writing', 'settings-reading', 'settings-discussion', 'settings-media', 'settings-permalinks', 'settings-privacy',
	),
);

/**
 * Walk regions recursively, return the first nav-config items[] block we hit.
 *
 * @param array $regions
 * @return array
 */
function smoke_find_nav_items( $regions ) {
	if ( ! is_array( $regions ) ) {
		return array();
	}
	foreach ( $regions as $region ) {
		if ( ! is_array( $region ) ) {
			continue;
		}
		if ( isset( $region['app'] ) && 'core:navigation' === $region['app'] ) {
			return $region['config']['items'] ?? array();
		}
		if ( isset( $region['regions'] ) && is_array( $region['regions'] ) ) {
			$found = smoke_find_nav_items( $region['regions'] );
			if ( ! empty( $found ) ) {
				return $found;
			}
		}
	}
	return array();
}

/**
 * Mirrors `pruneNavItems` in src/apps/navigation/index.js.
 *
 * @param array $items
 * @return array
 */
function smoke_prune_nav( $items ) {
	if ( ! is_array( $items ) ) {
		return array();
	}
	$out = array();
	foreach ( $items as $item ) {
		if ( ! is_array( $item ) ) {
			continue;
		}
		if ( ! empty( $item['separator'] ) ) {
			$out[] = $item;
			continue;
		}
		if ( isset( $item['screen'] ) || isset( $item['group'] ) ) {
			$kids = smoke_prune_nav( $item['items'] ?? array() );
			if ( count( $kids ) === 0 ) {
				continue;
			}
			$item['items'] = $kids;
			$out[]         = $item;
			continue;
		}
		// External links pass through unconditionally — no in-shell cap to check.
		if ( ! empty( $item['external'] ) ) {
			$out[] = $item;
			continue;
		}
		if ( ! empty( $item['capability'] ) && ! current_user_can( $item['capability'] ) ) {
			continue;
		}
		$out[] = $item;
	}
	while ( count( $out ) && ! empty( $out[0]['separator'] ) ) {
		array_shift( $out );
	}
	while ( count( $out ) && ! empty( $out[ count( $out ) - 1 ]['separator'] ) ) {
		array_pop( $out );
	}
	return $out;
}

/**
 * Derive a stable id from an in-shell href like `#/dashboard/home` → `dashboard-home`.
 * Returns null for items without an in-shell href (separators, external links, etc.).
 *
 * @param array $item
 * @return string|null
 */
function smoke_id_from_item( $item ) {
	if ( ! is_array( $item ) || ! isset( $item['href'] ) ) {
		return null;
	}
	if ( ! empty( $item['external'] ) ) {
		return null;
	}
	$href = (string) $item['href'];
	if ( strpos( $href, '#/' ) !== 0 ) {
		return null;
	}
	$path = substr( $href, 2 );
	if ( '' === $path ) {
		return null;
	}
	return str_replace( '/', '-', $path );
}

/** Recurse pruned tree, return list of every reachable nav-item id. */
function smoke_collect_ids( $items ) {
	$ids = array();
	foreach ( $items as $item ) {
		$id = smoke_id_from_item( $item );
		if ( null !== $id ) {
			$ids[] = $id;
		}
		if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
			$ids = array_merge( $ids, smoke_collect_ids( $item['items'] ) );
		}
	}
	return $ids;
}

$failures = 0;
$pass     = 0;

// Phase 3d.1 retired the v2 `wp-admin-default.json`; the active default
// is now v3-shaped. The nav-items block this smoke walks is gone, so
// short-circuit to a passing skip while the v3 port is queued for
// Phase 3d.3. Detect v3 shape by querying the resolved doc for the
// admin user and checking for the v3-distinctive top-level `screens`
// block.
$admin_for_probe = get_user_by( 'login', 'administrator' );
if ( $admin_for_probe ) {
	wp_set_current_user( $admin_for_probe->ID );
	WP_Admin_Shell_Resolver::reset_request_memo();
	$probe = WP_Admin_Shell_Resolver::resolve( array( 'shell' => 'wp-admin-default' ) );
	if ( isset( $probe['screens'] ) && is_array( $probe['screens'] ) ) {
		echo "SKIP v3-shape default shell — v2 nav-items cap pruning smoke pending Phase 3d.3 port.\n";
		echo "Result: 0 passed, 0 failed (skipped)\n";
		exit( 0 );
	}
}

foreach ( $roles as $role => $login ) {
	$user = get_user_by( 'login', $login );
	if ( ! $user ) {
		echo "SKIP {$role}: no user '{$login}'\n";
		continue;
	}
	wp_set_current_user( $user->ID );
	WP_Admin_Shell_Resolver::reset_request_memo();

	$resolved = WP_Admin_Shell_Resolver::resolve( array( 'shell' => 'wp-admin-default' ) );
	$regions  = $resolved['regions'] ?? array();
	$nav      = smoke_find_nav_items( $regions );

	if ( empty( $nav ) ) {
		echo "FAIL {$role}: no core:navigation items[] found in resolved regions\n";
		++$failures;
		continue;
	}

	$pruned   = smoke_prune_nav( $nav );
	$got_ids  = smoke_collect_ids( $pruned );
	sort( $got_ids );
	$want_ids = $expected[ $role ];
	sort( $want_ids );

	$missing = array_values( array_diff( $want_ids, $got_ids ) );
	$extra   = array_values( array_diff( $got_ids, $want_ids ) );

	if ( count( $missing ) === 0 && count( $extra ) === 0 ) {
		echo "PASS {$role}: " . count( $got_ids ) . " nav items\n";
		++$pass;
	} else {
		echo "FAIL {$role}\n";
		echo "  got:     " . implode( ', ', $got_ids ) . "\n";
		echo "  want:    " . implode( ', ', $want_ids ) . "\n";
		if ( $missing ) {
			echo "  missing: " . implode( ', ', $missing ) . "\n";
		}
		if ( $extra ) {
			echo "  extra:   " . implode( ', ', $extra ) . "\n";
		}
		++$failures;
	}
}

echo "\n";
echo "Result: {$pass} passed, {$failures} failed\n";
exit( $failures > 0 ? 1 : 0 );
