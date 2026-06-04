# Parity: Settings — Writing (core:settings-writing)

> Audited 2026-05-29 against WordPress 7.0 core. Workspace app: src/apps/settings-writing/. Classic counterpart: wp-admin/options-writing.php (form) + wp-admin/options.php (legacy save handler) + wp-includes/option.php (REST registration).

## Verdict

**Blocked by API.** The workspace faithfully rebuilds the entire REST-exposed slice of the Writing Settings screen — `default_category` and `default_post_format` round-trip correctly through `useEntityRecord('root','site')` and `DataForm`. The problem is that the REST-exposed slice is *most of* the screen's surface only on paper: of the eleven option fields the classic screen edits, **only three** are registered with `show_in_rest`, and the workspace ships two of those three. Every legacy field — the entire **Post via Email** block (`mailserver_url` / `mailserver_port` / `mailserver_login` / `mailserver_pass` / `default_email_category`), the **Update Services** `ping_sites` textarea, plus `use_balanceTags` and the conditional `default_link_category` — is editable in classic wp-admin only via the legacy `$allowed_options['writing']` allowlist path (wp-admin/options.php:151-198), which `WP_REST_Settings_Controller` does not read. There is no REST surface for them at all, so the workspace cannot reach parity without either an upstream `show_in_rest` change or a custom workspace REST endpoint. The workspace handles this honestly (an in-form notice points users at the legacy screen), but the gap is structural, not cosmetic, hence "Blocked by API" rather than "Major gaps." A secondary workspace-side miss: the unconditionally-REST-exposed `use_smilies` toggle is omitted entirely.

## Counterpart mapping

- **Classic screen(s):**
  - `wp-admin/options-writing.php` — the form markup (no list-table; plain `<form method="post" action="options.php">` + `settings_fields('writing')`). Fields hand-rendered: `wp_dropdown_categories()` for category selects, a `<select>` for post format, text inputs for mailserver, a password-reveal widget for `mailserver_pass`, a `<textarea>` for `ping_sites`.
  - `wp-admin/options.php` — the legacy save handler. Builds `$allowed_options['writing']` (options.php:151-198) and persists every option in that allowlist via `update_option()`, **independent of `show_in_rest`**.
  - `wp-includes/option.php` — `register_initial_settings()` (option.php:2741-2886) is the only place that registers writing settings with `show_in_rest`.
  - `wp-includes/formatting.php` — `sanitize_option()` (formatting.php:4880-4965) holds the server-side sanitization for `mailserver_*` and `ping_sites` (newline→URL filtering), which a custom workspace endpoint would have to replicate.
- **REST / core-data surface the workspace app uses:**
  - `GET/POST /wp/v2/settings` via `useEntityRecord('root','site')` (core-data `root`/`site` entity) — reads/writes `default_category` (int) + `default_post_format` (string). `WP_REST_Settings_Controller`, wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php.
  - `GET /wp/v2/categories?per_page=100&orderby=name&order=asc&hide_empty=false` via `useEntityRecords('taxonomy','category', …)` (src/apps/settings-writing/index.js:26-31) — populates the Default Post Category select.
- **Project screen spec:** `docs/screens/settings-writing.md` (Tier 2, full spec). **Stale in two ways** (doc gaps to report): (1) it lists `wp_collaboration_enabled` / `wp_is_collaboration_allowed()` "Real-time Collaboration" as a REST-exposed 6.x field — **this does not exist in WP 7.0 source** (`grep wp_collaboration_enabled src/` returns nothing); (2) it points "Current workspace coverage" at `src/apps/settings-panels/SettingsWritingApp.js` and `src/apps/SettingsApp.js`, neither of which exists — the live files are `src/apps/settings-writing/index.js` and `src/apps/settings/index.js`.

## Feature parity matrix

| Feature | wp-admin behavior | Workspace app | Status | Notes |
|---|---|---|---|---|
| **Default Post Category** | `wp_dropdown_categories()` hierarchical select, all categories (`hide_empty:0`, `orderby:name`), writes `default_category` (options-writing.php:81-96) | `select` field over `taxonomy/category` records, writes int via `parseInt` (index.js:39-49) | 🟡 partial | Functional, but **flat** — no hierarchy indentation; see Divergences. |
| **Default Post Format** | `<select>` of `get_post_format_strings()` minus `standard`, Standard mapped to value `0`, writes `default_post_format` (options-writing.php:97-111) | `select` field, hardcoded 10-format list, Standard kept as `'standard'` (index.js:8-19, 50-58) | 🟡 partial | Format list matches core verbatim, but **not theme-gated** + Standard value mismatch; see Divergences. |
| **Convert emoticons (`use_smilies`)** | Checkbox, writes `use_smilies` (options-writing.php:74-76); **REST-registered** `show_in_rest=true` (option.php:2857-2866) | Not rendered at all | 🔴 missing | REST-exposed boolean — closeable workspace-side. Classic only *shows* it when `initial_db_version < 32453`, but it is always REST-writable. |
| **Auto-correct nested XHTML (`use_balanceTags`)** | Checkbox, ancient installs only (options-writing.php:77; allowlisted options.php:182) | Not rendered | ⚫ blocked | No `show_in_rest`. `[upstream]`. Out of scope per spec §16. |
| **Default Link Category (conditional)** | `wp_dropdown_categories()` over `link_category` taxonomy, shown only when `link_manager_enabled` (options-writing.php:112-132) | Not rendered | ⚫ blocked | `default_link_category` has no `show_in_rest`. `link_category` is not a default REST taxonomy. `[upstream]`. |
| **Post via Email — Mail Server (`mailserver_url`)** | Text input (options-writing.php:159-160) | Not rendered | ⚫ blocked | Allowlist-only (options.php:170); no `show_in_rest`. `[upstream]`. |
| **Post via Email — Port (`mailserver_port`)** | Small text input (options-writing.php:161-162) | Not rendered | ⚫ blocked | Allowlist-only (options.php:171). `[upstream]`. |
| **Post via Email — Login Name (`mailserver_login`)** | Text input, LTR (options-writing.php:165-167) | Not rendered | ⚫ blocked | Allowlist-only (options.php:172). `[upstream]`. |
| **Post via Email — Password (`mailserver_pass`)** | Text input + show/hide reveal button + `#24364` workaround, `data-pw` (options-writing.php:169-184) | Not rendered | ⚫ blocked | Allowlist-only (options.php:173). `[upstream]`. |
| **Post via Email — Default Mail Category (`default_email_category`)** | `wp_dropdown_categories()` (options-writing.php:185-200) | Not rendered | ⚫ blocked | Allowlisted in the base `writing` set (options.php:153) but no `show_in_rest`. `[upstream]`. |
| **Update Services (`ping_sites`)** | `<textarea rows=3>`, newline-separated URLs (options-writing.php:219-229) | Not rendered | ⚫ blocked | Allowlist-only, gated by `blog_public==='1'` (options.php:196-197); no `show_in_rest`. `[upstream]`. |
| **Post-by-email section gate** (`enable_post_by_email_configuration` filter) | Whole block hidden when filter returns false (options-writing.php:142,203) | N/A — block absent | ⚫ blocked | Filter is server-only PHP; even if fields were REST-exposed the visibility decision isn't surfaced. `[upstream]`. |
| **Update-services section gate** (`enable_update_services_configuration` filter) | Whole block hidden when filter returns false (options-writing.php:41,213) | N/A — block absent | ⚫ blocked | Server-only PHP filter, not in REST. `[upstream]`. |
| **`blog_public !== '1'` suppressed Update Services notice** | Renders an info notice + link to Reading Settings instead of the textarea (options-writing.php:231-244) | N/A | ⚫ blocked | Requires `ping_sites` surface + `blog_public` (the latter IS… actually not REST-registered either). `[upstream]`. |
| **Random password suggestions** | Three `wp_generate_password(8,false)` `<kbd>` strings in helper text (options-writing.php:147-153) | N/A | ⚫ blocked | Server-generated; cosmetic helper, tied to the (blocked) post-by-email block. `[upstream]`. |
| **Plugin-added Settings API fields** | `do_settings_fields('writing','default'|'remote_publishing'|'post_via_email')` + `do_settings_sections('writing')` render arbitrary plugin fields (options-writing.php:135-136,201,247) | Not rendered | ⚫ blocked | The Settings API field registry is PHP-side and has no REST projection. `[upstream]` (a hard, generic gap across all settings panels). |
| **Save Changes button** | `submit_button()` → full POST to options.php, nonce-checked (options-writing.php:249) | WPDS `Button` → `save()` → `POST /wp/v2/settings` (EntityDataForm.js:73-83) | 🟢 full | Disabled until `hasEdits`; loading state on `isSaving`. |
| **Save success feedback** | `?settings-updated=true` redirect → admin notice "Settings saved." | Snackbar via `core/notices` (useEntitySave.js:29) | 🟢 full | Idiomatic. |
| **Save error feedback** | PHP `add_settings_error()` → inline notice | Dismissible error notice via `core/notices` (useEntitySave.js:30-33) | 🟢 full | Per-field partial-failure detail (spec §12) not surfaced — single REST batch. |
| **Capability gating (view)** | `current_user_can('manage_options')` → `wp_die()` (options-writing.php:12-14) | App `role:"main"`; REST enforces `manage_options` in `get_item_permissions_check` (class-wp-rest-settings-controller.php:67-69) | 🟢 full | Server is the floor either way. app.json declares no explicit cap floor; the REST 403 backstops it. |
| **Nonce / CSRF** | `settings_fields('writing')` emits `_wpnonce` + `_wp_http_referer` (options-writing.php:66) | `api-fetch` X-WP-Nonce middleware on the `/wp/v2/settings` POST | 🟢 full | Equivalent protection via REST nonce. |
| **Help tabs** (Overview / Post Via Email / Update Services) | Three `add_help_tab()` panels + help sidebar (options-writing.php:20-55) | None | 🔴 missing | No help-tab surface anywhere in the workspace. Workspace-side / cross-cutting. |
| **Loading state** | Full page render (no async) | Centered `<Spinner/>` until `record` resolves (EntityDataForm.js:46-52) | 🟢 full | Idiomatic null-guard. |
| **Empty state** | N/A (always at least Standard + Uncategorized) | DataForm renders with whatever options resolve | 🟢 full | If categories haven't loaded, the category select is briefly empty — see Divergences. |
| **Dirty-state / navigation guard** | None (classic does not warn on navigate-away) | app.json declares `core:dirty-state:true` but `EntityDataForm` never calls `useDirtyState` | 🔴 missing | Declared-but-unwired; unsaved edits do not arm the guard. Workspace-side. |
| **Cmd/Ctrl+S to save** | wp-admin has no global save shortcut on this screen | None | 🟢 full | Parity (neither has it). Spec §13 *wishes* for it; not a regression. |
| **`?settings-updated` URL flag** | Set on POST redirect (routing §10) | N/A — no full-page reload, REST-only | 🟢 full | Divergent mechanism, equivalent UX. |
| **Documentation links** (Codex/HelpHub) | In help sidebar + Update Services helper text | None | 🟡 partial | Lost with the help tabs. |
| **a11y: fieldset/legend grouping** | `<fieldset>`+`<legend class="screen-reader-text">` on Formatting block (options-writing.php:73) | DataForm's own field semantics | 🟢 full | The only classic fieldset wraps the ancient-install Formatting block, which is itself blocked. |
| **a11y: password reveal aria-label** | `aria-label="Hide password"` toggle button (options-writing.php:179) | N/A | ⚫ blocked | Tied to the blocked password field. |

## Functional divergences

Behaviors present in both but implemented differently, with the user-visible consequence.

1. **Default Post Category select is flat, not hierarchical.**
   - wp-admin: `wp_dropdown_categories([... 'hierarchical' => true ])` (options-writing.php:85-93) indents child categories under parents with em-dash prefixes, so a deep taxonomy is navigable.
   - Workspace: maps `categories.records` straight to `{ value, label: c.name }` (index.js:34-37) with **no hierarchy indentation and no parent ordering** — child terms appear flat, alphabetically by name. The REST `categories` response *does* carry `parent`, so this is closeable workspace-side; it is a divergence, not a blocker.
   - Consequence: on sites with nested categories, the dropdown is harder to scan and two same-named children under different parents are indistinguishable.

2. **Default Post Format "Standard" sentinel mismatch.**
   - wp-admin: renders Standard as `<option value="0">` and stores `default_post_format` as the literal `0`/`'0'` for Standard (options-writing.php:104-105); `get_option('default_post_format')` is `'0'` on a fresh install.
   - Workspace: uses `value: 'standard'` for the Standard option (index.js:9) and `getValue` falls back to `'standard'` when the stored value is falsy (index.js:56-57). Selecting "Standard" therefore writes the string `'standard'`, **not** `0`.
   - Consequence: the REST schema for `default_post_format` is a free `string` (option.php:2878-2885) with no enum, so `'standard'` is accepted and persisted — but it diverges from what classic writes (`'0'`) and from `get_post_format_slug()` semantics (any falsy value = standard; `'standard'` is truthy). A post created while this is set could resolve its format differently than a `0`-set install. Subtle, but a real data-shape divergence. Writing `0` (or `''`) for Standard would match core.

3. **Post format list is not theme-gated.**
   - wp-admin: shows the full `get_post_format_strings()` list regardless of theme support on *this* screen (the gating to `get_theme_support('post-formats')` happens in the editor, not here) — so the workspace actually matches classic options-writing.php behavior here. **However** the screen spec (§4, §9) asserts the dropdown *should* be theme-gated. Against live classic source the workspace is correct; against the spec it is "as designed." Flagging because the spec drove the expectation.
   - Consequence: none vs. classic; the spec's theme-gating ask is a nice-to-have, not a parity miss.

4. **Categories load is unbounded-but-capped at 100.**
   - wp-admin: `wp_dropdown_categories` renders *every* category server-side, no cap.
   - Workspace: `per_page: 100` (index.js:27). Sites with >100 categories silently truncate the Default Post Category options; the currently-stored category, if beyond the first 100, won't be selectable/visible.
   - Consequence: on large-taxonomy sites the saved value can become unrepresentable in the UI. Workspace-side fix (paginate or raise the cap / fetch the selected term explicitly).

5. **Declared dirty-state is never wired.**
   - app.json declares `platform: { "core:dirty-state": true }` (app.json:9-11), but `EntityDataForm` reads `hasEdits` only to disable the Save button (EntityDataForm.js:78) and never calls `useDirtyState(regionId, hasEdits, …)`.
   - Consequence: the kernel's `<NavigationGuard>` is not armed, so navigating away (route change / `beforeunload`) with unsaved edits is silent. wp-admin also doesn't warn here, so this is not a *regression* vs. classic — but the app advertises a capability it doesn't deliver, and other workspace forms that should warn share the same `EntityDataForm` workspace.

## API & platform blockers

The hard parity blockers — wp-admin functionality unreachable via REST / core-data. Each verified against live 7.0 source.

| Field / capability | Classic mechanism (verified) | Why it's blocked | Tag |
|---|---|---|---|
| **`mailserver_url`** | Allowlisted at options.php:170; saved via `update_option`. **No `register_setting(... show_in_rest ...)`** anywhere in `src/` (confirmed: option.php registers only `use_smilies`/`default_category`/`default_post_format` for `writing`). | `WP_REST_Settings_Controller::get_registered_options()` skips any setting with empty `show_in_rest` (class-wp-rest-settings-controller.php:221-223). Option is absent from `/wp/v2/settings` schema and response entirely. | `[upstream]` (add `show_in_rest`) or `[workspace]` (custom endpoint) |
| **`mailserver_port`** | Allowlisted options.php:171. `sanitize_option` casts via `absint` (formatting.php:4880). | Same — no `show_in_rest`. | `[upstream]` / `[workspace]` |
| **`mailserver_login`** | Allowlisted options.php:172. | Same. | `[upstream]` / `[workspace]` |
| **`mailserver_pass`** | Allowlisted options.php:173; rendered with the `#24364` show/hide reveal widget. | Same. Note: even with a REST surface, the password reveal + `wp_generate_password` suggestions are classic-only UI affordances. | `[upstream]` / `[workspace]` |
| **`default_email_category`** | In the base `$allowed_options['writing']` (options.php:153); `sanitize_option` `absint` (formatting.php:4886). | No `show_in_rest`; not in `/wp/v2/settings`. | `[upstream]` / `[workspace]` |
| **`ping_sites`** | Allowlisted options.php:197 (only when `blog_public==='1'`); `sanitize_option` does the newline→`sanitize_url`→implode filtering (formatting.php:4963). | No `show_in_rest`. The newline/URL sanitization is server-only — a workspace endpoint would have to replicate it. | `[upstream]` / `[workspace]` |
| **`use_balanceTags`** | Allowlisted options.php:182 (ancient installs only). | No `show_in_rest`. Out of scope per spec §16. | `[upstream]` |
| **`default_link_category`** | In base `$allowed_options['writing']` (options.php:154); shown only when `link_manager_enabled` (options-writing.php:113). | No `show_in_rest`; `link_category` is not a default REST taxonomy, so even the option-value lookup + the category list for the select are both unreachable. | `[upstream]` |
| **Section visibility filters** (`enable_post_by_email_configuration`, `enable_update_services_configuration`) | PHP filters evaluated at render (options-writing.php:30,41,142,213). | Server-only `apply_filters`; the boolean decision is never serialized into any REST payload. A REST-native rebuild can't know whether a host has disabled these sections. | `[upstream]` (would need exposure, e.g. via a settings-meta endpoint) |
| **`blog_public` gate for Update Services** | `'1' === get_option('blog_public')` (options-writing.php:217). | `blog_public` itself is **not** `show_in_rest`-registered (it's allowlisted at options.php:149 only). So both the gate condition and the gated field are off-REST. | `[upstream]` |
| **Plugin Settings API fields** | `do_settings_fields('writing', …)` + `do_settings_sections('writing')` (options-writing.php:135-136,201,247) render arbitrary third-party fields registered via `add_settings_field`. | The Settings API registry (`$wp_settings_fields`) is PHP-render-time state with no REST projection. There is no endpoint to enumerate plugin-added fields for the `writing` group. This is a generic, cross-cutting blocker for every settings panel rebuild, not specific to Writing. | `[upstream]` |
| **Help tabs + help sidebar** | `WP_Screen::add_help_tab()` / `set_help_sidebar()` (options-writing.php:20-55). | Help-tab content is registered PHP-side per `WP_Screen`; there is no REST surface and the workspace has no help-tab UI primitive. Cross-cutting. | `[workspace]` (build a help-tab surface; content would still need a source) |

**Workspace-side mitigations available without upstream changes:** All the blocked option *values* can be read+written from PHP. The workspace could ship a small custom REST controller (e.g. `wp-admin-workspaces/v1/writing-extras`) under a `manage_options` permission check that GETs/POSTs the mailserver/ping/link options and replicates the `sanitize_option` rules. That converts every `[upstream]` row above (except the Settings API enumeration and the section-visibility filters) into a closeable `[workspace]` task. The `enable_*_configuration` filters and `do_settings_fields` enumeration genuinely need upstream cooperation.

## DataViews / DataForms review

The app uses **`DataForm`** (via the shared `src/apps/_shared/forms/EntityDataForm.js`). Usage is largely idiomatic, with two notes:

- **Idiomatic wiring (correct):** `EntityDataForm` passes `data={editedRecord}` / `onChange={edit}` / `fields` / `form` to `DataForm` (EntityDataForm.js:66-71). `DataForm`'s `onChange` hands back the same partial-object shape `useEntityRecord`'s `edit` consumes, so they compose directly with no adapter — this is the documented `@wordpress/dataviews` `DataForm` contract and matches the project convention in CLAUDE.md ("Single-record edit forms use `DataForm`").
- **`type: 'text'` on a select field (questionable).** Both fields declare `type: 'text'` *and* `Edit: 'select'` with `elements` (index.js:40-44, 51-55). DataForm picks the edit control from `Edit` when present, so this renders a select correctly — but `type: 'text'` is the wrong field *type* for an enumerated value. The idiomatic shape is `type: 'integer'` (default_category) / `type: 'text'` with no custom control + `elements` letting DataForm infer a select. The hand-set `getValue`/`setValue` (index.js:45-48, 56-57) paper over the type mismatch with manual `String()`/`parseInt` coercion. It works, but it's a mild anti-pattern: the type metadata lies about the data, and a future DataForm validation pass keyed on `type` could misbehave. Not fragile today.
- **No `validation` / no `isVisible`.** The fields declare neither. Classic relies on server-side `sanitize_option`/schema validation, and the workspace leans on the same (the REST controller validates against the registered schema). For the two REST fields that's adequate. For any future blocked-field rebuild, DataForm's `isVisible(item)` would be the right tool for the `blog_public` / `link_manager_enabled` conditional-visibility logic (DataForm supports it; the app doesn't need it yet).
- **No DataForm component limitation blocks parity here.** Everything missing is missing because the *data* isn't in REST, not because DataForm can't render it. A select, a text input, a password input, and a textarea are all expressible in DataForm today.

Bottom line: DataForm usage is fine; the only cleanup is aligning `type` with the real value type (integer/string) and dropping the manual coercion where DataForm's native int/enum handling would suffice.

## Recommendations / future work

**P1 — close the in-REST gaps (workspace-side, cheap):**
1. **Add the `use_smilies` toggle.** It is unconditionally `show_in_rest` (option.php:2857-2866) and trivially renderable as a DataForm boolean. Today it is simply absent (index.js FORM.fields has only the two selects). *Where:* `src/apps/settings-writing/index.js`. Workspace-side.
2. **Fix the Default Post Format Standard sentinel.** Write `0` (or `''`) for Standard to match core's stored value instead of the string `'standard'` (index.js:9,56-57). *Where:* `src/apps/settings-writing/index.js`. Workspace-side. Prevents a latent data-shape divergence.
3. **Hierarchical + complete category select.** Indent by `parent` and either paginate `taxonomy/category` past 100 or explicitly fetch the currently-stored term so it's always representable (index.js:26-37). *Where:* `src/apps/settings-writing/index.js`. Workspace-side.

**P1 — fix the doc drift (doc-only):**
4. **Correct `docs/screens/settings-writing.md`:** remove the non-existent `wp_collaboration_enabled` / "Real-time Collaboration" field (not in WP 7.0 source) and fix the stale `src/apps/settings-panels/SettingsWritingApp.js` / `SettingsApp.js` paths to `src/apps/settings-writing/index.js` / `src/apps/settings/index.js`. *Where:* `docs/screens/settings-writing.md` lines 5, 64, 84, 184-186, 300, 334-335.

**P2 — recover the legacy fields without upstream (workspace-side, larger):**
5. **Ship a `wp-admin-workspaces/v1` REST controller for the off-REST writing options** (`mailserver_*`, `default_email_category`, `ping_sites`, `default_link_category`), `manage_options`-gated, replicating the `sanitize_option` rules from formatting.php:4880-4965 (especially the `ping_sites` newline→`sanitize_url` filter). Then extend the DataForm with the Post-via-Email + Update Services fields behind the same `enable_*_configuration` checks (which the controller can evaluate PHP-side and expose as booleans). *Where:* new `includes/*-rest.php` + `src/apps/settings-writing/index.js`. Converts most `[upstream]` blockers to closed. This is the only path to true field parity short of upstream.
6. **Make the in-form notice actionable.** The current generic notice (index.js:74-79) should (a) name *which* fields are unavailable, and (b) link to the classic screen with a real `<a href="/wp-admin/options-writing.php">` so the kernel's admin-link interceptor handles it (per CLAUDE.md "Workspace links never bypass the admin-link interceptor"). Today it's plain text with no link. *Where:* `src/apps/settings-writing/index.js`. Workspace-side. (Superseded if #5 lands.)

**P2 — wire the declared dirty-state (workspace-side):**
7. **Call `useDirtyState(regionId, hasEdits, …)` in `EntityDataForm`** so the `core:dirty-state:true` declaration (app.json:9-11) actually arms the navigation guard. Affects all forms sharing the workspace, not just Writing. *Where:* `src/apps/_shared/forms/EntityDataForm.js`. Workspace-side.

**P3 — DataForm hygiene + a11y (workspace-side):**
8. **Align field `type` with the real value type** (`integer` for `default_category`, drop the manual `String`/`parseInt` where native handling suffices) and reconsider `type:'text'`+`Edit:'select'` (index.js:40-58). *Where:* `src/apps/settings-writing/index.js`.
9. **Help-tab surface.** The three help tabs (options-writing.php:20-55) and the documentation links have no workspace equivalent — a cross-cutting gap across all rebuilt screens. *Where:* kernel/engine help-tab primitive + per-app content. Workspace-side, larger.

**P3 — upstream asks (need WP core / REST change), worth filing as tickets:**
10. **`[upstream]` Register the legacy writing options with `show_in_rest`** (`mailserver_*`, `default_email_category`, `ping_sites`, `default_link_category`) so any headless/REST client can edit Writing Settings in full. *Where:* `wp-includes/option.php register_initial_settings()`.
11. **`[upstream]` Expose the Settings API field registry over REST** (`do_settings_fields`/`do_settings_sections` for a group) so plugin-added settings fields can be enumerated and rebuilt outside wp-admin. Generic across every settings panel; this is the single largest structural blocker for settings parity.
