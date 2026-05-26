# Pre-Ship Cleanup — Findings

> **Status:** Phase 0 map. Read-only inventory of dead scaffolding produced by the
> in-development v0→v1→v2→v3 schema churn. Nothing has shipped publicly; the v3 shape
> (`docs/v3/schema-sketch.md`) is the intended design and explicitly states *"No backwards
> compat with v1. This hasn't shipped publicly. Breaking changes are fine."*
>
> This document is the working map for the cleanup. Each artifact is tagged with the phase
> that owns it and whether it is **confirmed dead** (safe to remove) or **needs-decision**
> (load-bearing, or gated on a product question / Phase 1 approach).

## Baseline / tooling availability

| Tool | Status | Notes |
|------|--------|-------|
| `node` / `npm` | ✅ v22.22 / 10.9 | `node_modules/` is **absent** — `npm install` required before `build` / `lint` / node tests. |
| `npm run build / lint:js / test:parity / test:schema / test:runtime / test:engines` | ⚠️ runnable after `npm install` | Will run per-phase to keep green. |
| `php` CLI | ✅ 8.4.19 | Present, but PHP fixture tests use `wp eval-file` (need a booted WP). |
| `docker` | ✅ present | `wp-env` *may* boot, subject to image-pull network policy. Will attempt in Phase 1; report if blocked. |
| `gh` CLI | ❌ absent | GitHub access is via `mcp__github__*` tools (repo scoped to `dabowman/wordpress-admin-environment`). Phase 6 issue triage uses those or is left as a report. |

Remote tags: `v2.0.0-beta.2` only (no `v1.0.0-beta` on remote). See Phase 5.

---

## How the pipeline reads config today (the keystone fact for Phase 1)

`WP_Admin_Shell_Resolver::resolve()` merges six origins, then calls
`WP_Admin_Shell_V3_Compiler::compile()` as the **last** step
(`includes/cascade/class-wp-admin-shell-resolver.php:164`). The compiler does **not** replace
the v3 blocks — it *adds* synthesized `routes` / `regions` / `default-route` / `commands`
(the "v2-runtime surfaces") to the resolved doc while leaving `workspace` / `screens` /
`menu` / `settings` in place for apps to read.

- **The kernel** (`src/runtime/kernel.js`) consumes the synthesized `config.regions`,
  `config.engine`, `config['default-route']`. It does **not** read `screens` / `workspace` /
  `menu` directly.
- **Apps** read the v3 blocks (`screens[id].dataView._resolved`, etc.) directly.

So "the kernel reads a v2 shape" is accurate: the v3→runtime synthesis is real and
load-bearing, not dead. This is the Phase 1 (a)-vs-(b) decision (see flagged questions).
Separately, the compiler carries several **genuinely dead** v2-input back-compat passes
(table below) that can go regardless of the Phase 1 approach.

---

## Phase 1 — Shape-translation code

| Artifact | Path / symbol | Dead? | Notes |
|----------|---------------|-------|-------|
| v3→runtime synthesis (core) | `class-wp-admin-shell-v3-compiler.php` — `synthesize_routes`, `synthesize_regions`, `synthesize_default_route`, `compile_commands`, `stamp_screen_data_view_resolved`, `translate_iframe_app_refs`, `primary_app`, `lookup_engine_manifest`, `deep_merge` | **needs-decision** | This is the actual translator. Its fate depends on Phase 1 (a) vs (b). Under (a) it's deleted and the kernel learns to read `screens`. Under (b) it stays but is reframed as "the runtime builder" (not a v2 translator) and loses the v2-input passes below. |
| v2-input fast-path branch | `compile()` lines 99–122 (`! is_v3()` branch) | **confirmed dead** | No v2 shell exists or can be authored — all 7 bundled shells are `version:3`. |
| `forward_v2_bindings_to_commands()` | same file | **confirmed dead** | v2 `bindings` block; no v2 input. |
| `synthesize_v2_screens_from_routes()` | same file | **confirmed dead** | v2 routes→screens back-synthesis. |
| `translate_v2_dashboard_widgets()` + `pick_v2_target_screen()` | same file | **confirmed dead** | v2 top-level `dashboardWidgets` block; v3 uses `screens[].apps[] slot:"grid"`. |
| `is_v3()` detector | same file | **needs-decision** | Only needed while a v2 path exists; removable once the v2 branch goes. |
| v0→v1 normalizer | `includes/origins/class-wp-admin-shell-origin-core.php` | **already removed** | `normalize_v0()` body gone (comment only). BUT `empty_doc()` still returns a **v2-shape** fallback (`engine`+`regions`+`routes`, `$schema: admin-v2.json`). Load-bearing fallback — needs reshape to the surviving shape under Phase 1. |
| `migrate-shell` CLI | `includes/class-wp-admin-shell-cli-migrate.php` (780 LOC) + `class-wp-admin-shell-cli.php::migrate_shell()` + `tests/php/run-migrate-shell-cli-tests.php` (81 assertions) | **confirmed dead** | v2→v3 one-way migration helper for a never-shipped v2. The brief lists removing the `upgrade-config` command; that command is **already gone** (only doc/comment references remain). The live equivalents are `migrate-shell` (v2→v3) and `check-config` (v2-readiness diag). |
| `check-config` CLI | `class-wp-admin-shell-cli.php::check_config()` | **confirmed dead** | Diagnoses "v2 readiness" of v0/v1/v2 shells. Pre-ship scaffolding. |
| `<name>.v0.json` preservation | (referenced in README/docs only) | **already removed** | No code path preserves `.v0.json`; only docs reference it. README cleanup in Phase 5. |

---

## Phase 2 — Back-compat & deprecation machinery

| Artifact | Path / symbol | Dead? | Notes |
|----------|---------------|-------|-------|
| `/screen-view` REST alias + `X-WP-Deprecated` | `includes/class-wp-admin-shell-data-view-rest.php` — route registration (~L113), `get_screen_view_deprecated()` (~L270–303) | **confirmed dead** | Keep only `/data-view`. |
| Legacy view-config filter shim | `class-wp-admin-shell-data-view-config.php` — `wp_admin_shell_view_config_*` dispatch (L136–157), `maybe_emit_deprecation_notice()`, `$emitted_deprecation_notices` | **confirmed dead** | Fires the v2 filter name alongside the v3 one. Keep only `wp_admin_shell_data_view_config_*`. |
| v2 `viewConfigs` orphan warning | same file — `warn_legacy_view_configs()` (L756), `$emitted_view_configs_orphan_notice`, the priority-999 `wp_admin_shell_data` hook (L885) | **confirmed dead** | Warns when a v2 `viewConfigs` block is present; impossible for v3-only input. |
| `wp_admin_shell_register_field_collection()` wrapper | `class-wp-admin-shell-data-field-collections.php` (L247–256) + `note_legacy_call()` + `$legacy_call_noted` | **confirmed dead** | Keep only `wp_admin_shell_register_data_field_collection()`. |
| JS dataView deprecation shims | `src/runtime/dataView/deprecation.mjs`; `useDataView.js::useScreenView`/`useViewConfig` (L300–340); `hydrateInline.mjs::hydrateInlineScreenView` (L379–390) | **confirmed dead** | v2 hook/fn aliases. Confirm no bundled app imports them (grep before delete). |
| "v2 shell boots under v3" dataView path | `class-wp-admin-shell-data-view-config.php` resolver step-3 manifest inference reading `config.variant` (the v2 back-compat hook) | **needs-decision** | Underlying 3-axis resolution is a real feature; only the v2-input branch is compat. Audit carefully — entity-CRUD apps depend on `resolve_screen_data_view`. |
| `navigate(appId, ...segments)` multi-arg | `src/runtime/routing/router.js` (~L36, L163, `navigate()`) | **needs-discovery** | "v1 transitional path." Behavioral — grep bundled apps for multi-arg callers before removing. Flag if any live caller. |
| CIAB `next_admin_*` framing | comments in `class-wp-admin-shell-admin-routes.php`, `class-wp-admin-shell-data-view-config.php`; menu/route registration shims | **needs-decision (product Q1)** | No actual `next_admin_*` alias *functions* exist — the shims are native `wp_admin_shell_*` with CIAB-compatible *arg shapes/filter names*. Whether to keep CIAB-compat at all is a product question. |

**Do NOT remove** the underlying features: dataView registry, field collections, REST
preloads, menu/route registration. Only the compat/alias/deprecation layers.

---

## Phase 3 — Schemas & tests

### Schemas (`docs/schemas/`)

| File | Keep? |
|------|-------|
| `admin-v3.json`, `admin-app-v3.json`, `admin-engine-v3.json` | **keep** (surviving generation). Consider dropping `-v3` (product Q4). |
| `admin-v1.json` | **delete** (legacy beta schema). |
| `admin-v2.json`, `admin-app-v2.json`, `admin-engine-v2.json` | **delete** (superseded). |
| `tokens-v1.json` | **keep** (only generation); consider renaming `tokens.json` (product Q4). |

All 7 shells already `$schema → admin-v3.json`. `empty_doc()` references `admin-v2.json`
(fix in Phase 1).

### Tests

| Artifact | Action |
|----------|--------|
| `tests/schema/validate-shells.test.mjs` | Trim v1 + v2 sweeps; keep v3 only. |
| `tests/schema/fixtures/01..05-*.json` (v1), `tests/schema/fixtures/v2/` | Delete (v1/v2 fixtures). |
| `tests/schema/fixtures/v3/` | Keep. |
| `tests/php/fixtures/07-v0-flat.json` | Delete (v0 fixture) — confirm no runner references it. |
| `tests/php/run-migrate-shell-cli-tests.php` | Delete (migrate CLI gone). |
| `tests/php/run-v3-compiler-tests.php` | Rework per Phase 1 outcome (drop v2-input assertions at minimum). |
| `tests/php/run-shape-tests.php` | Already v3-modernized per CLAUDE.md; recheck for residual v1/v2 branches. |
| Other PHP runners | Keep; trim any asserts on deleted compat paths (data-view, field-collections, dashboard widgets). |

---

## Phase 4 — Documentation

### Durable (keep; rewrite forward in Phase 4)

- `docs/wp-admin-shell-design-spec.md` — **rewrite forward** from the v3 shape; remove the
  status-block changelog and the "when prose / schema / runtime disagree" hedges (spec §0 / §14).
- `docs/v3/schema-sketch.md` — the v3 design doc (strip "Phase 2 locked", roadmap cross-links).
- `docs/dataview-config.md`, `docs/v3/core-default-engine.v3.md`,
  `docs/engines-and-design-systems.md`, `docs/public/{admin,app,engine}-json-reference.md`,
  `docs/screens/*` (42 tier-2 specs).
- `docs/schemas/*` (surviving generation).
- `docs/v1-token-emission.md` → rename `token-emission.md` (Q4).

### Process / scaffolding (archive or delete)

| File | Recommendation |
|------|----------------|
| `docs/upgrade-v2-to-v3.md` | **delete** (Phase 2 — deprecation timeline for never-shipped v2). |
| `docs/v3/roadmap.md` | archive or delete (phase tracker). |
| `docs/plans/wp-admin-shell-v2-migration-directive.md` | archive. |
| `docs/plans/2026-05-20-dataview-registry-restoration.md` | archive. |
| `docs/plans/*` (track-*, ciab-adoption-tracks, agent-prompts, alpha-release, pr49-feedback, theme-provider-overhaul, desktop-engine-port, simple-editor, tokens-wpds-fragment) | archive (agent process breadcrumbs). |
| `docs/post-editor-sketch.md` | archive. |
| `docs/research/schema-exercise-findings.md` | archive. |
| `docs/research/ciab-*` | archive (CIAB cancelled — gated on Q1). |
| `docs/v1-readiness.md`, `docs/v2-readiness.md` | archive. |
| `docs/v1-perf-baseline.md` | keep or rename `perf-baseline.md` (Q4); durable-ish. |
| `CHANGELOG.md` | **needs-decision** — changelog for never-shipped 1.0.0-beta/2.0.0-beta. Recommend delete or reset; flag. |
| `docs/comms/*`, `docs/reviews/*`, `docs/feedback.md` | leave (out of cleanup scope unless asked). |

### Build-phase labels to strip from durable docs

`C1`/`C2`/`C3`/`C4`, `3c.x`/`3d.x`, `F-track`/Track A–F, "restored from v2", "Phase 2 locked",
"accepted regression vs pre-C2", "one release cycle". Present throughout CLAUDE.md,
design-spec, schema-sketch, dataview-config, public reference docs.

---

## Phase 5 — README, tag, naming

- `README.md` is **heavily stale** (describes v1: five origins missing the `engine` origin,
  `upgrade-config` CLI, v0 normalizer "pins system apps", `userCustomizable`, a project tree
  with `selection/` / `slots/` dirs that no longer exist, `core:command-picker`). Full rewrite.
- **Git tag:** remote has `v2.0.0-beta.2` (and history references `v1.0.0-beta.1` /
  `v2.0.0-beta.1`). These imply releases that did not happen — **flag for deletion**; do not
  delete remote tags without confirmation.
- **Naming divergence:** repo `WordPress-Admin-Environment` vs plugin "WP Admin Shell" —
  **flag for human**, do not rename.
- **Shell filenames:** 5 of 7 carry a `.v3` suffix (`*.v3.json`); `v2-demo.v3.json` is a
  doubly-misleading name. Drop `.v3` (Q4); rename `v2-demo` → something shape-neutral.

---

## Flagged for human decision (do not decide unilaterally)

1. **CIAB compatibility scope.** CIAB / Next Admin was cancelled. The menu/route registration
   shims and filter-name compatibility (`s/next_admin_/wp_admin_shell_/g` arg shapes) exist
   purely for CIAB migration. Keep the CIAB-compatible surface, or drop CIAB-compat and keep
   only the native functionality?
2. **dataView i18n.** Locale-agnostic JSON primitives (current) vs translatable labels. Was
   framed as an "accepted regression" vs a dead iteration — re-decide on its own merits.
3. **Phase 1 approach.** (a) migrate the kernel to read v3 `screens` directly and delete the
   compiler, or (b) keep the synthesized internal representation as the single shape, drop the
   "v2" label and the v2-input passes, and reframe the compiler as the runtime builder.
   Approach (b) is lower-risk (no kernel/runtime behavior change); (a) is the cleaner end state
   the brief's "zero adapters" goal points at. **Recommend (b)** for a cleanup-not-redesign
   scope, with the dead v2-input passes removed either way.
4. **Versioning convention.** Drop version numbers from schema/doc/shell filenames
   (`admin-v3.json` → `admin.json`, `*.v3.json` → `*.json`, `v1-token-emission.md` →
   `token-emission.md`) until a real release, or keep numbered?

---

## Phase 6 — Issue backlog addendum

All 10 open issues predate the reshape and carry pre-reshape labels (`track:v2`,
`track:upstream`). Two are obsoleted by work that has since shipped; the rest are
still-valid backlog items that need relabeling (and several reference file paths /
schema vocabulary that no longer exist).

| # | Title | Recommendation | Reason |
|---|-------|----------------|--------|
| 30 | Runtime smoke harness (JSDOM kernel mount) | **keep + relabel** | Still the real coverage gap — *more* relevant now that the kernel does region/route synthesis JS-side (`build-runtime-config.test.mjs` covers synthesis, not mount). Body references v1-shape (`settings.defaultRoute`, `core:command-picker`) — refresh it. |
| 28 | In-process shell re-mount (no hard reload) | **keep + relabel** | `shell-switching.js` still does `location.reload()`. Valid enhancement. |
| 23 | Pluggable layout-engine: first non-default engine | **close** | Obsolete. Premise ("v1 ships only `core:site-editor-layout`") is false — three engines ship (`core:default`, `core:single-pane`, `core:desktop`). Engines are first-class artifacts. |
| 22 | UsersApp bulk-delete reassign UX | **keep + relabel** | Valid UX enhancement. Stale path: `src/apps/UsersApp.js` → `src/apps/users/index.js`. |
| 21 | PostsApp URL-encode `wp_template` IDs | **keep + relabel** | Valid. Stale path: `src/apps/PostsApp.js` → `src/apps/posts/index.js`. |
| 20 | Post settings panel for SimpleEditorApp | **keep + relabel** | Valid; still deferred. |
| 19 | developer-admin Design decomposition | **keep + relabel (verify)** | `developer-admin` now uses native apps + drilldown menu; confirm whether the Design-surface decomposition is done before keeping. |
| 18 | Nav drilldown + navigate combined mode | **keep + relabel** | Underlying UX may still be open, but the body's v2 vocab (`{screen, app, items}`) is outdated — v3 uses the `menu` tree + path-based drilldown reopen. Refresh the body. |
| 17 | tokens.json primitives layer — implementation sketch | **close** | Obsolete. tokens.json ships (`WP_Admin_Shell_Tokens` + `tokensResolver.mjs` + `docs/schemas/tokens.json`); the DTCG type-coercion is implemented. The "lands in v2 / no sketch yet" framing contradicts the current state. |
| 15 | Upstream `@wordpress/ui` privateApis allowlist | **keep as-is** | Still accurate — the Gutenberg hard-dependency is current reality. `track:upstream` is fine (not v2-reshape vocab). |

**Relabel recommendation:** replace `track:v2` with a release-neutral label (e.g.
`backlog`, or drop it and keep the `area:*` / type labels) — nothing has shipped, so
the v1/v2/v3 track vocabulary no longer maps to anything.

**Applying these:** `gh` is not installed, but GitHub MCP tools are available (repo
scoped to `dabowman/wordpress-admin-environment`). Per the "be frugal on GitHub"
guidance, no issue was modified. The human can ask the assistant to apply the
close/relabel actions, or do so manually.
