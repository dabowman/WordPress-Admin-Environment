# core:settings-reading

Standalone **Reading Settings** panel. Rebuilds the REST-exposed slice of wp-admin's `options-reading.php` with `@wordpress/dataviews` `DataForm`.

## Overview

Fields over `useEntityRecord('root','site')`:

- **Your homepage displays** — `show_on_front` radio (`posts` vs `page`).
- **Homepage** / **Posts page** — `page_on_front` / `page_for_posts` selects, populated from `postType/page` (published, `_fields=id,title`). Visible only when `show_on_front === 'page'` via DataForm `isVisible`.
- **Blog pages show at most** — `posts_per_page` integer.
- **Syndication feeds show the most recent** — `posts_per_rss` integer.
- **For each post in a feed, include** — `rss_use_excerpt` radio (full text vs excerpt; maps `0`/`1` ↔ boolean).

## Architecture

Thin wrapper around the shared `src/apps/_shared/forms/EntityDataForm`. This app computes the `fields` array (memoized on `pages.records`) and the `form` field order; the shared workspace owns the null-guard spinner, `DataForm`, Save button, and save handler.

`posts_per_page` / `posts_per_rss` clamp to a positive integer (floor 1, default 10) in `setValue` — WordPress treats `0` as invalid and breaks front-end pagination.

Mounted two ways:

- **Directly** as the `settings-reading` screen (`app: "core:settings-reading"`).
- **Composed** inside `core:settings` for the `reading` panel.

## Rebuild guide (non-WPDS / non-React port)

Read the front-page + feed fields from `GET /wp/v2/settings`; fetch published pages (`GET /wp/v2/pages?_fields=id,title&status=publish`) for the two selects; show/hide the page selects on the `show_on_front` value; `POST /wp/v2/settings` on save with the per-page clamp applied.

## Known limitations

Parity gap vs `docs/screens/settings-reading.md`: **search-engine visibility** (`blog_public`, the "discourage search engines" toggle) is not exposed by `/wp/v2/settings`, so it is omitted. The panel renders an in-form notice directing users to the legacy `options-reading.php` screen.
