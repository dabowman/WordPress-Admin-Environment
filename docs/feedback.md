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

- **2026-06-04 — [a11y/i18n] engine.json region `label` strings reach the DOM as raw English (no `__()` seam).** Region `label` values declared in `engine.json` (e.g. `"Detail"`, `"Command palette"`) are applied verbatim by the kernel as `aria-label` (persistent) / `aria-labelledby` (modal) text — there is no localization path between the static JSON and the DOM, so the accessible name a non-English VoiceOver user hears is English. The schema's `label` description says "Localize before shipping," but that's currently not achievable for engine-JSON strings. Same locale-agnostic-JSON limitation CLAUDE.md documents for dataView labels (apps work around it with in-app `LABELS = { id: __('…') }` tables); region labels have no equivalent escape hatch yet. Not an alpha blocker; tracking so the schema guidance isn't silently impossible. (source: PR #279 claude-review, issue #71)

- **2026-05-27 — Alpha (0.1.0) deferred work.** Tracked gaps from the
  workspace-as-primary-entry release (`docs/plans/2026-05-27-alpha-release-0.1.0.md`):
  - WP-CLI scaffolder for `wp-content/workspace.json` (`wp admin-workspace scaffold-config`).
  - In-workspace iframe host for unmapped admin links (wire the
    `adminLinkInterceptor` `onUnmatched` seam → an iframe-fallback region
    instead of a full browser navigation).
  - Settings UI that writes `wp-content/workspace.json` (needs filesystem caps +
    nonce + lock handling).
  - Network admin (multisite) support — currently always classic.
  - Customizer native port — currently allowlist/iframe only.
  - `.htaccess` / nginx snippet so `wp-content/workspace.json` isn't served as
    static JSON (ship with install docs).
  - Cleaner deactivation when neither file nor option is set (today: harmless
    no-op, classic admin).

---

## Triaged

Every actionable item now has a GitHub issue (`[#NN]`); the issue holds the working detail. Status below reflects the 2026-05-27 reconciliation sweep.

### Now
_Actively shaping or about to start._

### Next
_Queued for the next working session._

- [#77] [bug] `WP_Admin_Workspaces_Data_Field_Collections` missing cache-invalidation signal — hook `wp_admin_workspaces_cache_signals` + contribute an `all()` hash; ~3-line patch. (source: PR #43 round-2 review 2026-05-14)

### Later
_Acknowledged, not soon. Revisit when adjacent work touches the area._

- [#69] [bug/dx/doc] **core:default engine hygiene** — modes reference unshipped `toolbar`/`site-hub`/`preview` regions; `core:dashboard-grid` template orphaned (renders as straggler); dead `data-mode-minimal` CSS; hardcoded-id slotting vs role dispatch; unused engine `slots` block; chrome→WPDS `content`/`canvas` doc gap. (source: core-default engine review 2026-05-27)
- [#70] [tech-debt/perf/doc] **Tokens system follow-ups** — dedup `is_assoc`; add final `wp_admin_workspaces_tokens` filter; conditional/lazy token enqueue; document cascade-order asymmetry. (source: V2.M5 tokens review 2026-05-05)
- [#72] [feat] Per-item menu icon override / suppression in workspace.json. (source: wp-admin-default menu refinement 2026-05-27)
- [#73] [dx] Kernel published import surface for out-of-tree plugin code — blocks `core:single-pane`/`core:desktop` engine extraction. (source: menu-renderer implementation 2026-05-27)

- [#74] [bug] Modal-based overlays don't inherit region theme (residual after `RegionThemedSubtree` fix). (source: theme-provider portal investigation 2026-05-26)
- [#75] [feat] Entity-CRUD apps: screen-spec feature gaps (status counts, quick/bulk edit, directory browse, …). (source: standardization review 2026-05-26)
- [#76] [feat] `settings-general` → DataForm migration — deferred pending grouped-select support. (source: standardization review 2026-05-26)
- [#78] [feat] Bucket-level `fieldsRef` inheritance in viewConfigs — deferred; workaround is a 6-line filter. (source: C2 review 2026-05-14)
- [#79] [feat] Native mounts for `core:editor` + `core:site-editor` (spec §15 v1) — iframe adapters today. (source: V2.M5 gap close)
- [#80] [bug] workspace.json schema has no `customizable` definition — field implemented but unvalidated. (source: V2.M4 review)
- ~~[#81] [feat] Refresh demo workspaces to showcase v1/v2 native apps (wired into developer-admin only). (source: M5 browser smoke)~~ **Done — #81 closed; the demo set was trimmed to the surviving three (`wp-admin-default` / `single-pane-demo` / `desktop-demo`). Docs reconciled in the #258 drift sweep.**
- [#82] [chore] Rename `wpas_collect_nav_item_caps` → `wp_admin_workspaces_` prefix before public-API freeze. (source: V2.M3 review)
- [#15] [bug] `@wordpress/ui` overlay components blocked on WP core `privateApis` allowlist — Gutenberg-plugin dependency; upstream tracking. (source: pre-M1 inbox)
- [#20] [feat] Post settings panel for SimpleEditorApp (featured image / taxonomy / excerpt / scheduling). (source: pre-M1 inbox)
- [#21] [feat] PostsApp: per-post-type editor routes + URL-encode `wp_template`-shaped ids. (source: M4 review)
- [#22] [feat] UsersApp: bulk-delete reassign-target selector UX. (source: M4 review)
- [#28] [feat] In-process workspace re-mount without a hard reload. (source: M5 review)
- [#30] [test] Runtime smoke harness — JSDOM kernel mount + content-region routing + nav prune. (source: M5)

### Won't do
_Decided against. Keep with rationale so we don't relitigate._

- [2026-05-05] [feat] Field-level child-region merge — `resolveRegion.mjs` whole-child-replaces when a declaration names a child; matches spec §5 line 450 + §5.5. Re-evaluate only if a second engine surfaces real pressure (revise spec in lockstep). (source: V2.M2 task 4 review)
- [2026-05-05] [chore] Engine manifest scaffold fields (`script`/`style`/`specializes-roles`/`honored-platform`) — scaffold, not a defect; `honored-platform` now warns on unhonored requests. No action. (source: V2.M2 task 1 review)
- [2026-05-05] [dx] PreviewEntity `enabled: !!id` redundant — author-flagged vestigial + harmless; the parent guard already gates on `id`. Not worth the churn. (source: V2.M4 review)
- [2026-05-05] [chore] `core.tokens.json` at repo root — cosmetic placement only; loader reads `WP_ADMIN_WORKSPACES_PATH . 'core.tokens.json'` fine. Not worth the path churn. (source: V2.M5 tokens review)
- [2026-05-05] [doc] `RouterProvider` default-route redirect runs once on mount — acknowledged inline (`router.js` `[]` deps + eslint-disable + comment); accepted known limitation (workspace switching reloads the page anyway). (source: V2.M3 review)

---

## In progress

_Work underway. Link to branch / spec / PR._

---

## Done

_Recently shipped. Prune quarterly._

- [2026-06-04] [bug] **[#74] Modal-based overlays now inherit the originating region theme.** (source: theme-provider portal investigation 2026-05-26) `RegionThemedSubtree` (`WpdsThemeProvider`) already fixed the inherited-foreground leak + Popover-portaled overlays (per-instance `Popover.Slot`), but `@wordpress/components` `Modal` uses its own `document.body` portal — escaping the region's `--wpds-*` DOM scope, so a Modal opened from a region themed away from root painted with the shell-root theme. Fixed kernel-side and DS-neutrally: `ScopedThemeProvider` now publishes the active region/app seeds onto a `ScopedStylesContext` (React context propagates through portals), and a new `<PortalThemeScope>` (`ThemeProviderHost.js`) replays those scoped providers inside the modal portal — re-establishing the region tokens + foreground with no `regionId` threading. Wrapped the shared DataViews RenderModals (bulk-confirm / entity-form / bulk-edit) so all six list apps inherit it, plus the app-owned Modals (taxonomy term, media details, plugin upload, menu name/item/delete). No-op when no region themes away from root. Pure stack-accumulation helper `appendScopedStyles` pinned by `tests/runtime/theme-provider-host.test.mjs`.

- [2026-06-04] [#73] [dx] **Kernel now has a published import surface for out-of-tree plugin code.** Closes the loose-script race that blocked extracting `core:single-pane`/`core:desktop` to standalone plugins. Three coordinated changes (all of the issue's listed options): (a) `src/index.js` defers the first kernel mount one `queueMicrotask`, so a plugin/engine script enqueued synchronously after the `wp-admin-workspaces` bundle registers its renderer/icons before first paint; (b) `src/index.js` publishes a stable `window.wpAdminWorkspaces.kernel` surface (`registerMenuRenderer` / `resolveMenuRenderer` / `registerIcons` / `resolveIcon`) — the flat `window.wpAdminWorkspaces.registerMenuRenderer` alias stays for back-compat; (c) the kernel registries (`menuRendererRegistry` + `iconMap`) are now subscribable (`subscribeMenuRenderers` / `subscribeIcons`) and `core:navigation` subscribes via `useSyncExternalStore`, so even a truly async (dynamically-injected) renderer registration repaints the nav instead of leaving it on the fallback. DS-neutral throughout (kernel-no-ds-import guard still green). Tests: subscribe assertions added to `tests/runtime/menu-renderer-registry.test.mjs` + `icon-registry.test.mjs`. Docs: registry headers, CLAUDE.md Navigation section + extension surface #15 timing caveat.

- [2026-06-04] [#71] [a11y/doc/dx] **Region/runtime composition hardening (all 5 items).** (1) `validateRegion` now takes the resolved `routes` block and flags a `mirror`-mode region whose `route-key` names no `@<slot>/…` route (`route-key-unknown-slot`), only when the workspace declares some slot routes so an engine's unused `detail` peer doesn't false-positive; kernel threads `runtimeConfig.routes` into the call. (2) Region-level `label` added to `workspace.json` + `workspace-engine.json` region/template schemas; `resolveRegion` inherits it from the template like `role`; `PersistentRegion` reads it via `aria-label`, `ModalRegion` via the `aria-labelledby` span (falls back to the id slug); bundled engines label their `command-palette` (+ `detail`) regions. (3) `resolveRegion` layout-vs-style split **amended, not implemented** — the split is an authoring boundary (schema-enforced) that collapses to one inline `style` map at the same DOM node; documented in the `resolveRegion` header + spec §5.2, retiring the stale "task 6" deferral. (4) Unused `triggerShortcut` accessor **dropped** — `core:trigger` is a declarative hint; the real binding lives in `bindings` (a kernel consumer would double-fire Mod+K). (5) `mountApp.resolveAppInstance` now dev-warns (NODE_ENV-gated, iconMap pattern) on a non-namespaced app ref instead of returning `null` silently. Tests: `tests/runtime/validate-region.test.mjs` (slot cross-check cases) + `platform-services.test.mjs` (triggerShortcut removed). (source: V2.M2 reviews 2026-05-05)

- [2026-05-29] [bug] **`core:editor` now re-syncs `postId` on same-pattern navigation.** (source: ultrareview, branch `testing/0.1.0-testing`) Navigating edit-post-A → edit-post-B shares the `/posts/{id}/edit` route pattern, so `MountedApp` didn't remount and `EditorApp`'s `postId`/`iframeLoading` state stayed on A — the iframe kept showing the wrong post (and a save would overwrite the wrong record). Ported `SimpleEditorApp`'s `prevRawRef` re-sync `useEffect` to `EditorApp`: resets `postId` + creating state and flips `iframeLoading=true` so the spinner shows during the reload. The auto-draft `replaceState` path is a no-op for the guard (`postIdParam` stays `new`/undefined there). Made reachable on the default workspace by the 2026-05-28 `config.postId`→`config.id` fix below.

- [2026-05-29] [bug] **PluginsApp paginator clamps `view.page` to the data.** (source: ultrareview, branch `testing/0.1.0-testing`) A bulk delete + `refresh()` shrinks `data` without a controlled view edit, so a stale `view.page` (page 2 of a now-single-page list) sliced past the end and rendered an empty list with the paginator hidden (`totalPages` collapsed to 1). The `paginatedData` memo now clamps `page = min(view.page, totalPages)` before slicing.

- [2026-05-28] [bug] **Editor stuck on permanent spinner — fixed (two paths).** (source: user report 2026-05-28)
  - *Edit:* `wp-admin-default`'s post-edit/page-edit screens passed the captured id into `config.postId`, but `core:editor` reads `config.id`. `interpolate()` only carries declared `config` keys and `config-schema` is never enforced at mount, so `config.id` was `undefined` → `Number(undefined)` is `NaN` → the `! postId` loading guard never cleared (spinner forever, no error). Aligned both screens to `"id": "{id}"` (matching the already-correct `single-pane-demo.json`), declared `id` in the editor `config-schema`, fixed the `postId` references in `app.json`/`app.md`, and codified the route-config-key trap in `CLAUDE.md`.
  - *Add-new:* the `/posts/new` & `/pages/new` screens route to `core:editor` with no `config.id`, but `EditorApp.isNew` only checked `=== 'new'` → undefined fell through to `NaN` postId → same stuck spinner, no draft created. Brought `EditorApp` in line with `SimpleEditorApp`: `isNew` treats `undefined`/`''`/`'new'` as the create flow, and `createDraft` now `replaceState`s to the canonical `#/{posts|pages}/{id}/edit` (was non-canonical `#/editor/...` that 404'd on refresh). Validated end-to-end against the resolved doc + the JS route matcher.

- [2026-05-27] **Feedback ↔ GitHub reconciliation sweep.** Audited every Inbox/Triaged item against current code and against the issue tracker. Opened issues #69–#82 for the still-relevant untracked items (newer 2026-05-06→05-27 items + verified-still-open 2026-05-05 cleanups, bundled per repo convention). Closed #18 (nav drilldown + navigate combined mode — implemented in `SidebarDrilldownRenderer.js`'s `navigateContainer()`). Older Inbox items already tracked by issues #1–#16, #19, #23, #27, #29 are resolved/closed; their stale Inbox copies were removed here. **Verified obsolete (no issue needed):** flat-v0 JS resolver (`src/config/resolveConfig.js` doesn't exist; the 6-origin PHP cascade is fully built); orphan PascalCase apps (reorganized into `src/apps/<id>/` + registered in `builtins.js`); `navigate()` legacy multi-arg branches (simplified to href-only); `normalize_v0` alias (removed from PHP + JS); `customizable` `LEGACY_FIELD`/`userCustomizable` fallback (no such constant); DataViews `actions` trailing-comma residue (clean); kernel `SlotFillProvider` import comment (exists in `kernel.js`); `tokens.json` schema honesty (now self-describes as a "compatible subset"; DTCG invariants enforced in `tokensResolver.mjs`); engine token-alias-unseeded (the `core-site-editor-layout` engine no longer exists and `compileStyles.resolveValue()` falls through to a `var()`); non-developer-admin workspace token discrepancy (not reproducible — token emission is workspace-agnostic).

- [2026-05-27] [doc→feat] **`menu-renderer` engine field is now functional (was decorative).** Implemented the full mechanism instead of downgrading to advisory. `buildRuntimeConfig` stamps the engine's `menu-renderer` onto the runtime config; `core:navigation` became a thin dispatcher resolving the renderer id through a new DS-neutral kernel registry (`src/runtime/config/menuRendererRegistry.js`, mirror of `iconMap`). Built `sidebar-tree` (expandable in-place tree); extracted shared pure tree helpers to `src/runtime/menu/menuTree.mjs`; moved the drilldown logic to `src/apps/navigation/_renderers/`. `core:single-pane` ships an engine-owned `drawer` accordion renderer that self-registers from its engine module (so it travels on extraction). The three bundled engines declare their `menu-renderer` (`sidebar-drilldown` / `drawer` / `dock`). Added the `wp_admin_workspaces_register_menu_renderer()` plugin entry point (`WP_Admin_Workspaces_Menu_Renderers`) + `window.wpAdminWorkspaces.registerMenuRenderer` published surface. Tests: `tests/runtime/menu-renderer-registry.test.mjs`, `menu-tree.test.mjs`, build-runtime-config stamping asserts, `run-manifest-tests.php` register-renderer asserts. Docs: `docs/core-default-engine.md`, navigation `app.json`/`app.md`, CLAUDE.md (extension surface #15). **Behavior change:** `core:single-pane` now renders a real accordion drawer instead of reusing drilldown. (source: implements the 2026-05-27 core-default engine review item)

- [2026-05-05] [bug] **Ship-blocker fixed:** ModalRegion default-open — `src/runtime/regions/Region.js` now starts triggerable regions closed (`useState(!isTriggerable)`) and renders an inert `display: none` subtree so children with side-effect hooks (`useCommandLoader`, etc.) keep mounting. Bundled command palette no longer pops a backdrop on every workspace load. Trigger.shortcut binding consumer remains V2.M5 work. (source: V2.M2 task 6 review)
- [2026-05-05] [bug] ModalRegion autofocus scoped to dialog — query target now `dialogRef.current.querySelector` instead of `document.querySelector`. (source: V2.M2 task 6 review)
- [2026-05-05] [perf] `useRouteForRegion` gated on route-key — `GenericRegion` now passes `null` for the region argument when `region.routing?.['route-key']` is absent, so non-routable regions don't subscribe to the router. (source: V2.M2 task 6 review)
- [2026-05-05] [bug] **Ship-blocker fixed:** editor flow dead-end (`navigate('editor', postType, id)`) — PostsApp + SimpleEditorApp rewritten against the v2 routes block. PostsApp emits hrefs via `editHref(postType, id)` → `#/posts/{id}/edit` / `#/pages/{id}/edit`; SimpleEditorApp now reads `postType` + `id` from interpolated route config; createDraft writes the canonical edit URL. Editor routes added to developer-admin / content-author / single-pane-demo / client-portal / v1-demo with `{id}` interpolation. (source: app audit 2026-05-05; V2.M5 review)
- [2026-05-05] [bug] **Verified obsolete:** IframeApp config.url — already reads `config.url` (line 34) post-V2.M3 workspace migration; the `iframe:` source-prefix path is gone. (source: app audit 2026-05-05; verified V2.M5 review)
- [2026-05-05] [bug] **Verified obsolete:** CommandPickerApp empty applications[] / instance-config filter / NavigationApp default-route — all rewritten in V2.M3. CommandPickerApp now derives commands from `config.routes`; NavigationApp's `resolveDefaultApp` lookup is gone (URL routing handles default-route via RouterProvider's redirect). (source: app audit 2026-05-05; verified V2.M5 review)
- [2026-05-05] [bug] **Verified obsolete:** selection-bus + slot/fill consumer apps — all four (PreviewPaneApp / PostsApp / UsersApp / CommentsApp / SettingsApp / SimpleEditorApp) migrated off `useSelection` + `useSlotItems` in V2.M4 phases 1-3. `grep useSelection useSlotItems` returns zero hits across `src/`. (source: app audit 2026-05-05; verified V2.M5 review)
- [2026-05-05] [bug] **Fixed:** `wp admin-workspace upgrade-config` silent no-op — command retired (the v0 normalizer it called was retired in `10e87d1`). Replaced with `wp admin-workspace check_config <name>` that reports v0/v1/v2 shape + flags legacy fields and points at the design spec for hand-rewriting. (source: V2.M4 review; V2.M5 commit `7d96008`)
- [2026-05-05] [bug] **Fixed:** WP_Admin_Workspaces_Tokens cache never invalidates — added defensive hooks at the bottom of `class-wp-admin-workspaces-tokens.php`: `update_option_wp_admin_workspaces_site_tokens` / `add_option_*` / `delete_option_*` / `switch_theme` / `activated_plugin` / `deactivated_plugin` all fire `flush()`. Mirrors `WP_Admin_Workspaces_Cache` invalidation pattern. (source: V2.M5 tokens review)
- [2026-05-05] [bug] **Fixed:** tokensResolver coerce default branch silent JSON.stringify — `coerce()` now warns + emits empty string for objects without a coercer; `isDtcgToken` requires `$value !== undefined` (rejects explicit-undefined values); `border` coercer defaults missing `style` to `solid` and only requires width + color. New tests in `tests/runtime/tokens-resolver.test.mjs` (24 cases). (source: V2.M5 tokens review)
- [2026-05-05] [bug] **Fixed:** no end-to-end compileStyles + tokens test — added `tests/runtime/compile-styles-tokens.test.mjs` (4 cases). Verifies WPDS slot picks up tokens.json literal, unresolved alias falls through to `var()`, within-doc `{styles.X}` aliases beat tokens, missing tokens arg keeps var() fallback. Wired into `npm run test:runtime`. (source: V2.M5 tokens review)
- [2026-05-05] [chore] **Fixed:** single-pane engine dead accent paths — `Layout.js` no longer reads `config.styles.color.accent.brand` / `config.branding.accentColor` (both gone post-`10e87d1`). Brand color flows through the WPDS chrome→token bridge instead. (source: V2.M5 tokens review)
- [2026-05-05] [bug] **Fixed:** resolveRegion recursion depth + cycle detection — `resolveRegion.mjs` now caps recursion at depth 10 and tracks visited template ids per chain. Self-referential template chains bail with a console.warn instead of stack-overflowing. Tests cover deeply-nested literal chain (50 levels) + cyclic A↔B template chain. (source: V2.M2 task 4 review; V2.M5 sweep)
- [2026-05-06] **Pre-demo audit sweep.** Validated 2026-04-30 / 2026-05-05 Inbox items against current code; pruned obsolete entries in bulk. Verified previously fixed: EditorApp empty-content seed (`src/apps/EditorApp.js:47`), `switchShell` slug pre-flight (`src/runtime/workspace-switching.js:37`), compatBridge 8-digit hex + `rgba()` (`src/runtime/styles/compatBridge.js:65,92`), compileStyles DTCG alias cycle detection w/ `MAX_ALIAS_DEPTH=16` (`src/runtime/styles/compileStyles.js:268`), density `resolveDensity` overwrite-on-switch (`src/runtime/styles/density.js`), pathToWpds slot-collision warn (`compileStyles.js:emitTo`), `compileSubtree` refactored into shared `compileTree`, `compatBridge` rewritten doc header, `density.js` dev-warn on null root. Retired by upstream changes: `normalizeV0.js` (file deleted), `wp admin-workspace upgrade-config` (replaced by `check_config`), PreviewPaneApp `content.selection` default (now `_self` post-selection-bus removal), `CommandPickerApp.js` (renamed `CommandPaletteApp.js`, useMemo deps already stable on `routes`). Closed by V2.M5 ship: plugin `2.0.0-beta.1` version + PHP tokens test suite entry in CLAUDE.md.
- [2026-05-06] [bug] **Fixed:** Settings panel slot/fill collision — slot/fill panels retired in V2.M4 phase 4; `src/apps/SettingsApp.js` only filters BUILTIN_PANELS by `config.panels[]` allowlist. Stale doc-comment referencing the panels slot updated in the same pass.
- [2026-05-06] [bug] **Fixed:** CommandPalette slug collision — `src/runtime/apps/CommandPaletteApp.js:49` now derives the command `name` from `encodeURIComponent(pattern)` instead of collapsing non-alphanumerics to `-`. Distinct routes `/foo-bar` and `/foo/bar` no longer trip `@wordpress/commands` duplicate-name registration.
- [2026-05-06] [a11y] **Fixed:** sidebar navigation `<nav>` + `aria-label` — `src/apps/NavigationApp.js` wraps both collapsed and expanded branches in `<nav aria-label={navConfig['aria-label'] || __('Main')}>` so the sidebar registers as a proper landmark in screen readers.
- [2026-05-12] [chore] **Fixed:** `workspaces/v1-demo.json` renamed to `workspaces/v2-demo.json` — `name` field, render-smoke workspace list, CLAUDE.md project-structure block, v2-readiness workspace table, posts/index.js comment all updated. (source: V2.M3 review; v2 wrap-up sweep)
- [2026-05-06] [chore] **Fixed:** consolidate `src/runtime/apps/` into `src/apps/` — all 9 chrome/system apps (`NavigationApp`, `SiteHubApp`, `ToolbarActionsApp`, `CommandPaletteApp`, `PreviewPaneApp`, `NoticesApp`, `AppearanceApp`, `SiteEditorApp`, `UserMenuApp`) plus `_components/` and 10 manifest subdirs moved from `src/runtime/apps/` to `src/apps/`. `src/runtime/registry/builtins.js` import paths updated; `wp-admin-workspaces.php` manifest discovery still scans both `src/` and `src/runtime/` (engines stay in `src/runtime/engines/`); `tests/schema/validate-workspaces.test.mjs` `APP_MANIFEST_DIRS` simplified to single path; CLAUDE.md project-structure block redrawn. Net: single home for app code, registry no longer special-cases the chrome split, manifest discovery convention unified.
- [2026-05-14] [feat] **Fixed (F1):** Render-time id→`__()` mapping for view-config labels — `src/apps/posts/index.js` ships `FIELD_LABELS` + `ACTION_LABELS` constants; `buildFields` / `buildActions` consult `LABELS[id] ?? spec.label`. Translation tools see the `__()` literals at module load; plugin extension columns/actions fall through to the spec-supplied label. Pattern documented in CLAUDE.md "Recurring patterns" + `src/apps/posts/app.md` "Translation recipe". Gates Track F entity-CRUD migration sweep so the regression doesn't repeat per app. (source: Track E — `feat/c2-postsapp-hardening`)
- [2026-05-14] [bug] **Fixed (F2):** PostsApp `view` useState not re-initialized on `postType`/`variant` flip — `src/apps/posts/index.js` adds a `useEffect` keyed on `[ postType, variant ]` that resets `view` to `{ ...VIEW_DEFAULTS, ...resolved.defaultView }`. Triple flips on the same hook instance no longer inherit the prior triple's `perPage` / `sort` / `filters`. Effect deliberately doesn't depend on `viewConfig` so mid-session cascade re-resolves don't clobber in-session view edits. (source: Track E — `feat/c2-postsapp-hardening`)
- [2026-05-14] [chore] **Fixed (F4):** No React-side `viewConfigFallback.js` shipped — `inject_app_baselines` plus the `app.json#viewConfig` baseline already cover every triple at boot, and `useViewConfig` returns `config: doc ?? {}` for the empty-cascade edge. PostsApp consumes the cascade directly with no defense-in-depth fallback module. Verified by sweep: zero references to a `viewConfigFallback` symbol anywhere in `src/` or `tests/`. (source: Track E — `feat/c2-postsapp-hardening`)
