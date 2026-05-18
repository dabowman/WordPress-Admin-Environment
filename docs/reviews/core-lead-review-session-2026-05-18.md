# WP Admin Shell — Core Release Lead Session Review

**Reviewer perspective:** WordPress core release lead evaluating for core inclusion.
**Date:** 2026-05-18
**Format:** Session-driven review covering architecture, opt-in rollout model, iframe compat scope, and extension-point trap analysis.
**Baseline:** `main` at session time; v2.0.0-beta.2 + C1/C2/C3/C4/C5 feature branches considered.

---

## Part 1 — Initial Architecture Review

### What the plugin does (scope statement)

Replaces the entire wp-admin UI with a React/Gutenberg-package shell driven by JSON config. Six-origin cascade (core → engine → plugin → site → role → user). Ships 4 demo shells. Custom hash router. Native DataViews apps for Posts/Users/Media/Comments. Iframe escape hatch for un-ported plugin pages.

Scope ≈ "Gutenberg for wp-admin chrome itself." Massive ambition.

### Architecture strengths

- **Cascade resolver** clean. Restrict-only semantics correct for multi-tenant/role overrides. Right mental model.
- **Manifest registry** (`wp_admin_shell_register_app`, `wp_admin_shell_register_engine`) gives third-party extension story.
- **Engine abstraction** decouples chrome from kernel. Plug different DS without forking core.
- **4-layer capability gate** (region → app → source → REST) defense-in-depth.
- **Test surface 1021 assertions** across PHP, schema (Ajv), runtime ESM, TS engines, parity snapshots.
- **Token system (DTCG)** ahead of curve. Aligns with where WordPress design system going.
- **No custom DB tables.** Options/meta only. Big plus for core.
- **No third-party runtime deps** outside `@wordpress/*` + ajv. Clean dep tree.

### Blockers for direct core inclusion

#### Blocker 1: Hard Gutenberg plugin dependency
`Requires Plugins: gutenberg`. Uses `@wordpress/ui` 0.12 which depends on private API allowlist Gutenberg ships. Core ships only stable packages.

**Fix path:** (a) wait for `@wordpress/ui` to graduate to public/stable, (b) backport allowlist into core, or (c) refactor to `@wordpress/components` only. (c) painful but lowest-risk for core merge. Realistically (a) — that timeline drives the merge window.

#### Blocker 2: Replaces, not augments (resolved via opt-in — see Part 2)
Original framing assumed default-on replacement. Confirmed in session: model is opt-in via admin.json presence, mirroring Site Editor rollout. Blocker downgraded to design concern (compat bridge depth).

#### Blocker 3: Private API surface
Uses `@wordpress/ui` private-APIs allowlist trick. Core code can use private APIs internally; ecosystem can't. If shell exposes private-API patterns to app authors via manifests, lock-in problem.

#### Blocker 4: PHP style mismatch
No namespaces. Class names `WP_Admin_Shell_*` (WP pre-namespace era). Modern core trends namespaced. Type hints sparse. PHPDoc-only typing.

**Fix:** Namespace migration before merge. `WP\Admin\Shell\Resolver` etc. Non-trivial but mechanical.

#### Blocker 5: Build artifacts committed (`build/`)
`.gitignore` says ignored but present. Core ships built JS via build pipeline. Need release-time build separation.

#### Blocker 6: Bundle size
408 KiB minified shell + 1.75 MiB on-demand vendors. With C5 lazy loading: 209 KiB cold mount. Still heavy. Performance regression on first paint. Need lazy loading aggressive enough that Dashboard cold load <100 KiB.

#### Blocker 7: Hash routing
`#/posts`, `#/users/{id}`. Core uses query-string routing (`admin.php?page=...`). Hash routes break wp-admin URL conventions and deep linking from third-party (notification emails, integrations). Should be History API or query-string compatible.

#### Blocker 8: i18n loading model unclear
30 app modules each potentially with strings. Per-app JS bundles need `wp_set_script_translations()` wiring. Polyglots team will flag.

### Non-blockers but address pre-merge

- **A11y audit missing.** Custom router, focus management, keyboard bindings. wp-admin a11y bar is high. WCAG 2.1 AA pass + keyboard-only QA required.
- **RTL support.** Not surfaced.
- **Browser support matrix.** Not declared.
- **Multisite story.** Network admin? Per-site overrides?
- **Customizer integration.** Customizer still ships. Shell's relationship?
- **Help tabs system.** Plugin compat layer?
- **Screen options API.** Same question.
- **Admin notices.** Third-party plugins call `admin_notices` action. Shell render channel?
- **Migration story for users.** Toggle shell on/off and saved view configs — what happens?

### Security spot check

REST permission callbacks present. Nonces wired (`wp_create_nonce('wp_rest')`). Sanitization on settings (`sanitize_file_name` with null guard). Capability gate 4-layer.

No glaring holes in inspected code. **Real security review required pre-merge** — surface area too big for skim. Especially `cascade/class-wp-admin-shell-customizable.php` (filter/restrict logic) and view-config REST (user-supplied JSON config).

### What core team will love

- DTCG token catalog.
- Schema-first config with Ajv validation.
- WP-CLI command (`wp admin-shell`).
- Documentation depth (per-app `app.md` rebuild guides).
- DataViews adoption — aligns with core direction.
- Cascade resolver model — solves multi-tenant problem core never solved.

### What core team will push back on

- Scope. Bigger than Gutenberg merge.
- Gutenberg plugin dependency.
- Maintainability of 30 bundled apps. Each is bug-report surface.
- Iframe escape hatch as technical debt commitment.
- JSON config model. Core philosophy historically against config-file-driven admin.

---

## Part 2 — Opt-In Rollout Model

### Approach confirmed in session

Shell loads only when admin.json present (or site option toggled). Otherwise classic wp-admin. Escape hatch link in shell toolbar to classic. Mirrors Site Editor vs Customizer pattern.

### What this fixes

- **Blocker 2 (replaces vs augments):** Resolved. No forced adoption. Same pattern as block themes triggering Site Editor.
- **Ecosystem compat:** Sites without admin.json untouched. Plugin authors opt in per-feature when ready.
- **Risk profile:** Massively reduced. Core ships dormant code path.

### Precedent

Site Editor model worked:
- Block theme present → Site Editor.
- Classic theme → Customizer.
- Both shipped, no merge conflict.

### Still needs solving

1. **Gutenberg dep.** Opt-in doesn't fix `@wordpress/ui` private API issue. Hard gate.

2. **Compat bridge still needed** for opted-in sites. Plugin author installs Yoast/WooCommerce → those register `admin_menu` + meta boxes. Shell must render their admin pages or iframe them. Iframe alone = bad UX. Need:
   - `admin_menu` → shell nav auto-population.
   - `add_meta_box` → shell sidebar slots.
   - `admin_notices` → shell notice region.
   - Help tabs, screen options → shell equivalents.

3. **Trigger semantics need spec.** Where does `admin.json` live?
   - Theme root? (mirrors block theme detection)
   - Plugin root? (which plugin wins if multiple?)
   - Site option? (admin toggle)
   - All three with cascade? (already designed for this)

   Recommend: site option toggle + optional theme/plugin contribution via cascade. User-controlled, not auto-triggered by file presence (avoid surprise activation).

4. **First-run UX.** User opts in → sees empty shell? Or pre-populated mirror? `wp-admin-default` shell mirrors classic — good. Make that the default opt-in target.

5. **Escape hatch design.** "Switch to Classic Admin" link must be:
   - Persistent (toolbar slot).
   - Per-session (not destructive toggle).
   - Cookie/preference based so user doesn't fight setting.

6. **Plugin compat declaration.** Plugin header like `Shell Compatible: yes` or capability check. Without it, opted-in user installs incompatible plugin → broken admin → blames core.

### Revised merge math

- **Pre-opt-in framing:** 18+ months, core leadership scope decision.
- **Opt-in framing:** 12 months feature plugin → propose merge, Site Editor cadence.

Path:
1. Feature plugin under Core (like Gutenberg was).
2. `@wordpress/ui` stabilizes parallel track.
3. Build classic-admin compat bridge as separate package.
4. Ship in 7.x as opt-in, dormant by default.
5. Default-on consideration 2-3 cycles later based on adoption.

Reframe README + governance docs around "opt-in like Site Editor."

---

## Part 3 — Iframe as Plugin Compat Bridge

**Question:** How much does the iframe escape hatch solve plugin compat?

**Answer:** ~60% coverage. Buys time. Not full solution.

### What iframe solves well

- **Plugin admin pages** registered via `add_menu_page`/`add_submenu_page`. Self-contained screens (WooCommerce reports, Yoast settings, ACF field groups). Render fine in iframe.
- **Legacy list tables.** Plugin custom post types with `manage_posts_columns` filters.
- **Plugin-owned settings screens.** Forms POST to `options.php`, work unchanged.
- **Visual parity.** User sees real plugin UI. No port required from plugin author.
- **Zero plugin author work.** Critical for adoption. Day-one compat without coordination.

### What iframe solves partially

- **Navigation.** Plugin's `admin_menu` items need surfacing in shell nav. Can scrape menu tree server-side, render in shell sidebar, target iframe on click. Works but loses sub-navigation context.
- **Notices.** `admin_notices` fire inside iframe, render inside iframe. Confined to plugin region. Loses global notice channel. Workaround: `postMessage` bridge bubbles notices to shell.
- **Auth state.** Iframe shares cookies — fine. But session expiry inside iframe = login form inside iframe = visual mess.

### What iframe does NOT solve

- **Cross-cutting plugin UI.** Meta boxes registered via `add_meta_box` on core post edit screen. Shell's native Posts editor doesn't load that classic screen. Meta boxes don't render. Yoast SEO sidebar, ACF fields on posts → invisible.
  - Mitigation: editor falls back to iframed classic edit screen when meta boxes registered. But user gets two UIs (native shell + iframed editor). Confusing.

- **Toolbar items.** `admin_bar_menu` additions don't bubble to shell toolbar.
- **Screen options + help tabs.** Render inside iframe, scoped to iframe.
- **Modal overlays from plugin.** Plugin opens jQuery dialog/modal — clipped to iframe bounds.
- **Keyboard shortcuts.** Shell binds `cmd+k`. Plugin inside iframe binds same. Conflict.
- **Deep links.** Notification email links to `wp-admin/admin.php?page=woo-orders&id=123`. Shell needs to detect, route to iframe with that URL.
- **Print, file downloads, redirects.** CSV exports from WooCommerce reports might break.
- **Performance.** Iframe = second WordPress page load. Full bootstrap, full enqueue, full admin CSS.
- **iframe height management.** Plugin pages have variable height. ResizeObserver or postMessage from plugin required.
- **Same-origin styling collisions.** Shell can't theme iframe content via parent CSS.

### Honest compat coverage table

| Plugin type | Iframe coverage |
|---|---|
| Self-contained settings page | 95% — works |
| Custom post type admin | 80% — list works, edit screen partial |
| Meta boxes on core posts/pages | 10% — fundamental mismatch with native editor |
| Toolbar/admin-bar additions | 0% — iframe scoped |
| Cross-screen UI (notices, modals) | 30% — confined |
| Dashboard widgets | varies — needs classic-dashboard mode for compat |
| Block editor extensions | 0% — different problem entirely |
| WooCommerce-tier complex plugins | 50% — major flows work, integrations break |

### Iframe = transition layer, not destination

Buys 2-3 years for ecosystem to port. Strategy:

1. Ship shell with iframe fallback day one. Everything that isn't ported = iframed.
2. Define shell-native APIs (region slots, notice channel, toolbar slots, meta box equivalents).
3. Top 50 plugins port natively over time.
4. Long tail stays iframed indefinitely.

### Recommendation for spec

Document iframe as **explicit transition mechanism** with known limitations. Three tiers in compat doc:

- **Tier 1: Shell-native** — plugin uses shell APIs, full integration.
- **Tier 2: Iframe-compat** — plugin works embedded, no shell theming.
- **Tier 3: Classic-only** — plugin requires classic admin. User must switch via escape hatch.

Plugin Check could detect tier. Plugin author declares supported tier in header.

**Critical:** Top 20 wp-admin extension patterns (meta boxes especially) need shell-native equivalents within first stable release.

---

## Part 4 — Anti-Trap Analysis (Block Editor Lesson)

**Concern raised in session:** Block editor introduced trap where serialized markup + render-time extension filters made content non-deterministic. Database value insufficient to know final output. Browser/full-stack boot required for any reliable manipulation. Maintainability nightmare at scale.

**Question:** Does shell repeat this trap?

### Block editor trap diagnosis

Two compounding failures:

1. **Serialized markup as canonical store.** Block content lives in `post_content` as HTML+comments. Source of truth is parsed result.
2. **Non-deterministic extension points.** `BlockEdit` filters, `blocks.registerBlockType` filters, deprecations, block bindings, pattern overrides, `render_block` filters mutate the rendering pipeline. Plugin can change what block A means at render time.

Result: to reliably know what a post will render as, you need full WordPress + active plugin set + JS runtime. CLI tools that mutate content can't trust their work.

Root cause: business logic distributed across (markup + plugin code + plugin config + render filters). No single canonical representation.

### Does shell repeat it?

**Lower risk overall. Real risk in specific places.**

### Where shell is safe

- **Data model unchanged.** Posts, users, options, meta — all standard WordPress tables. Shell doesn't introduce new serialized blob storage. CRUD remains REST-shaped. `wp post update` works regardless of shell.
- **Forms POST to standard endpoints.** Settings form → `options.php`. Posts save → `/wp/v2/posts`. Database mutations go through existing core paths. Audit trail intact.
- **No shell-only data.** No "shell post content" parallel to `post_content`. Big plus.

### Where shell introduces block-editor-style risk

#### Risk 1: View configs as opaque JSON
Cascade resolver outputs merged JSON config. Includes view-configs (C2 feature) — which fields show, with which filters, in which order. Stored in option/meta. If business logic seeps in ("ship date column hidden for editors role"), then:
- Database value of post is fine.
- But what user *sees* depends on resolved cascade.
- Two admins with different role configs see different field sets, take different actions.

**Mitigation:** Keep view-config strictly presentational. **Never let view-config affect what gets saved**, only what gets shown. Document hard line. Enforce via schema validation.

#### Risk 2: Plugin-registered apps
`wp_admin_shell_register_app()` lets plugin contribute new app. App is React component. Plugin can have app that:
- Reads post meta.
- Writes post meta in custom shape.
- Renders meta as UI primitive that only that app understands.

If plugin app stores serialized JSON in `wp_postmeta` representing custom workflow state, you've recreated the trap.

**Mitigation:** Same risk WordPress already has with `update_post_meta`. Not shell-specific. But shell could *encourage* the pattern. Guidance: "store structured data via REST schemas with `register_post_meta` + `show_in_rest`, never opaque blobs."

#### Risk 3: Field collections (C2) custom render
Plugins register field type "approval-workflow" — UI renders fine in shell, value stored as JSON in post meta. Other tools see opaque JSON.

**Mitigation:** Field collections must register **schema** alongside renderer. Schema validates and documents shape. `wp post meta get` returns structured data. CLI/automation reads schema, knows shape, can mutate safely.

#### Risk 4: Region routing tied to data
If a route only resolves with shell loaded (`#/workflow/approve/{id}`), deep links from external systems must boot shell.

**Mitigation:** Every shell route must have classic-admin equivalent OR REST endpoint equivalent. Test: "can I drive this action from `wp-cli` or `curl`?" If no, route is a trap.

#### Risk 5: Cascade origin precedence ambiguity
6-origin cascade is deterministic given inputs. But debugging "why does user X see field Y" requires replaying cascade.

**Mitigation:** WP-CLI command `wp admin-shell resolve --user=X --route=/posts` that prints fully merged config with origin attribution. Already partially exists. Make bulletproof. Document as primary debugging tool. Same model as `wp theme.json` for global styles.

### Where shell is architecturally better than block editor

- **No client-side parsing of canonical data.** Shell reads from REST. REST is the contract. Block editor parses `post_content` HTML which is fragile.
- **No deprecation chains.** Block deprecations are nightmare. Shell components don't store version-specific markup in DB.
- **Schema-first config.** Ajv validation on admin.json. Block editor has block.json schema but not on stored content. Big advantage.
- **No render filters on storage.** `render_block` mutates output at render time, divorced from stored bytes. Shell doesn't have equivalent — what's in option is what gets resolved.

### Anti-trap principles to codify

Worth writing into design spec as a foundational doc:

1. **Database is canonical. Shell is presentation.** Any plugin that stores business logic in shell config (not just presentation) is misusing surface.

2. **Every action has REST equivalent.** If shell can do it, CLI/API must too. No shell-exclusive mutations. Acceptance criterion for app inclusion.

3. **Schemas mandatory, not optional.** Field collections, view configs, app manifests, custom post meta — all require JSON schema. Schema is contract.

4. **No opaque blobs in meta from shell apps.** If app needs custom storage, declare via `register_post_meta` + `show_in_rest: true` + schema. Reject pattern of `update_post_meta($id, '_my_app_state', json_encode($complex))`.

5. **Cascade resolution is reproducible.** Given (origins, user, role, route), output is deterministic. WP-CLI tool replays it. No hidden state. No render-time mutation.

6. **Extension points return data, not components.** Plugin registers field *schema* + renderer separately. Renderer can be anything; data shape is schema-locked.

7. **No filter that mutates stored values during read.** Block editor's `render_block` is read-time mutation — bytes in DB don't match bytes shown. Shell must prohibit equivalent.

8. **Versioning explicit.** admin.json `version: 1`. Migrations explicit, versioned, reversible. No silent schema drift.

9. **Audit log surface.** Shell action → REST call → log. Existing WP audit patterns sufficient. Don't introduce shell-private mutation paths.

10. **Headless test requirement.** Every shell feature must be exercisable without browser. `wp admin-shell exec --app=posts --action=trash --id=42`. If can't, feature is a trap.

### Honest assessment

Block editor trap = **canonical data in serialized non-schema'd format + render-time mutation by extensions**.

Shell trap (if it happens) = **business logic in cascade config or plugin-app-private meta + extension renderers that don't expose schemas**.

Lower probability than block editor because:
- Data layer untouched.
- REST contracts mandatory.
- Schema-first culture already in spec.

Possible because:
- 30 apps + plugin-contributed apps = wide extension surface.
- Custom meta storage encouraged by easy UI building.
- View configs could leak into business semantics if not policed.

**Recommendation:** Write explicit "Anti-Trap Principles" doc before merge. Reviewer for each new app + extension point checks against principles. Maintainability concern is more cultural than architectural — block editor had architecture for safety but culture allowed render filters and serialized blobs to proliferate. Shell needs culture from day one.

---

## Summary

### Verdict

Architecturally sound. Code quality above WP ecosystem average. Vision aligns with WordPress trajectory. Distance from core-ready: ~12 months serious work as feature plugin + core leadership greenlight on scope.

Genuine contender for core. Not 6.9 or 6.10. Plausibly 7.0–7.2 era if Core leadership commits.

### Path to core merge

1. **Promote to Core Feature Project.** Owned by Core Editor team or new Admin team. Multi-release horizon.
2. **Resolve `@wordpress/ui` stabilization** as gating dep.
3. **Build wp-admin compat bridge** — `admin_menu`, `add_meta_box`, screen options, admin notices, help tabs. Without it, ecosystem breaks day one.
4. **Namespace PHP** to `WP\Admin\Shell\*`. Add `declare(strict_types=1)` and PHP 8.1 type hints. PSR-12.
5. **A11y audit** with WPCampus/a11y team review.
6. **Performance budget** — first paint <100 KiB. Code-split aggressively.
7. **History API routing** with classic-URL fallback. Drop hash router.
8. **Multisite + Network Admin design** before scope creep blocks merge.
9. **Security audit** by core security team.
10. **Field trial** as feature plugin for 2 cycles (12 months minimum) with real-world plugin compat testing.

### Critical concerns addressed in session

- **Opt-in rollout via admin.json presence:** Confirmed sound. Mirrors Site Editor precedent. Removes default-on risk.
- **Iframe as compat bridge:** Solves ~60%. Necessary but not sufficient. Shell-native APIs for top 20 wp-admin extension patterns required for first stable release.
- **Block editor trap (extension-point business logic leakage):** Lower probability than block editor due to schema-first culture and untouched data layer. Real risk in view-configs, plugin-registered apps, field-collection custom renderers. Codify Anti-Trap Principles as foundational doc.

### Open questions for core leadership

1. Will `@wordpress/ui` graduate to stable in time for the proposed merge window?
2. Is core willing to ship Gutenberg-plugin-equivalent private API allowlist in core?
3. Does core leadership commit to multi-release shell rollout (Site Editor cadence)?
4. Who owns the compat bridge package? Core team or shell team?
5. Multisite + Network Admin scope for v1 merge or deferred?
6. What's the deprecation timeline for classic wp-admin once shell ships?

---

*Generated 2026-05-18 by core-lead review session. Companion to `core-lead-review-2026-05-18.md` (initial baseline review).*
