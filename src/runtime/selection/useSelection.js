import { useSelect, useDispatch } from '@wordpress/data';
import { useCallback } from '@wordpress/element';
import { STORE_NAME, ensureSelectionStore } from './store';
import { writeSelection } from './persist';

ensureSelectionStore();

/**
 * Subscribe to a selection scope and get a setter.
 *
 * `useSelection( 'content' )` returns the current value of the `content` scope
 * and a setter that publishes a new value. Pass `true` as the second arg to
 * the setter to opt into persistence (writes to user meta via the selection
 * REST endpoint, asynchronously).
 *
 * Subscribers re-render when the scope's value changes. Passing a falsy
 * scope returns `[ undefined, noop ]` and does not subscribe.
 */
export function useSelection( scope ) {
	const value = useSelect(
		( select ) => ( scope ? select( STORE_NAME ).getSelection( scope ) : undefined ),
		[ scope ]
	);
	const { setSelection } = useDispatch( STORE_NAME );

	const set = useCallback(
		( next, persist = false ) => {
			if ( ! scope ) {
				return;
			}
			setSelection( scope, next, persist );
			if ( persist ) {
				writeSelection( scope, next ).catch( () => {} );
			}
		},
		[ scope, setSelection ]
	);

	return [ value, set ];
}
