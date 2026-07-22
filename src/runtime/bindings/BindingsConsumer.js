import { useEffect, useMemo } from '@wordpress/element';

import { useKernel } from '../kernel-context';
import { buildCommandsArray } from './buildCommandsArray.mjs';
import { createSequenceTracker } from './sequenceTracker.mjs';
import { trigger } from './triggerStore.mjs';
import { navigate } from '../routing/router';

// `buildCommandsArray` lives in its own `.mjs` sibling so the rebind test
// can import it directly (`tests/runtime/bindings-consumer-rebind.test.mjs`).
// Keeping it pure-ESM + module-scoped matches the repo convention for
// runtime helpers (`resolveRegion.mjs`, `matchRoute.mjs`, `lruCache.mjs`).
export { buildCommandsArray };

/**
 * Inter-key window for a SEQUENCE shortcut (`g p`). After the prefix key the
 * next key must arrive within this many milliseconds or the pending sequence
 * resets. Matches the vim-like default users expect.
 */
const SEQUENCE_TIMEOUT_MS = 1000;

/**
 * Reads the resolved workspace.json `commands` block and registers each
 * shortcut against the document. When a binding fires:
 *   - `invoke` commands look up the app id in the trigger store and
 *     call its open handler.
 *   - `navigate` commands push the target path onto the URL bar.
 *
 * Two shortcut shapes are supported (see `buildCommandsArray`):
 *   - Chord    (`Mod+K`)  — a single keystroke, matched directly.
 *   - Sequence (`g p`)    — an ordered run of keys, tracked across keydowns
 *                           by `createSequenceTracker` with a
 *                           `SEQUENCE_TIMEOUT_MS` inactivity reset. The prefix
 *                           key is not swallowed (vim convention); only the
 *                           completing key calls `preventDefault`.
 *
 * Spec §8 precedence: app shortcuts win when focus is inside the app's
 * DOM. We approximate this by skipping the binding when the active
 * element is inside an `<input>`, `<textarea>`, or `[contenteditable]`
 * — the binding fires for chrome-level focus only (this also keeps a
 * sequence like `g p` from firing while the user types "gp" in a field).
 *
 * Mounted by the kernel root after RouterProvider so it has access to
 * the resolved config. No UI; returns null.
 */
export function BindingsConsumer() {
	const { config } = useKernel();
	// Memoize the compiled command table on the underlying nested ref so
	// the keydown handler binds once per real shortcut change, not once
	// per router event. The outer config object ref churns on every
	// resolved-tree update; `config.commands` is stable across renders
	// that didn't touch it.
	const compiled = useMemo( () => {
		const source = Array.isArray( config?.commands )
			? config.commands
			: null;
		return buildCommandsArray( source );
	}, [ config?.commands ] );

	useEffect( () => {
		if ( compiled.length === 0 || typeof window === 'undefined' ) {
			return undefined;
		}

		const chordEntries = compiled.filter(
			( e ) => typeof e.match === 'function'
		);
		const sequenceEntries = compiled.filter( ( e ) =>
			Array.isArray( e.steps )
		);
		const tracker = createSequenceTracker( sequenceEntries );

		let sequenceTimer = null;
		const clearSequenceTimer = () => {
			if ( sequenceTimer !== null ) {
				window.clearTimeout( sequenceTimer );
				sequenceTimer = null;
			}
		};

		// Fire an entry's action: `invoke` first (trigger store), then
		// `navigate` fallback — the same precedence the palette uses.
		const dispatch = ( entry ) => {
			let handled = false;
			if ( entry.invoke ) {
				handled = trigger( entry.invoke );
			}
			if ( ! handled && entry.navigate ) {
				navigate( entry.navigate );
				handled = true;
			}
			return handled;
		};

		const onKey = ( event ) => {
			if ( shouldDeferToFocusedApp( event ) ) {
				return;
			}

			// Chords win first — a single keystroke resolves immediately and
			// resets any pending sequence.
			for ( const entry of chordEntries ) {
				if ( entry.match( event ) ) {
					const handled = dispatch( entry );
					if ( handled ) {
						event.preventDefault();
						event.stopPropagation();
					}
					clearSequenceTimer();
					tracker.reset();
					return;
				}
			}

			if ( sequenceEntries.length === 0 ) {
				return;
			}

			// Advance / arm sequences with this key.
			const { completed } = tracker.push( event );
			if ( completed ) {
				clearSequenceTimer();
				const handled = dispatch( completed );
				if ( handled ) {
					event.preventDefault();
					event.stopPropagation();
				}
				return;
			}

			clearSequenceTimer();
			if ( tracker.isArmed() ) {
				sequenceTimer = window.setTimeout( () => {
					tracker.reset();
					sequenceTimer = null;
				}, SEQUENCE_TIMEOUT_MS );
			}
		};

		document.addEventListener( 'keydown', onKey );
		return () => {
			clearSequenceTimer();
			document.removeEventListener( 'keydown', onKey );
		};
	}, [ compiled ] );

	return null;
}

function shouldDeferToFocusedApp( event ) {
	const target = event.target;
	if ( ! target || ! target.tagName ) {
		return false;
	}
	const tag = target.tagName;
	if ( tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ) {
		return true;
	}
	if ( target.isContentEditable ) {
		return true;
	}
	return false;
}
