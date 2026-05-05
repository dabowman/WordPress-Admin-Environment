<?php
/**
 * Core origin loader.
 *
 * Provides the bundled defaults baseline and the v0 → v1 normalizer (the
 * M1 `normalizeV0` JS shim retires here, satisfying plan task M2.11).
 *
 * Other origin loaders return slices of an admin.json doc as-is. The core
 * origin is special because it owns:
 *   1. an empty baseline so missing files are not fatal,
 *   2. the v0 (MVP flat) → v1 partitioned-shape normalization, so the
 *      runtime never sees the legacy form regardless of source.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Origin_Core {

	const ENGINE_ID = 'core:site-editor-layout';

	public static function load( $shell_path ) {
		if ( ! file_exists( $shell_path ) ) {
			return self::empty_doc();
		}
		$json = file_get_contents( $shell_path );
		$raw  = json_decode( $json, true );
		if ( ! is_array( $raw ) ) {
			return self::empty_doc();
		}
		return self::normalize_v0( $raw );
	}

	/**
	 * Pure function. Maps a v0 (MVP flat) admin.json doc onto the v1
	 * partitioned shape the resolver / kernel expect.
	 *
	 * Backwards-compatible mirrors (config.branding, config.layout,
	 * config.applications, config.navigation, config.toolbar, config.defaultApp)
	 * are kept on the result so existing JS code paths don't have to be
	 * rewritten in lockstep with this milestone.
	 */
	public static function normalize_v0( $raw ) {
		if ( ! is_array( $raw ) ) {
			return self::empty_doc();
		}

		// Already v1-shaped: pass through.
		if ( isset( $raw['settings']['shell']['layoutEngine'] ) ) {
			return $raw;
		}

		// v2-shaped admin.json: top-level `engine` + `regions` (no
		// `settings` partition). Pass through unchanged. The kernel +
		// runtime read both paths during the V2.M2/M3 transition; the
		// PHP cascade resolver merges v2 docs as opaque trees. V2.M4
		// task 8 will rewrite this normalizer to emit v2 shape from v0
		// inputs as well, retiring the v1 partitioned form entirely.
		if (
			isset( $raw['engine'] ) &&
			isset( $raw['regions'] ) &&
			! isset( $raw['settings'] )
		) {
			return $raw;
		}

		$branding = array_merge(
			array(
				'logo'        => null,
				'title'       => null,
				'accentColor' => '#3858e9',
			),
			isset( $raw['branding'] ) && is_array( $raw['branding'] ) ? $raw['branding'] : array()
		);

		$layout = array_merge(
			array(
				'navigation'           => 'left',
				'navigationCollapsed'  => false,
				'toolbar'              => true,
				'navigationWidth'      => 300,
			),
			isset( $raw['layout'] ) && is_array( $raw['layout'] ) ? $raw['layout'] : array()
		);

		$applications = array();
		foreach ( ( $raw['applications'] ?? array() ) as $app ) {
			if ( ! is_array( $app ) ) {
				continue;
			}
			$applications[] = array_merge(
				array( 'hidden' => false, 'config' => array() ),
				$app
			);
		}

		$navigation = isset( $raw['navigation'] ) && is_array( $raw['navigation'] )
			? $raw['navigation']
			: array_values(
				array_map(
					fn( $a ) => array( 'app' => $a['id'] ),
					array_filter( $applications, fn( $a ) => empty( $a['hidden'] ) )
				)
			);

		$toolbar = is_array( $raw['toolbar'] ?? null )
			? array(
				'left'  => $raw['toolbar']['left']  ?? array(),
				'right' => $raw['toolbar']['right'] ?? array(),
			)
			: array( 'left' => array(), 'right' => array() );

		$show_sidebar         = ( $layout['navigation'] ?? 'left' ) !== 'hidden';
		$show_toolbar         = ( $layout['toolbar'] ?? true ) !== false;
		$has_toolbar_actions  = ! empty( $toolbar['left'] ) || ! empty( $toolbar['right'] );

		$default_app = $raw['defaultApp'] ?? null;
		if ( ! $default_app ) {
			foreach ( $applications as $a ) {
				if ( empty( $a['hidden'] ) ) {
					$default_app = $a['id'];
					break;
				}
			}
		}

		$system_apps = self::build_system_apps( $branding, $navigation, $layout, $toolbar, $has_toolbar_actions );
		$regions     = self::build_regions( $show_sidebar, $show_toolbar && $has_toolbar_actions, $layout, $system_apps );

		$default_route = $default_app ? "/$default_app" : null;
		$all_apps      = array_merge( $applications, $system_apps );

		return array(
			'name'        => $raw['name']        ?? null,
			'title'       => $raw['title']       ?? null,
			'description' => $raw['description'] ?? null,
			'version'     => 1,

			// Backwards-compatible mirrors (used by some JS code during M2).
			'branding'    => $branding,
			'layout'      => $layout,
			'applications' => $all_apps,
			'navigation'  => $navigation,
			'toolbar'     => $toolbar,
			'defaultApp'  => $default_app,

			// v1 partitioned settings.
			'settings'    => array(
				'shell'       => array(
					'layoutEngine' => self::ENGINE_ID,
					'config'       => array( 'regions' => array_keys( $regions ) ),
				),
				'regions'     => $regions,
				'applications' => $all_apps,
				'defaultRoute' => $default_route,
			),
			'styles'      => self::v0_styles_from_branding( $branding ),
			'defaultRoute' => $default_route,
		);
	}

	/**
	 * Map v0 `branding.accentColor` into a minimal v1 `styles` tree so the
	 * compat bridge has a brand slot to derive from. v0 shells didn't ship
	 * a styles block — this bridges them onto the M3 token system without
	 * forcing every shell author to author a full styles tree.
	 */
	private static function v0_styles_from_branding( $branding ) {
		$accent = $branding['accentColor'] ?? '#3858e9';
		return array(
			'branding' => $branding,
			'color'    => array(
				'bg' => array(
					'interactive' => array(
						'brand' => array(
							'strong'        => $accent,
							'strong-active' => $accent,
						),
					),
					'surface' => array(
						'neutral' => array( 'strong' => '#ffffff' ),
					),
				),
				'fg' => array(
					'content' => array(
						'neutral' => array( 'default' => '#1e1e1e' ),
					),
				),
				'stroke' => array(
					'focus' => array( 'brand' => $accent ),
				),
			),
			'border' => array( 'width' => array( 'focus' => '2px' ) ),
			'chrome' => array(
				'sidebar' => array(
					'background'        => '#1e1e1e',
					'foreground'        => '#949494',
					'foreground-active' => '#e0e0e0',
					'border'            => '#2f2f2f',
					'item'              => array(
						'background'        => 'transparent',
						'background-hover'  => '#2f2f2f',
						'background-active' => $accent,
						'foreground'        => '#e0e0e0',
						'foreground-active' => '#ffffff',
					),
					'width'             => '300px',
				),
				'toolbar' => array(
					'background' => '#1e1e1e',
					'foreground' => '#e0e0e0',
					'border'     => '#2f2f2f',
					'height'     => '48px',
				),
				'site-hub' => array(
					'background' => '#1e1e1e',
					'foreground' => '#ffffff',
					'icon-size'  => '32px',
					'padding'    => '12px',
				),
				'content' => array(
					'background'      => '#1e1e1e',
					'card-background' => '#ffffff',
					'card-radius'     => '4px',
					'card-padding'    => '16px',
					'card-max-width'  => '1200px',
				),
			),
		);
	}

	private static function build_system_apps( $branding, $navigation, $layout, $toolbar, $has_toolbar_actions ) {
		$apps = array(
			array(
				'id'     => '__site-hub',
				'source' => 'core:site-hub',
				'hidden' => true,
				'config' => array(),
			),
			array(
				'id'     => '__nav',
				'source' => 'core:navigation',
				'hidden' => true,
				'config' => array(
					'items'     => $navigation,
					'collapsed' => ! empty( $layout['navigationCollapsed'] ),
				),
			),
			array(
				'id'     => '__command-picker',
				'source' => 'core:command-picker',
				'hidden' => true,
				'config' => array(),
			),
			array(
				'id'     => '__notices-banner',
				'source' => 'core:notices-banner',
				'hidden' => true,
				'config' => array(),
			),
			array(
				'id'     => '__notices-snackbar',
				'source' => 'core:notices-snackbar',
				'hidden' => true,
				'config' => array(),
			),
		);
		if ( $has_toolbar_actions ) {
			$apps[] = array(
				'id'     => '__toolbar-actions',
				'source' => 'core:toolbar-actions',
				'hidden' => true,
				'config' => array(
					'left'  => $toolbar['left'],
					'right' => $toolbar['right'],
				),
			);
		}
		return $apps;
	}

	private static function build_regions( $show_sidebar, $show_toolbar, $layout, $system_apps ) {
		$regions = array();
		if ( $show_toolbar ) {
			$regions['toolbar'] = array(
				'id'       => 'toolbar',
				'source'   => 'core:toolbar-region',
				'kind'     => 'persistent',
				'config'   => array( 'height' => 48 ),
				'contains' => self::filter_existing(
					array( '__toolbar-actions' ),
					$system_apps
				),
			);
		}
		if ( $show_sidebar ) {
			$regions['sidebar'] = array(
				'id'       => 'sidebar',
				'source'   => 'core:sidebar-region',
				'kind'     => 'persistent',
				'config'   => array(
					'position'  => 'left',
					'width'     => $layout['navigationWidth'] ?? 300,
					'collapsed' => ! empty( $layout['navigationCollapsed'] ),
				),
				'contains' => ! empty( $layout['navigationCollapsed'] )
					? array( '__nav' )
					: array( '__site-hub', '__nav' ),
			);
		}
		$regions['content'] = array(
			'id'       => 'content',
			'source'   => 'core:content-region',
			'kind'     => 'persistent',
			'config'   => array( 'router' => true, 'selectionScope' => 'content' ),
			'contains' => array(),
		);
		$regions['command-palette'] = array(
			'id'       => 'command-palette',
			'source'   => 'core:overlay-region',
			'kind'     => 'overlay',
			'config'   => array(),
			'contains' => array( '__command-picker' ),
		);
		$regions['notices'] = array(
			'id'       => 'notices',
			'source'   => 'core:overlay-region',
			'kind'     => 'overlay',
			'config'   => array(),
			'contains' => array( '__notices-banner', '__notices-snackbar' ),
		);
		return $regions;
	}

	private static function filter_existing( $ids, $system_apps ) {
		$present = array_column( $system_apps, 'id' );
		return array_values( array_filter( $ids, fn( $id ) => in_array( $id, $present, true ) ) );
	}

	public static function empty_doc() {
		return array(
			'name'    => 'empty',
			'title'   => 'Empty',
			'version' => 1,
			'settings' => array(
				'shell'   => array(
					'layoutEngine' => self::ENGINE_ID,
					'config'       => array( 'regions' => array( 'content' ) ),
				),
				'regions' => array(
					'content' => array(
						'id'       => 'content',
						'source'   => 'core:content-region',
						'kind'     => 'persistent',
						'config'   => array( 'router' => true ),
						'contains' => array(),
					),
				),
				'applications' => array(),
			),
			'styles' => array( 'branding' => array( 'accentColor' => '#3858e9' ) ),
			'defaultRoute' => null,
		);
	}
}
