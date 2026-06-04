/**
 * `core:desktop` engine style compiler.
 *
 * Walks the resolved `workspace.json.styles` tree and emits CSS variables
 * scoped to the engine's ThemeProvider wrapper. The kernel's
 * `ThemeProviderHost` calls this hook and wraps the output in a
 * `[data-theme-scope-id="..."]` selector — that attribute is the
 * cross-engine scope hook.
 *
 * Two seam categories for MVP:
 *
 *   1. `styles.chrome.<surface>.<slot>` → `--wp-admin-workspaces--chrome--
 *      <surface>--<slot>` (kebab-cased). The engine's `index.css`
 *      consumes those slot names directly with hardcoded fallbacks, so
 *      authors can override any desktop chrome surface (canvas, dock,
 *      wallpaper, window-frame, snap-ghost) via workspace.json without
 *      writing CSS.
 *
 *   2. `styles.theme.color.bg` seed → canvas background fallback. A
 *      single ergonomic seed for "make my desktop dark / light / blue
 *      without learning the slot vocabulary." Authors who need finer
 *      control drop down to chrome.canvas.background directly.
 *
 * Per-region (`styles.regions[id]`) and per-app (`styles.applications[id]`)
 * overrides flow into the `subtrees` bucket keyed by `region:<id>` /
 * `app:<id>` so the kernel's `scopedSelector` can place them under the
 * matching `[data-region-id]` / `[data-app-id]` selectors.
 *
 * Tokens-table aliasing (`"{tokens.path}"`) and WPDS-bridge mappings
 * defer to a follow-up — MVP keeps the compiler pure-pass-through so
 * the contract is small and obvious. Pure ESM; no DOM.
 */

const CHROME_SURFACES = new Set( [
	'canvas',
	'wallpaper',
	'dock',
	'window-frame',
	'snap-ghost',
] );

function kebabCase( str ) {
	return String( str ).replace( /([a-z0-9])([A-Z])/g, '$1-$2' ).toLowerCase();
}

function isLeafValue( value ) {
	return (
		typeof value === 'string' ||
		typeof value === 'number' ||
		( Array.isArray( value ) && value.every( ( v ) => typeof v !== 'object' ) )
	);
}

function emitChromeSurface( surface, tree, out ) {
	if ( ! tree || typeof tree !== 'object' ) {
		return;
	}
	const prefix = `--wp-admin-workspaces--chrome--${ kebabCase( surface ) }`;
	const walk = ( node, parts ) => {
		for ( const [ key, value ] of Object.entries( node ) ) {
			const path = [ ...parts, kebabCase( key ) ];
			if ( isLeafValue( value ) ) {
				out[ `${ prefix }--${ path.join( '--' ) }` ] = String( value );
			} else if ( value && typeof value === 'object' ) {
				walk( value, path );
			}
		}
	};
	walk( tree, [] );
}

function emitChromeBlock( chrome ) {
	const out = {};
	if ( ! chrome || typeof chrome !== 'object' ) {
		return out;
	}
	for ( const [ surface, tree ] of Object.entries( chrome ) ) {
		if ( ! CHROME_SURFACES.has( surface ) ) {
			// Unknown surfaces still emit — engines that extend the
			// vocabulary (e.g. a plugin adding `chrome.widget-rail.*`)
			// pass through; the unknown set above is documentation.
		}
		emitChromeSurface( surface, tree, out );
	}
	return out;
}

function emitThemeSeeds( theme ) {
	const out = {};
	if ( ! theme || typeof theme !== 'object' ) {
		return out;
	}
	const bg = theme.color?.bg;
	if ( typeof bg === 'string' ) {
		// Ergonomic seed — single value flips the desktop background
		// without touching the canvas slot. Authors who set
		// chrome.canvas.background directly override this in the cascade.
		out[ '--wp-admin-workspaces--chrome--canvas--background' ] = bg;
	}
	return out;
}

export function compileStyles( styles /* , tokens */ ) {
	const top = {};
	const subtrees = {};

	if ( ! styles || typeof styles !== 'object' ) {
		return { top, scoped: [], subtrees };
	}

	Object.assign( top, emitThemeSeeds( styles.theme ) );
	Object.assign( top, emitChromeBlock( styles.chrome ) );

	if ( styles.regions && typeof styles.regions === 'object' ) {
		for ( const [ id, region ] of Object.entries( styles.regions ) ) {
			if ( ! region || typeof region !== 'object' ) {
				continue;
			}
			const vars = {
				...emitThemeSeeds( region.theme ),
				...emitChromeBlock( region.chrome ),
			};
			if ( Object.keys( vars ).length > 0 ) {
				subtrees[ `region:${ id }` ] = vars;
			}
		}
	}

	if ( styles.applications && typeof styles.applications === 'object' ) {
		for ( const [ id, app ] of Object.entries( styles.applications ) ) {
			if ( ! app || typeof app !== 'object' ) {
				continue;
			}
			const vars = {
				...emitThemeSeeds( app.theme ),
				...emitChromeBlock( app.chrome ),
			};
			if ( Object.keys( vars ).length > 0 ) {
				subtrees[ `app:${ id }` ] = vars;
			}
		}
	}

	return { top, scoped: [], subtrees };
}
