#!/usr/bin/env node
/**
 * Admin-link interceptor tests (W4).
 *
 * Covers the pure classification helpers (click eligibility, anchor
 * eligibility, legacy-route matching, full classify) plus the DOM-install
 * wiring against a fake document/anchor/event so it runs dependency-free
 * under `node` (chained from `npm run test:runtime`).
 *
 * Run: `node tests/runtime/admin-link-interceptor.test.mjs`.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const {
	isInterceptableClick,
	isInterceptableAnchor,
	matchLegacyRoute,
	classifyAdminLink,
	installAdminLinkInterceptor,
} = await import(
	resolve( projectRoot, 'src/runtime/navigation/adminLinkInterceptor.mjs' )
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
	'/posts': { legacy_path: 'edit.php', legacy_query: { post_type: 'post' } },
	'/posts/{id}': {
		legacy_path: 'post.php',
		legacy_query: { action: 'edit' },
		legacy_params: { id: 'post' },
	},
	'/x/{foo}': { legacy_path: 'thing.php' },
};

// ── isInterceptableClick ───────────────────────────────────────────

console.log( '— isInterceptableClick —\n' );

ok( 'plain primary click', isInterceptableClick( { button: 0 } ) === true );
ok(
	'defaultPrevented → no',
	isInterceptableClick( { button: 0, defaultPrevented: true } ) === false
);
ok( 'middle button → no', isInterceptableClick( { button: 1 } ) === false );
ok(
	'metaKey → no',
	isInterceptableClick( { button: 0, metaKey: true } ) === false
);
ok(
	'ctrlKey → no',
	isInterceptableClick( { button: 0, ctrlKey: true } ) === false
);
ok(
	'shiftKey → no',
	isInterceptableClick( { button: 0, shiftKey: true } ) === false
);
ok(
	'altKey → no',
	isInterceptableClick( { button: 0, altKey: true } ) === false
);
ok( 'null event → no', isInterceptableClick( null ) === false );

// ── isInterceptableAnchor ──────────────────────────────────────────

console.log( '\n— isInterceptableAnchor —\n' );

ok( 'bare anchor', isInterceptableAnchor( {} ) === true );
ok( 'target=_self ok', isInterceptableAnchor( { target: '_self' } ) === true );
ok(
	'target=_blank → no',
	isInterceptableAnchor( { target: '_blank' } ) === false
);
ok( 'download → no', isInterceptableAnchor( { hasDownload: true } ) === false );
ok(
	'rel external → no',
	isInterceptableAnchor( { rel: 'external noopener' } ) === false
);
ok( 'rel noopener ok', isInterceptableAnchor( { rel: 'noopener' } ) === true );

// ── matchLegacyRoute ───────────────────────────────────────────────

console.log( '\n— matchLegacyRoute —\n' );

ok(
	'edit.php?post_type=page → /pages',
	matchLegacyRoute(
		'edit.php',
		new URLSearchParams( 'post_type=page' ),
		ROUTES
	) === '/pages'
);
ok(
	'edit.php?post_type=post → /posts',
	matchLegacyRoute(
		'edit.php',
		new URLSearchParams( 'post_type=post' ),
		ROUTES
	) === '/posts'
);
ok(
	'edit.php?post_type=book → null (no match)',
	matchLegacyRoute(
		'edit.php',
		new URLSearchParams( 'post_type=book' ),
		ROUTES
	) === null
);
ok(
	'unknown script → null',
	matchLegacyRoute( 'nope.php', new URLSearchParams( '' ), ROUTES ) === null
);
ok(
	'param interpolation post.php?post=42&action=edit → /posts/42',
	matchLegacyRoute(
		'post.php',
		new URLSearchParams( 'post=42&action=edit' ),
		ROUTES
	) === '/posts/42'
);
ok(
	'same-name token fallback thing.php?foo=7 → /x/7',
	matchLegacyRoute( 'thing.php', new URLSearchParams( 'foo=7' ), ROUTES ) ===
		'/x/7'
);

// Specificity: a bare entry must not shadow a more-constrained sibling.
const GREEDY = {
	'/all-posts': { legacy_path: 'edit.php' },
	'/just-pages': {
		legacy_path: 'edit.php',
		legacy_query: { post_type: 'page' },
	},
};
ok(
	'specific entry wins over bare sibling (edit.php?post_type=page → /just-pages)',
	matchLegacyRoute(
		'edit.php',
		new URLSearchParams( 'post_type=page' ),
		GREEDY
	) === '/just-pages'
);
ok(
	'bare entry still matches when no constraint present (edit.php → /all-posts)',
	matchLegacyRoute( 'edit.php', new URLSearchParams( '' ), GREEDY ) ===
		'/all-posts'
);

// ── classifyAdminLink ──────────────────────────────────────────────

console.log( '\n— classifyAdminLink —\n' );

const classify = ( href, raw = href ) =>
	classifyAdminLink( {
		rawHref: raw,
		resolvedHref: href,
		adminUrl: ADMIN_URL,
		routes: ROUTES,
	} );

ok( 'empty resolved → pass', classify( '' ).action === 'pass' );
ok( 'hash link → pass', classify( ADMIN_URL, '#/posts' ).action === 'pass' );
ok(
	'cross-origin → pass',
	classify( 'https://other.test/wp-admin/edit.php?post_type=page' ).action ===
		'pass'
);
ok(
	'outside admin path → pass',
	classify( 'https://site.test/wp-login.php' ).action === 'pass'
);
ok(
	'RPC admin-ajax.php → pass',
	classify( ADMIN_URL + 'admin-ajax.php?action=x' ).action === 'pass'
);
ok(
	'classic=1 toggle → pass',
	classify( ADMIN_URL + '?classic=1' ).action === 'pass'
);
ok(
	'classic=0 toggle → pass',
	classify( ADMIN_URL + '?classic=0' ).action === 'pass'
);

const hit = classify( ADMIN_URL + 'edit.php?post_type=page' );
ok(
	'mapped admin link → route',
	hit.action === 'route' && hit.hashRoute === '/pages'
);

const hit2 = classify( ADMIN_URL + 'post.php?post=42&action=edit' );
ok(
	'mapped param link → route /posts/42',
	hit2.action === 'route' && hit2.hashRoute === '/posts/42'
);

ok(
	'unmapped admin page → iframe',
	classify( ADMIN_URL + 'options-general.php' ).action === 'iframe'
);
ok(
	'plugin page admin.php?page=foo → iframe',
	classify( ADMIN_URL + 'admin.php?page=foo' ).action === 'iframe'
);

// ── installAdminLinkInterceptor (fake DOM) ─────────────────────────

console.log( '\n— installAdminLinkInterceptor —\n' );

function fakeDoc() {
	let handler = null;
	return {
		addEventListener( type, fn ) {
			if ( 'click' === type ) {
				handler = fn;
			}
		},
		removeEventListener( type, fn ) {
			if ( 'click' === type && handler === fn ) {
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

function fakeAnchor( attrs ) {
	return {
		href: attrs.href,
		closest() {
			return this;
		},
		getAttribute( name ) {
			return name in attrs ? attrs[ name ] : null;
		},
		hasAttribute( name ) {
			return name in attrs && !! attrs[ name ];
		},
	};
}

function fakeEvent( anchor, over = {} ) {
	return {
		button: 0,
		defaultPrevented: false,
		metaKey: false,
		ctrlKey: false,
		shiftKey: false,
		altKey: false,
		target: anchor,
		prevented: false,
		preventDefault() {
			this.prevented = true;
		},
		...over,
	};
}

const doc = fakeDoc();
let navigatedTo = null;
const uninstall = installAdminLinkInterceptor( ADMIN_URL, {
	routes: ROUTES,
	navigate: ( h ) => {
		navigatedTo = h;
	},
	doc,
} );
ok( 'install attaches a click handler', doc.hasHandler );

const evHit = fakeEvent(
	fakeAnchor( { href: ADMIN_URL + 'edit.php?post_type=page' } )
);
doc.dispatch( evHit );
ok( 'route hit → navigate(/pages)', navigatedTo === '/pages' );
ok( 'route hit → preventDefault', evHit.prevented === true );

navigatedTo = null;
const evBlank = fakeEvent(
	fakeAnchor( {
		href: ADMIN_URL + 'edit.php?post_type=page',
		target: '_blank',
	} )
);
doc.dispatch( evBlank );
ok(
	'target=_blank → not intercepted',
	navigatedTo === null && evBlank.prevented === false
);

navigatedTo = null;
const evMod = fakeEvent(
	fakeAnchor( { href: ADMIN_URL + 'edit.php?post_type=page' } ),
	{ metaKey: true }
);
doc.dispatch( evMod );
ok(
	'cmd-click → not intercepted',
	navigatedTo === null && evMod.prevented === false
);

navigatedTo = null;
const evMiss = fakeEvent(
	fakeAnchor( { href: ADMIN_URL + 'options-general.php' } )
);
doc.dispatch( evMiss );
ok(
	'unmapped (no onUnmatched) → not prevented, browser navigates',
	navigatedTo === null && evMiss.prevented === false
);

uninstall();
ok( 'uninstall removes the handler', ! doc.hasHandler );

// onUnmatched seam
const doc2 = fakeDoc();
let unmatchedHref = null;
installAdminLinkInterceptor( ADMIN_URL, {
	routes: ROUTES,
	navigate: () => {},
	onUnmatched: ( href ) => {
		unmatchedHref = href;
	},
	doc: doc2,
} );
const evUn = fakeEvent(
	fakeAnchor( { href: ADMIN_URL + 'options-general.php' } )
);
doc2.dispatch( evUn );
ok(
	'onUnmatched receives the miss href + prevents default',
	unmatchedHref === ADMIN_URL + 'options-general.php' &&
		evUn.prevented === true
);

console.log( `\n— Summary —\nPASS: ${ pass }  FAIL: ${ fail }` );
process.exit( fail === 0 ? 0 : 1 );
