#!/usr/bin/env node
/**
 * Screenshot helper for reviewing the running wp-env site in a cloud session.
 *
 * Logs into the wp-env dev site and captures a full-page PNG so the agent can
 * visually review a change. Pairs with scripts/cloud-setup.sh, which installs
 * Playwright + Chromium.
 *
 * Usage:
 *   node scripts/screenshot.mjs <path> [outfile.png]
 *
 * Examples:
 *   node scripts/screenshot.mjs /wp-admin/                       admin-home.png
 *   node scripts/screenshot.mjs "/wp-admin/index.php"            dashboard.png
 *   node scripts/screenshot.mjs /                                front.png
 *
 * Env overrides (defaults match wp-env's out-of-the-box dev site):
 *   WP_BASE_URL  (default http://localhost:8888 — use :8889 for the test site)
 *   WP_USER      (default admin)
 *   WP_PASS      (default password)
 *   WP_VIEWPORT  (default 1440x900)
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire( import.meta.url );

// Resolve playwright whether it's a local devDependency or a global install
// (cloud-setup.sh installs it globally to keep package.json untouched).
function loadChromium() {
	try {
		return require( 'playwright' ).chromium;
	} catch {
		const globalRoot = execSync( 'npm root -g' ).toString().trim();
		return require( `${ globalRoot }/playwright` ).chromium;
	}
}

const BASE = process.env.WP_BASE_URL || 'http://localhost:8888';
const USER = process.env.WP_USER || 'admin';
const PASS = process.env.WP_PASS || 'password';
const [ vw, vh ] = ( process.env.WP_VIEWPORT || '1440x900' )
	.split( 'x' )
	.map( ( n ) => parseInt( n, 10 ) );

const target = process.argv[ 2 ] || '/wp-admin/';
const out = process.argv[ 3 ] || 'screenshot.png';

const chromium = loadChromium();
const browser = await chromium.launch();
try {
	const ctx = await browser.newContext( {
		viewport: { width: vw || 1440, height: vh || 900 },
	} );
	const page = await ctx.newPage();

	// Authenticate (skipped automatically if already logged in / no form present).
	await page.goto( `${ BASE }/wp-login.php`, { waitUntil: 'networkidle' } );
	if ( await page.locator( '#user_login' ).count() ) {
		await page.fill( '#user_login', USER );
		await page.fill( '#user_pass', PASS );
		await page.click( '#wp-submit' );
		await page.waitForLoadState( 'networkidle' );
	}

	await page.goto( `${ BASE }${ target }`, { waitUntil: 'networkidle' } );
	await page.screenshot( { path: out, fullPage: true } );
	// eslint-disable-next-line no-console
	console.log( `saved ${ out }  ←  ${ BASE }${ target }` );
} finally {
	await browser.close();
}
