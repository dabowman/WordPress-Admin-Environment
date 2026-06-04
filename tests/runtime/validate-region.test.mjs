#!/usr/bin/env node
/**
 * validateRegion + sanitizeRegion tests (V2.M2 task 5).
 *
 * Covers `src/runtime/regions/validateRegion.mjs` — runtime enforcement
 * of the `app` xor `routing.route-key` rule (spec §5.4). The kernel
 * runs validate post-merge and logs each violation, then sanitizes by
 * dropping `app` so URL routing wins.
 *
 * Run: `node tests/runtime/validate-region.test.mjs` (also
 * `npm run test:runtime:validate`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { validateRegion, validateRegions, sanitizeRegion, sanitizeRegions } =
	await import(
		resolve( projectRoot, 'src/runtime/regions/validateRegion.mjs' )
	);

const { resolveRegion } = await import(
	resolve( projectRoot, 'src/runtime/regions/resolveRegion.mjs' )
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

console.log( '— validateRegion: clean cases —\n' );

ok(
	'app-only region: no violation',
	validateRegion( { id: 'sidebar', app: 'core:nav' } ).length === 0
);

ok(
	'route-key-only region: no violation',
	validateRegion( {
		id: 'main',
		routing: { 'route-key': '_self' },
	} ).length === 0
);

ok(
	'neither field: no violation',
	validateRegion( { id: 'workspace', regions: { foo: { app: 'core:bar' } } } )
		.length === 0
);

ok(
	'null/non-object: empty violations',
	validateRegion( null ).length === 0 &&
		validateRegion( 'string' ).length === 0
);

console.log( '\n— validateRegion: app xor route-key —\n' );

const topViolation = validateRegion( {
	id: 'detail',
	app: 'core:posts',
	routing: { 'route-key': 'detail' },
} );
ok(
	'top-level xor: one violation',
	topViolation.length === 1 && topViolation[ 0 ].rule === 'app-xor-route-key'
);
ok( 'top-level xor: path is region id', topViolation[ 0 ].path === 'detail' );

ok(
	'empty string app does not trigger',
	validateRegion( {
		id: 'r',
		app: '',
		routing: { 'route-key': 'detail' },
	} ).length === 0
);

ok(
	'empty route-key does not trigger',
	validateRegion( {
		id: 'r',
		app: 'core:posts',
		routing: { 'route-key': '' },
	} ).length === 0
);

console.log( '\n— validateRegion: nested —\n' );

const nestedViolations = validateRegion( {
	id: 'topbar',
	regions: {
		start: { app: 'core:hub' },
		center: { app: 'core:title', routing: { 'route-key': 'center' } },
		end: {
			regions: {
				deep: {
					app: 'core:menu',
					routing: { 'route-key': 'deep' },
				},
			},
		},
	},
} );

ok( 'nested xor: detects violations at depth', nestedViolations.length === 2 );

ok(
	'nested xor: child path is parent/child',
	nestedViolations.some( ( v ) => v.path === 'topbar/center' )
);

ok(
	'nested xor: grandchild path is parent/child/grandchild',
	nestedViolations.some( ( v ) => v.path === 'topbar/end/deep' )
);

console.log( '\n— validateRegion: route-key slot cross-check —\n' );

const ROUTES = {
	'/posts': { app: 'core:posts' },
	'@detail/posts': { app: 'core:editor' },
};

ok(
	'mirror route-key matching a declared slot: no violation',
	validateRegion(
		{ id: 'detail', routing: { 'route-key': 'detail', mode: 'mirror' } },
		'detail',
		ROUTES
	).length === 0
);

// `detaill` is one edit (a trailing insertion) from the declared `detail`
// slot — a genuine typo signature, distance 1.
const misspelled = validateRegion(
	{ id: 'detail', routing: { 'route-key': 'detaill', mode: 'mirror' } },
	'detail',
	ROUTES
);
ok(
	'mirror route-key one edit from a declared slot (typo): one violation',
	misspelled.length === 1 && misspelled[ 0 ].rule === 'route-key-unknown-slot'
);
ok(
	'unknown-slot violation: message names the near-miss slot',
	misspelled.length === 1 && /"detail"/.test( misspelled[ 0 ].message )
);

// The flagship-config false-positive: an engine's `mirror` peer region whose
// route-key is unrelated to any declared slot is *unused*, not misspelled —
// e.g. `core:default`'s `detail` region on `wp-admin-default`, which declares
// only `@grid/…` + `@palette/…` slot routes. `detail` is not within one edit
// of `grid` or `palette`, so the near-miss heuristic stays silent.
ok(
	'mirror route-key unrelated to every declared slot (unused peer): no violation',
	validateRegion(
		{ id: 'detail', routing: { 'route-key': 'detail', mode: 'mirror' } },
		'detail',
		{
			'@grid/dashboard': { app: 'core:widget' },
			'@palette/dashboard': { app: 'core:command-palette' },
		}
	).length === 0
);

// A two-edit difference (e.g. an `ai`↔`ia` transposition = distance 2) is
// outside the one-edit window, so it reads as unrelated/unused, not a typo.
ok(
	'mirror route-key two edits from a declared slot: no violation',
	validateRegion(
		{ id: 'detail', routing: { 'route-key': 'detial', mode: 'mirror' } },
		'detail',
		ROUTES
	).length === 0
);

ok(
	'mirror route-key but routes block has NO slot routes: no violation (region simply unused)',
	validateRegion(
		{ id: 'detail', routing: { 'route-key': 'detail', mode: 'mirror' } },
		'detail',
		{ '/posts': { app: 'core:posts' } }
	).length === 0
);

ok(
	'query-mode route-key never cross-checked (palette reads a query param)',
	validateRegion(
		{ id: 'palette', routing: { 'route-key': 'palette' } },
		'palette',
		ROUTES
	).length === 0
);

ok(
	'_self route-key never cross-checked',
	validateRegion(
		{ id: 'content', routing: { 'route-key': '_self' } },
		'content',
		ROUTES
	).length === 0
);

ok(
	'no routes block passed: cross-check skipped',
	validateRegion( {
		id: 'detail',
		routing: { 'route-key': 'detial', mode: 'mirror' },
	} ).length === 0
);

const nestedSlotViolation = validateRegion(
	{
		id: 'root',
		regions: {
			// `detai` is one edit (insertion) from the declared `detail` slot.
			detail: { routing: { 'route-key': 'detai', mode: 'mirror' } },
		},
	},
	'root',
	ROUTES
);
ok(
	'route-key cross-check recurses into children',
	nestedSlotViolation.length === 1 &&
		nestedSlotViolation[ 0 ].path === 'root/detail' &&
		nestedSlotViolation[ 0 ].rule === 'route-key-unknown-slot'
);

console.log( '\n— validateRegions: map iteration —\n' );

const mapViolations = validateRegions( {
	sidebar: { app: 'core:nav' },
	detail: { app: 'core:posts', routing: { 'route-key': 'detail' } },
} );
ok(
	'validateRegions: only flags conflicting region',
	mapViolations.length === 1 && mapViolations[ 0 ].path === 'detail'
);

const mapSlotViolations = validateRegions(
	{
		// `detai` is one edit (a deletion) from the declared `detail` slot.
		detail: { routing: { 'route-key': 'detai', mode: 'mirror' } },
	},
	ROUTES
);
ok(
	'validateRegions: forwards routes block to the slot cross-check',
	mapSlotViolations.length === 1 &&
		mapSlotViolations[ 0 ].rule === 'route-key-unknown-slot'
);

console.log( '\n— sanitizeRegion: drops app keeps route-key —\n' );

const cleaned = sanitizeRegion( {
	id: 'detail',
	app: 'core:posts',
	routing: { 'route-key': 'detail' },
	style: { 'inline-size': '320px' },
} );
ok( 'sanitize: app removed', cleaned.app === undefined );
ok(
	'sanitize: route-key preserved',
	cleaned.routing[ 'route-key' ] === 'detail'
);
ok(
	'sanitize: other fields preserved',
	cleaned.style[ 'inline-size' ] === '320px'
);

ok(
	'sanitize: clean region returns equivalent shape',
	sanitizeRegion( { id: 'main', app: 'core:posts' } ).app === 'core:posts'
);

ok(
	'sanitize: route-key only region untouched',
	sanitizeRegion( {
		id: 'main',
		routing: { 'route-key': '_self' },
	} ).routing[ 'route-key' ] === '_self'
);

console.log( '\n— sanitizeRegion: recurses into children —\n' );

const sanitizedTree = sanitizeRegion( {
	id: 'topbar',
	regions: {
		conflict: {
			app: 'core:posts',
			routing: { 'route-key': 'detail' },
		},
		clean: { app: 'core:title' },
	},
} );

ok(
	'sanitize children: conflicting child has app dropped',
	sanitizedTree.regions.conflict.app === undefined
);
ok(
	'sanitize children: conflicting child keeps route-key',
	sanitizedTree.regions.conflict.routing[ 'route-key' ] === 'detail'
);
ok(
	'sanitize children: clean child untouched',
	sanitizedTree.regions.clean.app === 'core:title'
);

console.log( '\n— sanitizeRegion: deep tree —\n' );

const deepSanitized = sanitizeRegion( {
	id: 'wrapper',
	regions: {
		mid: {
			regions: {
				leaf: {
					app: 'core:posts',
					routing: { 'route-key': 'leaf' },
				},
			},
		},
	},
} );
ok(
	'sanitize: grandchild app dropped',
	deepSanitized.regions.mid.regions.leaf.app === undefined
);

console.log( '\n— sanitizeRegion: input not mutated —\n' );

const original = {
	id: 'detail',
	app: 'core:posts',
	routing: { 'route-key': 'detail' },
};
sanitizeRegion( original );
ok( 'sanitize: does not mutate input', original.app === 'core:posts' );

console.log( '\n— sanitizeRegions: map iteration —\n' );

const sanMap = sanitizeRegions( {
	a: { app: 'x', routing: { 'route-key': 'a' } },
	b: { app: 'y' },
} );
ok( 'sanitizeRegions: a.app dropped', sanMap.a.app === undefined );
ok( 'sanitizeRegions: b.app preserved', sanMap.b.app === 'y' );

console.log( '\n— resolveRegion: label inheritance —\n' );

const LABEL_ENGINE = {
	templates: {
		palette: { role: 'dialog', label: 'Command palette' },
		bare: { role: 'region' },
	},
};

ok(
	'label inherits from template when declaration omits it',
	resolveRegion(
		{ id: 'command-palette', template: 'palette' },
		LABEL_ENGINE
	).label === 'Command palette'
);

ok(
	'per-region label overrides the template label',
	resolveRegion(
		{ id: 'command-palette', template: 'palette', label: 'Quick actions' },
		LABEL_ENGINE
	).label === 'Quick actions'
);

ok(
	'no label inherited when the template declares none',
	resolveRegion( { id: 'main', template: 'bare' }, LABEL_ENGINE ).label ===
		undefined
);

ok(
	'declaration label survives when no template matches',
	resolveRegion(
		{ id: 'detail', template: 'missing', label: 'Detail' },
		LABEL_ENGINE
	).label === 'Detail'
);

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
