# Parity: Settings — General (core:settings-general)

> Audited 2026-05-29 against WordPress 7.0 core. Shell app: `src/apps/settings-general/`. Classic counterpart: `wp-admin/options-general.php` (form) + `wp-admin/options.php` (save handler) + `wp-includes/option.php::register_initial_settings()` (REST registration) + `wp-includes/rest-api/endpoints/class-wp-rest-settings-controller.php` (REST controller).

## Verdict

**Major gaps (several silently broken fields).** The hand-rolled form decision is sound and the implemented fields (title, tagline, URL, admin email, language, timezone-by-city, date/time formats, week-start) work. But the app renders four controls that the REST `/wp/v2/settings` schema **does not register at all** in 7.0 — `home` (Site Address), `users_can_register`, `default_role`, and the **manual UTC-offset timezone options** — and binds them to `edit()`/`save()` anyway. Verified against `register_initial_settings()` (`wp-includes/option.php:2741-2855`) and the controller's update loop (`class-wp-rest-settings-controller.php:150-153`, which `continue`s on any unregistered param): those reads return `undefined` and those writes are silently dropped, with no error. The Site Icon picker (classic lines 100-223) is absent entirely, the admin-email confirmation flow is bypassed (acknowledged in-app), and a manual UTC-offset save is silently reverted by `sanitize_option('timezone_string')`. None of these surface an error to the user, so they are parity *surprises*, not visible failures. The bulk of the gap is **upstream** (core does not REST-register these options); a meaningful slice is **shell-side** (the app should not render no-op controls, and should drop the manual-offset options or write them through a shim).

## Counterpart mapping

- **Classic screen(s):**
  - `wp-admin/options-general.php` — the form markup (procedural PHP, not a list-table; rendered via `form_option()`, `wp_dropdown_roles()`, `wp_dropdown_languages()`, `wp_timezone_choice()`, and inline `<input>`/`<select>`).
  - `wp-admin/options.php` — the POST save handler (`option_page=general`), including the adminhash confirmation branch (lines 57-80), the date/time custom-radio unwrap (lines 270-280), the UTC-offset → `gmt_offset` mapping (lines 282-296), and the language-pack download (lines 306-316).
  - `wp-admin/includes/misc.php::update_option_new_admin_email()` (lines 1450+) — the confirm-by-email side effect, hooked on the `new_admin_email` option update.
- **REST / core-data surface the shell app uses:**
  - `useEntityRecord('root','site')` → `GET`/`POST /wp/v2/settings` (the `general` group keys: `title`, `description`, `url`, `email`, `timezone`, `date_format`, `time_format`, `start_of_week`, `language`).
  - `window.wpAdminShell.settingsGeneral` — PHP-injected read-only metadata (`wp-admin-shell.php:1109-1233`): language optgroups, timezone groups, role list, weekday labels, date/time preset arrays, multisite flag, `WP_SITEURL`/`WP_HOME` constant flags, `pendingAdminEmail`, current UTC/local time strings.
- **Project screen spec:** `docs/screens/settings-general.md` — present and detailed (tier-2). It correctly flags `home`/`users_can_register`/`default_role`/`site_icon` as non-REST, but its REST-exposed table lists `d.m.Y` as a 6.8.0 preset that the shell's injected list omits, and it predates the manual-UTC-offset-revert finding. Both are captured below.

## Feature parity matrix

| Feature | wp-admin behavior | Shell app | Status | Notes |
|---|---|---|---|---|
| **Site Title** (`blogname`→`title`) | text input, `regular-text` (`options-general.php:76-78`) | `InputControl` bound to `editedRecord.title` (`index.js:116-120`) | ✅ full | REST-registered (`option.php:2742-2753`). Works. |
| **Tagline** (`blogdescription`→`description`) | text input + example helper using `get_network()->site_name` on MS (`options-general.php:80-98`) | `InputControl` + static helper string (`index.js:121-131`) | 🟡 partial | REST-registered. Works, but helper text is hard-coded "explain what this site is about" — drops the localized `Example: "Just another WordPress site."` sample (and the network-name variant on MS). Cosmetic. |
| **Site Icon** (`site_icon`) | media-modal picker (≥512px), app/browser favicon previews, Choose/Change/Remove buttons, `upload_files` cap (`options-general.php:100-223`) | **absent** | ❌ missing | `site_icon` is **not REST-registered** (verified — no `register_setting` for it). Needs a media-picker primitive the shell doesn't expose + an option shim. See blockers. |
| **WordPress Address** (`siteurl`→`url`) | url input, disabled when `WP_SITEURL` defined (`options-general.php:240-243`) | `InputControl type=url` bound to `editedRecord.url`, `disabled={data.siteurlConst}` + constant note (`index.js:135-154`) | ✅ full | REST-registered, non-MS only (`option.php:2768-2783`). Constant-disable handled correctly. |
| **Site Address** (`home`) | url input, disabled when `WP_HOME` defined, helper text (`options-general.php:245-260`) | `InputControl type=url` bound to `editedRecord.home` (`index.js:155-177`) | ❌ blocked | **`home` is NOT REST-registered** (verified — no `register_setting('general','home',…)`). `editedRecord.home` is always `undefined` → field renders empty; `edit({home})` → `save()` is **silently dropped** by `update_item` (`controller:150-153`). Field looks live but does nothing. |
| **Administration Email** (`admin_email`→`email`) | email input, **confirm-by-email** flow via `new_admin_email` staging + `adminhash` (`options-general.php:264-290`, `misc.php:1450`) | `InputControl type=email` bound to `editedRecord.email`, writes directly; warning note in description (`index.js:181-211`) | 🟡 partial | REST `email` writes `admin_email` **directly + instantly** (`controller:202-204`). The confirm-by-link safeguard against lockout is bypassed. App honestly states this in the field description. See blockers. |
| **Pending admin-email notice** | `updated/inline` admin notice with **Cancel** link (`options-general.php:268-288`) | read-only info `Notice.Root` showing `data.pendingAdminEmail` (`index.js:198-209`) | 🟡 partial | Shows the pending target but has **no Cancel action** (cancel = `options.php?dismiss=new_admin_email`, nonce-gated, non-REST). Also can't *initiate* a pending change. |
| **Membership: Anyone can register** (`users_can_register`) | checkbox in `<fieldset><legend>` (`options-general.php:296-302`) | `CheckboxControl` bound to `editedRecord.users_can_register` (`index.js:220-230`) | ❌ blocked | **`users_can_register` is NOT REST-registered** (verified). `editedRecord.users_can_register` always `undefined` → checkbox always unchecked; toggling + save is **silently dropped**. |
| **New User Default Role** (`default_role`) | `wp_dropdown_roles()`, excludes admin+editor via `default_role_dropdown_excluded_roles` (7.0, `options-general.php:308-330`) | `SelectControl` bound to `editedRecord.default_role`, fallback `'subscriber'`, options from `data.roles` (`index.js:231-242`) | ❌ blocked | **`default_role` is NOT REST-registered** (verified). Always reads fallback `subscriber`; save **silently dropped**. Also: shell's `data.roles` = `wp_roles()->get_names()` (`wp-admin-shell.php:1180`), which does **not** apply the 7.0 `default_role_dropdown_excluded_roles` filter, so it would list `administrator`/`editor` (a fidelity gap on top of the no-op). |
| **Site Language** (`WPLANG`→`language`) | `wp_dropdown_languages()`: Installed + Available optgroups, gated on `install_languages` cap + `wp_can_install_language_pack()`; deprecated-`WPLANG`-constant notice (`options-general.php:335-375`) | `SelectControl` (legacy, for `<optgroup>`) with default/installed/available groups from `data.languages` (`index.js:248-278`) | 🟡 partial | REST-registered (`option.php:2844-2855`). Reads/writes the locale string fine. **But:** selecting an *Available* (uninstalled) locale does **not** download the language pack — `wp_download_language_pack()` runs only in the legacy POST handler (`options.php:307-316`), never on the REST path. Site falls back to en_US. See blockers. Also reads raw `WPLANG` (REST `language`), not `get_locale()`, so a constant/filter-driven active locale may differ from what the select shows. |
| **Timezone — city** (`timezone_string`→`timezone`) | grouped `wp_timezone_choice()` select (`options-general.php:401-406`) | `SelectControl` with continent optgroups from `data.timezone.groups` (`index.js:280-300`) | ✅ full | REST-registered. IANA city selection works. |
| **Timezone — manual UTC offset** (`gmt_offset`) | `UTC±X` options; on save, mapped to `gmt_offset` + `timezone_string` cleared (`options.php:282-296`) | `UTC±X` options injected in the same select (`wp-admin-shell.php:1168-1177`) | ❌ blocked | **Silently broken.** Shell writes `timezone_string="UTC+5"` via REST. `gmt_offset` is **not REST-registered**, and `sanitize_option('timezone_string')` (`formatting.php:5055-5060`) rejects non-IANA values and **reverts to the stored value** (`formatting.php:~5085`). Net effect: picking a manual offset + Save = **timezone unchanged, no error**. The option should not be offered without a shim. |
| **Universal/Local time readout** | live `date_i18n()` "Universal time is … / Local time is …" (`options-general.php:418-439`) | static `data.timezone.utcNow` / `localNow` from PHP at page load (`index.js:301-307`) | 🟡 partial | Snapshot, not live-ticking; "Local time" always shown (classic hides it when timezone is unset). Minor; client could compute live. |
| **DST status + next transition** | "currently in daylight saving / standard time", "Daylight saving begins on: …" / "…does not observe DST" via `timezone_transitions_get()` (`options-general.php:441-479`) | **absent** | ❌ missing | Not shown at all. Computable client-side via `Intl`/`Temporal`, or server-injectable. Shell-side gap. |
| **Date Format** (`date_format`) | radio presets + Custom radio + freeform input + live preview + spinner (`options-general.php:483-528`) | `RadioControl` (presets + `__custom__`) + revealed `InputControl` (`index.js:311-336`) | 🟡 partial | REST-registered; works. **Preset list drift:** core 7.0 ships 5 presets incl. `d.m.Y` (added 6.8.0, `options-general.php:498`); shell injects only 4 (`wp-admin-shell.php:1190`). A site on `d.m.Y` shows as "Custom" in the shell. **No live preview** of the custom format against current time. |
| **Time Format** (`time_format`) | radio presets + Custom + preview + docs link (`options-general.php:530-575`) | `RadioControl` + revealed `InputControl` (`index.js:338-363`) | 🟡 partial | REST-registered; works. No live preview; no "Documentation on date and time formatting" link. Preset list matches core (3 entries). |
| **Week Starts On** (`start_of_week`) | `<select>` 0-6, `WP_Locale::get_weekday()` labels (`options-general.php:576-591`) | `SelectControl` bound to `editedRecord.start_of_week`, `parseInt` on save (`index.js:365-374`) | ✅ full | REST-registered (integer). Works; string↔int coercion handled. |
| **Save Changes** | `submit_button()` → full-page POST to `options.php`, redirect with `?updated` notice (`options-general.php:597`) | `Button` → `save()` via `useEntitySave`, success snackbar / error banner (`index.js:376-386`, `useEntitySave.js`) | 🟡 partial | Diff-based REST save (better UX), but only the registered keys land; the no-op fields above give a false "Settings saved." snackbar even when their values were dropped. |
| **Capability gate (view)** | `manage_options` else `wp_die()` (`options-general.php:15-17`) | `manage_options` floor via PHP (`wp-admin-shell.php:541`) + app `role:"main"`; REST `get_item_permissions_check` re-checks `manage_options` (`controller:67-69`) | ✅ full | Server-enforced on both injection and REST. |
| **Site Icon cap gate** (`upload_files`) | section only shown to `upload_files` (`options-general.php:100`) | N/A (feature absent) | ❌ missing | Tied to the missing Site Icon feature. |
| **Nonce / CSRF** | `settings_fields('general')` nonce + `check_admin_referer` on dismiss (`options-general.php:71`, `options.php:75`) | core-data `apiFetch` sends `X-WP-Nonce`; REST controller checks cap | ✅ full | REST nonce handled by core-data middleware. |
| **Plugin-extended fields** | `do_settings_fields('general','default')` + `do_settings_sections('general')` (`options-general.php:592,595`); `allowed_options` filter (`options.php`) | **absent** | ❌ missing | Plugins adding fields via `add_settings_field()` to the `general` section/group render nothing in the shell, and their options aren't in `/wp/v2/settings` unless separately REST-registered. Extension-point gap. |
| **Loading state** | server-rendered (no async) | centered `Spinner` while `!record || !data` (`index.js:65-71`) | ✅ full | Correct null-guard per CLAUDE.md. |
| **Error state** | `add_settings_error` → notice on redirect | dismissible error `Notice` via `createErrorNotice` (`useEntitySave.js:30-33`) | 🟡 partial | All-or-nothing; no per-field validation surfacing (e.g. invalid timezone error from the server is swallowed). |
| **Multisite field hiding** | hides WP/Site URL + Membership + Default Role; **keeps** Admin Email (per-site contact, `options-general.php:264` is not MS-guarded) | hides URL, home, Admin Email, Membership, Default Role (`index.js:133,181,214`) | 🟡 partial | Shell **over-hides**: it drops the Administration Email field on multisite, which classic still shows. (REST `email` is non-MS-only anyway, so it couldn't be saved via REST — but classic offers it via the legacy `new_admin_email` POST.) |
| **a11y: fieldset/legend grouping** | `<fieldset><legend class="screen-reader-text">` around Membership, Date, Time (`options-general.php:298,487,534`) | `RadioControl`/`CheckboxControl` provide their own label semantics; no explicit fieldset around date/time custom pair | 🟡 partial | WPDS controls carry labels, but the radio-set + revealed-custom-input pairing isn't wrapped in a shared fieldset/`aria-describedby` to a preview as the spec (`screens/settings-general.md:355`) recommends. |
| **a11y: pending-email as status** | `wp_admin_notice` (assertive) | `Notice.Root intent="info"` | 🟡 partial | No `role="status"`/live-region guarantee on the pending notice. Minor. |
| **Help tabs / sidebar** | Overview help tab + "For more information" sidebar (`options-general.php:50-62`) | **absent** | ❌ missing | Cross-cutting shell gap (no screen-help surface); same for every settings panel. |

## Functional divergences

Behaviors present in both that work differently:

1. **Admin email saves instantly vs confirm-by-link.**
   - Classic: typing a new email writes the `new_admin_email` staging option, which fires `update_option_new_admin_email` (`misc.php:1450-1460`) → stores `{hash,newemail}` in `adminhash`, emails the new address an `options.php?adminhash=…` link; `admin_email` only changes after the link is clicked (`options.php:58-70`).
   - Shell: writes REST `email` → `update_option('admin_email', …)` **immediately** (`controller:202-204`). The lockout safeguard is gone.
   - **Consequence:** a typo in the admin email instantly orphans admin notifications with no second chance. The app's description text (`index.js:193-196`) is candid about this, but it's a real behavioral divergence.

2. **Date-format preset count (4 vs 5).**
   - Classic 7.0: `array( 'F j, Y', 'Y-m-d', 'm/d/Y', 'd/m/Y', 'd.m.Y' )` (`options-general.php:498`; `d.m.Y` added 6.8.0).
   - Shell: `array( 'F j, Y', 'Y-m-d', 'm/d/Y', 'd/m/Y' )` (`wp-admin-shell.php:1190`).
   - **Consequence:** the `d.m.Y` European preset is missing; a site already set to `d.m.Y` shows as "Custom" rather than a selected preset radio. Shell-side, trivial fix.

3. **Default-role dropdown contents.**
   - Classic 7.0: excludes `administrator` + `editor` by default via the new `default_role_dropdown_excluded_roles` filter (`options-general.php:316`).
   - Shell: lists every role from `wp_roles()->get_names()` (`wp-admin-shell.php:1180-1187`), unfiltered.
   - **Consequence:** the shell would offer `administrator`/`editor` as the new-user default (a footgun). Moot today only because the field can't save (see blockers), but a divergence the moment it's fixed.

4. **Multisite admin-email field.**
   - Classic: shows the Administration Email field on multisite too (`options-general.php:264` is outside the `!is_multisite()` block) — it's the per-site contact, saved via the legacy `new_admin_email` POST.
   - Shell: hides it on multisite (`index.js:181`).
   - **Consequence:** multisite site admins lose the per-site contact-email control in the shell.

5. **Universal/Local time is a snapshot.**
   - Classic: `date_i18n()` rendered at request time, and only shows "Local time is …" when a timezone is set (`options-general.php:428-438`).
   - Shell: injects `utcNow`/`localNow` once at page load (`wp-admin-shell.php:1214-1215`), always shows both (`index.js:301-307`).
   - **Consequence:** clock is frozen at page-load time and "Local time" shows even on a freshly-installed UTC site. Cosmetic.

6. **Tagline helper example dropped.**
   - Classic: localized `Example: "Just another WordPress site."` (or `Just another {network} site` on MS) (`options-general.php:88-92`).
   - Shell: generic helper, no example (`index.js:123-126`). Cosmetic.

## API & platform blockers

The hard parity blockers — verified against live 7.0 source.

1. **`home` (Site Address) is not REST-registered.** `[upstream]`
   - Evidence: no `register_setting('general','home',…)` anywhere in `wp-includes/` (grep confirmed); not in `register_initial_settings()` (`option.php:2741-2855`). Classic *does* save it — `home` is appended to `allowed_options['general']` at `options.php:190` (non-MS, when `WP_HOME` is undefined) and written via the legacy POST handler — but there is **no REST surface** for it. (Note the asymmetry: `siteurl`→`url` IS REST-registered, `home` is not.)
   - Shell impact: `editedRecord.home` is always `undefined`; `save()` drops it (`controller:150-153`).
   - Close it: `[shell]` add a small custom endpoint (e.g. `POST /wp-admin-shell/v1/options/home`) doing capability-gated `update_option('home', …)`, or `[upstream]` register `home` with `show_in_rest`.

2. **`users_can_register` is not REST-registered.** `[upstream]`
   - Evidence: grep of `register_setting(` shows no `users_can_register`; absent from `register_initial_settings()`.
   - Shell impact: checkbox is inert; save dropped.
   - Close it: `[shell]` options shim, or `[upstream]` register it (`general`, boolean).

3. **`default_role` is not REST-registered.** `[upstream]`
   - Evidence: same grep — no `register_setting` for `default_role`.
   - Shell impact: select is inert; save dropped; fallback `subscriber` always shown.
   - Close it: `[shell]` options shim (and apply `default_role_dropdown_excluded_roles` when building `data.roles`), or `[upstream]` register it.

4. **`gmt_offset` is not REST-registered, and `timezone_string` rejects manual offsets.** `[upstream]` + `[shell]`
   - Evidence: no `register_setting` for `gmt_offset`. `sanitize_option('timezone_string')` (`formatting.php:5055-5060`) flags any non-IANA value as an error and `sanitize_option` then reverts to the stored value (`formatting.php:~5085`, `$value = get_option($option)`). The classic UTC-offset → `gmt_offset` mapping lives only in `options.php:282-296`.
   - Shell impact: the manual-offset options the shell injects (`wp-admin-shell.php:1168-1177`) are **non-functional** — selecting `UTC+5` + Save silently keeps the old timezone, no error.
   - Close it: `[shell]` either drop the manual-offset options entirely, or detect a `UTC±X` selection client-side and write `gmt_offset` through a custom endpoint (clearing `timezone_string`); `[upstream]` register `gmt_offset` with `show_in_rest`.

5. **`site_icon` is not REST-registered.** `[upstream]` (option) + `[shell]` (UI primitive)
   - Evidence: no `register_setting` for `site_icon`. Classic uses the media modal + a hidden `site_icon` field saved via the general group (`options-general.php:183`, `options.php:94`).
   - Shell impact: entire Site Icon control (favicon/app-icon previews, Choose/Remove) is missing. The shell also lacks a media-picker primitive (per `app.md:44`).
   - Close it: `[shell]` build a media-picker primitive + `update_option('site_icon', $id)` shim (or use the block-theme `site_logo`/Site Logo block path); the option itself is `[upstream]` for clean REST.

6. **Admin-email confirmation flow has no REST equivalent.** `[upstream]`
   - Evidence: the confirm-by-link flow is driven by the `new_admin_email` option update hook (`misc.php:1450`) and the `adminhash` verification in `options.php:57-73`. `new_admin_email` is **not** REST-registered (grep confirmed); the REST `email` field maps straight to `admin_email`. Cancel is `options.php?dismiss=new_admin_email` (nonce-gated, no REST route).
   - Shell impact: cannot initiate a *pending* change (only an instant one) and cannot Cancel a pending one — only display it.
   - Close it: `[shell]` custom endpoint that writes `new_admin_email` (firing the existing email side effect) + a cancel endpoint deleting `adminhash`/`new_admin_email`; or `[upstream]` make `new_admin_email` a REST-recognized "staging" write that triggers confirmation. (Either way the email send + hash check are server-only — no pure-REST path exists today.)

7. **Language-pack download on locale select is admin-only.** `[upstream]`
   - Evidence: `wp_download_language_pack()` is invoked from `options.php:307-316` (and install/network screens) — never from the REST settings controller, and there is no `update_option_WPLANG`/`pre_update_option_WPLANG`/`rest_pre_update_setting` core hook that downloads it.
   - Shell impact: writing REST `language` to an *Available* (uninstalled) locale stores the code but never fetches the `.mo` files; the site stays en_US.
   - Close it: `[shell]` after saving an uninstalled locale, call a custom endpoint that runs `wp_download_language_pack()` (capability-gated on `install_languages` + `wp_can_install_language_pack()`); `[upstream]` add a download side effect to the REST `WPLANG` update.

8. **Available-languages + timezone-city + role lists are not REST endpoints.** `[shell]` (already mitigated)
   - Evidence: `wp_get_available_translations()` / `get_available_languages()` (admin-only, `wp-admin/includes/translation-install.php`), `timezone_identifiers_list()` (PHP), `wp_roles()->get_names()` — none are REST endpoints.
   - Shell impact: **already handled** by injecting `window.wpAdminShell.settingsGeneral` server-side (`wp-admin-shell.php:1109-1233`). Not a live blocker, but note the data is a page-load snapshot (no refresh).

9. **Plugin `add_settings_field('general',…)` / `do_settings_sections('general')` extensions.** `[upstream]`/`[shell]`
   - Evidence: `options-general.php:592,595`. Third-party fields registered against the `general` section render only in classic, and their options aren't in `/wp/v2/settings` unless the plugin also REST-registers them.
   - Close it: shell-level "additional fields" slot on the panel (per `screens/settings-general.md:374`) — non-trivial; an accepted gap for now.

## DataViews / DataForms review

The app does **not** use `DataForm`, and that is the correct call here.

- **Why hand-rolled is right:** two of the controls can't be expressed in `DataForm`'s flat field model. (a) The Site Language and Timezone selects need native `<optgroup>` (Installed/Available; continent groups), which neither `DataForm`'s `select` field nor WPDS 0.12's `Select` renders — the app deliberately falls back to legacy `@wordpress/components` `SelectControl` for `<optgroup>` support (`index.js:7-13`, documented in `app.json:67`). (b) The Date/Time format **preset-radio-plus-revealed-custom-input** pattern is a conditional two-control unit with persisted custom-value memory across radio toggles (`index.js:29-61`, `326-336`); `DataForm`'s `isVisible` could hide a field but can't cleanly express "selecting the Custom radio reveals and seeds a sibling text field." The sibling `settings-reading`/`settings-writing`/`settings-discussion` apps *do* use `EntityDataForm` (`src/apps/_shared/forms/EntityDataForm.js`) precisely because their fields are flat. CLAUDE.md's stated split ("`settings-general` stays hand-rolled … its Language/Timezone `<optgroup>` selects and date/time preset-or-custom radio don't fit DataForm's flat field model") is still accurate.
- **Shared-helper usage is idiomatic:** the app reuses `eventValue()` (`_shared/forms/eventValue.mjs`) for `@wordpress/ui` controls that hand `onChange` a DOM event, and `useEntitySave()` (`_shared/forms/useEntitySave.js`) for the try/catch → snackbar/error pattern. Both correct.
- **One fragility worth flagging (not a DataForm issue):** the custom-format re-sync `useEffect` (`index.js:42-61`) keys on `[record, data]` and guards with a `formatInitRef` one-shot. That correctly handles the "non-preset format on load" case, but the local `dateFormatCustom`/`timeFormatCustom` state is otherwise decoupled from `editedRecord` — fine here since edits flow through `edit()` immediately, but it's the kind of shadow-state-mirroring-an-entity pattern CLAUDE.md warns about. No bug found; just brittle.
- **Anti-pattern present:** the bigger problem isn't DataForm — it's that the hand-rolled form renders four controls (`home`, `users_can_register`, `default_role`, manual-offset timezone) bound to entity fields that don't exist in the REST schema. `useEntityRecord` happily accepts `edit({home: …})` into its local edit object, but `save()` POSTs keys the controller ignores. There's no client-side signal that these are no-ops. This would be just as broken under `DataForm`; the fix is to not render no-op controls (or back them with shims), independent of the form library.

## Recommendations / future work

**P1 — silently-broken controls (correctness; ship-blockers for an honest UI).**
1. **Stop rendering no-op controls, or back them with a shim.** `home`, `users_can_register`, `default_role` (`index.js:155-242`) bind to fields `/wp/v2/settings` doesn't register; their edits vanish on save while the user sees "Settings saved." Either (a) `[shell]` add a `/wp-admin-shell/v1/options/{home,users_can_register,default_role}` capability-gated endpoint and route those edits through it, or (b) hide the controls until backed, or (c) `[upstream]` REST-register the three options. Today they are parity traps.
2. **Fix or remove the manual UTC-offset timezone options.** `wp-admin-shell.php:1168-1177` injects `UTC±X` choices that revert silently on save (`formatting.php:5055-5085`; `gmt_offset` non-REST). `[shell]` detect a `UTC±X` selection and write `gmt_offset` via a shim (clearing `timezone_string`), or drop the options. Until then, document them as no-ops.
3. **Guard the admin-email lockout.** REST writes `admin_email` instantly (`controller:202-204`). Minimum `[shell]`: a confirm dialog before saving an email change. Full parity `[shell]`+`[upstream]`: write `new_admin_email` via a shim to trigger the existing confirm-by-email flow (`misc.php:1450`) and add a Cancel action (`options.php?dismiss=…`).

**P2 — visible feature gaps.**
4. **Language-pack download on save.** `[shell]` after saving an uninstalled *Available* locale, call a shim running `wp_download_language_pack()` (cap-gated). Otherwise the locale silently no-ops (`options.php:307-316` is the only core trigger).
5. **Site Icon picker.** `[shell]` build the media-picker primitive (per `app.md:44`) + `update_option('site_icon', $id)` shim; mirror the favicon/app-icon previews from `options-general.php:160-220`.
6. **Add the `d.m.Y` date preset.** `[shell]` one-line fix in `wp-admin-shell.php:1190` to match core 7.0 (`options-general.php:498`).
7. **Apply `default_role_dropdown_excluded_roles`** when building `data.roles` (`wp-admin-shell.php:1180`) so admin/editor aren't offered. `[shell]` (do alongside #1).
8. **Restore the admin-email field on multisite.** `[shell]` — classic shows it (`options-general.php:264`); shell over-hides (`index.js:181`). Needs a non-REST shim since REST `email` is non-MS-only.

**P3 — fidelity / polish.**
9. **DST + next-transition info.** `[shell]` compute client-side (`Intl`/`Temporal`) or inject server-side; classic shows it at `options-general.php:441-479`.
10. **Live date/time format preview.** `[shell]` render the selected/custom format against `new Date()` client-side; classic shows a preview span (`options-general.php:523,568`).
11. **Live-ticking UTC/local clock + hide "Local time" when no timezone set.** `[shell]` compute client-side instead of the page-load snapshot (`index.js:301-307`).
12. **Tagline example + "Documentation on date and time formatting" link.** `[shell]` cosmetic copy parity (`options-general.php:88-92`, `:571`).
13. **Per-field error surfacing.** `[shell]` show server `add_settings_error`-equivalent messages (e.g. invalid timezone) instead of swallowing them in the all-or-nothing error banner.
14. **Plugin `general`-section field extension slot.** `[shell]`/`[upstream]` — accepted gap; `do_settings_fields('general')` extensions don't render (`options-general.php:592`).
15. **Doc maintenance.** Update `docs/screens/settings-general.md` (add the manual-UTC-offset-revert blocker; note the shell's 4-vs-5 date-preset drift) and `app.md` (the `home`/`users_can_register`/`default_role` no-op bindings are not currently listed as bugs — only the email/site-icon gaps are).
