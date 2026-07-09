/**
 * Editor-link target resolution — workspace route or classic handoff.
 *
 * Tier 1 of the block-editor strategy (`docs/block-editor-native-port.md`)
 * makes full-page handoff to the real editor the DEFAULT: edit/new links are
 * real anchors to classic `post.php` / `post-new.php` that the capture-phase
 * `adminLinkInterceptor` passes through as a top-level navigation. A
 * workspace that ships its OWN editor screen (e.g. the writer workspace's
 * `core:simple-editor` at `/posts/{id}/edit`) keeps in-workspace links: the
 * `editTargetHref` resolver checks the compiled runtime `routes` block for a
 * matching editor route and only falls back to the classic URL when the
 * active workspace declares none. No per-screen config key needed — the
 * workspace's own route declarations are the signal.
 *
 * Classic hrefs are RELATIVE (`post.php?...`, no `/wp-admin/` prefix): the
 * workspace document is always served under the admin root (the hijack owns
 * `/wp-admin/`, `index.php`, `admin.php`), so a relative href resolves to the
 * right script even when WordPress lives in a subdirectory — without this
 * module having to read `window.wpAdminWorkspaces.adminUrl` (it stays pure).
 *
 * Workspace-route mechanics (issue #21, unchanged): the two core editable
 * types keep their established pluralized paths (`/posts/{id}/edit`,
 * `/pages/{id}/edit`); every other post type routes under a segment matching
 * its post type id. The id is URL-encoded — numeric ids pass through, but
 * site-editor post types (`wp_template`, `wp_block`, `wp_navigation`) carry
 * slug-shaped ids like `theme//slug` whose `//` would split the hash into
 * empty route segments and break `matchRoute` (its param matcher is `[^/]+`).
 * `encodeURIComponent` collapses such an id into one safe segment; the
 * consuming editor app decodes `config.id` back before use.
 *
 * Pure ESM (no DOM, no React) so node test scripts can import it directly.
 * App code imports with the explicit `.mjs` extension (webpack's default
 * `resolve.extensions` from `@wordpress/scripts` omits `.mjs`).
 */

// Post types whose editor route uses a pluralized path rather than the post
// type id. Any post type not listed routes under its own id as the segment.
const EDITOR_SEGMENTS = {
	post: 'posts',
	page: 'pages',
};

/**
 * Resolve the editor-route URL segment for a post type.
 *
 * @param {string} postType Post type id (e.g. `post`, `page`, `wp_template`).
 * @return {string} Route segment (`posts` / `pages` / the post type id).
 */
export function editorSegment( postType ) {
	// Falsy input (undefined / null / '') means a caller bug — fall back to
	// the DEFAULT post type's segment rather than building a segment-less
	// `#//{id}/edit` hash (empty string previously slipped past a bare `??`).
	if ( ! postType ) {
		return EDITOR_SEGMENTS.post;
	}
	return EDITOR_SEGMENTS[ postType ] ?? String( postType );
}

/**
 * Build the URL hash that opens a record's WORKSPACE editor route.
 *
 * @param {string}        postType Active post type id from app config.
 * @param {string|number} id       Record id (numeric, or slug-shaped for
 *                                 site-editor post types).
 * @return {string} Editor route hash, e.g. `#/posts/42/edit` or
 *                  `#/wp_template/theme%2F%2Fslug/edit`.
 */
export function editHref( postType, id ) {
	return `#/${ editorSegment( postType ) }/${ encodeURIComponent(
		id
	) }/edit`;
}

/**
 * Build the CLASSIC editor href for a record — the Tier 1 handoff target.
 * Relative on purpose (resolves under the admin root the workspace is
 * served from); render it on a real `<a href>` (or hand it to
 * `followHref`) so the admin-link interceptor governs the click.
 *
 * @param {string|number} id Record id (numeric — `post.php` can't edit the
 *                           slug-shaped site-editor ids).
 * @return {string} `post.php?post={id}&action=edit`.
 */
export function classicEditHref( id ) {
	return `post.php?post=${ encodeURIComponent( id ) }&action=edit`;
}

/**
 * Build the CLASSIC add-new href for a post type. Mirrors core's admin-bar
 * convention: bare `post-new.php` for `post`, explicit `?post_type=` for
 * everything else.
 *
 * @param {string} postType Post type id.
 * @return {string} `post-new.php` / `post-new.php?post_type={type}`.
 */
export function classicNewHref( postType ) {
	if ( ! postType || postType === 'post' ) {
		return 'post-new.php';
	}
	return `post-new.php?post_type=${ encodeURIComponent( postType ) }`;
}

/**
 * Whether the compiled runtime `routes` block declares a primary route at
 * exactly `path`. Slot-namespaced routes (`@detail/...`) never match — a
 * detail-pane editor is a peer mount, not a navigable primary target.
 *
 * @param {Object} routes Runtime routes block (`useKernel().config.routes`).
 * @param {string} path   Primary route path, e.g. `/posts/new`.
 * @return {boolean} True when the route exists.
 */
export function hasWorkspaceRoute( routes, path ) {
	return (
		!! routes &&
		typeof routes === 'object' &&
		Object.prototype.hasOwnProperty.call( routes, path )
	);
}

/**
 * Whether the active workspace declares an editor route for a post type —
 * a primary route shaped `/{segment}/{param}/edit` (any param name).
 *
 * @param {Object} routes   Runtime routes block.
 * @param {string} postType Post type id.
 * @return {boolean} True when a matching editor route exists.
 */
export function hasWorkspaceEditRoute( routes, postType ) {
	if ( ! routes || typeof routes !== 'object' ) {
		return false;
	}
	const segment = editorSegment( postType );
	const escaped = segment.replace( /[.*+?^${}()|[\]\\]/g, '\\$&' );
	const pattern = new RegExp( `^/${ escaped }/\\{[^}]+\\}/edit$` );
	return Object.keys( routes ).some( ( path ) => pattern.test( path ) );
}

/**
 * Resolve the href that opens a record's editor: the workspace editor route
 * when the active workspace declares one, the classic `post.php` URL
 * otherwise (Tier 1 handoff default).
 *
 * @param {string}        postType Active post type id.
 * @param {string|number} id       Record id.
 * @param {Object}        routes   Runtime routes block.
 * @return {string} Hash href or relative classic href.
 */
export function editTargetHref( postType, id, routes ) {
	return hasWorkspaceEditRoute( routes, postType )
		? editHref( postType, id )
		: classicEditHref( id );
}

/**
 * Resolve the href that opens the add-new flow for a post type: the
 * workspace `/{segment}/new` route when declared, classic `post-new.php`
 * otherwise (which replaces the REST auto-draft seeding with core's own
 * server-side auto-draft creation).
 *
 * @param {string} postType  Post type id.
 * @param {Object} routes    Runtime routes block.
 * @param {string} [segment] Route segment override — the toolbar `+New`
 *                           enumerates types by `rest_base`, which is the
 *                           segment its workspace routes key on.
 * @return {string} Hash href or relative classic href.
 */
export function newTargetHref( postType, routes, segment ) {
	const seg = segment || editorSegment( postType );
	return hasWorkspaceRoute( routes, `/${ seg }/new` )
		? `#/${ seg }/new`
		: classicNewHref( postType );
}
