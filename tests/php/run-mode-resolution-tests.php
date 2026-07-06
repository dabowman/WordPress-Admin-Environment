<?php
/**
 * Mode resolution tests — v3 chrome modes.
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Workspaces/tests/php/run-mode-resolution-tests.php`
 *
 * Coverage:
 *   - `resolve_engine_modes` with no `modes` block (synthesizes default-only catalog).
 *   - `resolve_engine_modes` with no `default` key (injects one).
 *   - `resolve_engine_modes` with single-level extends chain.
 *   - `resolve_engine_modes` with 3-deep extends chain.
 *   - `resolve_engine_modes` with self-reference (cycle guard).
 *   - `resolve_engine_modes` with mutual cycle (cycle guard).
 *   - `resolve_engine_modes` with depth-limit overrun.
 *   - `resolve_engine_modes` strips `extends` from resolved doc.
 *   - `apply_plugin_filter` runs `wp_admin_workspaces_engine_modes_{engineId}`.
 *   - Plugin-contributed mode with `extends` resolves against the now-full catalog.
 *   - `synthesize_default_catalog` returns a `default`-only doc.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Mode_Resolution_Test_Runner {
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

	public static function assert_array_key( $label, $array, $key ) {
		self::assert_true( $label, is_array( $array ) && array_key_exists( $key, $array ) );
	}

	public static function assert_not_has_key( $label, $array, $key ) {
		self::assert_true( $label, is_array( $array ) && ! array_key_exists( $key, $array ) );
	}
}

// ---- synthesize_default_catalog --------------------------------------------

$default_only = WP_Admin_Workspaces_Modes::synthesize_default_catalog();
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'synthesize_default_catalog includes default mode',
	$default_only,
	'default'
);
WPAS_Mode_Resolution_Test_Runner::assert_eq(
	'synthesize_default_catalog has empty regions',
	$default_only['default']['regions'],
	array()
);

// ---- No modes block — synthesize a default catalog -------------------------

$resolved_empty = WP_Admin_Workspaces_Modes::resolve_engine_modes( array( 'id' => 'core:test', 'modes' => array() ) );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'engine without modes gets default-only catalog',
	$resolved_empty,
	'default'
);

$resolved_no_block = WP_Admin_Workspaces_Modes::resolve_engine_modes( array( 'id' => 'core:test' ) );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'engine with no modes key gets default-only catalog',
	$resolved_no_block,
	'default'
);

// ---- Missing `default` mode is injected ------------------------------------

$missing_default = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'focus' => array( 'label' => 'Focus', 'regions' => array( 'sidebar' => array( 'hidden' => true ) ) ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'missing default mode gets injected',
	$missing_default,
	'default'
);
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'focus mode survives',
	$missing_default,
	'focus'
);

// ---- Single-level extends --------------------------------------------------

$one_level = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'default' => array( 'label' => 'D', 'regions' => array() ),
		'a' => array( 'label' => 'A', 'regions' => array( 'sidebar' => array( 'hidden' => true ) ) ),
		'b' => array( 'label' => 'B', 'extends' => 'a', 'regions' => array( 'toolbar' => array( 'compact' => true ) ) ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_eq(
	'single-level extends merges parent + child regions',
	$one_level['b']['regions'],
	array(
		'sidebar' => array( 'hidden' => true ),
		'toolbar' => array( 'compact' => true ),
	)
);
WPAS_Mode_Resolution_Test_Runner::assert_not_has_key(
	'resolved doc strips `extends` key',
	$one_level['b'],
	'extends'
);

// ---- 3-deep extends chain --------------------------------------------------

$three_deep = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'default' => array( 'label' => 'D', 'regions' => array() ),
		'a' => array( 'label' => 'A', 'regions' => array( 'x' => array( 'hidden' => false ) ) ),
		'b' => array( 'label' => 'B', 'extends' => 'a', 'regions' => array( 'x' => array( 'hidden' => true ) ) ),
		'c' => array( 'label' => 'C', 'extends' => 'b', 'regions' => array( 'y' => array( 'compact' => true ) ) ),
		'd' => array( 'label' => 'D2', 'extends' => 'c', 'regions' => array( 'z' => array( 'minimal' => true ) ) ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_eq(
	'3-deep extends merges all ancestors',
	$three_deep['d']['regions'],
	array(
		'x' => array( 'hidden' => true ),
		'y' => array( 'compact' => true ),
		'z' => array( 'minimal' => true ),
	)
);

// ---- Region-state field deep-merge (sibling keys survive) ------------------

$field_layer = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'default' => array( 'label' => 'D', 'regions' => array() ),
		'a' => array( 'label' => 'A', 'regions' => array( 'sidebar' => array( 'hidden' => false, 'compact' => false ) ) ),
		'b' => array( 'label' => 'B', 'extends' => 'a', 'regions' => array( 'sidebar' => array( 'hidden' => true ) ) ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_eq(
	'child overrides one region-state key, inherits others',
	$field_layer['b']['regions']['sidebar'],
	array( 'hidden' => true, 'compact' => false )
);

// ---- Circular extends: self-reference --------------------------------------

$self_ref = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'default' => array( 'label' => 'D', 'regions' => array() ),
		'loopy'   => array( 'label' => 'Loopy', 'extends' => 'loopy', 'regions' => array() ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_true(
	'self-reference cycle is caught without infinite recursion',
	isset( $self_ref['loopy'] ) && is_array( $self_ref['loopy'] )
);
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'self-reference cycle records _extendsChainError',
	$self_ref['loopy'],
	'_extendsChainError'
);

// ---- Circular extends: mutual cycle ----------------------------------------

$mutual = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'default' => array( 'label' => 'D', 'regions' => array() ),
		'a' => array( 'label' => 'A', 'extends' => 'b', 'regions' => array( 'x' => array( 'hidden' => true ) ) ),
		'b' => array( 'label' => 'B', 'extends' => 'a', 'regions' => array( 'y' => array( 'hidden' => true ) ) ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_true(
	'mutual cycle resolves both entries without infinite recursion',
	isset( $mutual['a'], $mutual['b'] )
);

// ---- Depth-limit overrun ---------------------------------------------------

$deep_chain = array(
	'default' => array( 'label' => 'D', 'regions' => array() ),
);
for ( $i = 0; $i < 12; $i++ ) {
	$deep_chain[ 'm' . $i ] = array(
		'label' => 'M' . $i,
		'regions' => array(),
	);
	if ( $i > 0 ) {
		$deep_chain[ 'm' . $i ]['extends'] = 'm' . ( $i - 1 );
	}
}
$deep_resolved = WP_Admin_Workspaces_Modes::resolve_engine_modes( array( 'id' => 'core:test', 'modes' => $deep_chain ) );
WPAS_Mode_Resolution_Test_Runner::assert_true(
	'12-deep chain resolves without crash',
	isset( $deep_resolved['m11'] ) && is_array( $deep_resolved['m11'] )
);

// ---- apply_plugin_filter ---------------------------------------------------

add_filter( 'wp_admin_workspaces_engine_modes_core:demo', function ( $modes ) {
	$modes['kiosk'] = array(
		'label'   => 'Kiosk',
		'extends' => 'takeover',
		'regions' => array( 'site-hub' => array( 'hidden' => true ) ),
	);
	return $modes;
} );

$with_plugin = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:demo',
	'modes' => array(
		'default'  => array( 'label' => 'D', 'regions' => array() ),
		'takeover' => array(
			'label'   => 'Takeover',
			'regions' => array(
				'sidebar' => array( 'hidden' => true ),
				'toolbar' => array( 'hidden' => true ),
			),
		),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'plugin-contributed mode appears in catalog',
	$with_plugin,
	'kiosk'
);
WPAS_Mode_Resolution_Test_Runner::assert_eq(
	'plugin mode extends parent + adds own region-state',
	$with_plugin['kiosk']['regions'],
	array(
		'sidebar'  => array( 'hidden' => true ),
		'toolbar'  => array( 'hidden' => true ),
		'site-hub' => array( 'hidden' => true ),
	)
);

// ---- Engine without `id` skips the filter pass safely ----------------------

$no_id = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'modes' => array(
		'default' => array( 'label' => 'D', 'regions' => array() ),
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'engine with no id still resolves',
	$no_id,
	'default'
);

// ---- Garbage input degrades gracefully -------------------------------------

$nul = WP_Admin_Workspaces_Modes::resolve_engine_modes( null );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'null manifest produces default-only catalog',
	$nul,
	'default'
);

$garbage = WP_Admin_Workspaces_Modes::resolve_engine_modes( array(
	'id'    => 'core:test',
	'modes' => array(
		'default'      => array( 'label' => 'D', 'regions' => array() ),
		''             => 'not-a-mode-id',
		'good'         => array( 'label' => 'G', 'regions' => array() ),
		'malformed'    => 'not-an-array',
	),
) );
WPAS_Mode_Resolution_Test_Runner::assert_array_key(
	'malformed mode entries are skipped',
	$garbage,
	'good'
);
WPAS_Mode_Resolution_Test_Runner::assert_not_has_key(
	'empty-string mode id dropped',
	$garbage,
	''
);

// ---- Final report ----------------------------------------------------------

echo "\nTOTAL: " . WPAS_Mode_Resolution_Test_Runner::$pass . " passed, " .
	WPAS_Mode_Resolution_Test_Runner::$fail . " failed of " .
	( WPAS_Mode_Resolution_Test_Runner::$pass + WPAS_Mode_Resolution_Test_Runner::$fail ) . "\n";

exit( WPAS_Mode_Resolution_Test_Runner::$fail > 0 ? 1 : 0 );
