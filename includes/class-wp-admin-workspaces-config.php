<?php
/**
 * WP_Admin_Workspaces_Config — read-only wrapper around a resolved workspace.json.
 *
 * The resolver returns a plain associative array; this class wraps it in
 * a small accessor surface so callers don't have to hardcode the
 * `settings.regions[id]` / `settings.applications[]` paths. Mirrors
 * `WP_Theme_JSON`'s role of "merged result, structured access".
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Config {

	/** @var array */
	private $data;

	public function __construct( array $data ) {
		$this->data = $data;
	}

	public static function from_array( array $data ) {
		return new self( $data );
	}

	public function to_array() {
		return $this->data;
	}

	public function get_name() {
		return $this->data['name'] ?? null;
	}

	public function get_title() {
		return $this->data['title'] ?? null;
	}

	public function get_active_engine() {
		return $this->data['settings']['workspace']['layoutEngine'] ?? null;
	}

	public function get_default_route() {
		return $this->data['settings']['defaultRoute']
			?? $this->data['defaultRoute']
			?? null;
	}

	/**
	 * Region instances keyed by id. Always returns an array (possibly empty).
	 */
	public function get_regions() {
		$regions = $this->data['settings']['regions'] ?? array();
		return is_array( $regions ) ? $regions : array();
	}

	public function get_region( $id ) {
		$regions = $this->get_regions();
		return $regions[ $id ] ?? null;
	}

	/**
	 * Applications as a list. Resolver emits a list; this accessor also
	 * accepts the spec's map form for forward compatibility.
	 */
	public function get_applications() {
		$apps = $this->data['settings']['applications'] ?? array();
		if ( ! is_array( $apps ) ) {
			return array();
		}
		if ( WP_Admin_Workspaces_Merge::is_assoc( $apps ) ) {
			$out = array();
			foreach ( $apps as $id => $body ) {
				$out[] = array_merge( array( 'id' => $id ), is_array( $body ) ? $body : array() );
			}
			return $out;
		}
		return $apps;
	}

	public function get_application( $id ) {
		foreach ( $this->get_applications() as $app ) {
			if ( ( $app['id'] ?? null ) === $id ) {
				return $app;
			}
		}
		return null;
	}

	public function get_styles() {
		return $this->data['styles'] ?? array();
	}

	public function get_branding() {
		return $this->data['styles']['branding']
			?? $this->data['branding']
			?? array();
	}

	public function get_user_switchable() {
		return ! empty( $this->data['user-switchable'] );
	}
}
