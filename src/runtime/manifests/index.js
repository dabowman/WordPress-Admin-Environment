/**
 * Kernel-side accessor for the v2 manifest payload (V2.M1 task 5).
 *
 * PHP composes `window.wpAdminWorkspaces.manifests` as part of the inline-
 * script handoff. Apps and engines registered via `app.json` /
 * `engine.json` files (convention-path discovery or programmatic
 * `wp_admin_workspaces_register_app()` / `wp_admin_workspaces_register_engine()`)
 * appear here keyed by id.
 *
 * The kernel uses these accessors during composition. The legacy
 * imperative source registry (`src/runtime/registry/builtins.js`)
 * continues to run in parallel during the v1 → v2 transition; v2.M2
 * begins migrating the existing core apps from imperative registration
 * to manifest-driven discovery.
 *
 * Returns plain manifest objects matching `docs/schemas/workspace-app.json`
 * / `docs/schemas/workspace-engine.json`. Authoring-time validation runs
 * via Ajv against those schemas; PHP-side validation happens at
 * registration. Kernel callers can trust the shape.
 */

function manifestPayload() {
	if ( typeof window === 'undefined' ) {
		return { apps: {}, engines: {} };
	}
	return window.wpAdminWorkspaces?.manifests || { apps: {}, engines: {} };
}

export function getApp( id ) {
	const apps = manifestPayload().apps || {};
	return apps[ id ] || null;
}

export function getEngine( id ) {
	const engines = manifestPayload().engines || {};
	return engines[ id ] || null;
}

export function listApps() {
	return manifestPayload().apps || {};
}

export function listEngines() {
	return manifestPayload().engines || {};
}

/**
 * Resolve a region's role through template inheritance — JS mirror of
 * `WP_Admin_Workspaces_Manifest_Resolver::resolve_role()`.
 *
 * @param {Object} region           Region declaration from workspace.json.
 * @param {string} engineId         Active engine id.
 * @param {Object} [parentTemplate] Parent region's template definition,
 *                                  when this is a nested child region.
 * @param {string} [childName]      Child key under the parent's `regions`
 *                                  map.
 * @return {string|null} Resolved role, or null if unresolvable.
 */
export function resolveRole(
	region,
	engineId,
	parentTemplate = null,
	childName = null
) {
	if ( ! region || typeof region !== 'object' ) {
		return null;
	}
	if ( typeof region.role === 'string' ) {
		return region.role;
	}
	if ( region.template ) {
		const engine = getEngine( engineId );
		const tmpl = engine?.templates?.[ region.template ];
		if ( tmpl?.role ) {
			return tmpl.role;
		}
	}
	if ( parentTemplate && childName ) {
		const child = parentTemplate?.regions?.[ childName ];
		if ( child?.role ) {
			return child.role;
		}
	}
	return null;
}

const ROUTE_KEY_RE = /^(_self|[a-z][a-z0-9-]*)$/;
const ROUTE_PATTERN_RE = /^\/[A-Za-z0-9_/{}\-*]*$/;

export function isValidRouteKey( key ) {
	return typeof key === 'string' && ROUTE_KEY_RE.test( key );
}

export function isValidRoutePattern( pattern ) {
	return typeof pattern === 'string' && ROUTE_PATTERN_RE.test( pattern );
}
