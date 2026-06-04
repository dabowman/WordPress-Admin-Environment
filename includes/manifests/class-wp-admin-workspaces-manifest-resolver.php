<?php
/**
 * Manifest reference resolver (V2.M1 task 5).
 *
 * Validates the cross-document constraints JSON Schema cannot reach.
 * The schema validates each artifact in isolation; this class checks
 * that references between workspace.json, app manifests, and engine
 * manifests resolve to registered artifacts.
 *
 * Per `docs/archive/schema-exercise-findings.md`, runtime-only checks:
 *   - role resolvability across template inheritance
 *   - id references (engine, app, template) resolving to registered
 *     artifacts
 *   - route-key shape valid (`_self` or kebab-case slug)
 *   - default-route matching some pattern in the routes block
 *   - app config validating against the app manifest's config-schema
 *     (deferred to a separate config validator — Ajv-side)
 *
 * V2.M1 ships the primitives. V2.M2 (region-vocabulary rebuild) wires
 * them into the composition pipeline that produces a mountable region
 * tree from a v2 workspace.json.
 *
 * @package WP_Admin_Workspaces
 */

defined( 'ABSPATH' ) || exit;

class WP_Admin_Workspaces_Manifest_Resolver {

	const SLUG_PATTERN       = '/^[a-z][a-z0-9-]*$/';
	const ROUTE_KEY_PATTERN  = '/^(_self|[a-z][a-z0-9-]*)$/';
	const ROUTE_PATTERN_RE   = '/^\/[A-Za-z0-9_\/{}\-*]*$/';

	/** @var WP_Admin_Workspaces_Manifest_Registry */
	private $registry;

	public function __construct( WP_Admin_Workspaces_Manifest_Registry $registry ) {
		$this->registry = $registry;
	}

	/**
	 * @return array|null Manifest array if registered; null otherwise.
	 */
	public function resolve_app( $id ) {
		return $this->registry->get_app( $id );
	}

	/**
	 * @return array|null Manifest array if registered; null otherwise.
	 */
	public function resolve_engine( $id ) {
		return $this->registry->get_engine( $id );
	}

	/**
	 * Walk a template inheritance chain. A region's `template` field
	 * names an engine-shipped template; nested children may inherit
	 * from same-named children of that template.
	 *
	 * @return array|null The template definition from the engine
	 *                    manifest, or null if the engine isn't
	 *                    registered or doesn't ship that template.
	 */
	public function resolve_template( $engine_id, $template_id ) {
		$engine = $this->resolve_engine( $engine_id );
		if ( null === $engine ) {
			return null;
		}
		$templates = $engine['templates'] ?? array();
		return $templates[ $template_id ] ?? null;
	}

	/**
	 * Resolve a region's role through template inheritance.
	 *
	 * Order of precedence:
	 *   1. Region's own `role` field (explicit declaration wins).
	 *   2. The named template's `role`.
	 *   3. For nested children: the template-child's `role` (if the
	 *      parent uses a template that ships a same-named child).
	 *
	 * @param array       $region          Region declaration from workspace.json.
	 * @param string      $engine_id       Active engine id.
	 * @param array|null  $parent_template The template definition of the
	 *                                     parent region, when this region
	 *                                     is a nested child. Pass null for
	 *                                     top-level regions.
	 * @param string|null $child_name      The key under the parent's `regions`
	 *                                     map that this region was declared
	 *                                     at. Pass null for top-level regions.
	 * @return string|null Resolved role, or null if unresolvable.
	 */
	public function resolve_role( $region, $engine_id, $parent_template = null, $child_name = null ) {
		if ( ! is_array( $region ) ) {
			return null;
		}
		if ( isset( $region['role'] ) && is_string( $region['role'] ) ) {
			return $region['role'];
		}
		if ( isset( $region['template'] ) ) {
			$tmpl = $this->resolve_template( $engine_id, $region['template'] );
			if ( null !== $tmpl && isset( $tmpl['role'] ) ) {
				return $tmpl['role'];
			}
		}
		if ( null !== $parent_template && null !== $child_name ) {
			$child = $parent_template['regions'][ $child_name ] ?? null;
			if ( null !== $child && isset( $child['role'] ) ) {
				return $child['role'];
			}
		}
		return null;
	}

	/**
	 * @return bool True if `$key` is `_self` or a kebab-case slug.
	 */
	public static function is_valid_route_key( $key ) {
		return is_string( $key ) && (bool) preg_match( self::ROUTE_KEY_PATTERN, $key );
	}

	/**
	 * @return bool True if `$pattern` is a valid route pattern shape
	 *              (leading slash, allowed character set, may contain
	 *              `{name}` segments and trailing `/*`).
	 */
	public static function is_valid_route_pattern( $pattern ) {
		return is_string( $pattern ) && (bool) preg_match( self::ROUTE_PATTERN_RE, $pattern );
	}

	/**
	 * Match a URL value against a route pattern. Supports `{name}`
	 * parameter segments and trailing `/*` wildcards.
	 *
	 * @param string $pattern Route pattern, e.g. `/posts/{id}`.
	 * @param string $value   URL slot value, e.g. `/posts/42`.
	 * @return array|null     Captured params as { name => value }, or
	 *                        null if the pattern does not match.
	 */
	public static function match_route( $pattern, $value ) {
		if ( ! is_string( $pattern ) || ! is_string( $value ) ) {
			return null;
		}
		if ( ! self::is_valid_route_pattern( $pattern ) ) {
			return null;
		}

		$param_names = array();
		$counter     = 0;

		// Replace `{name}` with placeholders that survive preg_quote.
		$with_placeholders = preg_replace_callback(
			'/\{([a-z][a-z0-9-]*)\}/',
			function ( $m ) use ( &$param_names, &$counter ) {
				$param_names[] = $m[1];
				$counter++;
				return '__WPAS_PARAM_' . $counter . '__';
			},
			$pattern
		);

		// Now quote regex specials in the literal segments.
		$regex = preg_quote( $with_placeholders, '#' );

		// Substitute placeholders with capture groups.
		$regex = preg_replace( '/__WPAS_PARAM_\d+__/', '([^/]+)', $regex );

		// Trailing `/*` wildcard. preg_quote turned `/*` into `/\*`.
		if ( substr( $regex, -3 ) === '/\\*' ) {
			$regex         = substr( $regex, 0, -3 ) . '/(.*)';
			$param_names[] = '*';
		}

		if ( ! preg_match( '#^' . $regex . '$#', $value, $matches ) ) {
			return null;
		}

		$captured = array();
		foreach ( $param_names as $i => $name ) {
			$captured[ $name ] = $matches[ $i + 1 ] ?? '';
		}
		return $captured;
	}

	/**
	 * Resolve a default-route declaration against a routes block.
	 *
	 * @param string $default_route Route value (e.g. `/posts`).
	 * @param array  $routes        Map of pattern => route entry.
	 * @return string|null          The matched pattern, or null if none.
	 */
	public static function match_default_route( $default_route, $routes ) {
		if ( ! is_string( $default_route ) || ! is_array( $routes ) ) {
			return null;
		}
		foreach ( $routes as $pattern => $entry ) {
			if ( self::match_route( $pattern, $default_route ) !== null ) {
				return $pattern;
			}
		}
		return null;
	}
}
