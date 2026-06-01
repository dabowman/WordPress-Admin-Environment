/**
 * Recent-drafts query, exported as a single source of truth so
 * sibling widgets (e.g. dashboard-widget-quick-draft) invalidate the
 * exact same shape after creating a draft. Drift between the two
 * shapes would silently break cross-widget refresh — a runtime-only
 * regression no test catches.
 *
 * The query is **author-scoped** (issue #217 / #133): without an
 * `author` filter the drafts query returns every author's drafts,
 * leaking other users' unpublished content. `recentDraftsQuery(userId)`
 * folds `author: userId` into the shape. Both the Recent Drafts widget
 * (which reads it) and the Quick Draft widget (which invalidates it
 * after creating a draft) call the factory with the same acting-user
 * id so the cached query key matches exactly.
 *
 * Callers MUST fail closed: only issue / invalidate the query when
 * `userId` is truthy (`enabled: !!userId` on the read side). When the
 * acting-user id is unknown, the query is never sent and the widget
 * renders its empty state.
 *
 * Pure data; no React. Read by both widgets.
 */

/**
 * Build the author-scoped recent-drafts query for a given user.
 *
 * @param {number|undefined} userId Acting user id. Folded into the
 *                                  query as `author`. Callers gate the
 *                                  request on `!!userId` (fail-closed).
 * @return {Object} Frozen query shape for `getEntityRecords( 'postType', 'post', … )`.
 */
export function recentDraftsQuery( userId ) {
	return Object.freeze( {
		per_page: 5,
		status: 'draft',
		context: 'edit',
		orderby: 'modified',
		order: 'desc',
		author: userId,
	} );
}
