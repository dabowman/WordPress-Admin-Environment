#!/usr/bin/env node
/**
 * core:desktop chromeless bridge — message envelope contract.
 *
 * The bridge crosses an iframe boundary. Iframe-side JS (rendered by
 * `includes/engines/core-desktop/chromeless-bridge.php`) posts envelopes
 * to the parent; parent-side listener (in `src/apps/desktop-iframe/index.js`)
 * routes them. There is no shared type to keep the two sides in sync —
 * this file is the contract record.
 *
 * Each scenario:
 *   - documents the required envelope shape via a `schema` function
 *     describing what the listener actually reads;
 *   - asserts a hand-built example matches the schema;
 *   - asserts an obvious mis-shape fails.
 *
 * If the parent listener gains a new branch, add a schema entry here so
 * the iframe author has one place to read the protocol.
 */

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

// Reusable predicates.
const isString = ( v ) => typeof v === 'string';
const isNonEmptyString = ( v ) => typeof v === 'string' && v.length > 0;
const isPlainObject = ( v ) =>
	v && typeof v === 'object' && ! Array.isArray( v );

/**
 * Message-type → predicate. Mirror of the `switch` chain in
 * `src/apps/desktop-iframe/index.js`'s `onMessage` handler. Keep in
 * lockstep; the listener is the only authority for which envelope keys
 * are read.
 */
const CONTRACTS = {
	'wp-admin-shell-iframe-ready': ( m ) =>
		isPlainObject( m ) &&
		m.type === 'wp-admin-shell-iframe-ready' &&
		isNonEmptyString( m.url ),
	'wp-admin-shell-focus-request': ( m ) =>
		isPlainObject( m ) && m.type === 'wp-admin-shell-focus-request',
	'wp-admin-shell-admin-link': ( m ) =>
		isPlainObject( m ) &&
		m.type === 'wp-admin-shell-admin-link' &&
		isNonEmptyString( m.url ) &&
		// label is optional but, when present, must be string.
		( m.label === undefined || isString( m.label ) ),
	'wp-admin-shell-external-link': ( m ) =>
		isPlainObject( m ) &&
		m.type === 'wp-admin-shell-external-link' &&
		isNonEmptyString( m.url ),
};

// ── positive: each documented type has a valid example ─────────────

console.log( '\n— message envelopes match the parent listener contract —' );

ok(
	'iframe-ready envelope: type + url',
	CONTRACTS[ 'wp-admin-shell-iframe-ready' ]( {
		type: 'wp-admin-shell-iframe-ready',
		url: 'http://example.test/wp-admin/edit.php?wp_admin_shell_chromeless=1',
		userAgent: 'Mozilla/5.0',
	} )
);

ok(
	'focus-request envelope: type only',
	CONTRACTS[ 'wp-admin-shell-focus-request' ]( {
		type: 'wp-admin-shell-focus-request',
	} )
);

ok(
	'admin-link envelope: type + url + optional label',
	CONTRACTS[ 'wp-admin-shell-admin-link' ]( {
		type: 'wp-admin-shell-admin-link',
		url: 'edit.php?post_type=page',
		label: 'Pages',
	} )
);

ok(
	'admin-link envelope: label omitted is valid',
	CONTRACTS[ 'wp-admin-shell-admin-link' ]( {
		type: 'wp-admin-shell-admin-link',
		url: 'edit.php',
	} )
);

ok(
	'external-link envelope: type + url',
	CONTRACTS[ 'wp-admin-shell-external-link' ]( {
		type: 'wp-admin-shell-external-link',
		url: 'https://wordpress.org/',
	} )
);

// ── negative: missing required keys must reject ────────────────────

console.log( '\n— envelopes missing required keys are rejected —' );

ok(
	'admin-link without url rejected',
	! CONTRACTS[ 'wp-admin-shell-admin-link' ]( {
		type: 'wp-admin-shell-admin-link',
	} )
);

ok(
	'external-link without url rejected',
	! CONTRACTS[ 'wp-admin-shell-external-link' ]( {
		type: 'wp-admin-shell-external-link',
	} )
);

ok(
	'admin-link with non-string label rejected',
	! CONTRACTS[ 'wp-admin-shell-admin-link' ]( {
		type: 'wp-admin-shell-admin-link',
		url: 'edit.php',
		label: 42,
	} )
);

ok(
	'iframe-ready with missing url rejected',
	! CONTRACTS[ 'wp-admin-shell-iframe-ready' ]( {
		type: 'wp-admin-shell-iframe-ready',
	} )
);

// ── type-prefix invariant the listener enforces ────────────────────

console.log( '\n— listener type-prefix invariant —' );

const TYPE_PREFIX = 'wp-admin-shell-';
ok(
	'every contracted type starts with the wp-admin-shell- prefix',
	Object.keys( CONTRACTS ).every( ( t ) => t.startsWith( TYPE_PREFIX ) )
);

console.log( '\n— Summary —' );
console.log( `PASS: ${ pass }  FAIL: ${ fail }` );
if ( fail > 0 ) {
	process.exit( 1 );
}
