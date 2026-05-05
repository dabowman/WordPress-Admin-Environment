/**
 * tokens.json resolver — DTCG curly-brace alias + type coercion.
 *
 * Spec §9.1: `tokens.json` ships an author-defined DTCG (W3C 2025.10)
 * primitives layer. WordPress dictates only the *names* of the consumer
 * slots (admin.json `styles`, theme.json `settings`); authors map their
 * tokens into those slots via DTCG curly-brace aliasing.
 *
 * This module is purely about the tokens.json layer: walk a DTCG tree,
 * resolve `{path.to.token}` aliases, coerce DTCG-typed values into the
 * CSS strings the admin.json `styles` slots expect. Discovery + cascade
 * merge happen PHP-side (mirrors `admin.json` cascade) — this module
 * receives the already-merged tokens tree.
 *
 * Public API:
 *   - `flattenTokens(tree)`  — { 'color.brand.500': '#3858e9', ... }
 *                              keys are dot paths; values are CSS strings.
 *   - `resolveAlias(map, alias)` — look up an alias path against a flat
 *                                   map; follow chains until literal.
 *
 * Pure ESM, no React, no DOM. The webpack tree shaker drops it from
 * the bundle if it's never imported (e.g. when the runtime config has
 * no tokens block).
 */

const ALIAS_RE = /^\{([^}]+)\}$/;
const MAX_ALIAS_DEPTH = 16;

/**
 * Walk a DTCG tree and emit one entry per leaf token. Non-leaf nodes
 * may declare a default `$type` that descendants inherit (DTCG group
 * type inheritance, spec §6).
 */
export function flattenTokens( tree ) {
	if ( ! tree || typeof tree !== 'object' ) {
		return {};
	}
	const flat = {};
	walk( tree, [], null, flat );
	resolveAliases( flat );
	return flat;
}

function walk( node, path, inheritedType, flat ) {
	if ( node === null || node === undefined ) {
		return;
	}

	if ( isDtcgToken( node ) ) {
		const type = node.$type || inheritedType || null;
		flat[ path.join( '.' ) ] = coerce( node.$value, type );
		return;
	}

	if ( typeof node !== 'object' ) {
		// Naked literal (e.g. shorthand authoring without a DTCG envelope).
		flat[ path.join( '.' ) ] = coerce( node, inheritedType );
		return;
	}

	const groupType = typeof node.$type === 'string' ? node.$type : inheritedType;
	for ( const [ key, value ] of Object.entries( node ) ) {
		if ( key.startsWith( '$' ) ) {
			continue;
		}
		walk( value, [ ...path, key ], groupType, flat );
	}
}

function isDtcgToken( node ) {
	return node && typeof node === 'object' && '$value' in node;
}

/**
 * Resolve `{path}` aliases inside the flat map. Mutates in place to
 * keep the API single-pass for callers. Cycles emit the original raw
 * alias string and a console.warn in development.
 */
function resolveAliases( flat ) {
	for ( const key of Object.keys( flat ) ) {
		flat[ key ] = resolveOne( flat, flat[ key ], new Set(), 0 );
	}
}

function resolveOne( flat, raw, seen, depth ) {
	if ( typeof raw !== 'string' ) {
		return raw;
	}
	const match = raw.match( ALIAS_RE );
	if ( ! match ) {
		return raw;
	}
	if ( depth >= MAX_ALIAS_DEPTH ) {
		warn( `tokens.json alias chain exceeded ${ MAX_ALIAS_DEPTH } at "${ match[ 1 ] }"` );
		return raw;
	}
	const target = match[ 1 ];
	if ( seen.has( target ) ) {
		warn( `tokens.json alias cycle on "${ target }"` );
		return raw;
	}
	if ( ! ( target in flat ) ) {
		// Unresolved alias — leave the raw `{path}` string so the
		// caller (compileStyles) can either fall back to a CSS var()
		// reference or warn.
		return raw;
	}
	seen.add( target );
	return resolveOne( flat, flat[ target ], seen, depth + 1 );
}

/**
 * Look up an alias path against a resolved flat map. Returns the
 * literal CSS string, or the raw alias if no match. Used by
 * compileStyles when an admin.json `styles` slot aliases a tokens.json
 * path.
 */
export function resolveAlias( flat, aliasPath ) {
	if ( ! flat || typeof aliasPath !== 'string' ) {
		return null;
	}
	if ( ! ( aliasPath in flat ) ) {
		return null;
	}
	return flat[ aliasPath ];
}

/* ─────────────────────── DTCG type coercion ─────────────────────── */

/**
 * Coerce a DTCG `$value` into a CSS string. Cases handled (per W3C
 * DTCG 2025.10 — covers the leaf and lightly-composite types apps
 * commonly consume):
 *
 *   color      — pass through (string)
 *   dimension  — { value, unit } → "1px"
 *   number     — as-is, stringified
 *   fontWeight — 400 / "bold" / "regular" → "400"
 *   fontFamily — ["A", "B"] → 'A, B'
 *   duration   — { value, unit } → "200ms"
 *   cubicBezier — [x1,y1,x2,y2] → "cubic-bezier(...)"
 *   border     — { width, style, color } → "1px solid #..."
 *   shadow     — { offsetX, offsetY, blur, spread, color } → "..."
 *   strokeStyle — "solid"
 *
 * Composite types DTCG defines but this resolver does not coerce
 * (typography, transition, gradient, complex shadow arrays):
 * passed through as the original value. Authors using those types
 * supply CSS-string fallbacks until the resolver gains them.
 */
export function coerce( value, type ) {
	if ( typeof value === 'string' ) {
		return value;
	}
	if ( typeof value === 'number' ) {
		return String( value );
	}
	if ( ! value || typeof value !== 'object' ) {
		return String( value );
	}

	switch ( type ) {
		case 'dimension':
		case 'duration':
			if ( 'value' in value && 'unit' in value ) {
				return `${ value.value }${ value.unit }`;
			}
			break;
		case 'fontFamily':
			if ( Array.isArray( value ) ) {
				return value.map( quoteFamily ).join( ', ' );
			}
			break;
		case 'cubicBezier':
			if ( Array.isArray( value ) && value.length === 4 ) {
				return `cubic-bezier(${ value.join( ', ' ) })`;
			}
			break;
		case 'border':
			if ( value.width && value.style && value.color ) {
				return `${ resolveSubValue( value.width ) } ${ value.style } ${ value.color }`;
			}
			break;
		case 'shadow':
			if ( Array.isArray( value ) ) {
				return value.map( shadowOne ).join( ', ' );
			}
			return shadowOne( value );
		default:
			break;
	}

	if ( Array.isArray( value ) ) {
		return value.join( ', ' );
	}
	return JSON.stringify( value );
}

function shadowOne( s ) {
	if ( ! s || typeof s !== 'object' ) {
		return String( s );
	}
	const ox = resolveSubValue( s.offsetX || '0' );
	const oy = resolveSubValue( s.offsetY || '0' );
	const blur = resolveSubValue( s.blur || '0' );
	const spread = resolveSubValue( s.spread || '0' );
	const color = s.color || 'currentColor';
	const inset = s.inset ? 'inset ' : '';
	return `${ inset }${ ox } ${ oy } ${ blur } ${ spread } ${ color }`.trim();
}

function resolveSubValue( v ) {
	if ( typeof v === 'string' ) {
		return v;
	}
	if ( v && typeof v === 'object' && 'value' in v && 'unit' in v ) {
		return `${ v.value }${ v.unit }`;
	}
	return String( v );
}

function quoteFamily( name ) {
	if ( typeof name !== 'string' ) {
		return String( name );
	}
	return /\s/.test( name ) && ! /^["']/.test( name ) ? `"${ name }"` : name;
}

function warn( message ) {
	if ( typeof console === 'undefined' ) {
		return;
	}
	// eslint-disable-next-line no-console
	console.warn( `[wp-admin-shell] ${ message }` );
}
