<?php
/**
 * Appearance-menu prune-pass tests — theme-support-aware (issue #121).
 *
 * Invoke: `npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-appearance-menu-tests.php`
 *
 * Coverage:
 *   - Block-theme signal is stamped at `workspace.theme-support`
 *     (block-theme flag + per-feature theme-supports map), reusable by
 *     #120 (native classic Menus).
 *   - Block theme → keeps `site-editor`; drops `customize` / `widgets` /
 *     `menus` / `nav-menus` (screens + menu nodes at any depth).
 *   - Classic theme → keeps `customize` / `widgets` / `menus`; drops
 *     `site-editor`. Custom Background / Header survive only when the
 *     theme `add_theme_support()`s them.
 *   - Theme-agnostic screens (`themes`, `fonts`, `appearance-preferences`)
 *     are never pruned.
 *   - Pruning a screen removes it from BOTH `screens` and the `menu` tree
 *     (nested removal), and is a no-op when the screen isn't declared.
 *   - End-to-end: the pass fires on `wp_admin_shell_data` at priority 4,
 *     before `bind_screens` (5) — a dropped node never gets a stamped
 *     label.
 */

defined( 'ABSPATH' ) || die( 'Run via wp eval-file.' );

class WPAS_Appearance_Test_Runner {
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

	public static function assert_false( $label, $actual ) {
		self::assert_eq( $label, (bool) $actual, false );
	}
}

// A doc mirroring the relevant Appearance slice of `wp-admin-default`.
function wpas_appearance_test_doc() {
	return array(
		'version'   => 3,
		'engine'    => 'core:default',
		'workspace' => array(
			'engine'         => 'core:default',
			'default-screen' => 'dashboard-home',
		),
		'screens'   => array(
			'themes'                  => array(
				'label' => 'Themes',
				'path'  => '/themes',
				'app'   => 'core:themes',
			),
			'site-editor'             => array(
				'label' => 'Editor',
				'path'  => '/site-editor',
				'app'   => 'core:site-editor',
			),
			'fonts'                   => array(
				'label' => 'Fonts',
				'path'  => '/fonts',
				'app'   => 'core:iframe-fallback',
			),
			'customize'               => array(
				'label' => 'Customize',
				'path'  => '/customize',
				'app'   => 'iframe:customize.php',
			),
			'widgets'                 => array(
				'label' => 'Widgets',
				'path'  => '/widgets',
				'app'   => 'iframe:widgets.php',
			),
			'menus'                   => array(
				'label' => 'Menus',
				'path'  => '/menus',
				'app'   => 'iframe:nav-menus.php',
			),
			'custom-header'           => array(
				'label' => 'Header',
				'path'  => '/custom-header',
				'app'   => 'iframe:themes.php',
			),
			'custom-background'       => array(
				'label' => 'Background',
				'path'  => '/custom-background',
				'app'   => 'iframe:themes.php',
			),
			'appearance-preferences'  => array(
				'label' => 'Appearance Preferences',
				'path'  => '/appearance-preferences',
				'app'   => 'core:appearance-preferences',
			),
		),
		'menu'      => array(
			'appearance' => array(
				'label'    => 'Appearance',
				'icon'     => 'appearance',
				'position' => 70,
				'items'    => array(
					'themes'      => array( 'position' => 10 ),
					'site-editor' => array(
						'label'    => 'Editor',
						'position' => 20,
					),
					'fonts'       => array( 'position' => 30 ),
					'customize'   => array( 'position' => 40 ),
					'widgets'     => array( 'position' => 50 ),
					'menus'       => array( 'position' => 60 ),
				),
			),
			'settings'   => array(
				'position' => 110,
				'items'    => array(
					'appearance-preferences' => array( 'position' => 90 ),
				),
			),
		),
	);
}

function wpas_signal( $block, $supports = array() ) {
	return array(
		'block-theme'    => $block,
		'theme-supports' => array_merge(
			array(
				'menus'             => false,
				'widgets'           => false,
				'customize'         => false,
				'custom-background' => false,
				'custom-header'     => false,
			),
			$supports
		),
	);
}

// -----------------------------------------------------------------------------
// Signal stamping
// -----------------------------------------------------------------------------

$block_doc = WP_Admin_Shell_Appearance_Menu::apply( wpas_appearance_test_doc(), wpas_signal( true ) );

WPAS_Appearance_Test_Runner::assert_true(
	'signal stamped: workspace.theme-support present',
	isset( $block_doc['workspace']['theme-support'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'signal: block-theme flag true for block theme',
	$block_doc['workspace']['theme-support']['block-theme']
);
WPAS_Appearance_Test_Runner::assert_true(
	'signal: theme-supports map present',
	isset( $block_doc['workspace']['theme-support']['theme-supports'] ) &&
	is_array( $block_doc['workspace']['theme-support']['theme-supports'] )
);

$classic_doc = WP_Admin_Shell_Appearance_Menu::apply( wpas_appearance_test_doc(), wpas_signal( false ) );
WPAS_Appearance_Test_Runner::assert_false(
	'signal: block-theme flag false for classic theme',
	$classic_doc['workspace']['theme-support']['block-theme']
);

// Signal is stamped even when the shell declares no screens.
$bare = WP_Admin_Shell_Appearance_Menu::apply(
	array( 'workspace' => array() ),
	wpas_signal( true )
);
WPAS_Appearance_Test_Runner::assert_true(
	'signal stamped even with no screens block',
	! empty( $bare['workspace']['theme-support']['block-theme'] )
);

// -----------------------------------------------------------------------------
// Block theme — keep site-editor, drop customize/widgets/menus
// -----------------------------------------------------------------------------

WPAS_Appearance_Test_Runner::assert_true(
	'block: site-editor screen kept',
	isset( $block_doc['screens']['site-editor'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: customize screen dropped',
	isset( $block_doc['screens']['customize'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: widgets screen dropped',
	isset( $block_doc['screens']['widgets'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: menus screen dropped',
	isset( $block_doc['screens']['menus'] )
);

// Menu nodes for the dropped screens are removed (nested under appearance).
WPAS_Appearance_Test_Runner::assert_true(
	'block: site-editor menu node kept',
	isset( $block_doc['menu']['appearance']['items']['site-editor'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: customize menu node dropped',
	isset( $block_doc['menu']['appearance']['items']['customize'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: widgets menu node dropped',
	isset( $block_doc['menu']['appearance']['items']['widgets'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: menus menu node dropped',
	isset( $block_doc['menu']['appearance']['items']['menus'] )
);

// Theme-agnostic survivors.
WPAS_Appearance_Test_Runner::assert_true(
	'block: themes screen kept (agnostic)',
	isset( $block_doc['screens']['themes'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'block: fonts screen kept (agnostic)',
	isset( $block_doc['screens']['fonts'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'block: appearance-preferences screen kept (agnostic)',
	isset( $block_doc['screens']['appearance-preferences'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'block: appearance-preferences menu node kept under settings',
	isset( $block_doc['menu']['settings']['items']['appearance-preferences'] )
);

// Custom Background/Header dropped on block themes regardless of support.
$block_with_support = WP_Admin_Shell_Appearance_Menu::apply(
	wpas_appearance_test_doc(),
	wpas_signal( true, array( 'custom-header' => true, 'custom-background' => true ) )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: custom-header dropped even when supported',
	isset( $block_with_support['screens']['custom-header'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'block: custom-background dropped even when supported',
	isset( $block_with_support['screens']['custom-background'] )
);

// -----------------------------------------------------------------------------
// Classic theme — keep customize/widgets/menus, drop site-editor
// -----------------------------------------------------------------------------

WPAS_Appearance_Test_Runner::assert_false(
	'classic: site-editor screen dropped',
	isset( $classic_doc['screens']['site-editor'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'classic: site-editor menu node dropped',
	isset( $classic_doc['menu']['appearance']['items']['site-editor'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'classic: customize screen kept',
	isset( $classic_doc['screens']['customize'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'classic: widgets screen kept',
	isset( $classic_doc['screens']['widgets'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'classic: menus screen kept',
	isset( $classic_doc['screens']['menus'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'classic: customize menu node kept',
	isset( $classic_doc['menu']['appearance']['items']['customize'] )
);

// Custom Background / Header gated on add_theme_support().
WPAS_Appearance_Test_Runner::assert_false(
	'classic: custom-header dropped when unsupported',
	isset( $classic_doc['screens']['custom-header'] )
);
WPAS_Appearance_Test_Runner::assert_false(
	'classic: custom-background dropped when unsupported',
	isset( $classic_doc['screens']['custom-background'] )
);

$classic_supported = WP_Admin_Shell_Appearance_Menu::apply(
	wpas_appearance_test_doc(),
	wpas_signal( false, array( 'custom-header' => true, 'custom-background' => true ) )
);
WPAS_Appearance_Test_Runner::assert_true(
	'classic: custom-header kept when supported',
	isset( $classic_supported['screens']['custom-header'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'classic: custom-background kept when supported',
	isset( $classic_supported['screens']['custom-background'] )
);

// -----------------------------------------------------------------------------
// No-op when a gated screen isn't declared
// -----------------------------------------------------------------------------

$partial = array(
	'workspace' => array(),
	'screens'   => array(
		'themes' => array( 'app' => 'core:themes' ),
	),
	'menu'      => array(
		'appearance' => array(
			'items' => array(
				'themes' => array( 'position' => 10 ),
			),
		),
	),
);
$partial_out = WP_Admin_Shell_Appearance_Menu::apply( $partial, wpas_signal( true ) );
WPAS_Appearance_Test_Runner::assert_true(
	'no-op: absent gated screen leaves themes intact',
	isset( $partial_out['screens']['themes'] ) &&
	isset( $partial_out['menu']['appearance']['items']['themes'] )
);

// -----------------------------------------------------------------------------
// Empty-group collapse — a group whose only child is pruned is itself dropped
// -----------------------------------------------------------------------------

// Custom shell whose Appearance group's ONLY item is the block-theme-only
// `site-editor`. On a classic theme that child is pruned → the group would be
// left empty (a clickable drilldown into nothing) without the collapse guard.
$only_gated = array(
	'workspace' => array(),
	'screens'   => array(
		'site-editor' => array( 'app' => 'core:site-editor' ),
		'themes'      => array( 'app' => 'core:themes' ),
	),
	'menu'      => array(
		'appearance' => array(
			'label' => 'Appearance',
			'items' => array(
				'site-editor' => array( 'position' => 10 ),
			),
		),
		'tools'      => array(
			'label' => 'Tools',
			'items' => array(
				'themes' => array( 'position' => 10 ),
			),
		),
	),
);
$collapsed = WP_Admin_Shell_Appearance_Menu::apply( $only_gated, wpas_signal( false ) );
WPAS_Appearance_Test_Runner::assert_false(
	'collapse: emptied appearance group dropped after its only child pruned',
	isset( $collapsed['menu']['appearance'] )
);
WPAS_Appearance_Test_Runner::assert_true(
	'collapse: sibling group with surviving child untouched',
	isset( $collapsed['menu']['tools']['items']['themes'] )
);

// A group that KEEPS at least one child survives (collapse must not over-fire).
$keeps_one = array(
	'workspace' => array(),
	'screens'   => array(
		'site-editor' => array( 'app' => 'core:site-editor' ),
		'themes'      => array( 'app' => 'core:themes' ),
	),
	'menu'      => array(
		'appearance' => array(
			'items' => array(
				'site-editor' => array( 'position' => 10 ),
				'themes'      => array( 'position' => 20 ),
			),
		),
	),
);
$kept = WP_Admin_Shell_Appearance_Menu::apply( $keeps_one, wpas_signal( false ) );
WPAS_Appearance_Test_Runner::assert_true(
	'collapse: group keeps surviving themes child after gated child pruned',
	isset( $kept['menu']['appearance']['items']['themes'] ) &&
	! isset( $kept['menu']['appearance']['items']['site-editor'] )
);

// A group authored with an empty `items` (never had children) is NOT collapsed —
// it didn't lose anything to the prune, so the guard leaves it alone.
$preexisting_empty = array(
	'workspace' => array(),
	'screens'   => array(
		'themes' => array( 'app' => 'core:themes' ),
	),
	'menu'      => array(
		'placeholder' => array(
			'label' => 'Placeholder',
			'items' => array(),
		),
		'appearance'  => array(
			'items' => array(
				'themes' => array( 'position' => 10 ),
			),
		),
	),
);
$pre_out = WP_Admin_Shell_Appearance_Menu::apply( $preexisting_empty, wpas_signal( true ) );
WPAS_Appearance_Test_Runner::assert_true(
	'collapse: pre-existing empty group is left as-is (lost nothing to prune)',
	isset( $pre_out['menu']['placeholder'] )
);

// -----------------------------------------------------------------------------
// End-to-end — fires on wp_admin_shell_data before bind_screens (priority 4)
// -----------------------------------------------------------------------------

$has_filter = has_filter(
	'wp_admin_shell_data',
	array( 'WP_Admin_Shell_Appearance_Menu', 'prune' )
);
WPAS_Appearance_Test_Runner::assert_eq(
	'pass registered on wp_admin_shell_data at priority 4',
	$has_filter,
	4
);
WPAS_Appearance_Test_Runner::assert_true(
	'prune pass runs before bind_screens (4 < 5)',
	$has_filter < has_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_Menu_Items', 'bind_screens' ) )
);

// `prune()` (the live entry point) returns the doc with the signal stamped.
$live = WP_Admin_Shell_Appearance_Menu::prune( wpas_appearance_test_doc() );
WPAS_Appearance_Test_Runner::assert_true(
	'live prune() stamps the signal from real theme support',
	isset( $live['workspace']['theme-support']['block-theme'] )
);

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

$total = WPAS_Appearance_Test_Runner::$pass + WPAS_Appearance_Test_Runner::$fail;
echo "\n";
echo 'TOTAL: ' . WPAS_Appearance_Test_Runner::$pass . ' passed, ' . WPAS_Appearance_Test_Runner::$fail . " failed of $total\n";
if ( WPAS_Appearance_Test_Runner::$fail > 0 ) {
	exit( 1 );
}
