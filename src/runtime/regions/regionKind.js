/**
 * Region-kind classifier used by engines to bucket regions into
 * persistent / overlay / drawer slots.
 *
 * V2.M2 task 6: derives the kind from `getPlatformServices(region)`.
 * v2 declarations express the choice through `platform.modal`,
 * `role: dialog`, `dismiss-on`, etc. v1 workspaces still ship legacy
 * `region.source` ids; the platform-services bridge in
 * `platformServices.mjs` maps each id to the equivalent platform
 * vocabulary so this helper returns the same bucket either way.
 *
 * Returns one of:
 *   - 'persistent' — fixed slot in the engine's default arrangement
 *   - 'overlay'    — modal-style (backdrop + focus trap)
 *   - 'drawer'     — slides in from edge with dismiss-on
 *
 * Region instances may force a bucket via `region.kind`. `floating` and
 * `tiled` collapse to `persistent` for v1.
 *
 * V2.M7 retires the legacy bridge once bundled workspaces migrate.
 */

import { placement } from './platformServices.mjs';

export function getRegionKind( region ) {
	if ( ! region ) {
		return 'persistent';
	}
	if ( region.kind ) {
		return normalize( region.kind );
	}
	return placement( region );
}

function normalize( kind ) {
	if ( kind === 'floating' || kind === 'tiled' ) {
		return 'persistent';
	}
	return kind;
}
