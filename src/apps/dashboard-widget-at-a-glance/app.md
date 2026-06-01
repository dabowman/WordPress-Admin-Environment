# core:dashboard-widget-at-a-glance

Site-wide counts tile, decomposed from the retired `core:dashboard` monolith (issue #133). Mirrors wp-admin's "At a Glance" box.

## Rebuild guide

- Query four entities with `per_page: 1` + `_fields: id` and read each result's `totalItems` (the `X-WP-Total` header):
  - `postType/post` `{ status: 'publish', context: 'edit' }` → published posts.
  - `postType/page` `{ status: 'publish', context: 'edit' }` → published pages.
  - `root/comment` `{ status: 'hold', context: 'edit' }` → pending comments.
  - `root/user` → registered users.
- Render four labelled counts; show a `Spinner` per slot while its query resolves.

## Known limitations

- Counts are **site-wide** by design — NOT author-scoped. Per issue #133's design note, only Recent Drafts is author-scoped; the At-a-Glance counts report the whole site (matching wp-admin).
- Fixed four-metric set; no plugin extension surface (a future widget could read additional post types).
- No deep-link from a count to its filtered list yet (wp-admin links each count to its list screen).
