import { useSyncExternalStore } from '@wordpress/element';
import { KNOWN_SLOTS } from './createSlotRegistry';

/**
 * Data slots — structured (non-React) entries plugins push into named
 * registries. The render-side slots (`<Slot>`/`<Fill>`) own visual
 * insertion; data slots own action descriptors, menu items, picker
 * options — anything an app needs to consume as data, not children.
 *
 * Two slots flow through this registry today:
 *   - `core:posts.row-actions`     (DataViews `actions[]` entries)
 *   - `core:settings.panels`       (settings-app panel descriptors)
 *
 * Public API (plugin-facing):
 *   registerSlotItem(name, item) → unregister fn
 *   getSlotItems(name)           → current array
 *
 * Component-facing:
 *   useSlotItems(name)           → reactive array, re-renders on change
 */

const items = new Map();   // name → array<item>
const listeners = new Set();

function snapshot( name ) {
	return items.get( name ) || EMPTY;
}

const EMPTY = Object.freeze( [] );

function notify() {
	for ( const fn of listeners ) {
		fn();
	}
}

export function registerSlotItem( name, item ) {
	if ( ! KNOWN_SLOTS[ name ] ) {
		// eslint-disable-next-line no-console
		console.warn( `wp-admin-shell: registerSlotItem called with unknown slot "${ name }"` );
	}
	if ( ! item || typeof item !== 'object' ) {
		throw new Error( 'registerSlotItem: item must be an object' );
	}
	const list = items.get( name ) ? [ ...items.get( name ) ] : [];
	list.push( item );
	items.set( name, list );
	notify();
	return function unregister() {
		const cur = items.get( name );
		if ( ! cur ) {
			return;
		}
		const next = cur.filter( ( x ) => x !== item );
		if ( next.length === 0 ) {
			items.delete( name );
		} else {
			items.set( name, next );
		}
		notify();
	};
}

export function getSlotItems( name ) {
	return snapshot( name );
}

export function useSlotItems( name ) {
	return useSyncExternalStore(
		( onChange ) => {
			listeners.add( onChange );
			return () => listeners.delete( onChange );
		},
		() => snapshot( name ),
		() => snapshot( name )
	);
}
