import { useEffect } from '@wordpress/element';

import { useKernel } from '../kernel-context';
import { parseShortcut } from './parseShortcut.mjs';
import { trigger } from './triggerStore.mjs';
import { navigate } from '../routing/router';

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
	// v3-compiled output always lives in `commands`; fall back to v2
	// `bindings` for fixtures / tests that bypass the compiler.
	let commands = null;
	if ( Array.isArray( config?.commands ) ) {
		commands = config.commands;
	} else if ( Array.isArray( config?.bindings ) ) {
		commands = config.bindings;
	}

	useEffect( () => {
		if (
			! commands ||
			commands.length === 0 ||
			typeof window === 'undefined'
		) {
			return undefined;
		}

		const compiled = commands
			.map( ( entry ) => ( {
				match: parseShortcut( entry?.shortcut ),
				invoke: typeof entry?.invoke === 'string' ? entry.invoke : null,
				navigate:
					typeof entry?.navigate === 'string' ? entry.navigate : null,
			} ) )
			.filter( ( e ) => e.match && ( e.invoke || e.navigate ) );

		if ( compiled.length === 0 ) {
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
	}, [ commands ] );

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
