# Feedback, Feature Requests & To-Dos

Running log for things we notice across sessions. Capture first, triage later. Nothing here is committed work — items move to specs, plans, or commits when promoted.

## How to use

- **Add freely.** When something comes up mid-session — a bug, a paper cut, a feature idea, a doc gap — drop it in `## Inbox` with a date. Don't gate on detail.
- **Triage in batches.** Periodically move Inbox items into `## Triaged` with a status: `now`, `next`, `later`, `won't do`. Add a one-line rationale.
- **Promote when ready.** When a triaged item gets picked up, move it to `## In progress` with a link to the branch / spec / PR. Move to `## Done` once shipped (with commit SHA or PR link). Prune Done items quarterly.
- **One item = one bullet.** Sub-bullets only for context the bullet can't carry alone.

Format per item:

```
- [YYYY-MM-DD] [type] short title — one-line description. (source: who/where, optional)
```

Types: `bug`, `feat`, `chore`, `doc`, `design`, `perf`, `a11y`, `dx`.

---

## Inbox

_New items land here. No triage yet._

- [2026-04-30] [feat] Nav items that drill down AND navigate — clicking a screen-style item should optionally route to an app at the same time it slides to its sub-screen. Example: clicking "Design" navigates to the site editor and opens the Design sub-menu in one action. Today `screen` items only drill down; `app`/`href` items only navigate. Need a combined mode (e.g. `{ "screen": "design", "app": "site-editor", ... }` — clicking triggers both `navigate()` and screen push).
- [2026-04-30] [bug] EditorApp empty-content rejection — new-post flow in `EditorApp.js` doesn't seed placeholder block markup, so REST API rejects with `Content, title, and excerpt are empty`. SimpleEditorApp already seeds `<!-- wp:paragraph --><p></p><!-- /wp:paragraph -->`. Mirror fix when EditorApp is next touched.
- [2026-04-30] [chore] `@wordpress/ui` overlay components blocked on WP 6.9 — `Notice`, `Tooltip`, `Popover`, `Dialog`, `AlertDialog`, `Drawer`, `IconButton`, form `Select`/`Autocomplete` all transitively pull `@wordpress/theme`, which isn't in the `wp.privateApis` allowlist. Currently using `@wordpress/components` fallbacks. Re-evaluate when WP core allowlists `@wordpress/theme` (track upstream).
- [2026-04-30] [feat] developer-admin "Design" decomposition — drill-down screen exposing `core:posts` over `wp_template` / `wp_block` / `wp_navigation` plus a Styles iframe with chrome hidden. Replaces monolithic site-editor iframe. (source: design memo 2026-04-29)
- [2026-04-30] [doc] Tokens.json primitives layer — three-tier design system w/ proposed `tokens.json` aliased into both `admin.json` and `theme.json` is in master spec but no implementation sketch yet. Need worked example before we can validate the cascade.
- [2026-04-30] [feat] Region+app+layout-engine extension model — pluggable layout engines per region (token contract = engine contract). Master spec describes; needs concrete first non-default engine to prove the boundary.
- [2026-04-30] [feat] 5-origin cascade w/ restrict-only overrides — config resolution order (core → plugin → theme → site → user) with parents able to lock keys against descendants. Master spec describes; resolver in `src/config/resolveConfig.js` is still flat-v0.
- [2026-04-30] [feat] Post settings panel for SimpleEditorApp — featured image, taxonomy, excerpt, scheduling deferred from MVP. Substack-style editor needs a Notion-style side panel before it replaces full EditorApp.
- [2026-04-30] [bug] Recurring code-review patterns — null guards, state refresh after mutations, icon name string mismatches keep showing up. Consider lint rule or pre-commit check for `iconMap.js` keys.
- [2026-04-30] [bug] Selection REST `set_one()` accepts unbounded payload — `includes/class-wp-admin-shell-selection-rest.php:78–88` writes `$value` straight to user_meta with no size cap or shape validation. Authenticated user can stuff arbitrary blobs into own user_meta via repeated POSTs. Per-user gated so blast radius is self-DoS only, but cap (~64KB) before M5 prod readiness pass. (source: M1 review)
- [2026-04-30] [a11y] Selection REST `permission_check` is `is_user_logged_in()` only — `includes/class-wp-admin-shell-selection-rest.php:62`. Selection writes hit own-user meta so isolation holds, but flag for M5 four-layer cap-gating pass. (source: M1 review)
- [2026-04-30] [a11y] Drawer region missing `role="dialog"` / `aria-modal` / focus trap — `src/runtime/regions/drawer-region/index.js`. Aside has only `data-region-id`. M5 a11y checklist (b) calls for `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on overlay regions; drawer should follow same rule. Track in M5. (source: M1 review)
- [2026-04-30] [perf] Drawer region keydown listener re-binds on every render — `src/runtime/regions/drawer-region/index.js:37` puts `cfg.dismissOn` (object) in deps array, so identity changes re-run effect. `useMemo` over `normalizeDismiss(cfg.dismissOn)` cleaner. Trivial. (source: M1 review)
- [2026-04-30] [chore] Selection scope regex excludes `:` — `includes/class-wp-admin-shell-selection-rest.php:38` route pattern `[A-Za-z0-9._-]+` blocks future namespaced scopes (e.g. `posts:selection`). Loosen when M2 needs it. (source: M1 review)
- [2026-04-30] [dx] `persist.js` swallows errors silently — intentional + commented in `src/runtime/selection/persist.js:44/61/75`. Optional `console.warn` behind dev flag would aid debugging. Not a bug. (source: M1 review)
- [2026-04-30] [perf] CommandPickerApp re-registers all commands on any config change — `src/runtime/apps/CommandPickerApp.js:64` effect deps include full `config.applications` array. Inexpensive but narrow to a stable key (e.g. ids hash) if config churn becomes hot. (source: M1 review)
- [2026-04-30] [chore] PreviewPaneApp hardcodes `content.selection` scope — `src/runtime/apps/PreviewPaneApp.js:12` defaults `follow` to `'content.selection'`, assuming single-content-region layout. Parameterize in M4 when multi-region preview ships. (source: M1 review)
- [2026-04-30] [chore] JS `normalizeV0` shim still wired post-M2 — `src/runtime/kernel.js:5,38` imports + calls `normalizeV0(rawConfig)` even though `includes/origins/class-wp-admin-shell-origin-core.php:23–147` already normalizes server-side. Plan §M2.11 said the JS shim retires once core origin handles it. Currently runs twice (idempotent, harmless). Drop the JS import + call, or document the belt-and-suspenders intent. (source: M2 review)
- [2026-04-30] [chore] `WP_Admin_Shell_Merge::is_assoc()` dead-code ternary — `includes/cascade/class-wp-admin-shell-merge.php:242` has `is_array( $arr ) && ! empty( $arr ) ? false : false` (both branches return `false`). Upstream guard at line 241 already handles empty/non-array. Simplify to `return false;`. (source: M2 review)
- [2026-04-30] [doc] Cascade filters skipped on cache hit — `includes/cascade/class-wp-admin-shell-resolver.php:33–36` returns cached resolved tree directly; `wp_admin_shell_data_{origin}` and final `wp_admin_shell_data` filters do not re-run on warm reads. Standard cache tradeoff (theme.json resolver behaves same), but document so plugin authors know filter changes need a cache flush. (source: M2 review)
- [2026-04-30] [bug] Plugin activation/deactivation doesn't flush cascade cache — `includes/cascade/class-wp-admin-shell-cache.php:121–129` defensive flushes only fire on cascade-origin option/meta writes. Third-party plugin newly hooking `wp_admin_shell_data_*` filter won't apply until next natural invalidation. Add `register_activation_hook`/`deactivation_hook` flush, or document workaround. (source: M2 review)
- [2026-04-30] [chore] M5 migration write-copy idempotency — plan §M2.9 calls for copying MVP `wp_admin_shell_active_config` into v1 `wp_admin_shell_active_shell` on plugin upgrade. M2 only does read-fallback (`includes/cascade/class-wp-admin-shell-resolver.php:142–145`); the write-copy belongs to M5 settings-page upgrade path. When implemented, verify idempotency — currently nothing prevents drift if MVP code path keeps writing the legacy key. (source: M2 review)
- [2026-04-30] [doc] Plan vs implementation file layout — plan describes flat `includes/class-wp-admin-shell-resolver.php`; actual is `includes/cascade/` + `includes/origins/` subdirs. Subdir layout is clearer; update plan §M2 source-layout block + CLAUDE.md project-structure to match. (source: M2 review)
- [2026-04-30] [perf] Resolver lacks request-scope memoization above cache layer — `includes/cascade/class-wp-admin-shell-resolver.php:resolve()` hits the WP_Object_Cache layer on every call. Cache hit ~0.2ms is fine, but a static memo inside `resolve()` zeros that cost if the function is called multiple times per request. (source: M2 review)
- [2026-04-30] [chore] One origin class instead of five — plan §M2 source-layout calls for `includes/origins/{core,plugin,site,role,user}.php`. Actual: only `core.php` exists; plugin/site/role/user inlined as private methods in resolver. Functionally equivalent; either keep inline (and update plan) or split out for parity with theme.json's `WP_Theme_JSON_Resolver`. (source: M2 review)
- [2026-04-30] [bug] Compat-bridge color parser rejects 8-digit hex + `rgba()` — `src/runtime/styles/compatBridge.js:46–70` `parseColorToRgb()` handles `#fff`, `#3858e9`, `rgb()` only. If WPDS or theme.json resolves brand strong to `#3858e9ff` or `rgba(...)`, parser returns null and both `--wp-admin-theme-color--rgb` + `--wp-admin-theme-color-darker-20` silently drop. Compat bridge degrades without warning. (source: M3 review)
- [2026-04-30] [bug] DTCG alias resolver has no cycle detection — `src/runtime/styles/compileStyles.js:122–147` `resolveValue()` recurses through `{styles.path}` references with no visited-set or depth limit. Author config `a: '{styles.b}'` + `b: '{styles.a}'` causes stack overflow at runtime. Add visited-set + console warn + raw-string fallback. (source: M3 review)
- [2026-04-30] [chore] Slot-path collision in `pathToWpds()` — `src/runtime/styles/compileStyles.js:114–115` joins all path segments with `-`, so `a.bc` and `a-bc` both emit `--wpds-a-bc`. Author trust mitigates but no validation. Detect on emit + warn. (source: M3 review)
- [2026-04-30] [bug] Density attr not cleared on shell-switch when new shell omits density — `src/runtime/styles/density.js`. If shell A declares `compact` and shell B omits `styles.density`, `data-wpds-density="compact"` may persist. Verify default branch overwrites to `default` or removes attr. (source: M3 review)
- [2026-04-30] [chore] Token style tag not removed on kernel unmount — `src/runtime/styles/emitTokens.js` reuses `<style id="wp-admin-shell-tokens">` via `textContent` overwrite. No `.remove()` on unmount. Idempotent in normal use; multi-shell hot-reload could leave stale tokens between mounts. (source: M3 review)
- [2026-04-30] [chore] Chrome defaults seeded twice in PHP + JS, byte-for-byte parallel — `src/runtime/config/normalizeV0.js:124–183` and `includes/origins/class-wp-admin-shell-origin-core.php:153–215` `v0_styles_from_branding()` are mirrored. Easy to drift; change one, forget the other, server-rendered config diverges from client. Add a sync test in M4 or move to a shared JSON source. (source: M3 review)
- [2026-04-30] [chore] `compileStyles.js:66–86` `compileSubtree()` duplicates main walk logic — refactor to a shared traversal function. (source: M3 review)
- [2026-04-30] [chore] `compatBridge.js:46–70` comment claims "small 3-line helper", function is 25 lines — stale comment from earlier iteration. (source: M3 review)
- [2026-04-30] [dx] `density.js:20–25` silent no-op when root element is null — kernel passes potentially-null root from `document.getElementById()`. Dev-mode `console.warn` would aid debugging shell-mount failures. (source: M3 review)
- [2026-04-30] [chore] Duplicate WPDS-slot regex — `scripts/snapshot-wpds.mjs:36` and `tests/parity/wpds-snapshot.test.mjs:71` share identical regex. Extract to shared constant. (source: M3 review)
- [2026-04-30] [doc] Plan deviation: WPDS source path — plan §M3.2 says `wp-includes/css/dist/theme/style.css` (pinned WP install); actual snapshot pulls from `node_modules/@wordpress/theme/src/prebuilt/css/design-tokens.css` (npm package source). Same content, more direct for CI. Update plan wording to match. (source: M3 review)
- [2026-04-30] [doc] Plan deviation: `:root` token scope — plan tasks M3.5/.6/.7 imply `#wp-admin-shell` scope; commit `8925fe1` moved WPDS/chrome/compat to `:root` so `@wordpress/commands` portal inherits shell theming. Per-region/per-app overrides correctly stay narrowly scoped. Justified architectural improvement; update master spec §4.3.2 to match. (source: M3 review)
- [2026-04-30] [doc] No SSR FOUC mitigation — tokens emit from JS at kernel mount; any pre-mount chrome (admin bar, page header) flashes wp-admin defaults before tokens land. Acceptable for v1 but worth documenting. (source: M3 review)
- [2026-04-30] [bug] Settings panel merge can shadow filtered-out builtin — `src/apps/SettingsApp.js:87–93` filters BUILTIN_PANELS by `config.panels[]` allowlist then concats `slotPanels` unconditionally. If shell narrows to `panels: ['general']` and a plugin registers `core:settings.panels` item with `id: 'writing'`, the plugin panel renders even though shell intended to hide it. Plugin can also register `id: 'general'` and produce two "General" entries. Dedupe by id + apply allowlist to slot panels too; document plugin-panel ID uniqueness either way. (source: M4 review)
- [2026-04-30] [doc] `core:editor.sidebar` slot only emits from SimpleEditorApp — plan §M4.5 says slot "applies to `core:editor` *and* `core:simple-editor` consumers." `EditorApp` is iframed and cannot emit React fills. SimpleEditorApp emits at `src/apps/SimpleEditorApp.js:370–371`. Iframed editor side lands when native post-editor mount arrives post-v1. Documented inline in `src/runtime/apps/SiteEditorApp.js` but not in CLAUDE.md or commit. Add note to CLAUDE.md M4 section. (source: M4 review)
- [2026-04-30] [feat] PostsApp wp_template URL-encoding TODO — `src/apps/PostsApp.js:~102–105` notes that template IDs like `theme//slug` need URL-encoding when routed to editor. Marked v2 in code; capture here so it doesn't get lost. (source: M4 review)
- [2026-04-30] [chore] DataViews wiring duplicated across PostsApp / UsersApp / CommentsApp — same useEntityRecords → fields → actions → render shape. Acceptable v1 idiom; shared base component if more DataViews apps land in v2. (source: M4 review)
- [2026-04-30] [doc] `core:settings` route falls back to `panels[0]` for unknown sub-route — `src/apps/SettingsApp.js:95` no 404 / warning for `#/settings/nonexistent`. Acceptable v1 behavior but worth documenting in admin-json-schema.md or settings docs. (source: M4 review)
- [2026-04-30] [doc] CommentsApp uses `dangerouslySetInnerHTML` for rendered comment content — `src/apps/CommentsApp.js:82`. WordPress core filters comment HTML server-side so OK in practice; document the trust boundary inline. (source: M4 review)
- [2026-04-30] [feat] UsersApp bulk-delete reassign UX — `src/apps/UsersApp.js:154` defaults reassign to current user via `window.wpAdminShell?.userId`. Sensible default; admins might expect to choose a different reassign target. Consider a confirm dialog with reassign-target selector before bulk delete in v2. (source: M4 review)
- [2026-04-30] [feat] Demo shells need refresh — content-author / client-portal / wp-admin-default carry the MVP application list; v1 native apps (`core:users`, `core:comments`, `core:settings` composable, `core:appearance`) are wired into developer-admin only. Refactor the other three so the demos showcase the v1 surface. (source: M5 browser smoke)
- [2026-04-30] [chore] Token discrepancy in non-developer-admin shells (M3 review residue) — user reported palette tokens off in "default" shell. Resolver emits identical brand+chrome across all shells; cause not yet pinned. If still reproducible, capture `<style id="wp-admin-shell-tokens">` from devtools to diagnose. (source: M3 review)
- [2026-04-30] [a11y] Sidebar navigation lacks `<nav>` + `aria-label` — `src/runtime/apps/NavigationApp.js:77` renders `<VStack>` (div); `src/runtime/apps/_components/SidebarContent.js:15` renders `<div>`. `docs/v1-readiness.md:44` marks this checklist item done but code does not implement it. Fix code (one-line wrapper) or uncheck box; inaccurate self-attestation is worse than missing. (source: M5 review)
- [2026-04-30] [bug] `switchShell(slug)` does not verify slug exists before write — `src/runtime/shell-switching.js:26–41` POSTs straight to `/wp/v2/settings`. Typo or stale slug bricks the admin until corrected via Settings page or `wp admin-shell activate`. WP-CLI `activate` already validates (`includes/class-wp-admin-shell-cli.php:71–73`); JS path should match via pre-flight or accept-list lookup. (source: M5 review)
- [2026-04-30] [bug] `deep_merge()` in user-prefs REST lacks depth limit — `includes/class-wp-admin-shell-prefs-rest.php:89–107` recurses with no `$depth` argument or base case. Pathological nested payload could exhaust memory/stack. PHP `memory_limit` mitigates but cap at depth 10. (source: M5 review)
- [2026-04-30] [chore] WP-CLI `register` reads source path without validating regular file — `includes/class-wp-admin-shell-cli.php:111–122`. `file_get_contents` follows symlinks. Operator already trusted, but defensive: `is_file($source_path) && filetype($source_path) === 'file'`. (source: M5 review)
- [2026-04-30] [chore] WP-CLI `upgrade-config` doesn't check `is_writable()` before backup write — `includes/class-wp-admin-shell-cli.php:163–164`. If `shells/` is read-only, backup `file_put_contents` fails silently and original gets overwritten anyway on line 167. Wrap in `is_writable` + bail on failure. (source: M5 review)
- [2026-04-30] [dx] AppearanceApp silent fail on malformed `userCustomizable` — `src/runtime/apps/AppearanceApp.js:71–83` returns false for all paths if declaration isn't bool/array/null. No console warn. UX issue, not security. (source: M5 review)
- [2026-04-30] [perf] Capability pre-computation cost on cold cache miss — `wp-admin-shell.php:197–223` iterates declared caps and calls `current_user_can()` directly. 50-app shell = 50+ DB-backed cap checks on resolver miss. Mitigated by M2.7 cache (entire resolved config memoized) so fires only on cold misses. Add a code comment that this only runs on cache miss. (source: M5 review)
- [2026-04-30] [bug] No automated role-fixture cap-gating tests — plan §test-strategy implies M5 integration tests exercise cap gating across `subscriber/contributor/author/editor/administrator`. Code is correct but verification is manual. Backfill before tagging beta.2 or queue as v2 test-harness work. (source: M5 review)
- [2026-04-30] [doc] Perf smoke baseline not recorded — plan §M5.12 calls for "Cold mount under 500ms on baseline laptop ... recorded in `docs/v1-perf-baseline.md`." Readiness doc has methodology only; no measurements. Record before tagging. (source: M5 review)
- [2026-04-30] [feat] In-process shell re-mount (v2) — plan §M5.8 said "switching shells mid-session"; v1 calls `window.location.reload()`, losing ephemeral UI state (DataViews sort, selection, scroll). v2 should rebuild registry's region tree without hard reload. Deferred per commit message. (source: M5 review)
- [2026-04-30] [doc] CLAUDE.md status section drift — top of file still has M1-progress framing in places after M5 ship. README rewritten in `ad3837d` for v1; CLAUDE.md needs same pass. (source: M5 review)

---

## Triaged

### Now
_Actively shaping or about to start._

### Next
_Queued for the next working session._

- [2026-05-05] [feat] validateRegion route-key cross-check — `src/runtime/regions/validateRegion.mjs:38–45` only verifies the key is a non-empty string. Misspelled keys silently produce no app at runtime instead of erroring at composition. Fold a slot-name check against the routes block into the validation pass. (source: V2.M2 task 5 review)
- [2026-05-05] [bug] resolveRegion recursion depth limit + cycle detection — `src/runtime/regions/resolveRegion.mjs:98–113` recurses through `regions` unbounded. Self-referential template stack-overflows at mount. Add visited-set + depth cap (10) + raw-passthrough warn. Defensive — no current shells trigger it. (source: V2.M2 task 4 review)

### Later
_Acknowledged, not soon. Revisit when adjacent work touches the area._

- [2026-05-05] [a11y] Region-level `label` field — schema has no region-level label, so `aria-labelledby` falls back to the slug (`editor/inspector` reads aloud). Add `label` to `admin-v2.json` region shape; read it in both `ModalRegion` and `PersistentRegion`. Touches schema, fixtures, and three renderers. (source: V2.M2 task 6 review)
- [2026-05-05] [doc] resolveRegion `layout` vs `style` split — `src/runtime/regions/resolveRegion.mjs` merges template `default-style` + decl `style` + decl `layout` into the single `style` key. Contradicts spec §5.2 (geometry/decoration split). Inline comment defers this to "task 6"; task 6 shipped without it. Either split or amend spec; revisit when V2.M5's second engine surfaces real pressure. (source: V2.M2 task 3 review)
- [2026-05-05] [bug] `honored-platform` contract not enforced — spec §5.3 promises a console warning when a region requests a service the engine doesn't honor. Region.js + kernel.js never cross-check `region.platform` against `engine.honored-platform`. Half of `getPlatformServices` (`isTriggerable`, `triggerShortcut`, `wantsDirtyState`, `blocksNavigationOnDirty`, `persistsAcrossNavigation`) has no consumer either. Wire warn-on-unhonored + actual `trigger.shortcut` / `dirty-state` consumers in V2.M5 (platform-services rebuild). (source: V2.M2 task 6 review)
- [2026-05-05] [bug] Engine token alias unseeded — `engines/core-site-editor-layout/engine.json:77` `"border-inline-start": "1px solid {styles.color.stroke.surface.neutral.weak}"`. `compileStyles.resolveValue()` walks `admin.json.styles` only; the path isn't seeded by `WP_Admin_Shell_Origin_Core::v0_styles_from_branding`. Shells without explicit `styles.color.stroke.*` ship the raw alias literal in compiled CSS. No current shell uses `core:detail` so latent. Fix: seed defaults from WPDS bridge OR fall through to `--wpds-*` slot. (source: V2.M2 task 1 review)

### Won't do
_Decided against. Keep with rationale so we don't relitigate._

- [2026-05-05] [feat] Field-level child-region merge — `resolveRegion.mjs:104–107` whole-child-replaces template children when the declaration names them. Behavior matches spec §5 line 450 + §5.5 explicitly. Authors who want to tweak one field on a template-supplied child must redeclare the others, but that's the spec contract. Re-evaluate only if V2.M5's second engine surfaces real pressure (then revise spec §5.5 in lockstep). (source: V2.M2 task 4 review)
- [2026-05-05] [chore] Engine manifest scaffold fields — `engine.json` `script`, `style`, `specializes-roles`, `honored-platform` are validated but currently unused. They'll come alive in V2.M5 (second engine + bundling) and platform-trigger consumer work. Flagging as scaffold not a defect; no action needed. (source: V2.M2 task 1 review)

---

## In progress

_Work underway. Link to branch / spec / PR._

---

## Done

_Recently shipped. Prune quarterly._

- [2026-05-05] [bug] **Ship-blocker fixed:** ModalRegion default-open — `src/runtime/regions/Region.js` now starts triggerable regions closed (`useState(!isTriggerable)`) and renders an inert `display: none` subtree so children with side-effect hooks (`useCommandLoader`, etc.) keep mounting. Bundled command palette no longer pops a backdrop on every shell load. Trigger.shortcut binding consumer remains V2.M5 work. (source: V2.M2 task 6 review)
- [2026-05-05] [bug] ModalRegion autofocus scoped to dialog — query target now `dialogRef.current.querySelector` instead of `document.querySelector`. (source: V2.M2 task 6 review)
- [2026-05-05] [perf] `useRouteForRegion` gated on route-key — `GenericRegion` now passes `null` for the region argument when `region.routing?.['route-key']` is absent, so non-routable regions don't subscribe to the router. (source: V2.M2 task 6 review)
