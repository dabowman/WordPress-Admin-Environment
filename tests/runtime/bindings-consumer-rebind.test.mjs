#!/usr/bin/env node
/**
 * Tests for `buildCommandsArray` — the pure compile step extracted from
 * `BindingsConsumer` so the document keydown handler can rebind only on
 * real shortcut changes (item 6 of the PR-49 pre-merge feedback plan).
 *
 * Two layers of coverage live in this file:
 *
 * 1. **Functional behavior** on the extracted helper. Imported directly
 *    from `src/runtime/bindings/buildCommandsArray.mjs` — the helper
 *    sits in its own `.mjs` sibling per the repo's pure-ESM convention
 *    (`resolveRegion.mjs`, `matchRoute.mjs`, `lruCache.mjs`). No source
 *    extraction or function-constructor stubbing needed.
 *
 * 2. **Static-analysis tripwires** on `BindingsConsumer.js` itself —
 *    grep for the specific shape of the perf fix (`useMemo` wrapper +
 *    nested-ref deps + memoized-compiled effect deps). These are
 *    regression tripwires for *the specific shape* of the fix, not
 *    behavioral guarantees. They will need updating on any deliberate
 *    var-name refactor (e.g. renaming `compiled` to `entries`); that's
 *    an accepted brittleness in exchange for catching a future refactor
 *    that legitimately reverts to the rebind-every-render shape.
 *
 * What this file does NOT cover (deferred until a JSDOM scaffold lands
 * — issue #30 tracks):
 *
 *   - The `useEffect` cleanup function actually fires
 *     (`document.removeEventListener( 'keydown', onKey )`).
 *   - `useMemo` returns a referentially-stable value across renders
 *     with unchanged deps (semantic React-runtime guarantee, not a
 *     source-shape guarantee).
 *   - The interaction between `compiled` referential stability and
 *     the `useEffect` dep array — i.e. that the keydown handler is
 *     actually rebound only when the deps array changes.
 *
 * All three gaps require mounting `<BindingsConsumer>` inside a React
 * tree + observing `document.addEventListener` call counts. A
 * follow-up PR should add JSDOM mount coverage when the scaffold lands.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { buildCommandsArray } = await import(
	resolve( projectRoot, 'src/runtime/bindings/buildCommandsArray.mjs' )
);

const sourcePath = resolve( projectRoot, 'src/runtime/bindings/BindingsConsumer.js' );
const source = readFileSync( sourcePath, 'utf8' );

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

// -------------------------------------------------------------------- 1
// Static-analysis tripwires on the BindingsConsumer source — these are
// the structural guarantees the runtime relies on. If they regress, the
// keydown handler is back to rebinding every render. These are NOT
// behavioral assertions — see the file header for the limitation.
ok(
	'BindingsConsumer re-exports buildCommandsArray helper',
	/export \{ buildCommandsArray \};/.test( source )
);
ok(
	'BindingsConsumer wraps the compile in useMemo',
	/const\s+compiled\s*=\s*useMemo\s*\(/.test( source )
);
ok(
	'useMemo deps key on the nested commands ref (not outer config)',
	/\[\s*config\?\.commands\s*\]/.test( source )
);
ok(
	'useEffect deps on memoized compiled array',
	/}, \[ compiled \]\s*\);/.test( source )
);

// -------------------------------------------------------------------- 2
// Empty / nullish / non-array inputs.
ok( 'null input → empty array', buildCommandsArray( null ).length === 0 );
ok( 'undefined input → empty array', buildCommandsArray( undefined ).length === 0 );
ok( 'empty array → empty array', buildCommandsArray( [] ).length === 0 );
ok( 'non-array → empty array', buildCommandsArray( 'nope' ).length === 0 );

// -------------------------------------------------------------------- 3
// Filter drops malformed entries.
const mixed = [
	{ shortcut: 'Mod+K', invoke: 'core:command-palette' },
	{ shortcut: '', invoke: 'core:no-shortcut' },             // no shortcut
	{ shortcut: 'Mod+J' },                                      // no invoke/navigate
	{ shortcut: 'Mod+P', navigate: '/posts' },
];
const mixedOut = buildCommandsArray( mixed );
ok( 'drops entries without parseable shortcut or invoke/navigate',
	mixedOut.length === 2 );

ok( 'invoke entries preserved',
	mixedOut[ 0 ].invoke === 'core:command-palette' && mixedOut[ 0 ].navigate === null );

ok( 'navigate entries preserved',
	mixedOut[ 1 ].navigate === '/posts' && mixedOut[ 1 ].invoke === null );

// -------------------------------------------------------------------- 4
// Determinism — identical inputs produce equal outputs.
const a = [ { shortcut: 'Mod+K', invoke: 'core:command-palette' } ];
const b = [ { shortcut: 'Mod+K', invoke: 'core:command-palette' } ];
const outA = buildCommandsArray( a );
const outB = buildCommandsArray( b );
ok(
	'same input shape → same length + same fields',
	outA.length === outB.length &&
		outA[ 0 ].invoke === outB[ 0 ].invoke &&
		outA[ 0 ].navigate === outB[ 0 ].navigate
);

// ── Summary ────────────────────────────────────────────────────────
console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
