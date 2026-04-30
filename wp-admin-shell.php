<?php
/**
 * Plugin Name: WP Admin Shell
 * Description: A configurable, React-based WordPress admin environment driven by admin.json configuration files.
 * Version: 0.1.0
 * Requires PHP: 7.4
 * Requires at least: 6.7
 * Text Domain: wp-admin-shell
 */

defined( 'ABSPATH' ) || exit;

define( 'WP_ADMIN_SHELL_PATH', plugin_dir_path( __FILE__ ) );
define( 'WP_ADMIN_SHELL_URL', plugin_dir_url( __FILE__ ) );

/**
 * One-time migration: copy MVP `wp_admin_shell_active_config` value into
 * v1's `wp_admin_shell_active_shell`. The legacy key stays around for
 * one minor cycle; reads check the new key first and fall back. Plan §M2.9.
 */
add_action( 'init', function () {
	if ( get_option( 'wp_admin_shell_active_shell', '' ) === '' ) {
		$legacy = get_option( 'wp_admin_shell_active_config', '' );
		if ( $legacy !== '' ) {
			update_option( 'wp_admin_shell_active_shell', $legacy );
		}
	}
}, 5 );

require_once WP_ADMIN_SHELL_PATH . 'includes/class-wp-admin-shell-selection-rest.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/class-wp-admin-shell-can-rest.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/class-wp-admin-shell-prefs-rest.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/cascade/class-wp-admin-shell-merge.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/cascade/class-wp-admin-shell-customizable.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/cascade/class-wp-admin-shell-cache.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/cascade/class-wp-admin-shell-config-validator.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/origins/class-wp-admin-shell-origin-core.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/cascade/class-wp-admin-shell-resolver.php';
require_once WP_ADMIN_SHELL_PATH . 'includes/class-wp-admin-shell-config.php';

/**
 * Register the shell admin page and settings.
 */
add_action( 'admin_menu', function () {
	add_menu_page(
		__( 'Shell Admin', 'wp-admin-shell' ),
		__( 'Shell Admin', 'wp-admin-shell' ),
		'read',
		'wp-admin-shell',
		'wp_admin_shell_render_page',
		'dashicons-layout',
		2
	);

	add_submenu_page(
		'wp-admin-shell',
		__( 'Shell Settings', 'wp-admin-shell' ),
		__( 'Settings', 'wp-admin-shell' ),
		'manage_options',
		'wp-admin-shell-settings',
		'wp_admin_shell_render_settings'
	);
} );

/**
 * Render the shell page container.
 */
function wp_admin_shell_render_page() {
	echo '<div id="wp-admin-shell"></div>';
}

/**
 * Enqueue shell assets on the shell page only.
 */
add_action( 'admin_enqueue_scripts', function ( $hook ) {
	if ( 'toplevel_page_wp-admin-shell' !== $hook ) {
		return;
	}

	$asset_path = WP_ADMIN_SHELL_PATH . 'build/index.asset.php';
	if ( ! file_exists( $asset_path ) ) {
		return;
	}

	$asset = include $asset_path;

	// Filter out script dependencies that aren't registered in this
	// WordPress version (e.g., wp-dataviews requires Gutenberg plugin
	// or may not be registered on all admin pages).
	$deps = array_filter( $asset['dependencies'], function ( $dep ) {
		return wp_scripts()->query( $dep, 'registered' ) || wp_scripts()->query( $dep, 'enqueued' );
	} );

	wp_enqueue_script(
		'wp-admin-shell',
		WP_ADMIN_SHELL_URL . 'build/index.js',
		array_values( $deps ),
		$asset['version'],
		true
	);

	wp_enqueue_style(
		'wp-admin-shell-dataviews',
		WP_ADMIN_SHELL_URL . 'build/dataviews.css',
		array( 'wp-components' ),
		$asset['version']
	);

	// Block editor styles — needed by SimpleEditorApp (BlockEditorProvider + BlockList).
	wp_enqueue_style( 'wp-block-editor' );
	wp_enqueue_style( 'wp-block-library' );
	wp_enqueue_style( 'wp-format-library' );

	wp_enqueue_style(
		'wp-admin-shell',
		WP_ADMIN_SHELL_URL . 'build/index.css',
		array( 'wp-components', 'wp-admin-shell-dataviews' ),
		$asset['version']
	);

	$config = wp_admin_shell_get_active_config();

	$current_user = wp_get_current_user();

	wp_add_inline_script( 'wp-admin-shell', 'window.wpAdminShell = ' . wp_json_encode( array(
		'config'        => $config,
		'siteUrl'       => get_site_url(),
		'homeUrl'       => home_url(),
		'adminUrl'      => admin_url(),
		'dashboardUrl'  => admin_url(),
		'pluginUrl'     => WP_ADMIN_SHELL_URL,
		'restUrl'       => get_rest_url(),
		'nonce'         => wp_create_nonce( 'wp_rest' ),
		'userId'        => get_current_user_id(),
		'siteName'      => get_bloginfo( 'name' ),
		'shells'        => wp_admin_shell_get_available_shells(),
		'user'          => array(
			'displayName' => $current_user->display_name,
			'avatarUrl'   => get_avatar_url( $current_user->ID, array( 'size' => 32 ) ),
		),
		'settingsGeneral' => current_user_can( 'manage_options' )
			? wp_admin_shell_get_settings_general_data()
			: null,
		'capabilities'  => wp_admin_shell_resolve_capabilities( $config ),
	) ) . ';', 'before' );

	wp_add_inline_style( 'wp-admin-shell', '
		#adminmenuwrap, #adminmenuback, #wpadminbar, #wpfooter { display: none !important; }
		#wpcontent { margin-left: 0 !important; }
		#wpbody-content { padding-bottom: 0; }
		html.wp-toolbar { padding-top: 0 !important; }
		#wp-admin-shell { position: fixed; inset: 0; z-index: 99999; }
	' );
} );

/**
 * Read the active admin.json configuration through the M2 cascade resolver.
 *
 * Five origins (core / plugin / site / role / user) are loaded, filtered,
 * and merged into a single resolved doc. The legacy single-file loader is
 * gone — every shell file goes through the same pipeline so behavior is
 * uniform whether the shell ships with the plugin, lives in DB options,
 * or is contributed by a programmatic registration.
 */
function wp_admin_shell_get_active_config() {
	return WP_Admin_Shell_Resolver::resolve();
}

/**
 * Pre-compute capability decisions for every cap declared in the resolved
 * config. Walks regions[*].capability + applications[*].capability, plus
 * built-in source capability floors. The runtime sees an absolute
 * `{cap: bool}` map for everything that matters during initial render;
 * the /wp-admin-shell/v1/can/{cap} endpoint covers anything plugin code
 * looks up dynamically.
 */
function wp_admin_shell_resolve_capabilities( $config ) {
	$declared = array();

	foreach ( ( $config['settings']['regions'] ?? array() ) as $region ) {
		if ( isset( $region['capability'] ) && is_string( $region['capability'] ) ) {
			$declared[ $region['capability'] ] = true;
		}
	}
	foreach ( ( $config['settings']['applications'] ?? array() ) as $app ) {
		if ( isset( $app['capability'] ) && is_string( $app['capability'] ) ) {
			$declared[ $app['capability'] ] = true;
		}
	}

	// Built-in source capability floors (mirrors registry/builtins.js
	// `capabilities` arrays). Kept tight to the surface authors actually
	// declare — adding every WP cap here would inflate the inline script.
	foreach ( array( 'list_users', 'moderate_comments', 'manage_options', 'edit_theme_options' ) as $cap ) {
		$declared[ $cap ] = true;
	}

	$out = array();
	foreach ( array_keys( $declared ) as $cap ) {
		$out[ $cap ] = current_user_can( $cap );
	}
	return $out;
}

/**
 * Register the shell settings.
 *
 * Also extend core `general` options so SettingsGeneralApp can read/write
 * them via /wp/v2/settings. Core registers blogname/blogdescription/url/email/
 * timezone/date_format/time_format/start_of_week/language but skips home,
 * users_can_register, default_role.
 */
add_action( 'init', function () {
	// Active shell (canonical v1 key). Sole setting on the
	// `wp_admin_shell_settings` page-form group so options.php doesn't
	// NULL-out adjacent options when the form posts.
	//
	// Wrap `sanitize_file_name` defensively: the core sanitizer fatals
	// on NULL since PHP 8.1 — see wp_is_valid_utf8 in /wp-includes/utf8.php.
	register_setting( 'wp_admin_shell_settings', 'wp_admin_shell_active_shell', array(
		'type'              => 'string',
		'default'           => '',
		'sanitize_callback' => function ( $value ) {
			return sanitize_file_name( (string) $value );
		},
		'show_in_rest'      => true,
	) );

	// Cascade-origin options live in a separate group — REST-exposed but
	// not edited by the settings page. Keeping them off the page-form
	// group avoids the "form posts only one option, options.php NULLs the
	// rest" failure mode the MVP migration hit on PHP 8.1+.
	register_setting( 'wp_admin_shell_cascade', 'wp_admin_shell_site_config', array(
		'type'         => 'object',
		'default'      => array(),
		'show_in_rest' => array(
			'schema' => array(
				'type'                 => 'object',
				'additionalProperties' => true,
			),
		),
	) );

	register_setting( 'wp_admin_shell_cascade', 'wp_admin_shell_role_config', array(
		'type'         => 'object',
		'default'      => array(),
		'show_in_rest' => array(
			'schema' => array(
				'type'                 => 'object',
				'additionalProperties' => true,
			),
		),
	) );

	if ( ! is_multisite() ) {
		register_setting( 'general', 'home', array(
			'show_in_rest' => array(
				'name'   => 'home',
				'schema' => array( 'format' => 'uri' ),
			),
			'type'         => 'string',
			'description'  => __( 'Site address (front-end URL).', 'wp-admin-shell' ),
		) );

		register_setting( 'general', 'users_can_register', array(
			'show_in_rest' => true,
			'type'         => 'boolean',
			'description'  => __( 'Allow new user registration.', 'wp-admin-shell' ),
		) );

		register_setting( 'general', 'default_role', array(
			'show_in_rest' => true,
			'type'         => 'string',
			'description'  => __( 'Default role for new users.', 'wp-admin-shell' ),
		) );
	}
} );

/**
 * Build the data payload that SettingsGeneralApp consumes (timezone groups,
 * languages, roles, date/time format presets, format previews). Uses the same
 * core helpers wp-admin/options-general.php uses so the app stays in lockstep.
 */
function wp_admin_shell_get_settings_general_data() {
	require_once ABSPATH . 'wp-admin/includes/translation-install.php';

	// Languages (locales installed + downloadable translations).
	$installed_languages = get_available_languages();
	$translations        = wp_get_available_translations();

	$language_options = array(
		array( 'value' => '', 'label' => 'English (United States)' ),
	);
	$installed_group = array();
	foreach ( $installed_languages as $locale ) {
		$label = isset( $translations[ $locale ]['native_name'] )
			? $translations[ $locale ]['native_name']
			: $locale;
		$installed_group[] = array( 'value' => $locale, 'label' => $label );
	}
	$available_group = array();
	if ( current_user_can( 'install_languages' ) && wp_can_install_language_pack() ) {
		foreach ( $translations as $locale => $data ) {
			if ( in_array( $locale, $installed_languages, true ) ) {
				continue;
			}
			$available_group[] = array(
				'value' => $locale,
				'label' => isset( $data['native_name'] ) ? $data['native_name'] : $locale,
			);
		}
	}

	// Timezones, grouped by continent. Mirrors wp_timezone_choice() output.
	$tz_identifiers = timezone_identifiers_list();
	$tz_groups      = array(
		array( 'label' => __( 'UTC', 'wp-admin-shell' ), 'options' => array(
			array( 'value' => 'UTC', 'label' => 'UTC' ),
		) ),
	);
	$by_continent = array();
	foreach ( $tz_identifiers as $zone ) {
		if ( $zone === 'UTC' ) {
			continue;
		}
		$parts     = explode( '/', $zone );
		$continent = $parts[0];
		if ( ! in_array( $continent, array( 'Africa', 'America', 'Antarctica', 'Arctic', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific' ), true ) ) {
			continue;
		}
		$by_continent[ $continent ][] = array(
			'value' => $zone,
			'label' => str_replace( array( $continent . '/', '_' ), array( '', ' ' ), $zone ),
		);
	}
	foreach ( $by_continent as $continent => $zones ) {
		$tz_groups[] = array(
			'label'   => $continent,
			'options' => $zones,
		);
	}
	// Manual UTC offsets (UTC-12 through UTC+14, half/quarter step).
	$offset_options = array();
	$offset_range   = array( -12, -11.5, -11, -10.5, -10, -9.5, -9, -8.5, -8, -7.5, -7, -6.5, -6, -5.5, -5, -4.5, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 5.75, 6, 6.5, 7, 7.5, 8, 8.5, 8.75, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.75, 13, 13.75, 14 );
	foreach ( $offset_range as $offset ) {
		$value = 'UTC' . ( $offset >= 0 ? '+' : '' ) . $offset;
		$offset_options[] = array( 'value' => $value, 'label' => $value );
	}
	$tz_groups[] = array(
		'label'   => __( 'Manual offsets', 'wp-admin-shell' ),
		'options' => $offset_options,
	);

	// Roles for new-user default.
	$roles_raw = wp_roles()->get_names();
	$role_options = array();
	foreach ( $roles_raw as $slug => $name ) {
		$role_options[] = array(
			'value' => $slug,
			'label' => translate_user_role( $name ),
		);
	}

	// Date/time format presets (same filters core uses).
	$date_formats = array_unique( apply_filters( 'date_formats', array( __( 'F j, Y' ), 'Y-m-d', 'm/d/Y', 'd/m/Y' ) ) );
	$time_formats = array_unique( apply_filters( 'time_formats', array( __( 'g:i a' ), 'g:i A', 'H:i' ) ) );

	$current_offset = get_option( 'gmt_offset' );
	$current_tz     = get_option( 'timezone_string' );
	if ( empty( $current_tz ) ) {
		if ( 0 == $current_offset ) {
			$current_tz = 'UTC+0';
		} elseif ( $current_offset < 0 ) {
			$current_tz = 'UTC' . $current_offset;
		} else {
			$current_tz = 'UTC+' . $current_offset;
		}
	}

	return array(
		'languages' => array(
			'installed' => $installed_group,
			'available' => $available_group,
			'default'   => $language_options,
		),
		'timezone'    => array(
			'groups'  => $tz_groups,
			'current' => $current_tz,
			'utcNow'  => date_i18n( 'Y-m-d H:i:s', false, true ),
			'localNow' => date_i18n( 'Y-m-d H:i:s' ),
		),
		'roles'       => $role_options,
		'dateFormats' => array_values( array_map( function ( $fmt ) {
			return array( 'value' => $fmt, 'label' => date_i18n( $fmt ) );
		}, $date_formats ) ),
		'timeFormats' => array_values( array_map( function ( $fmt ) {
			return array( 'value' => $fmt, 'label' => date_i18n( $fmt ) );
		}, $time_formats ) ),
		'isMultisite' => is_multisite(),
		'siteurlConst' => defined( 'WP_SITEURL' ),
		'homeConst'    => defined( 'WP_HOME' ),
		'pendingAdminEmail' => get_option( 'new_admin_email' ),
		'weekdays'     => array_map( function ( $i ) {
			global $wp_locale;
			return array( 'value' => (string) $i, 'label' => $wp_locale->get_weekday( $i ) );
		}, range( 0, 6 ) ),
	);
}

/**
 * Render the settings page.
 */
function wp_admin_shell_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$active = get_option( 'wp_admin_shell_active_shell', '' );
	if ( $active === '' ) {
		$active = get_option( 'wp_admin_shell_active_config', 'developer-admin' );
	}
	$shells = wp_admin_shell_get_available_shells();
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Shell Settings', 'wp-admin-shell' ); ?></h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'wp_admin_shell_settings' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><?php esc_html_e( 'Active Shell', 'wp-admin-shell' ); ?></th>
					<td>
						<select name="wp_admin_shell_active_shell">
							<?php foreach ( $shells as $shell ) : ?>
								<option value="<?php echo esc_attr( $shell['slug'] ); ?>"
									<?php selected( $active, $shell['slug'] ); ?>>
									<?php echo esc_html( $shell['title'] ); ?>
									&mdash; <?php echo esc_html( $shell['description'] ); ?>
								</option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/**
 * List available shell configurations from the shells/ directory.
 */
function wp_admin_shell_get_available_shells() {
	$shells = array();
	$dir    = WP_ADMIN_SHELL_PATH . 'shells/';

	foreach ( glob( $dir . '*.json' ) ?: array() as $file ) {
		$data = json_decode( file_get_contents( $file ), true );
		if ( ! is_array( $data ) ) {
			continue;
		}
		$shells[] = array(
			'slug'           => basename( $file, '.json' ),
			'title'          => $data['title'] ?? basename( $file, '.json' ),
			'description'    => $data['description'] ?? '',
			'userSwitchable' => ! empty( $data['userSwitchable'] ),
		);
	}

	return $shells;
}
