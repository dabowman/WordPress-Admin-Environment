#!/usr/bin/env node
/**
 * Tests for `src/apps/_shared/dataviews/segmentMerge.mjs`.
 *
 * Covers `mergeSegmentCounts` and `isSegmentActive` — the pure logic
 * extracted from `ViewTabs.js` so it can be exercised without a DOM or React.
 *
 * Test pattern matches `tests/runtime/dataviews-shared.test.mjs`: plain-node
 * runner, no framework, exits non-zero on any failure.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { mergeSegmentCounts, isSegmentActive } = await import(
	resolve( projectRoot, 'src/apps/_shared/dataviews/segmentMerge.mjs' )
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

// ---- mergeSegmentCounts ----------------------------------------------------

const BASE_SEGMENTS = [
	{ id: 'all', label: 'All', filter: { field: 'status', value: 'any' } },
	{
		id: 'publish',
		label: 'Published',
		filter: { field: 'status', value: 'publish' },
	},
	{
		id: 'draft',
		label: 'Draft',
		filter: { field: 'status', value: 'draft' },
	},
];

ok(
	'mergeSegmentCounts: null counts returns segments unchanged',
	mergeSegmentCounts( BASE_SEGMENTS, null ) === BASE_SEGMENTS
);

ok(
	'mergeSegmentCounts: undefined counts returns segments unchanged',
	mergeSegmentCounts( BASE_SEGMENTS, undefined ) === BASE_SEGMENTS
);

ok(
	'mergeSegmentCounts: non-object counts returns segments unchanged',
	mergeSegmentCounts( BASE_SEGMENTS, 'bad' ) === BASE_SEGMENTS
);

ok(
	'mergeSegmentCounts: empty array returns empty array',
	mergeSegmentCounts( [], { publish: 5 } ).length === 0
);

ok(
	'mergeSegmentCounts: null input returns empty array',
	mergeSegmentCounts( null, { publish: 5 } ).length === 0
);

ok(
	'mergeSegmentCounts: undefined input returns empty array',
	mergeSegmentCounts( undefined, { publish: 5 } ).length === 0
);

const withCounts = mergeSegmentCounts( BASE_SEGMENTS, {
	publish: 12,
	draft: 3,
} );

ok(
	'mergeSegmentCounts: matched segment gets count property',
	withCounts[ 1 ].count === 12
);

ok(
	'mergeSegmentCounts: second matched segment gets correct count',
	withCounts[ 2 ].count === 3
);

ok(
	'mergeSegmentCounts: unmatched segment has no count property',
	withCounts[ 0 ].count === undefined
);

ok(
	'mergeSegmentCounts: zero is a real count (not omitted)',
	mergeSegmentCounts(
		[
			{
				id: 'spam',
				label: 'Spam',
				filter: { field: 'status', value: 'spam' },
			},
		],
		{ spam: 0 }
	)[ 0 ].count === 0
);

ok(
	'mergeSegmentCounts: null count value leaves segment unchanged',
	mergeSegmentCounts(
		[ { id: 'x', label: 'X', filter: { field: 'status', value: 'x' } } ],
		{ x: null }
	)[ 0 ].count === undefined
);

// Original segment objects must not be mutated (pure function contract).
const original = {
	id: 'publish',
	label: 'Published',
	filter: { field: 'status', value: 'publish' },
};
mergeSegmentCounts( [ original ], { publish: 5 } );
ok(
	'mergeSegmentCounts: does not mutate the original segment object',
	original.count === undefined
);

// Segments that have no `filter` property should not throw.
ok(
	'mergeSegmentCounts: segment with no filter property does not throw',
	( () => {
		try {
			const result = mergeSegmentCounts(
				[ { id: 'mine', label: 'Mine' } ],
				{ mine: 7 }
			);
			return result[ 0 ].count === undefined;
		} catch {
			return false;
		}
	} )()
);

// Segments that have a filter but no `value` also should not throw.
ok(
	'mergeSegmentCounts: filter with no value does not throw',
	( () => {
		try {
			const result = mergeSegmentCounts(
				[ { id: 'x', label: 'X', filter: { field: 'status' } } ],
				{ undefined: 1 }
			);
			return result[ 0 ].count === undefined;
		} catch {
			return false;
		}
	} )()
);

// ---- isSegmentActive -------------------------------------------------------

ok(
	'isSegmentActive: matching id returns true',
	isSegmentActive( { id: 'all' }, 'all' ) === true
);

ok(
	'isSegmentActive: mismatched id returns false',
	isSegmentActive( { id: 'publish' }, 'all' ) === false
);

ok(
	'isSegmentActive: null currentValue returns false',
	isSegmentActive( { id: 'all' }, null ) === false
);

ok(
	'isSegmentActive: undefined currentValue returns false',
	isSegmentActive( { id: 'all' }, undefined ) === false
);

ok(
	'isSegmentActive: null segment returns false (no throw)',
	isSegmentActive( null, 'all' ) === false
);

ok(
	'isSegmentActive: undefined segment returns false (no throw)',
	isSegmentActive( undefined, 'all' ) === false
);

ok(
	'isSegmentActive: id 0 (falsy) vs currentValue 0 returns true',
	isSegmentActive( { id: 0 }, 0 ) === true
);

ok(
	'isSegmentActive: id 0 vs currentValue null still false',
	isSegmentActive( { id: 0 }, null ) === false
);

// ---- integration: mergeSegmentCounts + isSegmentActive -------------------

const merged = mergeSegmentCounts( BASE_SEGMENTS, { publish: 42 } );

ok(
	'integration: enriched segment still correctly identified as active',
	isSegmentActive( merged[ 1 ], 'publish' ) === true
);

ok(
	'integration: enriched segment not confused with wrong currentValue',
	isSegmentActive( merged[ 1 ], 'draft' ) === false
);

// ---- summary ---------------------------------------------------------------
console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail > 0 ? 1 : 0 );
