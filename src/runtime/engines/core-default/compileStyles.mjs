/**
 * `core:default` engine style compiler — `admin.json.styles` → CSS-variable
 * buckets in the kernel's `EngineStyleCompiler` shape.
 *
 * Walks the resolved styles tree and emits one entry per leaf. Top-level
 * leaves (the WPDS surface + chrome extensions) flatten into the `top`
 * bucket; chrome surfaces with bindings declared in `CHROME_WPDS_BINDINGS`
 * also produce surface-scoped overrides in the `scoped` bucket so
 * `@wordpress/ui` components inside chrome containers retheme automatically.
 * Per-region (`styles.regions[id]`) and per-app (`styles.applications[id]`)
 * overrides go to `subtrees` keyed by `region:<id>` / `app:<id>`.
 *
 * Output shape (matches `EngineStyleCompiler` typedef in
 * `src/runtime/registry/source-types.js`):
 *
 *   {
 *     top:      { '--wpds-...': '#3858e9', '--wp-admin-shell--chrome--...': '#0a0a0a', ... },
 *     scoped:   [ { selector: '.wp-admin-shell-nav', vars: { '--wpds-...': '...' } }, ... ],
 *     subtrees: {
 *       'region:sidebar': { '--wpds-...': '...' },
 *       'app:posts':      { '--wpds-...': '...' },
 *     }
 *   }
 *
 * Aliases:
 *   - `"{styles.path.to.slot}"` resolves within admin.json (within-doc).
 *   - `"{tokens.path}"` resolves against the merged DTCG tokens flat map.
 *   - Unresolved aliases emit a CSS `var(--token-...)` fallback so a
 *     downstream override (later cascade origin, runtime theme switch)
 *     can still supply the value via the same name.
 *
 * Chrome → WPDS bridge: WPDS-flavored components inside a chrome surface
 * inherit the chrome palette through `--wpds-*` token overrides scoped to
 * the surface's container class. Authors set `chrome.<surface>.<slot>`;
 * the bridge maps them to interactive WPDS slots — no per-component
 * override CSS, no cascade-layer fight.
 *
 * Pure ESM, side-effect-free. Imported by `ThemeProviderHost` via the
 * engine source's `compileStyles` field; loaded directly by node tests
 * (no React, no DOM).
 */

import { flattenTokens } from '../../tokens/tokensResolver.mjs';

const NON_TOKEN_KEYS = new Set( [
	'branding',
	'density',
	'chrome',
	'regions',
	'applications',
	'customizable',
	'theme',
] );

/**
 * Chrome surface → WPDS token bindings. Each entry maps a chrome surface
 * (canvas / sidebar / toolbar / site-hub) to its container CSS selector plus the
 * `chrome.<surface>.<slot>` → `--wpds-<token>` mappings the compiler emits
 * inside that scope. When a binding's source slot has a value in the
 * resolved chrome tree, the corresponding WPDS variable is set under the
 * surface's selector — turning chrome-authoring into automatic
 * `@wordpress/ui` re-theming.
 */
const CHROME_WPDS_BINDINGS = {
	canvas: {
		selector: '.wp-admin-shell-layout',
		bindings: {
			// `background` is intentionally NOT bound. `--wpds-color-bg-
			// surface-neutral` is the surface ramp `core:main` / `core:detail`
			// cards consume as their final fallback — binding canvas.background
			// to it would darken cards under the shell scope. The canvas
			// itself paints via the chrome slot directly (engine `index.css`
			// reads `--wp-admin-shell--chrome--canvas--background`); the WPDS
			// bridge only needs to retheme @wordpress/ui foreground content
			// rendered directly under `.wp-admin-shell-layout`.
			foreground: '--wpds-color-fg-content-neutral',
		},
	},
	sidebar: {
		selector: '.wp-admin-shell-nav, .wp-admin-shell-site-hub',
		bindings: {
			foreground: '--wpds-color-fg-content-neutral',
			'item.foreground': '--wpds-color-fg-interactive-neutral',
			'item.foreground-active':
				'--wpds-color-fg-interactive-neutral-active',
			'item.background-hover':
				'--wpds-color-bg-interactive-neutral-weak-active',
		},
	},
	toolbar: {
		selector: '.wp-admin-shell-toolbar',
		bindings: {
			foreground: '--wpds-color-fg-interactive-neutral',
			'foreground-active': '--wpds-color-fg-interactive-neutral-active',
		},
	},
	'site-hub': {
		selector: '.wp-admin-shell-site-hub',
		bindings: {
			foreground: '--wpds-color-fg-interactive-neutral',
		},
	},
};

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function devWarn( message ) {
	if ( ! IS_DEV ) {
		return;
	}
	// eslint-disable-next-line no-console
	console.warn( `core:default compileStyles: ${ message }` );
}

function emitTo( map, name, value, sourcePath ) {
	if ( name in map && map[ name ] !== value ) {
		devWarn(
			`slot-name collision on ${ name } (path "${ sourcePath }" overwrites prior value "${ map[ name ] }")`
		);
	}
	map[ name ] = value;
}

export function compileStyles( styles, tokens ) {
	if ( ! styles || typeof styles !== 'object' ) {
		return { top: {}, scoped: [], subtrees: {} };
	}

	const tokensFlat = flattenTokensSafe( tokens );

	// Top-level: emit WPDS slots + chrome variables into a single flat map.
	// Order is documented (WPDS surface first, chrome extensions second).
	const { wpds, chrome } = compileTree( styles, styles, tokensFlat, {
		splitChrome: true,
	} );
	const top = { ...wpds, ...chrome };

	// Chrome → WPDS bridge: surface-scoped overrides under chrome
	// container selectors.
	const scoped = compileChromeScopedWpds( styles, tokensFlat );

	const subtrees = {};
	if ( styles.regions && typeof styles.regions === 'object' ) {
		for ( const [ regionId, regionStyles ] of Object.entries(
			styles.regions
		) ) {
			const out = compileTree( regionStyles, styles, tokensFlat ).wpds;
			if ( Object.keys( out ).length > 0 ) {
				subtrees[ `region:${ regionId }` ] = out;
			}
		}
	}
	if ( styles.applications && typeof styles.applications === 'object' ) {
		for ( const [ appId, appStyles ] of Object.entries(
			styles.applications
		) ) {
			const out = compileTree( appStyles, styles, tokensFlat ).wpds;
			if ( Object.keys( out ).length > 0 ) {
				subtrees[ `app:${ appId }` ] = out;
			}
		}
	}

	return { top, scoped, subtrees };
}

function flattenTokensSafe( tokens ) {
	if ( ! tokens || typeof tokens !== 'object' ) {
		return {};
	}
	try {
		return flattenTokens( tokens );
	} catch ( e ) {
		devWarn( `tokens.json flatten failed: ${ e.message || e }` );
		return {};
	}
}

function compileChromeScopedWpds( styles, tokensFlat ) {
	const result = [];
	const chromeTree = styles.chrome;
	if ( ! chromeTree || typeof chromeTree !== 'object' ) {
		return result;
	}

	for ( const [ surfaceKey, config ] of Object.entries(
		CHROME_WPDS_BINDINGS
	) ) {
		const surfaceTree = chromeTree[ surfaceKey ];
		if ( ! surfaceTree || typeof surfaceTree !== 'object' ) {
			continue;
		}
		const vars = {};
		for ( const [ bindingPath, wpdsName ] of Object.entries(
			config.bindings
		) ) {
			const value = resolveByPath(
				surfaceTree,
				bindingPath.split( '.' )
			);
			if ( value === undefined || value === null ) {
				continue;
			}
			const resolved = resolveValue(
				String( value ),
				styles,
				tokensFlat
			);
			vars[ wpdsName ] = resolved;
		}
		if ( Object.keys( vars ).length > 0 ) {
			result.push( { selector: config.selector, vars } );
		}
	}
	return result;
}

/**
 * Shared traversal: walks a styles subtree and emits CSS-variable
 * entries into wpds + chrome maps. `rootStyles` carries the document
 * root so within-doc DTCG aliases (`{styles.path}`) resolve regardless
 * of which subtree is being compiled.
 *
 * `splitChrome: true` (top-level) returns separate wpds + chrome maps
 * which the caller merges into the `top` bucket. Default (subtree)
 * merges chrome leaves into the same map as wpds — region/app
 * overrides emit into a single output keyed by their data-attribute
 * selector and don't need the top-level split.
 *
 * @param {*}      tree
 * @param {*}      rootStyles
 * @param {*}      tokensFlat
 * @param {Object} root0
 * @param {*}      root0.splitChrome
 */
function compileTree(
	tree,
	rootStyles,
	tokensFlat = {},
	{ splitChrome = false } = {}
) {
	const wpds = {};
	const chrome = splitChrome ? {} : wpds;

	if ( ! tree || typeof tree !== 'object' ) {
		return { wpds, chrome };
	}

	// Chrome is special-cased OUT of the wpds-traversal loop below
	// because `chrome` is in NON_TOKEN_KEYS — emit it before the loop
	// so the NON_TOKEN_KEYS skip doesn't dead-code the chrome path.
	if ( tree.chrome && typeof tree.chrome === 'object' ) {
		walk( tree.chrome, [], ( path, leaf ) => {
			emitTo(
				chrome,
				pathToChrome( path ),
				resolveValue( leaf, rootStyles, tokensFlat ),
				path.join( '.' )
			);
		} );
	}

	for ( const [ key, value ] of Object.entries( tree ) ) {
		if ( NON_TOKEN_KEYS.has( key ) ) {
			continue;
		}
		walk( value, [ key ], ( path, leaf ) => {
			emitTo(
				wpds,
				pathToWpds( path ),
				resolveValue( leaf, rootStyles, tokensFlat ),
				path.join( '.' )
			);
		} );
	}

	return { wpds, chrome };
}

function walk( node, path, emit ) {
	if ( node === null || node === undefined ) {
		return;
	}
	if ( isLeaf( node ) ) {
		emit( path, node );
		return;
	}
	if ( typeof node !== 'object' ) {
		return;
	}
	if ( '$value' in node ) {
		emit( path, node.$value );
		return;
	}
	for ( const [ key, child ] of Object.entries( node ) ) {
		walk( child, [ ...path, key ], emit );
	}
}

function isLeaf( value ) {
	const t = typeof value;
	return t === 'string' || t === 'number' || t === 'boolean';
}

function pathToWpds( path ) {
	return `--wpds-${ path.join( '-' ) }`;
}

function pathToChrome( path ) {
	return `--wp-admin-shell--chrome--${ path.join( '--' ) }`;
}

const MAX_ALIAS_DEPTH = 16;

function resolveValue( raw, rootStyles, tokensFlat, visited, depth = 0 ) {
	if ( typeof raw !== 'string' ) {
		return String( raw );
	}
	const aliasMatch = raw.match( /^\{([^}]+)\}$/ );
	if ( ! aliasMatch ) {
		return raw;
	}
	const aliasPath = aliasMatch[ 1 ];

	const seen = visited || new Set();
	if ( seen.has( aliasPath ) ) {
		devWarn(
			`alias cycle detected on "${ aliasPath }"; emitting raw string`
		);
		return raw;
	}
	if ( depth >= MAX_ALIAS_DEPTH ) {
		devWarn(
			`alias chain exceeded ${ MAX_ALIAS_DEPTH } levels at "${ aliasPath }"; emitting raw string`
		);
		return raw;
	}

	if ( aliasPath.startsWith( 'styles.' ) ) {
		const segments = aliasPath.slice( 'styles.'.length ).split( '.' );
		const resolved = resolveByPath( rootStyles, segments );
		if ( resolved !== undefined ) {
			seen.add( aliasPath );
			return resolveValue(
				resolved,
				rootStyles,
				tokensFlat,
				seen,
				depth + 1
			);
		}
	}

	if ( tokensFlat && aliasPath in tokensFlat ) {
		const value = tokensFlat[ aliasPath ];
		seen.add( aliasPath );
		return resolveValue( value, rootStyles, tokensFlat, seen, depth + 1 );
	}

	const guessed = `--token-${ aliasPath.replace( /\./g, '-' ) }`;
	return `var(${ guessed })`;
}

function resolveByPath( root, segments ) {
	let cur = root;
	for ( const seg of segments ) {
		if ( cur === null || typeof cur !== 'object' ) {
			return undefined;
		}
		cur = cur[ seg ];
	}
	return cur;
}
