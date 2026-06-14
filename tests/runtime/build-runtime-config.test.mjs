#!/usr/bin/env node
/**
 * Runtime-config synthesis tests.
 *
 * Covers the kernel's v3 → runtime-surface synthesis, ported from the
 * former PHP compiler when the kernel moved to reading the v3 shape
 * directly (`src/runtime/compile/*`):
 *   - synthesizeRoutes      — screens → routes (+ screenId, slot routes, iframe)
 *   - synthesizeRegions     — engine defaultRegions merged under workspace regions
 *   - synthesizeDefaultRoute — top-level default-screen → path, with fallback
 *   - compileCommands       — dedupe by id (later wins)
 *   - translateIframeRef    — iframe:<slug> → core:iframe-fallback + config.url
 *   - buildRuntimeConfig    — orchestrator + e2e over every bundled workspace
 *
 * Run: `node tests/runtime/build-runtime-config.test.mjs` (chained from
 * `npm run test:runtime`).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { synthesizeRoutes, primaryApp } = await import(
	resolve( projectRoot, 'src/runtime/compile/synthesizeRoutes.mjs' )
);
const { synthesizeRegions } = await import(
	resolve( projectRoot, 'src/runtime/compile/synthesizeRegions.mjs' )
);
const { synthesizeDefaultRoute } = await import(
	resolve( projectRoot, 'src/runtime/compile/synthesizeDefaultRoute.mjs' )
);
const { compileCommands } = await import(
	resolve( projectRoot, 'src/runtime/compile/compileCommands.mjs' )
);
const { translateIframeRef } = await import(
	resolve( projectRoot, 'src/runtime/compile/translateIframeRef.mjs' )
);
const { buildRuntimeConfig } = await import(
	resolve( projectRoot, 'src/runtime/compile/buildRuntimeConfig.mjs' )
);

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
		if ( detail ) {
			console.log( `      ${ detail }` );
		}
	}
}

function eq( label, actual, expected ) {
	ok(
		label,
		JSON.stringify( actual ) === JSON.stringify( expected ),
		`expected ${ JSON.stringify( expected ) }, got ${ JSON.stringify(
			actual
		) }`
	);
}

// ── synthesizeRoutes — shorthand single-app screens ─────────────────
console.log( '\n— synthesizeRoutes (shorthand) —\n' );

const shorthandScreens = {
	home: { label: 'Home', path: '/dashboard/home', app: 'core:dashboard' },
	posts: {
		label: 'Posts',
		path: '/posts',
		app: 'core:posts',
		config: { postType: 'post' },
	},
};
const shorthandRoutes = synthesizeRoutes( shorthandScreens );
ok( '/dashboard/home present', !! shorthandRoutes[ '/dashboard/home' ] );
eq(
	'/dashboard/home app id',
	shorthandRoutes[ '/dashboard/home' ].app,
	'core:dashboard'
);
eq(
	'/dashboard/home screenId injected',
	shorthandRoutes[ '/dashboard/home' ].config.screenId,
	'home'
);
eq(
	'/posts retains postType',
	shorthandRoutes[ '/posts' ].config.postType,
	'post'
);
eq(
	'/posts screenId injected',
	shorthandRoutes[ '/posts' ].config.screenId,
	'posts'
);

// ── primaryApp — long-form apps[] ───────────────────────────────────
console.log( '\n— synthesizeRoutes (long-form apps[]) —\n' );

const longScreens = {
	split: {
		path: '/split',
		apps: [
			{ id: 'list', app: 'core:posts', config: { postType: 'page' } },
			{ id: 'preview', app: 'core:editor', slot: 'detail' },
		],
	},
};
const longRoutes = synthesizeRoutes( longScreens );
eq( 'primary app from first entry', longRoutes[ '/split' ].app, 'core:posts' );
eq( 'primary config retained', longRoutes[ '/split' ].config.postType, 'page' );
eq(
	'screenId injected on primary',
	longRoutes[ '/split' ].config.screenId,
	'split'
);
ok( '@detail/split slot route synthesized', !! longRoutes[ '@detail/split' ] );
eq(
	'@detail slot mounts core:editor',
	longRoutes[ '@detail/split' ].app,
	'core:editor'
);
eq(
	'primaryApp() shorthand',
	primaryApp( { app: 'core:posts', config: { a: 1 } } ),
	{ app: 'core:posts', config: { a: 1 } }
);
eq( 'primaryApp() null on empty', primaryApp( {} ), null );

// ── Palette-slot screen ─────────────────────────────────────────────
console.log( '\n— synthesizeRoutes (palette slot) —\n' );

const paletteRoutes = synthesizeRoutes( {
	home: { path: '/', app: 'core:dashboard' },
	'command-palette': {
		slot: 'palette',
		app: 'core:command-palette',
		mode: 'modal',
	},
} );
ok(
	'palette screen under @palette/command-palette',
	!! paletteRoutes[ '@palette/command-palette' ]
);
eq(
	'palette route app id',
	paletteRoutes[ '@palette/command-palette' ].app,
	'core:command-palette'
);

// ── Multi-app: triple, no-slot peer, _self guard, collision ─────────
console.log( '\n— synthesizeRoutes (multi-app) —\n' );

const multiRoutes = synthesizeRoutes( {
	triple: {
		path: '/triple',
		apps: [
			{ id: 'main', app: 'core:posts' },
			{ id: 'detail', app: 'core:editor', slot: 'detail' },
			{ id: 'inspector', app: 'core:profile', slot: 'inspector' },
		],
	},
	noSlot: {
		path: '/no-slot',
		apps: [
			{ id: 'main', app: 'core:dashboard-host' },
			{ id: 'peer', app: 'core:dashboard-widget-recent-posts' },
		],
	},
	selfGuard: {
		path: '/self',
		apps: [
			{ id: 'main', app: 'core:posts' },
			{ id: 'rogue', app: 'core:editor', slot: '_self' },
		],
	},
	collision: {
		path: '/collide',
		apps: [
			{ id: 'main', app: 'core:posts' },
			{ id: 'first', app: 'core:editor', slot: 'detail' },
			{ id: 'second', app: 'core:profile', slot: 'detail' },
		],
	},
} );
ok( 'triple @detail synthesized', !! multiRoutes[ '@detail/triple' ] );
ok( 'triple @inspector synthesized', !! multiRoutes[ '@inspector/triple' ] );
eq(
	'inspector slot mounts core:profile',
	multiRoutes[ '@inspector/triple' ].app,
	'core:profile'
);
ok(
	'no-slot peer emits no slot route',
	! multiRoutes[ '@dashboard-widget-recent-posts/no-slot' ]
);
eq(
	'_self guard — primary stays first entry',
	multiRoutes[ '/self' ].app,
	'core:posts'
);
ok( '_self guard — no @_self route', ! multiRoutes[ '@_self/self' ] );
eq(
	'intra-slot collision — first entry wins',
	multiRoutes[ '@detail/collide' ].app,
	'core:editor'
);

// Existing routes (escape hatch) win on collision.
const overrideRoutes = synthesizeRoutes(
	{
		split: {
			path: '/split',
			apps: [
				{ id: 'main', app: 'core:posts' },
				{ id: 'peer', app: 'core:editor', slot: 'detail' },
			],
		},
	},
	{ '@detail/split': { app: 'core:dashboard', config: { overridden: true } } }
);
eq(
	'existing @detail/split route wins',
	overrideRoutes[ '@detail/split' ].app,
	'core:dashboard'
);

// Parametric path.
const paramRoutes = synthesizeRoutes( {
	'post-edit': {
		path: '/posts/{id}/edit',
		apps: [
			{ id: 'main', app: 'core:editor' },
			{
				id: 'detail',
				app: 'core:posts',
				slot: 'detail',
				config: { postId: '{id}' },
			},
		],
	},
} );
ok( 'parametric primary keyed', !! paramRoutes[ '/posts/{id}/edit' ] );
ok(
	'parametric slot route inherits param',
	!! paramRoutes[ '@detail/posts/{id}/edit' ]
);
eq(
	'parametric slot route preserves {id} in config',
	paramRoutes[ '@detail/posts/{id}/edit' ].config.postId,
	'{id}'
);

// Path-less + _self screen is skipped.
const skipRoutes = synthesizeRoutes( {
	home: { path: '/', app: 'core:dashboard' },
	noMount: { app: 'core:somewhere' },
} );
ok( 'path-less _self screen skipped', ! skipRoutes[ '/noMount' ] );

// ── translateIframeRef ──────────────────────────────────────────────
console.log( '\n— translateIframeRef —\n' );

const iframeRoutes = synthesizeRoutes( {
	updates: { path: '/updates', app: 'iframe:update-core.php' },
	preconfigured: {
		path: '/pre',
		app: 'iframe:options-general.php',
		config: { url: 'options-discussion.php' },
	},
} );
eq(
	'iframe screen route → core:iframe-fallback',
	iframeRoutes[ '/updates' ].app,
	'core:iframe-fallback'
);
eq(
	'iframe slug → config.url',
	iframeRoutes[ '/updates' ].config.url,
	'update-core.php'
);
eq(
	'author config.url wins',
	iframeRoutes[ '/pre' ].config.url,
	'options-discussion.php'
);
// Idempotency.
const once = translateIframeRef( { app: 'iframe:tools.php' } );
const twice = translateIframeRef( once );
eq( 'idempotent app', twice.app, 'core:iframe-fallback' );
eq( 'idempotent url', twice.config.url, 'tools.php' );
eq(
	'non-iframe passes through',
	translateIframeRef( { app: 'core:posts' } ).app,
	'core:posts'
);

// ── synthesizeRegions ───────────────────────────────────────────────
console.log( '\n— synthesizeRegions —\n' );

const engineDefaults = {
	sidebar: { template: 'core:sidebar', role: 'navigation' },
	content: {
		template: 'core:main',
		routing: { 'route-key': '_self' },
	},
};
const plainRegions = synthesizeRegions( engineDefaults, {} );
ok(
	'engine defaults pass through when no workspace regions',
	!! plainRegions.sidebar && !! plainRegions.content
);

const mergedRegions = synthesizeRegions( engineDefaults, {
	content: { style: { background: 'red' } },
	'custom-region': { role: 'region', app: 'plugin:my/widget' },
} );
ok( 'workspace adds custom-region', !! mergedRegions[ 'custom-region' ] );
ok( 'engine sidebar still present', !! mergedRegions.sidebar );
eq(
	'workspace style wins on content',
	mergedRegions.content.style.background,
	'red'
);
eq(
	'content keeps engine template',
	mergedRegions.content.template,
	'core:main'
);

// ── synthesizeDefaultRoute ──────────────────────────────────────────
console.log( '\n— synthesizeDefaultRoute —\n' );

eq(
	'default from top-level default-screen',
	synthesizeDefaultRoute(
		{ home: { path: '/dashboard/home' }, posts: { path: '/posts' } },
		'home'
	),
	'/dashboard/home'
);
eq(
	'falls back to first screen with a path',
	synthesizeDefaultRoute(
		{ palette: { slot: 'palette' }, real: { path: '/somewhere' } },
		'palette'
	),
	'/somewhere'
);
eq( 'last resort /', synthesizeDefaultRoute( {}, 'nope' ), '/' );

// ── compileCommands ─────────────────────────────────────────────────
console.log( '\n— compileCommands —\n' );

const cmds = compileCommands( [
	{ id: 'open-palette', shortcut: 'Mod+K', invoke: 'core:command-palette' },
	{ id: 'go-posts', shortcut: 'g p', navigate: '/posts' },
] );
eq( 'preserves 2 commands', cmds.length, 2 );

const dedup = compileCommands( [
	{ id: 'dup', shortcut: 'a', invoke: 'first' },
	{ id: 'dup', shortcut: 'b', invoke: 'second' },
] );
eq( 'dedupe by id', dedup.length, 1 );
eq( 'later wins', dedup[ 0 ].invoke, 'second' );

// ── buildRuntimeConfig — orchestrator ───────────────────────────────
console.log( '\n— buildRuntimeConfig —\n' );

const built = buildRuntimeConfig(
	{
		version: 3,
		engine: 'core:default', 'default-screen': 'home',
		screens: {
			home: { path: '/dashboard/home', app: 'core:dashboard' },
			posts: { path: '/posts', app: 'core:posts' },
		},
		commands: [
			{ id: 'k', shortcut: 'Mod+K', invoke: 'core:command-palette' },
		],
	},
	engineDefaults && { defaultRegions: engineDefaults }
);
eq( 'engine promoted to top level', built.engine, 'core:default' );
ok( 'routes synthesized', !! built.routes[ '/posts' ] );
eq( 'default-route resolved', built[ 'default-route' ], '/dashboard/home' );
ok( 'regions present', !! built.regions.content );
ok( 'screens block preserved', !! built.screens.posts );
eq( 'commands compiled', built.commands.length, 1 );
ok(
	'menu-renderer absent when engine manifest omits it',
	! ( 'menu-renderer' in built )
);

// menu-renderer stamped from the engine manifest when present.
const builtWithRenderer = buildRuntimeConfig(
	{ version: 3, engine: 'core:default', screens: {} },
	{ defaultRegions: engineDefaults || {}, 'menu-renderer': 'sidebar-tree' }
);
eq(
	'menu-renderer stamped from engine manifest',
	builtWithRenderer[ 'menu-renderer' ],
	'sidebar-tree'
);
// Non-string manifest value is ignored (key stays off).
const builtBadRenderer = buildRuntimeConfig(
	{ version: 3, engine: 'core:default', screens: {} },
	{ defaultRegions: {}, 'menu-renderer': 42 }
);
ok(
	'non-string menu-renderer ignored',
	! ( 'menu-renderer' in builtBadRenderer )
);

// ── e2e — every bundled workspace against its engine manifest ───────────
console.log( '\n— e2e: bundled workspaces —\n' );

function loadEngineManifest( engineId ) {
	// `core:default` → engines/core-default/engine.json
	const dir = engineId.replace( /^core:/, 'core-' ).replace( /^plugin:/, '' );
	const path = resolve(
		projectRoot,
		'src/runtime/engines',
		dir,
		'engine.json'
	);
	return JSON.parse( readFileSync( path, 'utf8' ) );
}

const shellDir = resolve( projectRoot, 'workspaces' );
const shellFiles = readdirSync( shellDir ).filter( ( f ) =>
	f.endsWith( '.json' )
);
for ( const file of shellFiles.sort() ) {
	const workspace = JSON.parse(
		readFileSync( resolve( shellDir, file ), 'utf8' )
	);
	const engineId = workspace.engine || 'core:default';
	const manifest = loadEngineManifest( engineId );
	const rc = buildRuntimeConfig( workspace, manifest );

	ok( `${ file }: engine resolves`, rc.engine === engineId, rc.engine );
	ok(
		`${ file }: ≥1 region synthesized`,
		Object.keys( rc.regions || {} ).length >= 1
	);
	ok(
		`${ file }: ≥1 route synthesized`,
		Object.keys( rc.routes || {} ).length >= 1
	);
	ok(
		`${ file }: default-route resolves`,
		typeof rc[ 'default-route' ] === 'string' &&
			rc[ 'default-route' ] !== ''
	);
	ok( `${ file }: screens block preserved`, !! rc.screens );

	// Every bundled engine declares menu-renderer → it's stamped onto the
	// runtime config matching the manifest.
	if ( typeof manifest[ 'menu-renderer' ] === 'string' ) {
		eq(
			`${ file }: menu-renderer stamped from engine`,
			rc[ 'menu-renderer' ],
			manifest[ 'menu-renderer' ]
		);
	}

	// No iframe: refs leak into the synthesized routes.
	const leaked = Object.values( rc.routes ).some(
		( r ) => typeof r.app === 'string' && r.app.startsWith( 'iframe:' )
	);
	ok( `${ file }: no iframe: refs in synthesized routes`, ! leaked );
}

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
