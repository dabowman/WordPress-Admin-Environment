/**
 * Sequence (chord-prefix) shortcut tracker.
 *
 * The workspace.json `commands[].shortcut` grammar allows two shapes:
 *   - Chord:    `Mod+K`, `Shift+Mod+P` — a single keystroke with modifiers.
 *   - Sequence: `g p`, `g m` — an ordered run of chords separated by spaces
 *               (vim-style "press g, then p"). The schema documents these
 *               explicitly (`workspace.json#/$defs/command/properties/shortcut`).
 *
 * `parseShortcut` handles a single chord and returns a `(event) => boolean`
 * predicate. This module tracks the multi-keystroke state a sequence needs:
 * which sequences are partway through, and whether the current key completes
 * one. It is deliberately pure + timer-free — `<BindingsConsumer>` owns the
 * inactivity timeout and calls `reset()` when it lapses, so the whole state
 * machine is unit-testable on bare Node (see
 * `tests/runtime/sequence-shortcuts.test.mjs`).
 *
 * Pure ESM. No DOM, no React. Mirrors the repo convention for runtime
 * helpers (`parseShortcut.mjs`, `matchRoute.mjs`, `lruCache.mjs`).
 */

/**
 * Keys that are a modifier pressed on their own. A lone modifier keydown is
 * the natural precursor to a modified key (holding Shift before Shift+P), not
 * a distinct sequence step — advancing or resetting the sequence on it would
 * make `g Shift+P` impossible and let an idle Shift tap cancel a pending `g`.
 */
const LONE_MODIFIER_KEYS = new Set( [
	'Shift',
	'Control',
	'Alt',
	'AltGraph',
	'Meta',
	'CapsLock',
] );

/**
 * Whether a keyboard event is a modifier key pressed on its own.
 *
 * @param {Object} event Keyboard-event-like `{ key }`.
 * @return {boolean} True for a lone modifier keydown.
 */
export function isLoneModifierEvent( event ) {
	return !! event && LONE_MODIFIER_KEYS.has( event.key );
}

/**
 * Build a sequence tracker over the compiled sequence entries. Each entry is
 * `{ steps: Array<(event) => boolean>, ... }` where `steps` has length ≥ 2.
 * Chord entries (no `steps`) are ignored — the caller matches those directly.
 *
 * The returned tracker has no notion of time; the caller resets it when the
 * inter-key window lapses.
 *
 * @param {Array<{steps?: Array<Function>}>} sequenceEntries Compiled entries.
 * @return {{ push: Function, reset: Function, isArmed: Function }} Tracker.
 */
export function createSequenceTracker( sequenceEntries ) {
	const entries = Array.isArray( sequenceEntries )
		? sequenceEntries.filter(
				( e ) =>
					e &&
					Array.isArray( e.steps ) &&
					e.steps.length > 1 &&
					e.steps.every( ( s ) => typeof s === 'function' )
		  )
		: [];

	// In-progress candidates: each `{ entry, step }` awaits its `step`-th key.
	let armed = [];

	function reset() {
		armed = [];
	}

	function isArmed() {
		return armed.length > 0;
	}

	/**
	 * Feed one keydown to the tracker.
	 *
	 * Precedence: a key that completes an in-progress sequence wins over
	 * starting a fresh one, so `p` completing `g p` never simultaneously arms
	 * a `p q`. On completion the tracker clears itself and returns the
	 * completed entry; the caller fires it.
	 *
	 * @param {Object} event Keyboard-event-like.
	 * @return {{ completed: Object|null, armed: number }} Completed entry (or
	 *         null) plus the number of still-armed candidates.
	 */
	function push( event ) {
		// Lone modifier keydowns never advance or cancel a pending sequence.
		if ( isLoneModifierEvent( event ) ) {
			return { completed: null, armed: armed.length };
		}

		const next = [];
		let completed = null;
		for ( const candidate of armed ) {
			const { entry, step } = candidate;
			if ( entry.steps[ step ]( event ) ) {
				if ( step + 1 >= entry.steps.length ) {
					completed = entry;
					break;
				}
				next.push( { entry, step: step + 1 } );
			}
		}

		if ( completed ) {
			armed = [];
			return { completed, armed: 0 };
		}

		// Arm every sequence whose first step matches this key.
		for ( const entry of entries ) {
			if ( entry.steps[ 0 ]( event ) ) {
				next.push( { entry, step: 1 } );
			}
		}
		armed = next;
		return { completed: null, armed: armed.length };
	}

	return { push, reset, isArmed };
}
