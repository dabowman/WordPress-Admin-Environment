/**
 * Autosave routing for the simple editor.
 *
 * Mirrors core's autosaves controller (`WP_REST_Autosaves_Controller::create_item`):
 * for a `draft` / `auto-draft` post the autosave updates the parent record in
 * place (`wp_update_post`), but for any other status — `pending`, `publish`,
 * `private`, scheduled (`future`) — core writes a separate per-user autosave
 * revision and never touches the live record. The shell previously PUT the
 * live record on every 2s debounce regardless of status, clobbering published
 * content (issue #101); this helper restores the core-faithful split.
 *
 * Caveat: core *also* gates the parent-update on the editor being the post
 * author (`(int) $post->post_author === (int) $user_id`). This helper is
 * status-only, so an admin autosaving someone else's draft PUTs the parent
 * where core would have written a revision — a lower-frequency, documented
 * divergence (see app.md).
 */

/**
 * Post statuses where an autosave writes directly to the parent record rather
 * than to a per-user autosave revision.
 *
 * @type {string[]}
 */
export const PARENT_AUTOSAVE_STATUSES = [ 'draft', 'auto-draft' ];

/**
 * Decide where a debounced autosave should write for a given post status.
 *
 * @param {string} [status] Persisted post status (`record.status`).
 * @return {'parent'|'autosave'} `'parent'` flushes the entity edits to the
 *                               live record (`save()`); `'autosave'` posts to
 *                               the per-user autosaves endpoint and leaves the
 *                               live record untouched.
 */
export function autosaveTarget( status ) {
	return PARENT_AUTOSAVE_STATUSES.includes( status ) ? 'parent' : 'autosave';
}
