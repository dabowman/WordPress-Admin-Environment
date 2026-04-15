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

	wp_enqueue_script(
		'wp-admin-shell',
		WP_ADMIN_SHELL_URL . 'build/index.js',
		$asset['dependencies'],
		$asset['version'],
		true
	);

	wp_enqueue_style(
		'wp-admin-shell',
		WP_ADMIN_SHELL_URL . 'build/index.css',
		array( 'wp-components', 'wp-dataviews' ),
		$asset['version']
	);

	$config = wp_admin_shell_get_active_config();

	wp_add_inline_script( 'wp-admin-shell', 'window.wpAdminShell = ' . wp_json_encode( array(
		'config'   => $config,
		'siteUrl'  => get_site_url(),
		'adminUrl'  => admin_url(),
		'pluginUrl' => WP_ADMIN_SHELL_URL,
		'restUrl'  => get_rest_url(),
		'nonce'    => wp_create_nonce( 'wp_rest' ),
		'userId'   => get_current_user_id(),
		'siteName' => get_bloginfo( 'name' ),
		'shells'   => wp_admin_shell_get_available_shells(),
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
 * Read the active admin.json configuration.
 */
function wp_admin_shell_get_active_config() {
	$active = sanitize_file_name( get_option( 'wp_admin_shell_active_config', 'developer-admin' ) );
	$path   = WP_ADMIN_SHELL_PATH . 'shells/' . $active . '.json';

	if ( ! file_exists( $path ) ) {
		$path = WP_ADMIN_SHELL_PATH . 'shells/developer-admin.json';
	}

	if ( ! file_exists( $path ) ) {
		return array(
			'name'  => 'default',
			'title' => 'Default Shell',
		);
	}

	$json   = file_get_contents( $path );
	$config = json_decode( $json, true );

	return is_array( $config ) ? $config : array(
		'name'  => 'default',
		'title' => 'Default Shell',
	);
}

/**
 * Register the shell settings.
 */
add_action( 'admin_init', function () {
	register_setting( 'wp_admin_shell_settings', 'wp_admin_shell_active_config', array(
		'type'              => 'string',
		'default'           => 'developer-admin',
		'sanitize_callback' => 'sanitize_file_name',
		'show_in_rest'      => true,
	) );
} );

/**
 * Render the settings page.
 */
function wp_admin_shell_render_settings() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$active = get_option( 'wp_admin_shell_active_config', 'developer-admin' );
	$shells = wp_admin_shell_get_available_shells();
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Shell Settings', 'wp-admin-shell' ); ?></h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'wp_admin_shell_settings' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><?php esc_html_e( 'Active Configuration', 'wp-admin-shell' ); ?></th>
					<td>
						<select name="wp_admin_shell_active_config">
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
			'slug'        => basename( $file, '.json' ),
			'title'       => $data['title'] ?? basename( $file, '.json' ),
			'description' => $data['description'] ?? '',
		);
	}

	return $shells;
}
