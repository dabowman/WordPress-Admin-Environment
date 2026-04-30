import { createContext, useState, useContext } from '@wordpress/element';

export const SidebarNavigationContext = createContext( null );
SidebarNavigationContext.displayName = 'SidebarNavigationContext';

/**
 * Navigation state tracker for sidebar screen transitions.
 * Tracks direction ('forward' | 'back' | null) and a focus selector
 * for restoring focus after back navigation.
 */
function createNavState() {
	let state = {
		direction: null,
		focusSelector: null,
	};

	return {
		get() {
			return state;
		},
		navigate( direction, focusSelector = null ) {
			state = {
				direction,
				focusSelector:
					direction === 'forward' && focusSelector
						? focusSelector
						: state.focusSelector,
			};
		},
	};
}

export function SidebarNavigationProvider( { children } ) {
	const [ navState ] = useState( createNavState );

	return (
		<SidebarNavigationContext.Provider value={ navState }>
			{ children }
		</SidebarNavigationContext.Provider>
	);
}

export function useSidebarNavigation() {
	return useContext( SidebarNavigationContext );
}
