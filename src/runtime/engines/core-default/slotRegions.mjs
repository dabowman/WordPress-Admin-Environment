/**
 * core:default — region → layout-slot dispatch.
 *
 * The flagship engine arranges regions into a fixed chrome shape:
 *
 *   toolbar (banner, top) · sidebar (navigation, left) · areas row
 *   { content (main) + dashboard-grid / dynamic-children body regions +
 *     detail (complementary) + preview } · overlay layer · stragglers.
 *
 * Dispatch is by ROLE, with the region id as a tiebreaker — not by literal
 * id. The engine declares `specializes-roles` (navigation / banner / main /
 * complementary / …), so a workspace that names its main region `dashboard`
 * (role `main`) instead of `content` still lands in the content slot rather
 * than falling through to the straggler bucket. Matching order per slot:
 *
 *   1. role + id match  — the conventional case (e.g. role `main`, id `content`).
 *   2. role match       — any id, honoring `specializes-roles`.
 *   3. id-only fallback  — for `preview`, which has no engine template/role.
 *
 * Modal regions (`platform.core:modal` / `role: dialog`) always go to the
 * overlay layer. Remaining chrome regions split: dynamic-children hosts
 * (a `core:dashboard-grid` region) are body-area occupants rendered inside
 * the content row — that is the engine's real mount point for them — while
 * everything else (the notices banners, which fix-position themselves) renders
 * as a straggler at the layout root.
 *
 * Pure ESM, side-effect-free: takes the resolved top-level regions map and
 * returns plain arrays/refs so `Layout.js` and node tests share one source of
 * truth. No React, no DOM.
 */

import { isModal, hostsDynamicChildren } from '../../regions/platformServices.mjs';

/**
 * Well-known slot → the ARIA role that claims it. `preview` has no engine
 * template and no canonical role, so it is matched by id only (value `null`).
 */
export const SLOT_ROLES = {
	toolbar: 'banner',
	sidebar: 'navigation',
	content: 'main',
	detail: 'complementary',
	preview: null,
};

function takeSlot( pool, slotId ) {
	const role = SLOT_ROLES[ slotId ];
	let idx = -1;
	if ( role ) {
		// 1. role + id match — the conventional region.
		idx = pool.findIndex(
			( region ) => region.role === role && region.id === slotId
		);
		// 2. role match (any id) — honors `specializes-roles`.
		if ( idx === -1 ) {
			idx = pool.findIndex( ( region ) => region.role === role );
		}
	}
	// 3. id-only fallback — `preview`, or a role-less region named for the slot.
	if ( idx === -1 ) {
		idx = pool.findIndex( ( region ) => region.id === slotId );
	}
	if ( idx === -1 ) {
		return undefined;
	}
	return pool.splice( idx, 1 )[ 0 ];
}

/**
 * @param {Object} regions Resolved top-level regions map (id-keyed).
 * @return {{toolbar: *, sidebar: *, content: *, detail: *, preview: *,
 *   bodyExtras: Array, overlay: Array, stragglers: Array}} Slotted regions.
 */
export function slotRegions( regions ) {
	const all =
		regions && typeof regions === 'object' ? Object.values( regions ) : [];

	const overlay = [];
	const chrome = [];
	for ( const region of all ) {
		if ( ! region || typeof region !== 'object' ) {
			continue;
		}
		( isModal( region ) ? overlay : chrome ).push( region );
	}

	// `takeSlot` splices claimed regions out of `chrome`, so order matters:
	// the unique chrome slots first, then partition the remainder.
	const toolbar = takeSlot( chrome, 'toolbar' );
	const sidebar = takeSlot( chrome, 'sidebar' );
	const content = takeSlot( chrome, 'content' );
	const detail = takeSlot( chrome, 'detail' );
	const preview = takeSlot( chrome, 'preview' );

	const bodyExtras = [];
	const stragglers = [];
	for ( const region of chrome ) {
		// CSS-scope caveat: this routes ANY `core:dynamic-children` host into
		// the content row by PLATFORM SERVICE, but the engine's padding-reset
		// rule in `index.css` keys off the id SUFFIX
		// (`[data-region-id$="dashboard-grid"] .wp-admin-workspaces-region__app
		// { padding: 0 }`). The two signals must agree: a body-mounted grid
		// whose id does NOT end in `dashboard-grid` mounts here but keeps the
		// default app inset, so its grid won't reach the card edges. Custom
		// dynamic-children hosts must therefore follow the `*-dashboard-grid`
		// id convention to get the flush body mount. (The bundled
		// `core:dashboard-grid` template already conforms.) Documented in
		// `docs/core-default-engine.md`.
		( hostsDynamicChildren( region ) ? bodyExtras : stragglers ).push(
			region
		);
	}

	return {
		toolbar,
		sidebar,
		content,
		detail,
		preview,
		bodyExtras,
		overlay,
		stragglers,
	};
}
