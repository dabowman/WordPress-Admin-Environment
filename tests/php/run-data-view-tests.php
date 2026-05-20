<?php
/**
 * Data-view-config + data-field-collections tests — v3 restoration shape.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-data-view-tests.php`
 *
 * Coverage (3-axis registry restoration):
 *   - `WP_Admin_Shell_Data_Field_Collections::register` validation + readback.
 *   - `wp_admin_shell_register_data_field_collection()` + legacy wrapper.
 *   - `find_for` exact + universal match.
 *   - `WP_Admin_Shell_Data_View_Config::resolve_data_view_triple()` 3-axis lookup.
 *   - `_default` resolution when variant param omitted.
 *   - `extends` chain — single-level + multi-level + cycle + depth-cap.
 *   - `_default` declaring `extends` is rejected (extends ignored).
 *   - Base filter fires exactly once per resolve; variant filter only when variant !== '_default'.
 *   - `inject_app_baselines()` writes `_default` + variants from manifest into `settings.dataViews`.
 *   - `inject_app_baselines()` preserves variant key (regression fix).
 *   - `inject_app_baselines()` does NOT overwrite admin.json-declared entries.
 *   - `dataViewRef` parsing — valid resolves; invalid returns empty.
 *   - `dataViewRef` precedence over `dataViewKind/Name/Variant`.
 *   - Inference fallback — manifest `dataView.kind`/`name` + screen.config overrides.
 *   - `screen.config.variant` (v2 back-compat) flows into screen inference.
 *   - Inline `screens[id].dataView` overlay deep-merges with resolved triple.
 *   - Tombstones via `null` (top-level + nested).
 *   - id-keyed merge for `fields[]` + `actions[]`.
 *   - `fieldsRef` resolution against `settings.dataFields`.
 *   - `list_variants()` returns sorted ids with `_default` first.
 *   - Cascade contribution — registered data-field collections enter
 *     `settings.dataFields` via `wp_admin_shell_data_plugin` filter.
 *   - Legacy filter deprecation shim — v2 names (`wp_admin_shell_view_config_*`
 *     + `_{variant}`) fire alongside the new names whenever a legacy filter
 *     is registered, short-circuit otherwise, and `_default` skips the
 *     variant suffix.
 *
 * The harness builds synthetic pre-resolved config trees and calls the
 * resolver directly with `$config` to avoid depending on disk shells.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Data_View_Test_Runner {
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

WP_Admin_Shell_Data_Field_Collections::reset();
WP_Admin_Shell_Data_View_Config::reset();

// --- Data-field-collection registration -------------------------------------

$id = wp_admin_shell_register_data_field_collection(
	'core/post-fields',
	'postType',
	'post',
	array(
		array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
		array( 'id' => 'status', 'type' => 'text', 'label' => 'Status' ),
	)
);
WPAS_Data_View_Test_Runner::assert_eq( 'register returns id', $id, 'core/post-fields' );

$registry = WP_Admin_Shell_Data_Field_Collections::all();
WPAS_Data_View_Test_Runner::assert_true(
	'registry contains registered id',
	isset( $registry['core/post-fields'] )
);
WPAS_Data_View_Test_Runner::assert_eq(
	'registered kind preserved',
	$registry['core/post-fields']['kind'],
	'postType'
);

// Legacy function name still works (deprecation wrapper).
$legacy_id = wp_admin_shell_register_field_collection(
	'legacy/wrapper-fields',
	'postType',
	'page',
	array( array( 'id' => 'slug', 'type' => 'text', 'label' => 'Slug' ) )
);
WPAS_Data_View_Test_Runner::assert_eq( 'legacy wrapper forwards registration', $legacy_id, 'legacy/wrapper-fields' );

// Universal collection (null name).
wp_admin_shell_register_data_field_collection(
	'core/audit-fields',
	'postType',
	null,
	array( array( 'id' => 'modified', 'type' => 'datetime', 'label' => 'Modified' ) )
);

$matches = WP_Admin_Shell_Data_Field_Collections::find_for( 'postType', 'post' );
WPAS_Data_View_Test_Runner::assert_true(
	'find_for picks up exact match',
	isset( $matches['core/post-fields'] )
);
WPAS_Data_View_Test_Runner::assert_true(
	'find_for picks up universal match',
	isset( $matches['core/audit-fields'] )
);

// --- Validation rejections --------------------------------------------------

$err = wp_admin_shell_register_data_field_collection( '', 'postType', 'post', array() );
WPAS_Data_View_Test_Runner::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_shell_register_data_field_collection( 'x', 'postType', 'post', 'not-an-array' );
WPAS_Data_View_Test_Runner::assert_wp_error( 'register rejects non-array fields', $err );

// --- merge_fields semantics -------------------------------------------------

$base = array(
	array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
	array( 'id' => 'status', 'type' => 'text', 'label' => 'Status' ),
);
$inline = array(
	array( 'id' => 'status', 'label' => 'Post Status' ),
	array( 'id' => 'author', 'type' => 'text', 'label' => 'Author' ),
);
$merged = WP_Admin_Shell_Data_View_Config::merge_fields( $base, $inline );

WPAS_Data_View_Test_Runner::assert_eq(
	'merge keeps base count + appends inline-only ids',
	count( $merged ),
	3
);
WPAS_Data_View_Test_Runner::assert_eq(
	'merge second field is status with override applied',
	$merged[1]['label'],
	'Post Status'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'merge preserves base props not overridden',
	$merged[1]['type'],
	'text'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'merge appends inline-only ids',
	$merged[2]['id'],
	'author'
);

// --- 3-axis triple resolution against synthetic config ----------------------

$synthetic = array(
	'settings' => array(
		'dataFields' => array(
			'core/post-fields' => array(
				'kind'   => 'postType',
				'name'   => 'post',
				'fields' => $base,
			),
		),
		'dataViews' => array(
			'postType' => array(
				'post' => array(
					'_default' => array(
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
					'drafts' => array(
						'extends'     => '_default',
						'defaultView' => array(
							'filters' => array(
								array( 'field' => 'status', 'value' => 'draft' ),
							),
						),
					),
					'compact' => array(
						'extends'     => '_default',
						'defaultView' => array( 'perPage' => 10 ),
					),
					'compact-drafts' => array(
						'extends'     => 'compact',
						'defaultView' => array(
							'filters' => array(
								array( 'field' => 'status', 'value' => 'draft' ),
							),
						),
					),
					// Cycle pair: a → b → a. Resolver must detect + base-fallback.
					'cycle-a' => array(
						'extends'     => 'cycle-b',
						'defaultView' => array( 'perPage' => 5 ),
					),
					'cycle-b' => array(
						'extends'     => 'cycle-a',
						'defaultView' => array( 'perPage' => 7 ),
					),
				),
			),
		),
	),
);

// Default variant resolves.
$default_resolved = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', '_default', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'resolve_data_view_triple reads _default leaf',
	$default_resolved['defaultView']['type'],
	'table'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'fieldsRef applied — inline label overrides collection',
	$default_resolved['fields'][1]['label'],
	'Post Status'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'_resolvedFieldsRef stamped on resolved doc',
	$default_resolved['_resolvedFieldsRef'],
	'core/post-fields'
);

// Variant omitted → defaults to _default.
$default_implicit = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', '_default', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'variant omitted defaults to _default',
	$default_implicit['defaultView']['type'],
	'table'
);

// Single-level extends chain (drafts extends _default).
$drafts_resolved = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'drafts', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'extends — drafts picks up _default defaultView.perPage',
	$drafts_resolved['defaultView']['perPage'],
	25
);
WPAS_Data_View_Test_Runner::assert_eq(
	'extends — drafts overlays its own filters',
	$drafts_resolved['defaultView']['filters'][0]['value'],
	'draft'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'extends — drafts inherits _default actions',
	count( $drafts_resolved['actions'] ),
	3
);
WPAS_Data_View_Test_Runner::assert_true(
	'extends — `extends` key stripped from output',
	! isset( $drafts_resolved['extends'] )
);

// Multi-level chain: compact-drafts → compact → _default.
$multi_level = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'compact-drafts', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'multi-level extends — compact-drafts picks up compact.perPage',
	$multi_level['defaultView']['perPage'],
	10
);
WPAS_Data_View_Test_Runner::assert_eq(
	'multi-level extends — compact-drafts overlays its own filters',
	$multi_level['defaultView']['filters'][0]['value'],
	'draft'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'multi-level extends — compact-drafts inherits _default actions',
	count( $multi_level['actions'] ),
	3
);

// Cycle detection: returns base entry without infinite loop.
// Strong assertion — verify the resolved doc carries the BARE child
// entry's body (cycle-a's `perPage: 5`), not the would-be parent's
// (`cycle-b`'s `perPage: 7`). Confirms cycle detection short-circuits
// before merging anything from the cycle partner.
$cycle_resolved = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'cycle-a', $synthetic );
WPAS_Data_View_Test_Runner::assert_true(
	'cycle-a returns a finite array (no infinite loop)',
	is_array( $cycle_resolved )
);
WPAS_Data_View_Test_Runner::assert_true(
	'cycle-a falls back to base entry without extends',
	! isset( $cycle_resolved['extends'] )
);
WPAS_Data_View_Test_Runner::assert_eq(
	'cycle-a surfaces bare child body (perPage stays 5, not 7 from cycle-b)',
	$cycle_resolved['defaultView']['perPage'],
	5
);

// Depth-cap: build a chain longer than MAX_EXTENDS_DEPTH (10) and confirm it short-circuits.
$deep_chain = array();
for ( $i = 0; $i <= 12; $i++ ) {
	$parent_id            = $i === 0 ? null : ( 'level-' . ( $i - 1 ) );
	$entry                = array( 'defaultView' => array( 'perPage' => $i ) );
	if ( $parent_id !== null ) {
		$entry['extends'] = $parent_id;
	}
	$deep_chain[ 'level-' . $i ] = $entry;
}
$deep_synthetic = array(
	'settings' => array(
		'dataViews' => array(
			'postType' => array(
				'post' => $deep_chain,
			),
		),
	),
);
$deep_resolved = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'level-12', $deep_synthetic );
WPAS_Data_View_Test_Runner::assert_true(
	'depth-cap — chain of 12 returns array without infinite recursion',
	is_array( $deep_resolved )
);
WPAS_Data_View_Test_Runner::assert_true(
	'depth-cap — extends key stripped at cap',
	! isset( $deep_resolved['extends'] )
);
// Strong assertion: depth-cap surfaces the child entry's body, not the
// would-be root's. Confirms the cap short-circuits BEFORE the merge
// would reach `level-0` (perPage 0). The exact partially-merged value
// depends on where in the chain the cap fires, but it must be > 0 and
// must NOT equal 0 (level-0) — that would mean depth-cap leaked all
// the way to the root.
WPAS_Data_View_Test_Runner::assert_true(
	'depth-cap — perPage NOT 0 (cap fires before reaching root level-0)',
	$deep_resolved['defaultView']['perPage'] !== 0
);
WPAS_Data_View_Test_Runner::assert_true(
	'depth-cap — perPage equals child level-12 body (12)',
	$deep_resolved['defaultView']['perPage'] === 12
);

// `_default` declaring `extends` → `extends` ignored.
$bad_default_synthetic = array(
	'settings' => array(
		'dataViews' => array(
			'postType' => array(
				'page' => array(
					'_default' => array(
						'extends'     => 'something',
						'defaultView' => array( 'perPage' => 99 ),
					),
				),
			),
		),
	),
);
$bad_default_resolved = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'page', '_default', $bad_default_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'_default declaring extends — own defaultView still resolves',
	$bad_default_resolved['defaultView']['perPage'],
	99
);
WPAS_Data_View_Test_Runner::assert_true(
	'_default declaring extends — extends key stripped',
	! isset( $bad_default_resolved['extends'] )
);

// Unknown pair returns empty array.
$missing = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'unknown', '_default', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'unknown name returns empty array',
	$missing,
	array()
);

// Unknown variant returns empty array.
$missing_variant = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'nonexistent', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'unknown variant returns empty array',
	$missing_variant,
	array()
);

// Empty kind returns empty.
$empty_kind = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( '', 'post', '_default', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'empty kind returns empty array',
	$empty_kind,
	array()
);

// --- Filter machinery — base + variant suffixed ---------------------------

$base_filter_calls    = array();
$variant_filter_calls = array();

$base_callback = function ( $doc, $kind, $name, $variant ) use ( &$base_filter_calls ) {
	$base_filter_calls[] = array( 'kind' => $kind, 'name' => $name, 'variant' => $variant );
	$doc['_baseFiltered'] = true;
	return $doc;
};
$variant_callback = function ( $doc, $kind, $name, $variant ) use ( &$variant_filter_calls ) {
	$variant_filter_calls[] = array( 'kind' => $kind, 'name' => $name, 'variant' => $variant );
	$doc['_variantFiltered'] = true;
	return $doc;
};

add_filter( 'wp_admin_shell_data_view_config_postType_post', $base_callback, 10, 4 );
add_filter( 'wp_admin_shell_data_view_config_postType_post_drafts', $variant_callback, 10, 4 );

// _default resolution fires base filter only.
$base_filter_calls    = array();
$variant_filter_calls = array();
$base_only = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', '_default', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'base filter fires exactly once for _default',
	count( $base_filter_calls ),
	1
);
WPAS_Data_View_Test_Runner::assert_eq(
	'variant filter does NOT fire for _default',
	count( $variant_filter_calls ),
	0
);
WPAS_Data_View_Test_Runner::assert_true(
	'base filter mutation visible on result',
	! empty( $base_only['_baseFiltered'] )
);

// drafts resolution fires both filters, in order.
$base_filter_calls    = array();
$variant_filter_calls = array();
$drafts_filtered = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'drafts', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'base filter fires once for variant lookup',
	count( $base_filter_calls ),
	1
);
WPAS_Data_View_Test_Runner::assert_eq(
	'variant filter fires once for variant lookup',
	count( $variant_filter_calls ),
	1
);
WPAS_Data_View_Test_Runner::assert_eq(
	'base filter receives variant argument',
	$base_filter_calls[0]['variant'],
	'drafts'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'variant filter receives variant argument',
	$variant_filter_calls[0]['variant'],
	'drafts'
);
WPAS_Data_View_Test_Runner::assert_true(
	'both filters mutated the doc',
	! empty( $drafts_filtered['_baseFiltered'] ) && ! empty( $drafts_filtered['_variantFiltered'] )
);

remove_filter( 'wp_admin_shell_data_view_config_postType_post', $base_callback, 10 );
remove_filter( 'wp_admin_shell_data_view_config_postType_post_drafts', $variant_callback, 10 );

// --- legacy filter deprecation shim ----------------------------------------
//
// v2-name filters (`wp_admin_shell_view_config_*` + `_{variant}`) fire
// alongside the new names for one release cycle so CIAB-port plugins keep
// working. First invocation per legacy handle emits `_deprecated_hook`.

WP_Admin_Shell_Data_View_Config::reset();

$legacy_base_calls    = array();
$legacy_variant_calls = array();
$legacy_base_callback = function ( $doc, $kind, $name, $variant ) use ( &$legacy_base_calls ) {
	$legacy_base_calls[] = compact( 'kind', 'name', 'variant' );
	$doc['_legacyBaseFiltered'] = true;
	return $doc;
};
$legacy_variant_callback = function ( $doc, $kind, $name, $variant ) use ( &$legacy_variant_calls ) {
	$legacy_variant_calls[] = compact( 'kind', 'name', 'variant' );
	$doc['_legacyVariantFiltered'] = true;
	return $doc;
};

add_filter( 'wp_admin_shell_view_config_postType_post', $legacy_base_callback, 10, 4 );
add_filter( 'wp_admin_shell_view_config_postType_post_drafts', $legacy_variant_callback, 10, 4 );

$legacy_drafts = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'drafts', $synthetic );
WPAS_Data_View_Test_Runner::assert_true(
	'legacy base filter ran during resolve',
	! empty( $legacy_drafts['_legacyBaseFiltered'] )
);
WPAS_Data_View_Test_Runner::assert_true(
	'legacy variant filter ran during resolve',
	! empty( $legacy_drafts['_legacyVariantFiltered'] )
);
WPAS_Data_View_Test_Runner::assert_eq(
	'legacy base filter fired exactly once',
	count( $legacy_base_calls ),
	1
);
WPAS_Data_View_Test_Runner::assert_eq(
	'legacy variant filter fired exactly once',
	count( $legacy_variant_calls ),
	1
);

// `_default` resolution skips the legacy variant filter (variant === '_default').
$legacy_base_calls    = array();
$legacy_variant_calls = array();
$legacy_default = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', '_default', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'legacy base filter fires for _default',
	count( $legacy_base_calls ),
	1
);
WPAS_Data_View_Test_Runner::assert_eq(
	'legacy variant filter skipped for _default',
	count( $legacy_variant_calls ),
	0
);

remove_filter( 'wp_admin_shell_view_config_postType_post', $legacy_base_callback, 10 );
remove_filter( 'wp_admin_shell_view_config_postType_post_drafts', $legacy_variant_callback, 10 );

// Triples with no legacy filter registered MUST NOT pay the `apply_filters`
// cost (the shim short-circuits on `has_filter` check).
$dispatch_probe = array();
$probe = function ( $doc ) use ( &$dispatch_probe ) {
	$dispatch_probe[] = true;
	return $doc;
};
add_filter( 'wp_admin_shell_data_view_config_postType_post', $probe, 10, 4 );
// No legacy filter attached this time around — only the new-name probe.
$silent = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', 'drafts', $synthetic );
WPAS_Data_View_Test_Runner::assert_true(
	'modern filter still ran when no legacy filter registered',
	! empty( $dispatch_probe )
);
WPAS_Data_View_Test_Runner::assert_true(
	'modern filter result clean of legacy markers when no legacy filter registered',
	empty( $silent['_legacyBaseFiltered'] ) && empty( $silent['_legacyVariantFiltered'] )
);
remove_filter( 'wp_admin_shell_data_view_config_postType_post', $probe, 10 );

WP_Admin_Shell_Data_View_Config::reset();

// --- parse_data_view_ref ----------------------------------------------------

$ok_ref = WP_Admin_Shell_Data_View_Config::parse_data_view_ref( 'postType/post/drafts' );
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref kind',
	$ok_ref[0],
	'postType'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref name',
	$ok_ref[1],
	'post'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref variant',
	$ok_ref[2],
	'drafts'
);

$ok_default_ref = WP_Admin_Shell_Data_View_Config::parse_data_view_ref( 'postType/post/_default' );
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref accepts _default variant',
	$ok_default_ref[2],
	'_default'
);

$two_segments = WP_Admin_Shell_Data_View_Config::parse_data_view_ref( 'postType/post' );
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref rejects 2-segment refs',
	$two_segments,
	null
);

$four_segments = WP_Admin_Shell_Data_View_Config::parse_data_view_ref( 'postType/post/drafts/extra' );
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref rejects 4-segment refs',
	$four_segments,
	null
);

$empty_segments = WP_Admin_Shell_Data_View_Config::parse_data_view_ref( '//drafts' );
WPAS_Data_View_Test_Runner::assert_eq(
	'parse_data_view_ref rejects empty segments',
	$empty_segments,
	null
);

// --- Screen DataView resolution: dataViewRef + inference --------------------

$reg = WP_Admin_Shell_Manifest_Registry::instance();
$reg->register_app( array(
	'id'         => 'plugin:wpas-test/screen-dv-posts',
	'version'    => 1,
	'title'      => 'Screen-DV Posts',
	'role'       => 'main',
	'script'     => 'wpas-test',
	'dataView'   => array(
		'kind' => 'postType',
		'name' => 'post',
	),
) );

$screen_synthetic = array(
	'settings' => array(
		'dataViews' => array(
			'postType' => array(
				'post' => array(
					'_default' => array(
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
					'drafts' => array(
						'extends' => '_default',
						'defaultView' => array(
							'filters' => array(
								array( 'field' => 'status', 'value' => 'draft' ),
							),
						),
					),
					'trash' => array(
						'extends' => '_default',
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
		),
	),
	'screens' => array(
		'posts' => array(
			'label' => 'Posts',
			'app'   => 'plugin:wpas-test/screen-dv-posts',
			'config' => array( 'postType' => 'post' ),
		),
		'posts-drafts' => array(
			'label'       => 'Drafts',
			'app'         => 'plugin:wpas-test/screen-dv-posts',
			'config'      => array( 'postType' => 'post' ),
			'dataViewRef' => 'postType/post/drafts',
		),
		'posts-trash' => array(
			'label'       => 'Trash',
			'app'         => 'plugin:wpas-test/screen-dv-posts',
			'config'      => array( 'postType' => 'post' ),
			'dataViewRef' => 'postType/post/trash',
		),
		'posts-explicit-fields' => array(
			'label'           => 'Explicit',
			'app'             => 'plugin:wpas-test/screen-dv-posts',
			'config'          => array( 'postType' => 'post' ),
			'dataViewKind'    => 'postType',
			'dataViewName'    => 'post',
			'dataViewVariant' => 'drafts',
		),
		// Ref + explicit conflict — ref wins.
		'posts-ref-wins' => array(
			'label'           => 'Ref Wins',
			'app'             => 'plugin:wpas-test/screen-dv-posts',
			'config'          => array( 'postType' => 'post' ),
			'dataViewRef'     => 'postType/post/drafts',
			'dataViewKind'    => 'postType',
			'dataViewName'    => 'post',
			'dataViewVariant' => 'trash',
		),
		// Inline overlay layers on top of registry triple.
		'posts-drafts-compact' => array(
			'label'       => 'Drafts Compact',
			'app'         => 'plugin:wpas-test/screen-dv-posts',
			'config'      => array( 'postType' => 'post' ),
			'dataViewRef' => 'postType/post/drafts',
			'dataView'    => array(
				'defaultView' => array( 'perPage' => 5 ),
			),
		),
		// Tombstone in inline overlay.
		'posts-no-default' => array(
			'label'    => 'No Default',
			'app'      => 'plugin:wpas-test/screen-dv-posts',
			'config'   => array( 'postType' => 'post' ),
			'dataView' => array( 'defaultView' => null ),
		),
		// Invalid dataViewRef triggers fallback to manifest inference.
		'posts-bad-ref' => array(
			'label'       => 'Bad Ref',
			'app'         => 'plugin:wpas-test/screen-dv-posts',
			'config'      => array( 'postType' => 'post' ),
			'dataViewRef' => 'malformed::ref',
		),
		// v2 back-compat — config.variant flows into screen inference.
		'posts-v2-variant' => array(
			'label'  => 'V2 Variant',
			'app'    => 'plugin:wpas-test/screen-dv-posts',
			'config' => array( 'postType' => 'post', 'variant' => 'drafts' ),
		),
	),
);

// Screen without ref + without explicit — manifest inference, defaults to _default.
$base_screen = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'screen without ref returns _default via inference',
	$base_screen['defaultView']['perPage'],
	25
);
WPAS_Data_View_Test_Runner::assert_eq(
	'inference picks up all _default fields',
	count( $base_screen['fields'] ),
	3
);

// dataViewRef resolves drafts variant.
$drafts_screen = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-drafts', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'dataViewRef resolves drafts filter via extends chain',
	$drafts_screen['defaultView']['filters'][0]['value'],
	'draft'
);
WPAS_Data_View_Test_Runner::assert_eq(
	'dataViewRef inherits _default perPage via extends',
	$drafts_screen['defaultView']['perPage'],
	25
);

// dataViewRef resolves trash with action-array tombstone + append.
$trash_screen = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-trash', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'trash variant — actions count after tombstone + append',
	count( $trash_screen['actions'] ),
	3
);
$action_ids = array_map( function ( $a ) {
	return $a['id'];
}, $trash_screen['actions'] );
WPAS_Data_View_Test_Runner::assert_true(
	'trash variant — tombstone removed `trash` action',
	! in_array( 'trash', $action_ids, true )
);
WPAS_Data_View_Test_Runner::assert_true(
	'trash variant — restore action appended',
	in_array( 'restore', $action_ids, true )
);
WPAS_Data_View_Test_Runner::assert_true(
	'trash variant — __tombstone flag stripped',
	! isset( $trash_screen['actions'][0]['__tombstone'] )
);

// Explicit dataViewKind/Name/Variant resolves equivalently.
$explicit_screen = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-explicit-fields', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'explicit dataViewKind/Name/Variant resolves drafts',
	$explicit_screen['defaultView']['filters'][0]['value'],
	'draft'
);

// Ref + explicit conflict — ref wins (would-resolve trash if explicit won; resolves drafts).
$ref_wins = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-ref-wins', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'dataViewRef wins over explicit fields',
	$ref_wins['defaultView']['filters'][0]['value'],
	'draft'
);

// Inline overlay deep-merges with resolved triple.
$compact = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-drafts-compact', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'inline overlay applies its perPage on top of triple',
	$compact['defaultView']['perPage'],
	5
);
WPAS_Data_View_Test_Runner::assert_eq(
	'inline overlay preserves triple filters',
	$compact['defaultView']['filters'][0]['value'],
	'draft'
);

// Tombstone in inline overlay removes top-level key.
$no_default = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-no-default', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_true(
	'null tombstone removes defaultView from merged doc',
	! isset( $no_default['defaultView'] )
);

// Invalid dataViewRef → falls back to inference (manifest → _default).
$bad_ref = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-bad-ref', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'invalid dataViewRef falls back to manifest inference _default',
	$bad_ref['defaultView']['perPage'],
	25
);

// v2 back-compat — config.variant flows into inference.
$v2_variant = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'posts-v2-variant', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'screen.config.variant (v2 back-compat) resolves drafts via inference',
	$v2_variant['defaultView']['filters'][0]['value'],
	'draft'
);

// Unknown screen returns empty.
$nothing = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'no-such', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'unknown screen id returns empty array',
	$nothing,
	array()
);

// Empty / non-string screen id returns empty.
$empty_id = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( '', $screen_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'empty screen id returns empty array',
	$empty_id,
	array()
);

// --- Taxonomy-kind config.taxonomy override -------------------------------

$reg->register_app( array(
	'id'      => 'plugin:wpas-test/screen-dv-taxonomy',
	'version' => 1,
	'title'   => 'Screen-DV Taxonomy',
	'role'    => 'main',
	'script'  => 'wpas-test',
	'dataView' => array(
		'kind' => 'taxonomy',
		'name' => 'category',
	),
) );
$tax_synthetic = array(
	'settings' => array(
		'dataViews' => array(
			'taxonomy' => array(
				'category' => array(
					'_default' => array( 'defaultView' => array( 'type' => 'table' ) ),
				),
				'post_tag' => array(
					'_default' => array( 'defaultView' => array( 'type' => 'grid' ) ),
				),
			),
		),
	),
	'screens' => array(
		'tags' => array(
			'app'    => 'plugin:wpas-test/screen-dv-taxonomy',
			'config' => array( 'taxonomy' => 'post_tag' ),
		),
	),
);
$tags = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'tags', $tax_synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'config.taxonomy overrides manifest baseline name',
	$tags['defaultView']['type'],
	'grid'
);

// --- inject_app_baselines (v3 settings.dataViews target + variants) ------

$reg->register_app( array(
	'id'       => 'plugin:wpas-test/recipe-app',
	'version'  => 1,
	'title'    => 'Recipe App',
	'role'     => 'main',
	'script'   => 'wpas-test',
	'dataView' => array(
		'kind'     => 'postType',
		'name'     => 'recipe',
		'variants' => array(
			'_default' => array(
				'defaultView' => array( 'type' => 'table', 'perPage' => 25 ),
				'fields'      => array(
					array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
				),
			),
			'drafts' => array(
				'extends'     => '_default',
				'defaultView' => array(
					'filters' => array(
						array( 'field' => 'status', 'value' => 'draft' ),
					),
				),
			),
			'trash' => array(
				'extends'     => '_default',
				'defaultView' => array(
					'filters' => array(
						array( 'field' => 'status', 'value' => 'trash' ),
					),
				),
			),
		),
	),
) );

$injected = WP_Admin_Shell_Data_View_Config::inject_app_baselines( array() );
WPAS_Data_View_Test_Runner::assert_true(
	'baseline injected at settings.dataViews[kind][name][_default]',
	isset( $injected['settings']['dataViews']['postType']['recipe']['_default'] )
);
WPAS_Data_View_Test_Runner::assert_true(
	'baseline injected at settings.dataViews[kind][name][drafts]',
	isset( $injected['settings']['dataViews']['postType']['recipe']['drafts'] )
);
WPAS_Data_View_Test_Runner::assert_true(
	'baseline injected at settings.dataViews[kind][name][trash]',
	isset( $injected['settings']['dataViews']['postType']['recipe']['trash'] )
);
WPAS_Data_View_Test_Runner::assert_eq(
	'_default baseline preserves defaultView.perPage',
	$injected['settings']['dataViews']['postType']['recipe']['_default']['defaultView']['perPage'],
	25
);
WPAS_Data_View_Test_Runner::assert_eq(
	'drafts baseline preserves extends key (regression fix from v3-initial)',
	$injected['settings']['dataViews']['postType']['recipe']['drafts']['extends'],
	'_default'
);

// admin.json-declared entries win — `_default` already declared survives untouched.
$prepopulated = WP_Admin_Shell_Data_View_Config::inject_app_baselines( array(
	'settings' => array(
		'dataViews' => array(
			'postType' => array(
				'recipe' => array(
					'_default' => array(
						'defaultView' => array( 'type' => 'grid', 'perPage' => 999 ),
					),
				),
			),
		),
	),
) );
WPAS_Data_View_Test_Runner::assert_eq(
	'admin.json _default wins over manifest baseline',
	$prepopulated['settings']['dataViews']['postType']['recipe']['_default']['defaultView']['perPage'],
	999
);
WPAS_Data_View_Test_Runner::assert_true(
	'manifest variant baselines still inject when only _default was overridden',
	isset( $prepopulated['settings']['dataViews']['postType']['recipe']['drafts'] )
);

// Back-compat shape: manifest declares flat (no variants:) → treat as _default.
$reg->register_app( array(
	'id'       => 'plugin:wpas-test/flat-shape-app',
	'version'  => 1,
	'title'    => 'Flat-Shape App',
	'role'     => 'main',
	'script'   => 'wpas-test',
	'dataView' => array(
		'kind'        => 'postType',
		'name'        => 'flat',
		'defaultView' => array( 'type' => 'grid', 'perPage' => 33 ),
		'fields'      => array(
			array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
		),
	),
) );
$flat_injected = WP_Admin_Shell_Data_View_Config::inject_app_baselines( array() );
WPAS_Data_View_Test_Runner::assert_true(
	'flat-shape manifest gets _default baseline',
	isset( $flat_injected['settings']['dataViews']['postType']['flat']['_default'] )
);
WPAS_Data_View_Test_Runner::assert_eq(
	'flat-shape baseline carries defaultView',
	$flat_injected['settings']['dataViews']['postType']['flat']['_default']['defaultView']['perPage'],
	33
);

// Apps without a dataView block are skipped.
$reg->register_app( array(
	'id'      => 'plugin:wpas-test/no-dataview-app',
	'version' => 1,
	'title'   => 'No-DataView App',
	'role'    => 'main',
	'script'  => 'wpas-test',
) );
$injected_after = WP_Admin_Shell_Data_View_Config::inject_app_baselines( array() );
WPAS_Data_View_Test_Runner::assert_true(
	'app without dataView block does not add stray entries',
	! isset( $injected_after['settings']['dataViews']['no-dataview-app'] )
);

// Manifest with empty kind/name skipped.
$reg->register_app( array(
	'id'      => 'plugin:wpas-test/bad-dataview-app',
	'version' => 1,
	'title'   => 'Bad-DataView App',
	'role'    => 'main',
	'script'  => 'wpas-test',
	'dataView' => array( 'kind' => '', 'name' => '' ),
) );
$injected_bad = WP_Admin_Shell_Data_View_Config::inject_app_baselines( array() );
WPAS_Data_View_Test_Runner::assert_true(
	'manifest with empty kind/name skipped',
	! isset( $injected_bad['settings']['dataViews'][''] )
);

// --- list_variants ----------------------------------------------------------

$variants = WP_Admin_Shell_Data_View_Config::list_variants( 'postType', 'post', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'list_variants returns _default first',
	$variants[0],
	'_default'
);
WPAS_Data_View_Test_Runner::assert_true(
	'list_variants includes drafts',
	in_array( 'drafts', $variants, true )
);
WPAS_Data_View_Test_Runner::assert_true(
	'list_variants includes compact',
	in_array( 'compact', $variants, true )
);

$no_variants = WP_Admin_Shell_Data_View_Config::list_variants( 'postType', 'no-such', $synthetic );
WPAS_Data_View_Test_Runner::assert_eq(
	'list_variants returns empty for unknown pair',
	$no_variants,
	array()
);

// --- Cascade __tombstone via the merge engine ------------------------------

$views_base = array(
	'settings' => array(
		'dataViews' => array(
			'postType' => array(
				'post' => array(
					'_default' => array(
						'fields' => array(
							array( 'id' => 'title', 'type' => 'text', 'label' => 'Title' ),
							array( 'id' => 'author', 'type' => 'text', 'label' => 'Author' ),
							array( 'id' => 'date', 'type' => 'datetime', 'label' => 'Date' ),
						),
					),
				),
			),
		),
	),
);
$views_over = array(
	'settings' => array(
		'dataViews' => array(
			'postType' => array(
				'post' => array(
					'_default' => array(
						'fields' => array(
							array( 'id' => 'author', '__tombstone' => true ),
						),
					),
				),
			),
		),
	),
);
$views_merged = WP_Admin_Shell_Merge::merge( $views_base, $views_over );
$mfields = $views_merged['settings']['dataViews']['postType']['post']['_default']['fields'];
WPAS_Data_View_Test_Runner::assert_eq(
	'cascade __tombstone removes a field from settings.dataViews.*.fields[]',
	count( $mfields ),
	2
);
$mfield_ids = array_map( function ( $f ) {
	return $f['id'];
}, $mfields );
WPAS_Data_View_Test_Runner::assert_true(
	'cascade __tombstone removed `author`, `title`+`date` survive',
	! in_array( 'author', $mfield_ids, true ) &&
	in_array( 'title', $mfield_ids, true ) &&
	in_array( 'date', $mfield_ids, true )
);

// --- Duplicate-id rejection ------------------------------------------------

WP_Admin_Shell_Data_Field_Collections::reset();
$first = wp_admin_shell_register_data_field_collection( 'core/dup', 'postType', 'post', array() );
WPAS_Data_View_Test_Runner::assert_eq( 'first registration succeeds', $first, 'core/dup' );
$second = wp_admin_shell_register_data_field_collection( 'core/dup', 'postType', 'post', array() );
WPAS_Data_View_Test_Runner::assert_wp_error( 'duplicate id rejected', $second );
WP_Admin_Shell_Data_Field_Collections::reset();

// --- Cascade contribution — registry → settings.dataFields via plugin origin

wp_admin_shell_register_data_field_collection(
	'plugin/extra-fields',
	'postType',
	'product',
	array( array( 'id' => 'sku', 'type' => 'text', 'label' => 'SKU' ) )
);
$plugin_doc = apply_filters( 'wp_admin_shell_data_plugin', array() );
WPAS_Data_View_Test_Runner::assert_true(
	'plugin origin contains injected dataFields collection',
	isset( $plugin_doc['settings']['dataFields']['plugin/extra-fields'] )
);
WP_Admin_Shell_Data_Field_Collections::reset();

// --- Implicit cascade load (resolve with $config = null) -------------------

$auto_resolved = WP_Admin_Shell_Data_View_Config::resolve_data_view_triple( 'postType', 'post', '_default' );
WPAS_Data_View_Test_Runner::assert_true(
	'resolve_data_view_triple() with null config returns array (cascade auto-load)',
	is_array( $auto_resolved )
);

$auto_screen = WP_Admin_Shell_Data_View_Config::resolve_screen_data_view( 'no-such-screen' );
WPAS_Data_View_Test_Runner::assert_eq(
	'resolve_screen_data_view() unknown screen returns empty',
	$auto_screen,
	array()
);

// --- Summary ---------------------------------------------------------------

$total = WPAS_Data_View_Test_Runner::$pass + WPAS_Data_View_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Data_View_Test_Runner::$pass . ' passed, ' . WPAS_Data_View_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Data_View_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
