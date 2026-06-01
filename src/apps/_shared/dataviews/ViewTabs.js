import { useMemo } from '@wordpress/element';
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
 * **Active-state rule (CLAUDE.md):** `[aria-current="true"]` is the sole
 * authority. No redundant `.is-active` class is emitted — CSS targets the
 * attribute, avoiding drift if a second truth source is introduced.
 *
 * **WPDS:** uses `@wordpress/ui` `Button` with `variant="minimal"` for each
 * tab so it inherits WPDS token colours and respects the engine's
 * `ThemeProvider`. The active segment gets `tone="brand"` to communicate
 * selection through WPDS semantics in addition to `aria-current`.
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
			className="wp-admin-shell-view-tabs"
			role="tablist"
			aria-label={
				/* translators: accessible label for view filter tabs */ undefined
			}
		>
			{ enriched.map( ( segment ) => {
				const active = isSegmentActive( segment, currentValue );
				const label =
					segment.count !== undefined
						? `${ segment.label } (${ segment.count })`
						: segment.label;

				return (
					<Button
						key={ segment.id }
						role="tab"
						variant="minimal"
						tone={ active ? 'brand' : 'neutral' }
						aria-current={ active ? 'true' : undefined }
						aria-selected={ active }
						onClick={ () => onSelect?.( segment ) }
						className="wp-admin-shell-view-tabs__tab"
					>
						{ label }
					</Button>
				);
			} ) }
		</div>
	);
}
