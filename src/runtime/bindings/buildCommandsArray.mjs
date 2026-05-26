import { parseShortcut } from './parseShortcut.mjs';

/**
 * Compile a `commands[]` / `bindings[]` array into the entry shape the
 * `BindingsConsumer` keydown handler iterates: `{ match, invoke, navigate }`.
 *
 * Skips entries without a parseable shortcut or without at least one of
 * invoke/navigate. Returns `[]` for empty, nullish, or non-array inputs
 * so the caller can use referential identity of the result for
 * `useEffect` dep stability.
 *
 * Pure and side-effect-free — lives in its own `.mjs` module so the
 * rebind test can import it directly without standing up a React tree
 * (matches the repo convention for pure-JS runtime modules:
 * `resolveRegion.mjs`, `matchRoute.mjs`, `lruCache.mjs`).
 *
 * @param {Array<{shortcut?: string, invoke?: string, navigate?: string}>|null|undefined} commands Authored command/binding entries from the resolved config.
 * @return {Array<{match: Function, invoke: string|null, navigate: string|null}>} Compiled entries, empty array for unusable input.
 */
export function buildCommandsArray( commands ) {
	if ( ! Array.isArray( commands ) || commands.length === 0 ) {
		return [];
	}
	return commands
		.map( ( entry ) => ( {
			match: parseShortcut( entry?.shortcut ),
			invoke: typeof entry?.invoke === 'string' ? entry.invoke : null,
			navigate:
				typeof entry?.navigate === 'string' ? entry.navigate : null,
		} ) )
		.filter( ( e ) => e.match && ( e.invoke || e.navigate ) );
}
