/**
 * Runtime region composition rules (V2.M2 task 5).
 *
 * Spec §5.4: a region cannot have both a fixed `app` and a
 * `routing.route-key`. Either it holds an app for the life of the
 * workspace or it reads its app from the URL — never both. The schema at
 * `docs/schemas/admin-v2.json` enforces this for hand-authored
 * documents; the runtime confirms the rule during composition because
 * (a) merge can introduce a violation when a template ships an `app`
 * and the declaration adds a `routing.route-key`, and (b) configs
 * delivered by a programmatic registration path may bypass schema
 * validation.
 *
 * Two pure-ESM exports walk the resolved region tree:
 *   - validateRegion: returns an array of violations
 *     `{ path, rule, message }`. The kernel logs each via
 *     `console.warn`. Empty array = nothing wrong.
 *   - sanitizeRegion: returns a deep clone with conflicting fields
 *     resolved. When both `app` and `routing.route-key` appear on the
 *     same region, `app` is dropped — URL participation is the more
 *     explicit declaration (the author wrote a `routing` block on
 *     purpose), and dropping it would make the region inert. Children
 *     are sanitized recursively under `parent/child` ids.
 *
 * Pure: takes resolved region declarations from `resolveRegion`,
 * returns plain objects. No DOM, no React.
 */

const RULE_APP_XOR_ROUTE_KEY = 'app-xor-route-key';
const RULE_ROUTE_KEY_UNKNOWN_SLOT = 'route-key-unknown-slot';

function regionPath( parentPath, key ) {
	if ( ! parentPath ) {
		return key;
	}
	return `${ parentPath }/${ key }`;
}

function hasRouteKey( region ) {
	return (
		region &&
		region.routing &&
		typeof region.routing[ 'route-key' ] === 'string' &&
		region.routing[ 'route-key' ].length > 0
	);
}

/**
 * Collect the slot namespaces declared in the routes block. The v3
 * compiler keys non-primary `apps[]` entries at `@<slot>/<primary>`
 * (see `compile/synthesizeRoutes.mjs`), so each route pattern of the
 * form `@<slot>/…` contributes its `<slot>` to the available set. Routes
 * keyed at a bare primary path (`/posts`) carry no slot namespace and
 * are ignored — they're read by `_self` / `query` regions, not `mirror`.
 *
 * @param {Object|null} routesBlock workspace.json resolved `routes` map.
 * @return {Set<string>} declared slot names (possibly empty).
 */
function slotNamesFromRoutes( routesBlock ) {
	const slots = new Set();
	if ( ! routesBlock || typeof routesBlock !== 'object' ) {
		return slots;
	}
	for ( const pattern of Object.keys( routesBlock ) ) {
		const m = /^@([a-z][a-z0-9-]*)\//.exec( pattern );
		if ( m ) {
			slots.add( m[ 1 ] );
		}
	}
	return slots;
}

function hasApp( region ) {
	return region && typeof region.app === 'string' && region.app.length > 0;
}

/**
 * @param {Object}              region       Resolved region declaration.
 * @param {string}              [path]       Slash-joined path for messages.
 * @param {Object|Set|null}     [routes]     Resolved `routes` block (or a
 *                                           pre-computed slot-name `Set`).
 *                                           When supplied, a `mirror`-mode
 *                                           region whose `route-key` names
 *                                           no declared slot is flagged.
 *                                           Omit to skip the cross-check
 *                                           (e.g. runtime dynamic children
 *                                           validated before routes exist).
 */
export function validateRegion( region, path = '', routes = null ) {
	const violations = [];
	if ( ! region || typeof region !== 'object' ) {
		return violations;
	}
	const here = path || region.id || '<root>';
	// Accept either a raw routes block or a pre-built slot-name Set so the
	// recursion doesn't re-scan the block at every depth.
	const slotNames =
		routes instanceof Set ? routes : slotNamesFromRoutes( routes );

	if ( hasApp( region ) && hasRouteKey( region ) ) {
		violations.push( {
			path: here,
			rule: RULE_APP_XOR_ROUTE_KEY,
			message:
				`Region "${ here }" declares both \`app\` and \`routing.route-key\`. ` +
				'The two are mutually exclusive (spec §5.4); `app` will be dropped at runtime so URL routing wins.',
		} );
	}

	// Slot cross-check (spec §5.4 / §6.4). A `mirror`-mode region reads
	// `@<route-key>/<primary>` routes; if the route-key is misspelled
	// relative to the slot the compiler emitted, the region silently
	// mounts no app. Only fire when the workspace declares *some* slot
	// routes — a workspace that uses no multi-app screens legitimately
	// leaves an engine's `mirror` peer region (e.g. `detail`) unrouted.
	if (
		hasRouteKey( region ) &&
		region.routing?.mode === 'mirror' &&
		slotNames.size > 0
	) {
		const routeKey = region.routing[ 'route-key' ];
		if ( ! slotNames.has( routeKey ) ) {
			violations.push( {
				path: here,
				rule: RULE_ROUTE_KEY_UNKNOWN_SLOT,
				message:
					`Region "${ here }" declares \`routing.route-key: "${ routeKey }"\` in \`mirror\` mode, ` +
					`but the routes block names no \`@${ routeKey }/…\` slot ` +
					`(available: ${ [ ...slotNames ].map( ( s ) => `"${ s }"` ).join( ', ' ) }). ` +
					'The region will mount no app — check for a misspelled slot name.',
			} );
		}
	}

	if ( region.regions && typeof region.regions === 'object' ) {
		for ( const [ key, child ] of Object.entries( region.regions ) ) {
			const childPath = regionPath( here, key );
			violations.push( ...validateRegion( child, childPath, slotNames ) );
		}
	}

	return violations;
}

export function validateRegions( regionsMap, routes = null ) {
	const violations = [];
	if ( ! regionsMap || typeof regionsMap !== 'object' ) {
		return violations;
	}
	const slotNames = slotNamesFromRoutes( routes );
	for ( const [ id, region ] of Object.entries( regionsMap ) ) {
		violations.push( ...validateRegion( region, id, slotNames ) );
	}
	return violations;
}

export function sanitizeRegion( region ) {
	if ( ! region || typeof region !== 'object' ) {
		return region;
	}
	const out = { ...region };
	if ( hasApp( out ) && hasRouteKey( out ) ) {
		delete out.app;
	}
	if ( out.regions && typeof out.regions === 'object' ) {
		const children = {};
		for ( const [ key, child ] of Object.entries( out.regions ) ) {
			children[ key ] = sanitizeRegion( child );
		}
		out.regions = children;
	}
	return out;
}

export function sanitizeRegions( regionsMap ) {
	if ( ! regionsMap || typeof regionsMap !== 'object' ) {
		return {};
	}
	const out = {};
	for ( const [ id, region ] of Object.entries( regionsMap ) ) {
		out[ id ] = sanitizeRegion( region );
	}
	return out;
}
