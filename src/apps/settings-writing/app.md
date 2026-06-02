# core:settings-writing

Standalone **Writing Settings** panel. Rebuilds the REST-exposed slice of wp-admin's `options-writing.php` with `@wordpress/dataviews` `DataForm`.

## Overview

Two fields, both selects over `useEntityRecord('root','site')`:

- **Default Post Category** — `default_category`, populated from `taxonomy/category` (per_page 100, ordered by name). Stored as an int; the select round-trips through `String()` / `parseInt()`.
- **Default Post Format** — `default_post_format`, a static list of the ten core post formats; defaults to `standard`.

## Architecture

Thin wrapper around the shared `src/apps/_shared/forms/EntityDataForm` — that component owns the null-guard spinner, the `DataForm`, the Save button, and the `useEntitySave` success-snackbar / error-notice handler. This app only computes the `fields` array (memoized on `categories.records`) and the `form` field order.

Mounted two ways:

- **Directly** as the `settings-writing` screen in a shell (`app: "core:settings-writing"`).
- **Composed** inside `core:settings` for the `writing` panel — that host imports this app's default export.

## Rebuild guide (non-WPDS / non-React port)

Read `default_category` + `default_post_format` from `GET /wp/v2/settings`; render a category select (`GET /wp/v2/categories?per_page=100`) and a post-format select; `POST /wp/v2/settings` on save. No private APIs involved.

## Known limitations

Parity gap vs `docs/screens/settings-writing.md`: the remaining Writing options are all **legacy** and have no REST surface — Post-via-Email (`mailserver_url` / `mailserver_login` / `mailserver_port` / `default_email_category`), Update Services (`ping_sites`), the Link Manager default category (`default_link_category`), and the XHTML auto-correction toggle (`use_balanceTags`). Rather than silently hiding them, the panel renders the shared **No-API Fallback** (`src/apps/_shared/fallback/UnavailableViaApi`, `docs/no-api-fallback-pattern.md`) per option: a classic-screen link to `options-writing.php`, a copy-paste `wp option update` command, and a paste-to-agent prompt. These options aren't REST-readable, so the current value can't be pre-filled; the command uses a literal `<value>` placeholder operand (`wp option update 'mailserver_url' '<value>'`) rather than an empty string, so pasting it verbatim won't silently clear the option.

The Post-via-Email password (`mailserver_pass`) is **deliberately kept out of REST and out of the fallback** — a credential must never be pre-filled into a copy-paste affordance.
