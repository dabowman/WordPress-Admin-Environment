#!/usr/bin/env node
/**
 * Tests for `src/apps/_shared/dataviews/pluginSegments.mjs`.
 *
 * Covers `buildPluginStatusSegments` and `activePluginSegment` — the pure logic
 * behind the plugins status-tab strip, exercised without a DOM or React.
 *
 * Test pattern matches `tests/runtime/view-tabs-segment-merge.test.mjs`:
 * plain-node runner, no framework, exits non-zero on any failure.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { buildPluginStatusSegments, activePluginSegment, PLUGIN_STATUS_VALUES } =
	await import(
		resolve( projectRoot, 'src/apps/_shared/dataviews/pluginSegments.mjs' )
	);

let pass = 0;
let fail = 0;

/**
 * @param {string}  label
 * @param {boolean} condition
 * @param {string}  [detail]
 */
function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

const LABELS = {
	all: 'All',
	active: 'Active',
	inactive: 'Inactive',
	'network-active': 'Network active',
};

// ---- buildPluginStatusSegments ---------------------------------------------

ok(
	'PLUGIN_STATUS_VALUES lists the three REST statuses',
	PLUGIN_STATUS_VALUES.join( ',' ) === 'active,inactive,network-active'
);

const singleSite = buildPluginStatusSegments( {
	counts: { active: 3, inactive: 5 },
	labels: LABELS,
} );

ok(
	'single-site: always emits All | Active | Inactive (3 segments)',
	singleSite.length === 3 &&
		singleSite.map( ( s ) => s.id ).join( ',' ) === 'all,active,inactive'
);

ok(
	'single-site: "All" segment carries a null filter (unfiltered base)',
	singleSite[ 0 ].filter === null
);

ok(
	'single-site: Active segment filter.value is the REST status',
	singleSite[ 1 ].filter.field === 'status' &&
		singleSite[ 1 ].filter.value === 'active'
);

ok(
	'single-site: no Network active tab when counts omit network-active',
	! singleSite.some( ( s ) => s.id === 'network-active' )
);

const multisite = buildPluginStatusSegments( {
	counts: { active: 3, inactive: 5, 'network-active': 2 },
	labels: LABELS,
} );

ok(
	'multisite: Network active tab appended when the tally carries it',
	multisite.length === 4 &&
		multisite[ 3 ].id === 'network-active' &&
		multisite[ 3 ].filter.value === 'network-active'
);

ok(
	'network-active count of 0 still surfaces the tab (key present)',
	buildPluginStatusSegments( {
		counts: { 'network-active': 0 },
		labels: LABELS,
	} ).some( ( s ) => s.id === 'network-active' )
);

ok(
	'missing counts defaults to single-site (no throw, 3 segments)',
	( () => {
		try {
			return (
				buildPluginStatusSegments( { labels: LABELS } ).length === 3
			);
		} catch {
			return false;
		}
	} )()
);

ok(
	'segments carry the supplied labels',
	singleSite[ 1 ].label === 'Active' && singleSite[ 0 ].label === 'All'
);

// ---- activePluginSegment ---------------------------------------------------

ok(
	'no status filter → "all"',
	activePluginSegment( { filters: [] }, singleSite ) === 'all'
);

ok(
	'undefined view → "all" (no throw)',
	activePluginSegment( undefined, singleSite ) === 'all'
);

ok(
	'single status filter maps to its segment id',
	activePluginSegment(
		{ filters: [ { field: 'status', operator: 'is', value: 'inactive' } ] },
		singleSite
	) === 'inactive'
);

ok(
	'single-element array value maps to its segment id',
	activePluginSegment(
		{
			filters: [
				{ field: 'status', operator: 'isAny', value: [ 'active' ] },
			],
		},
		singleSite
	) === 'active'
);

ok(
	'multi-value status filter falls back to "all"',
	activePluginSegment(
		{
			filters: [
				{
					field: 'status',
					operator: 'isAny',
					value: [ 'active', 'inactive' ],
				},
			],
		},
		singleSite
	) === 'all'
);

ok(
	'status value with no matching segment falls back to "all"',
	activePluginSegment(
		{ filters: [ { field: 'status', operator: 'is', value: 'mu' } ] },
		singleSite
	) === 'all'
);

ok(
	'network-active filter resolves on multisite segments',
	activePluginSegment(
		{ filters: [ { field: 'status', value: 'network-active' } ] },
		multisite
	) === 'network-active'
);

// ---- summary ---------------------------------------------------------------
console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail > 0 ? 1 : 0 );
