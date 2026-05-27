# core:settings-discussion

Standalone **Discussion Settings** panel. Rebuilds the REST-exposed slice of wp-admin's `options-discussion.php` with `@wordpress/dataviews` `DataForm`.

## Overview

Two boolean fields over `useEntityRecord('root','site')` — the canonical "Default post settings" pair:

- **Allow people to submit comments on new posts** — `default_comment_status`.
- **Allow link notifications from other blogs (pingbacks and trackbacks)** — `default_ping_status`.

Both round-trip as `open` / `closed` strings; the boolean control maps each way via `getValue` / `setValue`.

## Architecture

Thin wrapper around the shared `src/apps/_shared/forms/EntityDataForm` — static `FIELDS` + `FORM`, no data dependencies beyond the site record. The shared shell owns the null-guard spinner, `DataForm`, Save button, and save handler.

Mounted two ways:

- **Directly** as the `settings-discussion` screen (`app: "core:settings-discussion"`).
- **Composed** inside `core:settings` for the `discussion` panel.

## Rebuild guide (non-WPDS / non-React port)

Read `default_comment_status` + `default_ping_status` from `GET /wp/v2/settings`; render two toggles mapping `open`/`closed` to checked/unchecked; `POST /wp/v2/settings` on save.

## Known limitations

Parity gap vs `docs/screens/settings-discussion.md`: the fine-grained discussion settings — comment moderation rules, comment/avatar display, disallowed-key blocklist, notification triggers — are **not** exposed by `/wp/v2/settings`, so they are omitted. The panel renders an in-form notice directing users to the legacy `options-discussion.php` screen for those fields.
