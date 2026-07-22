#!/usr/bin/env node
/**
 * Tests for `deepMergeUnder` (`src/runtime/styles/deepMergeUnder.mjs`).
 *
 * The kernel folds an engine's `default-styles` UNDER the workspace.json
 * `styles` block when mounted with raw fixture config (tests / Storybook that
 * bypass the PHP resolver). `over` (workspace styles) wins on every overlapping
 * key; `under` (engine defaults) fills the gaps. Arrays replace wholesale to
 * mirror the PHP indexed-array merge.
 *
 * This module had no direct coverage — it's small but load-bearing for the
 * defensive engine-default merge in `kernel.js`.
 *
 * Run: `node tests/runtime/deep-merge-under.test.mjs`
 * (chained from `npm run test:runtime`)
 */
import { deepMergeUnder } from '../../src/runtime/styles/deepMergeUnder.mjs';

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

const eq = ( a, b ) => JSON.stringify( a ) === JSON.stringify( b );

// ── nullish short-circuits ──────────────────────────────────────────────────
console.log( '\n— nullish handling —\n' );
ok( 'under null → over returned', deepMergeUnder( { a: 1 }, null ) &&
	deepMergeUnder( { a: 1 }, null ).a === 1 );
ok( 'under undefined → over returned', deepMergeUnder( { a: 1 }, undefined ).a === 1 );
ok( 'over null → under returned', deepMergeUnder( null, { b: 2 } ).b === 2 );
ok( 'over undefined → under returned', deepMergeUnder( undefined, { b: 2 } ).b === 2 );

// ── scalar / mismatched types: over wins ────────────────────────────────────
console.log( '\n— scalar + type-mismatch: over wins —\n' );
ok( 'scalar over wins', deepMergeUnder( 5, 9 ) === 5 );
ok( 'over string beats under object', deepMergeUnder( 'x', { a: 1 } ) === 'x' );
ok(
	'over array beats under object (wholesale)',
	eq( deepMergeUnder( [ 1, 2 ], { a: 1 } ), [ 1, 2 ] )
);

// ── deep object merge: over wins per-key, under fills gaps ───────────────────
console.log( '\n— deep merge —\n' );
{
	const over = { theme: { color: { primary: '#111' } }, only: 'over' };
	const under = {
		theme: { color: { primary: '#000', bg: '#fff' }, density: 'default' },
		filler: 'under',
	};
	const merged = deepMergeUnder( over, under );
	ok( 'over.primary wins', merged.theme.color.primary === '#111' );
	ok( 'under.bg fills the gap', merged.theme.color.bg === '#fff' );
	ok( 'under.density fills the gap', merged.theme.density === 'default' );
	ok( 'over-only key preserved', merged.only === 'over' );
	ok( 'under-only key preserved', merged.filler === 'under' );
}

// ── arrays replace wholesale (no positional merge) ──────────────────────────
console.log( '\n— arrays replace, never positional-merge —\n' );
{
	const merged = deepMergeUnder( { list: [ 'a' ] }, { list: [ 'x', 'y' ] } );
	ok( 'over array replaces under array', eq( merged.list, [ 'a' ] ) );
}

// ── does not mutate inputs ──────────────────────────────────────────────────
console.log( '\n— purity —\n' );
{
	const over = { a: { b: 1 } };
	const under = { a: { c: 2 } };
	const merged = deepMergeUnder( over, under );
	merged.a.b = 999;
	ok( 'mutating result does not touch `over`', over.a.b === 1 );
	ok( 'under untouched', under.a.c === 2 && under.a.b === undefined );
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
