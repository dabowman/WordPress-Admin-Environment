#!/usr/bin/env node
/**
 * resolveRegion merge tests (V2.M2 task 3).
 *
 * Covers `src/runtime/regions/resolveRegion.mjs` — the kernel's
 * template-merge step. Pure JS; no DOM, no React, no PHP. Validates
 * spec §5 merge precedence: declaration overrides template for
 * `role`, declaration's `platform`/`style`/`layout` shallow-merge over
 * the template's `platform`/`default-style`, and nested children merge
 * by name with declaration winning whole-child.
 *
 * Run: `node tests/runtime/resolve-region.test.mjs` (also
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { resolveRegion, resolveRegions } = await import(
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

function eq( actual, expected ) {
	return JSON.stringify( actual ) === JSON.stringify( expected );
}

const ENGINE = {
	id: 'core:test-engine',
	templates: {
		'core:sidebar': {
			role: 'navigation',
			platform: { 'persists-across-navigation': true },
			'default-style': {
				'inline-size': '280px',
				background: '{styles.chrome.sidebar.background}',
			},
		},
		'core:topbar': {
			role: 'banner',
			platform: { 'persists-across-navigation': true },
			'default-style': {
				'block-size': '48px',
				background: '{styles.chrome.toolbar.background}',
			},
			regions: {
				start: { role: 'region' },
				center: { role: 'region' },
				end: { role: 'region' },
			},
		},
		'core:overlay': {
			role: 'dialog',
			platform: { modal: true, 'dismiss-on': [ 'Escape' ] },
			'default-style': { 'inline-size': 'min(600px, 90vw)' },
		},
	},
};

console.log( '— resolveRegion: passthrough cases —\n' );

ok(
	'no-template declaration returns unchanged',
	eq(
		resolveRegion( { source: 'core:sidebar-region', contains: [ 'core:nav' ] }, ENGINE ),
		{ source: 'core:sidebar-region', contains: [ 'core:nav' ] }
	)
);

ok(
	'unknown template returns unchanged',
	eq(
		resolveRegion( { template: 'core:does-not-exist', app: 'core:posts' }, ENGINE ),
		{ template: 'core:does-not-exist', app: 'core:posts' }
	)
);

ok(
	'engine without templates returns unchanged',
	eq(
		resolveRegion( { template: 'core:sidebar' }, { id: 'no-templates' } ),
		{ template: 'core:sidebar' }
	)
);

ok( 'null declaration returns null', resolveRegion( null, ENGINE ) === null );

ok(
	'undefined engine returns declaration unchanged',
	eq(
		resolveRegion( { template: 'core:sidebar' }, undefined ),
		{ template: 'core:sidebar' }
	)
);

console.log( '\n— resolveRegion: role precedence —\n' );

ok(
	'template role inherited when declaration omits',
	resolveRegion( { template: 'core:sidebar' }, ENGINE ).role === 'navigation'
);

ok(
	'declaration role overrides template',
	resolveRegion(
		{ template: 'core:sidebar', role: 'complementary' },
		ENGINE
	).role === 'complementary'
);

console.log( '\n— resolveRegion: platform shallow merge —\n' );

const platformResolved = resolveRegion(
	{ template: 'core:overlay', platform: { 'autofocus-target': '[autofocus]' } },
	ENGINE
);

ok(
	'platform: template fields carry through',
	platformResolved.platform.modal === true
);
ok(
	'platform: declaration adds new key',
	platformResolved.platform[ 'autofocus-target' ] === '[autofocus]'
);
ok(
	'platform: declaration overrides template key',
	resolveRegion(
		{ template: 'core:overlay', platform: { modal: false } },
		ENGINE
	).platform.modal === false
);

console.log( '\n— resolveRegion: style/layout merge —\n' );

const styled = resolveRegion(
	{
		template: 'core:sidebar',
		style: { color: '{styles.chrome.sidebar.foreground}' },
		layout: { 'inline-size': '320px' },
	},
	ENGINE
);
ok(
	'style: template default carries through',
	styled.style.background === '{styles.chrome.sidebar.background}'
);
ok(
	'style: declaration.style adds new key',
	styled.style.color === '{styles.chrome.sidebar.foreground}'
);
ok(
	'style: declaration.layout overrides template default-style key',
	styled.style[ 'inline-size' ] === '320px'
);

console.log( '\n— resolveRegion: nested regions —\n' );

const topbar = resolveRegion(
	{
		template: 'core:topbar',
		regions: { center: { app: 'core:current-page-title' } },
	},
	ENGINE
);

ok(
	'nested: template-only child carries through',
	topbar.regions.start.role === 'region'
);
ok(
	'nested: declaration child wins outright',
	eq( topbar.regions.center, { app: 'core:current-page-title' } )
);
ok(
	'nested: another template-only child preserved',
	topbar.regions.end.role === 'region'
);

ok(
	'nested: declaration-only children carry through when template has none',
	eq(
		resolveRegion(
			{ template: 'core:sidebar', regions: { extra: { app: 'core:foo' } } },
			ENGINE
		).regions,
		{ extra: { app: 'core:foo' } }
	)
);

console.log( '\n— resolveRegions: map iteration —\n' );

const resolvedMap = resolveRegions(
	{
		sidebar: { template: 'core:sidebar' },
		legacy: { source: 'core:content-region' },
	},
	ENGINE
);
ok(
	'resolveRegions: keys preserved',
	Object.keys( resolvedMap ).join( ',' ) === 'sidebar,legacy'
);
ok(
	'resolveRegions: templated entry merged',
	resolvedMap.sidebar.role === 'navigation'
);
ok(
	'resolveRegions: legacy entry untouched',
	resolvedMap.legacy.source === 'core:content-region' &&
		resolvedMap.legacy.role === undefined
);

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
