# core:dashboard-widget-activity

Activity tile, decomposed from the retired `core:dashboard` monolith (issue #133). Mirrors wp-admin's "Activity" box.

## Rebuild guide

- Recently published: query `postType/post` `{ per_page: 5, status: 'publish', orderby: 'date', order: 'desc', context: 'edit' }`; render each row as a click-to-edit title + publish date → `navigate('#/posts/{id}/edit')`.
- Comments awaiting moderation: query `root/comment` `{ per_page: 5, status: 'hold', context: 'edit' }`; render author + stripped-tag excerpt; a `Moderate all` link → `navigate('#/comments')`.
- Show a `Spinner` per section while its query resolves; render distinct empty-state copy per section.

## Known limitations

- Both lists are **site-wide** by design (the Activity box reports everyone's activity, matching wp-admin) — only Recent Drafts is author-scoped (issue #217 / #133).
- Inline approve / spam / trash comment moderation is not yet wired — the tile links out to the Comments screen for actions.
- No "recently commented" / scheduled-posts sub-lists wp-admin's Activity box also shows.
