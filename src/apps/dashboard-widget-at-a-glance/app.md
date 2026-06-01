# core:dashboard-widget-at-a-glance

Site-wide counts tile, decomposed from the retired `core:dashboard` monolith (issue #133). Mirrors wp-admin's "At a Glance" box.

## Rebuild guide

- Query four entities with `per_page: 1` + `_fields: id` and read each result's `totalItems` (the `X-WP-Total` header — returned in default `view` context, so no `context: 'edit'` is needed for a count):
  - `postType/post` `{ status: 'publish' }` → published posts (`view` context; published content is publicly countable).
  - `postType/page` `{ status: 'publish' }` → published pages (`view` context).
  - `root/comment` `{ status: 'hold', context: 'edit' }` → pending comments (needs `moderate_comments`).
  - `root/user` → registered users.
- Render four labelled counts; show a `Spinner` per slot only on initial load (`isResolving && totalItems === undefined`), not on background refetches.

## Capability behavior

The tile's cap floor is `read`, so any logged-in user mounts it. The published-post and published-page counts use default `view` context and resolve for read-only users (real counts). The pending-comments count uses `context: 'edit'` because it inherently requires `moderate_comments` — read-only users correctly see `—` there rather than a real count. The registered-user count needs `list_users` and likewise degrades to `—` for users without it.

## Known limitations

- Counts are **site-wide** by design — NOT author-scoped. Per issue #133's design note, only Recent Drafts is author-scoped; the At-a-Glance counts report the whole site (matching wp-admin).
- Fixed four-metric set; no plugin extension surface (a future widget could read additional post types).
- No deep-link from a count to its filtered list yet (wp-admin links each count to its list screen).
