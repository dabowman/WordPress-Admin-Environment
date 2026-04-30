# WP Admin Shell — v1 Implementation Plan

> **Status:** Living plan. Authoritative source for the v1 milestone breakdown, task ordering, and exit criteria.
> **Last revised:** 2026-04-30
> **Companion to:** [`wp-admin-shell-design-spec.md`](./wp-admin-shell-design-spec.md) (master design) and [`wp-admin-shell-mvp-spec.md`](./wp-admin-shell-mvp-spec.md) (validated proof-of-concept).

---

## Premise

The MVP proved the concept is viable: a JSON-driven, React-based replacement admin environment using `@wordpress/core-data`, DataViews, and the `@wordpress/ui` design system, deployed as a single plugin. v1 is the production-quality version of that concept built against the architecture in the master design spec — regions, apps, layout engines, a 5-origin cascade, the WPDS-native style system, and the four-layer capability model.

**v1 is a kernel rebuild, not a refactor.** The MVP's runtime hardcodes one layout arrangement (sidebar + toolbar + content). v1 routes every layout decision through registry-driven indirection (region sources, application sources, layout-engine sources) the MVP does not have. The MVP application components (`PostsApp`, `MediaApp`, `ProfileApp`, `SimpleEditorApp`, `SettingsGeneralApp`) survive as adapted source registrations; the MVP shell scaffolding (`Shell.js`, `ShellLayout.js`, `ShellNavigation.js`, `ShellToolbar.js`, `ShellContent.js`) is retired when the new kernel reaches feature parity. The MVP branch (`feat/wp-admin-shell-mvp`) stays as the validated proof-of-concept reference.

## Pre-flight decisions (resolved 2026-04-30)

These were the gating questions identified before mapping v1; all are now resolved in the master spec.

| # | Decision | Outcome |
|---|---|---|
| 1 | Selection scope lifetime | Per-mount default; opt-in `persist: true` on the publishing region. (§13 Resolved) |
| 2 | `$wpds` placement | Top-level field on `admin.json`, alongside `version`. (§13 Resolved) |
| 3 | `color.palette[]` in admin.json | Dropped. Palette is a `theme.json` concern. (§13 Resolved) |
| 4 | Kernel approach | Rebuild from scratch in `src/runtime/` next to the MVP code; retire MVP scaffolding at parity. |

## v1 in one diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  M1  Kernel  ── source registry, regions+apps+engine, routing    │
│      │                                                           │
│      ▼                                                           │
│  M2  Cascade ── 5 origins, restrict-only merge, role/user shell  │
│      │                                                           │
│      ▼                                                           │
│  M3  Tokens  ── WPDS slots, chrome ext, compat bridge, density   │
│      │                                                           │
│      ▼                                                           │
│  M4  Apps    ── core:site-editor, core:settings, core:users,     │
│                 core:comments, slots, notice consolidation       │
│      │                                                           │
│      ▼                                                           │
│  M5  Ship    ── 4-layer caps, prefs UI, shell-switch plumbing,   │
│                 WP-CLI, JSON Schema, docs                        │
└──────────────────────────────────────────────────────────────────┘
```

Each milestone is sequential — the work in M2 cannot begin without M1's source registry; M3 depends on M2's resolver; M4 depends on M3's tokens for theming. M5 polishes and surfaces what M1–M4 produce. Within a milestone, tasks may parallelize where noted.

---

## M1 — Kernel rebuild

**Goal.** Replace the MVP's hardcoded shell scaffolding with a registry-driven kernel that arranges regions and apps via a swappable layout engine. At the end of M1 the shell renders all four bundled configs (`content-author`, `client-portal`, `developer-admin`, `wp-admin-default`) the MVP ships, but every visual decision flows through the new indirection layer.

**Why first.** Every other v1 milestone depends on having region sources, application sources, and a layout-engine source to register against. The cascade resolver (M2) needs a config schema that talks about regions and apps; the token system (M3) needs an engine that consumes WPDS variables; the new core apps (M4) need a place to mount; the prefs UI (M5) needs slots and shell switching to plug into.

**Source layout.**

```
src/runtime/                        ← new kernel (replaces src/shell/*)
├── kernel.js                       ← top-level mount, owns the registry instance
├── registry/
│   ├── createRegistry.js           ← register/lookup for kind: app | region | engine
│   ├── builtins.js                 ← imperatively registers all core:* sources
│   └── source-types.js             ← TypeScript-style JSDoc types for SourceProps
├── engines/
│   └── core-site-editor-layout/    ← v1's only engine
│       ├── index.js                ← EngineSource definition
│       ├── Layout.js               ← React component arranging regions
│       └── style.css               ← engine-specific CSS (consumes WPDS vars)
├── regions/
│   ├── sidebar-region/             ← core:sidebar-region
│   ├── toolbar-region/             ← core:toolbar-region
│   ├── content-region/             ← core:content-region (router: true)
│   ├── preview-region/             ← core:preview-region (selection-scope subscriber)
│   ├── overlay-region/             ← core:overlay-region (command palette)
│   └── drawer-region/              ← core:drawer-region (kind: drawer)
├── routing/
│   ├── router.js                   ← hash router → routable region resolver
│   └── useRoute.js                 ← hook: { appId, segments, params }
├── selection/
│   ├── store.js                    ← core/admin-shell/selection Redux store
│   ├── useSelection.js             ← subscriber hook
│   └── persist.js                  ← reads/writes wp_admin_shell_user_prefs.selection[]
└── slots/
    ├── createSlotRegistry.js       ← named slot table
    └── Slot.js / Fill.js           ← thin wrappers over @wordpress/components
```

**Tasks (ordered).**

1. **Source-type contract.** Codify `Source`, `AppSourceProps`, `RegionSourceProps`, `EngineSourceProps` from spec §5 as JSDoc types. No runtime — pure shape.
2. **Source registry.** `createRegistry()` returning `{ register, get, list }`. Reject duplicate ids. Distinguish kind on lookup.
3. **`core:site-editor-layout` engine.** Port the MVP's `ShellLayout.js` arrangement (dark chrome, elevated cards, sidebar-left/toolbar-top/content-center/preview-right) into an `EngineSource` whose `Component` receives a `regions: Record<id, RegionInstance>` map and renders them. Honors `persistent`, `overlay`, `drawer` kinds. Collapses `floating` and `tiled` to `persistent` (they don't ship in v1).
4. **Region sources.** Implement `core:sidebar-region`, `core:toolbar-region`, `core:content-region`, `core:preview-region`, `core:overlay-region`, `core:drawer-region`. Each is a thin wrapper that mounts the apps listed in `contains[]`. `content-region` honors `config.router: true`. `drawer-region` slides from a configurable side (`left`/`right`), persists until dismissed, and honors `config.dismissOn` for explicit close triggers.
5. **Hash router.** `useRoute()` hook + `navigate(hash)`. The router resolves the hash to a routable app id and pushes that app into the active routable region's child list. Sub-routes pass through as `segments`. Multi-routable regions are explicitly out of scope for v1 (single routable region only — see master spec §6.2 on the v2 multi-routable item).
6. **Selection bus.** `core/admin-shell/selection` Redux store with `setSelection(scope, payload)` action and `getSelection(scope)` selector. `useSelection(scope)` hook. Ephemeral scopes (default) stay in-memory only.
   - **Persisted scopes — M1 storage path.** The cascade (M2) is what *reads* `wp_admin_shell_user_prefs` and merges it into the runtime config. Persistence does *not* depend on the cascade. M1 ships a small dedicated REST endpoint `POST/GET /wp-admin-shell/v1/selection/{scope}` that reads/writes the user-meta key `wp_admin_shell_user_prefs[selection][<scope>]` directly. The selection bus calls that endpoint via `apiFetch` for `persist: true` scopes; on shell mount, it bulk-fetches all persisted scopes for the current user and seeds the store before any region renders.
   - **M2 handoff.** When the cascade lands in M2, the user-origin loader picks up the same `wp_admin_shell_user_prefs[selection]` sub-tree as part of the broader user origin. The M1 endpoint stays — it's the authoritative read/write path because it bypasses the cascade's resolution overhead for the high-frequency selection traffic. The cascade reads selection state for diagnostics and prefs UI; the runtime hits the endpoint directly.
7. **Slot registry.** `core:toolbar.left`, `core:toolbar.right`, `core:navigation.footer`, `core:posts.row-actions`, `core:editor.sidebar`, `core:app.before`, `core:app.after`. Wrap `@wordpress/components` `<Slot>`/`<Fill>` so source ids namespace cleanly.
8. **App-source registrations.** Wrap the MVP's `PostsApp`, `SimpleEditorApp`, `MediaApp`, `ProfileApp`, `SettingsGeneralApp`, `EditorApp`, and `IframeApp` as `AppSource` definitions in `registry/builtins.js`. The component code does not change; only the registration shim is new. Registered ids: `core:posts`, `core:simple-editor`, `core:media`, `core:profile`, `core:settings-general`, `core:editor`, `core:iframe-fallback`. **`core:editor` is the post-block-editor iframe (`@wordpress/editor`'s `post.php?post={id}&action=edit`); it stays iframed in v1.** Native post-editor mount is post-v1. The separate `core:site-editor` (template/global-styles canvas, `@wordpress/edit-site`) is a different package and is the v1 native target — it lands in M4 and does not affect `core:editor`. Stub registrations for `core:notices-banner` / `core:notices-snackbar` ship as empty no-op apps in M1 (mount points exist so shells can pin them); the actual notice rendering implementation lands in M4.
9. **Mount path.** New `src/index.js` calls `kernel(window.wpAdminShell.config)` instead of mounting `<Shell>` directly. The kernel reads `settings.shell.layoutEngine`, looks it up, looks up every region, looks up every app, and hands the engine the resolved tree.
10. **MVP-config compatibility shim.** A pure function `normalizeV0(config)` reads the MVP's flat shape and emits v1's partitioned `settings`/`styles` form so all four bundled configs work unchanged on the new kernel. `wp-admin-default.json` is the heaviest v0 example (24 iframe apps, two-level nav drilldowns); use it as the normalizer's primary fixture. (Full cascade resolver lands in M2 — this shim is the minimum to unblock M1 testing.)
11. **Retire MVP scaffolding.** Delete `src/shell/*` once all four bundled configs render through the new kernel with feature parity. The MVP app components stay; the shell wrapper, navigation, toolbar, content router, and command-palette scaffolding are replaced by the registry-driven equivalents.

**Exit criteria.**

- All four bundled shells (`content-author`, `client-portal`, `developer-admin`, `wp-admin-default`) render through the new kernel.
- Navigation, routing, command palette (Cmd+K), and active-shell selection (option write + reload — no in-session shell-switcher UI yet, that lands in M5 plumbing) work.
- Six built-in region sources registered (sidebar, toolbar, content, preview, overlay, drawer) and exercised by at least one bundled shell.
- Visual parity with the MVP — same layout, same apps, same actions.
- `src/shell/*` is deleted; only `src/runtime/*` and `src/apps/*` remain.
- No regressions in the manual test plan (CLAUDE.md "Testing" section).

**Risk + mitigation.**

- **Risk.** Command palette is tightly coupled to the MVP `ShellToolbar`. Pulling it into the registry model risks losing parity.
  **Mitigation.** Build it as `core:command-palette` (overlay-region + `core:command-picker` app) early in M1 so it exercises the registry as the kernel matures, not as an afterthought.
- **Risk.** The MVP `ShellToolbar` ships a shell-switcher dropdown. Spec §6.4.1 explicitly removes that surface in v1 (UI switcher is v2). Easy to carry forward by reflex.
  **Mitigation.** During M1, delete the dropdown when `ShellToolbar` retires. Do not register a `core:shell-switcher` app. The kernel still supports active-shell selection via option write + reload (driven by the Settings page or WP-CLI), satisfying §6.4.1's "architecture must remain switchable from day one" without a runtime UI surface.
- **Risk.** The MVP's `iframe:` source pattern (`iframe:plugins.php` etc.) is matched by string prefix, not registry lookup. Easy to break during the rebuild.
  **Mitigation.** Implement `iframe:{url}` as a registry resolver — when no exact-match source exists, the kernel checks the `iframe:` prefix and falls back to a built-in `core:iframe-fallback` app. Same behavior, one place.

---

## M2 — Cascade resolver and origins

**Goal.** Replace the single-file shell loader with a 5-origin cascade matching `theme.json`'s resolver pattern. Restrict-only merge semantics (§4.4.1), `userCustomizable` affordance declarations (§4.4.2), and per-role/per-user shell selection (§4.4.4) all land here.

**Why next.** The kernel can mount anything from any config; M2 makes the config the right shape and merges multiple sources into it. After M2 the runtime no longer reads a single JSON file; it reads a merged result computed from five layered origins.

**PHP architecture (mirrors `WP_Theme_JSON_Resolver`).**

```
includes/
├── class-wp-admin-shell-resolver.php       ← merge orchestration, caching
├── class-wp-admin-shell-config.php         ← single normalized config object
├── origins/
│   ├── core.php                            ← bundled defaults (admin.json baseline)
│   ├── plugin.php                          ← active shell (from plugin/theme files)
│   ├── site.php                            ← wp_admin_shell_site_config option
│   ├── role.php                            ← wp_admin_shell_role_config option
│   └── user.php                            ← wp_admin_shell_user_prefs user-meta
├── filters.php                             ← wp_admin_shell_data_{origin} + final
└── cache.php                               ← WP_Object_Cache + transient layer
```

**Tasks (ordered).**

1. **Config object.** A normalized `WP_Admin_Shell_Config` PHP class wrapping the merged JSON, with field-aware accessors (`->get_application( $id )`, `->get_region( $id )`, `->get_active_engine()`).
2. **Origin loaders.** One PHP class per origin returning a normalized config slice. Core ships an empty baseline so missing files are not fatal.
3. **Merge engine.** Field-aware merge per spec §4.4: scalars replace, objects deep-merge, keyed arrays merge by `id`/`slug`/`name`, plain arrays replace.
4. **Restrict-only enforcement.** Higher origins cannot re-add anything a lower origin removed. Implementation: tag each entry with its origin during merge; rejection happens before the result is exposed to the runtime.
5. **`userCustomizable` declarations.** Parse `userCustomizable: true | false | string[]` per entry; restrict downstream-origin writes to the declared paths. Same model as block supports.
6. **Filters.** `wp_admin_shell_data_{core|plugin|site|role|user}` per-origin and `wp_admin_shell_data` final. Run after each origin loads, before merge.
7. **Caching.** Two layers — request-scope `WP_Object_Cache` group `wp_admin_shell` and cross-request transient `wp_admin_shell_resolved_<hash>`. Cache key is the hash of all origin contents (file mtimes for disk, option versions for DB). Invalidates on shell-switch, user-change, role-change, or any origin write.
8. **Source `configSchema` validation.** When a source declares `configSchema` (JSON Schema), cache the validation result by `(sourceId, configHash)` so re-validation is amortized across requests.
9. **Per-role and per-user shell selection.** Three-layer resolver per §4.4.4: site default → role override → user override. The user layer is gated by `userSwitchable: true` on the active shell. Stored in `wp_admin_shell_active_shell` (option), `wp_admin_shell_role_config[<role>].shell` (option), `wp_admin_shell_user_prefs.shell` (user-meta).
   - **Option rename migration.** The MVP stores the active shell name in `wp_admin_shell_active_config`. v1's spec name is `wp_admin_shell_active_shell`. Migration path: on plugin upgrade, copy the old option's value into the new key, leave the old key in place for one minor cycle, and delete in v2. Reads check the new key first, fall back to the old. The site-options/role-options/user-meta keys for the cascade origins (`wp_admin_shell_site_config`, `wp_admin_shell_role_config`, `wp_admin_shell_user_prefs`) are new in v1 — no MVP collision.
10. **JS bridge.** The merged config is delivered to JS via `wp_add_inline_script` + `wp_json_encode` exactly as in the MVP (preserves type fidelity). The JS kernel from M1 reads `window.wpAdminShell.config` unchanged; the difference is what's on the other side of that variable.
11. **MVP normalizer retirement.** The M1 `normalizeV0()` shim moves into the `core` origin loader as the v0 → v1 normalization step. The runtime is no longer aware of the flat MVP shape; the resolver hands it the partitioned form regardless of source.

**Exit criteria.**

- Five origins loadable and mergeable with documented field-aware semantics.
- Restrict-only verified via test case: a plugin shell that omits `core:plugins` cannot have it re-added by a role or user origin.
- `userCustomizable` declarations narrow downstream writes to declared paths.
- Cache invalidation triggers documented and verified.
- v0 (MVP flat) configs continue to work, normalized through the `core` origin path.

**Risk + mitigation.**

- **Risk.** Restrict-only is subtle and easy to get wrong (especially for keyed-array merges where "replace" and "remove" look similar).
  **Mitigation.** Write merge unit tests against fixture configs *before* implementing the merge engine. Fixtures cover plugin-removes-app + user-tries-to-re-add, plugin-disables-feature + role-tries-to-re-enable, etc.

---

## M3 — Token system end-to-end

**Goal.** Resolve `admin.json.styles` into the three CSS-variable families per spec §4.3.2: WPDS surface, chrome extensions, and the static compat bridge. Density attribute writer. CI parity test against pinned WordPress's WPDS output.

**Why third.** The kernel renders; the cascade gives us a single merged config; M3 is what makes that config visually meaningful. Once tokens emit, the new core apps (M4) and the prefs UI (M5) can theme correctly without being styled in vacuum.

**Source layout.**

```
src/runtime/styles/
├── compileStyles.js                        ← styles tree → CSS variable bag
├── emitTokens.js                           ← bag → <style id="wp-admin-shell-tokens">
├── compatBridge.js                         ← static legacy-name aliases + numeric derivation
├── density.js                              ← styles.density → data-wpds-density attr
└── wpds-defaults/
    ├── 6.9.json                            ← snapshot of dist/theme/style.css for WP 6.9
    └── README.md                           ← regen instructions
tests/parity/
└── wpds-snapshot.test.js                   ← fails if dist/theme/style.css drifts
```

**Tasks (ordered).**

1. **WPDS slot tree parser.** A pure function that walks `styles` and emits a flat map keyed by `--wpds-{path-with-dashes}`. Path uses spec §4.3 syntax verbatim — no translation table.
2. **Default baseline ship.** Snapshot WP 6.9's `wp-includes/css/dist/theme/style.css` into `wpds-defaults/6.9.json`. The resolver loads this as the implicit `core` origin baseline keyed off the top-level `$wpds` field.
3. **Chrome extension namespace emission.** Slots under `styles.chrome.*` emit `--wp-admin-shell--chrome--{category}--{slug}` per the spec §4.3.1 table.
4. **Compat bridge.** A static post-pass appends fixed aliases for `--wp-admin-theme-color`, `--wp-admin-theme-color-darker-10`, `--wp-admin-theme-color-darker-20`, `--wp-admin-theme-color--rgb`, `--wp-admin-border-width-focus`, `--wp-components-color-accent`, `--wp-components-color-background`, `--wp-components-color-foreground`. The bridge cannot be removed by author files. Numeric derivations: RGB triplet from the resolved hex (a small 3-line helper); `darker-20` from HSL lightness adjust (existing utility patterns suffice — no chroma dependency).
5. **Density attribute writer.** `styles.density` writes `data-wpds-density="{value}"` on `#wp-admin-shell`. WPDS already ships density-keyed gap/padding overrides under that selector — no shell-side density CSS.
6. **DTCG alias resolver — literal-only mode for v1.** v1 inlines literal CSS values in `admin.json.styles` (per spec §4.0.5 "v1 inlines literal values; tokens.json lands in v2"). The resolver still recognizes `"{path}"` strings — but in v1 they only resolve *within admin.json* via the `{styles.path}` form (§4.3 within-document references), not against an external tokens.json. v2 lifts that restriction.
7. **Per-region and per-app overrides.** `styles.regions[id].*` and `styles.applications[id].*` emit scoped CSS under `[data-region-id="..."]` and `[data-app-id="..."]` selectors. Required for the spec §4.3 region/application override examples.
8. **CI parity test.** A test that loads `wpds-defaults/{$wpds}.json`, parses the live `wp-includes/css/dist/theme/style.css` from the pinned WordPress, and diffs the slot lists. Added/renamed/removed slots fail the build. The test triggers on each WordPress release we want to support.
9. **Inline-style budget.** Audit the MVP `index.css` for hex values, raw px, and hardcoded durations. Replace with WPDS variable references. Engines and apps must consume tokens, not invent them.
10. **Documentation.** Spec §4.3.1, §4.3.2, §4.3.3 are the authority. M3's deliverable doc is a one-pager `docs/v1-token-emission.md` showing the exact CSS that lands in `<style id="wp-admin-shell-tokens">` for each bundled shell, as a reference for app authors.

**Exit criteria.**

- All four bundled shells theme correctly via emitted variables only — no inline hex, raw px, or hardcoded durations remain in the runtime.
- Compat bridge verified: an unmodified `@wordpress/components` `<Button variant="primary">` and a wp-admin button inside an iframe both pick up the shell's brand color.
- CI parity test passes against the pinned WPDS version.
- Density toggle (`default`/`compact`/`comfortable`) changes spacing without per-shell density CSS.

**Risk + mitigation.**

- **Risk.** WPDS slot churn between WordPress versions silently breaks the bridge.
  **Mitigation.** Pin via top-level `$wpds`; CI parity test fails the build on drift. The known-pending decision (master spec §13 #8 — one-version compat shim policy) is queued for the first inter-version bump after v1 ships, not v1 itself.

---

## M4 — Core app expansion

**Goal.** Land the v1 native apps the spec §11 list calls out: `core:site-editor`, `core:settings`, `core:users`, `core:comments`. Add the slot system inside apps. Consolidate notices through `@wordpress/notices`.

**What v1 does NOT touch.** The post block editor (`core:editor`, `@wordpress/editor`, `post.php?post={id}&action=edit`) stays iframed. Native post-editor mount is post-v1. `core:simple-editor` already covers the Substack-style writing case natively (MVP). `core:plugins` stays iframed (v2 native per §11). Plugin admin pages stay iframed permanently (§5.3).

**Why fourth.** The kernel can mount apps; the cascade lets shells declare them; the token system makes them theme correctly. Now we add the apps that close the gap between MVP coverage (writer-flow + iframes) and v1 coverage (the four spec-mandated native targets).

**Disambiguating `core:editor` vs `core:site-editor`.** These are distinct WordPress packages and distinct apps:

| App id | Package | Surface | v1 status |
|---|---|---|---|
| `core:editor` | `@wordpress/editor` | Post block editor (edit a post/page) | Stays iframed in v1 |
| `core:simple-editor` | composed from `@wordpress/block-editor` | Substack-style writing flow | Native, shipped in MVP |
| `core:site-editor` | `@wordpress/edit-site` | Templates, template parts, navigation, global styles | **Native, M4 target** |

The plan and the spec §11 v1 list both refer only to `core:site-editor` for v1 native work. Nothing in M4 changes `core:editor`'s iframed status.

**Tasks (ordered, parallelizable within app boundaries).**

1. **`core:site-editor` native mount.** Replace the MVP's `iframe:site-editor.php` escape hatch with a native React mount of the site editor's primary canvas. Approach: import `@wordpress/edit-site` and render its primary view inside a `core:content-region`; route its sub-surfaces (`/templates`, `/template-parts`, `/navigation`, `/styles`) as drill-down `screen` nav items per §4.2 navigation modes. Largest single app in v1.
2. **`core:settings` composable settings app — REST-bounded scope.** A WPDS rebuild of the wp-admin settings group, but split by REST coverage. Per [`admin-json-api-validation.md`](./admin-json-api-validation.md) §`core:settings`, only a subset of wp-admin settings are exposed via `GET/PUT /wp/v2/settings`. The plan honors that boundary instead of pretending otherwise.

   **Native panels in v1 (REST-covered fields).** Each is a registered panel that reads/writes via `useEntityRecord('root', 'site')` (matching the MVP `SettingsGeneralApp` pattern):
   - `general` — site title, tagline, URL, admin email, timezone, date/time formats, language, start of week. (Full coverage; MVP `SettingsGeneralApp` already exists.)
   - `writing` — default category, default post format. (Partial — post-via-email + remote-publishing fields not REST-exposed; out of scope.)
   - `reading` — front-page configuration (front_page, page_on_front, page_for_posts, show_on_front), posts-per-page, posts-per-rss, rss_use_excerpt, default_comment_status, default_ping_status. (Partial — `blog_public` / search-engine visibility is *not* REST-exposed.)
   - `discussion` — default_comment_status, default_ping_status. (Partial — most fine-grained discussion fields not REST-exposed; offer minimal panel only.)

   **Iframed in v1 (no REST coverage; native rebuild deferred or requires custom endpoints).**
   - `permalinks` — `iframe:options-permalink.php`. Permalink structure is not in `/wp/v2/settings`.
   - `media` (full) — `iframe:options-media.php`. Image-size + uploads-organized-by-month fields not REST-exposed.
   - `privacy` — `iframe:options-privacy.php`. Privacy page not REST-exposed.
   - `reading` blog-public toggle and `discussion` fine-grained fields fall back to the iframed panel they live on if a shell needs them.

   **Custom-endpoint scope (out of v1, tracked).** A real `core:settings` rebuild of permalinks + media requires a custom REST endpoint (`POST /wp-admin-shell/v1/settings/permalinks` driving `$wp_rewrite->set_permalink_structure()`, etc.). Track as a v2 item, not v1. Reason: each custom endpoint is a small but real surface to design, secure, and document; bundling four of them with the rest of M4 inflates scope past the v1 calendar.

   **Slot.** Each subsection is a registered "settings panel" (whether native or iframed); plugins can register additional panels via the `core:settings.panels` slot. The slot is the same regardless of whether a panel is native or iframed — this keeps the extension surface stable when iframed panels graduate to native.
3. **`core:users` DataViews app.** Pattern: same as `PostsApp`, swap the entity (`useEntityRecords('root', 'user')`). Bulk actions (delete, change role). Inline edit per-row via the user row-actions slot.
4. **`core:comments` DataViews app.** Same pattern. Moderation actions (approve/unapprove/spam/trash). Comment thread expansion via row-detail mode.
5. **App-level slot exposure.** Each app exposes the slots from spec §6.5: `core:posts.row-actions` (DataViews actions), `core:editor.sidebar` (editor panels — applies to `core:editor` *and* `core:simple-editor` consumers), `core:app.before` / `.after` (banners). Slots use `@wordpress/components` `<Slot>`/`<Fill>` from M1.
6. **Notice consolidation.** Replace the M1 stub registrations of `core:notices-banner` and `core:notices-snackbar` with real implementations backed by `@wordpress/notices` (`core/notices` store). Pin both apps into known regions on every bundled shell by default. Plugins use `@wordpress/notices` rather than reaching into the shell. The MVP currently surfaces notices ad-hoc per app; M4 unifies them.
7. **Application source `configSchema` declarations.** Each new app ships a JSON Schema for its config. The M2 cache-by-`configHash` machinery picks this up automatically.

**Exit criteria.**

- `developer-admin` shell renders the four v1-native targets (`core:site-editor`, `core:settings`, `core:users`, `core:comments`) plus everything already native (`core:posts`, `core:simple-editor`, `core:media`, `core:profile`, `core:settings-general`).
- Iframes still in v1: `core:editor` (post editor), `core:plugins`, plugin admin pages, theme/plugin installer, network admin. All other intentional iframes documented.
- Slot system lets a third-party plugin contribute a row-action to `core:posts` and a sidebar panel to `core:simple-editor` without touching shell code.
- All notices flow through `@wordpress/notices`; no app calls a custom toast/banner API.

**Risk + mitigation.**

- **Risk: `@wordpress/edit-site` package boundary.** The package is built to be the entire admin page — it owns its own commands store, its own `core/edit-site` preferences store, its own keyboard-shortcut layer, and a full-screen UI mode that fights any embedding container. Rendering it inside a region is feasible (Gutenberg's own admin page does this) but requires resolving: (a) preferences-store namespace collisions with the shell's `core:appearance` UI; (b) command-palette double-registration if both `core:command-picker` and edit-site's command system are active; (c) full-screen-mode CSS that targets `body` rather than the mount root; (d) router conflicts between the shell's hash router and edit-site's internal navigation.
  **Mitigation.** Spike the embedding before committing to the M4 timeline. If any of the four collisions is intractable, fall back to `iframe:site-editor.php` for v1 and slot the native mount into v2 — this is a defined cut-point, not a failure. Track the spike outcome in the M4 milestone issue before starting tasks 2–4.
- **Risk: site-editor native scope creeps.** Even if embedding works, the surface is large.
  **Mitigation.** Define an explicit "minimum viable native site editor" scope — templates list + edit, global styles read-only, navigation list + edit. Anything beyond that ships post-v1 or stays iframed. Track the cut line in the M4 milestone issue.

---

## M5 — Permissions, prefs, ship

**Goal.** Land the four-layer capability model, the user-prefs UI, the WP-CLI surface, and the public schema. Polish, document, ship.

**Tasks (ordered, parallelizable).**

1. **Region-visibility fast-path.** A region with a `capability` field is hidden entirely; its `contains[]` is not evaluated. One cap check skips a whole subtree. (§8 layer 1.)
2. **Application-visibility gate.** Apps with a `capability` are hidden from rendering and from direct routing. A `#/users` URL with no `list_users` cap renders a 403 view from the kernel. (§8 layer 2.)
3. **Source-declared capability floor.** A source's `capabilities[]` array is the floor — even if a shell config omits `capability`, the source's required caps still apply. Enforced at registry lookup time. (§8 layer 3.)
4. **REST API enforcement is observed, not implemented.** The shell's UI checks are advisory; `core-data`'s 403 responses surface as inline errors in the consuming app. (§8 layer 4.)
5. **Recursive nav drilldown removal.** A `screen` nav drilldown whose `items[]` are all gated out disappears entirely. Recursive — a screen-of-screens with no permitted leaves is also hidden. Logic lives in `core:navigation`, not the kernel. (§8.)
6. **Custom-cap REST endpoint.** `/wp-admin-shell/v1/can/{capability}` for non-entity capability gating. Cached per-request via `WP_Object_Cache`.
7. **`core:appearance` user-prefs UI.** A standalone app that reads the active shell's `userCustomizable` declarations and renders only the controls that shell allows. Writes the user origin (`wp_admin_shell_user_prefs`). MVP UX: density toggle, accent override, default-route override; whatever else the shell exposes via `userCustomizable`.
8. **Shell-switching plumbing live, no UI surface.** The kernel must be capable of switching shells mid-session per §6.4.1; v1 implements the plumbing (cache invalidation, runtime re-mount, route preservation across switch) without the user-facing toggle. v2 adds the switcher to the prefs UI.
9. **WP-CLI commands.**
   - `wp admin-shell list` — show registered shells and their origins.
   - `wp admin-shell activate <name>` — write `wp_admin_shell_active_shell` site option.
   - `wp admin-shell register <name> <path>` — register a programmatic shell from a JSON file.
   - `wp admin-shell upgrade-config <name>` — normalize a v0 (MVP flat) shell to v1 form on disk.
10. **JSON Schema.** Author and publish `admin/v1.json` describing the full v1 config surface. Hosted at `schemas.wp.org/admin/v1.json` once arranged with WordPress core; in the meantime ships at `docs/schemas/admin-v1.json` and is referenced via `$schema`.
11. **Documentation pass.** Update `CLAUDE.md` to describe the v1 architecture (regions+apps+engine, cascade, tokens, slots) instead of the MVP scaffolding. Move `wp-admin-shell-mvp-spec.md` to `docs/archive/` (or equivalent). The master design spec is unchanged — it's already authoritative for v1 onward.
12. **Production readiness pass.**
    - **Bundle-size budget.** Measure the production build at the end of M4 and set the v1 ship target at that number plus 10% headroom. The MVP's ~16KB baseline does not survive `core:site-editor` + DataViews × 3 (`users`, `comments`, posts) + settings + the cascade resolver client. A realistic order of magnitude is 300–500KB gzipped JS; treat that as the working ceiling and adjust based on the M4 measurement. Source-level code splitting (loading plugin sources on demand) is a v3 item per spec §11 — v1 ships single-bundle.
    - **Performance smoke test.** Cold mount under 500ms on a baseline laptop (M1/M2 MacBook, throttled to "Fast 4G" + 4× CPU slowdown). Methodology: clear cache, navigate to `/wp-admin/admin.php?page=wp-admin-shell`, measure from `navigationStart` to first paint of the routable region's first app. Recorded in `docs/v1-perf-baseline.md`.
    - **a11y smoke test.** Concrete checklist (not a substitute for the v3 full audit): (a) command palette is reachable via Cmd+K and traps focus until dismissed; (b) overlay regions have `role="dialog"` + `aria-modal="true"` + a labelled `aria-labelledby`; (c) sidebar navigation is wrapped in `<nav>` with an `aria-label`; (d) drill-down screens move focus to the heading on entry and restore focus to the originating item on back; (e) the focus ring is visible on every interactive element in every shell variant via the `--wpds-color-stroke-focus-brand` token; (f) no `tabindex` values above 0; (g) every icon-only button has an `aria-label` or visible text via `<VisuallyHidden>`; (h) a single keyboard pass through `developer-admin` reaches every primary action. Tooling: `axe` against the rendered shell DOM, plus one manual VoiceOver run on macOS.

**Exit criteria.**

- Four-layer cap gating verified end-to-end against role fixtures (`subscriber`, `contributor`, `author`, `editor`, `administrator`).
- `core:appearance` exists and respects `userCustomizable`.
- WP-CLI surface complete and documented.
- JSON Schema referenced in all bundled shells via `$schema`.
- v1 release notes drafted; MVP documentation archived.

---

## Cross-cutting concerns

These threads run through every milestone and need explicit attention rather than dedicated tasks.

**Test strategy.** Unit tests for pure functions (cascade merge, token compilation, capability evaluation) land alongside their implementation. Integration tests against a live `wp-env` instance are added per milestone — M1 verifies the kernel renders all four bundled shells, M2 verifies cascade merge against fixture configs, M3 verifies WPDS parity, M4 verifies new apps render and respect `core-data`, M5 verifies cap gating. We do not block on a single end-to-end harness; per-milestone integration coverage is sufficient for v1 with a fuller harness deferred to v2.

**Backwards compatibility.** v0 (MVP flat) configs are accepted indefinitely (per spec §10). The v0 → v1 normalizer lives in the `core` origin loader after M2; M1's transient `normalizeV0()` shim retires there.

**Gutenberg dependency declaration.** Production distribution requires `Requires Plugins: gutenberg` per CLAUDE.md (the `@wordpress/ui` private-API dependency). Add the header during M5; verify activation fails gracefully when Gutenberg is missing.

**Branch strategy.** v1 work happens on `feat/wp-admin-shell-v1` (new branch, off `feat/wp-admin-shell-mvp`). Each milestone is one or more PRs into that branch. The MVP branch stays untouched as the proof-of-concept reference.

**MVP code disposition.**

| Code | Disposition |
|---|---|
| `src/shell/*` | Deleted at the end of M1. |
| `src/apps/*` | Survives. Adapted as `AppSource` registrations in `src/runtime/registry/builtins.js`. |
| `src/routing/*` | Replaced by `src/runtime/routing/*`. The MVP's `useCurrentApp` hook is superseded by `useRoute()`. |
| `src/commands/*` | Migrates into `core:command-picker` app. |
| `src/config/*` | Replaced by `WP_Admin_Shell_Resolver` (PHP) + `src/runtime/registry/*` (JS). |
| `wp-admin-shell.php` | Bulk of file survives. The config-loading path is rewritten to use the resolver in M2. |
| `shells/*.json` | All four bundled configs survive (`content-author`, `client-portal`, `developer-admin`, `wp-admin-default`). They are migrated to v1 partitioned form during M5 documentation pass; v0 form remains valid via the normalizer. |

---

## Out of scope for v1

These are explicit non-goals for v1, deferred to v2 or v3 per the master spec roadmap (§11). Listing prevents scope-creep arguments.

- `tokens.json` primitives layer (v2; spec §4.0.5).
- `plugin:{slug}` source registry (v2).
- Layout engines beyond `core:site-editor-layout` (v2 tiling, v3 floating).
- `core:dashboard` (v2).
- `core:plugins` native (v2; iframe escape hatch covers v1).
- Multi-routable regions (v2).
- Shell-switcher UI surface (v2).
- Drop-in replacement of `/wp-admin/*` URL interception (v3).
- Mobile layout adaptation (v3).
- i18n for shell-config strings (v3).

---

## Open at v1 entry

Items still flagged in spec §13 that v1 does not require resolved but should track as it progresses:

- §13 #2 — `tokens.json` precedence under multiple sources (v2 concern).
- §13 #3 — DTCG type-coercion table (v2 concern).
- §13 #4 — Token-file extension and discovery (v2 concern).
- §13 #5 — Source script lifecycle / memory pressure. Surfaces in M1 and M4; final eviction threshold needs measurement against a real shell with many plugin sources, which arrives in v2. v1 default: warm-by-default, no eviction yet.
- §13 #6 — Resolver cache invalidation on tokens-file change (v2 concern).
- §13 #7 — DTCG `$extensions` for WordPress-specific metadata (v2 concern).
- §13 #8 — WPDS slot drift compat shim policy (v2 inter-version concern).
- §13 #11 — `theme.json` v3 dependency. Documented constraint in M3; full migration path is v2 alongside the tokens.json work.
- §13 #12 — Chrome surface upstreaming. Track as WPDS upstream evolves; v1 ships with chrome extensions, v2 migrates if WPDS adds analogous tokens.

---

## References

- [`wp-admin-shell-design-spec.md`](./wp-admin-shell-design-spec.md) — master design spec (authoritative for what v1 must produce).
- [`wp-admin-shell-mvp-spec.md`](./wp-admin-shell-mvp-spec.md) — MVP design (what v1 starts from).
- [`admin-json-schema.md`](./admin-json-schema.md) — v0/flat schema reference (consumed by the v0 → v1 normalizer).
- [`admin-json-api-validation.md`](./admin-json-api-validation.md) — REST coverage matrix per source (informs M4 app scoping).
- [`wp-admin-screen-inventory.md`](./wp-admin-screen-inventory.md) — full surface map of `wp-admin` for porting prioritization.
- [`feedback.md`](./feedback.md) — running triage log; v1 work items get promoted from Inbox here.
