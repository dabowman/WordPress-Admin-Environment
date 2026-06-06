#!/usr/bin/env node
/**
 * PostsApp editor-route hash builder tests (`src/apps/posts/editHref.mjs`,
 * issue #21).
 *
 * Pins the per-post-type segment selection (core `post`/`page` keep their
 * pluralized paths; other post types route under their own id) and the
 * URL-encoding of the id segment — the fix for site-editor post types whose
 * slug-shaped ids (`theme//slug`) would otherwise split the hash into empty
 * route segments and break `matchRoute`.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const { editHref, editorSegment } = await import(
	resolve( projectRoot, 'src/apps/posts/editHref.mjs' )
);
const { matchPattern } = await import(
	resolve( projectRoot, 'src/runtime/routing/matchRoute.mjs' )
);

let pass = 0;
let fail = 0;

function eq( label, actual, expected ) {
	const a = JSON.stringify( actual );
	const e = JSON.stringify( expected );
	if ( a === e ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label } — expected ${ e }, got ${ a }` );
	}
}

function ok( label, condition, detail = '' ) {
	if ( condition ) {
		pass++;
		console.log( `PASS  ${ label }` );
	} else {
		fail++;
		console.log( `FAIL  ${ label }${ detail ? ' — ' + detail : '' }` );
	}
}

console.log( '\n— core post types keep pluralized segments —' );
{
	eq( 'post → posts', editorSegment( 'post' ), 'posts' );
	eq( 'page → pages', editorSegment( 'page' ), 'pages' );
	eq( 'post edit href', editHref( 'post', 42 ), '#/posts/42/edit' );
	eq( 'page edit href', editHref( 'page', 7 ), '#/pages/7/edit' );
}

console.log( '\n— numeric ids pass through encodeURIComponent unchanged —' );
{
	eq( 'numeric id unchanged', editHref( 'post', 1234 ), '#/posts/1234/edit' );
	eq(
		'string numeric id unchanged',
		editHref( 'post', '1234' ),
		'#/posts/1234/edit'
	);
}

console.log( '\n— other post types route under their own id —' );
{
	eq( 'wp_template segment', editorSegment( 'wp_template' ), 'wp_template' );
	eq( 'wp_block segment', editorSegment( 'wp_block' ), 'wp_block' );
	eq(
		'wp_navigation segment',
		editorSegment( 'wp_navigation' ),
		'wp_navigation'
	);
}

console.log( '\n— slug-shaped ids are URL-encoded into one safe segment —' );
{
	eq(
		'wp_template theme//slug encoded',
		editHref( 'wp_template', 'theme//slug' ),
		'#/wp_template/theme%2F%2Fslug/edit'
	);
	// The encoded id must contain no raw slash, so the hash has exactly the
	// expected segment count (template, id, edit under the post type root).
	ok(
		'encoded id has no raw slash',
		! editHref( 'wp_template', 'theme//slug' )
			.replace( '#/wp_template/', '' )
			.replace( '/edit', '' )
			.includes( '/' )
	);
}

console.log( '\n— encoded id round-trips through matchRoute param capture —' );
{
	// The route an author would declare for a wp_template screen.
	const pattern = '/wp_template/{id}/edit';
	// editHref builds the hash; the path portion (minus the leading `#`) is the
	// value matchRoute sees for the primary slot.
	const value = editHref( 'wp_template', 'theme//slug' ).replace( /^#/, '' );
	const matched = matchPattern( pattern, value );
	ok( 'pattern matches the encoded hash', matched !== null, value );
	eq(
		'captured id is the encoded slug',
		matched && matched.params.id,
		'theme%2F%2Fslug'
	);
	// And decodes back to the original slug-shaped id the editor app consumes.
	eq(
		'captured id decodes to original',
		matched && decodeURIComponent( matched.params.id ),
		'theme//slug'
	);

	// The un-encoded id would have broken matching: `theme//slug` splits into
	// empty segments and `[^/]+` can't span them.
	const broken = matchPattern(
		pattern,
		'/wp_template/theme//slug/edit'
	);
	ok( 'un-encoded slug-shaped id fails to match', broken === null );
}

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
