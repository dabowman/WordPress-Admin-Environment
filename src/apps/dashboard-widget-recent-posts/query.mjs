/**
 * Recent-drafts query, exported as a single source of truth so
 * sibling widgets (e.g. dashboard-widget-quick-draft) invalidate the
 * exact same shape after creating a draft. Drift between the two
 * shapes would silently break cross-widget refresh — a runtime-only
 * regression no test catches.
 *
 * Pure data; no React. Read by both widgets.
 */

export const RECENT_DRAFTS_QUERY = Object.freeze( {
	per_page: 5,
	status: 'draft',
	context: 'edit',
	orderby: 'modified',
	order: 'desc',
} );
