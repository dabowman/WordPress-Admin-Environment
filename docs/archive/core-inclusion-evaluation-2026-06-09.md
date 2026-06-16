# WP Admin Workspaces — Core Inclusion Evaluation

> **Date:** 2026-06-09 — ARCHIVED one-time evaluation, not a living spec; the actionable findings are tracked as issues #286–#295.
> **Posture:** WordPress lead-contributor review, evaluating against core-merge norms (feature-plugin process, back-compat policy, the admin-redesign roadmap, and core's own DataViews / Design System trajectory).
> **Inputs:** full PHP/security survey (`includes/`, entry point, REST controllers), JS runtime/engine/app survey (`src/`), and project-maturity survey (docs, schemas, test suites, parity audits).
> **Follow-ups:** the actionable findings below are tracked as issues #286–#295 — see [Tracked follow-ups](#tracked-follow-ups).

## Verdict (TL;DR)

**Not mergeable as-is, but this is the most credible wp-admin replacement prototype evaluated to date, and it should enter the feature-plugin pipeline.** The architecture (config cascade, capability gating, DS-neutral kernel) is core-quality. The blockers are completeness and ecosystem questions, not design flaws: ~60% native parity with editors still iframed, no multisite, unfinished i18n for static JSON, no e2e/React-mount tests, and a plugin-extensibility story that doesn't yet answer what happens to the thousands of plugins that extend wp-admin via classic hooks. Several of its parts — especially the REST gap inventory and the settings `show_in_rest` shims — should be upstreamed to core *immediately*, independent of the shell itself.

## What it is

A React workspace shell that takes over `/wp-admin/` (at `admin_init` priority 0, gated and reversible) and renders admin screens from a declarative `workspace.json`, resolved through a six-origin cascade (`core → engine → plugin → site → role → user`) explicitly modeled on `theme.json`. Screens are DataViews/DataForm-driven native React apps where REST coverage allows, and capability-gated iframes of classic wp-admin where it doesn't. Three rendering "engines" (classic-like, single-pane mobile, experimental windowed desktop) sit behind a design-system-neutral kernel.

## Strengths

**1. The cascade and trust-tier security model is genuinely core-grade.** This is the part to defend in a core security review. Six origins merge theme.json-style with null tombstones; `role`/`user` origins are *shrink-only* — they can remove capabilities from a screen's permission set but never grow it, enforced against the merged trusted baseline with audit logging (`includes/cascade/class-wp-admin-workspaces-permissions.php`). Permissions fail closed (empty → admin-only; unknown caps reject). A hardcoded deny-list (`screens.*.permissions`, `screens.*.app`, `commands.*.invoke`, `engine`) survives even author-declared customization allowlists. Capability gating runs at four layers (region → app manifest floor → source-cap → REST), and the inline config is pruned server-side so unprivileged users never see admin IA they can't reach. The PHP survey found no missing nonces, no raw superglobals, prepared statements throughout, justified `phpcs:ignore`s. This is better security engineering than most code already in core.

**2. The kernel/engine separation is real, not aspirational.** The kernel imports no design system — verified by a CI test (`tests/runtime/kernel-no-ds-import.test.mjs`) that would catch a forbidden import. WPDS lives entirely in the engines. That matters for core because it means the admin chrome and the admin *platform* are decoupled: a future design refresh is an engine swap, not a rewrite. This is the lesson core failed to internalize with the current wp-admin.

**3. It dogfoods core's own direction.** DataViews/DataForm for every list and form screen, `@wordpress/core-data` for all data access (no raw `fetch`), DTCG tokens, `@wordpress/ui`. The six entity-CRUD apps share one scaffolding harness rather than six copies. This is what the admin redesign roadmap says the admin should look like; here it exists.

**4. Back-compat is designed in, not bolted on.** The hijack only claims root entries (`index.php`, bare `admin.php`); plugin pages (`?page=`) render classic untouched. A classic-menu bridge ingests every third-party `add_menu_page()` registration into the workspace automatically as iframed screens — Yoast, ACF, WooCommerce surface without their authors writing a line. Classic mode is one click away via a session cookie; deactivation and uninstall are clean. The iframe escape hatch is treated as a feature, which is the correct call for a transition strategy.

**5. The documentation and test discipline is exceptional for a plugin.** 43 tier-2 functional specs covering every wp-admin screen, each with a "Gaps" section that doubles as a REST rebuild ticket; ~700 PHP + ~280 JS test assertions; JSON Schema 2020-12 for every config artifact; honest parity audits in each app's `app.md`. **The screen-spec corpus alone is worth upstreaming** — core has never had a functional inventory of wp-admin this complete.

## Weaknesses

**1. Parity is ~60% native, and the hardest 40% is deferred.** The post editor and site editor are iframes — with the dirty-state bridge, in-iframe navigation, and session-expiry recovery explicitly unwired (`src/apps/editor/app.json`). `simple-editor` writes a debounced save to live published posts with no post-lock and last-write-wins concurrency. Quick Edit, Bulk Edit, status-count tabs, hierarchical page trees, the media list table, and inline comment reply are all missing — some blocked on upstream DataViews limits, some on REST gaps. A core merge that regresses Quick Edit would be rejected on day one.

**2. The plugin extensibility contract is the unanswered existential question.** The bridge handles `add_menu_page()`, but wp-admin's real extension surface is `manage_{post_type}_posts_columns`, metaboxes on list screens, Screen Options, Help tabs, `admin_notices` on specific screens, list-table filters, quick-edit hooks. None of these have a native equivalent in workspace screens; affected plugins silently degrade to iframes or lose functionality. Core cannot ship this without either a mapping API for the high-traffic hooks or an explicit, communicated deprecation — and that's a multi-year ecosystem negotiation, not a code change.

**3. Multisite is absent.** Network admin is hardcoded to classic; no network-wide config. Core ships multisite; a core admin cannot black-hole it. Acceptable for an alpha plugin, disqualifying for a merge.

**4. Private/unstable API dependencies.** It bundles `@wordpress/ui` 0.12 (pre-1.0), imports the runtime-private `@wordpress/dataviews/wp` subpath, and — the part a committer will frown at — unlocks `@wordpress/theme.ThemeProvider` by string-matching its way past `__dangerousOptInToUnstableAPIsOnlyForCoreModules` using `@wordpress/edit-site`'s allowlist consent string. It's contained (one file, one engine, graceful fallback) and the WP 7.0 version gate is handled correctly, but spoofing the private-API consent is precisely the behavior that contract exists to prevent. Were this merged into core the problem dissolves (core *is* the allowlist), but as a feature plugin it's gaming the rules.

**5. Operational gaps:** no e2e tests and no React/JSDOM mount test of the kernel (everything DOM-level is manual smoke checklists); perf baseline methodology exists but the readings table is empty (boot is a respectable 250 KiB, but DataViews pulls a 1.75 MiB vendor chunk); engine.json/workspace.json strings are untranslatable static JSON (apps work around it with `__()` label tables — fine for bundled apps, broken for third-party workspaces); RTL is untested and unmentioned; hash-based routing (`/#/posts`) where core would want real paths; and `wp-content/workspace.json` introduces a new privileged filesystem config artifact whose precedent (theme.json lives *in a theme*) core would debate.

## Benefits to core

- **It is the admin redesign, executed.** A concrete, working answer to a roadmap item that has lived in slide decks for years — with the transition mechanics (iframe fallback, classic toggle, legacy URL redirects, menu bridge) already solved.
- **It forces REST API completion.** The gap inventory is a ready-made core roadmap: count aggregates (`wp_count_posts`/`wp_count_comments` equivalents), the admin-email confirmation flow, post locks, `show_in_rest` on dozens of settings, Import/Export, Permalinks, Privacy. Closing these benefits every headless and mobile consumer, not just this shell.
- **Role-tailored admin as a platform primitive.** The cascade lets a site/agency declare per-role admin experiences declaratively with provable no-escalation — a perennial top request currently served by a fragile plugin ecosystem.
- **A canonical adoption surface for DataViews, DataForm, WPDS, and DTCG tokens**, plus real-world pressure that matures those packages.
- **A declarative extension model** (`screens`/`menu`/`commands`/JSON-schema'd manifests) far more analyzable and securable than `add_menu_page()` + echo.

## Risks to core

- **Ecosystem breakage** — the silent degradation of classic-hook extensibility (weakness #2). This is the risk that kills admin rewrites.
- **Doubled maintenance surface** during what would realistically be a 3–5 year transition where classic and workspace coexist; every admin feature lands twice.
- **New security-bearing surface**: the cascade, the REST config endpoints, and the file override are well-built, but they are a new privilege-adjacent attack surface that core security would own forever.
- **Premature foundation lock-in**: shipping on `@wordpress/ui` 0.12 and private DataViews subpaths would freeze pre-1.0 APIs the moment core ships them.
- **Performance regression risk** on low-end hosting — unmeasured cold-mount, a 1.75 MiB lazy vendor chunk, and 4–6 count-probe requests per list mount versus server-rendered list tables.

## Recommendations for adoption

1. **Enter the official feature-plugin process** (REST API and Gutenberg precedent). Target: canonical plugin with a make/core kickoff post. Do not aim at a single-release merge; aim at phased absorption.
2. **Upstream the REST gaps first, independent of the shell** — count/aggregate endpoints, settings `show_in_rest` coverage, the `new_admin_email` REST flow, post-lock REST. These are uncontroversial core Trac tickets today, and the shell's own settings shims (`run-settings-shims-tests.php`) are draft patches.
3. **Write the extensibility-parity RFC before more screens.** Decide and publish the fate of `manage_*_columns`, metaboxes, Screen Options, Help tabs, screen-scoped notices: bridge API, declarative equivalent, or deprecation. This determines whether the ecosystem follows or revolts.
4. **Land native editor mounts** (resolve the five documented edit-post/edit-site integration blockers) — iframed editors are acceptable for a feature plugin, not for merge.
5. **Stabilize the foundations in lockstep**: get `@wordpress/ui` to 1.0, make DataViews' needed exports public, and delete the `__dangerousOptIn` string-match in favor of a legitimate allowlist entry (trivial once coordinated with Gutenberg).
6. **Close the table-stakes gaps**: multisite/network design (even if "classic, by design, with a documented path"), i18n for static JSON labels (PHP-side translation pass over the resolved doc would fit the existing pipeline), RTL pass, Playwright e2e on wp-env, a JSDOM kernel mount test, filled perf baselines with CI gates, and a real-path routing plan.
7. **Converge shared app code with Gutenberg packages** — the local `Page` component and DataViews scaffolding deliberately mirror `@wordpress/admin-ui`; that convergence should be finished upstream so core ships one implementation.

**Bottom line:** the architecture has earned a seat at the table — the cascade, gating model, and kernel/engine split are decisions core should adopt even if it never adopts this codebase wholesale. The remaining work is completion (editors, multisite, tests, i18n) and politics (the extensibility contract), and the project's own documentation is honest about both. Recommend: feature-plugin track, REST contributions upstreamed now, merge conversation revisited after native editors and the extensibility RFC land.

## Tracked follow-ups

Actionable items from this evaluation that were **not already tracked** were filed as issues. Items already covered by the existing parity/upstream tracker (#139–#161 REST gaps, #162–#169 DataViews primitives, #79 native editor mounts, #30 JSDOM kernel mount, #75 entity-CRUD feature gaps) were deliberately not duplicated.

| Issue | Recommendation |
|---|---|
| [#286](https://github.com/dabowman/WordPress-Admin-Environment/issues/286) | Core-adoption path: feature-plugin proposal + phased merge plan (rec. 1–2) |
| [#287](https://github.com/dabowman/WordPress-Admin-Environment/issues/287) | Extensibility-parity RFC for classic wp-admin extension hooks (rec. 3) |
| [#288](https://github.com/dabowman/WordPress-Admin-Environment/issues/288) | Multisite / network admin design doc (rec. 6) |
| [#289](https://github.com/dabowman/WordPress-Admin-Environment/issues/289) | i18n for static JSON strings — engine.json / workspace.json labels (rec. 6) |
| [#290](https://github.com/dabowman/WordPress-Admin-Environment/issues/290) | RTL support audit + fixes (rec. 6) |
| [#291](https://github.com/dabowman/WordPress-Admin-Environment/issues/291) | Browser e2e suite — Playwright on wp-env (rec. 6) |
| [#292](https://github.com/dabowman/WordPress-Admin-Environment/issues/292) | Perf-baseline readings + CI bundle-size/perf gates (rec. 6) |
| [#293](https://github.com/dabowman/WordPress-Admin-Environment/issues/293) | Replace the private-API consent-string piggyback with a legitimate allowlist path (rec. 5) |
| [#294](https://github.com/dabowman/WordPress-Admin-Environment/issues/294) | URL scheme: real-path routing plan vs hash routing (rec. 6) |
| [#295](https://github.com/dabowman/WordPress-Admin-Environment/issues/295) | Converge `_shared/Page` + DataViews scaffolding with `@wordpress/admin-ui` (rec. 7) |
