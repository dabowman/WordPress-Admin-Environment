/**
 * Pure menu-tree shaping helpers.
 *
 * Engine-agnostic + design-system-neutral: these operate on the resolved
 * `menu` tree (the `{ id => entry }` shape the cascade produces) and
 * return plain data. No React, no WPDS, no `window` access — so they're
 * importable from node test scripts directly (`.mjs` per the runtime
 * convention) and shared across every menu renderer regardless of which
 * engine owns it.
 *
 * The bundled `core:navigation` host computes the ordered + pruned tree
 * once via `pruneMenu( orderTree( rawMenu ), passes )` and hands the
 * result to whichever renderer the active engine's `menu-renderer` field
 * names. Renderers (bundled, engine-owned, or plugin) consume the
 * already-shaped `items` plus these walk helpers; they never re-prune.
 *
 * `pruneMenu` takes an injected `passes( item ) => boolean` predicate
 * rather than importing the capability check itself — that keeps this
 * module free of the `window`-reading `userCan` dependency so it imports
 * cleanly in node. The host supplies the real predicate.
 */

/**
 * Convert a `{ id => entry }` menu tree into a sorted array of
 * `{ id, ...entry, items: orderTree(entry.items) }`. Sort siblings by
 * `position` ascending (lower first), then registration order for ties.
 *
 * @param {Object} tree Menu object keyed by id.
 * @return {Array} Sorted siblings.
 */
export function orderTree( tree ) {
	if ( ! tree || typeof tree !== 'object' ) {
		return [];
	}
	const entries = Object.entries( tree );
	const withIndex = entries.map( ( [ id, entry ], i ) => ( {
		id,
		entry,
		i,
	} ) );
	withIndex.sort( ( a, b ) => {
		const pa = Number.isInteger( a.entry?.position )
			? a.entry.position
			: Number.POSITIVE_INFINITY;
		const pb = Number.isInteger( b.entry?.position )
			? b.entry.position
			: Number.POSITIVE_INFINITY;
		if ( pa === pb ) {
			return a.i - b.i;
		}
		return pa < pb ? -1 : 1;
	} );
	return withIndex.map( ( { id, entry } ) => {
		const sub =
			entry && typeof entry === 'object' && entry.items
				? orderTree( entry.items )
				: undefined;
		return sub ? { id, ...entry, items: sub } : { id, ...entry };
	} );
}

/**
 * Recursive prune. Drops items that:
 *   - declare `hidden: true`,
 *   - fail the injected `passes` predicate (capability/role prune),
 *   - are containers (have `items`) whose pruned children are empty AND
 *     have no own `href` / screen affordance to fall back on.
 * Separators that orphan at the top/bottom of a list are trimmed.
 *
 * @param {Array}    items    Sorted siblings.
 * @param {Function} [passes] `( item ) => boolean`. Defaults to always
 *                            true so a missing predicate prunes nothing.
 * @return {Array} Pruned siblings.
 */
export function pruneMenu( items, passes = () => true ) {
	if ( ! Array.isArray( items ) ) {
		return [];
	}
	const out = [];
	for ( const item of items ) {
		if ( ! item || typeof item !== 'object' ) {
			continue;
		}
		if ( item.hidden === true ) {
			continue;
		}
		if ( item.separator === true ) {
			out.push( item );
			continue;
		}
		if ( ! passes( item ) ) {
			continue;
		}
		if ( Array.isArray( item.items ) && item.items.length > 0 ) {
			const children = pruneMenu( item.items, passes );
			if ( children.length === 0 && ! item.href ) {
				// Container with no surviving children and no own
				// affordance — drop.
				continue;
			}
			out.push( { ...item, items: children } );
			continue;
		}
		out.push( item );
	}
	while ( out.length && out[ 0 ].separator ) {
		out.shift();
	}
	while ( out.length && out[ out.length - 1 ].separator ) {
		out.pop();
	}
	return out;
}

/**
 * Extract the primary path from an in-shell hash href (`#/posts/foo` →
 * `/posts/foo`). External / non-hash hrefs return null so they never
 * match the active state.
 *
 * @param {string} href Hash href.
 * @return {string|null} Primary path or null.
 */
export function hashPrimary( href ) {
	if ( typeof href !== 'string' || ! href.startsWith( '#' ) ) {
		return null;
	}
	const stripped = href.slice( 1 );
	const queryIdx = stripped.indexOf( '?' );
	const path = queryIdx === -1 ? stripped : stripped.slice( 0, queryIdx );
	return path.startsWith( '/' ) ? path : '/' + path;
}

/**
 * Walk the tree and pull every renderable leaf (has `href`, is not a
 * separator/container) up to a flat list, preserving sort order. Used by
 * renderers (e.g. the collapsed icon rail) that surface leaves only.
 *
 * @param {Array} items Pruned siblings.
 * @return {Array} Flat list of leaf items.
 */
export function flattenLeaves( items ) {
	const out = [];
	if ( ! Array.isArray( items ) ) {
		return out;
	}
	for ( const item of items ) {
		if ( item.separator ) {
			continue;
		}
		if ( Array.isArray( item.items ) && item.items.length > 0 ) {
			out.push( ...flattenLeaves( item.items ) );
			continue;
		}
		if ( item.href ) {
			out.push( item );
		}
	}
	return out;
}

/**
 * Find a top-level container item by id (drilldown sub-screen lookup).
 *
 * @param {Array}  items    Pruned top-level siblings.
 * @param {string} screenId Container id.
 * @return {Object|null} The container item, or null.
 */
export function findScreen( items, screenId ) {
	if ( ! Array.isArray( items ) ) {
		return null;
	}
	for ( const item of items ) {
		if ( item.id === screenId && Array.isArray( item.items ) ) {
			return item;
		}
	}
	return null;
}

/**
 * Find the top-level container item whose subtree contains a child whose
 * href maps to the active primary URL path. Used to keep a drilldown open
 * after clicking through to a sub-item (the sub-item's `<a href>`
 * overwrites the hash, so the `?screen=<id>` slot is lost unless inferred
 * from the path). Top-level containers only.
 *
 * @param {Array}  items          Pruned top-level menu siblings.
 * @param {string} currentPrimary Active primary URL path.
 * @return {string|null} Container item id, or null when no match.
 */
export function findContainerForPrimary( items, currentPrimary ) {
	if ( ! currentPrimary || ! Array.isArray( items ) ) {
		return null;
	}
	for ( const item of items ) {
		if (
			! item ||
			! Array.isArray( item.items ) ||
			item.items.length === 0
		) {
			continue;
		}
		for ( const child of item.items ) {
			if ( ! child || typeof child.href !== 'string' ) {
				continue;
			}
			const target = hashPrimary( child.href );
			if ( target && target === currentPrimary ) {
				return item.id;
			}
		}
	}
	return null;
}
