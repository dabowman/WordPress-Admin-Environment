#!/usr/bin/env node
/**
 * composeWidgets tests (legacy, v2 — C4).
 *
 * Pure-ESM helper that turns the manifest registry + admin.json
 * dashboardWidgets overrides into a flat tile list. This is the v2
 * pre-3c.1 shape — the dashboard-host no longer consumes it. Tests
 * preserved for as long as the v2 schema + module remain bundled
 * (deprecated; slated for removal alongside the v2 shells in 3d).
 * The v3 replacement is `tests/runtime/compose-screen-widgets.test.mjs`.
 *
 * Run: `node tests/runtime/compose-widgets.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { composeWidgets } = await import(
	resolve( projectRoot, 'src/runtime/dashboardGrid/composeWidgets.mjs' )
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

console.log( '— composeWidgets: eligibility —\n' );

{
	const manifests = {
		'core:posts': { id: 'core:posts', title: 'Posts' },
		'core:dashboard-widget-recent-posts': {
			id: 'core:dashboard-widget-recent-posts',
			title: 'Recent Drafts',
			dashboardWidget: { title: 'Recent Drafts' },
		},
	};
	const out = composeWidgets( manifests, {} );
	ok(
		'apps without dashboardWidget block are skipped',
		out.length === 1
	);
	ok(
		'apps with dashboardWidget block are included',
		out[ 0 ].id === 'core:dashboard-widget-recent-posts'
	);
}

console.log( '\n— composeWidgets: defaults —\n' );

{
	const manifests = {
		'core:dashboard-widget-foo': {
			id: 'core:dashboard-widget-foo',
			title: 'Foo',
			dashboardWidget: {},
		},
	};
	const out = composeWidgets( manifests, {} );
	eq(
		'empty dashboardWidget → defaultSize { w:1, h:1 }',
		out[ 0 ].defaultSize,
		{ w: 1, h: 1 }
	);
	eq(
		'empty dashboardWidget → minSize { w:1, h:1 }',
		out[ 0 ].minSize,
		{ w: 1, h: 1 }
	);
	ok(
		'empty dashboardWidget → position auto',
		out[ 0 ].position === 'auto'
	);
	ok(
		'title falls back to manifest title when not in dashboardWidget block',
		out[ 0 ].title === 'Foo'
	);
}

console.log( '\n— composeWidgets: hidden override —\n' );

{
	const manifests = {
		'core:dashboard-widget-foo': {
			dashboardWidget: { title: 'Foo' },
		},
	};
	const out = composeWidgets( manifests, {
		'core:dashboard-widget-foo': { hidden: true },
	} );
	ok(
		'hidden: true removes the widget',
		out.length === 0
	);
}

console.log( '\n— composeWidgets: override wins per-property —\n' );

{
	const manifests = {
		'core:dashboard-widget-foo': {
			dashboardWidget: {
				title: 'Foo',
				defaultSize: { w: 1, h: 1 },
				position: 'auto',
			},
		},
	};
	const out = composeWidgets( manifests, {
		'core:dashboard-widget-foo': {
			position: { row: 2, col: 3 },
			defaultSize: { w: 2, h: 2 },
			title: 'Foo (Acme)',
		},
	} );
	eq( 'override position wins', out[ 0 ].position, { row: 2, col: 3 } );
	eq(
		'override defaultSize wins',
		out[ 0 ].defaultSize,
		{ w: 2, h: 2 }
	);
	ok( 'override title wins', out[ 0 ].title === 'Foo (Acme)' );
}

console.log( '\n— composeWidgets: minSize clamps defaultSize —\n' );

{
	const manifests = {
		'core:dashboard-widget-foo': {
			dashboardWidget: {
				defaultSize: { w: 1, h: 1 },
				minSize: { w: 2, h: 2 },
			},
		},
	};
	const out = composeWidgets( manifests, {} );
	eq(
		'defaultSize floored to minSize',
		out[ 0 ].defaultSize,
		{ w: 2, h: 2 }
	);
}

console.log( '\n— composeWidgets: malformed inputs —\n' );

{
	ok( 'null manifests → []', composeWidgets( null, {} ).length === 0 );
	ok( 'undefined manifests → []', composeWidgets( undefined, {} ).length === 0 );

	const manifests = {
		'core:dashboard-widget-foo': {
			dashboardWidget: {},
		},
	};
	const out = composeWidgets( manifests, null );
	ok( 'null overrides treated as {}', out.length === 1 );

	const outBadPos = composeWidgets( manifests, {
		'core:dashboard-widget-foo': { position: { row: 0, col: 1 } },
	} );
	ok(
		'invalid position falls back to auto',
		outBadPos[ 0 ].position === 'auto'
	);

	const outBadSize = composeWidgets( manifests, {
		'core:dashboard-widget-foo': { defaultSize: { w: 0, h: -1 } },
	} );
	eq(
		'invalid defaultSize falls back to { w:1, h:1 }',
		outBadSize[ 0 ].defaultSize,
		{ w: 1, h: 1 }
	);
}

console.log( '\n— composeWidgets: ordering preserved —\n' );

{
	const manifests = {
		a: { dashboardWidget: {} },
		b: { dashboardWidget: {} },
		c: { dashboardWidget: {} },
	};
	const out = composeWidgets( manifests, {} );
	ok(
		'order matches manifest key order',
		out[ 0 ].id === 'a' && out[ 1 ].id === 'b' && out[ 2 ].id === 'c'
	);
}

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
