# core:dashboard

Prose accompanying `app.json#documentation` for the dashboard landing screen.

## Overview

DashboardApp is the post-login landing screen. Five reads compose the page: the acting user (for greeting personalization), published-post count, published-page count, pending-comment count + content, user count. The post + page + user counts all use the **per_page=1 + read X-WP-Total** trick because WordPress core has no REST equivalent for `wp_count_posts` / `wp_count_users` — the alternative would be loading the full list and counting in JS, which we'd rather not do for sites with thousands of posts.

The recent-drafts + pending-comments list cards reuse the same hooks (`useEntityRecords` for `status: 'draft'` / `status: 'hold'`) with `per_page: 5` so we get both the total count and the first five records in one round trip.

## Architecture

`useEntityRecord('root','user', userId || 0)` is the user fetch. The `|| 0` is deliberate: `useEntityRecord` short-circuits when given a falsy id, so this lets the hook stay in render order even when `userId` is missing. Reading `record?.name` / `record?.first_name` falls back gracefully when the lookup fails (which is rare in practice — `wpAdminShell.userId` is always injected).

Time-of-day greeting: `Date.getHours()` partitioned at 12 + 18 (morning / afternoon / evening). Memoized so it doesn't re-evaluate on every render.

Stat cards: a small inline `StatCard` component renders `{ label, value, isLoading }`. The Spinner falls through to `value ?? '—'` when not loading and the count is missing.

Draft + pending-comments cards: the list-or-empty logic is inlined as an IIFE (`{ ( () => {...} )() }`) because the empty-state copy differs per card. A reusable `<ListOrEmpty>` would be nice but doesn't pay back at two consumers.

## Rebuild guide

For a non-`core-data` rebuild:

- Need a count-without-loading-all-rows pattern. With WordPress REST, that means `?per_page=1` + read `X-WP-Total` header. Other backends should expose a `count` endpoint directly.
- Layout: 4-column stat grid + 2-column list-card row. Tailwind `grid-cols-4 / grid-cols-2 gap-4` works directly.
- Greeting: time-of-day partitioning + the user's first name with a fallback to `name`.

A non-WPDS rebuild needs Card, Grid (or CSS grid directly), Stack, Text + Button equivalents and a Spinner.

## Known limitations

- **No Welcome panel.** WordPress dashboard has a "Welcome to WordPress!" widget with quick-start links + theme/customize prompts; this app omits it.
- **No Site Health widget.** The shell ships `core:site-health` as a separate app; the dashboard doesn't show a summary.
- **No WordPress Events and News.** The `api.wordpress.org/events` external feed is omitted.
- **No At a Glance widget compatibility.** WordPress's `dashboard_glance_items` filter lets plugins inject extra "X posts" rows; we don't honor it.
- **Per-status count requests are wasteful** for sites with many post types — each status × post-type pair requires its own round trip. A future iteration could batch via a custom endpoint.
- **Quick Draft is absent.** wp-admin has a Quick Draft widget that lets you write + save a draft inline; the shell expects users to click "Write a post" and land in the editor.
