/**
 * Status-aware date-column labelling for the Posts list, mirroring wp-admin's
 * `WP_Posts_List_Table::column_date()`. Pure + side-effect-free — `now`
 * defaults to `Date.now()` but callers (and tests) can supply a fixed epoch ms
 * instead; the React layer pairs the returned `{ key, missedSchedule }` with a
 * localized date string.
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
 * @param {Object} post              Post fields.
 * @param {string} post.status       Post status (`publish` / `future` / `draft` / …).
 * @param {string} [post.date]       Publish / scheduled date (ISO, site-local time).
 * @param {string} [post.date_gmt]   Publish / scheduled date in UTC (ISO with `Z`
 *                                   suffix). Preferred over `date` for the missed-
 *                                   schedule comparison — `date` lacks a timezone
 *                                   suffix and is parsed as browser-local, so the
 *                                   cut-over time is timezone-fragile without the GMT
 *                                   field.
 * @param {string} [post.modified]   Last-modified date (ISO, site-local time).
 * @param {number} [now]             Epoch ms to compare scheduled dates against;
 *                                   defaults to the caller's clock at call time.
 * @return {{ key: string, dateField: string, missedSchedule: boolean }}
 *   `key` is one of `published` / `scheduled` / `missed` / `modified`;
 *   `dateField` names which date the caller should format (`date` | `modified`).
 */
export function postDateLabel( post, now = Date.now() ) {
	const status = post?.status;

	if ( status === 'future' ) {
		// Prefer `date_gmt` (always UTC, has a `Z` suffix) for the missed-schedule
		// check. `date` is site-local and lacks a timezone suffix, so
		// `Date.parse(date)` is interpreted as browser-local time — the cutover
		// point shifts with the visitor's timezone. Fall back to `date` when
		// `date_gmt` is absent so the function still works with partial records.
		const rawDate = post?.date_gmt || post?.date;
		const scheduled = rawDate ? Date.parse( rawDate ) : NaN;
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
