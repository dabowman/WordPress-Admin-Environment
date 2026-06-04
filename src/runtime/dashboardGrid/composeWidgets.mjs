/**
 * Pure widget composition — turns the manifest registry + admin.json
 * `dashboardWidgets` overrides into a flat list of tile descriptors the
 * `core:dashboard-host` app feeds into the kernel's dynamic-children
 * store.
 *
 * Inputs:
 *   - `manifests`      — `window.wpAdminWorkspaces.manifests.apps` (id → app.json)
 *   - `overrides`      — resolved-config `dashboardWidgets` block
 *
 * Output: ordered array of `{ id, title, defaultSize, minSize, position }`.
 *
 * Rules (mirror the schema + spec §13 #13):
 *   - Every manifest whose `dashboardWidget` block is present + non-empty
 *     is a candidate widget.
 *   - `overrides[id].hidden === true` removes a widget regardless of
 *     manifest declaration.
 *   - Other override fields merge per-property over the manifest block:
 *     admin.json wins.
 *   - Order: explicit `{row, col}` positions render in their fixed
 *     slot via CSS Grid; auto-placed widgets follow in registration
 *     order (the order keys appear in `manifests`).
 *
 * Pure ESM, framework-agnostic — node tests exercise this without
 * needing webpack or React.
 */

const DEFAULT_SIZE = Object.freeze( { w: 1, h: 1 } );
const DEFAULT_MIN_SIZE = Object.freeze( { w: 1, h: 1 } );

function pickSize( raw, fallback ) {
	if ( ! raw || typeof raw !== 'object' ) {
		return fallback;
	}
	const w = Number.isInteger( raw.w ) && raw.w >= 1 ? raw.w : fallback.w;
	const h = Number.isInteger( raw.h ) && raw.h >= 1 ? raw.h : fallback.h;
	return { w, h };
}

function pickPosition( raw ) {
	if ( raw === 'auto' || raw === undefined || raw === null ) {
		return 'auto';
	}
	if (
		typeof raw === 'object' &&
		Number.isInteger( raw.row ) &&
		raw.row >= 1 &&
		Number.isInteger( raw.col ) &&
		raw.col >= 1
	) {
		return { row: raw.row, col: raw.col };
	}
	return 'auto';
}

/**
 * Clamp `defaultSize` so it never falls below `minSize`. Authors can
 * lower the default in admin.json without losing the manifest's floor.
 * @param {{w:number,h:number}} size
 * @param {{w:number,h:number}} min
 */
function clampToMin( size, min ) {
	return {
		w: Math.max( size.w, min.w ),
		h: Math.max( size.h, min.h ),
	};
}

/**
 * @param {Record<string, Object>} manifests App-id → manifest.
 * @param {Record<string, Object>} overrides admin.json `dashboardWidgets`.
 * @return {Array<{id:string,title:string,defaultSize:{w:number,h:number},minSize:{w:number,h:number},position:'auto'|{row:number,col:number}}>}
 */
export function composeWidgets( manifests, overrides ) {
	if ( ! manifests || typeof manifests !== 'object' ) {
		return [];
	}
	const safeOverrides =
		overrides && typeof overrides === 'object' ? overrides : {};
	const out = [];
	for ( const [ id, manifest ] of Object.entries( manifests ) ) {
		const block = manifest?.dashboardWidget;
		if ( ! block || typeof block !== 'object' ) {
			continue;
		}
		const override = safeOverrides[ id ];
		if ( override && override.hidden === true ) {
			continue;
		}
		const minSize = pickSize(
			override?.minSize ?? block.minSize,
			DEFAULT_MIN_SIZE
		);
		const defaultSizeRaw = pickSize(
			override?.defaultSize ?? block.defaultSize,
			DEFAULT_SIZE
		);
		const defaultSize = clampToMin( defaultSizeRaw, minSize );
		const position = pickPosition(
			override?.position ?? block.position
		);
		const title =
			override?.title ||
			block.title ||
			manifest.title ||
			id;
		out.push( { id, title, defaultSize, minSize, position } );
	}
	return out;
}
