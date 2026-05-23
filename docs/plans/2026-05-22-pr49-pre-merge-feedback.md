# PR #49 pre-merge feedback — implementation plan

**Status:** ready for implementation
**Date:** 2026-05-22
**Branch base:** `feat/wp-admin-shell-v3`
**Implementation branches:** five sequenced PRs cut off `feat/wp-admin-shell-v3`; merge back into the same branch before tagging v3.0.0-beta.1.
**Estimate:** ~6 days serial; PRs 2 / 3 / 5 parallelizable after PR 1 lands. PR 4 worktreed independently.
**Owner:** TBA (PR 1 single-agent end-to-end recommended for security coherence; remainder splittable).
**Sequencing:** security → shipped-broken UX → perf → kernel cleanup → hygiene. See [Stage plan](#stage-plan) for the canonical order.

## Why this exists

Multi-pass code review on PR #49 (`Reshape admin.json schema around user-task surfaces (v3)`) surfaced 13 outstanding items spanning four classes: security cascade gaps, shipped-broken UX in the default install, JS runtime perf regressions, and kernel DS-neutrality leaks. Verification pass against `feat/wp-admin-shell-v3` HEAD (`b18d529`) confirmed each item is still present in the tree — Phase 3b–3d work fixed roughly half of the original review-1 surface but didn't touch the security trio, the URL-safety bypass, the LRU gap, or the kernel DS-neutrality regressions introduced by Phase 3b.

The branch can't merge into `main` until at minimum the four security blockers (trust-tier enforcement, null-tombstone gating, `customizable` enforcement, `is_safe_href` protocol-relative bypass) plus the shipped-broken `user-switchable` key mismatch are resolved. The remaining items are graded major / minor by their blast radius; we land them in the same beta window to avoid carrying technical debt past the v3.0 cut.

## What this plan does

Five tightly scoped PRs land all 13 outstanding items.

1. **Security cascade hardening** — wire trust-tier enforcement, gate null-tombstones behind `$authoritative`, restore per-field `customizable` enforcement (v2 semantics) on v3 top-level blocks, reject protocol-relative URLs in `is_safe_href`, gate `/data-view` REST per requested screen's permission floor.
2. **`user-switchable` key fix** — code reads kebab (matches schema + shells); resolver typo currently leaves user-switching always-false in v3 default install.
3. **JS runtime perf** — `useDataView` LRU cap at 64 entries; `BindingsConsumer` `useMemo` over commands array so document keydown handler doesn't rebind every render.
4. **Kernel DS-neutrality cleanup** — relocate `WpdsThemeProvider` + `SlotFillProvider` out of kernel; engines own DS-specific providers via the `EngineSource.ThemeProvider` seam. Rename `data-wpds-theme-provider-id` → `data-theme-scope-id`.
5. **Hygiene** — reconcile schema `$id` numbering (v1→v0, v2→v1 off-by-one), pin filter priorities apart on `wp_admin_shell_data`, document filter-vs-compiler ordering contract.

## Locked decisions

Resolved before writing this plan; no further input needed on these axes.

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | `customizable` scope | **per-field** path-allowlist | v2 contract; users + roles depend on partial writes (theme color, density, sidebar collapse). Per-block regresses real workflows. |
| 2 | `user-switchable` direction | **code → kebab** | Schema-as-truth; matches every other admin.json key (`default-screen`, `default-route`, `route-key`). External shells unaffected. |
| 3 | Compiler-vs-filter ordering | **document current order (option B)** | Filter sees author shape, not compiler shape. Plugins contributing screens use `_data_{origin}` per-origin filters (priority 5, pre-compile, already reaches `inject_app_baselines`). |
| 4 | `useDataView` LRU cap | **64 entries with code comment "tune after telemetry"** | ~2× realistic working set (~30–40 entries across `wp-admin-default.json` + 6 demo shells × variants); memory negligible (~20 KB); thrash-free for documented usage. |

## Naming reference

No mechanical renames in this plan. Two attribute renames:

| Old | New | Files affected |
|-----|-----|----------------|
| `data-wpds-theme-provider-id` | `data-theme-scope-id` | `ThemeProviderHost.js`, `core-default/compileStyles.mjs` (CHROME_WPDS_BINDINGS selector wrappers), any CSS targeting the attribute. |
| `$doc['userSwitchable']` (PHP) | `$doc['user-switchable']` (PHP) | `class-wp-admin-shell-resolver.php:307`. |

## Stage plan

Sequenced for risk + parallelism. Each stage = one PR. PR 1 must land first (un-blocks security gate); PRs 2 / 3 / 5 land concurrently after PR 1; PR 4 worktreed in parallel from any baseline since it doesn't touch the cascade.

### Stage 1 — Security cascade hardening (PR 1)

**Scope:** items 1, 2, 3, 4, 8 (5 of the 7 🔴 blockers + 1 🟠 major).

**Files modified:**

- `includes/cascade/class-wp-admin-shell-resolver.php`
  - Inside `load_origins()` per-origin loop (or as wrapper after each `apply_filters( "wp_admin_shell_data_{$origin}", $doc )` call), invoke `WP_Admin_Shell_Permissions::enforce_trust_tiers( $doc, $origin )`. Trust tier table: `core` / `engine` / `plugin` / `site` may add+remove permissions; `role` / `user` may only remove (shrink-only). Method already exists at `class-wp-admin-shell-permissions.php:149` with full audit logic — just needs callers.
  - Line 307 (`shell_allows_user_switch`): `$doc['userSwitchable']` → `$doc['user-switchable']`. (Item 5 lives in Stage 2's PR, but if this file is being touched anyway, fold it in here to avoid a second touch.)
  - Document the `wp_admin_shell_data` filter contract in the docblock at line ~118: "Filter fires before v3 compile; receives author shape, not compiled shape. Plugin authors contributing routes/regions use per-origin `_data_{origin}` filters at priority 5." (Item 13.)
- `includes/cascade/class-wp-admin-shell-merge.php`
  - Line 108-111 (assoc-null tombstone): wrap in `if ( $authoritative ) { unset( $base[ $k ] ); continue; } else { /* WP_DEBUG notice + skip */ }`.
  - Line 205-212 (`__tombstone: true` keyed-array Pass 1): same gate. Authoritative origins (core / engine / plugin / site) keep drop semantics; consumer origins (role / user) get a `_doing_it_wrong` notice in `WP_DEBUG` and skip.
- `includes/cascade/class-wp-admin-shell-customizable.php`
  - Replace verbatim pass-through at lines 113-117 with per-field path-allowlist enforcement on the v3 top-level blocks (`menu`, `screens`, `commands`, `workspace`, `preload`, `regions`, `routes`). Path syntax: dotted, supports nested keys + array-id indexing (`styles.color.primary`, `screens.users.label`, `menu.tools.items.import.label`). Default-deny at consumer origins (`role` / `user`); trust tiers bypass (they own the doc shape).
  - Reuse existing v2 walker if it survives in the file; otherwise port from `docs/archive/`.
  - `screens[id].permissions`, `screens[id].app`, `commands[].invoke`, `workspace.engine` must be explicitly default-deny at consumer origins — never allowlistable even with a matching `customizable` entry. Hardcode the deny-list.
- `includes/cascade/class-wp-admin-shell-menu-items.php`
  - Line 480-502 (`is_safe_href`): add `if ( strpos( $href, '//' ) === 0 ) { return false; }` immediately before the trailing colon check. Document the choice inline: "navigation-only validator; not for redirect targets or storage. Use `wp_validate_redirect()` for redirects, `esc_url_raw()` for storage."
- `includes/class-wp-admin-shell-data-view-rest.php`
  - Line 130-131 (`permission_check`): replace `is_user_logged_in()` floor with a screen-aware gate. When request carries `screen=<id>`: resolve via `WP_Admin_Shell_Config::get()` → read `screens[$id].permissions` → route through `WP_Admin_Shell_Permissions::user_passes()`. 403 on fail, 404 unknown screen. When request carries `kind=X&name=Y[&variant=Z]` (triple-keyed, screenless): keep `is_user_logged_in()` floor — triples aren't screen-scoped, no cap floor to gate against.

**Files added:**

- `tests/php/run-security-cascade-tests.php` (~30 assertions):
  - Trust-tier enforcement: user-origin adds cap to `screens.foo.permissions.capabilities` → stripped; user-origin removes cap → applied; site-origin adds cap → kept; core adds → kept.
  - Null-tombstone: user-origin `{ "screens": { "users": null } }` → ignored, `screens.users` survives; core/site origin same payload (`$authoritative === true`) → drop honored.
  - `__tombstone: true` in keyed array: user-origin payload in `menu` array → ignored; site-origin same → drop honored.
  - `customizable` enforcement: consumer-origin write to non-allowlisted field (e.g. `screens.users.permissions`) → rejected; consumer-origin write to allowlisted path (`styles.color.primary` when author declares `customizable: ["styles.color.primary"]`) → kept; consumer-origin write to hardcoded-deny path (`commands[].invoke`) → rejected even with matching allowlist entry.
  - `is_safe_href`: `//evil.example.com` rejected; `/wp-admin/foo` kept; `https://example.com` kept; `#anchor` kept; `mailto:a@b.c` kept; `javascript:alert(1)` rejected.
- `tests/php/run-data-view-rest-tests.php` (~10 assertions):
  - Subscriber `GET ?screen=plugins` (cap floor `activate_plugins`) → 403.
  - Admin same request → 200 + valid doc.
  - Subscriber `GET ?screen=profile` (no cap floor / `read` only) → 200.
  - Unknown screen id → 404 (not 200 with empty doc).
  - Triple-keyed `?kind=root&name=user` (no screen) → 200 + valid doc (logged-in floor only).
  - Logged-out anywhere → 401.

**Risk:** high. `customizable` enforcement may break existing role/user shell switching that currently rides verbatim pass-through. Audit `wp-admin-default.json` + 6 demo shells (`developer-admin.v3.json`, `content-author.v3.json`, `client-portal.v3.json`, `v2-demo.v3.json`, `single-pane-demo.v3.json`, `desktop-demo.v3.json`) for any `customizable` declarations + any role/user-tier overrides that depend on the v3 pass-through. Restore them as explicit allowlist entries.

**Merge gate:** all PHP test runners green (17 existing + 2 new = 19 total runners); manual smoke pass against `wp-admin-default.json` as subscriber / editor / admin / super-admin; smoke pass through each demo shell to confirm role/user overrides flow.

**Estimate:** 2 days.

---

### Stage 2 — `user-switchable` key fix (PR 2)

**Scope:** item 5 (🔴 blocker; ships broken in v3 default).

**Files modified:**

- `includes/cascade/class-wp-admin-shell-resolver.php:307` — `$doc['userSwitchable']` → `$doc['user-switchable']`. (If Stage 1 already folded this in, skip this PR.)
- `grep -r "userSwitchable" includes/ src/` — fix any sibling camelCase reads to kebab.

**Files added:**

- `tests/php/run-cascade-tests.php` — append one assertion: shell with `"user-switchable": true` → `WP_Admin_Shell_Resolver::shell_allows_user_switch( $doc )` returns true.

**Risk:** none. Currently always-false in production; no behavioral regression possible.

**Merge gate:** cascade test runner green; manual smoke: switch shell via toolbar dropdown as admin on `wp-admin-default.json`.

**Estimate:** 0.5 day.

---

### Stage 3 — JS runtime perf (PR 3)

**Scope:** items 6, 7 (1 🔴 blocker + 1 major-ish perf bug).

**Files modified:**

- `src/runtime/bindings/BindingsConsumer.js:32-86`
  - Wrap `commands` array construction (lines 32-37) in `useMemo( () => buildCommandsArray( config?.commands, config?.bindings ), [ config?.commands, config?.bindings ] )`.
  - `useEffect` dep array (line 86) becomes `[ commands, navigate ]` — both stable refs across renders. Document keydown handler binds once per real change, not per router event.
  - Extract `buildCommandsArray()` helper at module scope if it improves clarity; otherwise inline within `useMemo` callback.
- `src/runtime/dataView/useDataView.js:16`
  - Convert bare `Map()` to LRU-evicting wrapper. Insertion-order eviction: on `cache.set( key, value )`, if `cache.size >= LRU_CAP`, `cache.delete( cache.keys().next().value )` first. `LRU_CAP = 64` as module constant.
  - Add code comment: `// LRU cap sized for ~2× working set (entity-CRUD apps × variants × screens). Tune after telemetry if eviction-rate becomes observable.`
  - Apply same cap to the in-flight `inflight` Map (lines 72-82, 94-104) — fetches don't persist after resolution, but bound the map anyway in case of pathological abort-without-cleanup cases.

**Files added:**

- `tests/runtime/bindings-consumer-rebind.test.mjs` (~5 assertions):
  - Spy on `document.addEventListener('keydown', ...)`. Render `<BindingsConsumer config={cfg} />` twice with stable `cfg` ref. Assert exactly one `addEventListener` call (mount), one `removeEventListener` call (unmount). No re-bind on intermediate render.
  - Same setup with `config` ref-equal-but-new-object → confirm no re-bind (memoized on content, not ref). Actually — `useMemo` deps are `config?.commands` + `config?.bindings`, so if those nested refs are stable across the outer ref change, no re-bind. Test both axes.
- `tests/runtime/data-view-lru.test.mjs` (~5 assertions):
  - `set()` 70 entries with distinct keys. Assert `cache.size === 64`. Oldest 6 keys not present. Newest 64 present.
  - Re-`get()` an existing key followed by new `set()` — verify LRU semantics (re-access promotes? No — module is insertion-order LRU, not access-order. Document this.).

**Risk:** low. LRU could thrash if real working set exceeds 64 entries. Sized at ~2× documented working set; revisit if dogfooding surfaces eviction warnings (not adding instrumentation in this PR — defer until needed).

**Merge gate:** runtime test runner green; manual smoke: open every entity-CRUD app + switch shells + run command palette — no console errors, no visible re-bind thrash.

**Estimate:** 0.5 day.

---

### Stage 4 — Kernel DS-neutrality cleanup (PR 4)

**Scope:** items 11, 12 (2 🟠 majors). Worktreed independently of PR 1; merge order doesn't matter relative to security PR.

**Files modified:**

- `src/runtime/styles/WpdsThemeProvider.js` — **move** to `src/runtime/engines/core-default/WpdsThemeProvider.js`. Export from `core-default/index.js`'s `EngineSource.ThemeProvider` field.
- `src/runtime/engines/core-single-pane/index.js` — currently presumed to reuse the kernel-path import; repoint to `core-default/WpdsThemeProvider` (single-pane engine reuses WPDS contract — explicitly document core-default-as-baseline in the engine manifest). Alternative: duplicate the provider into single-pane's directory. **Decision: re-export from core-default** to keep one source of truth; document single-pane's dependency on core-default's `WpdsThemeProvider` in `single-pane/engine.json`.
- `src/runtime/styles/ThemeProviderHost.js`
  - Drop the `import { WpdsThemeProvider } from './WpdsThemeProvider'` at line 28.
  - Line 210 fallback path: when engine doesn't supply `ThemeProvider`, render a minimal neutral wrapper `<div data-theme-scope-id={id}>{children}</div>`. No DS-specific provider mounts. Document: engines opting into shell theming MUST ship a `ThemeProvider` on their `EngineSource`; absence renders un-themed (engine contract).
  - Error-boundary recovery (when engine-supplied provider throws): swap to the same neutral wrapper, NOT WpdsThemeProvider. Engines opt into recovery by shipping a working provider.
  - Rename DOM attribute `data-wpds-theme-provider-id` → `data-theme-scope-id`. Update CSS selectors in `src/runtime/engines/core-default/compileStyles.mjs` (CHROME_WPDS_BINDINGS wrapper selectors) + any other consumers.
- `src/runtime/kernel.js:7` — drop `SlotFillProvider` import from `@wordpress/components`. Each engine's `Layout.js` wraps its rendered tree in `<SlotFillProvider>` if it needs Slot/Fill. Bundled engines (`core-default`, `core-single-pane`, `core-desktop`) all need it — apply uniformly. Non-WPDS engines may omit, or supply their own Slot/Fill substrate.
- Audit `src/runtime/engines/{core-default,core-single-pane,core-desktop}/Layout.js` — add `<SlotFillProvider>` wrapper where it's not already present.

**Files added:**

- `tests/runtime/theme-provider-host.test.mjs` (~8 assertions):
  - Mount `<ThemeProviderHost engineSource={{}} />` (no ThemeProvider) → asserts `data-theme-scope-id` wrapper renders; no DS provider mounts; children render.
  - Mount with engine.ThemeProvider supplied → engine provider wraps children; assert provider identity.
  - Engine provider throws synchronously → error boundary catches → neutral wrapper renders → assert no `WpdsThemeProvider` symbol in caught render tree (static-analysis-style check, or shallow snapshot).
- `tests/runtime/kernel-no-ds-import.test.mjs` (~4 assertions):
  - Read source of `src/runtime/kernel.js`, `src/runtime/index.js`, `src/runtime/styles/ThemeProviderHost.js` as strings. Regex-reject any `import` statement matching `@wordpress/components`, `@wordpress/ui`, `./WpdsThemeProvider`. Codifies the kernel DS-neutrality contract from CLAUDE.md.

**Risk:** medium. `SlotFillProvider` relocation can break apps relying on a single global Slot registration (e.g. NoticesArea fills from multiple regions, ToolbarActions cross-region slots). Verify with a smoke pass: every region rendering Slots + every region rendering Fills.

**Isolation:** **use `isolation: "worktree"` for the Agent doing this stage's implementation work** — DS plumbing has highest blast radius of any change in the five-PR sequence.

**Merge gate:** runtime test runner green; engines test runner green; manual smoke: each bundled shell renders + notices snackbar + toolbar actions + command palette open / close (all use Slot/Fill); no console warnings about missing Slot context.

**Estimate:** 2 days.

---

### Stage 5 — Hygiene (PR 5)

**Scope:** items 9, 10, 13 (1 🟠 major, 1 🟠 major, 1 🟡 minor).

**Files modified:**

- `docs/schemas/admin-v1.json` — `$id` `"https://schemas.wp.org/admin/v0.json"` → `"https://schemas.wp.org/admin/v1.json"`.
- `docs/schemas/admin-v2.json` — `$id` `"https://schemas.wp.org/admin/v1.json"` → `"https://schemas.wp.org/admin/v2.json"`.
- `docs/schemas/admin-v3.json` — already `"https://schemas.wp.org/admin/v3.json"`; no change.
- `docs/schemas/admin-app-v2.json` / `admin-app-v3.json` / `admin-engine-v2.json` / `admin-engine-v3.json` — verify `$id` numbering is consistent (`v2`, `v3` as appropriate); fix any off-by-ones found.
- `docs/schemas/tokens-v1.json` — verify; likely no change.
- `tests/schema/validate-shells.test.mjs` — update Ajv `addSchema()` calls referencing old `$id` URLs. Confirm all 7 bundled shells + manifests still validate after the rename.
- `includes/cascade/class-wp-admin-shell-menu-items.php:528` — `bind_screens()` registration: priority **5** → **5** (no change; pin first).
- `includes/cascade/class-wp-admin-shell-data-view-config.php:875` — `inject_app_baselines()` registration: priority **5** → **6**. Decision: `bind_screens` must run first (menu items contribute screens that `inject_app_baselines` may then attach dataView baselines to).
- Document the resolved order in CLAUDE.md "Recurring patterns" section + `docs/upgrade-v2-to-v3.md` filter-ordering section.
- `includes/cascade/class-wp-admin-shell-resolver.php` — add docblock comment on `wp_admin_shell_data` filter dispatch (~line 118) capturing the option-B decision: "Filter receives author shape (workspace / screens / menu / commands). Compile runs after. Plugin authors contributing routes/regions use per-origin `_data_{origin}` filters at priority 5 — those fire before compile and reach `inject_app_baselines`." (If Stage 1 folded this in, skip here.)

**Files added:** none.

**Risk:** low. Schema `$id` rename could break external consumers referencing old URLs — none known. Mitigation: add a `$comment` field at the new `$id` location noting the prior identifier ("previously published as `.../admin/v0.json`; identifier corrected in v3.0 beta cycle").

**Merge gate:** schema test runner green (103 assertions); shape test runner green (133 assertions); PHP test runner sweep green; manual smoke: add a `wp_admin_shell_data_plugin` callback contributing a screen + assert `inject_app_baselines` runs after `bind_screens` (test fixture or `error_log` trace).

**Estimate:** 0.5 day.

---

## Bundled-test deltas

Per-stage test additions; cumulative impact ~60 assertions on top of the current ~1580.

| Stage | New file | Assertions |
|-------|----------|-----------:|
| 1 | `tests/php/run-security-cascade-tests.php` | ~30 |
| 1 | `tests/php/run-data-view-rest-tests.php` | ~10 |
| 2 | (append to `run-cascade-tests.php`) | 1 |
| 3 | `tests/runtime/bindings-consumer-rebind.test.mjs` | ~5 |
| 3 | `tests/runtime/data-view-lru.test.mjs` | ~5 |
| 4 | `tests/runtime/theme-provider-host.test.mjs` | ~8 |
| 4 | `tests/runtime/kernel-no-ds-import.test.mjs` | ~4 |
| 5 | (none — existing schema sweep covers `$id` reconciliation) | 0 |
| **Total** | | **~63** |

Post-merge target: ~1643 assertions across 19 PHP runners + 6 Node test scripts.

## Per-stage smoke checklist (full chain)

Run after the full 5-PR chain lands, before tagging v3.0.0-beta.1.

1. **Cap gating across roles** (subscriber → editor → admin → super-admin) on `wp-admin-default.json`. No screen leaks; menu pruning consistent with native wp-admin.
2. **`/data-view` REST** — subscriber against admin-only screen → 403; admin same → 200; unknown screen → 404.
3. **`customizable` partial writes** — set theme color as `user` origin via REST `/user-prefs`; assert flow through; attempt to write `screens[X].permissions` as user → rejected.
4. **Null-tombstone** — as admin (`site` origin), write `{ "screens": { "comments": null } }` → comments screen drops. As subscriber (`user` origin), same payload → ignored.
5. **Each bundled shell** renders + Cmd+K palette + shell switching (incl. user-switchable toolbar dropdown) + form-save on settings page (PHP 8.1+).
6. **`@wordpress/ui` overlay components** (Modal, Notice, Popover, Tooltip) render correctly after `SlotFillProvider` engine-side relocation.
7. **Notices** — snackbar on success, dismissible banner on error.
8. **DataViews + LRU eviction** — open 70 distinct dataView screens in one session (cross 6 entity-CRUD apps × 10 variants + shell switching). No console warnings, no visible regression.
9. **Bindings consumer** — Cmd+K + every shell-defined shortcut fires; no rebind console traffic observable in DevTools event-listener panel after router navigation events.
10. **Schema sweep** — `npm run test:schema` against all 7 bundled shells + manifests after `$id` reconciliation.

## Parallelization graph

```
PR 1 (security) ─────┬──> PR 2 (user-switchable)*
                     ├──> PR 3 (perf)
                     └──> PR 5 (hygiene)

PR 4 (DS-neutrality) — independent baseline; worktreed
```

\* PR 2 can fold into PR 1 if implementer touches `class-wp-admin-shell-resolver.php` in Stage 1 anyway. Single-line change.

## Out of scope

Items the review flagged but not landing in this plan (capture for future tracking):

- DataViews / DataForm adoption audit (review 5, 21:37 UTC). Six entity-CRUD apps hand-roll edit modals; zero DataForm adopters. Phase 1 (taxonomy + media → DataForm) is mechanical, ~100 LOC dedup; defer to post-v3.0.
- DataView config API consumption audit (review 6, 21:48 UTC). ~650 LOC duplication across 6 entity-CRUD apps (`compileEligibility`, `composeFields`, `composeActions`, `useDataViewResync`, `VIEW_DEFAULTS`). Three schema-additive gaps (field-presence eligibility operator, `RenderModal` modal-template registry, `query.transport` declaration). Defer to post-v3.0.
- Token-pipeline cleanups from review 3 (17:03 UTC):
  - `core.tokens.json` dead-weight removal when no aliases referenced.
  - `core:main` / `core:detail` card chrome (`border-radius` / `box-shadow` / `margin`) non-overridable — add chrome-var escape hatches.
  - `core:desktop` engine breaks chrome→WPDS fallback contract (~10 hardcoded hex literals). Standardize on two-arg `var()` pattern.
  - Single-`bg`-seed surface ambiguity (no separate `surface` seed; tier-3 slot overrides currently required for dark-canvas/light-cards look).
- `_doing_it_wrong()` migration sweep (review 2, 16:16 UTC) — repo-wide pattern of `trigger_error` / inline `error_log` should standardize on canonical WP API. Four sites currently (`class-wp-admin-shell-{admin-routes,field-collections,menu-items,preload}.php`). Defer to a single-purpose sweep PR.
- Per-app `compileCommands.mjs:118` mid-pattern wildcard (`/posts/*/foo`) skip widening — latent, no current screens hit it. Track for next palette work.
- Other review-1 minors (`Region.js` state class collision; `useDataView` hydrate fast-path / slow-path debug-shape divergence; `findScreen` only top-level; test scripts using ad-hoc `ok` / `eq` instead of `node:assert/strict`) — accept as known-debt; revisit when each surface is next touched.

## Backout

Each PR is independently revertable via `git revert`. PR 1's revert is most-dangerous (re-opens security gaps). PR 4 most-likely to need revert (Slot/Fill relocation has highest unknown blast radius); worktree isolation makes the revert mechanical. PRs 2 / 3 / 5 effectively irreversible-but-trivial — re-landing after a revert costs minutes.

PR 1's `customizable` enforcement is the highest-blast-radius single change. If it breaks role / user shell switching in production after merge, the immediate-mitigation is a temporary `add_filter( 'wp_admin_shell_customizable_bypass', '__return_true' )` escape hatch — declared at PR-time, default-off, undocumented (intended as the dev-side "uh-oh" lever, not a long-term contract). Remove after the issue is identified and fixed properly.

## Owner deliverable

End of chain (PR 5 merged): a follow-up PR updates this plan's status to `shipped` and links it from CLAUDE.md's status block as the resolution of PR #49 pre-merge review.
