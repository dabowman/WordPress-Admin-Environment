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
 * @param {string} [post.date_gmt]   Publish / scheduled date in UTC (ISO, no timezone
 *                                   suffix — WordPress REST emits `mysql_to_rfc3339`
 *                                   format `Y-m-d\TH:i:s`, no trailing `Z`). Preferred
 *                                   over `date` for the missed-schedule comparison —
 *                                   `date` lacks a timezone suffix and is parsed as
 *                                   browser-local, so the cut-over time is timezone-
 *                                   fragile without explicit UTC treatment.
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
		// Prefer `date_gmt` for the missed-schedule check — it is always a UTC
		// instant. WordPress REST emits it WITHOUT a timezone suffix (mysql_to_rfc3339
		// → `Y-m-dTH:i:s`), so a bare `Date.parse(date_gmt)` would be interpreted
		// as browser-local time, shifting the cutover with the viewer's timezone.
		// Guard: only append `Z` when the string carries no timezone designator
		// (no trailing `Z` and no `+hh:mm`/`-hh:mm` offset) so we never double-mark
		// a string that already encodes UTC (defensive). Fall back to `date` when
		// `date_gmt` is absent so the function still works with partial records.
		const rawGmt = post?.date_gmt;
		const rawDate = post?.date;
		let scheduled = NaN;
		if ( rawGmt ) {
			// Treat the GMT value as a true UTC instant.
			const utcString =
				/Z$|[+-]\d{2}:\d{2}$/.test( rawGmt ) ? rawGmt : rawGmt + 'Z';
			scheduled = Date.parse( utcString );
		} else if ( rawDate ) {
			scheduled = Date.parse( rawDate );
		}
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
