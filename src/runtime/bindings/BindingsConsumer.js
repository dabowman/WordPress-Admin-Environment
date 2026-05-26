import { useEffect, useMemo } from '@wordpress/element';

import { useKernel } from '../kernel-context';
import { buildCommandsArray } from './buildCommandsArray.mjs';
import { trigger } from './triggerStore.mjs';
import { navigate } from '../routing/router';

// `buildCommandsArray` lives in its own `.mjs` sibling so the rebind test
// can import it directly (`tests/runtime/bindings-consumer-rebind.test.mjs`).
// Keeping it pure-ESM + module-scoped matches the repo convention for
// runtime helpers (`resolveRegion.mjs`, `matchRoute.mjs`, `lruCache.mjs`).
export { buildCommandsArray };

/**
 * Reads the resolved admin.json `commands` block and registers each
 * shortcut against the document. When a binding fires:
 *   - `invoke` commands look up the app id in the trigger store and
 *     call its open handler.
 *   - `navigate` commands push the target path onto the URL bar.
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
