# WP Admin Shell — v2 Migration Directive

**For:** Claude Code, working in `/Users/davidbowman/Github/WordPress-Admin-Environment` against the v1.0.0-beta.1 codebase.
**Goal:** Migrate the shipping v1 prototype to the architecture described in the **2026-05-01 design spec** (the post-iteration version of the spec). This is the second major iteration after the MVP. Calling it **v2** internally to avoid confusing it with the v1.0.0-beta.x tags already shipped.

**Scope of this directive:** the structural architectural changes only. Bug fixes and paper cuts in `docs/feedback.md` are separate work and should be triaged afterwards on the v2 baseline, not folded into the migration.

---

## 1. What changes between current v1 and v2

The current v1 codebase is built against the **2026-04-29 spec**, which was superseded by the **2026-05-01 spec**. The architectural shifts are substantial but mostly *subtractive* — the v2 spec removes concepts, partitions responsibilities into multiple artifacts, and aligns vocabulary with existing W3C/WHATWG standards. Read the new spec end-to-end before starting; this directive summarizes but the spec is authoritative.

| Concept | v1 (current) | v2 (target) |
|---|---|---|
| Configuration shape | One `admin.json` with `settings` + `styles` partition. Apps and regions declared inline in `settings`. | **Three artifacts:** `app.json` per app (intrinsic declarations), `engine.json` per engine (templates + capabilities), `admin.json` per install (composition + decisions only). |
| Region typing | Fixed `kind` enum: `persistent | overlay | drawer | floating | tiled`. | Three-layer vocabulary: `role` (ARIA), `layout` (CSS subset), `platform` (browser-analog services), plus `routing` for URL participation. No `kind` enum. |
| Multi-app composition | Region's `contains: [appId, ...]` array. System apps have `__` prefix and `hidden: true`. | **One region, one app.** Multi-app patterns produced by region templates declaring **child regions** (each holding one app). Recursive: regions all the way down. |
| App placement | Region's `contains[]` (pinned) or app's `route` field (routable). | Region has `app: "id"` (fixed) **xor** `routing.accepts-target: "name"` (routable). Mutually exclusive. Routes table at admin.json top level maps URL patterns to app + target tuples. |
| Navigation intent | Hash-based; programmatic `navigate(hash)`. Single routable region. | **HTML link semantics:** `<a href target rel>`. `target="_self"` → primary content region. `target="detail"` → master-detail. Multi-region URL state via query params. |
| App layout/geometry | Some apps assume container size; `core:posts` has `contentWidth`. | **Apps never declare layout.** Engines own all geometry. Apps must be intrinsically responsive. |
| Inter-app coordination | `core/admin-shell/selection` Redux store + `useSelection` hook + `respondsTo` config + REST persistence endpoint. | **Removed entirely.** Apps coordinate through `core-data` entities, the existing data layer, or URL state. No event bus. |
| App extensibility | Slot/Fill registry at the *shell* level (`core:editor.sidebar`, `core:posts.row-actions`, etc.). | Slot/Fill is **app-internal only.** The shell does not see or govern app-internal extensions. Apps use `@wordpress/plugins` against their own slot tree. |
| Token system | Already implemented (WPDS-native styles + chrome extensions + compat bridge). `tokens.json` deferred to "v2" in the old plan. | Token system is **kept as-is**. The DTCG `tokens.json` primitives layer is now a v2 deliverable (was v3 in the prior plan — moved up because v1 without aliasing produces a worse author experience than current `theme.json settings.custom`). |
| `userCustomizable` field | Used to declare which fields downstream origins may override. | **Renamed `customizable`** for accuracy (overrides apply to all downstream origins, not just user). |
| Top-level `routing`/`routes` | One `defaultRoute`; routes implicit from app `route` field. | Top-level **`routes`** block: explicit URL pattern → app + target + config map. Distinct from per-region `routing.accepts-target`. URL parameter interpolation: `{id}` in route config resolves against captured params. |
| Schema URL | `docs/schemas/admin-v1.json` (v0/v1 partitioned shape) | Three schemas at `docs/schemas/{admin,admin-app,admin-engine}-v2.json`. v2 is its own version because the shape is genuinely different — not a backwards-compatible extension. |

The token system (M3), cascade resolver (M2), and capability gating (M5) carry forward **largely unchanged** — those layers are independent of the structural shifts above.

The MVP's `iframe:{url}` magic id format is **gone** in v2. Apps that wrap legacy PHP screens are normal apps with regular ids that internally render an iframe via an SDK helper. The current `IframeApp.js` is the right shape for this; it just stops being a magic id and becomes a normal app whose config takes a URL.

---

## 2. Sources of truth

Before doing any migration work:

1. **Read the new design spec.** `docs/wp-admin-shell-design-spec.md` should be **replaced** with the 2026-05-01 version (artifact provided separately — the user will paste it in or copy it from a known location). The current `docs/wp-admin-shell-design-spec.md` is the 2026-04-29 spec the v1 codebase was built against; preserve it as `docs/archive/wp-admin-shell-design-spec-2026-04-29.md`.

2. **Read the three v2 schemas.** `docs/schemas/admin-app-v2.json`, `docs/schemas/admin-engine-v2.json`, `docs/schemas/admin-v2.json` (artifacts provided separately). These are JSON Schema 2020-12 documents with full inline documentation and validation logic. Treat them as authoritative for the shape of each artifact — when prose and schema disagree, the schema wins.

3. **Read the post-editor sketch.** `docs/post-editor-sketch.md` (artifact provided separately) — a worked example of decomposing the most complex real screen in WordPress core into the v2 architecture. It surfaces several v1 platform-service additions (`dirty-state`, `block-navigation-on-dirty`) that the engine must honor.

4. **Skim `docs/feedback.md`.** Current v1.0.0-beta.1 has known issues catalogued there; many will disappear naturally during the migration (the selection-bus security issues, for instance, all evaporate when the bus is removed). Don't fix anything proactively from the feedback log during the migration — clean migration first, triage second.

---

## 3. Migration strategy

**This is a parallel build, not a refactor.** The same lesson applies as MVP→v1: trying to retrofit produces a worst-of-both intermediate. The current v1 code is the validated proof that the kernel-driven architecture works; the v2 architecture is a refinement of *that* architecture, not a different one. The kernel, registry, cascade, and token system survive structurally; what changes is the artifact contracts, the region vocabulary, and several auxiliary systems (selection bus, slot system, navigation primitives).

**Branch strategy.**

- Tag current state as `v1.0.0-beta.1` (or whatever's already shipped). This is the reference point. Keep the branch alive.
- Create `feat/wp-admin-shell-v2` off main.
- Build v2 incrementally on the new branch. Each milestone in §4 should land green-tested before the next begins.
- The MVP code already migrated cleanly to v1 by registering the working app components against the new kernel. Do the same here: most app components (`PostsApp`, `MediaApp`, `UsersApp`, `CommentsApp`, `SettingsApp`, `ProfileApp`, `SimpleEditorApp`) survive structurally — they get **`app.json` manifests added alongside them**, and their registration in `builtins.js` migrates to manifest-driven loading. The component code itself changes minimally.

**What dies in v2.**

- `src/runtime/selection/*` — the entire selection event bus. Apps that need to coordinate use `core-data` entities or URL state.
- `includes/class-wp-admin-shell-selection-rest.php` — REST endpoint for selection persistence.
- `tests/php/run-selection-tests.php` — selection bus tests.
- `src/runtime/slots/*` — shell-level slot/fill registry. App-internal slots survive *inside* apps.
- The `kind` field on regions throughout. Replaced by `role` + `platform` + `layout` + `routing`.
- The `contains[]` array on regions. Replaced by single `app` field or nested `regions` map.
- The `__` prefix convention for system apps, since system apps are no longer pinned via `contains` — they're either fixed apps in their region (e.g., `core:primary-nav` mounted in the sidebar) or invoked via bindings.
- The MVP `iframe:` magic id format if any references remain.

**What gets added in v2.**

- Three manifest artifacts and their registration mechanisms.
- A region template catalog shipped with each engine.
- HTML link-semantic navigation primitives (`target` resolution, multi-region URL state).
- `routes` block in admin.json (separate from per-region `routing` field).
- URL parameter interpolation in route config.
- New platform services: `dirty-state`, `block-navigation-on-dirty`.
- The DTCG `tokens.json` primitives layer (lifted from prior v2/v3 plan; ships with v2 because v2 without it is worse than current v1 styling).
- A second engine (`core:floating-layout` or `core:single-pane-layout`) to validate the engine boundary. Demo-quality acceptable.

**What changes in place.**

- The cascade resolver (`includes/cascade/*`) carries forward but loses the `userCustomizable` → `customizable` rename and the v0 normalizer changes shape (it now normalizes to v2 admin.json form, not v1 partitioned form).
- The token system (`src/runtime/styles/*`) carries forward unchanged in core mechanics; the WPDS slot list and chrome extension namespace are unchanged. New: `tokens.json` resolver feeds the existing token compiler.
- The kernel (`src/runtime/kernel.js`) carries forward but reads the new admin.json shape.
- App components are mostly unchanged; their registration shifts from imperative `registry.register({...})` calls in `builtins.js` to manifest-driven discovery.

---

## 4. Milestone plan

Five milestones, sequential. Each is a complete commit-able state with passing tests.

### V2.M1 — Manifest contracts and registration

**Goal:** Three artifact types are registerable, validated against schemas, and the runtime can load them. Existing apps don't change yet — they keep their imperative registration. New manifest-driven path runs in parallel.

**Tasks:**

1. Drop the three v2 schemas into `docs/schemas/` (`admin-v2.json`, `admin-app-v2.json`, `admin-engine-v2.json`). Wire up `npm run test:schema` to validate fixtures against them in addition to the current v1 schema. Keep the v1 schema valid for now — the existing bundled shells haven't migrated yet.

2. Add manifest registration APIs:
   - PHP: `wp_admin_shell_register_app( $manifest_array_or_path )`, `wp_admin_shell_register_engine( ... )`, alongside existing shell registration.
   - JS: equivalent functions in the runtime — but the primary registration is server-side discovery (manifest convention path scan).

3. Convention path discovery: scan plugin directories for `apps/*/app.json` and `engines/*/engine.json`. Auto-register what's found.

4. Manifest validation at registration time: validate each manifest against its schema. Reject invalid manifests with clear error messages. Cache validation results by `(manifestPath, mtime)`.

5. Build the **runtime resolver** for the things JSON Schema can't validate (per the schema-exercise findings doc):
   - Role resolvability across template inheritance
   - ID references (engine, app, template) resolving to registered artifacts
   - Route `target` matching some region's `accepts-target`
   - Default route matching a route pattern

**Exit criteria:** A test app with an `app.json` manifest can be discovered, validated, and registered. The kernel can list registered apps via the new path. None of the existing app components have migrated yet; they still register the v1 way.

### V2.M2 — Region vocabulary rebuild

**Goal:** The kernel reads `role` + `layout` + `platform` + `routing` from regions instead of `kind` + `config` + `contains`. Region templates ship with the engine. Existing regions get migrated; the bundled shells are rewritten to use templates.

**Tasks:**

1. Add the engine manifest at `src/runtime/engines/core-site-editor-layout/engine.json`. Declare:
   - `specializes-roles`: `["navigation", "banner", "main", "complementary", "dialog", "contentinfo"]`
   - `honored-platform`: `["modal", "dismiss-on", "autofocus-target", "triggerable", "persists-across-navigation", "dirty-state", "block-navigation-on-dirty", "trigger"]`
   - `templates`: `core:sidebar`, `core:topbar` (with `start`/`center`/`end` child regions), `core:main`, `core:detail`, `core:overlay`. Each with `role`, `platform`, `default-style` matching what `src/runtime/regions/*` currently produces.
   - `default-arrangement`: `"wp-chrome"`.

2. Replace the six region source files (`src/runtime/regions/{sidebar,toolbar,content,preview,overlay,drawer}-region/`) with a single generic region renderer that reads the region's resolved declaration and renders accordingly. The region-source-as-class abstraction goes away; regions are just region declarations now.

3. Update the kernel to resolve regions through templates: when admin.json declares `"sidebar": { "template": "core:sidebar", ... }`, look up the template in the engine manifest and merge it with the per-region overrides.

4. Implement **nested regions**. A region's `regions: { ... }` map produces child regions addressable as `parent/child`. Each child has the full region contract recursively.

5. Implement the `app` xor `routing.accepts-target` rule at runtime (the schema enforces it; runtime confirms during composition).

6. Region rendering applies platform services from the merged declaration (region's `platform` block + mounted app's manifest `platform`, strictest wins). Replace existing kind-based dispatching (overlay → backdrop, drawer → slide-in, etc.) with platform-service-based logic.

7. Migrate the bundled shells (`shells/*.json`) to v2 form. Use templates everywhere they fit. Demonstrate from-scratch region declarations only where templates don't.

**Exit criteria:** All bundled shells render correctly. No region in any file references `kind` or `contains`. All regions either reference templates or declare `role` directly.

### V2.M3 — Navigation, routing, and target resolution

**Goal:** HTML link semantics throughout. The `routes` block in admin.json supersedes the per-app `route` field. Multi-region URL state works.

**Tasks:**

1. Add the `routes` block to admin.json schema (already in `admin-v2.json`). Move route declarations out of app entries and into the top-level `routes` block.

2. Rewrite the router (`src/runtime/routing/router.js`) to honor `target` resolution: for each navigation, look up the matching route's `target`, find the region with matching `accepts-target`, mount the app there. Multiple routable regions are supported.

3. URL hash encoding for multi-region state: primary region's app owns the path; secondary regions' apps appear as query parameters keyed by region id. `#/posts?detail=/posts/42` mounts the posts list in `_self` and the editor for post 42 in `detail`.

4. URL parameter interpolation: when a route pattern has `{name}` segments and the route's config references `{name}` in a string value, the runtime substitutes the captured value before passing config to the app.

5. Update `NavigationApp.js` (and any app emitting links) to render real `<a href target>` elements for navigation. Programmatic navigation (`navigate()`) accepts the same `{ target, rel }` options.

6. The `<a href target>` for `target="_blank"` falls back to `_self` in `core:wp-default-layout` (no new-window concept in chrome layout). The floating engine (V2.M5) interprets `_blank` as new window.

7. Migrate bundled shells to use `routes` block.

**Exit criteria:** Bundled shells route correctly, including the `developer-admin` master-detail layout. Browser back/forward works across multi-region state. Links have proper HTML semantics for assistive tech.

### V2.M4 — Selection bus removal, slot consolidation, app manifests

**Goal:** Remove the deprecated mechanisms. Migrate every app to a manifest. Apps coordinate via `core-data` only.

**Tasks:**

1. **Remove the selection event bus.** Delete `src/runtime/selection/` (`store.js`, `useSelection.js`, `persist.js`). Delete `includes/class-wp-admin-shell-selection-rest.php`. Delete `tests/php/run-selection-tests.php`. Remove the selection REST route registration. Remove `respondsTo` and `selectionScope` from any region declarations and from the v0 normalizer.

2. **Migrate `PreviewPaneApp.js`** off the bus. The post-editor sketch covers this case: a preview pane subscribed to "what's selected in the posts list" is replaced by a preview pane reading the active route's matched entity from `core-data`. If the user is on `/posts/42@detail`, the preview app reads post 42 directly via `useEntityRecord`. No bus needed.

3. **Remove the shell-level slot/fill registry.** Delete `src/runtime/slots/` (`Slot.js`, `createSlotRegistry.js`, `dataSlots.js`). App-internal slots remain — apps that use slot/fill internally (the post editor's inspector sidebar, etc.) keep using `@wordpress/components`'s `Slot`/`Fill` against their own React tree.

4. **Add app.json manifests** for every existing app:
   - `core:posts`, `core:simple-editor`, `core:editor`, `core:media`, `core:profile`, `core:users`, `core:comments`, `core:settings`, `core:settings-general`, `core:site-editor`, `core:appearance`, `core:iframe-fallback`
   - System apps: `core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:command-picker`, `core:preview-pane`, `core:notices-banner`, `core:notices-snackbar`
   - Each manifest declares `id`, `version: 1`, `title`, `role`, `platform` (services the app actually needs), `capabilities`, `config-schema` (move from `builtins.js`), `script`, `style`.
   - Place at `src/runtime/apps/{name}/app.json` for system apps and `src/apps/{name}/app.json` for user apps. Reorganize as needed — apps may need their own folders now.

5. **Add `dirty-state` and `block-navigation-on-dirty`** as platform services in the engine. The current EditorApp and SimpleEditorApp implement their own beforeunload-style guards; lift these to the platform-service mechanism. The engine intercepts navigation, queries the mounted app's dirty state via a runtime API, and shows confirm dialog if requested.

6. **Migrate `builtins.js`** from imperative registration to manifest discovery. The existing `builtins.js` becomes the bootstrap for the manifest-discovery path: it ensures the convention path is scanned and validates that all expected core apps registered. Imperative registration falls back to a transitional path during migration; remove it once all apps have manifests.

7. **Rename `userCustomizable` to `customizable`** throughout. PHP cascade resolver, the AppearanceApp UI, the v0 normalizer, the schema. Add a one-cycle compat read so existing per-shell configs still work.

8. **Migrate the v0 normalizer** (`includes/origins/class-wp-admin-shell-origin-core.php`) to produce v2 admin.json shape. v0 (MVP flat) → v2 path replaces the current v0 → v1 partitioned path. Document v1 as an interstitial form that still loads (read-fallback) but no longer authored.

**Exit criteria:** All apps have manifests. Selection bus and shell-level slots are gone. Cascade tests pass with `customizable` rename. Token tests pass unchanged. The complete app catalog mounts correctly.

### V2.M5 — Second engine, tokens.json, ship

**Goal:** Validate the engine boundary by shipping a second engine. Land the DTCG primitives layer. Tag v2.0.0-beta.1.

**Tasks:**

1. **Build `core:single-pane-layout` engine.** Smaller than floating-windows; validates the engine abstraction against a deliberately different layout idiom. Apps that work in `core:wp-default-layout` should work here without modification. Specializes for `main`, `dialog`, `navigation` (collapses sidebar to hamburger), `complementary` (collapses to overlay drawer). Honors most platform services. Default arrangement: `single-pane`. Demo-quality acceptable; not every WPDS chrome surface needs to look polished.

2. **Build the DTCG `tokens.json` resolver.** Discovery (site root > theme root > plugin root > core baseline), DTCG curly-brace alias resolution with cycle detection, type coercion table for the 13 DTCG types → CSS string formats, integration with the existing token compiler. Add `tokens.json` schema (defer to W3C DTCG schema by reference; don't write our own). Update the worked example in the spec to be runnable.

3. **Coordinate a `tokens.json` proposal with WordPress core.** This is a longer thread — the spec calls out that `theme.json` v3 may want to adopt the same model and a divergent path forks the ecosystem. Open the conversation with core; don't block v2 ship on the outcome.

4. **JSON Schema hosting.** The three v2 schemas need real URLs at `schemas.wp.org/admin/v2.json` etc. (or wherever the team can host them). For the beta cycle, host from the plugin repo (`https://raw.githubusercontent.com/.../docs/schemas/admin-v2.json`) and reference via `$schema` for IDE validation. Fix once the canonical hosting lands.

5. **Migration tooling.** `wp admin-shell upgrade-config <name>` should now upgrade v0 or v1 (current shipping) configs to v2 form. Read existing `wp_admin_shell_active_shell` option, normalize, write back.

6. **Update CLAUDE.md** to reflect v2 architecture. Update README. Bump version to `2.0.0-beta.1`.

7. **Triage `docs/feedback.md`** items that were fixed incidentally by the migration (the selection-bus security issues, several v1-flatness assumptions, etc.). Clear those to Done. The remainder either survives or doesn't apply; triage explicitly.

8. **Manual smoke pass** per `docs/v1-readiness.md`, updated for v2 surfaces. Cap gating across roles, cold-mount perf, a11y manual passes, both engines render, all bundled shells work.

**Exit criteria:** v2.0.0-beta.1 tagged. Both engines render every bundled shell. All schemas validate the bundled fixtures. Token tests pass with `tokens.json` resolver. No selection bus references anywhere. Manual smoke passes recorded in updated readiness doc.

---

## 5. Things that should NOT change

These are correct as built. Don't disturb them during migration:

- **Cascade resolver internals.** Five-origin merge, restrict-only semantics, hash-based caching, transient layer. Just the field rename (`userCustomizable` → `customizable`) and the v0 normalizer output shape change.
- **Token compiler.** `compileStyles.js`, `emitTokens.js`, `compatBridge.js`, `density.js`. The WPDS surface, chrome extension namespace, and compat bridge all carry forward unchanged. `tokens.json` adds an upstream layer that feeds into the existing compiler — it doesn't replace the compiler.
- **Capability gating model.** Four layers (region fast-path → app gate → source-cap floor → REST observation). The `userCan()`/`checkCan()` helpers and the `/can/{cap}` REST endpoint stay.
- **Build pipeline.** `webpack.config.js`'s dataviews CSS copy step. The `BUNDLED_PACKAGES` reliance on `@wordpress/dataviews` and `@wordpress/ui`. The Gutenberg plugin runtime dependency. None of this changes.
- **Component library choices.** `@wordpress/ui` first, `@wordpress/components` fallback. The mapping cheat sheet in CLAUDE.md is still right.
- **Data layer rules.** `core-data` for entities, `api-fetch` for non-entity. No raw `fetch()`. `context: 'edit'` on entity queries that need raw fields.
- **Test patterns.** PHP `wp eval-file` suites, Node parity tests, schema validation. Add tests for new surfaces (manifest validation, target routing, multi-region URL state) — don't disrupt the existing structure.

---

## 6. Things that should change but didn't make this directive

Out of scope for this migration but worth tracking on the new baseline:

- **`docs/feedback.md` paper-cut backlog.** Triage on the v2 baseline once migration is green. Many items will have evaporated; the remainder may or may not still apply.
- **Floating-window engine** (`core:floating-layout`). The spec says v1 should ship this as a demo to validate the engine boundary. The pragmatic call is `core:single-pane-layout` for v2 (cheaper, harder validation) and `core:floating-layout` for v3 (the impressive demo). Document both as roadmap.
- **Drop-in wp-admin replacement.** v3 still — URL interception of `/wp-admin/*`. Not v2.
- **Multi-shell hot-reload without page reload.** Currently `window.location.reload()` on shell switch. v2 plumbing should still do this; in-process re-mount is v3 polish.
- **WP-CLI manifest commands.** `wp admin-shell register-app`, `wp admin-shell register-engine`, `wp admin-shell list-apps`, `wp admin-shell validate-manifest`. Useful but not required for v2 ship.

---

## 7. How to start

```bash
cd /Users/davidbowman/Github/WordPress-Admin-Environment

# Tag the current state if not already tagged
git tag -a v1.0.0-beta.1 -m "v1 final state before v2 migration"

# Fork v2 work
git checkout main
git pull
git checkout -b feat/wp-admin-shell-v2

# Place new spec and schemas
cp <provided> docs/wp-admin-shell-design-spec-2026-05-01.md
cp <provided> docs/post-editor-sketch.md
cp <provided> docs/schemas/admin-v2.json
cp <provided> docs/schemas/admin-app-v2.json
cp <provided> docs/schemas/admin-engine-v2.json

# Archive old spec
git mv docs/wp-admin-shell-design-spec.md docs/archive/wp-admin-shell-design-spec-2026-04-29.md
git mv docs/wp-admin-shell-design-spec-2026-05-01.md docs/wp-admin-shell-design-spec.md

# Update v1 plan reference
git mv docs/wp-admin-shell-v1-plan.md docs/archive/wp-admin-shell-v1-plan.md
# (write new v2 plan based on this directive — or just keep this directive as the plan)
```

Then begin V2.M1.

---

## 8. Definition of done for the migration

**The migration is complete when:**

- [ ] All bundled shells render correctly under both engines.
- [ ] All schemas validate all bundled shells, all manifests, all fixtures.
- [ ] No file in `src/`, `includes/`, `shells/`, or `docs/schemas/` references the v1 vocabulary (`kind`, `contains`, `respondsTo`, `selectionScope`, `userCustomizable`).
- [ ] No `src/runtime/selection/` directory.
- [ ] No `src/runtime/slots/` directory.
- [ ] All apps have an `app.json` manifest validated against `admin-app-v2.json`.
- [ ] The active engine has an `engine.json` manifest validated against `admin-engine-v2.json`.
- [ ] All bundled shells pass `admin-v2.json` validation.
- [ ] `tokens.json` discovery + alias resolution works; the worked example in the spec is runnable.
- [ ] All test suites pass (PHP cascade, capability, shape; Node schema, parity).
- [ ] Manual smoke pass recorded in `docs/v2-readiness.md`.
- [ ] `v2.0.0-beta.1` tagged.

The directive itself can stay in `docs/` as `wp-admin-shell-v2-plan.md` for reference. It supersedes the v1 plan; don't delete the v1 plan, archive it.