/**
 * Pure widget composition — turns a `screens[id]` entry's `apps[]`
 * array (filtered to `slot: "grid"`) and the in-page app manifest
 * registry into a flat list of tile descriptors the
 * `core:dashboard-host` app feeds into its tile renderer.
 *
 * Inputs:
 *   - `screen`    — the active screen doc (typically
 *                   `config.screens[screenId]`).
 *   - `manifests` — `window.wpAdminWorkspaces.manifests.apps` (id → app.json).
 *
 * Output: ordered array of `{ id, appId, title, defaultSize, minSize, position }`.
 *
 *   - `id`     — the screen-app entry id (e.g. `recent-posts`).
 *   - `appId`  — the app to mount (e.g. `core:dashboard-widget-recent-posts`).
 *   - `title`  — the resolved widget title (entry override > entry-id-as-title
 *                 fallback chain handled by callers).
 *
 * Rules (mirror the schema + spec §13 #13):
 *   - Only entries with `slot === "grid"` are widgets.
 *   - Entries with no `app` field are skipped (degenerate).
 *   - Entries referencing an app id absent from the manifest registry
 *     are skipped (cap-gated apps may be invisible to a given user;
 *     mount-time gating is the host's concern, not ours).
 *   - Manifest `slotHints.{defaultSize,minSize,position}` provide the
 *     defaults; per-entry `size` / `position` override per-property.
 *     The install layer (`screens[id].apps[i]`) wins per-property.
 *   - `defaultSize` is clamped to `minSize` (manifest floor still
 *      applies after the install-layer override).
 *   - Order: entries render in the order they appear in `screen.apps`.
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
 * lower the default in workspace.json without losing the manifest's floor.
 *
 * @param {{w:number,h:number}} size
 * @param {{w:number,h:number}} min
 * @return {{w:number,h:number}}
 */
function clampToMin( size, min ) {
	return {
		w: Math.max( size.w, min.w ),
		h: Math.max( size.h, min.h ),
	};
}

/**
 * @param {Object}                  options
 * @param {Object|null|undefined}   options.screen     The active screen doc (`config.screens[screenId]`).
 * @param {Record<string, Object>}  options.manifests  App-id → manifest doc (typically `window.wpAdminWorkspaces.manifests.apps`).
 * @return {Array<{id:string,appId:string,title:string,defaultSize:{w:number,h:number},minSize:{w:number,h:number},position:'auto'|{row:number,col:number},config:Object|null}>}
 */
export function composeScreenWidgets( { screen, manifests } ) {
	if ( ! screen || typeof screen !== 'object' ) {
		return [];
	}
	if ( ! Array.isArray( screen.apps ) || screen.apps.length === 0 ) {
		return [];
	}
	const safeManifests =
		manifests && typeof manifests === 'object' ? manifests : {};

	const out = [];
	for ( const entry of screen.apps ) {
		if ( ! entry || typeof entry !== 'object' ) {
			continue;
		}
		if ( entry.slot !== 'grid' ) {
			continue;
		}
		const entryId = typeof entry.id === 'string' ? entry.id : '';
		const appId = typeof entry.app === 'string' ? entry.app : '';
		if ( entryId === '' || appId === '' ) {
			continue;
		}
		const manifest = safeManifests[ appId ];
		if ( ! manifest || typeof manifest !== 'object' ) {
			// Manifest missing — skip. May be cap-gated out of the
			// page-load payload, or simply not registered yet.
			continue;
		}
		const hints =
			manifest.slotHints && typeof manifest.slotHints === 'object'
				? manifest.slotHints
				: {};

		const minSize = pickSize( hints.minSize, DEFAULT_MIN_SIZE );

		// Install-layer override wins per-property: per-entry `size`
		// trumps `slotHints.defaultSize`. The default size further
		// floors to minSize (manifest invariant honored regardless of
		// install-layer values).
		const defaultSizeRaw = pickSize(
			entry.size ?? hints.defaultSize,
			DEFAULT_SIZE
		);
		const defaultSize = clampToMin( defaultSizeRaw, minSize );

		const position = pickPosition( entry.position ?? hints.position );

		// Title resolution chain — entry override (workspace.json author
		// intent) > entry config.title (e.g. the classic-widget bridge's
		// harvested meta-box title) > manifest title (intrinsic). The
		// entry-id fallback is the very last resort and lives on the React
		// side; we ship `entryId` as a default so the React layer can
		// decorate it however it likes without re-deriving here.
		const entryConfig =
			entry.config && typeof entry.config === 'object'
				? entry.config
				: null;
		const configTitle =
			entryConfig && typeof entryConfig.title === 'string'
				? entryConfig.title
				: '';
		const title =
			( typeof entry.title === 'string' && entry.title ) ||
			configTitle ||
			( typeof manifest.title === 'string' && manifest.title ) ||
			entryId;

		out.push( {
			id: entryId,
			appId,
			title,
			defaultSize,
			minSize,
			position,
			// Per-entry mount config (e.g. the classic-widget bridge's
			// `widgetId`). Null when the entry declares no config — the
			// host then mounts the app by id string.
			config: entryConfig,
		} );
	}
	return out;
}
