/**
 * Pure ordering helpers for the classic-menu item editor (issue #120,
 * Option B — no drag-and-drop).
 *
 * The WordPress nav-menu item model is a flat list of records, each carrying
 * `parent` (another item's id, or 0 for a top-level item) and `menu_order`
 * (1-based sibling order). wp-admin renders these as a nested, drag-sortable
 * tree. Option B renders the same tree but reorders via explicit
 * Up / Down / Indent / Outdent controls (plus a numeric order field), so this
 * module owns the pure transforms those controls need:
 *
 *   - `buildItemTree`     — flat records → depth-first display rows + depth.
 *   - `siblingsOf`        — the ordered sibling list for a given parent.
 *   - `reorderSiblings`   — recompute contiguous 1-based `menu_order` after a
 *                           move so the persisted order has no gaps.
 *
 * No imports → node-importable + unit-testable without a webpack/jest harness
 * (`tests/runtime/menus-item-tree.test.mjs`). Mirrors the taxonomy app's
 * `termTree.mjs` convention.
 */

/**
 * Normalize a raw menu-item record's parent into a plain integer.
 *
 * The REST shape uses `parent` (0 = top level). Older payloads sometimes carry
 * `menu_item_parent` as a string; accept either so the tree is robust.
 *
 * @param {Object} item Raw menu-item record.
 * @return {number} Parent id (0 for top-level).
 */
export function parentOf( item ) {
	const raw = item?.parent ?? item?.menu_item_parent ?? 0;
	const n = Number( raw );
	return Number.isFinite( n ) ? n : 0;
}

/**
 * Numeric `menu_order` for an item, defaulting to 0 when absent.
 *
 * @param {Object} item Raw menu-item record.
 * @return {number} Order.
 */
export function orderOf( item ) {
	const n = Number( item?.menu_order ?? 0 );
	return Number.isFinite( n ) ? n : 0;
}

/**
 * Flatten a menu's item records into depth-first display order, annotating
 * each row with its `depth` (0-based). Each level is sorted by `menu_order`
 * (ties broken by id for stability). Orphan items — whose `parent` isn't
 * present in the set — are treated as top-level so a corrupt menu never drops
 * rows. A visited-set guard breaks self-/cyclic-parent loops.
 *
 * @param {Array} items Raw menu-item records.
 * @return {Array<{ item: Object, depth: number }>} Depth-first rows.
 */
export function buildItemTree( items ) {
	if ( ! Array.isArray( items ) || items.length === 0 ) {
		return [];
	}

	const byId = new Map( items.map( ( it ) => [ it.id, it ] ) );

	// Group children by effective parent (orphans → top level 0).
	const childrenOf = new Map();
	for ( const it of items ) {
		let parent = parentOf( it );
		if ( parent !== 0 && ! byId.has( parent ) ) {
			parent = 0; // Orphan — reparent to top so it stays visible.
		}
		if ( ! childrenOf.has( parent ) ) {
			childrenOf.set( parent, [] );
		}
		childrenOf.get( parent ).push( it );
	}

	for ( const list of childrenOf.values() ) {
		list.sort(
			( a, b ) => orderOf( a ) - orderOf( b ) || a.id - b.id
		);
	}

	const rows = [];
	const visited = new Set();
	const walk = ( parentId, depth ) => {
		const children = childrenOf.get( parentId ) || [];
		for ( const child of children ) {
			if ( visited.has( child.id ) ) {
				continue; // Cycle guard.
			}
			visited.add( child.id );
			rows.push( { item: child, depth } );
			walk( child.id, depth + 1 );
		}
	};
	walk( 0, 0 );

	// Any item never reached (deep cycle) appends at the end, flat, so it is
	// never silently dropped.
	for ( const it of items ) {
		if ( ! visited.has( it.id ) ) {
			rows.push( { item: it, depth: 0 } );
		}
	}

	return rows;
}

/**
 * The ordered sibling list under a parent (sorted by `menu_order`, then id).
 *
 * Effective-parent normalization mirrors `buildItemTree`: an item whose `parent`
 * isn't present in the set is an orphan and is treated as top-level (parent 0),
 * so the reorder math operates on the same sibling group the tree *displays* the
 * orphan in (instead of `siblingsOf(items, <missing-id>)` = just itself, which
 * would no-op the orphan's Up/Down/Indent even though it sits among the real
 * top-level rows). Corrupt-menu edge only; harmless on well-formed menus.
 *
 * @param {Array}  items  Raw menu-item records.
 * @param {number} parent Parent id (0 = top level).
 * @return {Array} Sibling records, ordered.
 */
export function siblingsOf( items, parent ) {
	const list = items || [];
	const byId = new Set( list.map( ( it ) => it.id ) );
	const effectiveParent = ( it ) => {
		const p = parentOf( it );
		return p !== 0 && ! byId.has( p ) ? 0 : p;
	};
	return list
		.filter( ( it ) => effectiveParent( it ) === parent )
		.sort( ( a, b ) => orderOf( a ) - orderOf( b ) || a.id - b.id );
}

/**
 * Recompute contiguous 1-based `menu_order` for an array of sibling records
 * already in their desired sequence. Returns the `[ id, menu_order ]` pairs
 * whose order actually changed (so the caller only PATCHes what moved).
 *
 * @param {Array} orderedSiblings Sibling records in desired order.
 * @return {Array<{ id: number, menu_order: number }>} Changed orders.
 */
export function reorderSiblings( orderedSiblings ) {
	const changes = [];
	( orderedSiblings || [] ).forEach( ( it, index ) => {
		const next = index + 1;
		if ( orderOf( it ) !== next ) {
			changes.push( { id: it.id, menu_order: next } );
		}
	} );
	return changes;
}
