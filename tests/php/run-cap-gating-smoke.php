<?php
/**
 * Cap-gating smoke for `wp-admin-default`.
 *
 * Walks the resolved navigation tree against each test user (subscriber →
 * administrator) and prints which app ids survive the JS prune logic in
 * src/apps/navigation/index.js#pruneNavItems. Compares to a hand-curated
 * expectation set per role and reports drift.
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

/** Hand-curated expected visible app ids per role for `wp-admin-default`. */
$expected = array(
	'subscriber'    => array( 'dashboard-home', 'profile' ),
	'contributor'   => array( 'dashboard-home', 'posts-all', 'posts-new', 'profile', 'tools-available' ),
	'author'        => array( 'dashboard-home', 'posts-all', 'posts-new', 'media-library', 'media-new', 'profile', 'tools-available' ),
	'editor'        => array(
		'dashboard-home',
		'posts-all', 'posts-new', 'posts-categories', 'posts-tags',
		'media-library', 'media-new',
		'pages-all', 'pages-new',
		'comments',
		'profile',
		'tools-available',
	),
	'administrator' => array(
		'dashboard-home', 'dashboard-updates',
		'posts-all', 'posts-new', 'posts-categories', 'posts-tags',
		'media-library', 'media-new',
		'pages-all', 'pages-new',
		'comments',
		'appearance-themes', 'appearance-editor', 'appearance-customize',
		'plugins-installed', 'plugins-add', 'plugins-editor',
		'users-all', 'users-new',
		'profile',
		'tools-available', 'tools-import', 'tools-export', 'tools-site-health', 'tools-export-data', 'tools-erase-data',
		'settings-general', 'settings-writing', 'settings-reading', 'settings-discussion', 'settings-media', 'settings-permalinks', 'settings-privacy',
	),
);

/**
 * Mirrors src/apps/navigation/index.js#pruneNavItems in PHP.
 *
 * @param array $items
 * @param array $apps_by_id
 * @return array Pruned items.
 */
function smoke_prune_nav( $items, $apps_by_id ) {
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
			$kids = smoke_prune_nav( $item['items'] ?? array(), $apps_by_id );
			if ( count( $kids ) === 0 ) {
				continue;
			}
			$item['items'] = $kids;
			$out[]         = $item;
			continue;
		}
		if ( isset( $item['app'] ) ) {
			$app = $apps_by_id[ $item['app'] ] ?? null;
			if ( ! $app ) {
				continue;
			}
			if ( ! empty( $app['capability'] ) && ! current_user_can( $app['capability'] ) ) {
				continue;
			}
			$out[] = $item;
			continue;
		}
		// Plain link or other — pass through.
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

/** Recurse pruned tree, return list of every reachable app id. */
function smoke_collect_app_ids( $items ) {
	$ids = array();
	foreach ( $items as $item ) {
		if ( isset( $item['app'] ) ) {
			$ids[] = $item['app'];
		}
		if ( isset( $item['items'] ) && is_array( $item['items'] ) ) {
			$ids = array_merge( $ids, smoke_collect_app_ids( $item['items'] ) );
		}
	}
	return $ids;
}

$failures = 0;
$pass     = 0;

foreach ( $roles as $role => $login ) {
	$user = get_user_by( 'login', $login );
	if ( ! $user ) {
		echo "SKIP {$role}: no user '{$login}'\n";
		continue;
	}
	wp_set_current_user( $user->ID );
	WP_Admin_Shell_Resolver::reset_request_memo();

	$resolved = WP_Admin_Shell_Resolver::resolve( array( 'shell' => 'wp-admin-default' ) );
	$apps     = $resolved['settings']['applications'] ?? $resolved['applications'] ?? array();
	$nav      = $resolved['settings']['navigation'] ?? $resolved['navigation'] ?? array();

	$apps_by_id = array();
	foreach ( $apps as $app ) {
		if ( isset( $app['id'] ) ) {
			$apps_by_id[ $app['id'] ] = $app;
		}
	}

	$pruned   = smoke_prune_nav( $nav, $apps_by_id );
	$got_ids  = smoke_collect_app_ids( $pruned );
	sort( $got_ids );
	$want_ids = $expected[ $role ];
	sort( $want_ids );

	$missing = array_values( array_diff( $want_ids, $got_ids ) );
	$extra   = array_values( array_diff( $got_ids, $want_ids ) );

	if ( count( $missing ) === 0 && count( $extra ) === 0 ) {
		echo "PASS {$role}: " . count( $got_ids ) . " apps\n";
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
