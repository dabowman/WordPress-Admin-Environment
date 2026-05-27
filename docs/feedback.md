# Feedback, Feature Requests & To-Dos

Running log for things we notice across sessions. Capture first, triage later. Nothing here is committed work — items move to specs, plans, or commits when promoted.

## How to use

- **Add freely.** When something comes up mid-session — a bug, a paper cut, a feature idea, a doc gap — drop it in `## Inbox` with a date. Don't gate on detail.
- **Triage in batches.** Periodically move Inbox items into `## Triaged` with a status: `now`, `next`, `later`, `won't do`. Add a one-line rationale.
- **Promote when ready.** When a triaged item gets picked up, move it to `## In progress` with a link to the branch / spec / PR. Move to `## Done` once shipped (with commit SHA or PR link). Prune Done items quarterly.
- **One item = one bullet.** Sub-bullets only for context the bullet can't carry alone.
- **Track in GitHub.** When an item is real and actionable, open a GitHub issue and cross-reference it here as `[#NN]`. The issue carries the working detail; this log carries the triage state.

Format per item:

```
- [YYYY-MM-DD] [type] short title — one-line description. (source: who/where, optional)
```

Types: `bug`, `feat`, `chore`, `doc`, `design`, `perf`, `a11y`, `dx`.

---

## Inbox

_New items land here. No triage yet._

_(empty — the 2026-05-27 audit sweep triaged every open item into a GitHub issue; see Triaged below.)_

---

## Triaged

Every actionable item now has a GitHub issue (`[#NN]`); the issue holds the working detail. Status below reflects the 2026-05-27 reconciliation sweep.

### Now
_Actively shaping or about to start._

### Next
_Queued for the next working session._

- [#77] [bug] `WP_Admin_Shell_Data_Field_Collections` missing cache-invalidation signal — hook `wp_admin_shell_cache_signals` + contribute an `all()` hash; ~3-line patch. (source: PR #43 round-2 review 2026-05-14)
- [#71] [bug] `validateRegion` route-key cross-check — misspelled keys should error at composition, not silently no-op. (part of the region-hardening bundle) (source: V2.M2 task 5 review)

### Later
_Acknowledged, not soon. Revisit when adjacent work touches the area._

- [#69] [bug/dx/doc] **core:default engine hygiene** — modes reference unshipped `toolbar`/`site-hub`/`preview` regions; `core:dashboard-grid` template orphaned (renders as straggler); dead `data-mode-minimal` CSS; hardcoded-id slotting vs role dispatch; unused engine `slots` block; chrome→WPDS `content`/`canvas` doc gap. (source: core-default engine review 2026-05-27)
- [#70] [tech-debt/perf/doc] **Tokens system follow-ups** — dedup `is_assoc`; add final `wp_admin_shell_tokens` filter; conditional/lazy token enqueue; document cascade-order asymmetry. (source: V2.M5 tokens review 2026-05-05)
- [#71] [a11y/doc/dx] **Region/runtime composition hardening** — region-level `label` field for `aria-labelledby`; `resolveRegion` layout-vs-style split (spec §5.2); residual `triggerShortcut` consumer; `mountApp` warn on non-namespaced id. (source: V2.M2 reviews 2026-05-05)
- [#72] [feat] Per-item menu icon override / suppression in admin.json. (source: wp-admin-default menu refinement 2026-05-27)
- [#73] [dx] Kernel published import surface for out-of-tree plugin code — blocks `core:single-pane`/`core:desktop` engine extraction. (source: menu-renderer implementation 2026-05-27)
- [#74] [bug] Modal-based overlays don't inherit region theme (residual after `RegionThemedSubtree` fix). (source: theme-provider portal investigation 2026-05-26)
- [#75] [feat] Entity-CRUD apps: screen-spec feature gaps (status counts, quick/bulk edit, directory browse, …). (source: standardization review 2026-05-26)
- [#76] [feat] `settings-general` → DataForm migration — deferred pending grouped-select support. (source: standardization review 2026-05-26)
- [#78] [feat] Bucket-level `fieldsRef` inheritance in viewConfigs — deferred; workaround is a 6-line filter. (source: C2 review 2026-05-14)
- [#79] [feat] Native mounts for `core:editor` + `core:site-editor` (spec §15 v1) — iframe adapters today. (source: V2.M5 gap close)
- [#80] [bug] admin.json schema has no `customizable` definition — field implemented but unvalidated. (source: V2.M4 review)
- [#81] [feat] Refresh demo shells to showcase v1/v2 native apps (wired into developer-admin only). (source: M5 browser smoke)
- [#82] [chore] Rename `wpas_collect_nav_item_caps` → `wp_admin_shell_` prefix before public-API freeze. (source: V2.M3 review)
- [#15] [bug] `@wordpress/ui` overlay components blocked on WP core `privateApis` allowlist — Gutenberg-plugin dependency; upstream tracking. (source: pre-M1 inbox)
- [#20] [feat] Post settings panel for SimpleEditorApp (featured image / taxonomy / excerpt / scheduling). (source: pre-M1 inbox)
- [#21] [feat] PostsApp: per-post-type editor routes + URL-encode `wp_template`-shaped ids. (source: M4 review)
- [#22] [feat] UsersApp: bulk-delete reassign-target selector UX. (source: M4 review)
- [#28] [feat] In-process shell re-mount without a hard reload. (source: M5 review)
- [#30] [test] Runtime smoke harness — JSDOM kernel mount + content-region routing + nav prune. (source: M5)

### Won't do
_Decided against. Keep with rationale so we don't relitigate._

- [2026-05-05] [feat] Field-level child-region merge — `resolveRegion.mjs` whole-child-replaces when a declaration names a child; matches spec §5 line 450 + §5.5. Re-evaluate only if a second engine surfaces real pressure (revise spec in lockstep). (source: V2.M2 task 4 review)
- [2026-05-05] [chore] Engine manifest scaffold fields (`script`/`style`/`specializes-roles`/`honored-platform`) — scaffold, not a defect; `honored-platform` now warns on unhonored requests. No action. (source: V2.M2 task 1 review)
- [2026-05-05] [dx] PreviewEntity `enabled: !!id` redundant — author-flagged vestigial + harmless; the parent guard already gates on `id`. Not worth the churn. (source: V2.M4 review)
- [2026-05-05] [chore] `core.tokens.json` at repo root — cosmetic placement only; loader reads `WP_ADMIN_SHELL_PATH . 'core.tokens.json'` fine. Not worth the path churn. (source: V2.M5 tokens review)
- [2026-05-05] [doc] `RouterProvider` default-route redirect runs once on mount — acknowledged inline (`router.js` `[]` deps + eslint-disable + comment); accepted known limitation (shell switching reloads the page anyway). (source: V2.M3 review)

---

## In progress

_Work underway. Link to branch / spec / PR._

---

## Done

_Recently shipped. Prune quarterly._

- [2026-05-27] **Feedback ↔ GitHub reconciliation sweep.** Audited every Inbox/Triaged item against current code and against the issue tracker. Opened issues #69–#82 for the still-relevant untracked items (newer 2026-05-06→05-27 items + verified-still-open 2026-05-05 cleanups, bundled per repo convention). Closed #18 (nav drilldown + navigate combined mode — implemented in `SidebarDrilldownRenderer.js`'s `navigateContainer()`). Older Inbox items already tracked by issues #1–#16, #19, #23, #27, #29 are resolved/closed; their stale Inbox copies were removed here. **Verified obsolete (no issue needed):** flat-v0 JS resolver (`src/config/resolveConfig.js` doesn't exist; the 6-origin PHP cascade is fully built); orphan PascalCase apps (reorganized into `src/apps/<id>/` + registered in `builtins.js`); `navigate()` legacy multi-arg branches (simplified to href-only); `normalize_v0` alias (removed from PHP + JS); `customizable` `LEGACY_FIELD`/`userCustomizable` fallback (no such constant); DataViews `actions` trailing-comma residue (clean); kernel `SlotFillProvider` import comment (exists in `kernel.js`); `tokens.json` schema honesty (now self-describes as a "compatible subset"; DTCG invariants enforced in `tokensResolver.mjs`); engine token-alias-unseeded (the `core-site-editor-layout` engine no longer exists and `compileStyles.resolveValue()` falls through to a `var()`); non-developer-admin shell token discrepancy (not reproducible — token emission is shell-agnostic).

- [2026-05-27] [doc→feat] **`menu-renderer` engine field is now functional (was decorative).** Implemented the full mechanism instead of downgrading to advisory. `buildRuntimeConfig` stamps the engine's `menu-renderer` onto the runtime config; `core:navigation` became a thin dispatcher resolving the renderer id through a new DS-neutral kernel registry (`src/runtime/config/menuRendererRegistry.js`, mirror of `iconMap`). Built `sidebar-tree` (expandable in-place tree); extracted shared pure tree helpers to `src/runtime/menu/menuTree.mjs`; moved the drilldown logic to `src/apps/navigation/_renderers/`. `core:single-pane` ships an engine-owned `drawer` accordion renderer that self-registers from its engine module (so it travels on extraction). The three bundled engines declare their `menu-renderer` (`sidebar-drilldown` / `drawer` / `dock`). Added the `wp_admin_shell_register_menu_renderer()` plugin entry point (`WP_Admin_Shell_Menu_Renderers`) + `window.wpAdminShell.registerMenuRenderer` published surface. Tests: `tests/runtime/menu-renderer-registry.test.mjs`, `menu-tree.test.mjs`, build-runtime-config stamping asserts, `run-manifest-tests.php` register-renderer asserts. Docs: `docs/core-default-engine.md`, navigation `app.json`/`app.md`, CLAUDE.md (extension surface #15). **Behavior change:** `core:single-pane` now renders a real accordion drawer instead of reusing drilldown. (source: implements the 2026-05-27 core-default engine review item)

- [2026-05-05] [bug] **Ship-blocker fixed:** ModalRegion default-open — `src/runtime/regions/Region.js` now starts triggerable regions closed (`useState(!isTriggerable)`) and renders an inert `display: none` subtree so children with side-effect hooks (`useCommandLoader`, etc.) keep mounting. Bundled command palette no longer pops a backdrop on every shell load. Trigger.shortcut binding consumer remains V2.M5 work. (source: V2.M2 task 6 review)
- [2026-05-05] [bug] ModalRegion autofocus scoped to dialog — query target now `dialogRef.current.querySelector` instead of `document.querySelector`. (source: V2.M2 task 6 review)
- [2026-05-05] [perf] `useRouteForRegion` gated on route-key — `GenericRegion` now passes `null` for the region argument when `region.routing?.['route-key']` is absent, so non-routable regions don't subscribe to the router. (source: V2.M2 task 6 review)
- [2026-05-05] [bug] **Ship-blocker fixed:** editor flow dead-end (`navigate('editor', postType, id)`) — PostsApp + SimpleEditorApp rewritten against the v2 routes block. PostsApp emits hrefs via `editHref(postType, id)` → `#/posts/{id}/edit` / `#/pages/{id}/edit`; SimpleEditorApp now reads `postType` + `id` from interpolated route config; createDraft writes the canonical edit URL. Editor routes added to developer-admin / content-author / single-pane-demo / client-portal / v1-demo with `{id}` interpolation. (source: app audit 2026-05-05; V2.M5 review)
- [2026-05-05] [bug] **Verified obsolete:** IframeApp config.url — already reads `config.url` (line 34) post-V2.M3 shell migration; the `iframe:` source-prefix path is gone. (source: app audit 2026-05-05; verified V2.M5 review)
- [2026-05-05] [bug] **Verified obsolete:** CommandPickerApp empty applications[] / instance-config filter / NavigationApp default-route — all rewritten in V2.M3. CommandPickerApp now derives commands from `config.routes`; NavigationApp's `resolveDefaultApp` lookup is gone (URL routing handles default-route via RouterProvider's redirect). (source: app audit 2026-05-05; verified V2.M5 review)
- [2026-05-05] [bug] **Verified obsolete:** selection-bus + slot/fill consumer apps — all four (PreviewPaneApp / PostsApp / UsersApp / CommentsApp / SettingsApp / SimpleEditorApp) migrated off `useSelection` + `useSlotItems` in V2.M4 phases 1-3. `grep useSelection useSlotItems` returns zero hits across `src/`. (source: app audit 2026-05-05; verified V2.M5 review)
- [2026-05-05] [bug] **Fixed:** `wp admin-shell upgrade-config` silent no-op — command retired (the v0 normalizer it called was retired in `10e87d1`). Replaced with `wp admin-shell check_config <name>` that reports v0/v1/v2 shape + flags legacy fields and points at the design spec for hand-rewriting. (source: V2.M4 review; V2.M5 commit `7d96008`)
- [2026-05-05] [bug] **Fixed:** WP_Admin_Shell_Tokens cache never invalidates — added defensive hooks at the bottom of `class-wp-admin-shell-tokens.php`: `update_option_wp_admin_shell_site_tokens` / `add_option_*` / `delete_option_*` / `switch_theme` / `activated_plugin` / `deactivated_plugin` all fire `flush()`. Mirrors `WP_Admin_Shell_Cache` invalidation pattern. (source: V2.M5 tokens review)
- [2026-05-05] [bug] **Fixed:** tokensResolver coerce default branch silent JSON.stringify — `coerce()` now warns + emits empty string for objects without a coercer; `isDtcgToken` requires `$value !== undefined` (rejects explicit-undefined values); `border` coercer defaults missing `style` to `solid` and only requires width + color. New tests in `tests/runtime/tokens-resolver.test.mjs` (24 cases). (source: V2.M5 tokens review)
- [2026-05-05] [bug] **Fixed:** no end-to-end compileStyles + tokens test — added `tests/runtime/compile-styles-tokens.test.mjs` (4 cases). Verifies WPDS slot picks up tokens.json literal, unresolved alias falls through to `var()`, within-doc `{styles.X}` aliases beat tokens, missing tokens arg keeps var() fallback. Wired into `npm run test:runtime`. (source: V2.M5 tokens review)
- [2026-05-05] [chore] **Fixed:** single-pane engine dead accent paths — `Layout.js` no longer reads `config.styles.color.accent.brand` / `config.branding.accentColor` (both gone post-`10e87d1`). Brand color flows through the WPDS chrome→token bridge instead. (source: V2.M5 tokens review)
- [2026-05-05] [bug] **Fixed:** resolveRegion recursion depth + cycle detection — `resolveRegion.mjs` now caps recursion at depth 10 and tracks visited template ids per chain. Self-referential template chains bail with a console.warn instead of stack-overflowing. Tests cover deeply-nested literal chain (50 levels) + cyclic A↔B template chain. (source: V2.M2 task 4 review; V2.M5 sweep)
- [2026-05-06] **Pre-demo audit sweep.** Validated 2026-04-30 / 2026-05-05 Inbox items against current code; pruned obsolete entries in bulk. Verified previously fixed: EditorApp empty-content seed (`src/apps/EditorApp.js:47`), `switchShell` slug pre-flight (`src/runtime/shell-switching.js:37`), compatBridge 8-digit hex + `rgba()` (`src/runtime/styles/compatBridge.js:65,92`), compileStyles DTCG alias cycle detection w/ `MAX_ALIAS_DEPTH=16` (`src/runtime/styles/compileStyles.js:268`), density `resolveDensity` overwrite-on-switch (`src/runtime/styles/density.js`), pathToWpds slot-collision warn (`compileStyles.js:emitTo`), `compileSubtree` refactored into shared `compileTree`, `compatBridge` rewritten doc header, `density.js` dev-warn on null root. Retired by upstream changes: `normalizeV0.js` (file deleted), `wp admin-shell upgrade-config` (replaced by `check_config`), PreviewPaneApp `content.selection` default (now `_self` post-selection-bus removal), `CommandPickerApp.js` (renamed `CommandPaletteApp.js`, useMemo deps already stable on `routes`). Closed by V2.M5 ship: plugin `2.0.0-beta.1` version + PHP tokens test suite entry in CLAUDE.md.
- [2026-05-06] [bug] **Fixed:** Settings panel slot/fill collision — slot/fill panels retired in V2.M4 phase 4; `src/apps/SettingsApp.js` only filters BUILTIN_PANELS by `config.panels[]` allowlist. Stale doc-comment referencing the panels slot updated in the same pass.
- [2026-05-06] [bug] **Fixed:** CommandPalette slug collision — `src/runtime/apps/CommandPaletteApp.js:49` now derives the command `name` from `encodeURIComponent(pattern)` instead of collapsing non-alphanumerics to `-`. Distinct routes `/foo-bar` and `/foo/bar` no longer trip `@wordpress/commands` duplicate-name registration.
- [2026-05-06] [a11y] **Fixed:** sidebar navigation `<nav>` + `aria-label` — `src/apps/NavigationApp.js` wraps both collapsed and expanded branches in `<nav aria-label={navConfig['aria-label'] || __('Main')}>` so the sidebar registers as a proper landmark in screen readers.
- [2026-05-12] [chore] **Fixed:** `shells/v1-demo.json` renamed to `shells/v2-demo.json` — `name` field, render-smoke shell list, CLAUDE.md project-structure block, v2-readiness shell table, posts/index.js comment all updated. (source: V2.M3 review; v2 wrap-up sweep)
- [2026-05-06] [chore] **Fixed:** consolidate `src/runtime/apps/` into `src/apps/` — all 9 chrome/system apps (`NavigationApp`, `SiteHubApp`, `ToolbarActionsApp`, `CommandPaletteApp`, `PreviewPaneApp`, `NoticesApp`, `AppearanceApp`, `SiteEditorApp`, `UserMenuApp`) plus `_components/` and 10 manifest subdirs moved from `src/runtime/apps/` to `src/apps/`. `src/runtime/registry/builtins.js` import paths updated; `wp-admin-shell.php` manifest discovery still scans both `src/` and `src/runtime/` (engines stay in `src/runtime/engines/`); `tests/schema/validate-shells.test.mjs` `APP_MANIFEST_DIRS` simplified to single path; CLAUDE.md project-structure block redrawn. Net: single home for app code, registry no longer special-cases the chrome split, manifest discovery convention unified.
- [2026-05-14] [feat] **Fixed (F1):** Render-time id→`__()` mapping for view-config labels — `src/apps/posts/index.js` ships `FIELD_LABELS` + `ACTION_LABELS` constants; `buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`. Translation tools see the `__()` literals at module load; plugin extension columns/actions fall through to the spec-supplied label. Pattern documented in CLAUDE.md "Recurring patterns" + `src/apps/posts/app.md` "Translation recipe". Gates Track F entity-CRUD migration sweep so the regression doesn't repeat per app. (source: Track E — `feat/c2-postsapp-hardening`)
- [2026-05-14] [bug] **Fixed (F2):** PostsApp `view` useState not re-initialized on `postType`/`variant` flip — `src/apps/posts/index.js` adds a `useEffect` keyed on `[ postType, variant ]` that resets `view` to `{ ...VIEW_DEFAULTS, ...resolved.defaultView }`. Triple flips on the same hook instance no longer inherit the prior triple's `perPage` / `sort` / `filters`. Effect deliberately doesn't depend on `viewConfig` so mid-session cascade re-resolves don't clobber in-session view edits. (source: Track E — `feat/c2-postsapp-hardening`)
- [2026-05-14] [chore] **Fixed (F4):** No React-side `viewConfigFallback.js` shipped — `inject_app_baselines` plus the `app.json#viewConfig` baseline already cover every triple at boot, and `useViewConfig` returns `config: doc ?? {}` for the empty-cascade edge. PostsApp consumes the cascade directly with no defense-in-depth fallback module. Verified by sweep: zero references to a `viewConfigFallback` symbol anywhere in `src/` or `tests/`. (source: Track E — `feat/c2-postsapp-hardening`)
