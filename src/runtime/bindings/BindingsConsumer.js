import { useEffect } from '@wordpress/element';

import { useKernel } from '../kernel-context';
import { parseShortcut } from './parseShortcut.mjs';
import { trigger } from './triggerStore.mjs';

/**
 * Reads the resolved admin.json `bindings` block and registers each
 * shortcut against the document. When a binding fires, looks up the
 * `invoke` app id in the trigger store and calls its open handler.
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
	const bindings = Array.isArray( config?.bindings ) ? config.bindings : null;

	useEffect( () => {
		if ( ! bindings || bindings.length === 0 || typeof window === 'undefined' ) {
			return undefined;
		}

		const compiled = bindings
			.map( ( entry ) => ( {
				match: parseShortcut( entry?.shortcut ),
				invoke: entry?.invoke,
			} ) )
			.filter( ( e ) => e.match && typeof e.invoke === 'string' );

		if ( compiled.length === 0 ) {
			return undefined;
		}

		const onKey = ( event ) => {
			if ( shouldDeferToFocusedApp( event ) ) {
				return;
			}
			for ( const entry of compiled ) {
				if ( entry.match( event ) ) {
					if ( trigger( entry.invoke ) ) {
						event.preventDefault();
						event.stopPropagation();
					}
					return;
				}
			}
		};

		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ bindings ] );

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
