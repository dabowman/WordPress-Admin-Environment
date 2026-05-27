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

Parity gap vs `docs/screens/settings-writing.md`: **post-via-email** and **remote-publishing (XML-RPC / Press This)** settings are not exposed by `/wp/v2/settings`, so they are omitted. The panel renders an in-form notice directing users to the legacy `options-writing.php` screen for those fields.
