#!/usr/bin/env node
/**
 * resolveRegion + shouldRenderRegion integration.
 *
 * Loads a real bundled shell admin.json + the matching engine manifest,
 * runs every region through `resolveRegion` and then the `shouldRenderRegion`
 * capability gate using a synthetic cap-map. Asserts which top-level
 * regions survive for the admin role (every region present) vs a
 * subscriber-style cap-map (regions tagged with admin-only caps drop).
 *
 * Catches integration drift: if `resolveRegion` ever drops the
 * `capability` field during template merge, or `shouldRenderRegion` ever
 * decides differently from the kernel's pre-merge fast path, this test
 * fails before the next refactor lands.
 *
 * Heavier than a unit, lighter than JSDOM — pure pipeline, no React.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { resolveRegion } = await import(
	resolve( projectRoot, 'src/runtime/regions/resolveRegion.mjs' )
);
const { shouldRenderRegion } = await import(
	resolve( projectRoot, 'src/runtime/capabilities/shouldRenderRegion.mjs' )
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

const engineManifest = JSON.parse(
	readFileSync(
		resolve(
			projectRoot,
			'src/runtime/engines/core-default/engine.json'
		),
		'utf8'
	)
);

// Synthetic v2-shape region tree exercising the resolveRegion + gate
// pipeline against real templates from core:default. Previously read
// from `shells/wp-admin-default.json` — that v2 shell was retired in
// Phase 3d.1 when every bundled shell moved to the v3 workspace/screens
// shape (the v3 default no longer carries a top-level `regions` block;
// regions get synthesized from the active engine's `defaultRegions`).
// The test still wants a v2-shape input to keep `resolveRegion`
// honest, so we inline the previous shell's minimal region set here.
const baseRegions = {
	sidebar: {
		template: 'core:sidebar',
		regions: {
			hub: { role: 'region', app: 'core:site-hub' },
			nav: { role: 'navigation', app: 'core:navigation' },
		},
	},
	content: {
		template: 'core:main',
		routing: { 'route-key': '_self' },
	},
	'command-palette': {
		template: 'core:overlay',
		app: 'core:command-palette',
		platform: {
			'core:triggerable': true,
			'core:trigger': { shortcut: 'Mod+K' },
		},
	},
	'notices-banner': { role: 'region', app: 'core:notices-banner' },
	'notices-snackbar': { role: 'region', app: 'core:notices-snackbar' },
};

// Synthetic gate: pin some regions to admin-only caps so the test
// observes a difference between admin and subscriber cap-maps.
const gatedRegions = JSON.parse( JSON.stringify( baseRegions ) );
gatedRegions.sidebar.capability = 'read';
gatedRegions[ 'notices-snackbar' ].capability = 'manage_options';
// 'content' has no capability — must always render.
// 'command-palette' has no capability — must always render.

const adminCaps = {
	read: true,
	manage_options: true,
	edit_theme_options: true,
};
const subscriberCaps = {
	read: true,
	manage_options: false,
	edit_theme_options: false,
};

console.log( '\n— pipeline: resolve, then gate per cap-map —' );

function runPipeline( regionsMap, capMap ) {
	const visible = [];
	for ( const [ id, region ] of Object.entries( regionsMap ) ) {
		if ( ! shouldRenderRegion( region, capMap ) ) {
			continue;
		}
		const resolved = resolveRegion( region, engineManifest );
		// Post-merge re-gate: spec §8 layer 1 is recursive, so a region
		// whose merged form picks up a deny from its template should also
		// drop. resolveRegion preserves `capability` from the declaration
		// — the gate runs once before merge by contract.
		if ( ! shouldRenderRegion( resolved, capMap ) ) {
			continue;
		}
		visible.push( { id, resolved } );
	}
	return visible;
}

const adminVisible = runPipeline( gatedRegions, adminCaps ).map( ( r ) => r.id );
const subscriberVisible = runPipeline( gatedRegions, subscriberCaps ).map(
	( r ) => r.id
);

ok(
	'admin sees every top-level region in the gated tree',
	adminVisible.length === Object.keys( gatedRegions ).length,
	`got ${ adminVisible.length } / ${ Object.keys( gatedRegions ).length }: ${ adminVisible.join( ', ' ) }`
);
ok(
	'admin sees notices-snackbar (manage_options=true)',
	adminVisible.includes( 'notices-snackbar' )
);
ok(
	'subscriber does NOT see notices-snackbar (manage_options=false)',
	! subscriberVisible.includes( 'notices-snackbar' )
);
ok(
	'subscriber DOES see sidebar (read=true)',
	subscriberVisible.includes( 'sidebar' )
);
ok(
	'subscriber sees content (no capability gate)',
	subscriberVisible.includes( 'content' )
);
ok(
	'subscriber sees command-palette (no capability gate)',
	subscriberVisible.includes( 'command-palette' )
);

console.log( '\n— pipeline: resolved regions carry template defaults through the gate —' );

const adminSidebar = runPipeline( gatedRegions, adminCaps ).find(
	( r ) => r.id === 'sidebar'
);
ok(
	'sidebar resolves to navigation role from core:sidebar template',
	adminSidebar?.resolved?.role === 'navigation'
);
ok(
	'sidebar resolved style picks up the template default-style block',
	!! adminSidebar?.resolved?.style &&
		typeof adminSidebar.resolved.style[ 'inline-size' ] === 'string'
);

console.log( '\n— pipeline: cap on a region with an unknown cap key is optimistic —' );

const optimisticRegions = {
	custom: { capability: 'imaginary_cap', role: 'region' },
};
const visibleOptimistic = runPipeline( optimisticRegions, adminCaps ).map(
	( r ) => r.id
);
ok(
	'unknown-cap region renders when capMap omits the key',
	visibleOptimistic.includes( 'custom' )
);

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
