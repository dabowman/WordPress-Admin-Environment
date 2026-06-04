import { useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { Button } from '@wordpress/ui';
import { mergeSegmentCounts, isSegmentActive } from './segmentMerge.mjs';
import './ViewTabs.css';

/**
 * `ViewTabs` — the classic `All | Mine | Pending | …` pinned segment strip
 * with live counts. Shell-side substitute for upstream #163.
 *
 * This is a **presentational component** only. It owns no data-fetching; the
 * caller drives counts via `useEntityElementCounts` (or any other source) and
 * controls the active segment through `currentValue` + `onSelect`.
 *
 * ```jsx
 * const counts = useEntityElementCounts(
 *     'postType', postType, 'status', STATUS_VALUES
 * );
 *
 * <ViewTabs
 *     segments={ [
 *         { id: 'all',     label: __( 'All' ),     filter: { field: 'status', value: 'any' } },
 *         { id: 'publish', label: __( 'Published' ), filter: { field: 'status', value: 'publish' } },
 *         { id: 'draft',   label: __( 'Draft' ),   filter: { field: 'status', value: 'draft' } },
 *     ] }
 *     currentValue={ activeSegmentId }
 *     onSelect={ ( segment ) => setActiveSegment( segment.id ) }
 *     counts={ counts }
 * />
 * ```
 *
 * **Model:** this is a **filter button group**, not a tabs widget. wp-admin's
 * classic `subsubsub` row is a list of filters, not a tab strip — so each
 * segment is a filter toggle `Button` carrying `aria-pressed`, with no
 * `role="tablist"`/`role="tab"`/`role="tabpanel"` and no roving tabindex.
 *
 * **Active-state rule:** `aria-pressed` is the single active-state authority
 * for this filter button group. No redundant `aria-current`, `aria-selected`,
 * or `.is-active` class is emitted — CSS targets `[aria-pressed="true"]`,
 * avoiding drift between truth sources.
 *
 * **WPDS:** uses `@wordpress/ui` `Button` with `variant="minimal"` for each
 * segment so it inherits WPDS token colours and respects the engine's
 * `ThemeProvider`. The active segment gets `tone="brand"` for presentational
 * emphasis — purely visual, alongside the authoritative `aria-pressed`.
 *
 * Counts resolve asynchronously. A segment renders `label` alone until its
 * count arrives — no "0" flash on load (mirrors `withElementCounts` semantics
 * from `buildFields.mjs`).
 *
 * @param {Object}   root0
 * @param {Array}    root0.segments     `[{ id, label, filter: { field, value } }]`
 *                                      where `filter.value` is the REST arg value
 *                                      that `useEntityElementCounts` keyed its
 *                                      results on.
 * @param {*}        root0.currentValue The id of the currently active segment.
 * @param {Function} root0.onSelect     Called with the segment object on click.
 * @param {Object}   [root0.counts]     `{ [filterValue]: number }` — e.g. the
 *                                      result of `useEntityElementCounts`.
 */
export default function ViewTabs( {
	segments,
	currentValue,
	onSelect,
	counts,
} ) {
	const enriched = useMemo(
		() => mergeSegmentCounts( segments, counts ),
		[ segments, counts ]
	);

	if ( ! Array.isArray( enriched ) || enriched.length === 0 ) {
		return null;
	}

	return (
		<div
			className="wp-admin-workspaces-view-tabs"
			role="group"
			aria-label={ __( 'Filter view', 'wp-admin-workspaces' ) }
		>
			{ enriched.map( ( segment ) => {
				const active = isSegmentActive( segment, currentValue );
				const label =
					segment.count !== undefined
						? sprintf(
								/* translators: 1: segment label, 2: item count. */
								__( '%1$s (%2$s)', 'wp-admin-workspaces' ),
								segment.label,
								segment.count.toLocaleString()
						  )
						: segment.label;

				return (
					<Button
						key={ segment.id }
						variant="minimal"
						tone={ active ? 'brand' : 'neutral' }
						aria-pressed={ active }
						onClick={ () => onSelect?.( segment ) }
						className="wp-admin-workspaces-view-tabs__tab"
					>
						{ label }
					</Button>
				);
			} ) }
		</div>
	);
}
