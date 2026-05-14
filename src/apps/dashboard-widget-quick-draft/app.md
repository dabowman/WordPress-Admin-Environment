# core:dashboard-widget-quick-draft

Mini form for starting a new draft without leaving the dashboard. Ported from the wp-admin "Quick Draft" dashboard widget.

## Rebuild guide

- Title input + multi-line body input.
- Save button → POST `/wp/v2/posts` with `status: draft`.
- After save, invalidate the recent-drafts widget's query, then navigate to `#/posts/{id}/edit`.
- Seed empty body with `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->` to satisfy WP's empty-post rejection.

## Known limitations

- `post` post-type only.
- Body is plaintext, not block markup.
- No autosave; the user must press Save to persist.
