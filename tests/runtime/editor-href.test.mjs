#!/usr/bin/env node
/**
 * Editor-link target resolution tests
 * (`src/apps/_shared/navigation/editorHref.mjs` — issue #21 + Tier 1 of
 * `docs/block-editor-native-port.md`).
 *
 * Pins three behaviors:
 *
 * 1. Workspace-route hash building (issue #21, unchanged): per-post-type
 *    segment selection (core `post`/`page` keep their pluralized paths;
 *    other post types route under their own id) and URL-encoding of the id
 *    segment — the fix for site-editor post types whose slug-shaped ids
 *    (`theme//slug`) would otherwise split the hash into empty route
 *    segments and break `matchRoute`.
 * 2. Classic-handoff href building (Tier 1): relative `post.php` /
 *    `post-new.php` URLs that the admin-link interceptor passes through as
 *    a top-level navigation.
 * 3. Target resolution: workspace hash when the compiled runtime `routes`
 *    block declares a matching editor / add-new route, classic handoff
 *    otherwise — the signal that keeps `single-pane-demo`'s native
 *    `core:simple-editor` flow in-workspace while `wp-admin-default`
 *    hands off.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname( fileURLToPath( import.meta.url ) );
const projectRoot = resolve( __dirname, '..', '..' );

const {
	editHref,
	editorSegment,
	classicEditHref,
	classicNewHref,
	hasWorkspaceRoute,
	hasWorkspaceEditRoute,
	editTargetHref,
	newTargetHref,
} = await import(
	resolve( projectRoot, 'src/apps/_shared/navigation/editorHref.mjs' )
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

console.log( '\n— falsy post types all default to the post segment —' );
{
	eq( 'undefined → posts', editorSegment( undefined ), 'posts' );
	eq( 'null → posts', editorSegment( null ), 'posts' );
	// Empty string is unreachable from current callers (they default via
	// `config.postType || 'post'`), but the guard must not build a broken
	// `#//{id}/edit` hash if one ever slips through.
	eq( 'empty string → posts', editorSegment( '' ), 'posts' );
	eq(
		'empty-string edit href is not segment-less',
		editHref( '', 42 ),
		'#/posts/42/edit'
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
	const broken = matchPattern( pattern, '/wp_template/theme//slug/edit' );
	ok( 'un-encoded slug-shaped id fails to match', broken === null );
}

console.log( '\n— classic handoff hrefs are relative admin URLs —' );
{
	eq(
		'classic edit href',
		classicEditHref( 42 ),
		'post.php?post=42&action=edit'
	);
	eq(
		'classic edit href encodes the id',
		classicEditHref( 'a&b' ),
		'post.php?post=a%26b&action=edit'
	);
	eq(
		'classic new href for post is bare',
		classicNewHref( 'post' ),
		'post-new.php'
	);
	eq(
		'classic new href for page carries post_type',
		classicNewHref( 'page' ),
		'post-new.php?post_type=page'
	);
	eq(
		'classic new href for a CPT carries post_type',
		classicNewHref( 'product' ),
		'post-new.php?post_type=product'
	);
	ok(
		'classic hrefs never start with a slash (resolve under the admin root)',
		! classicEditHref( 1 ).startsWith( '/' ) &&
			! classicNewHref( 'page' ).startsWith( '/' )
	);
}

console.log( '\n— workspace-route detection —' );
{
	// The single-pane-demo shape: native editor screens declared.
	const nativeRoutes = {
		'/posts': { app: 'core:posts' },
		'/posts/new': { app: 'core:simple-editor' },
		'/posts/{id}/edit': { app: 'core:simple-editor' },
		'/pages/{id}/edit': { app: 'core:simple-editor' },
	};
	// The wp-admin-default (Tier 1) shape: list screens only.
	const handoffRoutes = {
		'/posts': { app: 'core:posts' },
		'/pages': { app: 'core:posts' },
		'@detail/posts/{id}/edit': { app: 'core:editor' },
	};

	ok(
		'edit route detected for post',
		hasWorkspaceEditRoute( nativeRoutes, 'post' )
	);
	ok(
		'edit route detected for page',
		hasWorkspaceEditRoute( nativeRoutes, 'page' )
	);
	ok(
		'no edit route for an undeclared post type',
		! hasWorkspaceEditRoute( nativeRoutes, 'product' )
	);
	ok(
		'list-only routes yield no edit route',
		! hasWorkspaceEditRoute( handoffRoutes, 'post' )
	);
	ok(
		'slot-namespaced routes never count as primary edit routes',
		! hasWorkspaceRoute( handoffRoutes, '/posts/{id}/edit' )
	);
	ok(
		'null routes yield no edit route',
		! hasWorkspaceEditRoute( null, 'post' )
	);
	ok(
		'exact-route check honors only own keys',
		hasWorkspaceRoute( nativeRoutes, '/posts/new' ) &&
			! hasWorkspaceRoute( nativeRoutes, '/pages/new' ) &&
			! hasWorkspaceRoute( nativeRoutes, 'toString' )
	);
}

console.log( '\n— target resolution: workspace route wins, else classic —' );
{
	const nativeRoutes = {
		'/posts/new': { app: 'core:simple-editor' },
		'/posts/{id}/edit': { app: 'core:simple-editor' },
	};

	eq(
		'declared edit route → workspace hash',
		editTargetHref( 'post', 42, nativeRoutes ),
		'#/posts/42/edit'
	);
	eq(
		'undeclared edit route → classic handoff',
		editTargetHref( 'post', 42, {} ),
		'post.php?post=42&action=edit'
	);
	eq(
		'undeclared page edit route → classic handoff',
		editTargetHref( 'page', 7, nativeRoutes ),
		'post.php?post=7&action=edit'
	);
	eq(
		'declared add-new route → workspace hash',
		newTargetHref( 'post', nativeRoutes ),
		'#/posts/new'
	);
	eq(
		'undeclared add-new route → classic handoff',
		newTargetHref( 'page', nativeRoutes ),
		'post-new.php?post_type=page'
	);
	eq(
		'segment override (toolbar rest_base) checks that segment',
		newTargetHref( 'post', nativeRoutes, 'posts' ),
		'#/posts/new'
	);
	eq(
		'segment override misses → classic with the post type slug',
		newTargetHref( 'product', nativeRoutes, 'products' ),
		'post-new.php?post_type=product'
	);
}

console.log( `\n${ pass } passed, ${ fail } failed` );
process.exit( fail === 0 ? 0 : 1 );
