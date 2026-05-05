/**
 * Region-kind classifier used by engines to bucket regions into
 * persistent / overlay / drawer slots.
 *
 * Replaces the old per-source `regionKind` field on the registry's
 * `RegionSource` typedef. Region sources as a registry kind are gone in
 * V2.M2; engines call `getRegionKind(region)` instead.
 *
 * v1 admin.json shells declare `region.source: "core:sidebar-region"`
 * (etc.); this maps the legacy id to its kind. Region instances may
 * override via `region.kind`. Unknown sources default to `persistent`.
 *
 * V2.M6 will replace the kind enum with platform-service-based dispatch
 * (e.g., `platform.modal: true` → overlay-equivalent placement). This
 * helper carries forward only as far as the legacy v1 shells live in
 * the tree (V2.M7 retires those).
 */

const SOURCE_KIND = {
	'core:sidebar-region':  'persistent',
	'core:toolbar-region':  'persistent',
	'core:content-region':  'persistent',
	'core:preview-region':  'persistent',
	'core:overlay-region':  'overlay',
	'core:drawer-region':   'drawer',
};

export function getRegionKind( region ) {
	if ( ! region ) {
		return 'persistent';
	}
	let kind = region.kind || SOURCE_KIND[ region.source ] || 'persistent';
	if ( kind === 'floating' || kind === 'tiled' ) {
		kind = 'persistent';
	}
	return kind;
}
