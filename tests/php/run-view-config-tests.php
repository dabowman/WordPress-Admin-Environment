<?php
/**
 * View-config + field-collections tests — v3 shape.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-view-config-tests.php`
 *
 * Coverage:
 *   - `WP_Admin_Shell_Field_Collections::register` validation + readback.
 *   - `WP_Admin_Shell_Field_Collections::find_for` exact + universal match.
 *   - `WP_Admin_Shell_View_Config::resolve_global` walks `settings.views[kind][name]`.
 *   - `WP_Admin_Shell_View_Config::resolve_screen_view` deep-merges inline overlay.
 *   - `fieldsRef` against `settings.fields`.
 *   - `wp_admin_shell_view_config_{kind}_{name}` filter (no variant variant in v3).
 *   - `merge_fields` ref-wins-inline-overrides semantics.
 *   - `inject_app_baselines` reads app manifest `view` block and writes
 *     into `settings.views`.
 *   - Tombstones via `null` on overlay key + `__tombstone` on array entries.
 *
 * The harness builds synthetic pre-resolved config trees and calls the
 * resolver directly with `$config` to avoid depending on disk shells.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_View_Config_Test_Runner {
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

WP_Admin_Shell_Field_Collections::reset();

// --- Field-collection registration ------------------------------------------

$id = wp_admin_shell_register_field_collection(
	'core/post-fields',
	'postType',
	'post',
	array(
		array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
		array( 'id' => 'status', 'type' => 'text', 'label' => 'Status' ),
	)
);
WPAS_View_Config_Test_Runner::assert_eq( 'register returns id', $id, 'core/post-fields' );

$registry = WP_Admin_Shell_Field_Collections::all();
WPAS_View_Config_Test_Runner::assert_true(
	'registry contains registered id',
	isset( $registry['core/post-fields'] )
);
WPAS_View_Config_Test_Runner::assert_eq(
	'registered kind preserved',
	$registry['core/post-fields']['kind'],
	'postType'
);

// Universal collection (null name).
wp_admin_shell_register_field_collection(
	'core/audit-fields',
	'postType',
	null,
	array( array( 'id' => 'modified', 'type' => 'datetime', 'label' => 'Modified' ) )
);

$matches = WP_Admin_Shell_Field_Collections::find_for( 'postType', 'post' );
WPAS_View_Config_Test_Runner::assert_true(
	'find_for picks up exact match',
	isset( $matches['core/post-fields'] )
);
WPAS_View_Config_Test_Runner::assert_true(
	'find_for picks up universal match',
	isset( $matches['core/audit-fields'] )
);

// --- Validation rejections --------------------------------------------------

$err = wp_admin_shell_register_field_collection( '', 'postType', 'post', array() );
WPAS_View_Config_Test_Runner::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_shell_register_field_collection( 'x', 'postType', 'post', 'not-an-array' );
WPAS_View_Config_Test_Runner::assert_wp_error( 'register rejects non-array fields', $err );

// --- merge_fields semantics -------------------------------------------------

$base = array(
	array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
	array( 'id' => 'status', 'type' => 'text', 'label' => 'Status' ),
);
$inline = array(
	array( 'id' => 'status', 'label' => 'Post Status' ),
	array( 'id' => 'author', 'type' => 'text', 'label' => 'Author' ),
);
$merged = WP_Admin_Shell_View_Config::merge_fields( $base, $inline );

WPAS_View_Config_Test_Runner::assert_eq(
	'merge keeps base count + appends inline-only ids',
	count( $merged ),
	3
);
WPAS_View_Config_Test_Runner::assert_eq(
	'merge second field is status with override applied',
	$merged[1]['label'],
	'Post Status'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'merge preserves base props not overridden',
	$merged[1]['type'],
	'text'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'merge appends inline-only ids',
	$merged[2]['id'],
	'author'
);

// --- Global view resolution against synthetic config ------------------------

$synthetic = array(
	'settings' => array(
		'fields' => array(
			'core/post-fields' => array(
				'kind'   => 'postType',
				'name'   => 'post',
				'fields' => $base,
			),
		),
		'views' => array(
			'postType' => array(
				'post' => array(
					'fieldsRef'   => 'core/post-fields',
					'fields'      => array(
						array( 'id' => 'status', 'label' => 'Post Status' ),
					),
					'defaultView' => array( 'type' => 'table', 'perPage' => 25 ),
					'actions'     => array(
						array( 'id' => 'edit', 'label' => 'Edit', 'isPrimary' => true ),
						array( 'id' => 'trash', 'label' => 'Move to Trash' ),
						array( 'id' => 'view', 'label' => 'View' ),
					),
				),
			),
		),
	),
);

$resolved = WP_Admin_Shell_View_Config::resolve_global( 'postType', 'post', $synthetic );

WPAS_View_Config_Test_Runner::assert_eq(
	'resolve_global reads settings.views[kind][name]',
	$resolved['defaultView']['type'],
	'table'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'fieldsRef applied — inline label overrides collection',
	$resolved['fields'][1]['label'],
	'Post Status'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'_resolvedFieldsRef stamped on resolved doc',
	$resolved['_resolvedFieldsRef'],
	'core/post-fields'
);

// Unknown pair returns empty array.
$missing = WP_Admin_Shell_View_Config::resolve_global( 'postType', 'page', $synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'resolve_global returns empty array for unknown pair',
	$missing,
	array()
);

// Empty kind/name returns empty.
$empty_kind = WP_Admin_Shell_View_Config::resolve_global( '', 'post', $synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'empty kind returns empty array',
	$empty_kind,
	array()
);

// --- Filter machinery -------------------------------------------------------

$filter_fired_with = null;
$filter_callback = function ( $doc, $kind, $name ) use ( &$filter_fired_with ) {
	$filter_fired_with = array( $kind, $name );
	$doc['_filtered']  = true;
	return $doc;
};

add_filter( 'wp_admin_shell_view_config_postType_post', $filter_callback, 10, 3 );
$filtered = WP_Admin_Shell_View_Config::resolve_global( 'postType', 'post', $synthetic );
WPAS_View_Config_Test_Runner::assert_true(
	'filter applied on resolve_global',
	! empty( $filtered['_filtered'] )
);
WPAS_View_Config_Test_Runner::assert_eq(
	'filter receives kind argument',
	$filter_fired_with[0],
	'postType'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'filter receives name argument',
	$filter_fired_with[1],
	'post'
);
remove_filter( 'wp_admin_shell_view_config_postType_post', $filter_callback, 10 );

// --- Screen-view resolution -------------------------------------------------

// Build a synthetic config with screens + a manifest registry seeded with
// a posts app declaring its `view` baseline. The view-config resolver
// uses the registry to infer kind/name from the screen's app+config.
$reg = WP_Admin_Shell_Manifest_Registry::instance();
$reg->register_app( array(
	'id'         => 'plugin:wpas-test/screen-view-posts',
	'version'    => 1,
	'title'      => 'Screen-View Posts',
	'role'       => 'main',
	'script'     => 'wpas-test',
	'view'       => array(
		'kind' => 'postType',
		'name' => 'post',
	),
) );

$screen_synthetic = array(
	'settings' => array(
		'views' => array(
			'postType' => array(
				'post' => array(
					'fields' => array(
						array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
						array( 'id' => 'status', 'type' => 'text', 'label' => 'Status' ),
						array( 'id' => 'date', 'type' => 'datetime', 'label' => 'Date' ),
					),
					'defaultView' => array( 'type' => 'table', 'perPage' => 25 ),
					'actions' => array(
						array( 'id' => 'edit', 'label' => 'Edit' ),
						array( 'id' => 'trash', 'label' => 'Move to Trash' ),
						array( 'id' => 'view', 'label' => 'View' ),
					),
				),
			),
		),
	),
	'screens' => array(
		'posts' => array(
			'label'  => 'Posts',
			'app'    => 'plugin:wpas-test/screen-view-posts',
			'config' => array( 'postType' => 'post' ),
		),
		'posts-drafts' => array(
			'label'  => 'Drafts',
			'app'    => 'plugin:wpas-test/screen-view-posts',
			'config' => array( 'postType' => 'post' ),
			'view'   => array(
				'defaultView' => array(
					'filters' => array(
						array( 'field' => 'status', 'value' => 'draft' ),
					),
				),
			),
		),
		'posts-trash' => array(
			'label'  => 'Trash',
			'app'    => 'plugin:wpas-test/screen-view-posts',
			'config' => array( 'postType' => 'post' ),
			'view'   => array(
				'defaultView' => array(
					'filters' => array(
						array( 'field' => 'status', 'value' => 'trash' ),
					),
				),
				'actions' => array(
					array( 'id' => 'trash', '__tombstone' => true ),
					array( 'id' => 'restore', 'label' => 'Restore', 'isPrimary' => true ),
				),
			),
		),
	),
);

// Screen with no inline view — returns the global.
$base_screen = WP_Admin_Shell_View_Config::resolve_screen_view( 'posts', $screen_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'screen without inline view returns global view',
	$base_screen['defaultView']['perPage'],
	25
);
WPAS_View_Config_Test_Runner::assert_eq(
	'screen-view inherits all global fields',
	count( $base_screen['fields'] ),
	3
);

// Screen with inline view overlay — deep-merges with global.
$drafts = WP_Admin_Shell_View_Config::resolve_screen_view( 'posts-drafts', $screen_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'inline overlay sets filters on defaultView',
	$drafts['defaultView']['filters'][0]['value'],
	'draft'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'inline overlay preserves global defaultView.perPage',
	$drafts['defaultView']['perPage'],
	25
);
WPAS_View_Config_Test_Runner::assert_eq(
	'inline overlay screen inherits all global fields',
	count( $drafts['fields'] ),
	3
);

// Trash screen exercises action-array tombstone + append.
$trash = WP_Admin_Shell_View_Config::resolve_screen_view( 'posts-trash', $screen_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'tombstone removed `trash` action; new appended → 3 total actions',
	count( $trash['actions'] ),
	3
);
$action_ids = array_map( function ( $a ) {
	return $a['id'];
}, $trash['actions'] );
WPAS_View_Config_Test_Runner::assert_true(
	'tombstone removed trash action id',
	! in_array( 'trash', $action_ids, true )
);
WPAS_View_Config_Test_Runner::assert_true(
	'new action appended after surviving base actions',
	in_array( 'restore', $action_ids, true )
);
WPAS_View_Config_Test_Runner::assert_true(
	'__tombstone flag stripped from passthrough entries',
	! isset( $trash['actions'][0]['__tombstone'] )
);

// Unknown screen returns empty.
$nothing = WP_Admin_Shell_View_Config::resolve_screen_view( 'no-such', $screen_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'unknown screen id returns empty array',
	$nothing,
	array()
);

// Empty / non-string screen id returns empty.
$empty_id = WP_Admin_Shell_View_Config::resolve_screen_view( '', $screen_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'empty screen id returns empty array',
	$empty_id,
	array()
);

// Null tombstone on a top-level key removes that key from the merged doc.
$tomb_synthetic = $screen_synthetic;
$tomb_synthetic['screens']['posts-no-default'] = array(
	'label'  => 'No Default',
	'app'    => 'plugin:wpas-test/screen-view-posts',
	'config' => array( 'postType' => 'post' ),
	'view'   => array( 'defaultView' => null ),
);
$no_default = WP_Admin_Shell_View_Config::resolve_screen_view( 'posts-no-default', $tomb_synthetic );
WPAS_View_Config_Test_Runner::assert_true(
	'null tombstone removes global defaultView from merged doc',
	! isset( $no_default['defaultView'] )
);

// viewKind / viewName explicit escape hatch on the screen.
$explicit_synthetic = array(
	'settings' => array(
		'views' => array(
			'custom' => array(
				'thing' => array( 'defaultView' => array( 'type' => 'grid' ) ),
			),
		),
	),
	'screens' => array(
		'thing-screen' => array(
			'app'      => 'plugin:wpas-test/does-not-need-view-manifest',
			'viewKind' => 'custom',
			'viewName' => 'thing',
		),
	),
);
$explicit = WP_Admin_Shell_View_Config::resolve_screen_view( 'thing-screen', $explicit_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'viewKind/viewName escape hatch resolves global',
	$explicit['defaultView']['type'],
	'grid'
);

// Taxonomy-kind config.taxonomy override — manifest declares `category`
// baseline, screen mounts with `config.taxonomy = post_tag`, resolver
// looks at `settings.views.taxonomy.post_tag`.
$reg->register_app( array(
	'id'      => 'plugin:wpas-test/screen-view-taxonomy',
	'version' => 1,
	'title'   => 'Screen-View Taxonomy',
	'role'    => 'main',
	'script'  => 'wpas-test',
	'view'    => array(
		'kind' => 'taxonomy',
		'name' => 'category',
	),
) );
$tax_synthetic = array(
	'settings' => array(
		'views' => array(
			'taxonomy' => array(
				'category' => array( 'defaultView' => array( 'type' => 'table' ) ),
				'post_tag' => array( 'defaultView' => array( 'type' => 'grid' ) ),
			),
		),
	),
	'screens' => array(
		'tags' => array(
			'app'    => 'plugin:wpas-test/screen-view-taxonomy',
			'config' => array( 'taxonomy' => 'post_tag' ),
		),
	),
);
$tags = WP_Admin_Shell_View_Config::resolve_screen_view( 'tags', $tax_synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'config.taxonomy overrides manifest baseline name',
	$tags['defaultView']['type'],
	'grid'
);

// --- inject_app_baselines (v3 settings.views target) ------------------------

$reg->register_app( array(
	'id'      => 'plugin:wpas-test/recipe-app',
	'version' => 1,
	'title'   => 'Recipe App',
	'role'    => 'main',
	'script'  => 'wpas-test',
	'view'    => array(
		'kind'        => 'postType',
		'name'        => 'recipe',
		'defaultView' => array( 'type' => 'table', 'perPage' => 25 ),
		'fields'      => array(
			array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
		),
	),
) );

$injected = WP_Admin_Shell_View_Config::inject_app_baselines( array() );
WPAS_View_Config_Test_Runner::assert_true(
	'app baseline injected under settings.views',
	isset( $injected['settings']['views']['postType']['recipe'] )
);
WPAS_View_Config_Test_Runner::assert_eq(
	'baseline preserves defaultView',
	$injected['settings']['views']['postType']['recipe']['defaultView']['perPage'],
	25
);
WPAS_View_Config_Test_Runner::assert_true(
	'baseline strips redundant kind/name keys',
	! isset( $injected['settings']['views']['postType']['recipe']['kind'] )
);
WPAS_View_Config_Test_Runner::assert_true(
	'baseline strips legacy variant key (variants gone in v3)',
	! isset( $injected['settings']['views']['postType']['recipe']['variant'] )
);

// Pre-existing inline declaration wins over manifest baseline.
$prepopulated = WP_Admin_Shell_View_Config::inject_app_baselines( array(
	'settings' => array(
		'views' => array(
			'postType' => array(
				'recipe' => array(
					'defaultView' => array( 'type' => 'grid', 'perPage' => 999 ),
				),
			),
		),
	),
) );
WPAS_View_Config_Test_Runner::assert_eq(
	'pre-existing inline declaration wins over manifest baseline',
	$prepopulated['settings']['views']['postType']['recipe']['defaultView']['perPage'],
	999
);

// Apps without a view block are skipped silently.
$reg->register_app( array(
	'id'      => 'plugin:wpas-test/no-view-app',
	'version' => 1,
	'title'   => 'No-View App',
	'role'    => 'main',
	'script'  => 'wpas-test',
) );
$injected_after = WP_Admin_Shell_View_Config::inject_app_baselines( array() );
WPAS_View_Config_Test_Runner::assert_true(
	'app without view block does not add stray entries',
	! isset( $injected_after['settings']['views']['no-view-app'] )
);

// Manifest with empty kind or name skipped (defensive).
$reg->register_app( array(
	'id'      => 'plugin:wpas-test/bad-view-app',
	'version' => 1,
	'title'   => 'Bad-View App',
	'role'    => 'main',
	'script'  => 'wpas-test',
	'view'    => array( 'kind' => '', 'name' => '' ),
) );
$injected_bad = WP_Admin_Shell_View_Config::inject_app_baselines( array() );
WPAS_View_Config_Test_Runner::assert_true(
	'manifest with empty kind/name skipped',
	! isset( $injected_bad['settings']['views'][''] )
);

// --- Tombstones via cascade merge engine (deep keyed-array path) -----------

// Confirms `__tombstone` on a fields-entry survives a fully-nested merge
// invocation through the same code path the cascade resolver uses for the
// settings.views.<kind>.<name>.fields[] array. We exercise
// `WP_Admin_Shell_Merge::merge` directly rather than going through the
// `resolve_with` pipeline because the consumer-origin `customizable` filter
// (a v2-era surface scoped to settings.applications + settings.regions)
// currently strips `settings.views` from site/role/user origins — a
// separate v3 customizable surface refactor lives outside this resolver's
// scope. The merge engine itself, which is what runs on every trusted
// origin and underpins the entire cascade, IS correct.
$views_base = array(
	'settings' => array(
		'views' => array(
			'postType' => array(
				'post' => array(
					'fields' => array(
						array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
						array( 'id' => 'author', 'type' => 'text', 'label' => 'Author' ),
						array( 'id' => 'date', 'type' => 'datetime', 'label' => 'Date' ),
					),
				),
			),
		),
	),
);
$views_over = array(
	'settings' => array(
		'views' => array(
			'postType' => array(
				'post' => array(
					'fields' => array(
						array( 'id' => 'author', '__tombstone' => true ),
					),
				),
			),
		),
	),
);
$views_merged = WP_Admin_Shell_Merge::merge( $views_base, $views_over );
$mfields = $views_merged['settings']['views']['postType']['post']['fields'];
WPAS_View_Config_Test_Runner::assert_eq(
	'cascade __tombstone removes a field from settings.views.fields[]',
	count( $mfields ),
	2
);
$mfield_ids = array_map( function ( $f ) {
	return $f['id'];
}, $mfields );
WPAS_View_Config_Test_Runner::assert_true(
	'cascade __tombstone removed `author` field, `title`+`date` survive',
	! in_array( 'author', $mfield_ids, true ) &&
	in_array( 'title', $mfield_ids, true ) &&
	in_array( 'date', $mfield_ids, true )
);

// --- Fields registry duplicate-id rejection ---------------------------------

WP_Admin_Shell_Field_Collections::reset();
$first = wp_admin_shell_register_field_collection( 'core/dup', 'postType', 'post', array() );
WPAS_View_Config_Test_Runner::assert_eq( 'first registration succeeds', $first, 'core/dup' );
$second = wp_admin_shell_register_field_collection( 'core/dup', 'postType', 'post', array() );
WPAS_View_Config_Test_Runner::assert_wp_error( 'duplicate id rejected', $second );
WP_Admin_Shell_Field_Collections::reset();

// --- Cascade contribution — registry → plugin origin ------------------------

wp_admin_shell_register_field_collection(
	'plugin/extra-fields',
	'postType',
	'product',
	array( array( 'id' => 'sku', 'type' => 'text', 'label' => 'SKU' ) )
);
$plugin_doc = apply_filters( 'wp_admin_shell_data_plugin', array() );
WPAS_View_Config_Test_Runner::assert_true(
	'plugin origin contains injected fieldCollections',
	isset( $plugin_doc['fieldCollections']['plugin/extra-fields'] )
);
WP_Admin_Shell_Field_Collections::reset();

// --- Implicit cascade load (resolve_global with $config = null) -------------

$auto_resolved = WP_Admin_Shell_View_Config::resolve_global( 'postType', 'post' );
WPAS_View_Config_Test_Runner::assert_true(
	'resolve_global() with null config returns array (cascade auto-load)',
	is_array( $auto_resolved )
);

$auto_screen = WP_Admin_Shell_View_Config::resolve_screen_view( 'no-such-screen' );
WPAS_View_Config_Test_Runner::assert_eq(
	'resolve_screen_view() unknown screen returns empty',
	$auto_screen,
	array()
);

// --- Summary ---------------------------------------------------------------

$total = WPAS_View_Config_Test_Runner::$pass + WPAS_View_Config_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_View_Config_Test_Runner::$pass . " passed, " . WPAS_View_Config_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_View_Config_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
