# core:dashboard-widget-recent-posts

Lists the five most recently modified post drafts. Ported from `core:dashboard`'s recent-drafts card. Eligible for the dashboard widget grid via its `dashboardWidget` manifest block.

## Rebuild guide

- Query `postType/post` with `{ per_page: 5, status: 'draft', orderby: 'modified', order: 'desc', context: 'edit' }`.
- Render each row as a clickable title + modified-date.
- Each draft title is a real anchor whose href resolves via `editTargetHref('post', id, routes)` — the workspace editor route when the active workspace declares one, the classic `post.php?post={id}&action=edit` handoff otherwise (Tier 1, `docs/block-editor-native-port.md`).

## Known limitations

- Only `post` post-type; other CPTs would need their own widget instance.
- No pagination — five rows max.
