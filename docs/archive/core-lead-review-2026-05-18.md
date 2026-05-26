# WP Admin Shell — Core-Lead Architecture Review

**Reviewer perspective:** WordPress core lead evaluating for inclusion in core.
**Date:** 2026-05-18
**Baseline reviewed:** v2.0.0-beta.2 (`147011c` on `main`) plus `feat/c2-view-config` + `feat/c5-lazy-app-loading` branches.
**Scope:** kernel runtime + config artifacts (admin-v2 / admin-app-v2 / admin-engine-v2 schemas, cascade resolver, region renderer, routing, theme host, manifest registry, view-config). Bundled apps + demo shells out of scope per request.

---

## Summary

Strong architecture. Three-artifact separation (`app.json` / `engine.json` / `admin.json`) maps cleanly onto WordPress precedent (`block.json`/`theme.json`). Kernel DS-neutrality is the standout decision — verified by code, not just doc. Cascade resolver mirrors `WP_Theme_JSON_Resolver` faithfully w/ trusted vs consumer phases + tombstoning + restrict-only customizable enforcement. URL-as-state routing eliminates the HTML-attribute overload trap. View-config + field-collections cascade adopts CIAB primitives cleanly.

Not core-ready as-is. Three hard blockers + several specification gaps below. Direction sound; execution above plugin norm.

---

## What works

- **Boundary discipline** (`src/runtime/kernel.js`, `src/runtime/regions/Region.js`, `src/runtime/styles/ThemeProviderHost.js`). Kernel never imports `@wordpress/ui`, `@wordpress/icons`, `--wpds-*`, or chrome class names. ThemeProvider seam at `ThemeProviderHost.js:185-213` w/ error boundary + WPDS fallback. Engine ships `Component` + optional `ThemeProvider` + `compileStyles` + `iconTable`. Material/Tailwind engine can ship complete alt DS without kernel mods. Real, not marketing.
- **Cascade two-phase merge** (`includes/cascade/class-wp-admin-shell-resolver.php:96-124`). Trusted origins (core/engine/plugin) authoritative — omission = tombstone. Consumer origins (site/role/user) additive + `customizable` gated. Restrict-only enforced by tombstone-survives-additive-merge. `WP_Admin_Shell_Merge::merge_keyed_arrays` lifted straight from theme.json playbook. Solid.
- **Region vocabulary** (`docs/schemas/admin-v2.json:151-252`). `role` (ARIA) + `layout` (CSS allowlist) + `platform` (browser-analog services) + `routing` (URL participation). `display` excluded from layout vocab — engine owns layout context. Logical-property-first (`inline-size`/`block-size`). Schema rejects `app` xor `routing.route-key` violation via JSON-Schema `not`/`allOf`; runtime confirms post-merge in `validateRegion.mjs:51-76`. Schema + runtime agree; schema wins on disagree. Good two-belt enforcement.
- **URL routing** (`src/runtime/routing/router.js`, `src/runtime/routing/matchRoute.mjs`). Hash + Navigation API w/ `navigatesuccess`. Most-specific-wins scoring (`specificity()` literal+10 / param+1 / wildcard−1) matches PHP `WP_Admin_Shell_Manifest_Resolver::match_route`. Plain `<a href>` works; middle-click / cmd-click / copy-link unbroken. URL is full state. No HTML-attribute overload. Right call.
- **Cache hash-keying** (`includes/cascade/class-wp-admin-shell-cache.php:80-91`). Key = `md5(shell + shells_mtime + site_opt + role_opt + user_id + user_prefs + user_roles)`. Mtime-driven invalidation makes stale-cache impossible by construction. Hook fan-out on plugin/theme/role/option events covers belt-and-suspenders.
- **Cap gate** (`src/runtime/capabilities/shouldRenderRegion.mjs`, `userCan.js`). Region fast-path drops subtree before mount → `app` + nested `regions` skipped without evaluating. Optimistic-render policy (cap-not-in-map = render). REST is authority. Mirrors core-data's `canUser` contract.
- **DTCG token resolver** (`src/runtime/tokens/tokensResolver.mjs`). Group-`$type` inheritance, 16-deep alias chain w/ cycle guard, 8 leaf+composite types coerced. Sane "emit empty + warn" on unhandled composite — refuses to dump `[object Object]` into CSS.
- **843 assertions, real coverage.** PHP via `wp eval-file` (no PHPUnit ceremony) + Node ESM via plain test scripts. Schema sweeps via Ajv. No jest-mock theater. Right shape for core inclusion.

---

## Blockers for core inclusion

### 1. Hard runtime dependency on Gutenberg plugin

`src/runtime/styles/WpdsThemeProvider.js` piggybacks on `@wordpress/edit-site`'s `__dangerousOptInToUnstableAPIsOnlyForCoreModules` allowlist to unlock `@wordpress/theme.privateApis.ThemeProvider`. WP 6.9 core's allowlist excludes `@wordpress/theme`. Plugin declares `Requires Plugins: gutenberg`. Cannot ship to core as currently architected.

Two valid paths:

- `@wordpress/theme` graduates to public API in core. Gutenberg-side work, not shell-side. Confirm timeline w/ Riad before claiming core-ready.
- WPDS engine demoted from default → optional. Kernel ships w/ no bundled engine. Either core itself adopts a different default engine, or shell ships its own default that doesn't depend on Gutenberg internals.

The kernel-DS-neutrality work is precisely what makes path 2 viable. Worth landing both contracts in parallel.

### 2. Hash-only router

`router.js:54-105` listens on `hashchange` + Navigation API. URLs are `#/posts?detail=/posts/42`. Plugin-context appropriate (no server config needed). Core-context inappropriate — wp-admin URLs are History API today; `/wp-admin/shell/posts/42` is the only acceptable shape for core.

Migration needs:

- PHP-side route registration (rewrite rules) so refresh hits `index.php?wpas_shell=posts/42` cleanly
- `pushState`/`replaceState` in `navigate()` instead of `location.hash` writes
- `popstate` listener instead of/in addition to `hashchange`
- Anchor `<a href>` emission switches from `#/path` to absolute paths

Not hard, but it's a `target="_blank"` correctness audit + middle-click + bookmarking matrix. Plus the rewrite-rules layer is a different reviewability surface (security, conflict w/ existing rules).

### 3. Schema URLs not hosted

Schemas claim `$id: "https://schemas.wp.org/admin/v1.json"` but live at `docs/schemas/admin-v2.json` in-repo. IDE tooling needs the canonical URL resolvable. block.json + theme.json have hosting + a versioning policy + a dev-notes-on-bump convention. Pre-core: hosting at `schemas.wp.org` and a `v1.json` that matches the WP release at the moment of inclusion. The plugin's `$wpds` pinning pattern (`admin-v2.json:24-28`) is exactly the precedent core needs to follow — but it requires the schema to live somewhere committed-to.

---

## Specification-level concerns

### Manifest validator duplication

`includes/manifests/class-wp-admin-shell-manifest-validator.php:38-55` reimplements a JSON-Schema subset in PHP — required fields + type + pattern + min + min_props. Same constraints expressed declaratively in `admin-app-v2.json` + `admin-engine-v2.json`. Two sources of truth.

Three options, in order of preference:

1. Adopt a vendored JSON Schema library (`opis/json-schema`). Yes, Composer dep — block.json shipped without it; theme.json shipped without it; both regret it. Core has been resisting JSON Schema libs for years and the rot shows.
2. Codegen the PHP validator from the canonical schema at build time. Single source of truth, no runtime dep. Reasonable middle path.
3. Document the PHP validator as deliberately a strict subset, list which schema constructs are *not* enforced PHP-side. At least make the drift explicit.

Status quo (silent drift) is the worst option.

### `@wordpress/data` not used for kernel state

`src/runtime/kernel-context.js` exposes `{registry, config, engineSource, dynamicChildrenStore}` via plain React context. `router.js` uses `RouteContext` / `useState`. No `createReduxStore`. Apps consume via `useKernel()` / `useRoute()`.

For a kernel that *is* the framework, plain React context is defensible (less ceremony, no store registration). For inclusion in core where ecosystem consistency matters: the rest of the platform reads state via `useSelect(coreStore)` / `useSelect('core/editor')`. Outside contributors will look for `core/admin-shell` store and not find it. Either add a thin `@wordpress/data` adapter over the same state, or document the rationale prominently.

Not a DS leak — `@wordpress/data` is framework-primitive, not DS. Already in CLAUDE.md's DS-leakage exclusions list. No tension with kernel neutrality.

### `bindings` conflict resolution underspecified

`admin-v2.json:381-396` — `bindings[]` is a flat array. Spec §8 says "later entries override earlier" + "cascade-aware: user > role > site > plugin > core". Two plugins both at `plugin` origin both bind `Mod+K`: which wins? Registration order is the de-facto answer, which is registration-time-of-day dependent.

Either:

- Add a `priority` field on bindings entries
- Origin-tag bindings during cascade (already done for keyed arrays via `__origin` in `WP_Admin_Shell_Merge::tag_origin`) and apply explicit precedence at consume time
- Document the order-of-registration semantics as part of the contract

theme.json hit the same problem w/ section styles. Don't repeat it.

### `fieldsModule` reserved field

`admin-v2.json:636-639` accepts `fieldsModule` field that runtime explicitly ignores w/ a one-time dev warning. Forward-compat for native Script Modules pipeline. WP Script Modules shipped in 6.5+; the pipeline exists. Either wire it now or remove from schema until the wiring lands. Schema-as-contract should not include declared-but-inert fields — invites bugs where authors think it works.

### Manifest discovery runs every `init`

`includes/manifests/class-wp-admin-shell-manifest-registry.php:195-229` — `discover()` calls `scandir()` + `is_file()` + `validate()` per app/engine dir, per request. Validator caches per (path, mtime). Without a persistent object cache (default WP install), each page load = N file reads.

For core: invalidate-on-plugin-activation + cache the index. `add_action('activated_plugin')` already wired for the cascade cache; same hook should refresh manifest index. The hash-keyed cache layer is the right precedent.

### Cap precomputation surface

`window.wpAdminShell.capabilities` — PHP walks the resolved config for declared `capability` fields, evaluates `current_user_can($cap)`, ships JSON map. Good for declared meta-caps. **Doesn't cover per-object caps** (`edit_post($id)`, `delete_user($id)`).

Spec §11 acknowledges via async `checkCan()`. core-data's `canUser` already solves per-object caps via REST `OPTIONS`. App-layer responsibility. Fine boundary — but spec should make division explicit:

- Shell-level cap floor (declared in admin.json `regions[].capability` + manifest `capabilities[]`): precomputed, sync.
- Per-object cap (`edit_post(42)`): app must use `core-data.canUser` async.
- Sensitive-content rendering: app responsibility to gate behind cap-resolved state, NOT shell-optimistic-render.

Today's CLAUDE.md and spec treat optimistic-render as the default contract. Fine for chrome/affordances but DANGEROUS for content. A "shell never renders sensitive content optimistically" guideline belongs in the spec.

### Cache key entropy

`includes/cascade/class-wp-admin-shell-cache.php:90` — `substr( md5(...), 0, 16 )` = 64 bits. Single-tenant: fine. WordPress.com / WP Engine multi-tenant: 64 bits across millions of users for a key that lives 5 minutes = ~zero collision probability in practice but no upside to truncating. Drop the `substr()`.

### Customizable introspection

`includes/cascade/class-wp-admin-shell-customizable.php` enforces writes but exposes no public read surface — downstream UI cannot ask "is this slot customizable?" before rendering an edit affordance. v2 prefs UI is going to need it. Add `WP_Admin_Shell_Customizable::is_writable( $upstream_entry, $path )` as a public predicate so the user-prefs surface stops needing to guess.

---

## Minor / nits

- `src/runtime/kernel.js:97-153` — region resolution loop blends three concerns (cap fast-path, template resolve, validation, sanitization, honored-platform warn). Worth a `composeRegion()` helper so the kernel mount is two lines of orchestration. Will help the inevitable kernel-refactor reviewer.
- `Region.js:258-275` — modal closed-but-rendered `display:none` for side-effect children. Documented, but ugly. Right factoring hoists `useCommandLoader` outside the modal. v1.x cleanup target.
- `class-wp-admin-shell-resolver.php:158-165` — empty-baseline skip when plugin doc declares engine. Comment helpful, code clear. But the v1-vs-v2 baseline-injection branch logic is the kind of thing that drifts. Test coverage exists (`run-shape-tests.php` 111 assertions). Keep watching.
- `tokensResolver.mjs:27` — `MAX_ALIAS_DEPTH = 16` hard-coded. Reasonable default but make it overridable for engines that want deeper alias chains (Material Design w/ 5-tier elevation refs hits this fast).
- `admin-v2.json` `$defs/region` schema doesn't enforce that nested `regions` keys not collide w/ template-supplied children. Schema can't enforce cross-doc; runtime should warn. `resolveRegion.mjs:131-134` silently does `Object.assign(merged, d)` — declaration's child overrides template child whole-cloth. Spec §5.5 documents this; consider adding a debug log when collision is detected so authors know the template-child contribution was replaced.
- `admin-engine-v2.json:130-132` — `default-styles` engine origin in cascade between `core` and `plugin`. Good. But the schema's restriction to `theme/chrome/color/border/dimension/elevation/font` (no `regions`/`applications`) is enforced only by `additionalProperties: false`. PHP `WP_Admin_Shell_Resolver::engine_origin` doesn't enforce — accepts whatever the manifest declared. Tighten PHP-side or document the no-op.
- `viewConfigField.type` enum in `admin-v2.json:518-520` — `text|datetime|number|integer|boolean|media|select|url|email`. DataViews owns the canonical type system. Drift risk when DataViews adds a type. Either reference DataViews' canonical list or accept-and-pass-through w/ validation deferred to consume site.

---

## On the question core would ask: "could we adopt this?"

Architecture: yes. Three-artifact split + cascade resolver + URL-as-state + kernel DS-neutrality are all the right calls. None of them require core to bless `@wordpress/ui` as the One True DS — that's the point.

Implementation: ~2 quarters of work. Blockers (Gutenberg dep, hash router, schema hosting) are concrete + scoped. Spec gaps (binding conflict, customizable introspection, sensitive-content contract) are doc-level + small.

Politics: the bigger question. Spec calls itself "the shell layer"; core would call it "another React admin." Pitch matters. The CIAB-primitives integration thread (memory `project_ciab_primitives_integration`) is the actual lever — view-config + field-collections adoption means CIAB's screens become portable here. That's the leverage for core inclusion, not "wp-admin replacement."

Stop calling it a wp-admin replacement. Start calling it the shell substrate every other admin React surface already needs.
