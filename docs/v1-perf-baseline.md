# v1 cold-mount perf baseline

Plan §M5.12 target: under 500 ms cold mount on a baseline laptop.

This file holds the recorded measurement that supports the v1 readiness claim. **Re-run before tagging `1.0.0-beta.2` (or any later cut)** — the methodology lives next to the readings so anyone can reproduce.

## Methodology

1. Plain wp-env install with the plugin active (Gutenberg also active per the runtime dep).
2. Login as administrator, set `wp_admin_shell_active_shell = wp-admin-default`.
3. Open Chrome (or equivalent), DevTools → Network → "Disable cache" + Performance → throttle to **Fast 4G** + **CPU: 4× slowdown**.
4. In Performance, start recording.
5. Hard reload `http://localhost:8888/wp-admin/admin.php?page=wp-admin-shell`.
6. Stop recording when the routed app's first paint settles.
7. Measure from `navigationStart` to first paint of the routable region's first app (the Dashboard iframe for `wp-admin-default`, the Posts list for `developer-admin`).

Repeat 3 times, record the median.

## Readings

> _Populate before tagging. Each row is a `<shell> @ <commit-sha>`._

| Shell | Commit | Cold mount (ms) | Notes |
|---|---|---:|---|
| wp-admin-default  | _pending_ | _pending_ | _pending_ |
| developer-admin   | _pending_ | _pending_ | _pending_ |
| content-author    | _pending_ | _pending_ | _pending_ |
| client-portal     | _pending_ | _pending_ | _pending_ |

Pass if all four shells fall under **500 ms**. Annotate any miss with the network/CPU breakdown so we know which budget got blown.

## What's in the path

- Network: `index.js` (~110 KiB gz), `index.css` (~2.5 KiB gz), `dataviews.css` (~14 KiB gz).
- Parse + execute: kernel registers built-ins, the resolved config arrives via inline `<script>`, token CSS injects.
- React: engine + region tree + the routed app render.
- First app's data: PostsApp (developer-admin) fires `useEntityRecords` query; iframed apps mount the iframe (defer first paint of iframed content from the cold-mount measurement — measure to shell-card paint, not to iframed-content paint).

## What's already memoized

- Resolver cache (M2.7) makes repeat mounts essentially free server-side. The cold-mount measurement assumes a fresh resolver miss; warm hits are dominated by the network + parse cost.

## If the budget blows

- Source-level code splitting (loading plugin sources on demand) is a v3 item per spec §11. v1 ships single-bundle.
- Largest single contributor to bundle size is `@wordpress/dataviews`. Lazy-loading the DataViews-backed apps (Posts/Users/Comments/Media) would shave the cold-mount path.
- Token emission is JS-injected at mount, not server-side. SSR token emission (a `<style>` printed by the PHP enqueue layer from the resolved styles tree) cuts the FOUC window and slightly accelerates first paint.
