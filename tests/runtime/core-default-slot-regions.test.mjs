#!/usr/bin/env node
/**
 * core:default `slotRegions` tests (issue #69 items 2 + 4).
 *
 * Pins role-based slot dispatch (id as tiebreaker, honoring
 * `specializes-roles`) and the dashboard-grid / dynamic-children body mount.
 * Covers `src/runtime/engines/core-default/slotRegions.mjs`.
 *
 * Run: `node tests/runtime/core-default-slot-regions.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { slotRegions } = await import(
	resolve( projectRoot, 'src/runtime/engines/core-default/slotRegions.mjs' )
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

const id = ( region ) => ( region ? region.id : undefined );
const ids = ( arr ) => arr.map( ( r ) => r.id );

/* ── 1. Conventional default-region tree slots by role + id ───────────── */

const defaultTree = {
	toolbar: { id: 'toolbar', role: 'banner' },
	sidebar: { id: 'sidebar', role: 'navigation' },
	content: { id: 'content', role: 'main' },
	detail: {
		id: 'detail',
		role: 'complementary',
		platform: { 'core:dismiss-on': [ 'Escape' ] },
	},
	'command-palette': {
		id: 'command-palette',
		role: 'dialog',
		platform: { 'core:modal': true },
	},
	'notices-banner': { id: 'notices-banner', role: 'region' },
	'notices-snackbar': { id: 'notices-snackbar', role: 'region' },
};

const a = slotRegions( defaultTree );

ok( 'toolbar slot claimed by banner', id( a.toolbar ) === 'toolbar' );
ok( 'sidebar slot claimed by navigation', id( a.sidebar ) === 'sidebar' );
ok( 'content slot claimed by main', id( a.content ) === 'content' );
ok(
	'detail slot claimed by complementary (not stranded as a drawer)',
	id( a.detail ) === 'detail'
);
ok(
	'modal command-palette → overlay layer',
	ids( a.overlay ).includes( 'command-palette' )
);
ok(
	'notices regions → stragglers',
	ids( a.stragglers ).sort().join() ===
		[ 'notices-banner', 'notices-snackbar' ].join()
);
ok( 'no body extras in the default tree', a.bodyExtras.length === 0 );

/* ── 2. Role wins over a non-conventional id (item 4) ─────────────────── */

const renamedMain = slotRegions( {
	dashboard: { id: 'dashboard', role: 'main' },
	sidebar: { id: 'sidebar', role: 'navigation' },
} );

ok(
	'role:main with id "dashboard" lands in the content slot',
	id( renamedMain.content ) === 'dashboard'
);
ok(
	'role-matched main is NOT a straggler',
	! ids( renamedMain.stragglers ).includes( 'dashboard' )
);

/* ── 3. id tiebreaker among same-role regions ─────────────────────────── */

const twoMain = slotRegions( {
	extra: { id: 'extra', role: 'main' },
	content: { id: 'content', role: 'main' },
} );

ok(
	'when two role:main regions exist, id "content" wins the slot',
	id( twoMain.content ) === 'content'
);
ok(
	'the other role:main region falls to stragglers',
	ids( twoMain.stragglers ).includes( 'extra' )
);

/* ── 4. dashboard-grid / dynamic-children region → body area (item 2) ─── */

const withGrid = slotRegions( {
	sidebar: { id: 'sidebar', role: 'navigation' },
	'home-dashboard-grid': {
		id: 'home-dashboard-grid',
		role: 'region',
		platform: { 'core:dynamic-children': true },
	},
} );

ok(
	'dynamic-children region → bodyExtras (real content-row mount point)',
	ids( withGrid.bodyExtras ).includes( 'home-dashboard-grid' )
);
ok(
	'dynamic-children region is NOT a bottom straggler',
	! ids( withGrid.stragglers ).includes( 'home-dashboard-grid' )
);

/* ── 5. preview is id-only (no engine role) ───────────────────────────── */

const withPreview = slotRegions( {
	content: { id: 'content', role: 'main' },
	preview: { id: 'preview', role: 'region' },
} );
ok( 'preview slot claimed by id', id( withPreview.preview ) === 'preview' );

/* ── 6. defensive: empty / malformed input ────────────────────────────── */

const empty = slotRegions( undefined );
ok(
	'undefined input → empty buckets, no throw',
	empty.toolbar === undefined &&
		empty.overlay.length === 0 &&
		empty.stragglers.length === 0
);

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
