import { parseShortcut } from './parseShortcut.mjs';

/**
 * Compile a `commands[]` / `bindings[]` array into the entry shape the
 * `BindingsConsumer` keydown handler iterates. Two entry flavors:
 *
 *   - Chord    → `{ match: (event) => boolean, steps: null, invoke, navigate }`
 *   - Sequence → `{ match: null, steps: Array<(event)=>boolean>, invoke, navigate }`
 *
 * A shortcut string with internal whitespace (`g p`, `g m`) is a vim-style
 * SEQUENCE: it's split into per-chord steps, each parsed by `parseShortcut`,
 * and tracked at runtime by `sequenceTracker.mjs`. A plain chord compiles to a
 * single-event `match` predicate.
 *
 * Skips entries without a parseable shortcut (or a fully-parseable sequence)
 * or without at least one of invoke/navigate. Returns `[]` for empty, nullish,
 * or non-array inputs so the caller can use referential identity of the result
 * for `useEffect` dep stability.
 *
 * Pure and side-effect-free — lives in its own `.mjs` module so the
 * rebind + sequence tests can import it directly without standing up a React
 * tree (matches the repo convention for pure-JS runtime modules:
 * `resolveRegion.mjs`, `matchRoute.mjs`, `lruCache.mjs`).
 *
 * @param {Array<{shortcut?: string, invoke?: string, navigate?: string}>|null|undefined} commands  Authored command/binding entries from the resolved config.
 * @param {Object}                                                                        [options] Passed through to `parseShortcut` (e.g. `{ mac }` in tests).
 * @return {Array<{match: Function|null, steps: Array<Function>|null, invoke: string|null, navigate: string|null}>} Compiled entries, empty array for unusable input.
 */
export function buildCommandsArray( commands, options = {} ) {
	if ( ! Array.isArray( commands ) || commands.length === 0 ) {
		return [];
	}
	return commands
		.map( ( entry ) => {
			const compiled = compileShortcut( entry?.shortcut, options );
			return {
				match: compiled.match,
				steps: compiled.steps,
				invoke: typeof entry?.invoke === 'string' ? entry.invoke : null,
				navigate:
					typeof entry?.navigate === 'string' ? entry.navigate : null,
			};
		} )
		.filter(
			( e ) =>
				( e.match ||
					( Array.isArray( e.steps ) && e.steps.length > 1 ) ) &&
				( e.invoke || e.navigate )
		);
}

/**
 * Compile one `shortcut` string into either a single chord `match` predicate
 * or an ordered `steps` array (sequence). Returns `{ match: null, steps: null }`
 * for unusable input (empty, or a sequence with an unparseable step).
 *
 * @param {*}      shortcut Authored shortcut string.
 * @param {Object} options  Passed through to `parseShortcut`.
 * @return {{ match: Function|null, steps: Array<Function>|null }} Compiled chord predicate XOR ordered sequence steps; both null when unusable.
 */
function compileShortcut( shortcut, options ) {
	if ( typeof shortcut !== 'string' || shortcut.trim() === '' ) {
		return { match: null, steps: null };
	}
	const trimmed = shortcut.trim();
	if ( /\s/.test( trimmed ) ) {
		// Sequence: split on whitespace, parse each part as a single chord.
		const steps = trimmed
			.split( /\s+/ )
			.map( ( part ) => parseShortcut( part, options ) );
		if ( steps.length < 2 || steps.some( ( s ) => s === null ) ) {
			return { match: null, steps: null };
		}
		return { match: null, steps };
	}
	return { match: parseShortcut( trimmed, options ), steps: null };
}
