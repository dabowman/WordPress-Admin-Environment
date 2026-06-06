# core:settings-media

Standalone **Media Settings** panel. Rebuilds the image-size + uploads-folder slice of wp-admin's `options-media.php` with `@wordpress/dataviews` `DataForm`.

## Overview

Fields over `useEntityRecord('root','site')`:

- **Thumbnail width / height** — `thumbnail_size_w` / `thumbnail_size_h` integers (slider + number input, #170).
- **Crop thumbnail to exact dimensions** — `thumbnail_crop` boolean.
- **Medium size max width / height** — `medium_size_w` / `medium_size_h` integers (slider + number input, #170).
- **Large size max width / height** — `large_size_w` / `large_size_h` integers (slider + number input, #170).
- **Organize uploads into month/year folders** — `uploads_use_yearmonth_folders` boolean.

All eight options are non-REST in core 6.9; the plugin re-registers them in the `media` settings group with `show_in_rest` (`wp-admin-workspaces.php`, issue #117) so the standard `/wp/v2/settings` controller reads + writes them in one PUT. The integer options carry a server-side `minimum: 0` schema floor.

## Architecture

Thin wrapper around the shared `src/apps/_shared/forms/EntityDataForm`. This app declares the static `fields` array (the dimensions, the two booleans) and the `form` field order; the shared workspace owns the null-guard spinner, `DataForm`, Save button, save handler, and the `wp-admin-workspaces-app--inset` padding wrapper (so the panel renders identically standalone and inside the `core:settings` host).

The six dimension fields use the shared range/slider control (`src/apps/_shared/forms/controls/RangeControl.js` `rangeField`, #170) — a `@wordpress/components` `RangeControl` slider with its adjacent number input still on, so exact pixel entry is preserved while adding drag-to-set. Each clamps to `[0, max]` and rounds to an integer in `setValue` — 0 means "do not generate this size", and the server schema floor would reject a negative value.

Mounted two ways:

- **Directly** as the `settings-media` screen (`app: "core:settings-media"`).
- **Composed** inside `core:settings` for the `media` panel.

## Rebuild guide (non-WPDS / non-React port)

Read the eight options from `GET /wp/v2/settings`; render range sliders (each with a number input, min 0) for the six dimensions and checkboxes for `thumbnail_crop` + `uploads_use_yearmonth_folders`; `POST /wp/v2/settings` on save with the non-negative clamp applied. A plain number input is an acceptable substitute where no slider primitive exists. No aggregate fetch is required.

## Known limitations

Parity gaps vs `docs/screens/settings-media.md`:

- **Custom upload path** (`upload_path` / `upload_url_path`) — classic wp-admin only renders these when they are non-default; they are out of scope for this panel.
- **Multisite "Uploading Files" quota** — the network-level upload-size budget is not surfaced here.
- **Plugin-extended Embeds / `do_settings_fields` sections** — not rendered; the panel covers the core image-size + uploads-folder fields only.
