#!/usr/bin/env node
/**
 * Tests for SEQUENCE (chord-prefix) keyboard shortcuts — the `g p` / `g m`
 * vim-style bindings the schema documents
 * (`workspace.json#/$defs/command/properties/shortcut`) and `wp-admin-default`
 * ships. Before this feature, `parseShortcut` split only on `+`, compiled
 * `"g p"` into a matcher that compared `event.key === "g p"`, and the sequence
 * never fired.
 *
 * Three layers:
 *   1. `parseShortcut` rejects any whitespace-bearing string (a sequence that
 *      reached the single-chord parser) → `null`.
 *   2. `buildCommandsArray` compiles a sequence into an ordered `steps` array
 *      and a chord into a single `match` predicate.
 *   3. `createSequenceTracker` — the pure, timer-free state machine: arm on
 *      the prefix key, advance step-by-step, complete on the final key, reset
 *      on a non-matching key, ignore lone modifiers, share prefixes across
 *      sequences, and let completion win over arming a new sequence.
 *
 * Run: `node tests/runtime/sequence-shortcuts.test.mjs`
 * (chained from `npm run test:runtime`)
 */
import { parseShortcut } from '../../src/runtime/bindings/parseShortcut.mjs';
import { buildCommandsArray } from '../../src/runtime/bindings/buildCommandsArray.mjs';
import {
	createSequenceTracker,
	isLoneModifierEvent,
} from '../../src/runtime/bindings/sequenceTracker.mjs';

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

function evt( overrides = {} ) {
	return {
		key: '',
		shiftKey: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		...overrides,
	};
}

// ── 1. parseShortcut rejects sequences (whitespace) ─────────────────────────
console.log( '\n— parseShortcut: whitespace → null —\n' );
ok( '"g p" returns null (not a chord)', parseShortcut( 'g p' ) === null );
ok( '"g  p" (double space) returns null', parseShortcut( 'g  p' ) === null );
ok( 'leading space returns null', parseShortcut( ' K' ) === null );
ok( 'trailing space returns null', parseShortcut( 'K ' ) === null );
ok(
	'single chord still parses',
	typeof parseShortcut( 'Mod+K', { mac: true } ) === 'function'
);

// ── 2. buildCommandsArray compiles sequences ────────────────────────────────
console.log( '\n— buildCommandsArray: sequence compilation —\n' );
{
	const out = buildCommandsArray(
		[
			{ shortcut: 'Mod+K', invoke: 'core:command-palette' },
			{ shortcut: 'g p', navigate: '/posts' },
			{ shortcut: 'g m', navigate: '/media' },
		],
		{ mac: false }
	);
	ok( 'three entries compiled', out.length === 3 );

	const chord = out[ 0 ];
	ok(
		'chord entry has a match predicate + null steps',
		typeof chord.match === 'function' && chord.steps === null
	);

	const seq = out[ 1 ];
	ok(
		'sequence entry has null match + 2-step array',
		seq.match === null &&
			Array.isArray( seq.steps ) &&
			seq.steps.length === 2
	);
	ok(
		'sequence step 0 matches "g", not "p"',
		seq.steps[ 0 ]( evt( { key: 'g' } ) ) === true &&
			seq.steps[ 0 ]( evt( { key: 'p' } ) ) === false
	);
	ok(
		'sequence step 1 matches "p", not "g"',
		seq.steps[ 1 ]( evt( { key: 'p' } ) ) === true &&
			seq.steps[ 1 ]( evt( { key: 'g' } ) ) === false
	);
	ok( 'sequence carries its navigate target', seq.navigate === '/posts' );
}

console.log( '\n— buildCommandsArray: malformed sequences dropped —\n' );
{
	// A sequence whose second step is unparseable (`Mod+` → null step) is
	// dropped, not compiled into a partial matcher.
	const out = buildCommandsArray(
		[
			{ shortcut: 'g Mod+', navigate: '/x' },
			{ shortcut: 'g p', navigate: '/posts' },
		],
		{ mac: false }
	);
	ok( 'drops the sequence with an unparseable step', out.length === 1 );
	ok( 'keeps the valid sequence', out[ 0 ].navigate === '/posts' );
}

// ── 3. sequenceTracker state machine ────────────────────────────────────────
console.log( '\n— sequenceTracker: arm → advance → complete —\n' );

function seqEntry( keys, tag ) {
	return {
		tag,
		steps: keys.map(
			( k ) => ( event ) => ( event.key || '' ).toLowerCase() === k
		),
		navigate: '/' + tag,
	};
}

{
	const gp = seqEntry( [ 'g', 'p' ], 'posts' );
	const gm = seqEntry( [ 'g', 'm' ], 'media' );
	const tracker = createSequenceTracker( [ gp, gm ] );

	const r1 = tracker.push( evt( { key: 'g' } ) );
	ok(
		'press g → nothing completed, two candidates armed (shared prefix)',
		r1.completed === null && r1.armed === 2 && tracker.isArmed()
	);

	const r2 = tracker.push( evt( { key: 'p' } ) );
	ok(
		'press p → completes the g-p entry',
		r2.completed === gp && ! tracker.isArmed()
	);
}

console.log( '\n— sequenceTracker: wrong second key resets —\n' );
{
	const gp = seqEntry( [ 'g', 'p' ], 'posts' );
	const tracker = createSequenceTracker( [ gp ] );
	tracker.push( evt( { key: 'g' } ) );
	const r = tracker.push( evt( { key: 'x' } ) );
	ok(
		'press g then x → nothing completed, sequence disarmed',
		r.completed === null && ! tracker.isArmed()
	);
	// A fresh g re-arms cleanly.
	const r2 = tracker.push( evt( { key: 'g' } ) );
	ok( 'a later g re-arms', r2.armed === 1 && tracker.isArmed() );
}

console.log( '\n— sequenceTracker: lone modifiers do not disturb —\n' );
{
	const gp = seqEntry( [ 'g', 'p' ], 'posts' );
	const tracker = createSequenceTracker( [ gp ] );
	tracker.push( evt( { key: 'g' } ) );
	const rMod = tracker.push( evt( { key: 'Shift', shiftKey: true } ) );
	ok(
		'a lone Shift between g and p keeps the sequence armed',
		rMod.completed === null && tracker.isArmed()
	);
	const r = tracker.push( evt( { key: 'p' } ) );
	ok( 'p still completes after the stray Shift', r.completed === gp );

	ok( 'isLoneModifierEvent detects Shift', isLoneModifierEvent( evt( { key: 'Shift' } ) ) );
	ok( 'isLoneModifierEvent detects Meta', isLoneModifierEvent( evt( { key: 'Meta' } ) ) );
	ok(
		'isLoneModifierEvent false for a letter',
		! isLoneModifierEvent( evt( { key: 'g' } ) )
	);
}

console.log( '\n— sequenceTracker: completion wins over re-arm —\n' );
{
	// `g p` in progress; `p q` also declared. Pressing p completes g-p and does
	// NOT leave p-q armed (completion clears the tracker).
	const gp = seqEntry( [ 'g', 'p' ], 'posts' );
	const pq = seqEntry( [ 'p', 'q' ], 'pq' );
	const tracker = createSequenceTracker( [ gp, pq ] );
	tracker.push( evt( { key: 'g' } ) );
	const r = tracker.push( evt( { key: 'p' } ) );
	ok(
		'p completes g-p and disarms (p-q not left armed)',
		r.completed === gp && ! tracker.isArmed()
	);
}

console.log( '\n— sequenceTracker: reset() + non-array input —\n' );
{
	const gp = seqEntry( [ 'g', 'p' ], 'posts' );
	const tracker = createSequenceTracker( [ gp ] );
	tracker.push( evt( { key: 'g' } ) );
	tracker.reset();
	ok( 'reset() disarms', ! tracker.isArmed() );

	const empty = createSequenceTracker( null );
	ok(
		'null input → tracker never arms',
		empty.push( evt( { key: 'g' } ) ).armed === 0 && ! empty.isArmed()
	);

	// A chord-only entry (steps missing) is ignored by the tracker.
	const chordOnly = createSequenceTracker( [ { match: () => true } ] );
	ok(
		'chord-only entry ignored by tracker',
		chordOnly.push( evt( { key: 'g' } ) ).armed === 0
	);
}

// ── summary ─────────────────────────────────────────────────────────────────
console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
