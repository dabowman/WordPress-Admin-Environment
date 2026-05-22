import { useEffect, useMemo } from '@wordpress/element';

import { useKernel } from '../kernel-context';
import { parseShortcut } from './parseShortcut.mjs';
import { trigger } from './triggerStore.mjs';
import { navigate } from '../routing/router';

/**
 * Compile a `commands[]` / `bindings[]` array into the entry shape the
 * keydown handler iterates: `{ match, invoke, navigate }`. Skips entries
 * without a parseable shortcut or without at least one of
 * invoke/navigate. Returns `[]` for nullish / empty inputs so the caller
 * can use referential identity of the result for `useEffect` dep
 * stability.
 *
 * Pure and side-effect-free — module-scope so the rebind test can
 * exercise it without standing up a React tree.
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

/**
 * Reads the resolved admin.json `commands` block (v3) and registers each
 * shortcut against the document. When a binding fires:
 *   - `invoke` commands look up the app id in the trigger store and
 *     call its open handler (v2 binding semantics preserved).
 *   - `navigate` commands push the target path onto the URL bar.
 *
 * The PHP v3 compiler forwards any legacy v2 `bindings[]` into
 * `commands[]` so this reader has a single source of truth. The
 * fallback to `config.bindings` is defensive — covers tests / fixtures
 * that bypass the compiler.
 *
 * Spec §8 precedence: app shortcuts win when focus is inside the app's
 * DOM. We approximate this by skipping the binding when the active
 * element is inside an `<input>`, `<textarea>`, or `[contenteditable]`
 * — the binding fires for chrome-level focus only.
 *
 * Mounted by the kernel root after RouterProvider so it has access to
 * the resolved config. No UI; returns null.
 */
export function BindingsConsumer() {
	const { config } = useKernel();
	// Memoize the compiled command table on the underlying nested refs so
	// the keydown handler binds once per real shortcut change, not once
	// per router event. The outer config object ref churns on every
	// resolved-tree update; `config.commands` / `config.bindings` are
	// stable across renders that didn't touch them.
	const compiled = useMemo( () => {
		let source = null;
		if ( Array.isArray( config?.commands ) ) {
			source = config.commands;
		} else if ( Array.isArray( config?.bindings ) ) {
			source = config.bindings;
		}
		return buildCommandsArray( source );
	}, [ config?.commands, config?.bindings ] );

	useEffect( () => {
		if ( compiled.length === 0 || typeof window === 'undefined' ) {
			return undefined;
		}

		const onKey = ( event ) => {
			if ( shouldDeferToFocusedApp( event ) ) {
				return;
			}
			for ( const entry of compiled ) {
				if ( entry.match( event ) ) {
					let handled = false;
					if ( entry.invoke ) {
						handled = trigger( entry.invoke );
					}
					if ( ! handled && entry.navigate ) {
						navigate( entry.navigate );
						handled = true;
					}
					if ( handled ) {
						event.preventDefault();
						event.stopPropagation();
					}
					return;
				}
			}
		};

		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
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
