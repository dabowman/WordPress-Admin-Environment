# core:dashboard-widget-recent-posts

Lists the five most recently modified post drafts. Ported from `core:dashboard`'s recent-drafts card. Eligible for the dashboard widget grid via its `dashboardWidget` manifest block.

## Rebuild guide

- Query `postType/post` with `{ per_page: 5, status: 'draft', orderby: 'modified', order: 'desc', context: 'edit' }`.
- Render each row as a clickable title + modified-date.
- Click → `navigate('#/posts/{id}/edit')`.

## Known limitations

- Only `post` post-type; other CPTs would need their own widget instance.
- No pagination — five rows max.
