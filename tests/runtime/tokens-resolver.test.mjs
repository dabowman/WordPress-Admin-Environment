#!/usr/bin/env node
/**
 * Pure-resolver tests for tokens.json (DTCG 2025.10).
 */
import {
	flattenTokens,
	resolveAlias,
	coerce,
} from '../../src/runtime/tokens/tokensResolver.mjs';

let pass = 0;
let fail = 0;

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }` );
		if ( detail ) {
			console.log( `      ${ detail }` );
		}
	}
}

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	ok( label, a === e, a === e ? '' : `expected ${ e }, got ${ a }` );
}

console.log( '\n— flattenTokens basics —' );
{
	const tree = {
		color: {
			$type: 'color',
			brand: { 500: { $value: '#3858e9' } },
		},
	};
	const flat = flattenTokens( tree );
	eq( 'leaf token flattens to dot path', flat[ 'color.brand.500' ], '#3858e9' );
}

console.log( '\n— group $type inheritance —' );
{
	const tree = {
		size: {
			$type: 'dimension',
			small:  { $value: { value: 4, unit: 'px' } },
			medium: { $value: { value: 8, unit: 'px' } },
		},
	};
	const flat = flattenTokens( tree );
	eq( 'small dimension coerces', flat[ 'size.small' ], '4px' );
	eq( 'medium dimension coerces', flat[ 'size.medium' ], '8px' );
}

console.log( '\n— alias resolution —' );
{
	const tree = {
		color: {
			$type: 'color',
			brand: { $value: '#3858e9' },
			accent: { $value: '{color.brand}' },
		},
	};
	const flat = flattenTokens( tree );
	eq( 'alias resolves to literal', flat[ 'color.accent' ], '#3858e9' );
}

console.log( '\n— alias chain —' );
{
	const tree = {
		color: {
			$type: 'color',
			a: { $value: '#fff' },
			b: { $value: '{color.a}' },
			c: { $value: '{color.b}' },
		},
	};
	const flat = flattenTokens( tree );
	eq( 'chain a→b→c resolves', flat[ 'color.c' ], '#fff' );
}

console.log( '\n— alias cycle —' );
{
	const tree = {
		color: {
			$type: 'color',
			a: { $value: '{color.b}' },
			b: { $value: '{color.a}' },
		},
	};
	const flat = flattenTokens( tree );
	ok( 'cycle leaves raw alias on a', flat[ 'color.a' ].includes( '{color.' ) );
	ok( 'cycle leaves raw alias on b', flat[ 'color.b' ].includes( '{color.' ) );
}

console.log( '\n— unresolved alias —' );
{
	const tree = {
		color: { $type: 'color', a: { $value: '{tokens.missing}' } },
	};
	const flat = flattenTokens( tree );
	eq( 'unresolved alias preserved', flat[ 'color.a' ], '{tokens.missing}' );
}

console.log( '\n— resolveAlias lookup —' );
{
	const flat = { 'color.brand.500': '#3858e9' };
	eq( 'resolveAlias hit', resolveAlias( flat, 'color.brand.500' ), '#3858e9' );
	eq( 'resolveAlias miss returns null', resolveAlias( flat, 'color.brand.999' ), null );
}

console.log( '\n— DTCG type coercion —' );
{
	eq( 'string color passthrough',     coerce( '#fff',                   'color' ),      '#fff' );
	eq( 'dimension object',             coerce( { value: 4, unit: 'px' }, 'dimension' ),  '4px' );
	eq( 'number stringified',           coerce( 16,                       'number' ),     '16' );
	eq( 'fontFamily array',             coerce( [ 'Inter', 'Roboto' ],    'fontFamily' ), 'Inter, Roboto' );
	eq( 'fontFamily array w/ space',    coerce( [ 'Helvetica Neue' ],     'fontFamily' ), '"Helvetica Neue"' );
	eq( 'duration object',              coerce( { value: 200, unit: 'ms' }, 'duration' ), '200ms' );
	eq( 'cubic-bezier array',           coerce( [ 0.1, 0.2, 0.3, 0.4 ],   'cubicBezier' ), 'cubic-bezier(0.1, 0.2, 0.3, 0.4)' );
	eq( 'border composite',             coerce( { width: '1px', style: 'solid', color: '#ccc' }, 'border' ), '1px solid #ccc' );
	eq( 'shadow composite',             coerce( { offsetX: '0', offsetY: '2px', blur: '4px', spread: '0', color: 'rgba(0,0,0,0.1)' }, 'shadow' ), '0 2px 4px 0 rgba(0,0,0,0.1)' );
}

console.log( '\n— inline DTCG in subtree —' );
{
	const tree = {
		font: {
			body: {
				size:   { $type: 'dimension', $value: { value: 14, unit: 'px' } },
				family: { $type: 'fontFamily', $value: [ 'system-ui' ] },
			},
		},
	};
	const flat = flattenTokens( tree );
	eq( 'leaf inline $type honored',   flat[ 'font.body.size' ],   '14px' );
	eq( 'fontFamily array honored',    flat[ 'font.body.family' ], 'system-ui' );
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
