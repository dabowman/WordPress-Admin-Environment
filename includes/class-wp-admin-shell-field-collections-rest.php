<?php
/**
 * /wp-admin-shell/v1/field-collections — data-field collections matching `(kind, name)`.
 *
 * GET /field-collections?kind=postType&name=post
 *   Returns `{ kind, name, collections: { id: { kind, name, fields, fieldsModule? }, ... } }`.
 *   Includes exact-name matches plus universal collections (where the
 *   collection's `name === null`). v3 reads `settings.dataFields[]` (the
 *   renamed home of v2's top-level `fieldCollections` block).
 *
 * @package WP_Admin_Shell
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Shell_Field_Collections_REST {

	const REST_NAMESPACE = 'wp-admin-shell/v1';

	public static function register() {
		register_rest_route(
			self::REST_NAMESPACE,
			'/field-collections',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_collections' ),
					'permission_callback' => array( __CLASS__, 'permission_check' ),
					'args'                => array(
						'kind' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_Field_Collections', 'sanitize_segment' ),
						),
						'name' => array(
							'type'              => 'string',
							'required'          => true,
							'sanitize_callback' => array( 'WP_Admin_Shell_Data_Field_Collections', 'sanitize_segment' ),
						),
					),
				),
			)
		);
	}

	public static function permission_check() {
		return is_user_logged_in();
	}

	public static function get_collections( $request ) {
		$kind = $request->get_param( 'kind' );
		$name = $request->get_param( 'name' );

		if ( $kind === '' || $name === '' ) {
			return new WP_Error(
				'wp_admin_shell_field_collections_invalid_segment',
				__( 'kind and name must contain at least one [A-Za-z0-9_-] character after sanitization.', 'wp-admin-shell' ),
				array( 'status' => 400 )
			);
		}

		$config = wp_admin_shell_get_active_config();

		// Pull cascade-merged data-field collections from the resolved
		// tree at `settings.dataFields`. Includes both programmatically-
		// registered (via the `wp_admin_shell_data_plugin` injector in
		// data-field-collections.php) and admin.json-authored entries;
		// cascade ordering already resolved by the resolver.
		$all = isset( $config['settings']['dataFields'] ) && is_array( $config['settings']['dataFields'] )
			? $config['settings']['dataFields']
			: array();

		$matches = array();
		foreach ( $all as $id => $doc ) {
			if ( ! is_array( $doc ) || ! isset( $doc['kind'] ) ) {
				continue;
			}
			if ( $doc['kind'] !== $kind ) {
				continue;
			}
			$doc_name = array_key_exists( 'name', $doc ) ? $doc['name'] : null;
			if ( $doc_name === null || $doc_name === $name ) {
				$matches[ $id ] = $doc;
			}
		}

		return rest_ensure_response(
			array(
				'kind'        => $kind,
				'name'        => $name,
				'collections' => $matches,
			)
		);
	}
}

add_action( 'rest_api_init', array( 'WP_Admin_Shell_Field_Collections_REST', 'register' ) );
