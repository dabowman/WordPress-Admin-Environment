#!/usr/bin/env node
/**
 * End-to-end: compileStyles consumes resolved tokens.json (V2.M5).
 *
 * tokens-resolver.test covers the resolver alone. This suite verifies
 * the integration: when admin.json `styles` aliases `{color.brand.500}`
 * and tokens.json declares that path, compileStyles emits the literal
 * value (not the var(...) fallback).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname   = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

// compileStyles imports React-free deps so it loads cleanly under node.
const { compileStyles } = await import(
	resolve( projectRoot, 'src/runtime/engines/core-default/compileStyles.mjs' )
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

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	ok( label, a === e, a === e ? '' : `expected ${ e }, got ${ a }` );
}

// Note: the happy-path "alias resolves to tokens.json literal" lives in
// spec-worked-example.test.mjs as the canonical home (pins spec §9.1).
// This suite focuses on the edge cases below.

console.log( '\n— unresolved alias falls back to var() —' );
{
	const styles = {
		color: {
			bg: { interactive: { brand: { strong: '{color.brand.999}' } } },
		},
	};
	const compiled = compileStyles( styles, {
		color: { $type: 'color', brand: { 500: { $value: '#3858e9' } } },
	} );
	const value = compiled.top[ '--wpds-color-bg-interactive-brand-strong' ];
	ok( 'unresolved alias emits var()', value && value.startsWith( 'var(' ) );
}

console.log( '\n— within-doc alias still wins —' );
{
	const styles = {
		color: {
			bg:    { interactive: { brand: { strong: '#fafafa' } } },
			pri:   { interactive: { brand: { strong: '{styles.color.bg.interactive.brand.strong}' } } },
		},
	};
	const compiled = compileStyles( styles, {
		color: { $type: 'color', brand: { strong: { $value: '#000000' } } },
	} );
	eq(
		'styles.* alias prefers admin.json tree',
		compiled.top[ '--wpds-color-pri-interactive-brand-strong' ],
		'#fafafa'
	);
}

console.log( '\n— missing tokens arg keeps var() fallback —' );
{
	const styles = {
		color: { bg: { interactive: { brand: { strong: '{color.brand.500}' } } } },
	};
	const compiled = compileStyles( styles ); // no tokens
	const value = compiled.top[ '--wpds-color-bg-interactive-brand-strong' ];
	ok( 'missing tokens emits var()', value && value.startsWith( 'var(' ) );
}

console.log( '\n— canvas binding does not darken card surface —' );
{
	// Regression guard: a previous shape bound `canvas.background` to
	// `--wpds-color-bg-surface-neutral` inside the layout scope, which
	// then re-darkened every `core:main` / `core:detail` card (their
	// `default-style` reads `--wpds-color-bg-surface-neutral` as the
	// final fallback when no chrome-content-card-background slot is
	// authored). The canvas binding now ships `foreground` only;
	// authoring `chrome.canvas.background` must not emit a scoped WPDS
	// override that descends into card content.
	const styles = {
		theme: { color: { bg: '#ffffff' } },
		chrome: {
			canvas: { background: '#1e1e1e', foreground: '#e0e0e0' },
		},
	};
	const compiled = compileStyles( styles, {} );
	const canvasScope = ( compiled.scoped || [] ).find(
		( entry ) => entry.selector === '.wp-admin-workspaces-layout'
	);
	const offending = canvasScope?.vars?.[ '--wpds-color-bg-surface-neutral' ];
	ok(
		'canvas.background does not emit --wpds-color-bg-surface-neutral',
		offending === undefined,
		offending !== undefined
			? `surface-neutral scoped to .wp-admin-workspaces-layout = ${ offending } (darkens cards)`
			: ''
	);
	ok(
		'canvas.foreground still binds (--wpds-color-fg-content-neutral)',
		canvasScope?.vars?.[ '--wpds-color-fg-content-neutral' ] === '#e0e0e0'
	);
	const topBg = compiled.top[ '--wp-admin-workspaces--chrome--canvas--background' ];
	ok(
		'canvas.background still emits the chrome slot at top scope',
		topBg === '#1e1e1e'
	);
}

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
