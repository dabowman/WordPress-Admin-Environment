# Feedback, Feature Requests & To-Dos

Running log for things we notice across sessions. Capture first, triage later. Nothing here is committed work — items move to specs, plans, or commits when promoted.

## How to use

- **Add freely.** When something comes up mid-session — a bug, a paper cut, a feature idea, a doc gap — drop it in `## Inbox` with a date. Don't gate on detail.
- **Triage in batches.** Periodically move Inbox items into `## Triaged` with a status: `now`, `next`, `later`, `won't do`. Add a one-line rationale.
- **Promote when ready.** When a triaged item gets picked up, move it to `## In progress` with a link to the branch / spec / PR. Move to `## Done` once shipped (with commit SHA or PR link). Prune Done items quarterly.
- **One item = one bullet.** Sub-bullets only for context the bullet can't carry alone.

Format per item:

```
- [YYYY-MM-DD] [type] short title — one-line description. (source: who/where, optional)
```

Types: `bug`, `feat`, `chore`, `doc`, `design`, `perf`, `a11y`, `dx`.

---

## Inbox

_New items land here. No triage yet._

- [2026-04-30] [feat] Nav items that drill down AND navigate — clicking a screen-style item should optionally route to an app at the same time it slides to its sub-screen. Example: clicking "Design" navigates to the site editor and opens the Design sub-menu in one action. Today `screen` items only drill down; `app`/`href` items only navigate. Need a combined mode (e.g. `{ "screen": "design", "app": "site-editor", ... }` — clicking triggers both `navigate()` and screen push).
- [2026-04-30] [bug] EditorApp empty-content rejection — new-post flow in `EditorApp.js` doesn't seed placeholder block markup, so REST API rejects with `Content, title, and excerpt are empty`. SimpleEditorApp already seeds `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->`. Mirror fix when EditorApp is next touched.
- [2026-04-30] [chore] `@wordpress/ui` overlay components blocked on WP 6.9 — `Notice`, `Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `IconButton`, form `Select`/`Autocomplete` all transitively pull `@wordpress/theme`, which isn't in the `wp.privateApis` allowlist. Currently using `@wordpress/components` fallbacks. Re-evaluate when WP core allowlists `@wordpress/theme` (track upstream).
- [2026-04-30] [feat] developer-admin "Design" decomposition — drill-down screen exposing `core:posts` over `wp_template` / `wp_block` / `wp_navigation` plus a Styles iframe with chrome hidden. Replaces monolithic site-editor iframe. (source: design memo 2026-04-29)
- [2026-04-30] [doc] Tokens.json primitives layer — three-tier design system w/ proposed `tokens.json` aliased into both `admin.json` and `theme.json` is in master spec but no implementation sketch yet. Need worked example before we can validate the cascade.
- [2026-04-30] [feat] Region+app+layout-engine extension model — pluggable layout engines per region (token contract = engine contract). Master spec describes; needs concrete first non-default engine to prove the boundary.
- [2026-04-30] [feat] 5-origin cascade w/ restrict-only overrides — config resolution order (core → plugin → theme → site → user) with parents able to lock keys against descendants. Master spec describes; resolver in `src/config/resolveConfig.js` is still flat-v0.
- [2026-04-30] [feat] Post settings panel for SimpleEditorApp — featured image, taxonomy, excerpt, scheduling deferred from MVP. Substack-style editor needs a Notion-style side panel before it replaces full EditorApp.
- [2026-04-30] [bug] Recurring code-review patterns — null guards, state refresh after mutations, icon name string mismatches keep showing up. Consider lint rule or pre-commit check for `iconMap.js` keys.
- [2026-04-30] [bug] Selection REST `set_one()` accepts unbounded payload — `includes/class-wp-admin-shell-selection-rest.php:78–88` writes `$value` straight to user_meta with no size cap or shape validation. Authenticated user can stuff arbitrary blobs into own user_meta via repeated POSTs. Per-user gated so blast radius is self-DoS only, but cap (~64KB) before M5 prod readiness pass. (source: M1 review)
- [2026-04-30] [a11y] Selection REST `permission_check` is `is_user_logged_in()` only — `includes/class-wp-admin-shell-selection-rest.php:62`. Selection writes hit own-user meta so isolation holds, but flag for M5 four-layer cap-gating pass. (source: M1 review)
- [2026-04-30] [a11y] Drawer region missing `role="dialog"` / `aria-modal` / focus trap — `src/runtime/regions/drawer-region/index.js`. Aside has only `data-region-id`. M5 a11y checklist (b) calls for `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on overlay regions; drawer should follow same rule. Track in M5. (source: M1 review)
- [2026-04-30] [perf] Drawer region keydown listener re-binds on every render — `src/runtime/regions/drawer-region/index.js:37` puts `cfg.dismissOn` (object) in deps array, so identity changes re-run effect. `useMemo` over `normalizeDismiss(cfg.dismissOn)` cleaner. Trivial. (source: M1 review)
- [2026-04-30] [chore] Selection scope regex excludes `:` — `includes/class-wp-admin-shell-selection-rest.php:38` route pattern `[A-Za-z0-9._-]+` blocks future namespaced scopes (e.g. `posts:selection`). Loosen when M2 needs it. (source: M1 review)
- [2026-04-30] [dx] `persist.js` swallows errors silently — intentional + commented in `src/runtime/selection/persist.js:44/61/75`. Optional `console.warn` behind dev flag would aid debugging. Not a bug. (source: M1 review)
- [2026-04-30] [perf] CommandPickerApp re-registers all commands on any config change — `src/runtime/apps/CommandPickerApp.js:64` effect deps include full `config.applications` array. Inexpensive but narrow to a stable key (e.g. ids hash) if config churn becomes hot. (source: M1 review)
- [2026-04-30] [chore] PreviewPaneApp hardcodes `content.selection` scope — `src/runtime/apps/PreviewPaneApp.js:12` defaults `follow` to `'content.selection'`, assuming single-content-region layout. Parameterize in M4 when multi-region preview ships. (source: M1 review)

---

## Triaged

### Now
_Actively shaping or about to start._

### Next
_Queued for the next working session._

### Later
_Acknowledged, not soon. Revisit when adjacent work touches the area._

### Won't do
_Decided against. Keep with rationale so we don't relitigate._

---

## In progress

_Work underway. Link to branch / spec / PR._

---

## Done

_Recently shipped. Prune quarterly._
