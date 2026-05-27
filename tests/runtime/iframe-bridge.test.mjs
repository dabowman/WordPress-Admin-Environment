#!/usr/bin/env node
/**
 * Iframe chromeless-bridge parent-side listener tests (W6).
 *
 * Covers classifyBridgeMessage (admin-link route/iframe split, external-
 * link, ignore cases) and installIframeBridge wiring + origin/source
 * pinning, against a fake window so it runs dependency-free under `node`.
 *
 * Run: `node tests/runtime/iframe-bridge.test.mjs`.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { classifyBridgeMessage, installIframeBridge } = await import(
	resolve( projectRoot, 'src/runtime/platform/iframeBridge.mjs' )
);

let pass = 0;
let fail = 0;
function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

const ADMIN_URL = 'https://site.test/wp-admin/';
const ROUTES = {
	'/pages': { legacy_path: 'edit.php', legacy_query: { post_type: 'page' } },
};
const ctx = { adminUrl: ADMIN_URL, routes: ROUTES };

// ── classifyBridgeMessage ──────────────────────────────────────────

console.log( '— classifyBridgeMessage —\n' );

ok(
	'non-object → ignore',
	classifyBridgeMessage( null, ctx ).type === 'ignore'
);
ok(
	'missing type → ignore',
	classifyBridgeMessage( { url: 'x' }, ctx ).type === 'ignore'
);
ok(
	'unknown type → ignore',
	classifyBridgeMessage( { type: 'wp-admin-shell-iframe-ready' }, ctx )
		.type === 'ignore'
);

const mapped = classifyBridgeMessage(
	{
		type: 'wp-admin-shell-admin-link',
		url: ADMIN_URL + 'edit.php?post_type=page',
	},
	ctx
);
ok(
	'mapped admin-link → navigate /pages',
	mapped.type === 'navigate' && mapped.hashRoute === '/pages'
);

const unmapped = classifyBridgeMessage(
	{
		type: 'wp-admin-shell-admin-link',
		url: ADMIN_URL + 'options-general.php',
	},
	ctx
);
ok(
	'unmapped admin-link → iframe (stay embedded)',
	unmapped.type === 'iframe' &&
		unmapped.href === ADMIN_URL + 'options-general.php'
);

ok(
	'admin-link without url → ignore',
	classifyBridgeMessage( { type: 'wp-admin-shell-admin-link' }, ctx ).type ===
		'ignore'
);

// A 'pass' classification (RPC / classic toggle) must NOT reach iframe.src.
ok(
	'admin-link to RPC endpoint → ignore (not iframe sink)',
	classifyBridgeMessage(
		{
			type: 'wp-admin-shell-admin-link',
			url: ADMIN_URL + 'admin-ajax.php?action=x',
		},
		ctx
	).type === 'ignore'
);
ok(
	'admin-link with classic toggle → ignore (not iframe sink)',
	classifyBridgeMessage(
		{ type: 'wp-admin-shell-admin-link', url: ADMIN_URL + '?classic=1' },
		ctx
	).type === 'ignore'
);

const ext = classifyBridgeMessage(
	{ type: 'wp-admin-shell-external-link', url: 'https://example.com' },
	ctx
);
ok(
	'external-link → external',
	ext.type === 'external' && ext.href === 'https://example.com'
);
ok(
	'external-link without url → ignore',
	classifyBridgeMessage( { type: 'wp-admin-shell-external-link' }, ctx )
		.type === 'ignore'
);

// ── installIframeBridge ────────────────────────────────────────────

console.log( '\n— installIframeBridge —\n' );

function fakeWin() {
	let handler = null;
	return {
		addEventListener( type, fn ) {
			if ( 'message' === type ) {
				handler = fn;
			}
		},
		removeEventListener( type, fn ) {
			if ( 'message' === type && handler === fn ) {
				handler = null;
			}
		},
		dispatch( ev ) {
			if ( handler ) {
				handler( ev );
			}
		},
		get hasHandler() {
			return !! handler;
		},
	};
}

const iframeWindow = { name: 'the-iframe' };
const otherWindow = { name: 'spoofer' };

const win = fakeWin();
let navigatedTo = null;
let iframeNavTo = null;
let externalTo = null;
const uninstall = installIframeBridge( {
	adminUrl: ADMIN_URL,
	routes: ROUTES,
	navigate: ( h ) => {
		navigatedTo = h;
	},
	onIframeNavigate: ( h ) => {
		iframeNavTo = h;
	},
	openExternal: ( h ) => {
		externalTo = h;
	},
	getIframeWindow: () => iframeWindow,
	win,
} );

ok( 'install attaches a message handler', win.hasHandler );

// Wrong origin → dropped.
win.dispatch( {
	origin: 'https://evil.test',
	source: iframeWindow,
	data: {
		type: 'wp-admin-shell-admin-link',
		url: ADMIN_URL + 'edit.php?post_type=page',
	},
} );
ok( 'wrong origin dropped', navigatedTo === null );

// Wrong source → dropped.
win.dispatch( {
	origin: 'https://site.test',
	source: otherWindow,
	data: {
		type: 'wp-admin-shell-admin-link',
		url: ADMIN_URL + 'edit.php?post_type=page',
	},
} );
ok( 'spoofed source dropped', navigatedTo === null );

// Correct origin + source, mapped link → workspace navigate.
win.dispatch( {
	origin: 'https://site.test',
	source: iframeWindow,
	data: {
		type: 'wp-admin-shell-admin-link',
		url: ADMIN_URL + 'edit.php?post_type=page',
	},
} );
ok( 'mapped admin-link navigates workspace', navigatedTo === '/pages' );

// Unmapped link → iframe navigation.
win.dispatch( {
	origin: 'https://site.test',
	source: iframeWindow,
	data: {
		type: 'wp-admin-shell-admin-link',
		url: ADMIN_URL + 'options-general.php',
	},
} );
ok(
	'unmapped admin-link navigates the iframe',
	iframeNavTo === ADMIN_URL + 'options-general.php'
);

// External link.
win.dispatch( {
	origin: 'https://site.test',
	source: iframeWindow,
	data: { type: 'wp-admin-shell-external-link', url: 'https://example.com' },
} );
ok( 'external-link opens externally', externalTo === 'https://example.com' );

uninstall();
ok( 'uninstall removes the handler', ! win.hasHandler );

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
