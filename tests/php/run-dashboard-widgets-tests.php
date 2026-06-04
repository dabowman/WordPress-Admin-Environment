<?php
/**
 * Dashboard-widgets registry tests (v3 reshape — 3c.1).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-dashboard-widgets-tests.php`
 *
 * Coverage:
 *   - `WP_Admin_Workspaces_Dashboard_Widgets::register` validation + readback.
 *   - Override flavor: contributes screens[<target>].apps[] entries to the cascade.
 *   - Custom target screen via $args['screen'].
 *   - Standalone flavor: also synthesizes an app manifest with slotHints.
 *   - admin.json declaration wins per-entry-id via the cascade's id-keyed array merge.
 *   - Tombstone semantics: hidden:true marks the contributed entry as a cascade tombstone.
 *   - v2 `dashboardWidgets` block translated to screen-app entries at compile time.
 *   - Lazy + deferred manifest forwarding.
 *   - Entry-id derivation from app id.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Dashboard_Widgets_Test_Runner {
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

	public static function assert_wp_error( $label, $actual ) {
		self::assert_true( $label, is_wp_error( $actual ) );
	}
}

$T = 'WPAS_Dashboard_Widgets_Test_Runner';

WP_Admin_Workspaces_Dashboard_Widgets::reset();

// --- Registration validation -----------------------------------------------

$err = wp_admin_workspaces_register_dashboard_widget( '', array() );
$T::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_workspaces_register_dashboard_widget( 'no-namespace', array() );
$T::assert_wp_error( 'register rejects un-namespaced id', $err );

$err = wp_admin_workspaces_register_dashboard_widget( 'plugin:bad slug/widget', array() );
$T::assert_wp_error( 'register rejects malformed plugin id', $err );

// --- Entry-id derivation ----------------------------------------------------

$T::assert_eq(
	'entry-id derivation: core: prefix stripped',
	WP_Admin_Workspaces_Dashboard_Widgets::derive_entry_id( 'core:dashboard-widget-recent-posts' ),
	'dashboard-widget-recent-posts'
);
$T::assert_eq(
	'entry-id derivation: plugin slug preserved (collision-safe)',
	WP_Admin_Workspaces_Dashboard_Widgets::derive_entry_id( 'plugin:acme/sales-stats' ),
	'acme-sales-stats'
);

// --- Override flavor --------------------------------------------------------

WP_Admin_Workspaces_Dashboard_Widgets::reset();
$id = wp_admin_workspaces_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'position'    => array( 'row' => 1, 'col' => 1 ),
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
$T::assert_eq( 'register returns id (override flavor)', $id, 'core:dashboard-widget-recent-posts' );

$record = WP_Admin_Workspaces_Dashboard_Widgets::get( 'core:dashboard-widget-recent-posts' );
$T::assert_eq(
	'record placement.position preserved',
	$record['placement']['position'],
	array( 'row' => 1, 'col' => 1 )
);
$T::assert_eq(
	'record placement.defaultSize preserved',
	$record['placement']['defaultSize'],
	array( 'w' => 2, 'h' => 1 )
);
$T::assert_eq(
	'record target_screen defaults to dashboard-widgets',
	$record['target_screen'],
	'dashboard-widgets'
);

// --- Cascade contribution: screens[<target>].apps[] -------------------------

$plugin_doc = apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$T::assert_true(
	'plugin origin creates screens[dashboard-widgets] when registrations exist',
	isset( $plugin_doc['screens']['dashboard-widgets']['apps'] )
);
$apps = $plugin_doc['screens']['dashboard-widgets']['apps'];
$T::assert_eq(
	'plugin origin contributes exactly one apps entry',
	count( $apps ),
	1
);
$T::assert_eq(
	'contributed entry app id',
	$apps[0]['app'],
	'core:dashboard-widget-recent-posts'
);
$T::assert_eq(
	'contributed entry has slot:"grid"',
	$apps[0]['slot'],
	'grid'
);
$T::assert_eq(
	'contributed entry id is the kebab-derived form',
	$apps[0]['id'],
	'dashboard-widget-recent-posts'
);
$T::assert_eq(
	'contributed entry carries defaultSize as `size`',
	$apps[0]['size'],
	array( 'w' => 2, 'h' => 1 )
);
$T::assert_eq(
	'contributed entry carries position',
	$apps[0]['position'],
	array( 'row' => 1, 'col' => 1 )
);

// --- Custom target screen ---------------------------------------------------

WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'screen'      => 'home-dashboard',
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
$plugin_doc = apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$T::assert_true(
	'custom screen target receives contribution',
	isset( $plugin_doc['screens']['home-dashboard']['apps'] )
);
$T::assert_true(
	'default screen target receives nothing when explicit screen set',
	! isset( $plugin_doc['screens']['dashboard-widgets'] )
);
$T::assert_eq(
	'custom-screen entry is the same kebab-derived id',
	$plugin_doc['screens']['home-dashboard']['apps'][0]['id'],
	'dashboard-widget-recent-posts'
);

// --- Hidden tombstone -------------------------------------------------------

WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'core:dashboard-widget-quick-draft',
	array( 'hidden' => true )
);
$plugin_doc = apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$entry      = $plugin_doc['screens']['dashboard-widgets']['apps'][0];
$T::assert_true(
	'hidden:true contributes a tombstone marker',
	! empty( $entry['__tombstone'] )
);
$T::assert_eq(
	'tombstoned entry id matches the derived form',
	$entry['id'],
	'dashboard-widget-quick-draft'
);

// --- admin.json wins per-entry-id (cascade id-keyed merge) ------------------

WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'core:dashboard-widget-recent-posts',
	array(
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);
// Simulate admin.json `screens[dashboard-widgets].apps[]` claiming the
// same entry id with different placement. Run a manual cascade merge
// to verify the contract.
$plugin_origin = apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$site_origin   = array(
	'screens' => array(
		'dashboard-widgets' => array(
			'apps' => array(
				array(
					'id'   => 'dashboard-widget-recent-posts',
					'app'  => 'core:dashboard-widget-recent-posts',
					'slot' => 'grid',
					'size' => array( 'w' => 4, 'h' => 4 ),
				),
			),
		),
	),
);
$merged = WP_Admin_Workspaces_Merge::merge( $plugin_origin, $site_origin );
$T::assert_eq(
	'admin.json (site origin) entry merges by id over plugin contribution',
	$merged['screens']['dashboard-widgets']['apps'][0]['size'],
	array( 'w' => 4, 'h' => 4 )
);
$T::assert_eq(
	'merged apps[] has one entry (id-merged)',
	count( $merged['screens']['dashboard-widgets']['apps'] ),
	1
);

// --- Standalone flavor (synthesizes a manifest with slotHints) --------------

WP_Admin_Workspaces_Dashboard_Widgets::reset();

$standalone = wp_admin_workspaces_register_dashboard_widget(
	'plugin:wpas-test/sales',
	array(
		'title'        => 'Sales',
		'role'         => 'region',
		'script'       => 'wpas-test',
		'capabilities' => array( 'manage_options' ),
		'slotHints'    => array(
			'defaultSize' => array( 'w' => 2, 'h' => 2 ),
			'minSize'     => array( 'w' => 1, 'h' => 1 ),
			'position'    => 'auto',
		),
	)
);
$T::assert_eq(
	'standalone register returns id',
	$standalone,
	'plugin:wpas-test/sales'
);

WP_Admin_Workspaces_Dashboard_Widgets::flush_pending_registrations();

$manifest = WP_Admin_Workspaces_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/sales' );
$T::assert_true(
	'standalone register seeds manifest registry',
	is_array( $manifest )
);
$T::assert_eq(
	'synthetic manifest preserves title',
	$manifest['title'],
	'Sales'
);
$T::assert_true(
	'synthetic manifest carries slotHints',
	isset( $manifest['slotHints'] )
);
$T::assert_eq(
	'synthetic manifest slotHints defaultSize',
	$manifest['slotHints']['defaultSize'],
	array( 'w' => 2, 'h' => 2 )
);
$T::assert_true(
	'synthetic manifest does not carry legacy dashboardWidget block',
	! isset( $manifest['dashboardWidget'] )
);

// Pre-flush state: a freshly-registered widget must NOT hit the manifest
// registry synchronously.
WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'plugin:wpas-test/deferred',
	array( 'script' => 'wpas-test' )
);
$pre_flush = WP_Admin_Workspaces_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/deferred' );
$T::assert_true(
	'standalone register does NOT synchronously hit the manifest registry',
	$pre_flush === null
);

WP_Admin_Workspaces_Dashboard_Widgets::flush_pending_registrations();
$post_flush = WP_Admin_Workspaces_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/deferred' );
$T::assert_true(
	'flush_pending_registrations forwards the manifest',
	is_array( $post_flush )
);

// Lazy flush via wp_admin_workspaces_data_plugin filter (covers the
// register-then-resolve order where init priority 7 hasn't fired yet).
WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'plugin:wpas-test/lazy',
	array( 'script' => 'wpas-test' )
);
apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$lazy = WP_Admin_Workspaces_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/lazy' );
$T::assert_true(
	'apply_filters(wp_admin_workspaces_data_plugin) lazy-flushes',
	is_array( $lazy )
);

// Standalone-flavor dual-source: top-level placement keys + nested
// slotHints both supplied. Top-level wins per-property.
WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'plugin:wpas-test/dual-source',
	array(
		'script'      => 'wpas-test',
		'defaultSize' => array( 'w' => 3, 'h' => 1 ),  // top-level wins
		'slotHints'   => array(
			'defaultSize' => array( 'w' => 1, 'h' => 1 ),  // overridden
			'minSize'     => array( 'w' => 1, 'h' => 1 ),  // preserved
		),
	)
);
WP_Admin_Workspaces_Dashboard_Widgets::flush_pending_registrations();
$dual_manifest = WP_Admin_Workspaces_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/dual-source' );
$T::assert_eq(
	'synthetic manifest slotHints carries the top-level-wins defaultSize',
	$dual_manifest['slotHints']['defaultSize'],
	array( 'w' => 3, 'h' => 1 )
);
$T::assert_eq(
	'nested slotHints keys survive when not overridden top-level',
	$dual_manifest['slotHints']['minSize'],
	array( 'w' => 1, 'h' => 1 )
);

// Override-only call (no script) should NOT add to the manifest registry.
WP_Admin_Workspaces_Dashboard_Widgets::reset();
wp_admin_workspaces_register_dashboard_widget(
	'plugin:wpas-test/override-only',
	array( 'hidden' => true )
);
$override_only_manifest = WP_Admin_Workspaces_Manifest_Registry::instance()->get_app( 'plugin:wpas-test/override-only' );
$T::assert_true(
	'override-only call does NOT synthesize a manifest',
	$override_only_manifest === null
);

// --- Filter idempotency ----------------------------------------------------
// Reviewer flagged: `apply_filters('wp_admin_workspaces_data_plugin', ...)` may
// fire twice in one request (cache miss after shell switch, test harness,
// anything calling the resolver pipeline twice). A bare `apps[] []=` would
// duplicate the entry. Guard checks for an existing entry id and skips.

WP_Admin_Workspaces_Dashboard_Widgets::reset();
WP_Admin_Workspaces_Dashboard_Widgets::register(
	'core:dashboard-widget-recent-posts',
	array(
		'defaultSize' => array( 'w' => 2, 'h' => 1 ),
	)
);

$idem_doc = array(
	'screens' => array(
		'dashboard-widgets' => array(
			'app'  => 'core:dashboard-host',
			'apps' => array(
				array( 'id' => 'host', 'app' => 'core:dashboard-host' ),
			),
		),
	),
);

$idem_first  = apply_filters( 'wp_admin_workspaces_data_plugin', $idem_doc );
$idem_second = apply_filters( 'wp_admin_workspaces_data_plugin', $idem_first );

$T::assert_eq(
	'idempotency: first apply adds the registered entry',
	count( $idem_first['screens']['dashboard-widgets']['apps'] ),
	2
);
$T::assert_eq(
	'idempotency: second apply does NOT duplicate the entry',
	count( $idem_second['screens']['dashboard-widgets']['apps'] ),
	2
);
$entry_ids = array_map(
	function ( $e ) { return $e['id']; },
	$idem_second['screens']['dashboard-widgets']['apps']
);
$T::assert_true(
	'idempotency: registered entry id present exactly once',
	count( array_filter( $entry_ids, function ( $id ) { return $id === 'dashboard-widget-recent-posts'; } ) ) === 1
);

// --- Entry-id collision across plugin namespaces ---------------------------
// Reviewer flagged: prior derive_entry_id dropped the plugin slug, so two
// plugins shipping the same widget name silently collided. New derivation
// keeps slug + name joined.

WP_Admin_Workspaces_Dashboard_Widgets::reset();

$id_acme  = WP_Admin_Workspaces_Dashboard_Widgets::derive_entry_id( 'plugin:acme/widget' );
$id_bravo = WP_Admin_Workspaces_Dashboard_Widgets::derive_entry_id( 'plugin:bravo/widget' );
$T::assert_eq(
	'entry-id collision: plugin:acme/widget derives acme-widget',
	$id_acme,
	'acme-widget'
);
$T::assert_eq(
	'entry-id collision: plugin:bravo/widget derives bravo-widget',
	$id_bravo,
	'bravo-widget'
);
$T::assert_true(
	'entry-id collision: distinct plugins produce distinct ids',
	$id_acme !== $id_bravo
);

// --- Reset cleanup ---------------------------------------------------------

WP_Admin_Workspaces_Dashboard_Widgets::reset();

// ===========================================================================
// Classic dashboard-widget BRIDGE (#134).
// ===========================================================================
// The bridge (WP_Admin_Workspaces_Dashboard_Bridge) harvests plugin dashboard
// meta-boxes into captured-HTML tiles, skipping the core widgets the shell
// ships native after #133.

WP_Admin_Workspaces_Dashboard_Bridge::reset();

// --- Skip-list: core widget ids -------------------------------------------

$T::assert_true(
	'bridge skips dashboard_right_now (native at-a-glance)',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'dashboard_right_now' )
);
$T::assert_true(
	'bridge skips dashboard_activity (native activity)',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'dashboard_activity' )
);
$T::assert_true(
	'bridge skips dashboard_quick_press (native quick-draft)',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'dashboard_quick_press' )
);
$T::assert_true(
	'bridge skips dashboard_primary (news feed)',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'dashboard_primary' )
);
$T::assert_eq(
	'bridge does NOT skip an arbitrary plugin widget id',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'acme_sales_widget' ),
	false
);
$T::assert_eq(
	'bridge is_core_widget rejects non-string',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( null ),
	false
);

// --- Skip-list filter ------------------------------------------------------

WP_Admin_Workspaces_Dashboard_Bridge::reset();
$skip_cb = function ( $ids ) {
	$ids[] = 'acme_promoted_native';
	return $ids;
};
add_filter( 'wp_admin_workspaces_dashboard_core_widget_ids', $skip_cb );
$T::assert_true(
	'wp_admin_workspaces_dashboard_core_widget_ids filter extends the skip-list',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'acme_promoted_native' )
);
remove_filter( 'wp_admin_workspaces_dashboard_core_widget_ids', $skip_cb );
WP_Admin_Workspaces_Dashboard_Bridge::reset();
$T::assert_eq(
	'skip-list filter memo resets — id no longer core after reset',
	WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget( 'acme_promoted_native' ),
	false
);

// --- Entry-id derivation (schema-safe + classic- namespace) ----------------

$T::assert_eq(
	'bridge entry-id: underscores → kebab + classic- prefix',
	WP_Admin_Workspaces_Dashboard_Bridge::derive_entry_id( 'acme_sales_stats' ),
	'classic-acme-sales-stats'
);
$T::assert_eq(
	'bridge entry-id: uppercase + mixed chars normalized',
	WP_Admin_Workspaces_Dashboard_Bridge::derive_entry_id( 'My_Plugin.Box-1' ),
	'classic-my-plugin-box-1'
);
$T::assert_eq(
	'bridge entry-id: empty falls back to classic-widget',
	WP_Admin_Workspaces_Dashboard_Bridge::derive_entry_id( '___' ),
	'classic-widget'
);
$T::assert_true(
	'bridge entry-id matches the appsEntry id pattern ^[a-z][a-z0-9-]*$',
	(bool) preg_match(
		'/^[a-z][a-z0-9-]*$/',
		WP_Admin_Workspaces_Dashboard_Bridge::derive_entry_id( 'Weird__Id!!' )
	)
);

// --- Tile-entry shape ------------------------------------------------------

$tile = WP_Admin_Workspaces_Dashboard_Bridge::build_tile_entry( array(
	'widget_id' => 'acme_sales_stats',
	'entry_id'  => 'classic-acme-sales-stats',
	'title'     => 'Acme Sales',
	'context'   => 'normal',
) );
$T::assert_eq( 'tile entry id', $tile['id'], 'classic-acme-sales-stats' );
$T::assert_eq( 'tile entry app is the shared captured-HTML app', $tile['app'], 'core:dashboard-widget-classic' );
$T::assert_eq( 'tile entry slot is grid', $tile['slot'], 'grid' );
$T::assert_eq( 'tile entry config.widgetId is the raw meta-box id', $tile['config']['widgetId'], 'acme_sales_stats' );
$T::assert_eq( 'tile entry config.title is the harvested title', $tile['config']['title'], 'Acme Sales' );

// --- End-to-end harvest + synthesis ----------------------------------------
// Register a fake plugin widget + a core widget id into the dashboard, run the
// harvest, and assert the bridge synthesizes a tile for the plugin one only.

WP_Admin_Workspaces_Dashboard_Bridge::reset();

$register_widgets = function () {
	// Plugin widget — should be harvested.
	if ( function_exists( 'wp_add_dashboard_widget' ) ) {
		wp_add_dashboard_widget(
			'acme_sales_stats',
			'Acme Sales <a href="#" class="edit-box">Configure</a>',
			function () {
				echo '<p>Acme captured HTML</p>';
			}
		);
		// A widget masquerading as core — should be SKIPPED.
		wp_add_dashboard_widget(
			'dashboard_right_now',
			'Hijacked Right Now',
			function () {
				echo 'should not surface';
			}
		);
	}
};
add_action( 'wp_dashboard_setup', $register_widgets );

$records = WP_Admin_Workspaces_Dashboard_Bridge::harvest_widgets();

remove_action( 'wp_dashboard_setup', $register_widgets );

// REGRESSION GUARD (#134 review): `ensure_dashboard_setup()` forces the
// `dashboard` screen around `wp_dashboard_setup()` so widgets file under
// `$wp_meta_boxes['dashboard']` regardless of the calling context (shell render
// = `wp-admin-workspaces` screen; REST = no screen). The harvest MUST therefore
// return a non-empty set here — these assertions run unconditionally (no
// `! empty( $records )` skip-guard) so a screen-context regression fails CI.
$T::assert_true(
	'harvest returns a non-empty record set (dashboard screen forced)',
	! empty( $records )
);

$ids = array_column( $records, 'widget_id' );
$T::assert_true(
	'harvest surfaces the plugin widget',
	in_array( 'acme_sales_stats', $ids, true )
);
$T::assert_true(
	'harvest skips a core-masquerading widget id',
	! in_array( 'dashboard_right_now', $ids, true )
);

// Title is tag-stripped for the display label.
$acme = null;
foreach ( $records as $r ) {
	if ( $r['widget_id'] === 'acme_sales_stats' ) {
		$acme = $r;
		break;
	}
}
$T::assert_true( 'harvest record found for plugin widget', is_array( $acme ) );
if ( is_array( $acme ) ) {
	$T::assert_eq(
		'harvested title strips config-link markup',
		$acme['title'],
		'Acme Sales Configure'
	);
	$T::assert_eq(
		'harvested entry id is namespaced classic-',
		$acme['entry_id'],
		'classic-acme-sales-stats'
	);
}

// Cascade contribution synthesizes the tile into the target screen.
$bridge_doc = apply_filters( 'wp_admin_workspaces_data_plugin', array() );
$T::assert_true(
	'bridge contributes screens[dashboard-widgets].apps[]',
	isset( $bridge_doc['screens']['dashboard-widgets']['apps'] )
	&& is_array( $bridge_doc['screens']['dashboard-widgets']['apps'] )
);
$apps_out = $bridge_doc['screens']['dashboard-widgets']['apps'];
$bridge_entry = null;
foreach ( $apps_out as $e ) {
	if ( isset( $e['id'] ) && $e['id'] === 'classic-acme-sales-stats' ) {
		$bridge_entry = $e;
		break;
	}
}
$T::assert_true( 'synthesized tile entry present in apps[]', is_array( $bridge_entry ) );
if ( is_array( $bridge_entry ) ) {
	$T::assert_eq( 'synthesized tile mounts the captured-HTML app', $bridge_entry['app'], 'core:dashboard-widget-classic' );
	$T::assert_eq( 'synthesized tile config.widgetId', $bridge_entry['config']['widgetId'], 'acme_sales_stats' );
}

// First-write-wins: an author entry with the same id is NOT overwritten,
// and the bridge appends nothing for that id (idempotent).
WP_Admin_Workspaces_Dashboard_Bridge::reset();
add_action( 'wp_dashboard_setup', $register_widgets );
$pre_doc = array(
	'screens' => array(
		'dashboard-widgets' => array(
			'apps' => array(
				array(
					'id'  => 'classic-acme-sales-stats',
					'app' => 'plugin:acme/native-tile',
				),
			),
		),
	),
);
$after = apply_filters( 'wp_admin_workspaces_data_plugin', $pre_doc );
remove_action( 'wp_dashboard_setup', $register_widgets );
$matching = array_filter(
	$after['screens']['dashboard-widgets']['apps'],
	function ( $e ) {
		return isset( $e['id'] ) && $e['id'] === 'classic-acme-sales-stats';
	}
);
$T::assert_eq(
	'first-write-wins: author entry id appears exactly once',
	count( $matching ),
	1
);
$matching = array_values( $matching );
$T::assert_eq(
	'first-write-wins: author entry survives (bridge did not overwrite)',
	$matching[0]['app'],
	'plugin:acme/native-tile'
);

// --- Screen-context restoration --------------------------------------------
// `ensure_dashboard_setup()` forces the `dashboard` screen then restores the
// prior one. The harvest above must NOT have left the global current screen
// pointing at `dashboard` (which would corrupt the surrounding shell render /
// REST request). Prior screen was null here (CLI), so it should be cleared.
WP_Admin_Workspaces_Dashboard_Bridge::reset();
if ( function_exists( 'set_current_screen' ) && function_exists( 'get_current_screen' ) ) {
	set_current_screen( 'wp-admin-workspaces' );
	$before_id = get_current_screen() ? get_current_screen()->id : null;
	add_action( 'wp_dashboard_setup', $register_widgets );
	WP_Admin_Workspaces_Dashboard_Bridge::harvest_widgets();
	remove_action( 'wp_dashboard_setup', $register_widgets );
	$after_id = get_current_screen() ? get_current_screen()->id : null;
	$T::assert_eq(
		'harvest restores the prior current screen (not left on dashboard)',
		$after_id,
		$before_id
	);
}

// --- entry_id collision disambiguation -------------------------------------
// Two DISTINCT raw widget ids that kebab-normalize to the same entry_id must
// both survive — the second is disambiguated with a short hash, not dropped.
WP_Admin_Workspaces_Dashboard_Bridge::reset();
$collide_widgets = function () {
	if ( function_exists( 'wp_add_dashboard_widget' ) ) {
		wp_add_dashboard_widget( 'Acme_Box', 'Acme Box A', function () {
			echo 'a';
		} );
		wp_add_dashboard_widget( 'acme-box', 'Acme Box B', function () {
			echo 'b';
		} );
	}
};
add_action( 'wp_dashboard_setup', $collide_widgets );
$collide_records = WP_Admin_Workspaces_Dashboard_Bridge::harvest_widgets();
remove_action( 'wp_dashboard_setup', $collide_widgets );
$collide_entries = array_column( $collide_records, 'entry_id' );
// Both raw ids surface (both have a record).
$collide_raw = array_column( $collide_records, 'widget_id' );
$T::assert_true(
	'collision: both colliding raw widget ids are harvested',
	in_array( 'Acme_Box', $collide_raw, true ) && in_array( 'acme-box', $collide_raw, true )
);
$T::assert_true(
	'collision: base entry id classic-acme-box is present',
	in_array( 'classic-acme-box', $collide_entries, true )
);
$T::assert_eq(
	'collision: the two colliding tiles have DISTINCT entry ids',
	count( array_unique( $collide_entries ) ),
	count( $collide_entries )
);
$T::assert_true(
	'collision: disambiguated entry id matches the schema pattern',
	(bool) preg_match( '/^classic-acme-box(-[0-9a-f]{6})?$/', $collide_entries[1] )
);

WP_Admin_Workspaces_Dashboard_Bridge::reset();

// --- Summary ---------------------------------------------------------------

$total = WPAS_Dashboard_Widgets_Test_Runner::$pass + WPAS_Dashboard_Widgets_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Dashboard_Widgets_Test_Runner::$pass . " passed, " . WPAS_Dashboard_Widgets_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Dashboard_Widgets_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
