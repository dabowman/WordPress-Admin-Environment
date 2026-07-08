#!/usr/bin/env node
/**
 * Tests for the read-side list-app helpers added in issue #137:
 *   - `_shared/postDateLabel.mjs` — the Posts status-aware date column label.
 *
 * (The sibling versionCompare / isSafeHref helpers served the parked
 * Plugins/Themes/Comments apps and moved to `archive/native-apps` with
 * them.)
 *
 * Pure + side-effect-free (postDateLabel takes `now` as an arg rather
 * than reading the clock) so it imports directly into a node test script.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { postDateLabel } = await import(
	resolve( projectRoot, 'src/apps/_shared/postDateLabel.mjs' )
);
let pass = 0;
let fail = 0;
function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

// --- postDateLabel --------------------------------------------------------
const NOW = Date.parse( '2026-06-04T12:00:00Z' );

ok(
	'publish → published / date',
	( () => {
		const r = postDateLabel( { status: 'publish', date: 'x' }, NOW );
		return r.key === 'published' && r.dateField === 'date' && ! r.missedSchedule;
	} )()
);
ok(
	'draft → modified / modified field',
	( () => {
		const r = postDateLabel( { status: 'draft' }, NOW );
		return r.key === 'modified' && r.dateField === 'modified';
	} )()
);
ok(
	'private → last-modified (not published)',
	postDateLabel( { status: 'private' }, NOW ).key === 'modified'
);
ok(
	'future + date in the past → missed schedule',
	( () => {
		const r = postDateLabel(
			{ status: 'future', date: '2026-06-01T00:00:00Z' },
			NOW
		);
		return r.key === 'missed' && r.missedSchedule === true && r.dateField === 'date';
	} )()
);
ok(
	'future + date in the future → scheduled (not missed)',
	( () => {
		const r = postDateLabel(
			{ status: 'future', date: '2026-07-01T00:00:00Z' },
			NOW
		);
		return r.key === 'scheduled' && r.missedSchedule === false;
	} )()
);
ok(
	'future + date_gmt in the past → missed (REST-accurate no-Z format)',
	( () => {
		// WordPress REST emits date_gmt WITHOUT a Z suffix (mysql_to_rfc3339 →
		// Y-m-dTH:i:s). The helper must treat it as UTC, not browser-local.
		const r = postDateLabel(
			{
				status: 'future',
				date_gmt: '2026-06-01T00:00:00',
				date: '2026-06-01T00:00:00',
			},
			NOW
		);
		return r.key === 'missed' && r.missedSchedule === true;
	} )()
);
ok(
	'future + date_gmt wins over date when both present (REST-accurate no-Z)',
	( () => {
		// date_gmt says "not yet missed" even if date (parsed browser-local)
		// might differ — date_gmt should win.
		const r = postDateLabel(
			{
				status: 'future',
				date_gmt: '2026-07-01T00:00:00',
				date: '2026-06-01T00:00:00',
			},
			NOW
		);
		return r.key === 'scheduled' && r.missedSchedule === false;
	} )()
);
ok(
	'tz-boundary: date_gmt past-in-UTC must be missed even in +14:00 zone',
	( () => {
		// Regression guard: 2026-06-03T23:00:00 UTC is in the PAST relative to NOW
		// (2026-06-04T12:00:00Z). A viewer in UTC+14 whose engine parsed the no-Z
		// string as LOCAL would see 2026-06-03T23:00:00+14:00 → UTC 2026-06-03T09:00:00,
		// still past, BUT a viewer in UTC-12 would parse it as
		// 2026-06-03T23:00:00-12:00 → UTC 2026-06-04T11:00:00 — one hour in the
		// FUTURE — and wrongly mark it "scheduled". The Z-append fix must catch this.
		const r = postDateLabel(
			{
				status: 'future',
				// REST-format (no Z): a UTC instant that is 1 h before NOW.
				date_gmt: '2026-06-04T11:00:00',
			},
			NOW // 2026-06-04T12:00:00Z
		);
		return r.key === 'missed' && r.missedSchedule === true;
	} )()
);
ok(
	'future with unparseable date → scheduled (no false missed)',
	postDateLabel( { status: 'future', date: '' }, NOW ).missedSchedule === false
);
ok(
	'null/undefined post → modified fallback (no throw)',
	postDateLabel( null, NOW ).key === 'modified' &&
		postDateLabel( undefined, NOW ).key === 'modified'
);

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail > 0 ? 1 : 0 );
