/**
 * compileStyles — `admin.json.styles` → flat token map.
 *
 * Walks the tree and emits one entry per leaf. Leaves whose value resolves
 * to a literal CSS string (hex, rgb, px, font-stack, etc.) become CSS
 * custom-property entries. Branding metadata (`logo`, `title`, `icon`)
 * is identity, not styling — we exclude it from token output. Density
 * is an attribute, not a variable — skipped here, handled by `density.js`.
 *
 * Output shape:
 *   {
 *     wpds:   { '--wpds-color-bg-interactive-brand-strong': '#3858e9', ... },
 *     chrome: { '--wp-admin-shell--chrome--sidebar--background': '#0a0a0a', ... },
 *     scoped: {                                      // §M3.7
 *       'region:sidebar': { '--wpds-...': '...' },
 *       'app:posts':      { '--wpds-...': '...' },
 *     }
 *   }
 *
 * Aliases:
 *   - `"{styles.path.to.slot}"` resolves within admin.json (within-doc).
 *   - `"{tokens.path}"` (any non-styles prefix) is a tokens.json alias —
 *     deferred to v2. v1 leaves unresolved aliases as literal `var(...)`-style
 *     fallbacks where possible, otherwise emits the original string.
 */

const NON_TOKEN_KEYS = new Set( [ 'branding', 'density', 'chrome', 'regions', 'applications', 'userCustomizable' ] );

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

function devWarn( message ) {
	if ( ! IS_DEV ) {
		return;
	}
	// eslint-disable-next-line no-console
	console.warn( `wp-admin-shell compileStyles: ${ message }` );
}

function emitTo( map, name, value, sourcePath ) {
	if ( name in map && map[ name ] !== value ) {
		// Two different slot paths produced the same CSS variable name.
		// e.g. `a.bc` and `a-bc` both → `--wpds-a-bc`. Last write wins
		// (matches normal map semantics) but warn so the author can rename.
		devWarn(
			`slot-name collision on ${ name } (path "${ sourcePath }" overwrites prior value "${ map[ name ] }")`
		);
	}
	map[ name ] = value;
}

export function compileStyles( styles ) {
	if ( ! styles || typeof styles !== 'object' ) {
		return { wpds: {}, chrome: {}, scoped: {} };
	}

	// Top-level: emit into separate wpds + chrome maps so the engine
	// can lay them out in the documented order (WPDS surface first,
	// chrome extensions second).
	const { wpds, chrome } = compileTree( styles, styles, { splitChrome: true } );

	const scoped = {};
	if ( styles.regions && typeof styles.regions === 'object' ) {
		for ( const [ regionId, regionStyles ] of Object.entries( styles.regions ) ) {
			scoped[ `region:${ regionId }` ] = compileTree( regionStyles, styles ).wpds;
		}
	}
	if ( styles.applications && typeof styles.applications === 'object' ) {
		for ( const [ appId, appStyles ] of Object.entries( styles.applications ) ) {
			scoped[ `app:${ appId }` ] = compileTree( appStyles, styles ).wpds;
		}
	}

	return { wpds, chrome, scoped };
}

/**
 * Shared traversal: walks a styles subtree and emits CSS-variable
 * entries into wpds + chrome maps. `rootStyles` carries the document
 * root so within-doc DTCG aliases (`{styles.path}`) resolve regardless
 * of which subtree is being compiled.
 *
 * `splitChrome: true` (top-level) returns separate wpds + chrome maps.
 * Default (subtree) merges chrome leaves into the same map as wpds —
 * region/app overrides emit into a single output keyed by their
 * `[data-region-id]` / `[data-app-id]` selector and don't need the
 * top-level split.
 */
function compileTree( tree, rootStyles, { splitChrome = false } = {} ) {
	const wpds = {};
	const chrome = splitChrome ? {} : wpds;

	if ( ! tree || typeof tree !== 'object' ) {
		return { wpds, chrome };
	}

	for ( const [ key, value ] of Object.entries( tree ) ) {
		if ( NON_TOKEN_KEYS.has( key ) ) {
			continue;
		}
		if ( key === 'chrome' && value && typeof value === 'object' ) {
			walk( value, [], ( path, leaf ) => {
				emitTo(
					chrome,
					pathToChrome( path ),
					resolveValue( leaf, rootStyles ),
					path.join( '.' )
				);
			} );
			continue;
		}
		walk( value, [ key ], ( path, leaf ) => {
			emitTo(
				wpds,
				pathToWpds( path ),
				resolveValue( leaf, rootStyles ),
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
	// Inline DTCG object: { $value, $type }
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

function resolveValue( raw, rootStyles, visited, depth = 0 ) {
	if ( typeof raw !== 'string' ) {
		return String( raw );
	}
	const aliasMatch = raw.match( /^\{([^}]+)\}$/ );
	if ( ! aliasMatch ) {
		return raw;
	}
	const aliasPath = aliasMatch[ 1 ];

	// Cycle detection. visited is a Set carried through alias-chain
	// recursion; depth caps the chain length even if the visited set
	// somehow misses a self-reference.
	const seen = visited || new Set();
	if ( seen.has( aliasPath ) ) {
		devWarn( `alias cycle detected on "${ aliasPath }"; emitting raw string` );
		return raw;
	}
	if ( depth >= MAX_ALIAS_DEPTH ) {
		devWarn( `alias chain exceeded ${ MAX_ALIAS_DEPTH } levels at "${ aliasPath }"; emitting raw string` );
		return raw;
	}

	// Within-document reference: `{styles.color.bg...}` →  resolve through the
	// styles tree. Strip the leading `styles.` and walk.
	if ( aliasPath.startsWith( 'styles.' ) ) {
		const segments = aliasPath.slice( 'styles.'.length ).split( '.' );
		const resolved = resolveByPath( rootStyles, segments );
		if ( resolved !== undefined ) {
			seen.add( aliasPath );
			return resolveValue( resolved, rootStyles, seen, depth + 1 );
		}
	}

	// tokens.json alias — v1 has no tokens.json. Best-effort fallback: emit a
	// CSS `var(...)` referencing the same slot, so a later resolver (or v2's
	// tokens.json layer) can supply it. Path with dots becomes a kebab-case var.
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
