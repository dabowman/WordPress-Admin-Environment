<?php
/**
 * Admin-bar + admin-notices runtime-harvest tests (#128).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-chrome-harvest-tests.php`
 *
 * Coverage:
 *   - Core admin-bar node-id skip detection + filter expansion.
 *   - harvest_admin_bar():
 *       * core nodes (site-name / my-account / new-content) skipped,
 *       * third-party top-level node ingested,
 *       * plugin child node folded into the parent's children[] dropdown,
 *       * group container nodes flattened transparently (via the boolean
 *         `group` property — incl. a TITLED group, which the no-title
 *         fallback would miss),
 *       * node meta (target / tooltip) normalized,
 *       * child of a CORE node is NOT surfaced (parent skipped).
 *   - capture_admin_notices() buffers do_action('admin_notices') output and
 *     DETACHES the core notice hooks so the later native admin-header.php
 *     pass renders nothing (no double-dispatch / double side effects).
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Chrome_Harvest_Test_Runner {
	public static $pass = 0;
	public static $fail = 0;

	public static function assert_eq( $label, $actual, $expected ) {
		if ( $actual === $expected ) {
			self::$pass++;
			echo "PASS  $label\n";
		} else {
			self::$fail++;
			echo "FAIL  $label\n";
			echo '      expected: ' . var_export( $expected, true ) . "\n";
			echo '      actual:   ' . var_export( $actual, true ) . "\n";
		}
	}

	public static function assert_true( $label, $actual ) {
		self::assert_eq( $label, (bool) $actual, true );
	}
}

$T = 'WPAS_Chrome_Harvest_Test_Runner';

// --- Core node-id detection ----------------------------------------------

$T::assert_true(
	'is_core_node: site-name detected',
	WP_Admin_Shell_Chrome_Harvest::is_core_node( 'site-name' )
);
$T::assert_true(
	'is_core_node: my-account detected',
	WP_Admin_Shell_Chrome_Harvest::is_core_node( 'my-account' )
);
$T::assert_true(
	'is_core_node: new-content (+New) detected — built natively by #129',
	WP_Admin_Shell_Chrome_Harvest::is_core_node( 'new-content' )
);
$T::assert_true(
	'is_core_node: third-party node id NOT core',
	! WP_Admin_Shell_Chrome_Harvest::is_core_node( 'acme-bar-node' )
);

// Filter-expanded skip list (memoized — reset() between scenarios).
add_filter(
	'wp_admin_shell_admin_bar_core_node_ids',
	function ( $ids ) {
		$ids[] = 'acme-bar-node';
		return $ids;
	}
);
WP_Admin_Shell_Chrome_Harvest::reset();
$T::assert_true(
	'is_core_node: filter expansion adds a custom node id to the skip list',
	WP_Admin_Shell_Chrome_Harvest::is_core_node( 'acme-bar-node' )
);
remove_all_filters( 'wp_admin_shell_admin_bar_core_node_ids' );
WP_Admin_Shell_Chrome_Harvest::reset();

// --- harvest_admin_bar(): skip core, ingest plugin nodes -----------------
// Register a fake admin_bar_menu callback that adds: a core-id node (must be
// skipped), a top-level plugin node, a plugin child of that node (folded
// into children[]), an invisible group container (flattened), and a plugin
// child of a CORE node (must NOT surface — parent skipped).

$harvest_cb = function ( $bar ) {
	// Core-owned id — must be skipped.
	$bar->add_node(
		array(
			'id'    => 'site-name',
			'title' => 'My Site',
			'href'  => 'https://example.com',
		)
	);
	// Top-level plugin node.
	$bar->add_node(
		array(
			'id'    => 'acme',
			'title' => '<span class="ab-icon"></span>Acme',
			'href'  => 'https://example.com/wp-admin/admin.php?page=acme',
			'meta'  => array( 'title' => 'Acme tooltip', 'target' => '_blank' ),
		)
	);
	// Invisible group container under the plugin node.
	$bar->add_node(
		array(
			'id'     => 'acme-group',
			'parent' => 'acme',
			'group'  => true,
		)
	);
	// Plugin child inside the group → should flatten up to acme.children[].
	$bar->add_node(
		array(
			'id'     => 'acme-reports',
			'parent' => 'acme-group',
			'title'  => 'Reports',
			'href'   => 'https://example.com/wp-admin/admin.php?page=acme-reports',
		)
	);
	// Plugin child of a CORE node → must NOT surface (parent skipped).
	$bar->add_node(
		array(
			'id'     => 'acme-under-core',
			'parent' => 'site-name',
			'title'  => 'Hidden',
			'href'   => 'https://example.com/x',
		)
	);
	// A TOP-LEVEL group container that HAS a title (and no href). This must
	// be skipped via the boolean `group` property — NOT the no-href/no-title
	// fallback (the title defeats the fallback). Catches the `$node->type`
	// regression: unbound get_nodes() never sets `type`, so a `type==='group'`
	// check would emit this wrapper as a top-level record.
	$bar->add_node(
		array(
			'id'    => 'acme-titled-group',
			'title' => 'Titled Group Wrapper',
			'group' => true,
		)
	);
	// A second plugin top-level node whose submenu lives inside a CHILD group
	// container that itself carries a title. The titled child group must
	// still flatten (via `group`, not the fallback) so the real item beneath
	// it surfaces in the parent's children[].
	$bar->add_node(
		array(
			'id'    => 'beta',
			'title' => 'Beta',
			'href'  => 'https://example.com/wp-admin/admin.php?page=beta',
		)
	);
	$bar->add_node(
		array(
			'id'     => 'beta-titled-group',
			'parent' => 'beta',
			'title'  => 'Beta Group Title',
			'group'  => true,
		)
	);
	$bar->add_node(
		array(
			'id'     => 'beta-item',
			'parent' => 'beta-titled-group',
			'title'  => 'Beta Item',
			'href'   => 'https://example.com/wp-admin/admin.php?page=beta-item',
		)
	);
};

add_action( 'admin_bar_menu', $harvest_cb, 100 );
WP_Admin_Shell_Chrome_Harvest::reset();
$nodes = WP_Admin_Shell_Chrome_Harvest::harvest_admin_bar();

// Find the acme record among whatever core/other plugins also registered.
$acme = null;
$has_site_name = false;
foreach ( $nodes as $n ) {
	if ( $n['id'] === 'acme' ) {
		$acme = $n;
	}
	if ( $n['id'] === 'site-name' ) {
		$has_site_name = true;
	}
}

$T::assert_true(
	'harvest: core node (site-name) skipped from top-level records',
	! $has_site_name
);
$T::assert_true(
	'harvest: third-party top-level node (acme) ingested',
	$acme !== null
);
if ( $acme !== null ) {
	$T::assert_eq(
		'harvest: acme title HTML preserved (admin trust)',
		$acme['title'],
		'<span class="ab-icon"></span>Acme'
	);
	$T::assert_eq(
		'harvest: acme href preserved',
		$acme['href'],
		'https://example.com/wp-admin/admin.php?page=acme'
	);
	$T::assert_eq(
		'harvest: acme meta normalized (tooltip + target only)',
		$acme['meta'],
		array( 'target' => '_blank', 'tooltip' => 'Acme tooltip' )
	);
	$T::assert_eq(
		'harvest: acme has exactly one child (group flattened, core-parented child excluded)',
		count( $acme['children'] ),
		1
	);
	$T::assert_eq(
		'harvest: flattened child id is acme-reports',
		$acme['children'][0]['id'],
		'acme-reports'
	);
	$T::assert_eq(
		'harvest: flattened child href preserved',
		$acme['children'][0]['href'],
		'https://example.com/wp-admin/admin.php?page=acme-reports'
	);
}

// The core-parented plugin child must never appear as a top-level record.
$has_under_core = false;
foreach ( $nodes as $n ) {
	if ( $n['id'] === 'acme-under-core' ) {
		$has_under_core = true;
	}
}
$T::assert_true(
	'harvest: plugin child of a core node does not surface as top-level',
	! $has_under_core
);

// A titled top-level group wrapper must be skipped via the boolean `group`
// property (the title defeats the no-href/no-title fallback).
$has_titled_group = false;
$beta             = null;
foreach ( $nodes as $n ) {
	if ( $n['id'] === 'acme-titled-group' ) {
		$has_titled_group = true;
	}
	if ( $n['id'] === 'beta' ) {
		$beta = $n;
	}
}
$T::assert_true(
	'harvest: titled top-level group wrapper skipped via boolean `group` (not the no-title fallback)',
	! $has_titled_group
);
$T::assert_true(
	'harvest: beta (group-nested submenu) ingested',
	$beta !== null
);
if ( $beta !== null ) {
	$T::assert_eq(
		'harvest: titled CHILD group flattened — beta has exactly one child',
		count( $beta['children'] ),
		1
	);
	$T::assert_eq(
		'harvest: flattened child of a titled group is beta-item',
		$beta['children'][0]['id'],
		'beta-item'
	);
}

remove_action( 'admin_bar_menu', $harvest_cb, 100 );
WP_Admin_Shell_Chrome_Harvest::reset();

// --- capture_admin_notices(): buffers do_action('admin_notices') ---------

WP_Admin_Shell_Chrome_Harvest::reset();
$notice_cb = function () {
	echo '<div class="notice notice-warning"><p>Plugin global notice</p></div>';
};
add_action( 'admin_notices', $notice_cb );
$captured = WP_Admin_Shell_Chrome_Harvest::capture_admin_notices();
$T::assert_true(
	'capture_admin_notices: global admin_notices HTML buffered',
	strpos( $captured, 'Plugin global notice' ) !== false
);

// Double-dispatch guard: the first capture detaches the core notice hooks,
// so a re-dispatch (admin-header.php's later native pass) fires no callbacks
// and the test callback runs exactly once.
$second_native_pass = '';
ob_start();
do_action( 'admin_notices' );
do_action( 'all_admin_notices' );
$second_native_pass = trim( ob_get_clean() );
$T::assert_eq(
	'capture_admin_notices: hooks detached after capture → native re-pass renders nothing (no double-render / double side effects)',
	$second_native_pass,
	''
);

// A second capture_admin_notices() in the SAME request returns the memo
// without re-dispatching (hooks are already drained).
$memoized = WP_Admin_Shell_Chrome_Harvest::capture_admin_notices();
$T::assert_true(
	'capture_admin_notices: second call returns the memoized HTML (no re-buffer of a drained hook)',
	strpos( $memoized, 'Plugin global notice' ) !== false
);
remove_action( 'admin_notices', $notice_cb );

// After reset(), with no notice callbacks registered, capture is empty.
WP_Admin_Shell_Chrome_Harvest::reset();
$empty_capture = WP_Admin_Shell_Chrome_Harvest::capture_admin_notices();
$T::assert_eq(
	'capture_admin_notices: no notices → empty string',
	$empty_capture,
	''
);

// --- Summary -------------------------------------------------------------

$total = WPAS_Chrome_Harvest_Test_Runner::$pass + WPAS_Chrome_Harvest_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Chrome_Harvest_Test_Runner::$pass . ' passed, ' . WPAS_Chrome_Harvest_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Chrome_Harvest_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
