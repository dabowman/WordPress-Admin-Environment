<?php
/**
 * Appearance-menu prune pass — theme-support-aware.
 *
 * wp-admin's Appearance group is conditional on the active theme:
 *
 *   - **Block themes** expose the Site Editor ("Editor") and hide the
 *     Customizer, classic Widgets, and classic Menus screens — those are
 *     superseded by the editor's template / global-styles / navigation
 *     surfaces.
 *   - **Classic themes** expose the Customizer plus the classic Widgets and
 *     Menus screens, and — only when the theme `add_theme_support()`s them —
 *     the Custom Background and Custom Header screens. They do NOT expose
 *     the Site Editor.
 *
 * This `wp_admin_shell_data` pass reads `wp_is_block_theme()` +
 * `current_theme_supports()` directly (no REST needed — these are PHP
 * functions available at resolve time) and prunes the resolved doc to match.
 * Pruning a screen removes it from both `screens` (so it stops minting a
 * route / command) AND the `menu` tree (so it stops rendering a nav item),
 * keyed by the screen id wherever it appears at any depth.
 *
 * It also stamps a reusable **block-theme signal** onto the resolved doc at
 * `workspace.theme-support` so downstream passes and the JS runtime can read
 * the determination without re-deriving it. Issue #120 (native classic
 * Menus) consumes the same signal to decide whether to surface its screen.
 *
 * Sequencing: priority **4** on `wp_admin_shell_data` — BEFORE
 * `WP_Admin_Shell_Menu_Items::bind_screens` (priority 5) so screen-binding
 * never stamps labels onto a menu node this pass is about to drop, and
 * before `WP_Admin_Shell_Data_View_Config::inject_app_baselines` (priority
 * 6) so dataView baselines never attach to a pruned screen.
 *
 * The prune is pure data — no kernel edits. The kernel stays DS-neutral.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Appearance_Menu {

	/** Maximum menu nesting depth honored when pruning. */
	const MAX_DEPTH = 10;

	/**
	 * Screen-id → visibility rule.
	 *
	 * Each entry names a screen the Appearance group conditionally shows.
	 * `show` is one of:
	 *   - `'block'`   — show only on block themes.
	 *   - `'classic'` — show only on classic themes.
	 *
	 * `requires` (optional) names a `current_theme_supports()` feature that
	 * must ALSO be present for a classic-theme screen to survive. Block-theme
	 * rules ignore `requires`.
	 *
	 * Screens NOT listed here are theme-agnostic and never pruned (e.g.
	 * `themes`, `fonts`, `appearance-preferences`).
	 *
	 * @var array<string, array{show:string, requires?:string}>
	 */
	const RULES = array(
		// Block-theme-only: the Site Editor.
		'site-editor'        => array( 'show' => 'block' ),

		// Classic-theme-only: Customizer + classic Widgets + classic Menus.
		// Widgets / Menus additionally require the theme to declare support —
		// a classic theme that does not `add_theme_support( 'widgets' )` /
		// `register_nav_menus()` (→ `current_theme_supports( 'menus' )`) has no
		// widget areas / menu locations, so wp-admin hides those screens too
		// (issue #237 review nit; mirrors the `custom-background`/`-header`
		// `requires` gating below).
		'customize'          => array( 'show' => 'classic' ),
		'widgets'            => array(
			'show'     => 'classic',
			'requires' => 'widgets',
		),
		'menus'              => array(
			'show'     => 'classic',
			'requires' => 'menus',
		),

		// NOTE: the `nav-menus` iframe screen (the full-fidelity classic
		// Menus editor, `iframe:nav-menus.php`) is INTENTIONALLY NOT gated
		// here. It is a theme-agnostic escape hatch: the native `core:menus`
		// editor links to it (`#/nav-menus`) on block themes — where the
		// native `menus` screen is pruned — so the deterministic iframe
		// fallback must survive on every theme. Gating it on `menus` support
		// would 404 that link exactly when it's needed.

		// Classic-theme + declared `add_theme_support()`.
		'custom-background'  => array(
			'show'     => 'classic',
			'requires' => 'custom-background',
		),
		'custom-header'      => array(
			'show'     => 'classic',
			'requires' => 'custom-header',
		),
	);

	/**
	 * Derive the live theme-support signal from WordPress.
	 *
	 * Kept separate from {@see apply()} so tests can inject a fixture signal
	 * without bootstrapping a theme.
	 *
	 * @return array{block-theme:bool, theme-supports:array<string,bool>}
	 */
	public static function theme_support_signal() {
		$is_block = function_exists( 'wp_is_block_theme' ) ? (bool) wp_is_block_theme() : false;

		$features = array();
		foreach ( array( 'menus', 'widgets', 'customize', 'custom-background', 'custom-header' ) as $feature ) {
			$features[ $feature ] = function_exists( 'current_theme_supports' )
				? (bool) current_theme_supports( $feature )
				: false;
		}

		return array(
			'block-theme'    => $is_block,
			'theme-supports' => $features,
		);
	}

	/**
	 * `wp_admin_shell_data` callback. Stamps the signal + prunes.
	 *
	 * @param array $doc Resolved admin.json doc.
	 * @return array
	 */
	public static function prune( $doc ) {
		if ( ! is_array( $doc ) ) {
			return $doc;
		}
		return self::apply( $doc, self::theme_support_signal() );
	}

	/**
	 * Pure prune — stamp signal, drop theme-gated screens + menu items.
	 *
	 * @param array $doc    Resolved doc.
	 * @param array $signal {@see theme_support_signal()} shape.
	 * @return array
	 */
	public static function apply( $doc, $signal ) {
		if ( ! is_array( $doc ) ) {
			return $doc;
		}

		$is_block  = ! empty( $signal['block-theme'] );
		$supports  = isset( $signal['theme-supports'] ) && is_array( $signal['theme-supports'] )
			? $signal['theme-supports']
			: array();

		// Stamp the reusable signal on the resolved doc (visible to later
		// passes + the JS runtime). Author-shape `workspace` block.
		if ( ! isset( $doc['workspace'] ) || ! is_array( $doc['workspace'] ) ) {
			$doc['workspace'] = array();
		}
		$doc['workspace']['theme-support'] = array(
			'block-theme'    => $is_block,
			'theme-supports' => $supports,
		);

		$screens = ( isset( $doc['screens'] ) && is_array( $doc['screens'] ) )
			? $doc['screens']
			: array();
		if ( empty( $screens ) ) {
			return $doc;
		}

		// Decide which gated screen ids to drop given this theme.
		$drop = array();
		foreach ( self::RULES as $screen_id => $rule ) {
			// Only consider screens the shell actually declares — pruning an
			// absent screen is a no-op, and we don't want to drop a menu node
			// whose id collides with a rule but binds nothing.
			if ( ! isset( $screens[ $screen_id ] ) ) {
				continue;
			}
			if ( ! self::screen_applies( $rule, $is_block, $supports ) ) {
				$drop[ $screen_id ] = true;
			}
		}

		if ( empty( $drop ) ) {
			return $doc;
		}

		// Remove dropped screens.
		foreach ( array_keys( $drop ) as $screen_id ) {
			unset( $doc['screens'][ $screen_id ] );
		}

		// Remove dropped screens from the menu tree at any depth.
		if ( isset( $doc['menu'] ) && is_array( $doc['menu'] ) ) {
			$doc['menu'] = self::prune_menu_tree( $doc['menu'], $drop, 0 );
		}

		return $doc;
	}

	/**
	 * Whether a gated screen survives for the current theme.
	 *
	 * @param array $rule     {@see RULES} entry.
	 * @param bool  $is_block Active theme is a block theme.
	 * @param array $supports feature → bool map from the signal.
	 * @return bool
	 */
	private static function screen_applies( $rule, $is_block, $supports ) {
		$show = $rule['show'] ?? '';

		if ( 'block' === $show ) {
			return $is_block;
		}

		if ( 'classic' === $show ) {
			if ( $is_block ) {
				return false;
			}
			// Classic-theme screen with an extra `add_theme_support()` gate.
			if ( isset( $rule['requires'] ) ) {
				return ! empty( $supports[ $rule['requires'] ] );
			}
			return true;
		}

		// Unknown rule shape — fail open (don't prune).
		return true;
	}

	/**
	 * Walk the menu tree dropping any node whose id is in `$drop`,
	 * recursing into `items`.
	 *
	 * Collapse-empty-group guard: a drilldown node that STARTED with a
	 * non-empty `items` list and ENDED with an empty one after recursion is
	 * itself dropped — otherwise a custom shell whose only child of a group
	 * is a theme-gated screen would render a clickable group that drills
	 * into nothing. (Nodes that never had `items` — leaf screens, separators —
	 * are untouched; a group authored with an empty `items` stays as-is,
	 * since it didn't lose anything to the prune.)
	 *
	 * @param array $tree  (sub-)tree to walk.
	 * @param array $drop  id → true map of screen ids to remove.
	 * @param int   $depth current depth.
	 * @return array
	 */
	private static function prune_menu_tree( $tree, $drop, $depth ) {
		if ( $depth >= self::MAX_DEPTH || ! is_array( $tree ) ) {
			return $tree;
		}
		$out = array();
		foreach ( $tree as $id => $item ) {
			if ( isset( $drop[ $id ] ) ) {
				continue;
			}
			if ( is_array( $item ) && isset( $item['items'] ) && is_array( $item['items'] ) ) {
				$had_items     = ! empty( $item['items'] );
				$item['items'] = self::prune_menu_tree( $item['items'], $drop, $depth + 1 );
				// Drop a group that lost its last child to the prune.
				if ( $had_items && empty( $item['items'] ) ) {
					continue;
				}
			}
			$out[ $id ] = $item;
		}
		return $out;
	}
}

// Priority 4 — BEFORE `WP_Admin_Shell_Menu_Items::bind_screens` (5) and
// `WP_Admin_Shell_Data_View_Config::inject_app_baselines` (6) so neither
// stamps onto a screen / menu node this pass drops.
add_filter( 'wp_admin_shell_data', array( 'WP_Admin_Shell_Appearance_Menu', 'prune' ), 4 );
