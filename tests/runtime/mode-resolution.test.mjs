#!/usr/bin/env node
/**
 * resolveMode — v3 mode resolver.
 *
 * Mirrors the PHP `WP_Admin_Shell_Modes::resolve_engine_modes()` + per-
 * screen merge on the JS side. Tests cover:
 *   - no extends chain (passthrough)
 *   - single-level extends
 *   - 3-deep extends chain
 *   - circular-ref detection (depth limit + cycle)
 *   - screen-level `regions` override deep-merges over engine mode
 *   - modal mode short-circuits (regions: null)
 *   - missing mode falls back to default
 *   - plugin-contributed modes via filter-shaped catalog
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { resolveMode, readRegionState, __test } = await import(
	resolve( projectRoot, 'src/runtime/modes/resolveMode.mjs' )
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
	ok( label, a === e, a === e ? '' : `expected ${ e }, got ${ a }` );
}

// -------------------------------------------------------------------- 1
// No extends chain — mode passes through.
const simpleCatalog = {
	default: { label: 'Default', regions: { sidebar: { hidden: false } } },
	focus:   { label: 'Focus',   regions: { sidebar: { hidden: true } } },
};
const r1 = resolveMode(
	'edit',
	simpleCatalog,
	{ edit: { mode: 'focus', path: '/edit' } }
);
eq( 'focus mode resolves region states verbatim', r1.regions, { sidebar: { hidden: true } } );
ok( 'focus mode is not modal', r1.modal === false );
eq( 'focus mode reports modeId', r1.modeId, 'focus' );

// -------------------------------------------------------------------- 2
// Single-level extends.
const oneLevel = {
	default:     { label: 'Default', regions: { sidebar: { hidden: false }, toolbar: { compact: false } } },
	'focus-base': {
		label: 'Focus Base',
		regions: { sidebar: { hidden: true } },
	},
	'focus-ext':  {
		label: 'Focus Ext',
		extends: 'focus-base',
		regions: { toolbar: { compact: true } },
	},
};
const r2 = resolveMode( 's', oneLevel, { s: { mode: 'focus-ext', path: '/s' } } );
eq(
	'single-level extends merges parent + child',
	r2.regions,
	{ sidebar: { hidden: true }, toolbar: { compact: true } }
);

// -------------------------------------------------------------------- 3
// 3-deep extends chain.
const threeDeep = {
	a: { label: 'A', regions: { x: { hidden: false }, y: { compact: false } } },
	b: { label: 'B', extends: 'a', regions: { x: { hidden: true } } },
	c: { label: 'C', extends: 'b', regions: { y: { compact: true } } },
	d: { label: 'D', extends: 'c', regions: { z: { minimal: true } } },
};
const r3 = resolveMode( 's', threeDeep, { s: { mode: 'd', path: '/s' } } );
eq(
	'3-deep extends merges all ancestors',
	r3.regions,
	{ x: { hidden: true }, y: { compact: true }, z: { minimal: true } }
);

// -------------------------------------------------------------------- 4
// Per-field override deep-merges at the region-state level.
const layeredFields = {
	a: { label: 'A', regions: { sidebar: { hidden: false, compact: false, foo: 'bar' } } },
	b: { label: 'B', extends: 'a', regions: { sidebar: { hidden: true } } },
};
const r4 = resolveMode( 's', layeredFields, { s: { mode: 'b', path: '/s' } } );
eq(
	'child overrides one key, inherits others',
	r4.regions,
	{ sidebar: { hidden: true, compact: false, foo: 'bar' } }
);

// -------------------------------------------------------------------- 5
// Circular-ref detection: self-reference.
const selfRef = {
	loopy: { label: 'Loopy', extends: 'loopy', regions: {} },
};
const r5 = resolveMode( 's', selfRef, { s: { mode: 'loopy', path: '/s' } } );
ok(
	'self-extends cycle is detected and produces empty regions',
	r5.regions && typeof r5.regions === 'object' && Object.keys( r5.regions ).length === 0
);

// -------------------------------------------------------------------- 6
// Circular-ref detection: mutual cycle.
const mutualRef = {
	a: { label: 'A', extends: 'b', regions: { x: { hidden: true } } },
	b: { label: 'B', extends: 'a', regions: { y: { hidden: true } } },
};
const r6 = resolveMode( 's', mutualRef, { s: { mode: 'a', path: '/s' } } );
ok(
	'mutual extends cycle resolves without infinite recursion',
	r6 && typeof r6.regions === 'object'
);

// -------------------------------------------------------------------- 7
// Depth-limit guard at >10 deep chain. Build a 12-deep chain.
const deepCatalog = {};
for ( let i = 0; i < 12; i++ ) {
	deepCatalog[ `m${ i }` ] = {
		label: `M${ i }`,
		extends: i === 0 ? undefined : `m${ i - 1 }`,
		regions: { ['r' + i]: { hidden: true } },
	};
}
const r7 = resolveMode( 's', deepCatalog, { s: { mode: 'm11', path: '/s' } } );
ok(
	'12-deep extends chain triggers depth guard without crash',
	r7 && typeof r7.regions === 'object'
);

// -------------------------------------------------------------------- 8
// Screen-level `regions` override deep-merges over engine mode.
const baseCatalog = {
	default: { label: 'Default', regions: {} },
	focus:   {
		label: 'Focus',
		regions: { sidebar: { hidden: true }, preview: { hidden: true } },
	},
};
const r8 = resolveMode(
	'edit',
	baseCatalog,
	{
		edit: {
			mode: 'focus',
			path: '/edit',
			regions: { preview: { hidden: false } },
		},
	}
);
eq(
	'screen-level override deep-merges per-field',
	r8.regions,
	{ sidebar: { hidden: true }, preview: { hidden: false } }
);

// Screen adds a region the mode doesn't mention.
const r9 = resolveMode(
	'edit',
	baseCatalog,
	{
		edit: {
			mode: 'focus',
			path: '/edit',
			regions: { toolbar: { compact: true } },
		},
	}
);
eq(
	'screen-only region key appends to merged map',
	r9.regions,
	{ sidebar: { hidden: true }, preview: { hidden: true }, toolbar: { compact: true } }
);

// -------------------------------------------------------------------- 9
// Modal mode short-circuits.
const modalCatalog = {
	default: { label: 'Default', regions: {} },
	modal:   { label: 'Modal', modal: true },
};
const r10 = resolveMode(
	'palette',
	modalCatalog,
	{ palette: { mode: 'modal', path: '/palette' } }
);
ok( 'modal mode returns modal: true', r10.modal === true );
ok( 'modal mode returns regions: null', r10.regions === null );

// ------------------------------------------------------------------- 10
// Missing screen → default mode's regions (the hook layer handles
// "no URL match" separately; resolveMode itself always returns a usable
// region map for the requested screen id).
const r11 = resolveMode( 'no-such-screen', simpleCatalog, { other: { path: '/x' } } );
eq( 'unknown screen → default mode regions', r11.regions, { sidebar: { hidden: false } } );
eq( 'unknown screen → modeId default', r11.modeId, 'default' );

// Missing mode → falls back to default.
const r12 = resolveMode(
	'edit',
	simpleCatalog,
	{ edit: { mode: 'nonexistent', path: '/edit' } }
);
eq( 'unknown mode falls back to default mode regions', r12.regions, { sidebar: { hidden: false } } );

// ------------------------------------------------------------------- 11
// Plugin-contributed mode (e.g. kiosk) — same shape as a regular entry
// in the catalog after the filter runs.
const pluginCatalog = {
	default:  { label: 'Default', regions: {} },
	takeover: { label: 'Takeover', regions: { sidebar: { hidden: true }, toolbar: { hidden: true } } },
	kiosk:    {
		label: 'Kiosk',
		extends: 'takeover',
		regions: { 'site-hub': { hidden: true } },
	},
};
const r13 = resolveMode( 's', pluginCatalog, { s: { mode: 'kiosk', path: '/s' } } );
eq(
	'plugin kiosk mode inherits takeover + adds site-hub hidden',
	r13.regions,
	{ sidebar: { hidden: true }, toolbar: { hidden: true }, 'site-hub': { hidden: true } }
);

// ------------------------------------------------------------------- 12
// readRegionState returns null for missing region; object when present.
ok(
	'readRegionState returns null when region not listed',
	readRegionState( 'no-such', { regions: { sidebar: { hidden: true } } } ) === null
);
eq(
	'readRegionState returns the state object when present',
	readRegionState( 'sidebar', { regions: { sidebar: { hidden: true } } } ),
	{ hidden: true }
);
ok(
	'readRegionState returns null when resolved is modal',
	readRegionState( 'sidebar', { modal: true, regions: null } ) === null
);

// ------------------------------------------------------------------- 13
// Engine catalog missing default still works.
ok(
	'missing engineModes returns empty map gracefully',
	resolveMode( 's', null, { s: { mode: 'focus', path: '/s' } } ).regions !== undefined
);
ok(
	'missing screens returns empty map gracefully',
	resolveMode( 's', simpleCatalog, null ).regions !== undefined
);

// ------------------------------------------------------------------- 14
// deepMerge sanity.
const dm = __test.deepMerge( { a: { x: 1, y: 2 } }, { a: { y: 3, z: 4 } } );
eq( 'deepMerge object branches recurse', dm, { a: { x: 1, y: 3, z: 4 } } );

const dm2 = __test.deepMerge( { a: 1 }, { a: { nested: true } } );
eq( 'deepMerge replaces scalar with object', dm2, { a: { nested: true } } );

// ------------------------------------------------------------------- 15
// Default mode (no screen.mode) used when screen has no mode declared.
const r14 = resolveMode( 's', simpleCatalog, { s: { path: '/s' } } );
eq( 'screen with no mode field uses default', r14.regions, { sidebar: { hidden: false } } );

// ------------------------------------------------------------------- 16
// Boolean `false` survives deep-merge — region rules require explicit
// `false` to override an inherited `true`.
const explicitFalse = {
	a: { label: 'A', regions: { sidebar: { hidden: true } } },
	b: { label: 'B', extends: 'a', regions: { sidebar: { hidden: false } } },
};
const r15 = resolveMode( 's', explicitFalse, { s: { mode: 'b', path: '/s' } } );
eq( 'explicit false in child wins over inherited true', r15.regions, { sidebar: { hidden: false } } );

// ------------------------------------------------------------------- 17
// `extends` field is stripped from the resolved doc.
const stripCatalog = {
	default:  { label: 'Default', regions: {} },
	focus:    { label: 'Focus', extends: 'default', regions: { sidebar: { hidden: true } } },
};
const r16 = resolveMode( 's', stripCatalog, { s: { mode: 'focus', path: '/s' } } );
ok( 'resolved doc has no `extends` field leak', r16.extends === undefined );

console.log( `\nTOTAL: ${ pass } passed, ${ fail } failed of ${ pass + fail }\n` );
process.exit( fail > 0 ? 1 : 0 );
