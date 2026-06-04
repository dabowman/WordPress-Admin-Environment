<?php
/**
 * Uninstall cleanup for WP Admin Shell.
 *
 * Runs when the plugin is deleted (not merely deactivated). Removes every
 * option, user-meta key, and transient the shell writes so an uninstall — or
 * a clean reset between test runs — leaves no orphaned rows behind.
 *
 * Does NOT touch the site author's `wp-content/workspace.json` override file:
 * that's user-authored content (like a theme's files), not plugin state, and
 * deleting a user's config on uninstall would be surprising + destructive.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/**
 * Remove all shell-owned data from the current site's tables.
 */
function wp_admin_workspaces_uninstall_cleanup() {
	global $wpdb;

	// Options. The shell namespaces every option under `wp_admin_workspaces_`, so a
	// LIKE sweep catches the known set plus any future additions; the explicit
	// list documents what exists today.
	$known_options = array(
		'wp_admin_workspaces_active_config',
		'wp_admin_workspaces_active_workspace',
		'wp_admin_workspaces_cascade',
		'wp_admin_workspaces_db_version',
		'wp_admin_workspaces_role_config',
		'wp_admin_workspaces_settings',
		'wp_admin_workspaces_site_config',
		'wp_admin_workspaces_workspace_enabled',
	);
	foreach ( $known_options as $option ) {
		delete_option( $option );
	}
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- one-time uninstall sweep; no caching applies.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s",
			$wpdb->esc_like( 'wp_admin_workspaces_' ) . '%'
		)
	);

	// Resolver-cache transients (`wp_admin_workspaces_resolved_<hash>` + timeouts).
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery -- one-time uninstall sweep; no caching applies.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
			$wpdb->esc_like( '_transient_wp_admin_workspaces_' ) . '%',
			$wpdb->esc_like( '_transient_timeout_wp_admin_workspaces_' ) . '%'
		)
	);

	// User preferences (the `/user-prefs` endpoint's usermeta). delete_all
	// clears the key for every user in one query.
	delete_metadata( 'user', 0, 'wp_admin_workspaces_user_prefs', '', true );
}

if ( is_multisite() ) {
	$site_ids = get_sites( array( 'fields' => 'ids', 'number' => 0 ) );
	foreach ( $site_ids as $site_id ) {
		switch_to_blog( $site_id );
		wp_admin_workspaces_uninstall_cleanup();
		restore_current_blog();
	}
} else {
	wp_admin_workspaces_uninstall_cleanup();
}
