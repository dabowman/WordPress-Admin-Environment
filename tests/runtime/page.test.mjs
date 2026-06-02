#!/usr/bin/env node
/**
 * Tests for the shared <Page> structure helpers
 * (`src/apps/_shared/pageClasses.mjs`).
 *
 * <Page> is the app-layer port of `@wordpress/admin-ui` `Page` — a flex column
 * with an optional header (title / subtitle / actions) above a content area.
 * The component itself can't load under node (it imports `@wordpress/ui` + CSS),
 * so its pure class/structure logic is factored here and pinned by this test:
 * the root/content class composition, the header-visibility decision, and the
 * heading-tag clamp.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { pageClasses, pageHasHeader, headingTag } = await import(
	resolve( projectRoot, 'src/apps/_shared/pageClasses.mjs' )
);

let passed = 0;
const check = ( name, fn ) => {
	fn();
	passed += 1;
	process.stdout.write( `  ✓ ${ name }\n` );
};

// --- pageClasses ---------------------------------------------------------

check( 'pageClasses: defaults (no className, full-bleed)', () => {
	assert.deepEqual( pageClasses(), {
		root: 'wp-admin-shell-page',
		content: 'wp-admin-shell-page__content',
	} );
} );

check( 'pageClasses: hasPadding adds the has-padding modifier', () => {
	assert.equal(
		pageClasses( { hasPadding: true } ).content,
		'wp-admin-shell-page__content has-padding'
	);
} );

check( 'pageClasses: className is appended to the root only', () => {
	const { root, content } = pageClasses( {
		className: 'my-app',
		hasPadding: true,
	} );
	assert.equal( root, 'wp-admin-shell-page my-app' );
	// className must NOT leak onto the content node (so a panel max-width
	// constrains the form, not the page).
	assert.equal( content, 'wp-admin-shell-page__content has-padding' );
} );

check( 'pageClasses: empty className does not add a trailing space', () => {
	assert.equal( pageClasses( { className: '' } ).root, 'wp-admin-shell-page' );
} );

// --- pageHasHeader -------------------------------------------------------

check( 'pageHasHeader: false when every slot is empty', () => {
	assert.equal( pageHasHeader(), false );
	assert.equal( pageHasHeader( { children: 'x' } ), false );
} );

check( 'pageHasHeader: true when any single slot is populated', () => {
	for ( const slot of [
		'title',
		'subTitle',
		'actions',
		'badges',
		'before',
	] ) {
		assert.equal(
			pageHasHeader( { [ slot ]: 'x' } ),
			true,
			`expected header for ${ slot }`
		);
	}
} );

// --- headingTag ----------------------------------------------------------

check( 'headingTag: defaults to h2', () => {
	assert.equal( headingTag(), 'h2' );
	assert.equal( headingTag( undefined ), 'h2' );
} );

check( 'headingTag: honors valid levels 1–6', () => {
	for ( let n = 1; n <= 6; n++ ) {
		assert.equal( headingTag( n ), `h${ n }` );
	}
} );

check( 'headingTag: clamps out-of-range / non-integer to h2', () => {
	assert.equal( headingTag( 0 ), 'h2' );
	assert.equal( headingTag( 7 ), 'h2' );
	assert.equal( headingTag( 2.5 ), 'h2' );
	assert.equal( headingTag( 'x' ), 'h2' );
} );

process.stdout.write( `\nPage helpers: ${ passed } checks passed\n` );
