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

export function compileStyles( styles ) {
	if ( ! styles || typeof styles !== 'object' ) {
		return { wpds: {}, chrome: {}, scoped: {} };
	}

	const wpds = {};
	for ( const [ key, value ] of Object.entries( styles ) ) {
		if ( NON_TOKEN_KEYS.has( key ) ) {
			continue;
		}
		walk( value, [ key ], ( path, leaf ) => {
			wpds[ pathToWpds( path ) ] = resolveValue( leaf, styles );
		} );
	}

	const chrome = {};
	if ( styles.chrome && typeof styles.chrome === 'object' ) {
		walk( styles.chrome, [], ( path, leaf ) => {
			chrome[ pathToChrome( path ) ] = resolveValue( leaf, styles );
		} );
	}

	const scoped = {};
	if ( styles.regions && typeof styles.regions === 'object' ) {
		for ( const [ regionId, regionStyles ] of Object.entries( styles.regions ) ) {
			scoped[ `region:${ regionId }` ] = compileSubtree( regionStyles, styles );
		}
	}
	if ( styles.applications && typeof styles.applications === 'object' ) {
		for ( const [ appId, appStyles ] of Object.entries( styles.applications ) ) {
			scoped[ `app:${ appId }` ] = compileSubtree( appStyles, styles );
		}
	}

	return { wpds, chrome, scoped };
}

function compileSubtree( subtree, rootStyles ) {
	if ( ! subtree || typeof subtree !== 'object' ) {
		return {};
	}
	const out = {};
	for ( const [ key, value ] of Object.entries( subtree ) ) {
		if ( NON_TOKEN_KEYS.has( key ) ) {
			continue;
		}
		if ( key === 'chrome' && value && typeof value === 'object' ) {
			walk( value, [], ( path, leaf ) => {
				out[ pathToChrome( path ) ] = resolveValue( leaf, rootStyles );
			} );
			continue;
		}
		walk( value, [ key ], ( path, leaf ) => {
			out[ pathToWpds( path ) ] = resolveValue( leaf, rootStyles );
		} );
	}
	return out;
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

function resolveValue( raw, rootStyles ) {
	if ( typeof raw !== 'string' ) {
		return String( raw );
	}
	const aliasMatch = raw.match( /^\{([^}]+)\}$/ );
	if ( ! aliasMatch ) {
		return raw;
	}
	const aliasPath = aliasMatch[ 1 ];

	// Within-document reference: `{styles.color.bg...}` →  resolve through the
	// styles tree. Strip the leading `styles.` and walk.
	if ( aliasPath.startsWith( 'styles.' ) ) {
		const segments = aliasPath.slice( 'styles.'.length ).split( '.' );
		const resolved = resolveByPath( rootStyles, segments );
		if ( resolved !== undefined ) {
			return resolveValue( resolved, rootStyles );
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
