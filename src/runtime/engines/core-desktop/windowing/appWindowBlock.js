/**
 * App-manifest `window` block lookup.
 *
 * The PHP manifest registry serializes each app's `app.json` to
 * `window.wpAdminShell.manifests.apps[id]`. This helper reads the
 * optional `window` block — `{ defaultSize, minSize, multiInstance,
 * icon, chrome }` — and applies sensible fallbacks. Apps without a
 * `window` block get the kernel-default size/min pair.
 *
 * Lives under `engines/core-desktop/` because the contract is
 * engine-specific — default and single-pane engines never read it.
 */

const DEFAULTS = Object.freeze( {
	defaultSize: { w: 960, h: 720 },
	minSize: { w: 320, h: 200 },
	multiInstance: false,
} );

function readManifest( appId ) {
	if ( ! appId || typeof appId !== 'string' ) {
		return null;
	}
	const apps = window?.wpAdminShell?.manifests?.apps;
	if ( ! apps || typeof apps !== 'object' ) {
		return null;
	}
	return apps[ appId ] || null;
}

/**
 * Resolve the window block for an app id. Always returns an object —
 * missing manifest or absent block falls back to DEFAULTS.
 *
 * @param {string} appId App manifest id (e.g. `core:posts`).
 * @return {{defaultSize: {w:number,h:number}, minSize: {w:number,h:number}, multiInstance: boolean, icon?: string}} Window block with defaults applied.
 */
export function getAppWindowBlock( appId ) {
	const manifest = readManifest( appId );
	const block =
		manifest && manifest.window && typeof manifest.window === 'object'
			? manifest.window
			: null;
	if ( ! block ) {
		return DEFAULTS;
	}
	return {
		defaultSize:
			block.defaultSize && typeof block.defaultSize === 'object'
				? {
						w: block.defaultSize.w || DEFAULTS.defaultSize.w,
						h: block.defaultSize.h || DEFAULTS.defaultSize.h,
				  }
				: DEFAULTS.defaultSize,
		minSize:
			block.minSize && typeof block.minSize === 'object'
				? {
						w: block.minSize.w || DEFAULTS.minSize.w,
						h: block.minSize.h || DEFAULTS.minSize.h,
				  }
				: DEFAULTS.minSize,
		multiInstance: !! block.multiInstance,
		icon:
			typeof block.icon === 'string' && block.icon
				? block.icon
				: undefined,
	};
}
