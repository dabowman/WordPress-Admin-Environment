/**
 * core:single-pane — second engine, validates engine boundary.
 *
 * Idiom is deliberately different from `core:default`:
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ banner region(s) — persistent, top, stacked │
 *   ├─────────────────────────────────────────────┤
 *   │                                             │
 *   │ main region (routable; fills viewport)      │
 *   │                                             │
 *   └─────────────────────────────────────────────┘
 *
 *   navigation regions  → render as collapsed drawer (slide-in from
 *                          start edge); user toggles via the appbar
 *                          hamburger when present.
 *   complementary regions → full-screen takeover panel; dismiss returns
 *                          to main.
 *   dialog regions        → centered modal over main.
 *
 * Apps that work in `core:default` work here because both
 * engines honor the same platform-service set; only the geometry
 * differs. Demo-quality polish — not every WPDS chrome surface needs
 * to look perfect.
 */

import { useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { SlotFillProvider } from '@wordpress/components';

import { Region } from '../../regions/Region';
import { isModal } from '../../regions/platformServices.mjs';

function classify( regions ) {
	const buckets = {
		banner: [],
		main: null,
		navigation: [],
		complementary: [],
		modal: [],
		other: [],
	};
	for ( const region of Object.values( regions ) ) {
		if ( isModal( region ) ) {
			buckets.modal.push( region );
			continue;
		}
		if ( region.role === 'banner' || region.role === 'contentinfo' ) {
			buckets.banner.push( region );
			continue;
		}
		if ( region.role === 'main' ) {
			if ( ! buckets.main ) {
				buckets.main = region;
			} else {
				buckets.other.push( region );
			}
			continue;
		}
		if ( region.role === 'navigation' ) {
			buckets.navigation.push( region );
			continue;
		}
		if ( region.role === 'complementary' ) {
			buckets.complementary.push( region );
			continue;
		}
		buckets.other.push( region );
	}
	return buckets;
}

export default function CoreSinglePaneLayout( { regions } ) {
	const buckets = classify( regions );
	const [ navOpen, setNavOpen ] = useState( false );
	const toggleNav = useCallback( () => setNavOpen( ( v ) => ! v ), [] );

	const hasNav = buckets.navigation.length > 0;

	// `<SlotFillProvider>` lives in the engine layout (not the kernel)
	// to keep the kernel DS-neutral. See `core-default/Layout.js` for
	// the rationale. `core:single-pane` reuses `core:default`'s WPDS
	// contract so it ships the same substrate.
	return (
		<SlotFillProvider>
			<div
				className="wp-admin-workspaces-layout wp-admin-workspaces-layout--single-pane"
				data-engine="core:single-pane"
			>
				<div className="wp-admin-workspaces-single-pane__appbar">
					{ hasNav && (
						<button
							type="button"
							className="wp-admin-workspaces-single-pane__nav-toggle"
							aria-label="Toggle navigation"
							aria-expanded={ navOpen }
							onClick={ toggleNav }
						>
							<span aria-hidden="true">☰</span>
						</button>
					) }
					{ buckets.banner.map( ( region ) => (
						<Region key={ region.id } region={ region } />
					) ) }
				</div>

				<div className="wp-admin-workspaces-single-pane__body">
					{ buckets.main && (
						<Region
							key={ buckets.main.id }
							region={ buckets.main }
						/>
					) }
				</div>

				{ hasNav && (
					<div
						className={ `wp-admin-workspaces-single-pane__nav-drawer${
							navOpen ? ' is-open' : ''
						}` }
						aria-hidden={ ! navOpen }
					>
						<button
							type="button"
							tabIndex={ -1 }
							aria-label={ __(
								'Close navigation',
								'wp-admin-workspaces'
							) }
							className="wp-admin-workspaces-single-pane__nav-backdrop"
							onClick={ toggleNav }
						/>
						<div className="wp-admin-workspaces-single-pane__nav-pane">
							{ buckets.navigation.map( ( region ) => (
								<Region key={ region.id } region={ region } />
							) ) }
						</div>
					</div>
				) }

				{ buckets.complementary.map( ( region ) => (
					<Region key={ region.id } region={ region } />
				) ) }

				{ buckets.modal.map( ( region ) => (
					<Region key={ region.id } region={ region } />
				) ) }

				{ buckets.other.map( ( region ) => (
					<Region key={ region.id } region={ region } />
				) ) }
			</div>
		</SlotFillProvider>
	);
}
