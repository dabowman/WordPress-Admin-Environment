/**
 * core:single-pane-layout — second engine, validates engine boundary.
 *
 * Idiom is deliberately different from `core:site-editor-layout`:
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
 * Apps that work in `core:site-editor-layout` work here because both
 * engines honor the same platform-service set; only the geometry
 * differs. Demo-quality polish — not every WPDS chrome surface needs
 * to look perfect.
 */

import { useState, useCallback } from '@wordpress/element';

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

	// Brand/accent color flows through the WPDS chrome→token bridge in
	// `compileStyles.CHROME_WPDS_BINDINGS`; engines no longer read
	// admin.json `branding.accentColor` (v0 legacy) or fabricate a
	// `--wp-admin-shell-accent` custom property.

	return (
		<div
			className="wp-admin-shell-layout wp-admin-shell-layout--single-pane"
			data-engine="core:single-pane-layout"
		>
			<div className="wp-admin-shell-single-pane__appbar">
				{ hasNav && (
					<button
						type="button"
						className="wp-admin-shell-single-pane__nav-toggle"
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

			<div className="wp-admin-shell-single-pane__body">
				{ buckets.main && (
					<Region key={ buckets.main.id } region={ buckets.main } />
				) }
			</div>

			{ hasNav && (
				<div
					className={ `wp-admin-shell-single-pane__nav-drawer${
						navOpen ? ' is-open' : ''
					}` }
					aria-hidden={ ! navOpen }
				>
					<div
						className="wp-admin-shell-single-pane__nav-backdrop"
						onClick={ toggleNav }
					/>
					<div className="wp-admin-shell-single-pane__nav-pane">
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
	);
}
