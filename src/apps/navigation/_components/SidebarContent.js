import { useRef, useLayoutEffect, useState } from '@wordpress/element';
import { focus } from '@wordpress/dom';

import { useSidebarNavigation } from './SidebarNavigationContext';

/**
 * Wraps sidebar screen content and applies slide animations
 * based on the navigation direction (forward/back).
 *
 * The `screenKey` prop triggers a re-mount when the screen changes,
 * which resets the animation class.
 * @param {Object} root0
 * @param {*}      root0.screenKey
 * @param {*}      root0.children
 */
export default function SidebarContent( { screenKey, children } ) {
	return (
		<div className="wp-admin-workspaces-sidebar__content">
			<SidebarContentWrapper key={ screenKey }>
				{ children }
			</SidebarContentWrapper>
		</div>
	);
}

function SidebarContentWrapper( { children } ) {
	const navState = useSidebarNavigation();
	const wrapperRef = useRef();
	const [ navAnimation, setNavAnimation ] = useState( null );

	useLayoutEffect( () => {
		if ( ! navState ) {
			return;
		}
		const { direction, focusSelector } = navState.get();
		focusSidebarElement( wrapperRef.current, direction, focusSelector );
		setNavAnimation( direction );
	}, [ navState ] );

	let animationClass = '';
	if ( navAnimation === 'back' ) {
		animationClass = ' slide-from-left';
	} else if ( navAnimation === 'forward' ) {
		animationClass = ' slide-from-right';
	}

	return (
		<div
			ref={ wrapperRef }
			className={ `wp-admin-workspaces-sidebar__screen-wrapper${ animationClass }` }
		>
			{ children }
		</div>
	);
}

/**
 * Focus a sidebar element after navigation. On back navigation,
 * tries to focus the element that triggered the forward navigation.
 * Otherwise focuses the first tabbable element (usually the Back button).
 * @param {*} el
 * @param {*} direction
 * @param {*} focusSelector
 */
function focusSidebarElement( el, direction, focusSelector ) {
	if ( ! el || direction === null ) {
		return;
	}
	let elementToFocus;
	if ( direction === 'back' && focusSelector ) {
		elementToFocus = el.querySelector( focusSelector );
	}
	if ( ! elementToFocus ) {
		const [ firstTabbable ] = focus.tabbable.find( el );
		elementToFocus = firstTabbable ?? el;
	}
	elementToFocus?.focus();
}
