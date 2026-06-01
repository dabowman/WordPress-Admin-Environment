/**
 * Pure client-side term-tree helpers for hierarchical taxonomies.
 *
 * The REST term list is flat — every term carries a `parent` id (0 = top
 * level). wp-admin's PHP recurses this into an indented tree; the shell rebuilds
 * the same depth ordering client-side so the Categories list can render
 * parent-indented rows (each nested row carries a visually-hidden `Level N`
 * announcement — not `role="treeitem"`/`aria-level`, which would be invalid
 * inside the DataViews table) and the add/edit form can offer an indented
 * `wp_dropdown_categories`-style parent picker. `flattenTreeOrder` exposes the
 * depth-first id sequence so the list rows can be reordered into true tree
 * order (parent immediately above its indented children).
 *
 * Pure (no imports) so `tests/runtime/*` can import it directly without a
 * webpack/jest harness.
 */

/**
 * Flatten a list of terms into depth-first order, annotating each with its
 * `depth` (0-based). Children sort under their parent, preserving the input
 * order among siblings (callers pre-sort by name).
 *
 * Orphan terms — those whose `parent` id isn't present in the input (e.g. the
 * parent lives on a later REST page beyond the 100-item cap) — are treated as
 * roots so they still appear, rather than vanishing from the tree. A `parent`
 * chain that loops back on itself is broken by a visited-set guard so a corrupt
 * dataset can't spin the walk forever.
 *
 * @param {Array} terms Flat term records (`{ id, name, parent }`).
 * @return {Array} `[ { id, name, parent, depth } ]` in depth-first order.
 */
export function buildTermTree( terms ) {
	const list = Array.isArray( terms ) ? terms : [];
	const byId = new Map();
	list.forEach( ( t ) => {
		if ( t && t.id !== undefined && t.id !== null ) {
			byId.set( t.id, t );
		}
	} );

	// Group children by parent id; terms with an unknown/zero parent are roots.
	const childrenOf = new Map();
	const roots = [];
	list.forEach( ( t ) => {
		if ( ! t || t.id === undefined || t.id === null ) {
			return;
		}
		const parent = t.parent || 0;
		if ( parent && byId.has( parent ) ) {
			if ( ! childrenOf.has( parent ) ) {
				childrenOf.set( parent, [] );
			}
			childrenOf.get( parent ).push( t );
		} else {
			roots.push( t );
		}
	} );

	const out = [];
	const visited = new Set();
	const walk = ( node, depth ) => {
		if ( visited.has( node.id ) ) {
			return;
		}
		visited.add( node.id );
		out.push( {
			id: node.id,
			name: node.name,
			parent: node.parent || 0,
			depth,
		} );
		( childrenOf.get( node.id ) || [] ).forEach( ( child ) =>
			walk( child, depth + 1 )
		);
	};
	roots.forEach( ( root ) => walk( root, 0 ) );

	// Any term not reached from a root is part of a pure cycle (e.g. a term
	// whose parent is itself, or a mutual A↔B pair). Seed each remaining node
	// as a root so corrupt data still surfaces every term exactly once rather
	// than silently dropping the whole cycle.
	list.forEach( ( t ) => {
		if ( t && t.id !== undefined && t.id !== null && ! visited.has( t.id ) ) {
			walk( t, 0 );
		}
	} );
	return out;
}

/**
 * Map a depth-first tree (from `buildTermTree`) to an ordered list of term ids.
 * Callers sort the current page's rows by each row's index in this list to put
 * the visible rows into true wp-admin-style tree order (parent immediately above
 * its indented children) rather than the flat alphabetical order REST returns.
 *
 * @param {Array} tree Output of `buildTermTree` (`[ { id, depth, … } ]`).
 * @return {Array} Term ids in depth-first order.
 */
export function flattenTreeOrder( tree ) {
	return Array.isArray( tree ) ? tree.map( ( node ) => node.id ) : [];
}

/**
 * Prefix a label with depth indentation for a dropdown option, mirroring
 * wp-admin's `wp_dropdown_categories` (`str_repeat( '&nbsp;&nbsp;&nbsp;', $depth )`).
 * Uses an em-dash + space per level so the nesting reads in plain-text option
 * lists (where leading whitespace collapses).
 *
 * @param {string} label Term name.
 * @param {number} depth 0-based depth.
 * @return {string} Indented label.
 */
export function indentLabel( label, depth ) {
	const level = Number.isInteger( depth ) && depth > 0 ? depth : 0;
	return level > 0 ? `${ '— '.repeat( level ) }${ label }` : label;
}
