# CIAB-Adoption Agent Prompts

Copy any prompt below verbatim into the agent dispatcher. Each is self-sufficient — the agent should be able to start without further context.

## Worktree setup (run once before launching agents)

Parallel agents need parallel working trees — one filesystem checkout per agent. `git worktree` is the right tool: each worktree points at the same `.git`, has its own branch + index + node_modules, can be edited simultaneously without conflict.

From the main checkout:

```bash
cd ~/Github/WordPress-Admin-Environment
git fetch origin
git checkout main && git pull origin main

mkdir -p ~/wpas-worktrees
git worktree add ~/wpas-worktrees/track-a-preload    -b feat/c1-rest-preload      main
git worktree add ~/wpas-worktrees/track-b-shims      -b feat/c3-menu-route-shims  main
git worktree add ~/wpas-worktrees/track-c-dashboard  -b feat/c4-dashboard-grid    main
git worktree add ~/wpas-worktrees/track-d-lazy       -b feat/c5-lazy-app-loading  main
git worktree add ~/wpas-worktrees/track-e-postsapp   -b feat/c2-postsapp-hardening main
```

Then `npm install` in each worktree (`node_modules` isn't shared) — or symlink:

```bash
for wt in track-a-preload track-b-shims track-c-dashboard track-d-lazy track-e-postsapp; do
  ln -s ~/Github/WordPress-Admin-Environment/node_modules ~/wpas-worktrees/$wt/node_modules
done
```

Symlinking saves disk + install time but means a `node_modules` update in any worktree affects all. If tracks add new deps, prefer per-worktree installs.

After Track E merges, create F.1–F.5 worktrees:

```bash
git worktree add ~/wpas-worktrees/track-f1-taxonomy -b feat/c2-migrate-taxonomy main
git worktree add ~/wpas-worktrees/track-f2-users    -b feat/c2-migrate-users    main
git worktree add ~/wpas-worktrees/track-f3-comments -b feat/c2-migrate-comments main
git worktree add ~/wpas-worktrees/track-f4-plugins  -b feat/c2-migrate-plugins  main
git worktree add ~/wpas-worktrees/track-f5-themes   -b feat/c2-migrate-themes   main
```

Cleanup after PR merge:

```bash
git worktree remove ~/wpas-worktrees/track-a-preload   # etc.
git branch -d feat/c1-rest-preload                     # if merged
```

## `wp-env` coordination

`wp-env` runs a single Docker stack on fixed ports (8888 / 8889). **Only one worktree can run wp-env at a time.** Each agent's `.wp-env.json` would otherwise fight the same container.

Practical answer: run `wp-env` from one worktree only (recommend the main checkout). Agents in side worktrees stick to:

- `npm run test:schema` — Ajv sweep, no server
- `npm run test:runtime` — pure-ESM Node, no server
- `npm run test:parity` — WPDS snapshot diff, no server
- `npm run test:engines` — TS engine tests, no server
- `npm run lint:js` — ESLint, no server
- `npm run build` — webpack, no server

For PHP-side tests (`wp eval-file ...`), agents queue them and the user (or one designated agent on the main checkout) runs the suite when needed. Since `.wp-env.json` mounts `"."` as the plugin, the main checkout's wp-env automatically sees side-worktree code IF the side worktree commits are merged back — for in-flight branches, the side worktree's PHP code isn't visible to the main wp-env unless you symlink or rebase.

Simpler workflow: each agent develops + commits + opens PR. The user runs the full PHP suite locally against the merged result before pulling the PR. For tight PHP-test feedback loops, the agent can:

1. Switch the main wp-env to its branch temporarily: `cd ~/Github/WordPress-Admin-Environment && git stash && git checkout feat/c1-rest-preload && npx wp-env run cli wp eval-file ...`
2. Or rsync its tree into a dedicated docker bind-mount (overkill for this scope).

Document in the PR which PHP suites need a manual run.

## Common preamble (all tracks)

Branch from `main` (C2 already merged via PR #38). Worktree directory: `~/wpas-worktrees/track-<id>-<short-name>`. Tests should stay green before opening a PR. PR description's "Test plan" section mirrors the plan's "Acceptance criteria" checklist.

---

## Track A — REST Preload (C1)

```
You are implementing Track A — REST Preload (C1) — for the WP Admin Shell plugin.

PRE-LOAD SKILLS
- /wordpress-rest-api
- /wordpress-plugin-development
- /wordpress-performance

PRE-LOAD READS (in this order)
1. CLAUDE.md — project conventions, recurring patterns, test surface
2. docs/plans/track-a-rest-preload.md — your full plan (scope, design, steps, acceptance)
3. docs/plans/ciab-adoption-tracks.md — coordination context with parallel tracks B/C/D/E/F
4. docs/research/ciab-primitives-cascade-integration.md — CIAB primitive context
5. /Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/lib/pages/admin.php (lines 76–118) — CIAB's hardcoded preload list, the model for the schema'd version
6. includes/cascade/class-wp-admin-shell-field-collections.php — pattern reference for the registry + plugin-origin filter contribution shape

GOAL
Ship CIAB's REST preload middleware as a declarative cascade primitive. New `preload[]` admin.json block; PHP `WP_Admin_Shell_Preload` class calls `rest_preload_api_request` on the cascade-resolved list and injects via `wp_add_inline_script` on `wp-api-fetch`. Biggest perf-per-LOC win in the CIAB-adoption plan.

BRANCH
feat/c1-rest-preload (from main; work in ~/wpas-worktrees/track-a-preload)

DELIVERABLES
- Schema additions to docs/schemas/admin-v2.json (`preload[]` + $defs/preloadEntry)
- includes/cascade/class-wp-admin-shell-preload.php (collect + dedupe + inject)
- Wiring in wp-admin-shell.php
- tests/php/run-preload-tests.php with cascade-merge / dedup / malformed-entry / actual-preload-call assertions
- Positive + negative schema fixtures
- CLAUDE.md: extension point #9 entry, updated test counts, file tree
- Spec §13 #9 description

NON-GOALS
- Conditional preloads (use filter callbacks)
- POST preload bodies (CIAB doesn't support either)
- Cache-busting (WP transients handle it)

ACCEPTANCE
Follow the checklist in docs/plans/track-a-rest-preload.md "Acceptance criteria". Verify in the browser: declared `/wp/v2/users/me` returns 200 from preloading middleware on first paint, no second request.

COORDINATION
- wp-admin-shell.php require block: append-only, rebase if conflicting with B/C
- Spec §13 numbering: A adds #9; if B (#10/#11) or C (#12) merged first, renumber on rebase
- CLAUDE.md test-count line: rebase

Open a PR when done. Include the acceptance checklist in the PR body as a Test plan.
```

---

## Track B — Menu + Admin-Route Shims (C3)

```
You are implementing Track B — Menu + Admin-Route Shims (C3) — for the WP Admin Shell plugin.

PRE-LOAD SKILLS
- /wordpress-plugin-development
- /wordpress-rest-api

PRE-LOAD READS (in this order)
1. CLAUDE.md
2. docs/plans/track-b-menu-route-shims.md — your full plan
3. docs/plans/ciab-adoption-tracks.md — coordination with parallel tracks
4. includes/cascade/class-wp-admin-shell-field-collections.php — canonical registry + filter-contribution pattern (model your shims after this)
5. /Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/lib/api/routes.php — CIAB admin-route source
6. /Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/lib/api/menu-items.php (or sibling) — CIAB menu-item source

GOAL
Plugins fluent in CIAB's `next_admin_register_menu_item()` + `next_admin_register_admin_route()` should port to the shell with mechanical `s/next_admin_/wp_admin_shell_/g` rename. Ship the two shims; write into the plugin origin via the existing `wp_admin_shell_data_plugin` filter. Drop CIAB's inline `current_user_can()` checks — shell's 4-layer cap model covers it.

BRANCH
feat/c3-menu-route-shims (from main; work in ~/wpas-worktrees/track-b-shims)

DELIVERABLES
- includes/cascade/class-wp-admin-shell-menu-items.php (registry + nav-region resolver + filter contribution)
- includes/cascade/class-wp-admin-shell-admin-routes.php (registry + filter contribution)
- Free functions wp_admin_shell_register_menu_item() + wp_admin_shell_register_admin_route() in wp-admin-shell.php
- tests/php/run-menu-route-shims-tests.php — both APIs reject malformed input; both contribute through wp_admin_shell_data_plugin additively; cap gating still applies through the shell's existing 4-layer model
- CLAUDE.md: extension points #10 + #11
- Spec §13 #10 + #11

NON-GOALS
- TanStack `gcTime` — accept the key, ignore the value, dev-warn under WP_DEBUG
- `parent_type=dropdown` — fall back to `drilldown` with a notice; shell nav doesn't ship dropdown today
- Variant-addressable nav items (filed in feedback inbox for later)
- Per-item programmatic deregistration — `WP_Error` on duplicate id, no `unregister`

ACCEPTANCE
Follow docs/plans/track-b-menu-route-shims.md "Acceptance criteria". CIAB-flavored end-to-end test: register a menu item + route via the shims; declare an admin.json that doesn't mention them; resolved cascade tree contains both.

COORDINATION
- wp-admin-shell.php require block: append-only
- Spec §13 numbering: see Track A
- CLAUDE.md test-count line: rebase

Open a PR when done.
```

---

## Track C — Dashboard Widget Grid (C4)

```
You are implementing Track C — Dashboard Widget Grid (C4) — for the WP Admin Shell plugin.

PRE-LOAD SKILLS
- /wordpress-design-system
- /every-layout
- /wordpress-plugin-development

PRE-LOAD READS (in this order)
1. CLAUDE.md — including the `core:dynamic-children` patterns and Recurring Patterns section
2. docs/plans/track-c-dashboard-grid.md — your full plan
3. docs/plans/ciab-adoption-tracks.md
4. docs/wp-admin-shell-design-spec.md §5.5 (dynamic children), §13 (extension points)
5. src/runtime/engines/core-desktop/ — only existing consumer of `core:dynamic-children` in the codebase; same pattern applies to your dashboard host
6. src/apps/dashboard/ — current DashboardApp; port its recent-posts + quick-draft logic into the two example widgets
7. /Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/dashboard-widgets/ — CIAB's registration model + globals

GOAL
First-class widget grid primitive built on the existing `core:dynamic-children` platform service. Widgets are apps with a `dashboardWidget` manifest block; admin.json `dashboardWidgets` overrides positions/sizes/visibility. CIAB's `next_admin_register_dashboard_widget()` ports as `wp_admin_shell_register_dashboard_widget()` and writes into the plugin origin.

BRANCH
feat/c4-dashboard-grid (from main; work in ~/wpas-worktrees/track-c-dashboard)

DELIVERABLES
- New region template `core:dashboard-grid` in src/runtime/engines/core-default/engine.json + CSS
- New app src/apps/dashboard-host/ that drives the dynamic-children store from registered widgets
- Two bundled example widgets: src/apps/dashboard-widget-recent-posts/ + src/apps/dashboard-widget-quick-draft/
- includes/cascade/class-wp-admin-shell-dashboard-widgets.php (registry + filter contribution)
- wp_admin_shell_register_dashboard_widget() public function
- Schema: dashboardWidget block in admin-app-v2.json + dashboardWidgets top-level in admin-v2.json + positive/negative fixtures
- tests/php/run-dashboard-widgets-tests.php + a runtime test for the host's pure widget-composition logic
- A /dashboard-grid demo route in shells/developer-admin.json (don't replace /dashboard yet — keep both, promote in a follow-up after stability)
- CLAUDE.md: extension point #12, app table additions, test counts
- Spec §13 #12

NON-GOALS
- Drag-to-reorder UI (config-driven only, like CIAB)
- WP-core dashboard widget bridge (`wp_dashboard_setup` rendering) — non-trivial because legacy widgets emit jQuery-bound HTML; defer
- Per-widget cap layers beyond app.json#capabilities — widgets-as-apps inherit existing 4-layer gating

ACCEPTANCE
Follow docs/plans/track-c-dashboard-grid.md "Acceptance criteria". Browser smoke: navigate to /dashboard-grid in developer-admin, see two bundled widgets render in declared positions; register a third widget via the shim from a mu-plugin and confirm it appears; declare an admin.json override to hide one and confirm it disappears.

COORDINATION
- src/runtime/registry/builtins.js: adds three new bundled apps. Track D rewrites this file to the lazy shape — if D lands first, register your apps in the new lazy form; if you land first, D's rewrite picks them up.
- shells/developer-admin.json: appends /dashboard-grid route; Track F sub-tracks may also touch this file. Trivial JSON merge.
- docs/schemas/admin-v2.json: A adds `preload`, this adds `dashboardWidgets`. Both append top-level, no real conflict.
- CLAUDE.md status/app-table/test-counts: rebase

Open a PR when done.
```

---

## Track D — Lazy App Registration (C5)

```
You are implementing Track D — Lazy App Registration (C5) — for the WP Admin Shell plugin.

PRE-LOAD SKILLS
- /wordpress-plugin-development

PRE-LOAD WEB DOCS
- https://webpack.js.org/api/module-methods/#magic-comments — chunk naming
- https://react.dev/reference/react/lazy — React.lazy semantics
- https://react.dev/reference/react/Suspense — fallback contract

PRE-LOAD READS (in this order)
1. CLAUDE.md — including @wordpress/dependency-extraction-webpack-plugin notes
2. docs/plans/track-d-lazy-app-loading.md — your full plan
3. docs/plans/ciab-adoption-tracks.md
4. src/runtime/registry/createRegistry.js — current registry implementation
5. src/runtime/registry/builtins.js — every existing app registration; you'll flip ~16 of ~18 to lazy form
6. src/runtime/regions/Region.js + src/runtime/regions/mountApp.js — mount path; needs a Suspense boundary or equivalent
7. webpack.config.js — current build config

GOAL
Registry accepts both `{ render: Component }` (eager, current) and `{ load: () => import(...) }` (lazy, new). Mount path awaits the load on first match. Webpack named chunks per app via magic comments. Bundle shrinks proportional to apps not on the user's path.

BRANCH
feat/c5-lazy-app-loading (from main; work in ~/wpas-worktrees/track-d-lazy)

DELIVERABLES
- src/runtime/registry/createRegistry.js extended for lazy shape, identity-cached on first resolve
- src/runtime/registry/builtins.js: every app except always-mounted system apps (core:navigation, core:site-hub, core:toolbar-actions, core:notices-banner, core:notices-snackbar) migrated to `load: () => import(/* webpackChunkName: "app-<id>" */ '...')`
- src/runtime/regions/mountApp.js + Region.js: Suspense boundary (or hand-rolled equivalent) with a small <AppLoading /> placeholder and <AppLoadError /> error boundary
- Webpack chunks emit as build/app-*.js — verify via `npm run build` output
- tests/runtime/registry-lazy-app.test.mjs — pure ESM test of register / resolve / cache / both-shapes-rejected
- Adapt any existing runtime tests that construct eager registrations
- CLAUDE.md: status note, file tree update, bundle size diff in docs/v1-perf-baseline.md
- Network panel confirmation: navigating to a non-default route triggers a fresh chunk request

NON-GOALS
- Server-side preload of likely-next chunks (pair with Track A's preload primitive in a follow-up)
- Native script modules + .asset.php migration — separate track, months
- App-internal code-splitting (apps can use `import()` themselves; out of scope)

ACCEPTANCE
Follow docs/plans/track-d-lazy-app-loading.md "Acceptance criteria". Manual smoke: open shell on a page that doesn't mount a particular app, confirm that app's chunk hasn't loaded; navigate to it, confirm the chunk loads on demand. Bundle size measurably smaller than pre-D build.

COORDINATION
- src/runtime/registry/builtins.js: Track C adds three new bundled apps. If C lands first, you migrate those too; if D lands first, C registers in the lazy shape from the start.
- src/runtime/regions/Region.js + mountApp.js: no other active track touches these
- webpack.config.js: solo
- CLAUDE.md: rebase status block + file tree

Open a PR when done. Include before/after bundle sizes in the PR description.
```

---

## Track E — PostsApp Hardening (F1 + F2 + F4)

```
You are implementing Track E — PostsApp Hardening — for the WP Admin Shell plugin.

PRE-LOAD SKILLS
- /wordpress-dataviews
- /wordpress-design-system
- /wordpress-core-data

PRE-LOAD READS (in this order)
1. CLAUDE.md — Recurring Patterns section especially
2. docs/plans/track-e-postsapp-hardening.md — your full plan
3. docs/plans/ciab-adoption-tracks.md
4. docs/feedback.md — Inbox items F1 (render-time __()), F2 (view-state resync), F4 (slim fallback) dated 2026-05-14
5. src/apps/posts/index.js + viewConfigFallback.js + app.json + app.md — current state; you'll edit all four
6. src/runtime/viewConfig/useViewConfig.js — hook your app consumes
7. docs/wp-admin-shell-design-spec.md §13 #7 — i18n contract (codifies the accepted regression)

GOAL
PostsApp has three C2 follow-ups. Land all three together because they all touch posts/index.js and the cleanup follows from the i18n recipe.
- F1: in-app `FIELD_LABELS` + `ACTION_LABELS` tables wrap labels in `__()` calls; `buildFields` / `buildActions` prefer the table over the spec's raw label for known ids; spec wins for unknown (plugin-extension) ids.
- F2: useEffect resyncs `view` state when `config.postType` or `config.variant` change on the same hook instance.
- F4: slim or delete viewConfigFallback.js — manifest baseline now flows through the cascade, so the React-side fallback is defense-in-depth only.

This track GATES Track F (the five entity-CRUD migrations). The LABELS-table pattern + view-resync pattern must be documented in CLAUDE.md so the next migrations copy it verbatim.

BRANCH
feat/c2-postsapp-hardening (from main; work in ~/wpas-worktrees/track-e-postsapp)

DELIVERABLES
- src/apps/posts/index.js: FIELD_LABELS + ACTION_LABELS constants; prefer-over-spec wiring; view-resync useEffect keyed on [postType, variant]
- src/apps/posts/viewConfigFallback.js: delete (recommended) or slim to structure-only
- src/apps/posts/app.md: replace "i18n regression" framing with a "Translation recipe" section documenting LABELS-table pattern + the prefer-over-spec precedence
- CLAUDE.md: add a Recurring Patterns bullet codifying the LABELS-table convention so subsequent migrations copy it
- docs/feedback.md: move F1 + F2 + F4 from Inbox to Done with this PR's commit SHA

NON-GOALS
- Migrating any other app (Track F)
- Shared LABELS table across apps (premature deduplication)
- JSDOM mount tests (tracked as issue #30 separately)

ACCEPTANCE
Follow docs/plans/track-e-postsapp-hardening.md "Acceptance criteria". Manual browser smoke under a non-English locale (e.g. de_DE): DataViews column headers + action labels render in that locale.

COORDINATION
- src/apps/posts/index.js: solo within this track
- CLAUDE.md Recurring Patterns: rebase if other tracks touch the section
- docs/feedback.md: append-only conflict; trivial merge
- This track GATES Track F — don't start the entity-CRUD migration sweep until this lands and the LABELS pattern is documented

Open a PR when done. Tag it as a blocker for the Track F migration sweep.
```

---

## Track F — Entity-CRUD Migrations (×5, parallel after E)

Each sub-track is its own agent. Run all 5 in parallel after Track E lands.

### Common prompt template (fill in `<app>` per sub-track)

```
You are implementing Track F.<N> — Migrate <app> to consume useViewConfig — for the WP Admin Shell plugin.

THIS TRACK IS BLOCKED UNTIL TRACK E (feat/c2-postsapp-hardening) MERGES.
Verify CLAUDE.md contains the "LABELS table convention" Recurring Pattern before starting.

PRE-LOAD SKILLS
- /wordpress-dataviews
- /wordpress-design-system
- /wordpress-core-data
- /wordpress-rest-api (only for F.3 comments + F.4 plugins where partial-update + activate REST shapes matter)

PRE-LOAD READS (in this order)
1. CLAUDE.md — Recurring Patterns especially (LABELS-table + null-guards + cache-invalidation + decodeEntities + DataViews import path)
2. docs/plans/track-f-entity-crud-migrations.md — your full plan + per-sub-track table
3. docs/plans/ciab-adoption-tracks.md — coordination
4. src/apps/posts/ (post-E) — canonical template; copy structure verbatim and adapt entity-specific logic
5. src/apps/<app>/ — the app you're migrating: index.js + app.json + app.md
6. docs/screens/<screen-slug>.md — preserve parity-gap notes
7. src/runtime/viewConfig/useViewConfig.js — hook contract

GOAL
Migrate `core:<app>` to the C2 view-config primitive. Move structural DataViews config (fields / actions / defaultView / defaultLayouts) into app.json#viewConfig; keep action callbacks + modal renderers in index.js keyed by spec id. Apply the LABELS table pattern + view-state resync useEffect + title-dedup pattern from PostsApp. Behavior must be parity-preserving — the only visible change is that admin.json can now override the spec.

BRANCH
feat/c2-migrate-<app> (from main after E lands; work in ~/wpas-worktrees/track-f<N>-<app>)

DELIVERABLES
- src/apps/<app>/index.js: rewrite the DataViews mount in the post-E shape
- src/apps/<app>/app.json: add viewConfig block with kind/name/fields/actions/defaultView/defaultLayouts
- src/apps/<app>/app.md: update Architecture + Translation recipe + parity-gap sections
- Optional: shells/developer-admin.json adds a viewConfigs override for the migrated triple as cascade end-to-end validation
- CLAUDE.md app table: note which apps now consume view-configs

ENTITY-SPECIFIC DIVERGENCE (per sub-track)
- F.1 TaxonomyApp: (taxonomy, *). Hierarchical for category; inline create/edit/delete-term modal stays in index.js. Variant axis fits: declare `_default` per common taxonomies in app.json; admin.json can extend.
- F.2 UsersApp: (root, user). Bulk-delete-with-reassign modal stays in index.js; self-delete guard filters acting user before dispatching.
- F.3 CommentsApp: (root, comment). Approve/spam/trash actions call `saveEntityRecord` with partial status field (NOT full save). Keep that idiom; declare the action ids in viewConfig; map callbacks in index.js.
- F.4 PluginsApp: (root, plugin). Activate/deactivate is a custom REST shape (POST /wp/v2/plugins/<file>?status=active), not entity save. Keep idiom; declare action ids in viewConfig.
- F.5 ThemesApp: (root, theme). Singleton-active; "Activate" action sets active theme via REST. Keep idiom.

NON-GOALS
- Consolidating into a shared core:entity-list renderer (potential C2.5 follow-up, not now)
- Changing visible behavior — parity-preserving migration only
- Bucket-level fieldsRef inheritance (deferred in feedback inbox)

ACCEPTANCE
Follow docs/plans/track-f-entity-crud-migrations.md "Per-sub-track checklist" item by item. Manual browser smoke: app loads at its route, columns render, every action works, locale switch translates labels via the LABELS table. Cascade-override test: drop a temporary viewConfigs.<kind>.<name>._default override in developer-admin.json; reload; confirm the override wins.

COORDINATION
- Other F sub-tracks are mutually independent (each owns its own src/apps/<foo>/ dir)
- Track D rewrites src/runtime/registry/builtins.js to lazy shape — your migrated app re-registers with the same id in whichever shape D specifies; no semantic change
- Track C may add new bundled apps to builtins.js — trivial merge
- shells/developer-admin.json: other F sub-tracks may also add viewConfigs entries; append-only at JSON-key level
- CLAUDE.md app table: rebase line

Open a PR when done. Tag the PR with the sub-track number (F.1 through F.5) for tracking.
```

### Sub-track invocations

When dispatching, replace `<app>` and adjust the entity-specific bullets:

- **F.1**: `<app>` = `taxonomy`, screen-slug = `taxonomy`
- **F.2**: `<app>` = `users`, screen-slug = `users`
- **F.3**: `<app>` = `comments`, screen-slug = `comments`
- **F.4**: `<app>` = `plugins`, screen-slug = `plugins`
- **F.5**: `<app>` = `themes`, screen-slug = `themes`

---

## Dispatch checklist

Before launching agents:

1. **Land C2** to `main` (done — PR #38 merged) so all tracks branch from a stable base.
   ```bash
   cd ~/Github/WordPress-Admin-Environment
   git fetch origin && git checkout main && git pull origin main
   ```
2. **Confirm test surface is green** on the base branch: `npm run test:schema && npm run test:runtime && npm run test:parity && npm run test:engines && npm run lint:js && npm run build`, plus the PHP suites.
3. **Launch tracks A, B, C, D, E in parallel** (E is the only one with a downstream gate).
4. **Wait for E to merge** before launching F sub-tracks.
5. **Launch F.1–F.5 in parallel** once E lands.

Approximate wall-clock with 4 parallel agents on A/B/C/D, then E, then 5 parallel on F:

```
Day 1 ┬─ A (2d) ────────┐
      ├─ B (3d) ────────┤
      ├─ C (8d) ────────┤
      ├─ D (6d) ────────┤
      └─ E (2d) ────────┘
Day 3              E merges → F.1–F.5 launch (5×1d parallel)
Day 4              F sweep completes
Day 8              C completes (longest)
                   All CIAB-adoption work landed
```

Total wall-clock: ~8–10 days, dominated by Track C.
