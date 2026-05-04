<?php
/**
 * Manifest registry — apps and engines (V2.M1 tasks 2, 3, 5, 6).
 *
 * Holds the in-memory catalog of registered v2 app and engine manifests
 * for the current request. Plugins populate the registry by either:
 *
 *   1. Convention-path discovery — placing `apps/<name>/app.json` or
 *      `engines/<name>/engine.json` under their plugin root. The shell
 *      auto-scans on `init` (priority 8, before main shell init).
 *
 *   2. Programmatic registration — calling
 *      `wp_admin_shell_register_app( $manifest_or_path )` or
 *      `wp_admin_shell_register_engine( $manifest_or_path )` from any
 *      hook. Useful for plugins that compute manifests at runtime.
 *
 * Invalid manifests are rejected with a `_doing_it_wrong()` notice in
 * dev (`WP_DEBUG=true`) and silently skipped in production. Duplicate
 * ids reject the second registration; first-write-wins preserves boot
 * order semantics.
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Manifest_Registry {

	/** @var WP_Admin_Shell_Manifest_Registry|null */
	private static $instance = null;

	/** @var array<string, array> */
	private $apps = array();

	/** @var array<string, array> */
	private $engines = array();

	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Reset the registry. Test-only.
	 */
	public static function reset() {
		self::$instance = null;
	}

	/**
	 * Register an app manifest. Accepts an associative array or an
	 * absolute file path to an `app.json`.
	 *
	 * @return string|WP_Error App id on success, WP_Error on failure.
	 */
	public function register_app( $manifest_or_path ) {
		return $this->register( $manifest_or_path, 'app' );
	}

	/**
	 * Register an engine manifest.
	 *
	 * @return string|WP_Error Engine id on success, WP_Error on failure.
	 */
	public function register_engine( $manifest_or_path ) {
		return $this->register( $manifest_or_path, 'engine' );
	}

	private function register( $manifest_or_path, $kind ) {
		if ( is_string( $manifest_or_path ) ) {
			$result = WP_Admin_Shell_Manifest_Validator::validate_file( $manifest_or_path, $kind );
		} elseif ( is_array( $manifest_or_path ) ) {
			$result             = WP_Admin_Shell_Manifest_Validator::validate( $manifest_or_path, $kind );
			$result['manifest'] = $manifest_or_path;
		} else {
			return new WP_Error(
				'wp_admin_shell_invalid_manifest',
				'Manifest must be an array or a file path string.'
			);
		}

		if ( ! $result['valid'] ) {
			$msg = "Invalid $kind manifest: " . implode( '; ', $result['errors'] );
			$this->dev_warn( $msg );
			return new WP_Error( 'wp_admin_shell_invalid_manifest', $msg, $result['errors'] );
		}

		$manifest = $result['manifest'];
		$id       = $manifest['id'];
		$bucket   = 'app' === $kind ? 'apps' : 'engines';

		if ( isset( $this->{$bucket}[ $id ] ) ) {
			$msg = "Duplicate $kind id rejected: $id (first registration wins)";
			$this->dev_warn( $msg );
			return new WP_Error( 'wp_admin_shell_duplicate_manifest', $msg );
		}

		$this->{$bucket}[ $id ] = $manifest;
		return $id;
	}

	public function get_app( $id ) {
		return $this->apps[ $id ] ?? null;
	}

	public function get_engine( $id ) {
		return $this->engines[ $id ] ?? null;
	}

	/**
	 * @return array<string, array> Map of id => manifest.
	 */
	public function list_apps() {
		return $this->apps;
	}

	/**
	 * @return array<string, array> Map of id => manifest.
	 */
	public function list_engines() {
		return $this->engines;
	}

	/**
	 * Scan a plugin directory for `apps/<name>/app.json` and
	 * `engines/<name>/engine.json`. Auto-registers each match.
	 *
	 * @param string $plugin_dir Absolute path to the plugin's root dir
	 *                           (typically a `WP_PLUGIN_DIR . '/foo/'`
	 *                           value or `plugin_dir_path( __FILE__ )`).
	 * @return int Number of manifests registered.
	 */
	public function discover( $plugin_dir ) {
		$plugin_dir = rtrim( $plugin_dir, '/' ) . '/';
		if ( ! is_dir( $plugin_dir ) ) {
			return 0;
		}

		$count = 0;
		$count += $this->discover_kind( $plugin_dir . 'apps', 'app.json', 'app' );
		$count += $this->discover_kind( $plugin_dir . 'engines', 'engine.json', 'engine' );
		return $count;
	}

	private function discover_kind( $dir, $manifest_name, $kind ) {
		if ( ! is_dir( $dir ) ) {
			return 0;
		}
		$count   = 0;
		$entries = scandir( $dir );
		if ( false === $entries ) {
			return 0;
		}
		foreach ( $entries as $entry ) {
			if ( '.' === $entry || '..' === $entry ) {
				continue;
			}
			$candidate = $dir . '/' . $entry . '/' . $manifest_name;
			if ( is_file( $candidate ) ) {
				$result = $this->register( $candidate, $kind );
				if ( ! is_wp_error( $result ) ) {
					$count++;
				}
			}
		}
		return $count;
	}

	private function dev_warn( $message ) {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			_doing_it_wrong( 'wp_admin_shell_manifest_registry', esc_html( $message ), '2.0.0' );
		}
	}
}
