#!/usr/bin/env node
/**
 * Tests for the shared iframe chrome-hide CSS builder
 * (`src/apps/_shared/iframe/chromeHide.mjs`).
 *
 * The module is pure ESM (no `@wordpress` deps), so it imports directly under
 * node. These pin the #253 contract: the base WP-admin shell hide always
 * applies, while the fragile block-editor (edit-site) selectors are opt-in via
 * `hideEditorChrome` so the full takeover Editor screen keeps its own chrome
 * and the user's persisted `core/preferences` view.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { BASE_CHROME_HIDE_CSS, EDITOR_CHROME_HIDE_CSS, getChromeHideCss } =
	await import(
		resolve( projectRoot, 'src/apps/_shared/iframe/chromeHide.mjs' )
	);

let passed = 0;
const check = ( name, fn ) => {
	fn();
	passed += 1;
	process.stdout.write( `  ✓ ${ name }\n` );
};

// --- base shell selectors ------------------------------------------------

check( 'BASE hides the wp-admin shell (menu / bar / footer)', () => {
	assert.match( BASE_CHROME_HIDE_CSS, /#adminmenuwrap/ );
	assert.match( BASE_CHROME_HIDE_CSS, /#wpadminbar/ );
	assert.match( BASE_CHROME_HIDE_CSS, /#wpfooter/ );
} );

check( 'BASE does NOT touch the block editor chrome', () => {
	assert.doesNotMatch( BASE_CHROME_HIDE_CSS, /edit-site-/ );
} );

// --- editor (edit-site) selectors ---------------------------------------

check( 'EDITOR carries the fragile edit-site selectors', () => {
	assert.match( EDITOR_CHROME_HIDE_CSS, /edit-site-layout__sidebar/ );
	assert.match( EDITOR_CHROME_HIDE_CSS, /edit-site-site-hub/ );
	assert.match( EDITOR_CHROME_HIDE_CSS, /edit-site-layout__header-container/ );
} );

// --- getChromeHideCss default (opt-in OFF) -------------------------------

check( 'default omits editor chrome (the #253 fix)', () => {
	const css = getChromeHideCss();
	assert.equal( css, BASE_CHROME_HIDE_CSS );
	assert.doesNotMatch( css, /edit-site-/ );
} );

check( 'explicit hideEditorChrome:false omits editor chrome', () => {
	const css = getChromeHideCss( { hideEditorChrome: false } );
	assert.doesNotMatch( css, /edit-site-/ );
} );

// --- getChromeHideCss opt-in ON ------------------------------------------

check( 'hideEditorChrome:true appends editor chrome to the base', () => {
	const css = getChromeHideCss( { hideEditorChrome: true } );
	assert.equal( css, BASE_CHROME_HIDE_CSS + EDITOR_CHROME_HIDE_CSS );
	assert.match( css, /#adminmenuwrap/ );
	assert.match( css, /edit-site-layout__sidebar/ );
} );

process.stdout.write( `\nchrome-hide: ${ passed } checks passed\n` );
