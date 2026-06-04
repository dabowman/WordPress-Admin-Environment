# core:settings-general

Prose accompanying `app.json#documentation` for the General Settings form.

## Overview

SettingsGeneralApp is the canonical WordPress `general-settings` screen ported to React + core-data. It's the most form-heavy app in the workspace — fifteen-plus fields covering site identity, membership, language, timezone, date/time formatting, and week-start. It lands inside the composable `core:settings` host as the `general` panel; standalone registration is kept for workspaces that want a minimal "just general settings" experience.

The interesting bits are the **date/time format pickers**: WordPress's wp-admin shows a list of preset radios + a "Custom" radio that reveals a free-text input. Reproducing this pattern requires careful state — the custom-input value must persist across radio toggles so re-selecting Custom doesn't blank the previous custom value.

## Architecture

Two data sources:

1. **`useEntityRecord('root', 'site')`** — the writable site options. Save flows through `save()`.
2. **`window.wpAdminWorkspaces.settingsGeneral`** — PHP-injected read-only metadata: role list, language optgroups, timezone groups, weekday labels, preset date/time format arrays, multisite flag, pending admin-email target, constant flags. This data is computed PHP-side because it requires reading `WP_LANG_DIR` (installed locales), the active translation set (available locales), timezone identifiers from PHP's `DateTimeZone::listIdentifiers()`, and `defined('WP_SITEURL') / WP_HOME` PHP constants. None of these are REST-exposed.

Date/Time format logic:

- Compute `dateFormatRadioValue` from `editedRecord.date_format`: either matches a preset value or is `__custom__`.
- Render the radio set with preset options + a `__custom__` option labeled "Custom".
- When radio changes to a preset, edit the field with the preset value.
- When radio changes to `__custom__`, restore previous custom value from local `useState` (or fallback to `Y-m-d`) and surface the custom input.
- When custom input changes, edit the field + stash in local state.

The local `dateFormatCustom` / `timeFormatCustom` state survives radio toggles so the user can flip between Custom and a preset without losing their typed custom format.

## Rebuild guide

- **Form pattern** — same as `core:profile`: useEntityRecord + edit + save + notice on success/failure.
- **PHP-injected metadata** — reproduce `settingsGeneral` shape via your host's config-injection mechanism. The role list, language optgroups, timezone groups, weekday labels, etc. are computed PHP-side because they aren't REST-exposed.
- **Preset-or-custom pattern** — radio set with the last "Custom" option revealing an input field. Local state preserves custom values across radio toggles. A reusable component is worth extracting if your settings surface has more than two of these.
- **Constant-aware fields** — when `WP_SITEURL` / `WP_HOME` are defined, REST rejects writes. Detect this server-side, inject the flag, disable the input + show a contextual description.

A non-WPDS rebuild needs text inputs, email + URL types, select (with optgroup support — Material's `Select` works), checkbox, radio group, divider, notice banner, button. Pretty standard form-library territory.

## Known limitations

- **Admin-email change has no confirm-by-link flow.** REST saves directly. We surface the wp-admin pending email change as an info notice but can't initiate one.
- **Privacy-policy page selector** is not in this panel — privacy lives in the iframed privacy panel.
- **Time-format custom field accepts any PHP date format string** — no live preview of what the format produces against the current time.
- **No "reset to default" affordance** for date/time formats.
- **Constant-defined URL fields** show "Defined by WP_SITEURL constant" but don't show the value of the constant; user has to look at wp-config.php to see it.
- **No Site Icon picker.** `docs/screens/settings-general.md` documents a Site Icon control (uploads to media, sets the `site_icon` option, surfaces favicon + Apple touch icon previews). The v2 panel doesn't ship it — covering the field requires a media-picker primitive the workspace doesn't yet expose.
