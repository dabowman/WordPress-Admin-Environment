# v2 production-readiness pass

Tracks directive §8 "Definition of done" for the v2 migration. The
predecessor doc — `docs/v1-readiness.md` — covered the v1 ship; this
file extends the same shape for v2. Nothing in v1-readiness is
invalidated; v2 evolves several measurements and adds a second engine
+ tokens.json layer.

## Architecture deltas vs v1

- Three artifacts replace the single-file admin.json (`app.json` per
  app, `engine.json` per engine, `admin.json` per install).
- Region taxonomy: `role` (ARIA) + `layout` (CSS subset) + `platform`
  (browser-analog services) + `routing` (URL participation). `kind`
  enum retired.
- One-region-one-app + nested child regions replaces `contains[]`.
- Selection event bus + shell-level slot/fill removed (app-internal
  slots survive via `@wordpress/components` Slot/Fill against the
  app's own React tree).
- `userCustomizable` → `customizable` (rename for accuracy; the
  one-cycle compat read shipped in V2.M4 has been retired in V2.M5).
- URL-driven navigation: routable regions declare `routing.route-key`
  naming the URL slot they read from; plain `<a href>` links navigate;
  HTML `target` keeps native meaning.
- Two engines ship: `core:default` (flagship) + `core:single-pane`
  (mobile-first; demo-quality).
- DTCG `tokens.json` primitives layer: PHP-side discovery + deep merge
  across site → theme → plugin → core; JS-side flatten + alias
  resolution + 8-type CSS coercion.

## Bundle-size budget

Measured at the end of V2.M5 (`npm run build`):

| Asset | Size (minified) | Notes |
|---|---:|---|
| `build/index.js`        | ~2.0 MiB | Single-bundle. `@wordpress/dataviews` + `@wordpress/ui` bundled per `BUNDLED_PACKAGES`. All other `@wordpress/*` externalized. |
| `build/index.css`       |  ~17 KiB | Shell layout + chrome surfaces + apps + single-pane engine CSS. |
| `build/dataviews.css`   |  ~74 KiB | Copied verbatim from `@wordpress/dataviews/build-style/style.css`. |

V1 shipped at 371 KiB JS pre-`@wordpress/ui` integration. The 2 MiB
v2 figure is dominated by `@wordpress/ui` + `@wordpress/dataviews`
(both newly bundled). Source-level code splitting (loading plugin
sources on demand) is still a v3 item per spec §11.

## Performance smoke test

Methodology unchanged from v1-readiness. Cold mount target ≤ 500 ms on
a baseline laptop with throttling. Re-run before tagging.

Token compilation gains a tokens.json layer: `flattenTokens` walks the
DTCG tree once at mount, the result feeds `compileStyles.resolveValue`
through a flat map. Cost is bounded by the size of the merged tokens
tree (~150 leaves in the bundled `core.tokens.json`).

**Pre-mount FOUC.** Same as v1 — tokens emit from JS at kernel mount.
SSR token emission remains a future polish item.

## Accessibility smoke checklist

- [x] Command palette reachable via `⌘K`. Focus trap delegated to
  `@wordpress/commands`'s portal.
- [x] Modal regions render `role="dialog"` + `aria-modal="true"` +
  `aria-labelledby` + focus-on-mount + focus-return + constrained
  tabbing (`src/runtime/regions/Region.js` `ModalRegion`).
- [x] Sidebar navigation wraps content in `<nav>` with `aria-label`
  (carried forward from v1; default "Navigation"; overridable via
  `region.config.label`).
- [x] Drill-down screens move focus to the heading on entry; restore
  focus to the originating item on back.
- [x] Focus ring visible on every interactive element via the
  `--wpds-color-stroke-focus-brand` token.
- [x] No `tabindex` values above 0 in the runtime.
- [x] Every icon-only button supplies a `label` prop or visible text
  via `<VisuallyHidden>`.
- [x] **Manual:** single keyboard pass through `developer-admin` plus
  `single-pane-demo` reaches every primary action without trapping.
  (passed 2026-05-06)
- [x] **Manual:** one VoiceOver pass on macOS through both shells.
  (passed 2026-05-06)
- [x] **Manual:** `axe` against the rendered shell DOM, no
  blocker-severity findings. (passed 2026-05-06)

## Capability gating

Four-layer cap model (spec §11) carries forward unchanged from v1:
region fast-path → app gate → source-cap floor → REST observation.
`wp_admin_shell_resolve_capabilities()` walks the v2 region tree
recursively + collects per-nav-item caps from
`region.config.items[].capability`.

PHP cap suite: `tests/php/run-cap-tests.php` 54/54.

Manual role-fixture smoke (subscriber → administrator) recorded in
v1-readiness.md — re-verify against the v2 default shell
(`wp-admin-default`) before tagging.

## Per-shell render smoke

Bundled shells (5 + single-pane-demo = 6):

| Shell | Engine | Notes |
|---|---|---|
| `wp-admin-default`  | default     | wp-admin mirror via iframe routes |
| `developer-admin`   | default     | Native v2 apps + drill-down design |
| `content-author`    | default     | Minimal writer shell |
| `client-portal`     | default     | Branded shell |
| `v1-demo`           | default     | Canonical-shape demo |
| `single-pane-demo`  | single-pane | Mobile-first; validates engine boundary |

`tests/php/run-shape-tests.php` walks every shell through the resolver
+ asserts structural invariants (engine + regions + applications +
default-route resolves). 100/100.

Manual browser smoke: cold-mount each shell, verify nav renders, click
through to `/posts` and `/posts/new` (where wired) to confirm editor
flow. Re-run before tagging.

## Editor flow (V2.M5 ship-blocker resolution)

PostsApp + SimpleEditorApp rewritten against the v2 routes block:

- PostsApp emits hrefs via `editHref(postType, id)` → `#/posts/{id}/edit`
  / `#/pages/{id}/edit`.
- SimpleEditorApp reads `postType` + `id` from interpolated route
  config; createDraft writes the canonical edit URL via
  `history.replaceState`.
- Editor routes (`/posts/new`, `/posts/{id}/edit` with `id: '{id}'`
  interpolation; pages equivalents) bundled in developer-admin /
  content-author / single-pane-demo / client-portal / v1-demo.

ToolbarActionsApp `COMMAND_HREFS` maps `core/new-post` → `#/posts/new`
and `core/new-page` → `#/pages/new` against the same route block.

Manual browser smoke: New Post button, row-action edit, title-click
all reach the editor and save successfully. Re-run before tagging.

## Dirty-state platform service

`useDirtyState(regionId, isDirty, { blocksNavigation })` reports an
app's unsaved-changes status. The kernel-mounted `<NavigationGuard/>`
listens to:

1. `beforeunload` — full-page exits prompt the browser dialog.
2. Navigation API `navigate` event — in-shell SPA nav prompts via
   `confirm` + `event.preventDefault()` (evergreen browsers).
3. Hashchange revert fallback — Safari path. Cancel reverts via
   `history.replaceState`.

`SimpleEditorApp` reports `hasEdits` with `blocksNavigation: true`.

Manual smoke: unsaved-changes guard fires when navigating away mid-edit,
both via in-shell link + browser back-button. Re-run before tagging.

## Tokens.json discovery + alias resolution

PHP `WP_Admin_Shell_Tokens` discovers four origins (site option > theme
`tokens.json` > `wp_admin_shell_plugin_tokens` filter > shell
`core.tokens.json`). Defensive flush hooks wired:
`update_option_wp_admin_shell_site_tokens`, `switch_theme`,
`activated_plugin`, `deactivated_plugin`.

JS `tokensResolver.mjs` flattens DTCG trees with group `$type`
inheritance, resolves curly-brace aliases (cycle-detected, 16-level
cap), coerces 8 leaf/composite types (color / dimension / number /
fontFamily / fontWeight / duration / cubicBezier / border / shadow).

Tests:
- `tests/runtime/tokens-resolver.test.mjs` (resolver alone, incl.
  DTCG canonical color $value coercion).
- `tests/runtime/compile-styles-tokens.test.mjs` (end-to-end: alias
  resolves to literal, unresolved falls through to `var()`,
  within-doc `{styles.X}` wins, missing-tokens-arg keeps fallback).
- `tests/runtime/spec-worked-example.test.mjs` — pins the spec §9.1
  worked example as runnable: tokens.json brand → admin.json `styles`
  fans out, single-edit re-brand propagates to all consumer slots.
- `tests/php/run-tokens-tests.php` (PHP discovery + merge).

## Schemas + manifests

- `docs/schemas/admin-v2.json` — install (admin.json) shape.
- `docs/schemas/admin-app-v2.json` — per-app manifest.
- `docs/schemas/admin-engine-v2.json` — per-engine manifest.
- `docs/schemas/tokens-v1.json` — DTCG tokens.json (permissive
  placeholder; W3C DTCG editor's draft 2025.10 not yet stable for
  `$ref`).

### Schema hosting

Each schema declares its canonical `$id` at `schemas.wp.org`:

| File | Canonical `$id` |
|---|---|
| `admin-v2.json`        | `https://schemas.wp.org/admin/v1.json` |
| `admin-app-v2.json`    | `https://schemas.wp.org/admin-app/v1.json` |
| `admin-engine-v2.json` | `https://schemas.wp.org/admin-engine/v1.json` |
| `tokens-v1.json`       | `https://schemas.wp.org/tokens/v1.json` |
| `admin-v1.json`        | `https://schemas.wp.org/admin/v0.json` (legacy) |

**Beta cycle hosting.** `schemas.wp.org` is not live yet. In-repo
files (bundled shells + fixtures) reference schemas via relative path
(`../docs/schemas/admin-v2.json`) so IDE validation works without a
network round-trip. Plugin authors writing admin.json files outside
this repo can pin to the raw GitHub URL during the beta cycle:

```json
"$schema": "https://raw.githubusercontent.com/dvdbwmn/WordPress-Admin-Environment/feat/wp-admin-shell-v2/docs/schemas/admin-v2.json"
```

When `schemas.wp.org` goes live, references switch to the canonical
URL. The `$id` already matches, so consumers using the canonical URL
require no schema-side change.

`tests/schema/validate-shells.test.mjs` sweeps:
- 6 bundled shells under `admin-v2.json`.
- 19 bundled `app.json` manifests under `admin-app-v2.json`.
- 2 bundled `engine.json` manifests under `admin-engine-v2.json`.
- `core.tokens.json` under `tokens-v1.json`.
- Plus positive + negative fixtures under each.

53/53.

## Test totals

| Suite | Cases |
|---|---:|
| `run-cascade-tests.php`  | 22 |
| `run-cap-tests.php`      | 54 |
| `run-shape-tests.php`    | 100 |
| `run-manifest-tests.php` | 60 |
| `run-tokens-tests.php`   | 13 |
| `validate-shells.test.mjs` | 53 |
| `wpds-snapshot.test.mjs`   | 4 |
| `tests/runtime/*.mjs`      | 161 |
| **Total**                  | **467** |

All green on `feat/wp-admin-shell-v2`.

## Gutenberg dependency gate

Unchanged from v1. `Requires Plugins: gutenberg` declared at the plugin
header.

## Known gaps deferred to v2.x

- **`core:site-editor` native mount.** Spec §15 v1 names native
  `@wordpress/edit-site` mount; v2.0.0-beta.1 ships an iframe adapter
  pointing at `site-editor.php`. Five blockers documented in
  `src/runtime/apps/SiteEditorApp.js`: preferences-store collision
  with `core:appearance`, command-palette double-registration,
  full-screen CSS bleed, hash-router collision, and the fact that
  `@wordpress/edit-site` is not in the dep-extraction
  `BUNDLED_PACKAGES` list. Native mount lands in a v2.x cut without
  admin.json changes (authors target `core:site-editor` either way).
- **`core:editor` native mount.** Same iframe-vs-native trade-off as
  site-editor. The simple-editor (`core:simple-editor`) covers the
  common write path natively today.

## Sign-off

**Signed off 2026-05-06.** All manual smoke items verified:

- Both engines render every applicable shell (six bundled).
- Editor flow exercises (`#/posts/new` createDraft → `#/posts/{id}/edit`,
  row-action edit, title-click) all save successfully.
- Dirty-state guard fires on in-shell nav, browser back, and
  beforeunload while edits are unsaved.
- Cmd+K palette opens, filters, navigates, dismisses on Escape.
- Shell-switching via Settings page reloads cleanly.
- Cap-gating role fixtures (subscriber → administrator) match the
  expected visible-app set on `wp-admin-default`.
- Keyboard / VoiceOver / axe checks clear on `developer-admin` plus
  `single-pane-demo`.

Automated suites: 467/467. Tag: `v2.0.0-beta.1` at `6e4dc61` on
`feat/wp-admin-shell-v2`.
