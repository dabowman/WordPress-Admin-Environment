/**
 * WindowManagerContext + hooks (P2.T2 MVP).
 *
 * React glue for the WindowManager state machine:
 *
 *   <WindowManagerProvider>
 *     ...compositor + dynamic-children-rendered windows...
 *   </WindowManagerProvider>
 *
 * Children read the live window stack via `useWindowStack()` and reach
 * the dispatcher via `useWindowManager()`. A `useWindowEntry(id)` helper
 * narrows to a single window's snapshot for window-frame consumers.
 *
 * The provider creates the manager once and exposes it as a stable
 * reference. Subscribers re-render via `useSyncExternalStore`, so a
 * pointer-move (which the verbatim port mutates imperatively via DOM
 * refs and only commits to the store on pointer-up) does NOT trip a
 * React re-render on every frame — only the eventual commit does.
 */

import {
	createContext,
	useContext,
	useMemo,
	useRef,
	useSyncExternalStore,
} from '@wordpress/element';

import {
	WindowManager,
	type IWindowManager,
	type WindowEntry,
} from './WindowManager';

interface WindowManagerContextValue {
	manager: IWindowManager;
}

const WindowManagerContext = createContext< WindowManagerContextValue | null >(
	null
);

export function WindowManagerProvider( {
	children,
}: {
	children: React.ReactNode;
} ): JSX.Element {
	const managerRef = useRef< WindowManager | null >( null );
	if ( ! managerRef.current ) {
		managerRef.current = new WindowManager();
	}
	const value = useMemo< WindowManagerContextValue >(
		() => ( { manager: managerRef.current as WindowManager } ),
		[]
	);
	return (
		<WindowManagerContext.Provider value={ value }>
			{ children }
		</WindowManagerContext.Provider>
	);
}

export function useWindowManager(): IWindowManager {
	const ctx = useContext( WindowManagerContext );
	if ( ! ctx ) {
		throw new Error(
			'useWindowManager() called outside WindowManagerProvider. The core:desktop engine mounts the provider; check that the active engine is core:desktop.'
		);
	}
	return ctx.manager;
}

export function useWindowStack(): ReadonlyArray< WindowEntry > {
	const manager = useWindowManager();
	return useSyncExternalStore(
		( listener ) => manager.subscribe( listener ),
		() => manager.getStack(),
		() => manager.getStack()
	);
}

export function useWindowEntry( id: string ): WindowEntry | undefined {
	const stack = useWindowStack();
	return stack.find( ( w ) => w.id === id );
}
