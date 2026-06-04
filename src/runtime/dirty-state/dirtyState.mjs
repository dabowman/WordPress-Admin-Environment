/**
 * Dirty-state platform service store.
 *
 * Spec §5.3: an app may declare `platform.dirty-state: true` (it can
 * report unsaved changes) and `platform.block-navigation-on-dirty: true`
 * (the engine must guard navigation while dirty). Apps report their
 * status via `useDirtyState`; the engine's `NavigationGuard` reads from
 * this store before letting any navigation event proceed.
 *
 * Pure ESM, no React. Keeping the store in a plain module lets the
 * router, the beforeunload handler, the Navigation API interceptor, and
 * Node test scripts all share one source of truth.
 *
 * Each entry is keyed by `regionId`. Apps that claim dirty state but
 * sit in a region without `block-navigation-on-dirty` still register
 * their flag — a future app may inspect the registry to surface UI
 * indicators without re-implementing the bookkeeping.
 */

const entries = new Map();
const listeners = new Set();

export function setDirty( regionId, isDirty, options = {} ) {
	if ( ! regionId ) {
		return;
	}
	const blocksNavigation = options.blocksNavigation === true;
	const next = { isDirty: !! isDirty, blocksNavigation };
	const prev = entries.get( regionId );
	if (
		prev &&
		prev.isDirty === next.isDirty &&
		prev.blocksNavigation === next.blocksNavigation
	) {
		return;
	}
	entries.set( regionId, next );
	emit();
}

export function clearDirty( regionId ) {
	if ( ! entries.has( regionId ) ) {
		return;
	}
	entries.delete( regionId );
	emit();
}

export function isDirty( regionId ) {
	return !! entries.get( regionId )?.isDirty;
}

export function hasBlockingDirty() {
	for ( const entry of entries.values() ) {
		if ( entry.isDirty && entry.blocksNavigation ) {
			return true;
		}
	}
	return false;
}

export function listDirty() {
	const out = [];
	for ( const [ regionId, entry ] of entries ) {
		if ( entry.isDirty ) {
			out.push( { regionId, ...entry } );
		}
	}
	return out;
}

export function subscribe( listener ) {
	listeners.add( listener );
	return () => listeners.delete( listener );
}

export function reset() {
	entries.clear();
	listeners.clear();
}

function emit() {
	for ( const listener of listeners ) {
		try {
			listener();
		} catch ( e ) {
			// eslint-disable-next-line no-console
			console.error( '[wp-admin-workspaces] dirtyState listener threw', e );
		}
	}
}
