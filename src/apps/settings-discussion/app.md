# core:settings-discussion

Standalone **Discussion Settings** panel. Rebuilds the REST-exposed slice of wp-admin's `options-discussion.php` with `@wordpress/dataviews` `DataForm`.

## Overview

DataForm over the **full standard Discussion option set** via `useEntityRecord('root','site')`. Core only REST-registers `default_comment_status` / `default_ping_status`; the plugin's `register_setting('discussion', …, { show_in_rest })` shims (issue #118) expose the rest, so the whole panel saves through a single `/wp/v2/settings` PUT. Groups:

- **Default post settings** — `default_pingback_flag` (bool), `default_ping_status` / `default_comment_status` (round-trip as `open`/`closed` strings, mapped to boolean via `getValue`/`setValue`).
- **Other comment settings** — `require_name_email`, `comment_registration`, `close_comments_for_old_posts` (+ `close_comments_days_old`, nested), `show_comments_cookies_opt_in`, `thread_comments` (+ `thread_comments_depth` select, nested).
- **Comment pagination** — `page_comments` (+ `comments_per_page` / `default_comments_page` / `comment_order`, all nested).
- **Email me whenever** — `comments_notify`, `moderation_notify`.
- **Before a comment appears** — `comment_moderation`, `comment_previously_approved`.
- **Comment moderation** — `comment_max_links` (int), `moderation_keys` / `disallowed_keys` (textareas).
- **Avatars** — `show_avatars` (+ `avatar_rating` / `avatar_default` radios, nested).

Nested fields gate on their parent toggle via DataForm `isVisible(item)`.

## Architecture

Thin wrapper around the shared `src/apps/_shared/forms/EntityDataForm` — a static `FIELDS` array + `FORM` field order, no data dependencies beyond the site record. The shared workspace owns the null-guard spinner, `DataForm`, Save button, and save handler.

Value-mapping idioms: `open`/`closed` ↔ boolean for the two ping/comment status fields; integer clamps (floor 0 or 1) on the numeric fields; enum selects/radios for thread depth, pagination order, avatar rating + default. Server-side sanitize fidelity (bool `'1'`/`''` storage, enum validation, int clamps, key-list newline normalization) lives in the `register_setting` shims in `wp-admin-workspaces.php`. The integer fields (`thread_comments_depth`, `comments_per_page`, `comment_max_links`, `close_comments_days_old`) use a **clamp-only** model: the floor lives solely in each option's `sanitize_callback` (`max( floor, … )`), NOT a schema `minimum`, because the settings REST controller validates the schema *before* the sanitize callback runs — a schema `minimum` would 400 a sub-floor write before the clamp-up could fire. So a write below the floor (e.g. `thread_comments_depth=0`) is clamped up to the floor rather than rejected, matching classic wp-admin.

Mounted two ways:

- **Directly** as the `settings-discussion` screen (`app: "core:settings-discussion"`).
- **Composed** inside `core:settings` for the `discussion` panel.

## Rebuild guide (non-WPDS / non-React port)

Read the full Discussion option set from `GET /wp/v2/settings`; render the grouped controls with the nested fields gated on their parent toggle; `POST /wp/v2/settings` on save (the server-side sanitize_callbacks enforce the clamps + enums regardless of the client).

## Known limitations

Parity gaps vs `docs/screens/settings-discussion.md`:

- **Maximum thread depth** is hardcoded to 10 (core's default `thread_comments_depth_max`). The filter is honored server-side by the `thread_comments_depth` sanitize_callback, but the depth select only offers up to 10 levels — there is no read endpoint for the live filtered max.
- **`avatar_default`** lists core's built-in set only; styles a theme adds via the `avatar_defaults` filter are not surfaced (same fixed-set caveat).
- **Avatar previews** — the default-avatar radios render text labels, not the per-style `<img>` previews classic wp-admin shows.
- **`wp_notes_notify`** is intentionally not rendered and not registered server-side — it is not a core option in WP 6.9 (it's a Jetpack/WordPress.com option), so a `show_in_rest` registration would be a write-to-nowhere phantom surface and a checkbox would be a confusing no-op.
- **Multisite signup-off note** beside `comment_registration` and plugin `do_settings_fields` extensions are not rendered.
