/**
 * Runtime region composition rules (V2.M2 task 5).
 *
 * Spec §5.4: a region cannot have both a fixed `app` and a
 * `routing.route-key`. Either it holds an app for the life of the
 * shell or it reads its app from the URL — never both. The schema at
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

function hasApp( region ) {
	return region && typeof region.app === 'string' && region.app.length > 0;
}

export function validateRegion( region, path = '' ) {
	const violations = [];
	if ( ! region || typeof region !== 'object' ) {
		return violations;
	}
	const here = path || region.id || '<root>';

	if ( hasApp( region ) && hasRouteKey( region ) ) {
		violations.push( {
			path: here,
			rule: RULE_APP_XOR_ROUTE_KEY,
			message:
				`Region "${ here }" declares both \`app\` and \`routing.route-key\`. ` +
				'The two are mutually exclusive (spec §5.4); `app` will be dropped at runtime so URL routing wins.',
		} );
	}

	if ( region.regions && typeof region.regions === 'object' ) {
		for ( const [ key, child ] of Object.entries( region.regions ) ) {
			const childPath = regionPath( here, key );
			violations.push( ...validateRegion( child, childPath ) );
		}
	}

	return violations;
}

export function validateRegions( regionsMap ) {
	const violations = [];
	if ( ! regionsMap || typeof regionsMap !== 'object' ) {
		return violations;
	}
	for ( const [ id, region ] of Object.entries( regionsMap ) ) {
		violations.push( ...validateRegion( region, id ) );
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
