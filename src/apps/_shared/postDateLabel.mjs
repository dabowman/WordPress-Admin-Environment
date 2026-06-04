/**
 * Status-aware date-column labelling for the Posts list, mirroring wp-admin's
 * `WP_Posts_List_Table::column_date()`. Pure + side-effect-free (no `Date.now()`
 * — the caller passes `now`) so node test scripts can import it directly; the
 * React layer pairs the returned `{ key, missedSchedule }` with a localized date
 * string.
 *
 * wp-admin's logic:
 *   - future  → "Scheduled" (or "Missed schedule" when the scheduled time is
 *               already in the past).
 *   - publish → "Published".
 *   - draft / pending / private / everything else → "Last Modified".
 */

/**
 * Resolve the status-aware label key + missed-schedule flag for a post row.
 *
 * @param {Object} post           Post fields.
 * @param {string} post.status    Post status (`publish` / `future` / `draft` / …).
 * @param {string} [post.date]    Publish / scheduled date (ISO, site time).
 * @param {string} [post.modified] Last-modified date (ISO, site time).
 * @param {number} [now]          Epoch ms to compare scheduled dates against;
 *                                 defaults to the caller's clock at call time.
 * @return {{ key: string, dateField: string, missedSchedule: boolean }}
 *   `key` is one of `published` / `scheduled` / `missed` / `modified`;
 *   `dateField` names which date the caller should format (`date` | `modified`).
 */
export function postDateLabel( post, now = Date.now() ) {
	const status = post?.status;

	if ( status === 'future' ) {
		const scheduled = post?.date ? Date.parse( post.date ) : NaN;
		const missed = Number.isFinite( scheduled ) && scheduled < now;
		return {
			key: missed ? 'missed' : 'scheduled',
			dateField: 'date',
			missedSchedule: missed,
		};
	}

	if ( status === 'publish' ) {
		return { key: 'published', dateField: 'date', missedSchedule: false };
	}

	// draft / pending / private / auto-draft / anything else → last-modified,
	// matching wp-admin's `else` branch (only `publish` shows "Published").
	return { key: 'modified', dateField: 'modified', missedSchedule: false };
}
