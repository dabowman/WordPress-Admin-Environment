/**
 * Editor-route hash builder for PostsApp (issue #21).
 *
 * PostsApp is rebindable to any post type via `config.postType`, so the editor
 * route it links rows to must vary per post type. The two core editable types
 * keep their established pluralized paths (`/posts/{id}/edit`,
 * `/pages/{id}/edit`); every other post type routes under a segment matching
 * its post type id, so a workspace mounting PostsApp over, say, `wp_template`
 * declares the matching `/wp_template/{id}/edit` route.
 *
 * The id is URL-encoded. Numeric post ids pass through unchanged, but the
 * site-editor post types (`wp_template`, `wp_block`, `wp_navigation`) carry
 * slug-shaped ids like `theme//slug` whose `//` would split the hash into empty
 * route segments and break `matchRoute` (its param matcher is `[^/]+`, a single
 * non-slash segment). `encodeURIComponent` collapses such an id into one safe
 * segment (`theme%2F%2Fslug`); the consuming editor app decodes `config.id`
 * back before use.
 *
 * Pure ESM (no DOM, no React) so node test scripts can import it directly. App
 * code imports with the explicit `.mjs` extension (webpack's default
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
	return EDITOR_SEGMENTS[ postType ] ?? String( postType ?? 'post' );
}

/**
 * Build the URL hash that opens a record's editor route.
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
