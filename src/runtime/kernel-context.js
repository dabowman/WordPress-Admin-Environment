import {
	createContext,
	useContext,
	useMemo,
	useSyncExternalStore,
} from '@wordpress/element';

/**
 * Runtime kernel context — exposes the active registry, the resolved
 * shell config, the active engine source, and the dynamic-children store
 * to every region and app source.
 *
 * Regions need the registry to look up app sources by id when they mount
 * `region.contains[]`. Apps occasionally need it (e.g. command-picker
 * enumerating routable apps). The active engine source is exposed so
 * scoped ThemeProviders (per-region/per-app) can pick up the same
 * `ThemeProvider` component the kernel mounted at the root. The
 * dynamic-children store is exposed so any app mounted in a region whose
 * template declares `platform[ 'core:dynamic-children' ]` can add/remove
 * child regions at runtime. The kernel wraps its tree in this provider
 * once at mount.
 *
 * @typedef {Object} KernelContextValue
 * @property {Object} registry               - The source registry instance.
 * @property {Object} config                 - The resolved (post-cascade in M2) shell config.
 * @property {Object} [engineSource]         - The active engine source from the registry.
 * @property {Object} [dynamicChildrenStore] - createDynamicChildrenStore() instance.
 */

const KernelContext = createContext( null );

export function KernelProvider( { value, children } ) {
	return (
		<KernelContext.Provider value={ value }>
			{ children }
		</KernelContext.Provider>
	);
}

export function useKernel() {
	const ctx = useContext( KernelContext );
	if ( ! ctx ) {
		throw new Error( 'useKernel: called outside <KernelProvider>' );
	}
	return ctx;
}

/**
 * Subscribe to runtime-mutated child regions for `parentRegionId`. Returns
 * the current snapshot array plus parent-scoped `add`/`remove` helpers.
 *
 * Snapshot reference is stable between mutations (the store reuses the
 * cached array), so `useSyncExternalStore` does not loop. Empty parents
 * share a single frozen `EMPTY` array.
 *
 * When called outside a `<KernelProvider>` (test harnesses, isolated
 * stories) the hook returns an empty list and no-op mutators so callers
 * can render safely without conditional logic.
 *
 * @param {string} parentRegionId - Region ID hosting the dynamic children.
 * @return {{ children: Array<{key: string, decl: Object}>, add: Function, remove: Function }} Live snapshot + parent-scoped mutators.
 */
export function useDynamicChildren( parentRegionId ) {
	const ctx = useContext( KernelContext );
	const store = ctx?.dynamicChildrenStore || null;

	// Stable subscribe + getSnapshot per (store, parentRegionId). Recreating
	// either on every render makes `useSyncExternalStore` re-subscribe.
	const subscribe = useMemo( () => {
		if ( ! store ) {
			return () => () => {};
		}
		return ( listener ) => store.subscribe( parentRegionId, listener );
	}, [ store, parentRegionId ] );

	const getSnapshot = useMemo( () => {
		if ( ! store ) {
			return () => EMPTY_LIST;
		}
		return () => store.list( parentRegionId );
	}, [ store, parentRegionId ] );

	const children = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getSnapshot
	);

	const api = useMemo( () => {
		if ( ! store ) {
			return NOOP_API;
		}
		return {
			add: ( key, decl ) => store.add( parentRegionId, key, decl ),
			remove: ( key ) => store.remove( parentRegionId, key ),
		};
	}, [ store, parentRegionId ] );

	return { children, ...api };
}

const EMPTY_LIST = Object.freeze( [] );
const NOOP_API = Object.freeze( {
	add: () => {},
	remove: () => false,
} );
