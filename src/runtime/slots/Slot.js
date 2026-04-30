import { Slot as WpSlot, Fill as WpFill, SlotFillProvider } from '@wordpress/components';
import { KNOWN_SLOTS } from './createSlotRegistry';

/**
 * Thin wrappers over @wordpress/components Slot/Fill that validate slot
 * names against the runtime's known-slot list. Unknown slot names emit a
 * console warning in dev so typos surface — they otherwise silently
 * render nothing.
 *
 * The runtime kernel mounts the SlotFillProvider once at the root.
 */

function warnIfUnknown( name ) {
	if ( typeof process !== 'undefined' && process.env?.NODE_ENV === 'production' ) {
		return;
	}
	if ( ! ( name in KNOWN_SLOTS ) ) {
		// eslint-disable-next-line no-console
		console.warn( `wp-admin-shell: unknown slot name "${ name }". Known: ${ Object.keys( KNOWN_SLOTS ).join( ', ' ) }` );
	}
}

export function Slot( { name, ...props } ) {
	warnIfUnknown( name );
	return <WpSlot name={ name } { ...props } />;
}

export function Fill( { name, ...props } ) {
	warnIfUnknown( name );
	return <WpFill name={ name } { ...props } />;
}

export { SlotFillProvider };
