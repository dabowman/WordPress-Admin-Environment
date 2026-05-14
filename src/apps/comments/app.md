# core:comments

Prose accompanying `app.json#documentation` for the moderation list.

## Overview

CommentsApp replaces `wp-admin/edit-comments.php` for the per-site moderation queue. It surfaces the four moderation actions that matter day-to-day — approve, unapprove, spam, trash — as DataViews row + bulk actions with per-action eligibility predicates so the action menu stays clean: an already-approved comment shows Unapprove (not Approve), an already-spam comment shows nothing destructive remaining, etc.

The non-trash status changes use a **partial saveEntityRecord** pattern: instead of fetching, mutating, and saving the full comment record, the app dispatches `saveEntityRecord('root', 'comment', { id, status })`. WordPress's REST endpoint accepts the partial payload and PATCHes only the status field; this both reduces round-trip size and avoids clobbering concurrent edits.

## Architecture

The `setCommentsStatus` callback is shared across all three status-change actions. It awaits a `Promise.all` of partial saves, invalidates the records query, and fires a success snackbar with the action-specific message. On error, an error notice surfaces `err.message`.

Trash is separate because it's `deleteEntityRecord` (not status change to `trash` — that's a different mechanism in the REST surface). The trash modal mirrors PostsApp's pattern.

The comment content cell uses `dangerouslySetInnerHTML` rather than text-only rendering. This is **safe** because `record.content.rendered` is the output of WordPress core's `wp_filter_comment_content` (kses + the comment-text filter chain) — author-supplied raw HTML has been sanitized server-side before it reaches the REST response. Rendering as HTML preserves the formatted view comment moderators expect.

## Rebuild guide

Two patterns worth preserving:

- **Partial PATCH for single-field updates.** Rebuilds on REST clients other than core-data should mirror this — issue a PATCH with just the changed field, not a full PUT.
- **Per-action eligibility.** DataViews' `isEligible: (item) => ...` predicates filter the action menu per-row. Equivalent: render-time guards inside your action menu component. Worth keeping the action set declarative so the row menu only shows what's reachable from the current state.

A non-WPDS rebuild needs a table with selection + bulk actions, a destructive confirm modal, a notice bus, and a rendered-HTML cell renderer.

## Known limitations

- No reply. wp-admin offers an inline reply form on each row; the v2 design defers this.
- No Quick Edit. wp-admin's row inline-edit (toggleable form for author / email / URL / content) is not wired up.
- No full single-comment Edit screen. wp-admin links to `comment.php?action=editcomment` for a full edit form with parent-comment selector + status switcher; the v2 app surfaces neither the link nor the screen.
- No author/IP/email row-level filtering.
- The Trash action lacks an undo path. wp-admin's edit-comments has a "Undo" snackbar after trash; we issue a plain success snackbar.
- Pagination caps perPage at 100 server-side; the app passes whatever DataViews sends.
