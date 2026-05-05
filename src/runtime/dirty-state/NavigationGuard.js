import { useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { hasBlockingDirty } from './dirtyState.mjs';

const CONFIRM_MESSAGE = __(
	'You have unsaved changes. Are you sure you want to leave?',
	'wp-admin-shell'
);

/**
 * Engine-level navigation guard for the `block-navigation-on-dirty`
 * platform service.
 *
 * Browser analog: `window.addEventListener( 'beforeunload', ... )`. The
 * standard browser dialog covers full-page exits; in-shell URL changes
 * use the Navigation API where available (cancellable `navigate` event)
 * and fall back to a hashchange-revert path on engines that lack it
 * (Safari at the time of writing). Apps report dirty status through
 * `useDirtyState`; this component never inspects app internals.
 */
export function NavigationGuard() {
	useEffect( () => {
		if ( typeof window === 'undefined' ) {
			return undefined;
		}

		const onBeforeUnload = ( event ) => {
			if ( ! hasBlockingDirty() ) {
				return undefined;
			}
			event.preventDefault();
			event.returnValue = CONFIRM_MESSAGE;
			return CONFIRM_MESSAGE;
		};

		window.addEventListener( 'beforeunload', onBeforeUnload );

		const nav = typeof window.navigation === 'object' ? window.navigation : null;
		let onNavigate;
		if ( nav && typeof nav.addEventListener === 'function' ) {
			onNavigate = ( event ) => {
				if ( ! hasBlockingDirty() ) {
					return;
				}
				if ( ! event.canIntercept || event.hashChange === false ) {
					return;
				}
				if ( ! window.confirm( CONFIRM_MESSAGE ) ) {
					event.preventDefault();
				}
			};
			nav.addEventListener( 'navigate', onNavigate );
		}

		// Hashchange-revert fallback for browsers without the Navigation
		// API. The hash already changed by the time `hashchange` fires,
		// so on cancel we step back through history. The previous-hash
		// ref tracks the URL we were on before the change so the revert
		// is a single `replaceState` rather than a noisy back/forward.
		let lastHash = window.location.hash;
		let suppressRevert = false;
		const onHashChange = () => {
			if ( suppressRevert ) {
				suppressRevert = false;
				lastHash = window.location.hash;
				return;
			}
			if ( ! hasBlockingDirty() ) {
				lastHash = window.location.hash;
				return;
			}
			if ( nav ) {
				// Navigation API path already prompted; nothing to do.
				lastHash = window.location.hash;
				return;
			}
			if ( window.confirm( CONFIRM_MESSAGE ) ) {
				lastHash = window.location.hash;
				return;
			}
			suppressRevert = true;
			window.history.replaceState( null, '', lastHash );
			window.dispatchEvent( new HashChangeEvent( 'hashchange' ) );
		};
		window.addEventListener( 'hashchange', onHashChange );

		return () => {
			window.removeEventListener( 'beforeunload', onBeforeUnload );
			window.removeEventListener( 'hashchange', onHashChange );
			if ( nav && onNavigate ) {
				nav.removeEventListener( 'navigate', onNavigate );
			}
		};
	}, [] );

	return null;
}
