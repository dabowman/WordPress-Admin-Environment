<?php
/**
 * View-config + field-collections tests — C2 phase.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-view-config-tests.php`
 *
 * Coverage:
 *   - `WP_Admin_Shell_Field_Collections::register` validation + readback.
 *   - `WP_Admin_Shell_Field_Collections::find_for` exact + universal match.
 *   - `WP_Admin_Shell_View_Config::resolve` triple lookup (base + variant).
 *   - `wp_admin_shell_view_config_{kind}_{name}` + variant-qualified filter run.
 *   - `merge_fields` ref-wins-inline-overrides semantics.
 *   - Sanitization mirrors CIAB (`[A-Za-z0-9_-]` segments; variant adds `/`).
 *   - Variants-for discovery.
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
WPAS_View_Config_Test_Runner::assert_eq(
	'registered name preserved',
	$registry['core/post-fields']['name'],
	'post'
);

// Universal collection (null name).
wp_admin_shell_register_field_collection(
	'core/audit-fields',
	'postType',
	null,
	array( array( 'id' => 'modified', 'type' => 'datetime', 'label' => 'Modified' ) )
);

// find_for — exact + universal match for (postType, post).
$matches = WP_Admin_Shell_Field_Collections::find_for( 'postType', 'post' );
WPAS_View_Config_Test_Runner::assert_true(
	'find_for picks up exact match',
	isset( $matches['core/post-fields'] )
);
WPAS_View_Config_Test_Runner::assert_true(
	'find_for picks up universal match',
	isset( $matches['core/audit-fields'] )
);

// find_for — kind mismatch returns nothing.
$nothing = WP_Admin_Shell_Field_Collections::find_for( 'root', 'site' );
WPAS_View_Config_Test_Runner::assert_eq(
	'find_for returns empty when kind mismatches',
	count( $nothing ),
	0
);

// --- Validation rejections --------------------------------------------------

$err = wp_admin_shell_register_field_collection( '', 'postType', 'post', array() );
WPAS_View_Config_Test_Runner::assert_wp_error( 'register rejects empty id', $err );

$err = wp_admin_shell_register_field_collection( 'x', 'postType', '', array() );
WPAS_View_Config_Test_Runner::assert_wp_error( 'register rejects empty name', $err );

$err = wp_admin_shell_register_field_collection( 'x', 'postType', 'post', 'not-an-array' );
WPAS_View_Config_Test_Runner::assert_wp_error( 'register rejects non-array fields', $err );

$err = wp_admin_shell_register_field_collection( 'x', 'postType', 'post', array(), 123 );
WPAS_View_Config_Test_Runner::assert_wp_error( 'register rejects non-string fieldsModule', $err );

// --- Sanitization -----------------------------------------------------------

WPAS_View_Config_Test_Runner::assert_eq(
	'sanitize_segment strips slashes',
	WP_Admin_Shell_Field_Collections::sanitize_segment( 'post/Type' ),
	'postType'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'sanitize_segment preserves underscores + dashes',
	WP_Admin_Shell_Field_Collections::sanitize_segment( 'my_kind-v2' ),
	'my_kind-v2'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'sanitize_variant preserves forward-slash',
	WP_Admin_Shell_Field_Collections::sanitize_variant( 'woocommerce-bookings/services' ),
	'woocommerce-bookings/services'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'sanitize_variant strips disallowed chars',
	WP_Admin_Shell_Field_Collections::sanitize_variant( 'foo!@#bar' ),
	'foobar'
);

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
	'merge first field is title from base',
	$merged[0]['id'],
	'title'
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

// --- View-config resolution against synthetic config ------------------------

$synthetic = array(
	'fieldCollections' => array(
		'core/post-fields' => array(
			'kind'   => 'postType',
			'name'   => 'post',
			'fields' => $base,
		),
	),
	'viewConfigs' => array(
		'postType' => array(
			'post' => array(
				'_default' => array(
					'fieldsRef'   => 'core/post-fields',
					'fields'      => array(
						array( 'id' => 'status', 'label' => 'Post Status' ),
					),
					'defaultView' => array( 'type' => 'table' ),
				),
				'services' => array(
					'fieldsRef' => 'core/post-fields',
					'fields'    => array(
						array( 'id' => 'duration', 'type' => 'text', 'label' => 'Duration' ),
					),
				),
			),
		),
	),
);

$base_resolved = WP_Admin_Shell_View_Config::resolve( 'postType', 'post', null, $synthetic );

WPAS_View_Config_Test_Runner::assert_eq(
	'resolve picks _default for null variant',
	$base_resolved['defaultView']['type'],
	'table'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'resolve runs ref-wins-inline merge',
	$base_resolved['fields'][1]['label'],
	'Post Status'
);
WPAS_View_Config_Test_Runner::assert_eq(
	'resolve stamps _resolvedFieldsRef',
	$base_resolved['_resolvedFieldsRef'],
	'core/post-fields'
);

// Variant resolution is independent of base — no inheritance.
$variant_resolved = WP_Admin_Shell_View_Config::resolve(
	'postType',
	'post',
	'services',
	$synthetic
);
WPAS_View_Config_Test_Runner::assert_eq(
	'variant resolves independently — base fields + appended inline',
	count( $variant_resolved['fields'] ),
	3
);
WPAS_View_Config_Test_Runner::assert_eq(
	'variant inline field appended',
	$variant_resolved['fields'][2]['id'],
	'duration'
);

// Unknown triple returns empty array.
$missing = WP_Admin_Shell_View_Config::resolve( 'postType', 'page', null, $synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'resolve returns empty array for unknown triple',
	$missing,
	array()
);

// --- Filter machinery -------------------------------------------------------

$filter_callback = function ( $doc ) {
	$doc['_filtered_base'] = true;
	return $doc;
};
$variant_filter_callback = function ( $doc ) {
	$doc['_filtered_variant'] = true;
	return $doc;
};

add_filter( 'wp_admin_shell_view_config_postType_post', $filter_callback );
add_filter( 'wp_admin_shell_view_config_postType_post_services', $variant_filter_callback );

$base_filtered = WP_Admin_Shell_View_Config::resolve( 'postType', 'post', null, $synthetic );
WPAS_View_Config_Test_Runner::assert_true(
	'base filter applied on no-variant resolve',
	! empty( $base_filtered['_filtered_base'] )
);
WPAS_View_Config_Test_Runner::assert_true(
	'variant filter NOT applied when variant absent',
	empty( $base_filtered['_filtered_variant'] )
);

$variant_filtered = WP_Admin_Shell_View_Config::resolve( 'postType', 'post', 'services', $synthetic );
WPAS_View_Config_Test_Runner::assert_true(
	'base filter also applied on variant resolve',
	! empty( $variant_filtered['_filtered_base'] )
);
WPAS_View_Config_Test_Runner::assert_true(
	'variant filter applied on variant resolve',
	! empty( $variant_filtered['_filtered_variant'] )
);

remove_filter( 'wp_admin_shell_view_config_postType_post', $filter_callback );
remove_filter( 'wp_admin_shell_view_config_postType_post_services', $variant_filter_callback );

// --- Variants-for discovery -------------------------------------------------

$variants = WP_Admin_Shell_View_Config::variants_for( 'postType', 'post', $synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'variants_for returns 2 entries',
	count( $variants ),
	2
);
WPAS_View_Config_Test_Runner::assert_true(
	'variants_for includes null for _default',
	in_array( null, $variants, true )
);
WPAS_View_Config_Test_Runner::assert_true(
	'variants_for includes named variant',
	in_array( 'services', $variants, true )
);

$no_variants = WP_Admin_Shell_View_Config::variants_for( 'postType', 'page', $synthetic );
WPAS_View_Config_Test_Runner::assert_eq(
	'variants_for empty for unknown name',
	$no_variants,
	array()
);

// --- Cascade contribution ---------------------------------------------------

// The registry's `wp_admin_shell_data_plugin` filter contributes registered
// collections into the plugin origin. Smoke test the injection.
WP_Admin_Shell_Field_Collections::reset();
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
WPAS_View_Config_Test_Runner::assert_eq(
	'injected collection carries kind',
	$plugin_doc['fieldCollections']['plugin/extra-fields']['kind'],
	'postType'
);

// admin.json-declared entry wins over programmatic injection (same id).
$plugin_doc_with_admin_json = apply_filters( 'wp_admin_shell_data_plugin', array(
	'fieldCollections' => array(
		'plugin/extra-fields' => array(
			'kind'   => 'postType',
			'name'   => 'product',
			'fields' => array( array( 'id' => 'price', 'type' => 'number', 'label' => 'Price' ) ),
		),
	),
) );
WPAS_View_Config_Test_Runner::assert_eq(
	'admin.json declaration wins over programmatic injection (id collision)',
	$plugin_doc_with_admin_json['fieldCollections']['plugin/extra-fields']['fields'][0]['id'],
	'price'
);

WP_Admin_Shell_Field_Collections::reset();

// --- Summary ---------------------------------------------------------------

$total = WPAS_View_Config_Test_Runner::$pass + WPAS_View_Config_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_View_Config_Test_Runner::$pass . " passed, " . WPAS_View_Config_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_View_Config_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
