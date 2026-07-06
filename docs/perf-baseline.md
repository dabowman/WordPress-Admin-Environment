# v1 cold-mount perf baseline

Plan §M5.12 target: under 500 ms cold mount on a baseline laptop.

This file holds the recorded measurement that supports the v1 readiness claim. **Re-run before tagging `1.0.0-beta.2` (or any later cut)** — the methodology lives next to the readings so anyone can reproduce.

## Methodology

1. Plain wp-env install with the plugin active (on WP 6.7–6.9 also activate Gutenberg per the runtime dep; not needed on 7.0+).
2. Login as administrator, set `wp_admin_workspaces_active_workspace = wp-admin-default` (or drop a `wp-content/workspace.json`).
3. Open Chrome (or equivalent), DevTools → Network → "Disable cache" + Performance → throttle to **Fast 4G** + **CPU: 4× slowdown**.
4. In Performance, start recording.
5. Hard reload `http://localhost:8888/wp-admin/` (the workspace takes over the admin root; the old `admin.php?page=wp-admin-workspaces` entry is gone).
6. Stop recording when the routed app's first paint settles.
7. Measure from `navigationStart` to first paint of the routable region's first app (the Dashboard iframe for `wp-admin-default`, the Posts list for `single-pane-demo`).

Repeat 3 times, record the median.

## Readings

> _Populate before tagging. Each row is a `<workspace> @ <commit-sha>`._

| Workspace | Commit | Cold mount (ms) | Notes |
|---|---|---:|---|
| wp-admin-default  | _pending_ | _pending_ | _pending_ |
| single-pane-demo  | _pending_ | _pending_ | _pending_ |
| desktop-demo      | _pending_ | _pending_ | _pending_ |

Pass if all three workspaces fall under **500 ms**. Annotate any miss with the network/CPU breakdown so we know which budget got blown.

## What's in the path

- Network: `index.js` (boot bundle), `index.css`, `dataviews.css`. Post-C5 the per-app code is no longer in the boot bundle — each app loads on-demand from its own chunk (`build/app-<id>.js`) the first time its region mounts.
- Parse + execute: kernel registers built-ins, the resolved config arrives via inline `<script>`, token CSS injects.
- React: engine + region tree + the routed app render.
- First app's data: PostsApp (single-pane-demo) fires `useEntityRecords` query; iframed apps mount the iframe (defer first paint of iframed content from the cold-mount measurement — measure to workspace-card paint, not to iframed-content paint).

## Bundle size — Track D (C5) lazy app loading

Captured 2026-05-14 with `npm run build` (production). Pre-D = `main` at `e86ed3b`; post-D = `feat/c5-lazy-app-loading`. Webpack auto-extracts a shared vendor chunk; that chunk loads on-demand when its first consumer (any DataViews-backed app) mounts.

| Asset | Pre-D | Post-D | Δ |
|---|---:|---:|---:|
| `index.js` (boot bundle) | 2,164,072 B (2.06 MiB) | 214,289 B (209 KiB) | **−90.1 %** |
| `index.css` | 28,735 B | 20,860 B | −27 % |
| Entrypoint (cold-mount JS+CSS) | 2.12 MiB | 250 KiB | **−88 %** |
| Vendors chunk `245.js` (lazy) | — | 1,832,141 B (1.75 MiB) | new — loaded on first app mount that needs it |
| Lazy per-app chunks `app-*.js` | — | 25 chunks, 973 B – 17,213 B | new — one per non-system app |

Cold-mount for a workspace that mounts only chrome apps (navigation, site-hub, toolbar-actions, notices-banner, notices-snackbar) downloads only the 250 KiB entrypoint plus whichever app chunk the default route mounts and the vendors chunk that app pulls in. A workspace whose default route mounts a non-DataViews app (e.g. `wp-admin-default` → iframe to wp-admin/index.php) can stay below 260 KiB until the user navigates to a DataViews-backed surface.

The 1.75 MiB vendors chunk is the dominant cost for the first DataViews-backed mount. Splitting that further (per-app vendor chunks, or aggressive tree-shaking of `@wordpress/dataviews` re-exports) is a Track E candidate, not in C5 scope.

## Filter-element count requests (entity-CRUD apps)

The Posts / Comments / Users / Media apps fire one extra `per_page=1&_fields=id` REST request per filter value at mount via `useEntityElementCounts`, so the status / role / type filter labels can carry counts (`Published (12)`). Numbers per app:

| App | Cold-mount extra requests | Counted axis |
|---|---:|---|
| Posts    | 6 | `status` — publish, draft, pending, private, future, trash |
| Comments | 4 | `status` — approved, hold, spam, trash |
| Users    | one per role | `roles` — values from the resolved spec |
| Media    | 4 (+1 when a type filter is active) | `media_type` — image, video, audio, application (`All` reuses the main list's `totalItems` when unfiltered) |
| Plugins  | 0 | counts derived client-side from the one-shot unpaginated fetch |

These are part of the cold-mount path for any workspace that lands on one of those screens. wp-admin gets every status count from a single aggregate query (`wp_count_posts` / `wp_count_comments`); the REST API has no per-status aggregate equivalent today, so the fan-out is inherent to the "global counts" design rather than a defect. The cost is bounded (smallest possible payload per request, X-WP-Total off the header) and counts are global so they don't re-fire on every keystroke. Counts are re-fetched after mutations via `invalidateEntityElementCounts`.

If a future REST aggregate endpoint lands (or a `block_editor_rest_api_preload_paths`-style preload for these queries), the fan-out collapses to one round trip.

## What's already memoized

- Resolver cache (M2.7) makes repeat mounts essentially free server-side. The cold-mount measurement assumes a fresh resolver miss; warm hits are dominated by the network + parse cost.

## If the budget blows

- Source-level code splitting (loading plugin sources on demand) is a v3 item per spec §11. v1 ships single-bundle.
- Largest single contributor to bundle size is `@wordpress/dataviews`. Lazy-loading the DataViews-backed apps (Posts/Users/Comments/Media) would shave the cold-mount path.
- Token emission is JS-injected at mount, not server-side. SSR token emission (a `<style>` printed by the PHP enqueue layer from the resolved styles tree) cuts the FOUC window and slightly accelerates first paint.
