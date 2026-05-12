#!/usr/bin/env node
/**
 * Verify the worked example in spec §9.1 actually runs.
 *
 * Spec §9.1 shows one tokens.json brand color fanning into both
 * admin.json `styles` (WPDS surface, our domain) and theme.json
 * `settings` (frontend palette — WordPress core's theme.json resolver
 * owns that side; not exercised here).
 *
 * Pinning the example as a runnable test keeps the spec from drifting
 * out of sync with the resolver.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { compileStyles } = await import(
	resolve( projectRoot, 'src/runtime/engines/core-default/compileStyles.mjs' )
);
const { flattenTokens } = await import(
	resolve( projectRoot, 'src/runtime/tokens/tokensResolver.mjs' )
);

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

console.log( '\n— spec §9.1 worked example: tokens.json → admin.json styles —' );
{
	// Verbatim from spec §9.1 (DTCG, author-owned shape).
	const tokens = {
		color: {
			$type: 'color',
			brand: { 500: { $value: '#3858e9' } },
		},
	};

	// Verbatim from spec §9.1 (WPDS-shaped consumer slot).
	const styles = {
		color: {
			bg: {
				interactive: { brand: { strong: '{color.brand.500}' } },
			},
		},
	};

	const compiled = compileStyles( styles, tokens );
	ok(
		'WPDS slot picks up the literal brand color',
		compiled.top[ '--wpds-color-bg-interactive-brand-strong' ] === '#3858e9',
		'got: ' + compiled.top[ '--wpds-color-bg-interactive-brand-strong' ]
	);
	ok(
		'no leftover var() fallback for the resolved alias',
		! /var\(/.test(
			compiled.top[ '--wpds-color-bg-interactive-brand-strong' ] || ''
		)
	);
}

console.log( '\n— spec §9.1: theme.json side resolves at the tokens layer —' );
{
	// theme.json's resolver lives in WordPress core, not the shell.
	// What we *can* verify here is that the shell's tokens layer
	// produces the same literal `theme.json` would receive when it
	// resolves `{color.brand.500}` against the merged tokens tree.
	const tokens = {
		color: {
			$type: 'color',
			brand: { 500: { $value: '#3858e9' } },
		},
	};
	const flat = flattenTokens( tokens );
	ok(
		'flat map exposes the brand path verbatim',
		flat[ 'color.brand.500' ] === '#3858e9'
	);
}

console.log( '\n— spec §9.1: re-branding edits one token, fans out —' );
{
	const tokens = {
		color: {
			$type: 'color',
			brand: { 500: { $value: '#7c3aed' } }, // re-brand to purple
		},
	};
	const styles = {
		color: {
			bg:  { interactive: { brand: { strong: '{color.brand.500}' } } },
			fg:  { interactive: { brand: { strong: '{color.brand.500}' } } },
		},
	};
	const compiled = compileStyles( styles, tokens );
	ok(
		'bg slot follows the re-brand',
		compiled.top[ '--wpds-color-bg-interactive-brand-strong' ] === '#7c3aed'
	);
	ok(
		'fg slot also follows the re-brand (single edit, multiple consumers)',
		compiled.top[ '--wpds-color-fg-interactive-brand-strong' ] === '#7c3aed'
	);
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
