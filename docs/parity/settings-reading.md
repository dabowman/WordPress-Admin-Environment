# Parity: Settings — Reading (core:settings-reading)

> Audited 2026-05-29 against WordPress 7.0 core. Shell app: `src/apps/settings-reading/`. Classic counterpart: `wp-admin/options-reading.php` + `wp-admin/options.php` (the legacy save handler).

## Verdict

**`posts_per_rss` + `rss_use_excerpt` now shimmed (issue #106); `blog_public` still a gap.** Of the six fields the shell renders, `show_on_front`, `page_on_front`, `page_for_posts`, and `posts_per_page` round-trip through core's own `/wp/v2/settings` registrations. The remaining options the screen owns — `posts_per_rss`, `rss_use_excerpt`, and `blog_public` — are **not registered with `show_in_rest`** in WordPress core (verified: zero `register_setting` matches across the entire `wordpress-develop/src` tree). As shipped against unmodified core the screen *rendered* `posts_per_rss` and `rss_use_excerpt` as live fields that were silent no-ops (GET omitted them → read as `undefined`; PATCH dropped them). **The shell now backs both shell-side** (issue #106): `register_setting('reading','posts_per_rss', integer, show_in_rest)` and `register_setting('reading','rss_use_excerpt', boolean, show_in_rest)` (`wp-admin-shell.php`), so the existing DataForm fields round-trip unchanged. `blog_public` remains an honest, documented gap (the app omits the control and points at the legacy screen), and the `blog_charset` field is still absent — closing those needs an upstream `show_in_rest` change or a further shell shim.

## Counterpart mapping

- **Classic screen(s):**
  - `wp-admin/options-reading.php` — the form markup (`src/wp-admin/options-reading.php:60-251`). Not powered by a list-table; it is a hand-rolled `<form method="post" action="options.php">` built from `get_option()` reads + `wp_dropdown_pages()`.
  - `wp-admin/options.php` — the **save handler**. It defines the `reading` option allowlist (`src/wp-admin/options.php:142-156`) including `posts_per_rss`, `rss_use_excerpt`, `blog_public`, and conditionally `blog_charset`, then `update_option()`s each on POST. This is the non-REST write path.
  - `wp-includes/option.php` — `register_initial_settings()` (`src/wp-includes/option.php:2741-2960`) is the authoritative list of what the REST settings endpoint exposes.
- **REST / core-data surface the shell app uses:**
  - `GET`/`POST /wp/v2/settings` via `useEntityRecord('root','site')` (`src/apps/settings-reading/index.js:148`, through `src/apps/_shared/forms/EntityDataForm.js:42-43`). Controller: `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php`.
  - `GET /wp/v2/pages` via `useEntityRecords('postType','page', { per_page:100, status:'publish', orderby:'title', _fields:'id,title', context:'edit' })` (`src/apps/settings-reading/index.js:46-53`) — populates the two page selects.
- **Project screen spec:** `docs/screens/settings-reading.md` — **present** and unusually thorough. It already enumerates the REST gap correctly (its §4 "Non-REST options" table lists `posts_per_rss`, `rss_use_excerpt`, `blog_public`, `blog_charset` as legacy-only). **Doc-drift gap:** the spec's header still points at the stale path `src/apps/settings-panels/SettingsReadingApp.js` (the real file is `src/apps/settings-reading/index.js`) — flag for a docs fix.

## Feature parity matrix

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| **"Your homepage displays" radio** (`show_on_front`) | Radio: latest posts vs static page (`options-reading.php:92-107`) | `Edit:'radio'` field, elements `posts`/`page` (`index.js:64-79`) | full | REST `show_on_front` is registered (`option.php:2900-2909`). |
| **Homepage select** (`page_on_front`) | `wp_dropdown_pages()`, visible only in static-page mode (`options-reading.php:108-125`) | `Edit:'select'`, `isVisible: showsStaticPage` (`index.js:80-91`) | partial | Value round-trips (REST `page_on_front`, `option.php:2911-2920`). Divergences below (hierarchy, conditional render). |
| **Posts page select** (`page_for_posts`) | `wp_dropdown_pages()` (`options-reading.php:126-142`) | `Edit:'select'`, `isVisible: showsStaticPage` (`index.js:92-103`) | partial | REST `page_for_posts` registered (`option.php:2922-2929`). |
| **"Blog pages show at most"** (`posts_per_page`) | `<input type=number min=1>` + "posts" unit (`options-reading.php:177-182`) | `type:'integer'`, clamped floor 1 / default 10 (`index.js:104-112`, `clampPerPage` `index.js:40-43`) | full | REST `posts_per_page` registered, default 10 (`option.php:2888-2898`). Unit suffix "posts" not shown (cosmetic). |
| **"Syndication feeds show the most recent"** (`posts_per_rss`) | `<input type=number min=1>` + "items" unit; saved via `options.php` allowlist (`options-reading.php:183-186`, `options.php:144`) | `type:'integer'` field rendered + clamped (`index.js:113-124`) | ✅ full | core never `show_in_rest`-registers it, but the **shell shims it** (`register_setting('reading','posts_per_rss', integer, default 10, show_in_rest)`, `wp-admin-shell.php`). Field round-trips; clamp floor 1. |
| **"For each post in a feed, include" radio** (`rss_use_excerpt`) | Radio Full text(0)/Excerpt(1); saved via `options.php` (`options-reading.php:188-207`, `options.php:145`) | `Edit:'radio'` 0/1 ↔ boolean (`index.js:125-141`) | ✅ full | core never `show_in_rest`-registers it, but the **shell shims it** (`register_setting('reading','rss_use_excerpt', boolean, show_in_rest)`, `wp-admin-shell.php`). The boolean cast stores `'1'`/`''`, which the feed templates' truthy `get_option()` checks honor. |
| **"Search engine visibility"** (`blog_public`) | Checkbox "Discourage…" (or radio set if `blog_privacy_selector` action hooked); saved via `options.php` (`options-reading.php:209-243`, `options.php:149`) | **Omitted.** Renders an in-form `<Text>` notice pointing at legacy screen (`index.js:157-162`) | missing | **`blog_public` NOT `show_in_rest`.** App correctly does not fake it. Honest gap. |
| **"Encoding for pages and feeds"** (`blog_charset`) | Conditional text field, only when `! is_utf8_charset()` (`options-reading.php:67-69`, `options.php:177`) | Not present | missing | Rare on modern installs; not `show_in_rest`. Low priority but a true gap. |
| **Same-page warning** (homepage == posts page) | Inline warning notice when `page_for_posts === page_on_front` (`options-reading.php:144-156`) | Not implemented | missing | Pure client-side validation — **shell-side closeable** (both values are in the edited record). |
| **Privacy-policy collision warning** | Inline warning when either page == `wp_page_for_privacy_policy` (`options-reading.php:158-172`) | Not implemented | missing | `wp_page_for_privacy_policy` **is** REST-exposed (`option.php`, `wp_page_for_privacy_policy` registered). Shell could fetch + warn. **Shell-side.** |
| **"No pages exist" → hide static-page radio** | If `! get_pages()`, hard-locks `show_on_front=posts` and hides the radio (`options-reading.php:72-79`) | Radio always shown; static-page option selectable with only the "— Select —" placeholder | partial | Divergence: shell lets you pick "A static page" with no pages to assign. Server reverts silently on next load (see below). |
| **Auto-revert when static page misconfigured** | On render, if `show_on_front=page` but both page IDs are 0, core `update_option('show_on_front','posts')` (`options-reading.php:81-83`) | Not replicated | missing | Side-effecting read; shell would have to mirror the rule client-side. |
| **Hierarchical, indented page list** | `wp_dropdown_pages` → `get_pages(hierarchical=1)` + `Walker_PageDropdown` indents children with `&nbsp;`×depth×3 (`class-walker-page-dropdown.php:66`) | Flat list, `orderby:title` ASC (`index.js:49-51`) | partial | Shell loses parent/child indentation. Hierarchy info is in REST (`parent`, `menu_order`) — **shell-side** fix. |
| **Page list ordering** | `sort_column => post_title` ASC (`post.php:6416`, `get_pages` default) | `orderby:'title', order:'asc'` (`index.js:49-50`) | full | Matches. |
| **Page list scope** | `post_status => publish` (`post.php:6428`) | `status:'publish'` (`index.js:48`) | full | Matches. |
| **Page list cap** | No cap (lists all pages) | `per_page:100` (`index.js:47`) | partial | Sites with >100 pages truncate silently. REST hard-caps `per_page` at 100; needs pagination loop. **Shell-side.** |
| **Save button** | `submit_button()` → full POST to `options.php` (`options-reading.php:250`) | `EntityDataForm` Save (brand button, disabled until `hasEdits`, `loading` while saving) (`EntityDataForm.js:73-83`) | full (for the 3 REST keys) | But "save" reports success even when the 3 non-REST fields were dropped — see Divergences. |
| **Capability gating** | `current_user_can('manage_options')` → `wp_die()` (`options-reading.php:12-14`) | `app.json` declares `"role":"main"`; host panel declares `capability:'manage_options'` (`src/apps/settings/index.js:65`); REST controller enforces `manage_options` (`class-wp-rest-settings-controller.php:67-69`) | full | Server-side floor identical. |
| **Nonce / security** | `settings_fields('reading')` emits `_wpnonce` + option-page nonce (`options-reading.php:65`) | core-data sends `X-WP-Nonce` automatically via `apiFetch` middleware | full | Equivalent; handled by the data layer. |
| **Help tabs** | Two tabs ("Overview", "Site/Search engine visibility") + help sidebar (`options-reading.php:22-55`) | None | missing | No help-tab equivalent anywhere in the shell. Cross-cutting gap, not unique to this app. |
| **Empty state** | N/A (settings always present) | `EntityDataForm` shows `<Spinner/>` until `record` resolves (`EntityDataForm.js:46-52`) | full | Loading guard correct. |
| **Error state** | Settings API redirects with `settings-updated`/error transient | `useEntitySave` try/catch → dismissible error notice (`useEntitySave.js:30-33`) | partial | Catches REST 4xx/5xx, but cannot catch the *silent drop* of non-REST keys (no error is raised). |
| **Success feedback** | `settings_errors()` "Settings saved." admin notice | `createSuccessNotice(..., {type:'snackbar'})` (`useEntitySave.js:29`) | full | Snackbar. Note false-positive risk for dropped fields. |
| **Extensibility — `blog_privacy_selector` action** | Swaps the checkbox for a radio set + renames heading to "Site visibility" (`options-reading.php:214-236`) | No equivalent (whole `blog_public` field omitted) | missing | Third-party hook entirely unreachable. |
| **Extensibility — `do_settings_fields`/`do_settings_sections('reading')`** | Plugins inject extra reading fields/sections (`options-reading.php:245,248`) | No injection point | missing | Plugin-registered Settings-API reading fields don't surface. |
| **a11y — fieldset/legend grouping** | `<fieldset><legend class=screen-reader-text>` around radio groups (`options-reading.php:90-91,191-192`) | DataForm `radio` control renders its own grouped markup | partial | Idiomatic DataForm a11y; structurally different but accessible. |
| **a11y — `label for` association** | Explicit `for="page_on_front"` etc. (`options-reading.php:109,126,178`) | DataForm associates labels internally | full | Equivalent. |

## Functional divergences

Behaviors present in both but implemented differently, with the user-visible consequence:

1. **Silent-success on discarded fields — resolved for the feed options (issue #106).**
   - Classic: every reading option (`posts_per_rss`, `rss_use_excerpt`, `blog_public`) is in the `options.php` allowlist (`src/wp-admin/options.php:142-156`) and is persisted by `update_option()` on POST. "Settings saved." means *all* of them saved.
   - Shell (historic): `useEntityRecord('root','site').save()` PATCHes `/wp/v2/settings`. The controller's `update_item()` iterates **only** `get_registered_options()` and does `if ( ! array_key_exists( $name, $params ) ) continue;` (`class-wp-rest-settings-controller.php:145-152` + the `get_registered_options` filter at `:215-218` that skips `empty($args['show_in_rest'])`). Unregistered keys were never iterated, so a 10 → 25 change to "Syndication feeds show the most recent" reverted on reload despite the success snackbar — a data-integrity / trust bug.
   - **Now:** the shell `register_setting`s `posts_per_rss` + `rss_use_excerpt` on the `reading` group with `show_in_rest` (`wp-admin-shell.php`), so both are iterated and persisted. The remaining unregistered reading option the screen could surface is `blog_public`, which the app deliberately omits (pointing at the legacy screen) rather than fake.

2. **Page select shows a flat list, not the hierarchical tree.**
   - Classic: `wp_dropdown_pages()` → `get_pages(hierarchical=1)` (`src/wp-includes/post.php:6417`) + `Walker_PageDropdown` indents children by `str_repeat('&nbsp;', $depth*3)` (`src/wp-includes/class-walker-page-dropdown.php:66`).
   - Shell: `pageOptions` is a flat `pages.records.map(...)` with no depth/indentation (`src/apps/settings-reading/index.js:56-62`).
   - **Consequence:** on sites with nested pages, the selects lose the visual parent/child structure, making it harder to find the right child page.

3. **Static-page mode reveals selects regardless of whether any pages exist.**
   - Classic: when `! get_pages()`, the entire homepage-display radio is replaced by a hidden `show_on_front=posts` input — the user literally cannot choose "static page" (`src/wp-admin/options-reading.php:72-79`).
   - Shell: the radio always renders both options; choosing "A static page" reveals two selects that contain only "— Select —" (`src/apps/settings-reading/index.js:25-26, 86, 98`).
   - **Consequence:** the shell offers an unsatisfiable choice; the server then silently reverts `show_on_front` to `posts` on the next page load (`options-reading.php:81-83`), which the shell does not reflect, so the UI can disagree with the stored state until refresh.

4. **No same-page / privacy-page warnings.**
   - Classic: inline warning banners when homepage == posts page (`options-reading.php:144-156`) or when either equals the privacy-policy page (`options-reading.php:158-172`).
   - Shell: no validation; both selects can be set to the same page with no feedback (`index.js` has no cross-field check).
   - **Consequence:** the user can create a self-referential / privacy-colliding configuration with no warning. (Server does not block it either, so behavior matches functionally — but the *guidance* is lost.)

5. **`posts_per_page` clamp differs from the native control.**
   - Classic: `<input type=number step=1 min=1>` — the browser enforces `min=1`, and `options.php`/`sanitize_option` coerce; an empty submit keeps the old value.
   - Shell: `clampPerPage` forces any empty/zero/invalid value to **10** (the default), not to the previous value (`src/apps/settings-reading/index.js:40-43`).
   - **Consequence:** clearing the field and saving resets to 10 rather than preserving the prior custom count. Defensible (avoids the `posts_per_page=0` pagination break) but is a behavioral difference from the native min-constraint.

## API & platform blockers

The hard parity blockers — what wp-admin does that the shell **cannot** do via REST / core-data today. Each verified against live 7.0 source.

1. ✅ **RESOLVED (shell shim) — `posts_per_rss` is not exposed by core's `/wp/v2/settings`.** `[shell]`
   - Evidence: zero `register_setting( …, 'posts_per_rss', … )` anywhere in `wordpress-develop/src` (grep `register_setting` ∩ `posts_per_rss` → none). It exists only as an `update_option` target in `options.php` and is read by feed templates (`feed-rss2.php`, `feed-atom.php`, `feed-rdf.php`). Default seeded in `wp-admin/includes/schema.php:424`.
   - Why it used to block: the settings controller's `get_registered_options()` skips any option with `empty($args['show_in_rest'])` (`class-wp-rest-settings-controller.php:215-218`), so an unregistered key is absent from both the GET response and the request schema.
   - Resolution: the shell `register_setting('reading','posts_per_rss', ['show_in_rest'=>true,'type'=>'integer','default'=>10])` (`wp-admin-shell.php`), so the key now appears in the GET response + request schema and the existing DataForm field round-trips. Upstream registration would still be the clean cross-client fix.

2. ✅ **RESOLVED (shell shim) — `rss_use_excerpt` is not exposed by core's `/wp/v2/settings`.** `[shell]`
   - Evidence: zero `register_setting` match for `rss_use_excerpt`. Read by the same feed templates; default in `schema.php:425`.
   - Resolution: shell `register_setting('reading','rss_use_excerpt', ['show_in_rest'=>true,'type'=>'boolean','default'=>false])` (`wp-admin-shell.php`). The app's `0|1 ↔ boolean` mapping (`index.js:137-140`) writes a boolean; `update_option` stores `'1'`/`''`, which the feed templates' truthy `get_option()` checks honor.

3. **`blog_public` (search-engine visibility) is not exposed by `/wp/v2/settings`.** `[upstream]`
   - Evidence: zero `register_setting` match for `blog_public`. It is consumed widely (dashboard "Search engines discouraged" notice in `wp-admin/includes/dashboard.php`, Site Health, `class-wp-debug-data.php`), seeded in `schema.php:474`, but never REST-registered.
   - The shell app explicitly acknowledges this (`src/apps/settings-reading/index.js:157-162`) and points users to the legacy screen — the honest, correct stopgap.
   - Fix surface: upstream — `register_setting('reading','blog_public', ['show_in_rest'=>true,'type'=>'integer'])`. Note the `blog_privacy_selector` action variant (`options-reading.php:214-236`) is a server-rendered hook that cannot be represented in a static REST schema even if the value were exposed — that extensibility point is permanently `[upstream]`.

4. **`blog_charset` is not exposed by `/wp/v2/settings`.** `[upstream]`
   - Evidence: no `register_setting`; conditionally added to the classic form only when `! is_utf8_charset()` (`options-reading.php:67-69`). Effectively dead on UTF-8 installs, but a true gap on legacy ones.

5. **The `do_settings_fields('reading')` / `do_settings_sections('reading')` plugin extension points have no REST equivalent.** `[upstream]`
   - Evidence: `options-reading.php:245,248`. Plugins that register reading-settings fields via the Settings API render only on the PHP screen; there is no REST surface that enumerates Settings-API-registered fields/sections for a given page. The shell cannot discover or render them.

6. **The `blog_privacy_selector` action (radio-set + "Site visibility" rename) is server-render-only.** `[upstream]`
   - Evidence: `options-reading.php:209,214-236`. Even if `blog_public` were REST-exposed, this `do_action` injects arbitrary HTML/extra radio choices that a JSON settings schema cannot describe.

7. **Side-effecting read-time mutations cannot be reproduced from REST.** `[shell]` (mitigation) / `[upstream]` (root)
   - Classic mutates state *on render*: auto-reverts `show_on_front` to `posts` when no pages exist or when the static config is incomplete (`options-reading.php:76-83`). REST GET `/wp/v2/settings` is a pure read and will not apply these rules; the shell would have to re-implement them client-side to match. There is no REST endpoint that performs the "validate-and-normalize reading config" computation.

> Not a blocker (verified positive): `show_on_front`, `page_on_front`, `page_for_posts`, `posts_per_page` are all `show_in_rest => true` (`src/wp-includes/option.php:2888-2929`), and the page list is fully available via `GET /wp/v2/pages` with `parent`/`menu_order` for hierarchy. The page-select divergences (#2 above) are therefore **shell-side**, not API blockers.

## DataViews / DataForms review

The app uses `@wordpress/dataviews` `DataForm` (via the shared `EntityDataForm`). Verified against the installed package, **@wordpress/dataviews 14.0.0**.

- **Idiomatic — yes, the field configs are valid.** `getControl()` resolves `field.Edit` strings against the `FORM_CONTROLS` registry (`node_modules/@wordpress/dataviews/build-module/components/dataform-controls/index.mjs`), which includes `radio`, `select`, `integer`, `text`, etc. So `Edit:'radio'` (`index.js:68,132`), `Edit:'select'` (`index.js:84,97`), and bare `type:'integer'` (which defaults `Edit` to the integer control) are all correct. The `type:'text'` + explicit `Edit:'select'`/`'radio'` pairing is fine — `text` is a registered field type and an explicit `Edit` overrides the type's default control.
- **`getValue`/`setValue` value-mapping is the documented idiom.** The `0|1 ↔ boolean` map for `rss_use_excerpt` (`index.js:137-140`) and the `int ↔ string` maps for the page selects (`index.js:87-90, 99-102`) mirror the sibling `settings-discussion` app's `open|closed ↔ boolean` pattern (`src/apps/settings-discussion/index.js:18-33`) and match the project's codified DataForm idioms (CLAUDE.md "single-record edit forms use DataForm"). No anti-pattern.
- **`isVisible` conditional fields** (`index.js:86,98` → `showsStaticPage`) is the correct DataForm mechanism for the static-page-only selects — not a hand-rolled `&&`.
- **Defensible workaround:** `clampPerPage` (`index.js:40-43`) lives in `setValue` rather than relying on a DataForm field validator. DataViews 14 *does* ship `is-valid-min`/`is-valid-max` validators (`build-module/field-types/utils/is-valid-min.mjs`), so a `type:'integer'` field could declare a `min:1` and surface a native validation message instead of silently coercing to 10. The current clamp is safe but swallows the error rather than reporting it — minor.
- **Shared-helper soundness:** `EntityDataForm` (`src/apps/_shared/forms/EntityDataForm.js`) correctly null-guards `record` before render (`:46-52`) and wires `data=editedRecord` / `onChange=edit` (`:67-70`) per the documented pattern. No fragility found in the shared layer.
- **Component limitation that bites parity:** none of the DataForm limitations block this screen. The blockers here are **REST**, not DataViews — the three dead fields would render perfectly in DataForm if the data layer carried them. The one thing DataForm cannot express is the classic *cross-field inline warning* (same-page / privacy collision); DataForm has per-field validation but no built-in cross-field banner, so that would need a sibling `<Notice>` rendered alongside the form (the `EntityDataForm` `children` slot, `:72`, is the natural seam).

## Recommendations / future work

**P1 — ✅ Done — stop rendering dead fields as if they save (data-integrity bug).** `[shell]`
The `posts_per_rss` and `rss_use_excerpt` fields (`src/apps/settings-reading/index.js:113-141`) used to look functional but were silently discarded on save (see Divergence #1). **Resolved by backing them with `register_setting(show_in_rest)` shims** on the `reading` group (`wp-admin-shell.php`) rather than removing the controls — the existing DataForm fields round-trip unchanged. `app.json#documentation.data.reads/writes` + `app.md` already listed `posts_per_rss`/`rss_use_excerpt` as REST-backed reads/writes; those are now accurate.

**P2 — Close the remaining REST gap for `blog_public`.** `[upstream]` (preferred) or `[shell]` (stopgap)
The shell shims for `posts_per_rss` + `rss_use_excerpt` (P1) are the local equivalent of an upstream `show_in_rest` registration; upstream registration would still be the clean cross-client fix. `blog_public` remains unexposed and is the most user-visible (it surfaces a dashboard-wide "Search engines discouraged" banner), so it is the priority remaining item — close it upstream (`register_setting('reading','blog_public', show_in_rest)`) or with the same shell-shim pattern, then add the control + the privacy-policy cross-field warning to the app.

**P3 — Restore hierarchical page selects + paginate beyond 100 pages.** `[shell]`
The page list is flat (Divergence #2) and capped at 100 (`src/apps/settings-reading/index.js:47-62`). Use the `parent` field from `GET /wp/v2/pages` to indent options (mirroring `Walker_PageDropdown`), and loop pagination (or use `orderby=menu_order` + a tree build) so large sites don't truncate. Pure shell-side; the data is already in REST.

**P3 — Add the cross-field warnings + the "no pages exist" lock.** `[shell]`
Render same-page and privacy-policy-collision warnings (Divergences #3–#4) via the `EntityDataForm` `children` slot (`src/apps/_shared/forms/EntityDataForm.js:72`). Fetch `wp_page_for_privacy_policy` (it *is* REST-exposed) for the collision check. Optionally hide/disable the "A static page" radio option when `pages.records` is empty, to match `options-reading.php:72-79` and avoid the unsatisfiable-choice state.

**P3 — Fix the stale screen-spec path.** `[shell, docs]`
`docs/screens/settings-reading.md` header references `src/apps/settings-panels/SettingsReadingApp.js`; the real path is `src/apps/settings-reading/index.js`. Update the "Current shell coverage" line so the spec points at the live source.

**P3 — Help-tab content gap (cross-cutting).** `[shell]`
The two help tabs + sidebar (`options-reading.php:22-55`) have no shell equivalent. This is a shell-wide pattern gap (not unique to Reading); track it as a cross-cutting "port wp-admin contextual help" item rather than per-screen.
