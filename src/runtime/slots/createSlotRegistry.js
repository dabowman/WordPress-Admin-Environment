/**
 * Slot registry — known slot names exposed by the runtime.
 *
 * Slots are how plugins extend the shell without touching kernel code.
 * Registered slot names are validated at <Slot> render time so typos
 * fail loudly. Every entry below comes from spec §6.5.
 *
 * The actual rendering is delegated to `@wordpress/components` <Slot>/<Fill>;
 * this module is purely a name registry plus a thin convenience wrapper.
 */

export const KNOWN_SLOTS = Object.freeze( {
	// Toolbar regions
	'core:toolbar.left': 'Toolbar — left cluster',
	'core:toolbar.right': 'Toolbar — right cluster',
	// Navigation
	'core:navigation.footer': 'Navigation — footer',
	// Apps
	'core:posts.row-actions': 'Posts — DataViews row actions',
	'core:editor.sidebar': 'Editor — sidebar panels',
	'core:app.before': 'App — banner above content',
	'core:app.after': 'App — banner below content',
} );

export function createSlotRegistry() {
	const slots = new Map( Object.entries( KNOWN_SLOTS ) );

	return {
		register( name, description ) {
			if ( ! name ) {
				throw new Error( 'createSlotRegistry: slot name required' );
			}
			slots.set( name, description || name );
		},
		has( name ) {
			return slots.has( name );
		},
		list() {
			return Array.from( slots.entries() ).map( ( [ name, description ] ) => ( {
				name,
				description,
			} ) );
		},
	};
}
