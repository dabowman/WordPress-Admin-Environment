#!/usr/bin/env node
/**
 * Tests for `buildCommandsArray` — the pure compile step extracted from
 * `BindingsConsumer` so the document keydown handler can rebind only on
 * real shortcut changes (item 6 of the PR-49 pre-merge feedback plan).
 *
 * A full JSDOM mount of `BindingsConsumer` would need to stub @wordpress/
 * element + react + the kernel context; the pragmatic move is to test the
 * pure function and infer `useMemo` dep stability from the existence of
 * `[ config?.commands, config?.bindings ]` deps in the component. The
 * runtime tests are pure-ESM-leaning by convention.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

// BindingsConsumer.js imports @wordpress/element (a runtime external).
// Importing the file directly would fail on the bare-specifier import.
// Re-export the pure helper via dynamic-import after shimming Node's
// resolver — simplest path is to read the source + extract the named
// export through a Function constructor that stubs the bare imports.
// In practice the helper is small enough that we reimplement-via-source.
//
// Cleaner alternative: split `buildCommandsArray` into its own .mjs file.
// We accept the slight duplication for now — the function is 8 lines.

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
// Static-analysis guards on the source — these are the structural
// guarantees the runtime relies on. If they regress, the keydown
// handler is back to rebinding every render.
ok(
	'exports buildCommandsArray helper at module scope',
	/export function buildCommandsArray\s*\(/.test( source )
);
ok(
	'BindingsConsumer wraps the compile in useMemo',
	/const\s+compiled\s*=\s*useMemo\s*\(/.test( source )
);
ok(
	'useMemo deps key on nested commands+bindings refs (not outer config)',
	/\[\s*config\?\.commands\s*,\s*config\?\.bindings\s*\]/.test( source )
);
ok(
	'useEffect deps on memoized compiled array',
	/}, \[ compiled \]\s*\);/.test( source )
);

// -------------------------------------------------------------------- 2
// Functional behavior. Import the helper via a freshly-evaluated module
// to isolate parseShortcut + the WP element shim. We Function-construct
// the helper from its source slice — parseShortcut is the only external
// dep, and we stub it with a deterministic implementation.
const helperMatch = source.match(
	/export function buildCommandsArray\([^)]*\)\s*\{[\s\S]*?\n\}/
);
ok( 'helper extracts from source', helperMatch !== null );

const buildCommandsArray = new Function(
	'parseShortcut',
	`${ helperMatch[ 0 ].replace( /export\s+/, '' ) }; return buildCommandsArray;`
)(
	// Stub: parseShortcut returns truthy for non-empty strings, null otherwise.
	( s ) => ( typeof s === 'string' && s.length > 0 ? () => true : null )
);

// -------------------------------------------------------------------- 3
// Empty / nullish inputs.
ok( 'null input → empty array', buildCommandsArray( null ).length === 0 );
ok( 'undefined input → empty array', buildCommandsArray( undefined ).length === 0 );
ok( 'empty array → empty array', buildCommandsArray( [] ).length === 0 );
ok( 'non-array → empty array', buildCommandsArray( 'nope' ).length === 0 );

// -------------------------------------------------------------------- 4
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

// -------------------------------------------------------------------- 5
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
