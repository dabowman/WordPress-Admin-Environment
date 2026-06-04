# core:appearance-preferences

Prose accompanying `app.json#documentation` for the per-user appearance-preferences screen.

> **Naming note.** This app was renamed from `core:appearance` in issue #121. It is the **personalization panel** (density / accent / default-route), NOT the wp-admin Appearance hub (themes / editor / menus). The rename freed the "Appearance" section name for the real Appearance menu group, and moved this prefs screen under **Settings → Appearance Preferences** so it is reachable (previously it was orphaned: bound to the Appearance group node, which has `items` and so renders as a drilldown container rather than navigating to its own href).

## Overview

AppearancePreferencesApp is a customizability-aware preferences screen. The active shell declares `customizable` — either `true`, `false`, or a string-array allowlist — on its `styles` block; this app reads that declaration and renders only the controls the shell permits. MVP controls cover density (compact / default / comfortable radio), accent color (single-token override), and default-route override (text input).

The customizability declaration is **server-authoritative**: the cascade resolver enforces the same `customizable` allowlist on writes. Hiding controls client-side is a UX nicety, not a security boundary. A user who hand-crafts a POST to `/wp-admin-workspaces/v1/user-prefs` setting a non-customizable field gets a 403 / silent drop.

## Architecture

`prefs` state is `null` until the initial fetch completes; this lets the loading spinner render once on mount. Subsequent saves do a partial POST (only the changed sub-tree); the response is the full merged prefs blob, which the app stashes back into `prefs` state.

The `isCustomizable(declaration, path)` helper handles the three legal shapes:

- `true` → all paths allowed.
- `false | null | undefined` → none allowed.
- `string[]` → only listed paths allowed.
- Anything else → locked + dev-mode console warn. Matches the server-side default-deny.

The accent color picker doesn't fall back to a literal hex — empty string means "no authored override", and the WPDS provider supplies `--wpds-color-bg-interactive-brand-strong` from the cascade. A literal-hex fallback would lock the picker to a specific color rather than the resolved-but-unauthored value.

## Rebuild guide

Two patterns worth preserving:

- **Client allowlist mirrors server allowlist.** Both should read the same `customizable` declaration. Don't show controls the server will reject.
- **Partial-patch semantics for user prefs.** Send only the changed sub-tree; server deep-merges. Avoids accidental clobber of fields the UI doesn't currently surface.

The patch shape is deep-dotted (`styles.color.bg.interactive.brand.strong`) because the underlying token paths are deep. A flatter rebuild can collapse this to single-level keys, but the customizable allowlist would need to match.

A non-WPDS rebuild needs radio + color picker + text input + button — all standard.

## Known limitations

- **No theme preset selector.** Each control is single-axis. A future iteration may add presets (`'Light' / 'Dark' / 'High contrast'`) that compose multiple token overrides.
- **No live preview.** Changes apply on the next render; there's no "preview before save" affordance.
- **Color picker is naive.** Plain text input expecting a hex string. A real color picker (with picker chip + swatch palette) is deferred.
- **Reset is all-or-nothing.** "Reset to shell defaults" wipes every per-user override via `DELETE /wp-admin-workspaces/v1/user-prefs`. No per-field revert (setting one field back to the resolved value requires manually clearing that field).
- **Custom typography / font controls are not exposed.** The cascade has tokens for `font.size.*` etc., but the appearance app doesn't surface them.
