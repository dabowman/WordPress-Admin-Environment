import { createContext, useContext } from '@wordpress/element';

/**
 * Runtime kernel context — exposes the active registry, the resolved
 * shell config, and the active engine source to every region and app
 * source.
 *
 * Regions need the registry to look up app sources by id when they mount
 * `region.contains[]`. Apps occasionally need it (e.g. command-picker
 * enumerating routable apps). The active engine source is exposed so
 * scoped ThemeProviders (per-region/per-app) can pick up the same
 * `ThemeProvider` component the kernel mounted at the root. The kernel
 * wraps its tree in this provider once at mount.
 *
 * @typedef {Object} KernelContextValue
 * @property {Object} registry       - The source registry instance.
 * @property {Object} config         - The resolved (post-cascade in M2) shell config.
 * @property {Object} [engineSource] - The active engine source from the registry.
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
