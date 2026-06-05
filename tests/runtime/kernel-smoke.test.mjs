#!/usr/bin/env node
/**
 * Kernel reader-level smoke harness (issue #30).
 *
 * Covers the bug class neither schema validation nor the resolver-shape /
 * synthesis tests catch: a runtime reader mounts the WRONG app for the
 * landing screen, routes a path to the wrong place, drops a nav item that
 * should survive, keeps one that should be capability-gated away, or fails
 * to surface a screen as a "Go to <screen>" palette command.
 *
 * `build-runtime-config.test.mjs` already pins the kernel's v3 → runtime
 * SURFACE synthesis (regions / routes / default-route / commands exist and
 * have the right shape). This suite goes one layer further and asserts on
 * the DECISIONS a runtime reader makes from those surfaces — the same
 * decisions the React components make at mount, reconstructed from the
 * exact pure modules the kernel + apps import:
 *
 *   - `matchRoute( routes, default-route )`  ← what the `_self` content
 *     region resolves at the landing screen (Region.js → useRouteForRegion
 *     → readSlot('_self') = URL primary = default-route). Asserts the
 *     landing screen mounts the screen's declared primary app.
 *   - `pruneMenu( orderTree( menu ), passes )` ← what `core:navigation`
 *     hands its renderer. Asserts a non-empty menu yields ≥ 1 item, and
 *     that capability gating drops exactly the role-denied items.
 *   - `shouldRenderRegion( region, capMap )` ← spec §8 layer-1 region
 *     fast-path the kernel applies before mounting. Asserts the role
 *     matrix drops the right regions.
 *   - `compileCommands({ commands, screens, goToLabel })` ← what
 *     `core:command-palette` registers against `@wordpress/commands`.
 *     Asserts every non-hidden landing-class screen becomes a
 *     "Go to <label>" entry.
 *
 * The capability section mirrors the role matrix in
 * `tests/php/run-cap-gating-smoke.php` (subscriber → editor → admin,
 * monotonic) on the JS side, against a synthetic post-resolve config
 * (menu items + regions carrying inline `permissions` / `capability`, the
 * shape `bind_screens` + the PHP prune produce before serialization).
 *
 * NOT covered here — requires a real React-DOM mount (jsdom + react + an
 * importer-rewrite loader for the `@wordpress/*` externals, neither in the
 * plain-`node` CI nor in devDependencies today; tracked as the remaining
 * half of #30):
 *   - `kernel(config)` returns a React tree without throwing.
 *   - Token emission reaches the rendered DOM through the engine's
 *     `ThemeProvider` (the token→CSS-string step is already pinned by
 *     `theme-provider-host.test.mjs`; only token→DOM is open).
 *
 * Pure ESM, no deps — runs on bare `node` like its siblings. Chained from
 * `npm run test:runtime`.
 *
 * Run: `node tests/runtime/kernel-smoke.test.mjs`
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';

import { buildRuntimeConfig } from '../../src/runtime/compile/buildRuntimeConfig.mjs';
import { primaryApp } from '../../src/runtime/compile/synthesizeRoutes.mjs';
import { translateIframeRef } from '../../src/runtime/compile/translateIframeRef.mjs';
import { matchRoute } from '../../src/runtime/routing/matchRoute.mjs';
import { orderTree, pruneMenu } from '../../src/runtime/menu/menuTree.mjs';
import { shouldRenderRegion } from '../../src/runtime/capabilities/shouldRenderRegion.mjs';
import { compileCommands } from '../../src/apps/command-palette/compileCommands.mjs';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

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

// ── fixtures ────────────────────────────────────────────────────────────

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
const shellFiles = readdirSync( shellDir )
	.filter( ( f ) => f.endsWith( '.json' ) )
	.sort();

// ── helpers — reconstruct the runtime readers' decisions ────────────────

// Identity "Go to <target>" wrapper. The React layer passes
// `(t) => sprintf(__('Go to %s'), t)`; the identity keeps assertions
// deterministic + locale-agnostic, matching command-palette-compile.test.mjs.
const goToLabel = ( target ) => `Go to ${ target }`;

/**
 * Pure mirror of `core:navigation`'s `itemPassesPermissions` (which reads
 * `window.wpAdminWorkspaces.capabilities` via `userCan`). OR-semantic over
 * caps with an optimistic-missing-key policy; role-only gates pass
 * client-side (server already pruned them). Takes the cap map explicitly so
 * it stays node-pure.
 *
 * @param {Object} item   Menu item.
 * @param {Object} capMap Capability snapshot (`{ cap: boolean }`).
 * @return {boolean}
 */
function passesPermissions( item, capMap ) {
	const perms = item && item.permissions;
	if ( ! perms || typeof perms !== 'object' ) {
		return true;
	}
	const caps = Array.isArray( perms.capabilities ) ? perms.capabilities : [];
	const roles = Array.isArray( perms.roles ) ? perms.roles : [];
	if ( caps.length === 0 && roles.length === 0 ) {
		return true;
	}
	for ( const cap of caps ) {
		if ( typeof cap !== 'string' ) {
			continue;
		}
		// Optimistic: a cap the map doesn't carry renders (REST is the
		// authority) — mirrors `userCan`.
		if ( ! ( cap in capMap ) || !! capMap[ cap ] ) {
			return true;
		}
	}
	// Role-only gate passes client-side (server-pruned upstream).
	return roles.length > 0;
}

/** Flatten a pruned tree to the set of surviving non-separator item ids. */
function survivingIds( items, into = new Set() ) {
	for ( const item of items ) {
		if ( ! item || item.separator ) {
			continue;
		}
		into.add( item.id );
		if ( Array.isArray( item.items ) ) {
			survivingIds( item.items, into );
		}
	}
	return into;
}

// ════════════════════════════════════════════════════════════════════════
// 1. Landing screen mounts the screen's declared primary app
// ════════════════════════════════════════════════════════════════════════
//
// Models the `_self` content region: readSlot('_self') = URL primary =
// `default-route`, then matchRoute → { app }. The app the region mounts
// MUST equal the landing screen's declared primary app (iframe-translated).
console.log( '\n— landing screen → mounted app (per bundled workspace) —\n' );

for ( const file of shellFiles ) {
	const config = JSON.parse(
		readFileSync( resolve( shellDir, file ), 'utf8' )
	);
	const engineId = config.engine || 'core:default';
	const manifest = loadEngineManifest( engineId );
	const rc = buildRuntimeConfig( config, manifest );

	const defaultRoute = rc[ 'default-route' ];
	const matched = matchRoute( rc.routes, defaultRoute );

	ok(
		`${ file }: default-route "${ defaultRoute }" matches a synthesized route`,
		matched !== null && typeof matched.app === 'string' && matched.app !== '',
		`matched: ${ JSON.stringify( matched ) }`
	);

	// Expected app = the landing screen's declared primary app, run through
	// the same iframe rewrite the route synthesis applies.
	const defaultScreenId =
		config[ 'default-screen' ] ||
		config.workspace?.[ 'default-screen' ] ||
		'';
	const landingScreen = ( config.screens || {} )[ defaultScreenId ];
	const primary = primaryApp( landingScreen );

	if ( primary && matched ) {
		const expectedApp = translateIframeRef( {
			app: primary.app,
			config: {},
		} ).app;
		ok(
			`${ file }: landing screen "${ defaultScreenId }" mounts "${ expectedApp }"`,
			matched.app === expectedApp,
			`expected ${ expectedApp }, route resolved ${ matched.app }`
		);
		// The synthesized config carries the screen id so the app can read
		// its own screen-scoped config (dataView, etc.).
		ok(
			`${ file }: mounted route carries screenId "${ defaultScreenId }"`,
			matched.config && matched.config.screenId === String( defaultScreenId )
		);
	}
}

// ════════════════════════════════════════════════════════════════════════
// 2. Navigation renders ≥ 1 item for a non-empty menu
// ════════════════════════════════════════════════════════════════════════
console.log( '\n— navigation prune (per bundled workspace) —\n' );

for ( const file of shellFiles ) {
	const config = JSON.parse(
		readFileSync( resolve( shellDir, file ), 'utf8' )
	);
	const menu = config.menu || {};
	const menuKeys = Object.keys( menu );
	if ( menuKeys.length === 0 ) {
		continue;
	}
	// Permissive predicate = admin (everything passes). This is what
	// `core:navigation` would hand the renderer for a fully-capable user.
	const pruned = pruneMenu( orderTree( menu ), () => true );
	ok(
		`${ file }: non-empty menu (${ menuKeys.length } roots) prunes to ≥ 1 item`,
		pruned.length >= 1,
		`pruned length ${ pruned.length }`
	);
}

// ════════════════════════════════════════════════════════════════════════
// 3. Command palette registers a "Go to <screen>" command per landing screen
// ════════════════════════════════════════════════════════════════════════
console.log( '\n— command-palette "Go to" entries (per bundled workspace) —\n' );

for ( const file of shellFiles ) {
	const config = JSON.parse(
		readFileSync( resolve( shellDir, file ), 'utf8' )
	);
	const descriptors = compileCommands( {
		commands: config.commands,
		screens: config.screens,
		goToLabel,
	} );
	const screenEntries = descriptors.filter( ( d ) => d.source === 'screen' );
	ok(
		`${ file }: ≥ 1 "Go to <screen>" palette entry`,
		screenEntries.length >= 1,
		`screen-source descriptors: ${ screenEntries.length }`
	);

	// The landing screen itself, when it has a routable (non-parameterized)
	// path + label, must be reachable via the palette — unless a command's
	// `navigate` already covers its path (path-dedup, by design).
	const defaultScreenId =
		config[ 'default-screen' ] ||
		config.workspace?.[ 'default-screen' ] ||
		'';
	const landingScreen = ( config.screens || {} )[ defaultScreenId ];
	const path =
		landingScreen && typeof landingScreen.path === 'string'
			? landingScreen.path
			: '';
	const routable =
		path !== '' &&
		! path.includes( '{' ) &&
		! path.endsWith( '/*' ) &&
		landingScreen.hidden !== true &&
		typeof landingScreen.label === 'string' &&
		landingScreen.label !== '';
	if ( routable ) {
		const commandCoversPath = Array.isArray( config.commands )
			? config.commands.some( ( c ) => c && c.navigate === path )
			: false;
		const hit = descriptors.find(
			( d ) => d.action && d.action.path === path
		);
		ok(
			`${ file }: landing screen "${ defaultScreenId }" reachable via palette`,
			!! hit,
			commandCoversPath
				? 'path is covered by a command navigate (dedup) — expected hit too'
				: `no palette entry for path ${ path }`
		);
		if ( hit && hit.source === 'screen' ) {
			ok(
				`${ file }: landing palette entry is "Go to ${ landingScreen.label }"`,
				hit.label === goToLabel( landingScreen.label ),
				`got "${ hit.label }"`
			);
		}
	}
}

// ════════════════════════════════════════════════════════════════════════
// 4. Capability gating — JS-side role matrix (mirrors run-cap-gating-smoke.php)
// ════════════════════════════════════════════════════════════════════════
//
// Synthetic post-resolve config: menu items + regions carry inline
// `permissions` / `capability` (the shape `bind_screens` + the server prune
// produce before serialization). Monotonic role walk: subscriber ⊂ editor
// ⊂ admin. A higher role sees every item a lower role sees, plus more.
console.log( '\n— capability gating role matrix —\n' );

// Capability snapshots per role (the `window.wpAdminWorkspaces.capabilities`
// map the PHP enqueue layer ships). Mirrors the PHP smoke's role fixtures.
const ROLE_CAPS = {
	subscriber: { read: true, edit_posts: false, manage_options: false },
	editor: { read: true, edit_posts: true, manage_options: false },
	administrator: { read: true, edit_posts: true, manage_options: true },
};

// Synthetic menu: id-keyed, each item screen-bound with inline permissions.
const matrixMenu = {
	dashboard: {
		label: 'Dashboard',
		href: '#/dashboard',
		permissions: { capabilities: [ 'read' ] },
	},
	posts: {
		label: 'Posts',
		href: '#/posts',
		permissions: { capabilities: [ 'edit_posts' ] },
	},
	settings: {
		label: 'Settings',
		href: '#/settings',
		permissions: { capabilities: [ 'manage_options' ] },
		// Container whose only child is also admin-only — must drop whole.
		items: {
			'settings-general': {
				label: 'General',
				href: '#/settings/general',
				permissions: { capabilities: [ 'manage_options' ] },
			},
		},
	},
	open: {
		// No permissions block → always visible (workspace fallback handled
		// server-side; client renders it).
		label: 'Open',
		href: '#/open',
	},
};

// Expected surviving top-level ids per role (monotonic).
const expectedSurvivors = {
	subscriber: [ 'dashboard', 'open' ],
	editor: [ 'dashboard', 'posts', 'open' ],
	administrator: [ 'dashboard', 'posts', 'settings', 'open' ],
};

for ( const role of Object.keys( ROLE_CAPS ) ) {
	const capMap = ROLE_CAPS[ role ];
	const pruned = pruneMenu( orderTree( matrixMenu ), ( item ) =>
		passesPermissions( item, capMap )
	);
	const ids = survivingIds( pruned );
	const expected = expectedSurvivors[ role ];
	const exactTop = pruned.map( ( i ) => i.id );

	ok(
		`menu prune (${ role }): keeps exactly [${ expected.join( ', ' ) }]`,
		exactTop.length === expected.length &&
			expected.every( ( id ) => exactTop.includes( id ) ),
		`got [${ exactTop.join( ', ' ) }]`
	);

	// The admin-only `settings` container (+ its admin-only child) drops as a
	// unit for non-admins — no orphan child leaks.
	ok(
		`menu prune (${ role }): settings/general child gated with parent`,
		role === 'administrator'
			? ids.has( 'settings-general' )
			: ! ids.has( 'settings-general' )
	);
}

// Monotonic invariant: every item a lower role sees, the next role up also
// sees (no inversion).
const subSet = survivingIds(
	pruneMenu( orderTree( matrixMenu ), ( i ) =>
		passesPermissions( i, ROLE_CAPS.subscriber )
	)
);
const edSet = survivingIds(
	pruneMenu( orderTree( matrixMenu ), ( i ) =>
		passesPermissions( i, ROLE_CAPS.editor )
	)
);
const adSet = survivingIds(
	pruneMenu( orderTree( matrixMenu ), ( i ) =>
		passesPermissions( i, ROLE_CAPS.administrator )
	)
);
ok(
	'menu prune: subscriber ⊆ editor ⊆ administrator (monotonic)',
	[ ...subSet ].every( ( id ) => edSet.has( id ) ) &&
		[ ...edSet ].every( ( id ) => adSet.has( id ) )
);

// Region fast-path (spec §8 layer 1) — the kernel drops a region the user
// lacks capability for before mounting its app + child subtree.
const adminRegion = { capability: 'manage_options', app: 'core:settings' };
const openRegion = { app: 'core:posts' }; // no capability → always renders
ok(
	'region gating: admin-only region drops for subscriber',
	shouldRenderRegion( adminRegion, ROLE_CAPS.subscriber ) === false
);
ok(
	'region gating: admin-only region renders for administrator',
	shouldRenderRegion( adminRegion, ROLE_CAPS.administrator ) === true
);
ok(
	'region gating: capability-less region renders for every role',
	shouldRenderRegion( openRegion, ROLE_CAPS.subscriber ) === true &&
		shouldRenderRegion( openRegion, ROLE_CAPS.administrator ) === true
);
ok(
	'region gating: declared cap absent from map renders (optimistic)',
	shouldRenderRegion( adminRegion, { read: true } ) === true
);

// ── summary ─────────────────────────────────────────────────────────────
console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
