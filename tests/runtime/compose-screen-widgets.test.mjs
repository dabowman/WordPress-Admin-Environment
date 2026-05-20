#!/usr/bin/env node
/**
 * composeScreenWidgets tests (v3 reshape).
 *
 * Pure-ESM helper that turns a v3 `screens[id].apps[]` array (filtered
 * to `slot: "grid"`) and the manifest registry into a flat tile list.
 *
 * Run: `node tests/runtime/compose-screen-widgets.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { composeScreenWidgets } = await import(
	resolve(
		projectRoot,
		'src/apps/dashboard-host/composeScreenWidgets.mjs'
	)
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

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	ok( label, a === e, `expected ${ e } got ${ a }` );
}

console.log( '— composeScreenWidgets: slot filter —\n' );

{
	const screen = {
		apps: [
			{
				id: 'recent-posts',
				app: 'core:dashboard-widget-recent-posts',
				slot: 'grid',
			},
			{
				id: 'inspector',
				app: 'core:editor',
				slot: 'inspector',
			},
			{ id: 'main', app: 'core:posts' /* no slot */ },
		],
	};
	const manifests = {
		'core:dashboard-widget-recent-posts': {
			title: 'Recent Drafts',
		},
		'core:editor': { title: 'Editor' },
		'core:posts': { title: 'Posts' },
	};
	const out = composeScreenWidgets( { screen, manifests } );
	ok(
		'only `slot: "grid"` entries are included',
		out.length === 1
	);
	ok(
		'kept entry id is the screen-app entry id, not the app id',
		out[ 0 ].id === 'recent-posts'
	);
	ok(
		'appId is the underlying mount target',
		out[ 0 ].appId === 'core:dashboard-widget-recent-posts'
	);
}

console.log( '\n— composeScreenWidgets: defaults when no slotHints —\n' );

{
	const screen = {
		apps: [
			{
				id: 'recent',
				app: 'core:dashboard-widget-foo',
				slot: 'grid',
			},
		],
	};
	const manifests = {
		'core:dashboard-widget-foo': { title: 'Foo' },
	};
	const out = composeScreenWidgets( { screen, manifests } );
	eq(
		'no slotHints → defaultSize { w:1, h:1 }',
		out[ 0 ].defaultSize,
		{ w: 1, h: 1 }
	);
	eq(
		'no slotHints → minSize { w:1, h:1 }',
		out[ 0 ].minSize,
		{ w: 1, h: 1 }
	);
	ok(
		'no slotHints → position auto',
		out[ 0 ].position === 'auto'
	);
	ok(
		'title falls back to manifest title when entry has no title override',
		out[ 0 ].title === 'Foo'
	);
}

console.log(
	'\n— composeScreenWidgets: slotHints supply defaults —\n'
);

{
	const screen = {
		apps: [
			{
				id: 'recent',
				app: 'core:dashboard-widget-foo',
				slot: 'grid',
			},
		],
	};
	const manifests = {
		'core:dashboard-widget-foo': {
			title: 'Foo',
			slotHints: {
				defaultSize: { w: 2, h: 2 },
				minSize: { w: 1, h: 1 },
				position: 'auto',
			},
		},
	};
	const out = composeScreenWidgets( { screen, manifests } );
	eq(
		'slotHints.defaultSize used when entry has no size override',
		out[ 0 ].defaultSize,
		{ w: 2, h: 2 }
	);
	eq(
		'slotHints.minSize used when entry has no minSize override',
		out[ 0 ].minSize,
		{ w: 1, h: 1 }
	);
}

console.log(
	'\n— composeScreenWidgets: entry overrides win per-property —\n'
);

{
	const screen = {
		apps: [
			{
				id: 'recent',
				app: 'core:dashboard-widget-foo',
				slot: 'grid',
				size: { w: 3, h: 1 },
				position: { row: 1, col: 2 },
			},
		],
	};
	const manifests = {
		'core:dashboard-widget-foo': {
			title: 'Foo',
			slotHints: {
				defaultSize: { w: 1, h: 1 },
				position: 'auto',
			},
		},
	};
	const out = composeScreenWidgets( { screen, manifests } );
	eq(
		'entry size beats slotHints.defaultSize',
		out[ 0 ].defaultSize,
		{ w: 3, h: 1 }
	);
	eq(
		'entry position beats slotHints.position',
		out[ 0 ].position,
		{ row: 1, col: 2 }
	);
}

console.log(
	'\n— composeScreenWidgets: per-property hint + override merge —\n'
);

{
	// Entry overrides position only — size flows from slotHints.
	const screen = {
		apps: [
			{
				id: 'recent',
				app: 'core:dashboard-widget-foo',
				slot: 'grid',
				position: { row: 2, col: 1 },
			},
		],
	};
	const manifests = {
		'core:dashboard-widget-foo': {
			slotHints: {
				defaultSize: { w: 2, h: 1 },
			},
		},
	};
	const out = composeScreenWidgets( { screen, manifests } );
	eq(
		'override-only-position keeps slotHints.defaultSize',
		out[ 0 ].defaultSize,
		{ w: 2, h: 1 }
	);
	eq(
		'override-only-position wins',
		out[ 0 ].position,
		{ row: 2, col: 1 }
	);
}

console.log(
	'\n— composeScreenWidgets: minSize clamps defaultSize —\n'
);

{
	const screen = {
		apps: [
			{
				id: 'recent',
				app: 'core:dashboard-widget-foo',
				slot: 'grid',
				size: { w: 1, h: 1 },
			},
		],
	};
	const manifests = {
		'core:dashboard-widget-foo': {
			slotHints: {
				minSize: { w: 2, h: 2 },
			},
		},
	};
	const out = composeScreenWidgets( { screen, manifests } );
	eq(
		'entry size below minSize is floored',
		out[ 0 ].defaultSize,
		{ w: 2, h: 2 }
	);
}

console.log(
	'\n— composeScreenWidgets: missing manifest skips entry —\n'
);

{
	const screen = {
		apps: [
			{ id: 'a', app: 'core:exists', slot: 'grid' },
			{ id: 'b', app: 'core:missing', slot: 'grid' },
		],
	};
	const manifests = {
		'core:exists': { title: 'Exists' },
	};
	const out = composeScreenWidgets( { screen, manifests } );
	ok( 'entries without a manifest are skipped', out.length === 1 );
	ok( 'kept entry is the one with a manifest', out[ 0 ].id === 'a' );
}

console.log( '\n— composeScreenWidgets: title resolution —\n' );

{
	const screen = {
		apps: [
			{
				id: 'recent',
				app: 'core:dashboard-widget-foo',
				slot: 'grid',
				title: 'Override Title',
			},
		],
	};
	const manifests = {
		'core:dashboard-widget-foo': { title: 'Manifest Title' },
	};
	const out = composeScreenWidgets( { screen, manifests } );
	ok(
		'entry title wins over manifest title',
		out[ 0 ].title === 'Override Title'
	);
}

console.log( '\n— composeScreenWidgets: malformed inputs —\n' );

{
	ok(
		'null screen → []',
		composeScreenWidgets( { screen: null, manifests: {} } ).length === 0
	);
	ok(
		'undefined screen → []',
		composeScreenWidgets( {
			screen: undefined,
			manifests: {},
		} ).length === 0
	);
	ok(
		'screen without apps → []',
		composeScreenWidgets( {
			screen: { label: 'foo' },
			manifests: {},
		} ).length === 0
	);
	ok(
		'empty apps[] → []',
		composeScreenWidgets( {
			screen: { apps: [] },
			manifests: {},
		} ).length === 0
	);

	const screen = {
		apps: [ { id: 'a', app: 'core:foo', slot: 'grid' } ],
	};
	ok(
		'null manifests treated as {} (no manifest → skip)',
		composeScreenWidgets( { screen, manifests: null } ).length === 0
	);

	const outBadPos = composeScreenWidgets( {
		screen: {
			apps: [
				{
					id: 'a',
					app: 'core:foo',
					slot: 'grid',
					position: { row: 0, col: 1 },
				},
			],
		},
		manifests: { 'core:foo': {} },
	} );
	ok(
		'invalid position falls back to auto',
		outBadPos[ 0 ].position === 'auto'
	);

	const outBadSize = composeScreenWidgets( {
		screen: {
			apps: [
				{
					id: 'a',
					app: 'core:foo',
					slot: 'grid',
					size: { w: 0, h: -1 },
				},
			],
		},
		manifests: { 'core:foo': {} },
	} );
	eq(
		'invalid size falls back to { w:1, h:1 }',
		outBadSize[ 0 ].defaultSize,
		{ w: 1, h: 1 }
	);
}

console.log( '\n— composeScreenWidgets: ordering preserved —\n' );

{
	const screen = {
		apps: [
			{ id: 'a', app: 'core:foo', slot: 'grid' },
			{ id: 'b', app: 'core:bar', slot: 'grid' },
			{ id: 'c', app: 'core:baz', slot: 'grid' },
		],
	};
	const manifests = {
		'core:foo': {},
		'core:bar': {},
		'core:baz': {},
	};
	const out = composeScreenWidgets( { screen, manifests } );
	ok(
		'order matches apps[] order',
		out[ 0 ].id === 'a' && out[ 1 ].id === 'b' && out[ 2 ].id === 'c'
	);
}

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
