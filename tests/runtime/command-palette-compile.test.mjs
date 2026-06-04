/**
 * Tests for `src/apps/command-palette/compileCommands.mjs` — the pure
 * compiler that produces palette descriptors from `config.commands[]`
 * + `config.screens[]`. Coverage exercises the branching the React
 * layer wires up but doesn't itself test:
 *
 *   - Label-required filter (commands without label are skipped).
 *   - `hasInvoke` / `hasNavigate` gate (must have one).
 *   - `compound` action when both fire.
 *   - Screens skipped for `hidden: true`, parameterized path,
 *     missing label, missing path.
 *   - Path dedup — screen sharing a path with a command's
 *     `navigate` is suppressed.
 *   - Name dedup — same emitted name across sources is suppressed
 *     (first-write wins; the unified `core/admin-workspace/palette-<id>`
 *     prefix makes this a real safety net).
 *   - Ordering — commands precede screens in the output.
 */

import { strict as assert } from 'node:assert';
import { compileCommands } from '../../src/apps/command-palette/compileCommands.mjs';

let passed = 0;
let failed = 0;
function ok( label, cond ) {
	if ( cond ) {
		console.log( `PASS  ${ label }` );
		passed++;
	} else {
		console.log( `FAIL  ${ label }` );
		failed++;
	}
}
function eq( label, actual, expected ) {
	try {
		assert.deepStrictEqual( actual, expected );
		console.log( `PASS  ${ label }` );
		passed++;
	} catch ( err ) {
		console.log( `FAIL  ${ label }` );
		console.log( '       actual:   ' + JSON.stringify( actual ) );
		console.log( '       expected: ' + JSON.stringify( expected ) );
		failed++;
	}
}

// Identity "Go to <target>" wrapper. Keeps tests deterministic +
// locale-agnostic.
const goToLabel = ( target ) => `Go to ${ target }`;

// ── 1. Commands path ───────────────────────────────────────────────

const r1 = compileCommands( {
	commands: [
		{
			id: 'core-command-palette',
			label: 'Open Command Palette',
			invoke: 'core:command-palette',
		},
		{
			id: 'navigate-posts-new',
			label: 'New Post',
			navigate: '/posts/new',
		},
		{
			id: 'both',
			label: 'Open then navigate',
			invoke: 'core:foo',
			navigate: '/foo',
		},
		{
			id: 'no-label-keyboard-only',
			invoke: 'core:bar',
		},
		{
			id: 'no-action',
			label: 'No action — should skip',
		},
		{
			id: '',
			label: 'No id — should skip',
			navigate: '/x',
		},
		'not-an-object',
		null,
	],
	screens: null,
	goToLabel,
} );
eq( 'commands path emits 3 descriptors', r1.length, 3 );
eq(
	'invoke-only command yields invoke action',
	r1[ 0 ].action,
	{ kind: 'invoke', appId: 'core:command-palette' }
);
eq(
	'navigate-only command yields navigate action',
	r1[ 1 ].action,
	{ kind: 'navigate', path: '/posts/new' }
);
eq(
	'both invoke + navigate yields compound action',
	r1[ 2 ].action,
	{ kind: 'compound', invoke: 'core:foo', navigate: '/foo' }
);
ok(
	'no-label command excluded (keyboard-only)',
	! r1.some( ( d ) => d.label === undefined || d.label === '' )
);
ok(
	'no-action command excluded',
	! r1.some( ( d ) => d.label === 'No action — should skip' )
);
ok(
	'empty-id command excluded',
	! r1.some( ( d ) => d.label === 'No id — should skip' )
);
ok(
	'name prefix unified — core/admin-workspace/palette-',
	r1.every( ( d ) => d.name.startsWith( 'core/admin-workspace/palette-' ) )
);

// ── 2. Screens path ────────────────────────────────────────────────

const r2 = compileCommands( {
	commands: null,
	screens: {
		posts: { label: 'Posts', path: '/posts', icon: 'post' },
		hidden: { label: 'Hidden', path: '/hidden', hidden: true },
		parameterized: { label: 'Edit', path: '/posts/{id}/edit' },
		wildcarded: { label: 'Wild', path: '/foo/*' },
		'no-path': { label: 'No path' },
		'no-label': { path: '/no-label' },
		'palette-only': { label: 'Palette only' },
		broken: null,
	},
	goToLabel,
} );
ok(
	'screens path emits at least one descriptor for valid screen',
	r2.some( ( d ) => d.name === 'core/admin-workspace/palette-posts' )
);
ok(
	'hidden screen excluded',
	! r2.some( ( d ) => d.action.path === '/hidden' )
);
ok(
	'parameterized path excluded',
	! r2.some( ( d ) => d.action.path === '/posts/{id}/edit' )
);
ok(
	'wildcard path excluded',
	! r2.some( ( d ) => d.action.path === '/foo/*' )
);
ok(
	'no-path screen excluded',
	! r2.some( ( d ) => d.name === 'core/admin-workspace/palette-no-path' )
);
ok(
	'no-label screen falls back to path-as-label',
	r2.some(
		( d ) => d.label === 'Go to /no-label'
	)
);
ok(
	'broken (null) screen does not throw',
	r2.every( ( d ) => d !== null )
);
const postsDesc = r2.find(
	( d ) => d.name === 'core/admin-workspace/palette-posts'
);
eq( 'screen label wraps with "Go to %s"', postsDesc.label, 'Go to Posts' );
eq(
	'screen action is navigate',
	postsDesc.action,
	{ kind: 'navigate', path: '/posts' }
);

// ── 3. Dedup — path collision between command and screen ───────────

const r3 = compileCommands( {
	commands: [
		{
			id: 'navigate-posts',
			label: 'Go to Posts',
			navigate: '/posts',
		},
	],
	screens: {
		posts: { label: 'Posts', path: '/posts' },
		media: { label: 'Media', path: '/media' },
	},
	goToLabel,
} );
const postsEntries = r3.filter( ( d ) => d.action.path === '/posts' );
eq(
	'path /posts surfaces exactly once (dedup by path)',
	postsEntries.length,
	1
);
eq(
	'duplicate-path entry is the command, not the synthesized screen',
	postsEntries[ 0 ].source,
	'command'
);
ok(
	'non-colliding screen still emitted',
	r3.some( ( d ) => d.action.path === '/media' )
);

// ── 4. Dedup — name collision across sources ───────────────────────

const r4 = compileCommands( {
	commands: [
		{
			id: 'sharedid',
			label: 'Command shared id',
			navigate: '/cmd',
		},
	],
	screens: {
		sharedid: { label: 'Screen shared id', path: '/screen' },
	},
	goToLabel,
} );
const sharedNames = r4.filter(
	( d ) => d.name === 'core/admin-workspace/palette-sharedid'
);
eq(
	'name collision suppressed — only one descriptor with shared name',
	sharedNames.length,
	1
);
eq(
	'first-write wins — command source kept',
	sharedNames[ 0 ].source,
	'command'
);

// ── 5. Ordering — commands first, then screens ─────────────────────

const r5 = compileCommands( {
	commands: [
		{ id: 'a', label: 'A', navigate: '/a' },
	],
	screens: {
		b: { label: 'B', path: '/b' },
		c: { label: 'C', path: '/c' },
	},
	goToLabel,
} );
eq( 'output preserves order: commands first', r5[ 0 ].source, 'command' );
eq( 'output preserves order: screens follow', r5[ 1 ].source, 'screen' );
eq( 'output preserves order: more screens follow', r5[ 2 ].source, 'screen' );

// ── 6. Empty inputs ────────────────────────────────────────────────

eq(
	'no inputs → empty list',
	compileCommands( { commands: null, screens: null, goToLabel } ),
	[]
);
eq(
	'empty arrays → empty list',
	compileCommands( { commands: [], screens: {}, goToLabel } ),
	[]
);

console.log( '' );
console.log( `TOTAL: ${ passed } passed, ${ failed } failed of ${ passed + failed }` );
if ( failed > 0 ) {
	process.exit( 1 );
}
