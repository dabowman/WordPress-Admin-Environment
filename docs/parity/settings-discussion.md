# Parity: Settings — Discussion (core:settings-discussion)

> Audited 2026-05-29 against WordPress 7.0 core. Shell app: `src/apps/settings-discussion/`. Classic counterpart: `wp-admin/options-discussion.php` (form render) + `wp-admin/options.php` (save handler `$allowed_options['discussion']`).

## Verdict

**Blocked by API.** This is the single largest settings-parity gap in the shell. The classic Discussion Settings screen exposes **25 options** (`wp-admin/options.php:103-129`). WordPress core registers **exactly 2 of them** with `show_in_rest` (`wp-includes/option.php:2932-2959`): `default_ping_status` and `default_comment_status`. The shell app renders those 2 fields and nothing else (`src/apps/settings-discussion/index.js:10-39`), correctly so — every other field is invisible to `/wp/v2/settings` and `@wordpress/core-data` cannot read or write it. **23 of 25 fields are missing**, all behind the same root cause: no `show_in_rest`. The good news is the blocker is closable **shell-side** without an upstream change — the shell's own PHP can `register_setting( …, [ 'show_in_rest' => … ] )` for the missing options on `rest_api_init`, after which they appear in the existing settings endpoint with no further work. Until that shim lands, the app is a 2-field stub with an in-form notice pointing users to the legacy screen.

## Counterpart mapping

- **Classic screen(s):**
  - `wp-admin/options-discussion.php` — renders the form via the Settings API (`settings_fields('discussion')`, hand-built `<table class="form-table">`). Not a list-table; this is a Settings-API form screen.
  - `wp-admin/options.php:103-129` — the `$allowed_options['discussion']` whitelist; this is the canonical, complete list of the 25 options the classic Save handler accepts.
  - `wp-admin/includes/schema.php:435-565` — DB defaults for every option (`populate_options()`).
- **REST / core-data surface the shell app uses:**
  - `GET/POST /wp/v2/settings` (the `WP_REST_Settings_Controller`, `class-wp-rest-settings-controller.php`).
  - core-data entity `useEntityRecord( 'root', 'site' )` via the shared `EntityDataForm` (`src/apps/_shared/forms/EntityDataForm.js:42-43`).
  - Reads/writes only `default_comment_status` + `default_ping_status`.
- **Project screen spec:** `docs/screens/settings-discussion.md` exists (Tier-2 full spec). **Two errors in the spec to report** (see Functional divergences): (1) it lists `default_pingback_flag` as REST-exposed (lines 62, 185, 307) — it is **not**; only 2 fields are registered, not 3; (2) it references a stale impl path `src/apps/settings-panels/SettingsDiscussionApp.js` (lines 5, 306, 341) — the app now lives at `src/apps/settings-discussion/index.js`.

## Feature parity matrix

Status legend: 🟢 full · 🟡 partial · 🔴 missing · ⛔ blocked (no REST surface).

### Default post settings

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Attempt to notify any blogs linked from the post (`default_pingback_flag`) | Checkbox, value `1`; default `1`/true (`options-discussion.php:50-52`) | Absent | ⛔ | NOT registered with `show_in_rest` (`option.php`; only `default_ping_status`/`default_comment_status` are). Spec wrongly claims it is REST-exposed. |
| Allow link notifications (pingbacks/trackbacks) (`default_ping_status`) | Checkbox writes `open`/`closed`; default `open` (`options-discussion.php:54-56`) | Boolean toggle, maps `open`↔checked via `getValue`/`setValue` (`index.js:23-34`) | 🟢 | REST-exposed (`option.php:2932-2944`, enum `open`/`closed`). |
| Allow people to submit comments on new posts (`default_comment_status`) | Checkbox writes `open`/`closed`; default `open` (`options-discussion.php:58-60`) | Boolean toggle, maps `open`↔checked (`index.js:11-22`) | 🟢 | REST-exposed (`option.php:2946-2959`, enum `open`/`closed`). |
| Helper text "Individual posts may override these settings…" | `<p class="description">` (`options-discussion.php:62`) | Absent | 🔴 | Shell-side, trivial. Shell shows a different (REST-gap) notice instead. |

### Other comment settings

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Comment author must fill out name and email (`require_name_email`) | Checkbox `1`; default `1` (`options-discussion.php:69`) | Absent | ⛔ | No `show_in_rest`. |
| Users must be registered and logged in to comment (`comment_registration`) | Checkbox `1`; default `0`; multisite signup-off note (`options-discussion.php:71-79`) | Absent | ⛔ | No `show_in_rest`. Multisite conditional note also unrepresented. |
| Automatically close comments on old posts (`close_comments_for_old_posts`) | Checkbox `1`; default `0` (`options-discussion.php:81`) | Absent | ⛔ | No `show_in_rest`. |
| Close comments when post is N days old (`close_comments_days_old`) | `number`, min 0; default `14`; nested under above (`options-discussion.php:84-85`) | Absent | ⛔ | No `show_in_rest`. Nested-dependency UI also missing. |
| Show comments cookies opt-in checkbox (`show_comments_cookies_opt_in`) | Checkbox `1`; default `1` (`options-discussion.php:89-90`) | Absent | ⛔ | No `show_in_rest`. |
| Enable threaded (nested) comments (`thread_comments`) | Checkbox `1`; default `1` (`options-discussion.php:92-93`) | Absent | ⛔ | No `show_in_rest`. |
| Number of levels for threaded comments (`thread_comments_depth`) | `<select>` 2..max; max = `apply_filters('thread_comments_depth_max',10)`; default `5` (`options-discussion.php:103-119`) | Absent | ⛔ | No `show_in_rest`. Max-depth value also computed server-side via filter — not exposed. |

### Comment Pagination

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Break comments into pages (`page_comments`) | Checkbox `1`; default `0` (`options-discussion.php:128-129`) | Absent | ⛔ | No `show_in_rest`. |
| Top level comments per page (`comments_per_page`) | `number`, min 0; default `50`; nested (`options-discussion.php:132-133`) | Absent | ⛔ | No `show_in_rest`. |
| Comments page to display by default (`default_comments_page`) | `<select>` `newest`/`oldest`; default `newest` (`options-discussion.php:136-140`) | Absent | ⛔ | No `show_in_rest`. |
| Comments to display at top of each page (`comment_order`) | `<select>` `asc`/`desc`; default `asc` (`options-discussion.php:143-147`) | Absent | ⛔ | No `show_in_rest`. |

### Email me whenever

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Anyone posts a comment (`comments_notify`) | Checkbox `1`; default `1` (`options-discussion.php:156-158`) | Absent | ⛔ | No `show_in_rest`. |
| A comment is held for moderation (`moderation_notify`) | Checkbox `1`; default `1` (`options-discussion.php:160-162`) | Absent | ⛔ | No `show_in_rest`. |
| Anyone posts a note (`wp_notes_notify`) | Checkbox `1`; default `1` (`options-discussion.php:164-166`) | Absent | ⛔ | New in WP 6.9 (`schema.php:564-565`). No `show_in_rest`. |

### Before a comment appears

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Comment must be manually approved (`comment_moderation`) | Checkbox `1`; default `0` (`options-discussion.php:174-176`) | Absent | ⛔ | No `show_in_rest`. |
| Comment author must have a previously approved comment (`comment_previously_approved`) | Checkbox `1`; default `1` (`options-discussion.php:178`) | Absent | ⛔ | No `show_in_rest`. |

### Comment Moderation

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Hold a comment if it contains N+ links (`comment_max_links`) | `number`, min 0; default `2`; embedded in sentence (`options-discussion.php:185-193`) | Absent | ⛔ | No `show_in_rest`. |
| Moderation keyword/IP blocklist (`moderation_keys`) | `<textarea>` newline-separated; default `''` (`options-discussion.php:195-198`) | Absent | ⛔ | No `show_in_rest`. Autoloaded `no` ("fat option", `schema.php:583`). |
| Link to moderation queue ("moderation queue" anchor → `edit-comments.php?comment_status=moderated`) | Inline link in helper (`options-discussion.php:195`) | Absent | 🔴 | Shell-side: should link to the `comments` app with `?status=hold`. Comments REST collection supports `status` (verify in comments app audit). |

### Disallowed Comment Keys

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Disallowed keys → Trash (`disallowed_keys`) | `<textarea>` newline-separated; default `''` (`options-discussion.php:205-208`) | Absent | ⛔ | No `show_in_rest`. Autoloaded `no` (`schema.php:585`). |

### Avatars

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Show Avatars (`show_avatars`) | Checkbox `1`; default `'1'` (`options-discussion.php:232-235`) | Absent | ⛔ | No `show_in_rest`. Also gates visibility of the two groups below (`hide-if-js`). |
| Maximum Rating (`avatar_rating`) | Radio `G`/`PG`/`R`/`X`; default `G` (`options-discussion.php:244-258`) | Absent | ⛔ | No `show_in_rest`. |
| Default Avatar (`avatar_default`) | Radio over 10 styles + live gravatar `<img>` previews; default `mystery`; filterable via `avatar_defaults` (`options-discussion.php:272-318`) | Absent | ⛔ | No `show_in_rest`. Live preview images are a `get_avatar()` server render. |

### Screen-wide affordances

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| Save | `submit_button()` → POST `options.php`, nonce `settings_fields('discussion')` (`options-discussion.php:42-43,328`) | Single Save button; `await save()` over the 2 REST fields (`EntityDataForm.js:73-83`) | 🟡 | Saves the 2 exposed fields only. Nonce handled by `@wordpress/api-fetch` middleware (cookie auth). |
| Capability gating | `current_user_can('manage_options')` → `wp_die()` (`options-discussion.php:11-13`) | REST `get_item_permissions_check` returns `current_user_can('manage_options')` (`class-wp-rest-settings-controller.php:67-69`); app cap floor via app.json | 🟢 | Same `manage_options` cap on both paths. |
| Loading state | Full page render (server) | Centered `<Spinner/>` until `record` resolves (`EntityDataForm.js:46-52`) | 🟢 | Idiomatic null-guard. |
| Error state | PHP redirect w/ `settings-updated` / WP_Error | Error notice via `useEntitySave` catch (`useEntitySave.js:30-33`) | 🟡 | Covers the 2 fields; no per-section partial-failure UI (no multi-field batch to fail). |
| Success feedback | `settings_errors()` "Settings saved." admin notice | Snackbar "Settings saved." (`index.js:50`, `useEntitySave.js:29`) | 🟢 | Equivalent. |
| Dirty-state guard | None (full page form) | `core:dirty-state: true` (`app.json:9-11`); Save disabled until `hasEdits` | 🟢 | Shell improves on classic. |
| Help tab "Overview" + help sidebar | `add_help_tab` + `set_help_sidebar` w/ doc links (`options-discussion.php:21-34`) | Absent | 🔴 | No help-tab surface in the shell generally; minor. |
| Conditional UI: avatar groups hidden when `show_avatars` off | `hide-if-js` class + JS (`options_discussion_add_js`) (`options-discussion.php:222-225`) | N/A (fields absent) | ⛔ | Depends on the missing avatar fields. |
| Conditional UI: depth/pagination selects disabled when parent off | JS in `options_discussion_add_js` | N/A (fields absent) | ⛔ | Depends on missing fields. |
| Plugin extension slots (`do_settings_fields('discussion','default'|'avatars')`, `do_settings_sections('discussion')`) | Renders plugin-registered fields (`options-discussion.php:211,323,326`) | Absent | 🔴 | No `core:settings.panels` slot wired for this app. Shell-side. |
| Filter `thread_comments_depth_max` | Sets depth-select max (`options-discussion.php:103`) | N/A | ⛔ | Server-only computed value; not exposed. |
| Filter `avatar_defaults` / `default_avatar_select` | Extend/replace avatar list (`options-discussion.php:294,318`) | N/A | ⛔ | Server-only; not exposed. |
| a11y: fieldset/legend grouping | Each group `<fieldset><legend class="screen-reader-text">` (`options-discussion.php:49,68,127,…`) | DataForm default field semantics; only 2 fields, no grouping needed | 🟡 | Acceptable for 2 fields; would need grouping if rebuilt full. |

## Functional divergences

Behaviors present in BOTH but working differently.

1. **`open`/`closed` ↔ boolean mapping.**
   - wp-admin renders `default_comment_status` / `default_ping_status` as checkboxes whose checked state writes the literal string `open` (`options-discussion.php:55,59`; `value="open"`).
   - The shell models them as `type: 'boolean'` DataForm fields and translates with `getValue: ({item}) => item.x === 'open'` / `setValue: ({value}) => ({ x: value ? 'open' : 'closed' })` (`src/apps/settings-discussion/index.js:18-34`).
   - User-visible consequence: identical toggle behavior. The REST enum schema (`option.php:2937-2940,2951-2954`) enforces `open`/`closed`, so the mapping is safe. No divergence in outcome; just an implementation note.

2. **Save scope.**
   - wp-admin's single Save persists all 25 options atomically through `options.php` (`$allowed_options['discussion']`, `options.php:103-129`).
   - The shell's single Save persists only the 2 REST-exposed fields (`EntityDataForm.js:73-83` over `useEntityRecord('root','site').save`).
   - User-visible consequence: a user toggling the 2 available fields gets the same result; a user expecting to manage moderation/avatars finds those controls simply absent (with a notice).

3. **Notice content differs (intentional).**
   - wp-admin shows a `<p class="description">` "Individual posts may override these settings…" under Default post settings (`options-discussion.php:62`).
   - The shell omits that and instead renders a REST-gap notice: "The fine-grained discussion settings … are not exposed by the WordPress REST API. Use the legacy Discussion Settings screen for those fields." (`src/apps/settings-discussion/index.js:54-59`).
   - User-visible consequence: the shell tells the truth about the gap rather than pretending parity; arguably better UX given the limitation, but the original helper text is lost.

4. **Spec doc errors (report, not an app bug).**
   - `docs/screens/settings-discussion.md:62,185,307` lists `default_pingback_flag` as REST-exposed and asserts "three of ~24 options are REST-exposed". Verified against `register_initial_settings()` (`wp-includes/option.php:2932-2959`): only **2** discussion options are registered (`default_ping_status`, `default_comment_status`); `default_pingback_flag` has **no** `show_in_rest`. The app correctly implements 2 fields, so the spec is wrong, not the code.
   - The same spec references `src/apps/settings-panels/SettingsDiscussionApp.js` (lines 5, 306, 341) — a path that no longer exists; the app is `src/apps/settings-discussion/index.js`.

## API & platform blockers

The heart of the audit. Every field below is invisible to `@wordpress/core-data` because `WP_REST_Settings_Controller::get_registered_options()` skips any setting with `empty($args['show_in_rest'])` (`class-wp-rest-settings-controller.php:221-223`) and iterates only that filtered set in both `get_item` (line 80) and `update_item` (line 146). The options exist as DB rows (`schema.php:435-565`) but are not surfaced.

**Verified REST-exposed discussion options (2 of 25):** `default_ping_status`, `default_comment_status` — registered in `register_initial_settings()` at `wp-includes/option.php:2932-2944` and `:2946-2959`. Both run on `rest_api_init` (`default-filters.php:533`).

**Missing from REST (23 options) — each NOT found in any `register_setting(... show_in_rest ...)` call in core** (only `option.php`, `connectors.php`, and block `site-logo.php` register settings; none of these 23 appear):

| # | Option | Default (schema.php) | Group | Tag |
|---|---|---|---|---|
| 1 | `default_pingback_flag` | `1` | Default post settings | ⛔ [upstream] / [shell] |
| 2 | `require_name_email` | `1` | Other comment settings | ⛔ [upstream] / [shell] |
| 3 | `comment_registration` | `0` (`schema.php:459`) | Other comment settings | ⛔ [upstream] / [shell] |
| 4 | `close_comments_for_old_posts` | `0` (`schema.php:500`) | Other comment settings | ⛔ [upstream] / [shell] |
| 5 | `close_comments_days_old` | `14` (`schema.php:501`) | Other comment settings | ⛔ [upstream] / [shell] |
| 6 | `show_comments_cookies_opt_in` | `1` (`schema.php:539`) | Other comment settings | ⛔ [upstream] / [shell] |
| 7 | `thread_comments` | `1` (`schema.php:502`) | Other comment settings | ⛔ [upstream] / [shell] |
| 8 | `thread_comments_depth` | `5` (`schema.php:503`) | Other comment settings | ⛔ [upstream] / [shell] |
| 9 | `page_comments` | `0` (`schema.php:504`) | Comment Pagination | ⛔ [upstream] / [shell] |
| 10 | `comments_per_page` | `50` (`schema.php:505`) | Comment Pagination | ⛔ [upstream] / [shell] |
| 11 | `default_comments_page` | `newest` (`schema.php:506`) | Comment Pagination | ⛔ [upstream] / [shell] |
| 12 | `comment_order` | `asc` (`schema.php:507`) | Comment Pagination | ⛔ [upstream] / [shell] |
| 13 | `comments_notify` | `1` (default true) | Email me whenever | ⛔ [upstream] / [shell] |
| 14 | `moderation_notify` | `1` (`schema.php:442`) | Email me whenever | ⛔ [upstream] / [shell] |
| 15 | `wp_notes_notify` | `1` (`schema.php:565`, WP 6.9) | Email me whenever | ⛔ [upstream] / [shell] |
| 16 | `comment_moderation` | `0` (`schema.php:441`) | Before a comment appears | ⛔ [upstream] / [shell] |
| 17 | `comment_previously_approved` | `1` (`schema.php:546`) | Before a comment appears | ⛔ [upstream] / [shell] |
| 18 | `comment_max_links` | `2` (`schema.php:451`) | Comment Moderation | ⛔ [upstream] / [shell] |
| 19 | `moderation_keys` | `''` (`schema.php:447`) | Comment Moderation | ⛔ [upstream] / [shell] |
| 20 | `disallowed_keys` | `''` (`schema.php:545`) | Disallowed Comment Keys | ⛔ [upstream] / [shell] |
| 21 | `show_avatars` | `'1'` (`schema.php:482`) | Avatars | ⛔ [upstream] / [shell] |
| 22 | `avatar_rating` | `G` (`schema.php:483`) | Avatars | ⛔ [upstream] / [shell] |
| 23 | `avatar_default` | `mystery` (`schema.php:492`) | Avatars | ⛔ [upstream] / [shell] |

**Closability — this blocker is both [upstream] AND [shell]:**

- **[upstream]** — the clean fix is for WordPress core to add these to `register_initial_settings()` in `wp-includes/option.php`, exactly as the 2 existing discussion options are registered. Then every REST client (including the shell unchanged) gains the fields. This is the "right" fix but requires a core ticket + release cycle.
- **[shell]** — the shell can close the entire gap itself, today, with no upstream dependency: call `register_setting( 'discussion', '<option>', [ 'type' => …, 'show_in_rest' => … ] )` for each of the 23 options on the `rest_api_init` hook (priority after `register_initial_settings`, which is 10). Because `WP_REST_Settings_Controller::get_registered_options()` reads `get_registered_settings()` live (`class-wp-rest-settings-controller.php:220`), the options then appear in the **existing** `/wp/v2/settings` endpoint — no custom endpoint, no new controller. `useEntityRecord('root','site')` would pick them up automatically. The shell already owns a PHP layer (`includes/`) and could ship this as a small "expose discussion settings to REST" module. This is the recommended path and is strictly better than the screen-spec's suggestion of a custom `/wp-admin-workspaces/v1/options/discussion` endpoint, which would duplicate sanitization the Settings API already does.

**Server-only computations (not closable by exposing an option — genuinely [upstream] if needed):**

- `thread_comments_depth_max` filter result (`options-discussion.php:103`) — the depth `<select>`'s max bound is computed server-side per request; a REST client can't know it without a dedicated endpoint or a registered read-only setting.
- `avatar_defaults` / `default_avatar_select` filters (`options-discussion.php:294,318`) — the avatar option list (10 built-in + filter additions) and its rendered HTML are server-side; a faithful avatar picker would need the resolved list exposed (no REST surface today).
- Live avatar preview images (`get_avatar(..., force_default=true)`, `options-discussion.php:304`) — server-rendered `<img>`; a JS port would call `https://gravatar.com/avatar/...?d=<style>&f=y` directly (doable client-side, but not via WP REST).
- `do_settings_fields('discussion', …)` / `do_settings_sections('discussion')` plugin extensions (`options-discussion.php:211,323,326`) — arbitrary plugin-registered fields/markup; no REST representation. The shell would surface these only via its own `core:settings.panels` slot mechanism, and only for plugins that opt in.

**Security/nonce:** the classic save is nonce-gated via `settings_fields('discussion')` (`options-discussion.php:43`). The REST path is cookie+nonce-authenticated through `@wordpress/api-fetch`'s middleware — equivalent, not a blocker.

## DataViews / DataForms review

The app uses `DataForm` (via the shared `src/apps/_shared/forms/EntityDataForm.js`). Usage is **idiomatic** for the 2 fields it renders:

- `data = editedRecord`, `onChange = edit` (`EntityDataForm.js:67-70`) — correct: `DataForm`'s `onChange` returns the same partial-object shape `useEntityRecord`'s `edit` consumes, per the CLAUDE.md forms pattern.
- The `open`/`closed` ↔ boolean mapping via per-field `getValue`/`setValue` (`index.js:18-34`) is the documented DataForm idiom for string↔non-string round-tripping (matches the `settings-reading`/`settings-writing` panels and the CLAUDE.md note "open/closed ↔ boolean via getValue/setValue").
- Null-guard spinner before `record` resolves (`EntityDataForm.js:46-52`) — correct per the entity-record null-guard rule.

**No misuse or anti-pattern in the existing code.** The `_shared/forms/EntityDataForm.js` shell is clean and reused correctly.

**Component limitations that would bite a full rebuild** (relevant because the real blocker is data, but if the data were exposed the UI is the next question):

- **Nested/dependent fields.** wp-admin nests `close_comments_days_old` under `close_comments_for_old_posts`, `thread_comments_depth` under `thread_comments`, and the 3 pagination selects under `page_comments` (disabled when the parent is off). `DataForm` supports `isVisible(item)` for conditional fields (used elsewhere in the shell per CLAUDE.md), so this is expressible — but the *disabled-but-present* semantics of the classic screen (controls stay visible, greyed) don't map cleanly to `isVisible` (which hides). Minor fragility, not a blocker.
- **Textareas.** `moderation_keys` / `disallowed_keys` are large textareas. `DataForm` field `type: 'text'` with a multiline edit control is available; acceptable.
- **Radio with rich labels + images.** `avatar_default` is a radio group where each option carries a live avatar `<img>`. `DataForm`'s element-based fields render plain labels; the image previews would need a custom field `Edit` component (DataForm supports custom field components). Workable but non-trivial.
- **`<optgroup>` / numeric-with-min selects.** `thread_comments_depth` (2..max) and the number inputs (`comment_max_links`, `comments_per_page`, `close_comments_days_old`) map to `type: 'integer'` fields fine.

The app does **not** hand-roll anything DataForm could do better; the gap is purely the absent data, not the form layer. If the REST shim lands, the full panel is a straightforward DataForm expansion (likely a hand-rolled section grouping like `settings-general`, which CLAUDE.md notes "stays hand-rolled" for `<optgroup>`/preset-radio cases — the avatar radios + nested groups here are a similar candidate).

## Recommendations / future work

**P1 — Expose the 23 missing discussion options to REST [shell].**
Ship a PHP module under `includes/` that, on `rest_api_init`, calls `register_setting('discussion', $option, [ 'type' => …, 'show_in_rest' => … ])` for every option in `wp-admin/options.php`'s `$allowed_options['discussion']` that core doesn't already register. Use the correct `type`/enum for each (booleans for the flags, `integer` for `close_comments_days_old`/`comments_per_page`/`comment_max_links`/`thread_comments_depth`, `string` enums for `default_comments_page`/`comment_order`/`avatar_rating`/`avatar_default`, `string` for the textareas). This closes the entire blocker through the existing `/wp/v2/settings` endpoint with zero upstream dependency. *Why:* it is the single biggest settings-parity gap in the shell, and the controller reads registered settings live (`class-wp-rest-settings-controller.php:220`). *Where:* new `includes/*-rest-discussion-settings.php` (or fold into an existing settings-exposure module). *Side note:* upstream this too (a WP core ticket to add them to `register_initial_settings`) so the shim can eventually be deleted.

**P1 — Expand the DataForm to cover the full surface once the data is exposed [shell].**
Replace the 2-field `FIELDS`/`FORM` in `src/apps/settings-discussion/index.js` with the full set, grouped to mirror the 7 classic sections. Reuse `_shared/forms/EntityDataForm.js`. Use `isVisible(item)` for the nested dependencies, custom field `Edit` components for the avatar radios + previews. Consider a hand-rolled layout (as `settings-general` does) if DataForm's flat field model fights the nested/disabled-control semantics. *Why:* parity. *Where:* `src/apps/settings-discussion/index.js`.

**P2 — Fix the screen-spec inaccuracies [shell, docs].**
Correct `docs/screens/settings-discussion.md`: (a) `default_pingback_flag` is NOT REST-exposed — only 2 options are (lines 58-65, 184-188, 305-307); (b) update the stale impl path `src/apps/settings-panels/SettingsDiscussionApp.js` → `src/apps/settings-discussion/index.js` (lines 5, 306, 341); (c) the "use a custom `/wp-admin-workspaces/v1/options/discussion` endpoint" recommendation (line 239) should be revised to "register the options with `show_in_rest`" — the custom endpoint is unnecessary given P1. *Why:* the spec currently mis-states the REST coverage that this whole panel hinges on. *Where:* `docs/screens/settings-discussion.md`.

**P2 — Wire the moderation-queue cross-link [shell].**
The classic "moderation queue" link (`options-discussion.php:195`) should map to the shell's `comments` app filtered to held comments (`?status=hold` / `#/comments?status=hold`). *Why:* completes an inter-app navigation the spec already documents (§11). *Where:* `src/apps/settings-discussion/index.js` (add to the notice or near `moderation_keys` once exposed).

**P3 — Restore the per-section helper text and consider a `core:settings.panels` extension slot [shell].**
Re-add "Individual posts may override these settings…" and any per-group descriptions when the fields land; and decide whether to honor plugin `do_settings_fields('discussion', …)` extensions via a settings slot. *Why:* polish + third-party extensibility parity. *Where:* `src/apps/settings-discussion/index.js`, plus host slot wiring in `core:settings`.

**P3 — Surface server-only computed values if full fidelity is wanted [upstream].**
`thread_comments_depth_max` and the resolved `avatar_defaults` list have no REST surface. If the shell wants the depth `<select>` max and the avatar option list to exactly track filters, that needs either a tiny custom read endpoint or an upstream change. Low priority — sensible client-side defaults (max 10; the 10 built-in avatar styles) cover the overwhelming majority of installs. *Where:* upstream WP, or a shell read-only endpoint.
