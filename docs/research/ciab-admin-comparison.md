# WP-Admin-Shell vs CIAB-Admin

**Date:** 2026-05-06
**Subject of comparison:** `/Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin` vs this repo's `feat/wp-admin-shell-v2` branch (v2.0.0-beta.1).
**Purpose:** Architectural compare/contrast between two parallel efforts to replace wp-admin with a React SPA.

Both projects mount a React SPA under wp-admin and render entity-driven screens via `@wordpress/core-data` and WPDS. They diverge sharply on configuration model, layout flexibility, theming portability, and migration strategy.

---

## Configuration model

|                  | WP-Admin-Shell                                            | CIAB-Admin                                  |
| ---------------- | --------------------------------------------------------- | ------------------------------------------- |
| Shape            | Declarative JSON (admin.json + app.json + engine.json)    | PHP filters + function calls at boot        |
| Validation       | JSON Schema 2020-12, 60 schema sweeps in test suite       | None static — runtime PHP execution         |
| Origins          | 6-origin cascade (core / engine / plugin / site / role / user) | Single PHP context per request          |
| Portability      | Files swap, ship in plugins/themes, statically inspectable | Must execute PHP to know shape             |

**WAS strength:** static analysis, design-time preview, theme.json-grade cascade. Plugin can ship a `shells/foo.json` and it's a complete addressable artifact.
**WAS weakness:** less idiomatic for WP plugin authors used to `add_filter`.
**CIAB strength:** idiomatic WP hooks; plugin authors already know the API. No new vocabulary.
**CIAB weakness:** no portable artifact, no multi-origin merge, no schema validation, no preview tooling possible.

---

## Routing

|             | WAS                                                              | CIAB                                                  |
| ----------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Engine      | Custom URL-decomposer (`matchRoute.mjs`, hash + Navigation API)  | TanStack Router (unlocked from `@wordpress/route` private API) |
| State model | URL = full app state (route-key, `?screen=` drilldown)           | TanStack Router state                                 |
| Lazy load   | Region templates resolve at mount                                | Dual route+content module — `beforeLoad` static / content lazy |

**WAS strength:** URL-as-state rigor, no router-lib dependency, deep-links survive everywhere.
**WAS weakness:** smaller, less battle-tested than TanStack.
**CIAB strength:** code-split-aware loaders (`beforeLoad`), mature routing primitive.
**CIAB weakness:** depends on unstable WP private API unlock; version-coupled.

---

## Layout / chrome

|                  | WAS                                                                                | CIAB                                          |
| ---------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- |
| Shape            | Pluggable **engines** (`core:default` + `core:single-pane`) ship region templates + ThemeProvider | Fixed surfaces: sidebar / stage / inspector / canvas |
| Region typing    | role + layout + platform + routing (4 axes)                                        | Surface name string                           |
| Per-route chrome | Engine + admin.json compose freely                                                 | Route declares which surfaces populate        |

**WAS strength:** swap whole shell idiom (mobile, kiosk, branded). Multi-tenant capable.
**WAS weakness:** more concepts to learn; bigger surface area.
**CIAB strength:** simple mental model; one shell to design against.
**CIAB weakness:** locked to one chrome shape; can't ship a mobile-first or brand-locked variant without forking.

---

## Apps / screens

|             | WAS                                                                              | CIAB                                  |
| ----------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| Unit        | App = JS component + `app.json` manifest, registered via `wp_admin_shell_register_app` | Route module (loader / inspector / canvas) + Content module |
| Escape hatch | `iframe:` fallback — every wp-admin URL viable                                  | None — must rebuild every screen native |
| Bundled count | 18 native + 1 iframe shim                                                      | All custom                            |

**WAS strength:** progressive migration via iframe — never stuck on unmigrated screens.
**CIAB strength:** all-native, no iframe ugliness, consistent rendering.
**CIAB weakness:** can't ship until everything is ported.

---

## Theming

|              | WAS                                                                                          | CIAB                                                |
| ------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| System       | 4-tier: seeds → nested seeds → slot overrides → DTCG tokens.json                             | ThemeProvider + `@automattic/design-system` + `@automattic/theme` |
| Tokens       | W3C DTCG `tokens.json`, deep-merge resolver, curly-brace aliases                             | Code-driven, no portable token file                 |
| WPDS bridge  | `CHROME_WPDS_BINDINGS` maps chrome slots → `--wpds-*` interactive tokens                     | Direct WPDS + custom CSS modules                    |
| Engine theme | Engine ships own ThemeProvider via `EngineSource` (Material / Tailwind possible)             | Single theme provider                               |

**WAS strength:** portable tokens, multi-DS engine pluggability, token cascade.
**WAS weakness:** complex; chrome-WPDS bridge non-obvious.
**CIAB strength:** simpler, fewer concepts.
**CIAB weakness:** no portable token spec, theming locked to A8C-internal packages.

---

## Data / capabilities

Both use `@wordpress/core-data` for entities.

- **WAS:** 4-layer cap gating — region fast-path → app gate → source-cap floor → REST observation. Nav prunes recursively. Client-side `userCan()` + `/wp-admin-shell/v1/can/{cap}` REST.
- **CIAB:** server-side menu prune via `current_user_can()` before serialization. Custom REST controllers (`view-config`, `field-collections`, `dashboard-widgets`).
- **CIAB extras:** REST preload middleware (`rest_preload_api_request`), `view-config` per entity type as portable UI spec, dashboard-widget grid, field-collections.

**CIAB strength:** dashboard-widgets + view-config + field-collections = richer first-class data-UI primitives. Preload middleware = fewer round trips on cold mount.
**WAS strength:** stricter cap defense-in-depth, client+server symmetry, faster client-side denial.

---

## Extension model

- **WAS:** 6 extension surfaces — `wp_admin_shell_data` filters (per-origin), `register_app`, `register_template`, `register_engine`, `register_shell`, JS-side `useDirtyState` + `bindings`. Plus convention path discovery (`{plugin}/apps/{name}/app.json`).
- **CIAB:** `register_admin_route`, `register_menu_item`, `register_dashboard_widget`, `register_field_collection`, view-config filters per entity kind/name.

CIAB is more entity-centric (field collections, view-configs per type). WAS is more shell-shape-centric (engines, templates, whole-shell registration).

---

## Build

- **WAS:** `@wordpress/scripts` + one `copy-webpack-plugin` step (dataviews CSS). Hard Gutenberg plugin dep for `@wordpress/ui` private-API allowlist.
- **CIAB:** `wp-build` (custom webpack wrapper). `wp_register_script_module` native ESM + `.asset.php` deps. Routes auto-registered from `package.json` `route` metadata.

**CIAB strength:** native script modules, modern, smaller bundler surface.
**CIAB weakness:** custom build tool, harder for outside contributors.

Both depend on private WP APIs: CIAB unlocks `@wordpress/route`; WAS piggybacks `@wordpress/edit-site` allowlist via `__dangerousOptInToUnstableAPIsOnlyForCoreModules`. Both fragile to WP core changes.

---

## Tests

- **WAS:** 571 assertions across schema (60), runtime (222), parity (4), 6 PHP suites (cascade / cap / shape / manifest / tokens / engine-defaults). Schema sweeps every bundled shell + 26 app manifests.
- **CIAB:** 64 JS test files (hooks, reducers, components), 4 PHPUnit files. No schema layer (no schema).

Different focuses. WAS tests config correctness; CIAB tests component behavior. Both have gaps — WAS lacks JSDOM mount tests (issue #30 tracks); CIAB lacks integration/E2E.

---

## Feature matrix

| Feature                                           | WAS | CIAB |
| ------------------------------------------------- | --- | ---- |
| Engine pluggability (multi-shell)                 | ✅  | ❌   |
| DTCG tokens.json (portable design tokens)         | ✅  | ❌   |
| iframe escape hatch (progressive migration)       | ✅  | ❌   |
| Multi-origin cascade (theme.json-style)           | ✅  | ❌   |
| JSON Schema validation                            | ✅  | ❌   |
| URL-as-state rigor                                | ✅  | partial |
| Route+content code-split pattern                  | ❌  | ✅   |
| REST preload middleware                           | ❌  | ✅   |
| View-config REST per entity                       | partial (via app config) | ✅ |
| Dashboard widget grid (first-class)               | ❌  | ✅   |
| Exportable design-system package                  | ❌  | ✅ (`@automattic/design-system`) |
| Native script modules                             | ❌  | ✅   |
| TanStack Router maturity                          | ❌  | ✅   |

---

## Verdict

**WAS bet:** declarative + portable + cascade. Strong for:
- **multi-tenant** scenarios (different shells per role / site / install)
- **brand customization** (engine + token swap)
- **progressive migration** via iframe (never stuck on unmigrated screens)
- **theme.json parity** for admin (statically validatable shell artifacts)

**CIAB bet:** filter-driven + idiomatic WP + native modules. Strong for:
- **single-shell installs** (one CIAB experience per host)
- **A8C-internal** consistency (shared design-system package)
- **performance** (preload middleware, route-level code-split)
- **plugin-author familiarity** (standard WP filter idioms)

Each is better at different goals. WAS wins on portability / customization / static-analysis. CIAB wins on performance / idiomatic-WP / component-richness. WAS is closer to a **platform** (engines, tokens, cascade); CIAB is closer to a **product** (one polished admin replacement).

---

## Cross-pollination opportunities

**Steal from CIAB into WAS:**
- Route+content code-split pattern (defer app component import until route matches; today every registered app's bundle ships eagerly).
- REST preload middleware to cut cold-mount RTTs on common entity queries.
- Dashboard-widget grid as a first-class core app (today users hand-roll).
- Exportable `@wp-admin-shell/components` package so third parties can match shell styling outside the shell.
- View-config-per-entity REST endpoint as a portable schema for entity UIs.

**Steal from WAS into CIAB:**
- JSON Schema validation of registration payloads (catch shape errors at boot, not at render).
- DTCG `tokens.json` for portable theming primitives.
- Iframe escape hatch for unmigrated screens (unblock incremental rollout).
- Multi-origin cascade for role/user customization without code changes.
- Whole-shell registration (multiple chrome variants in one install).
