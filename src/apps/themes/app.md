# core:themes

Prose accompanying `app.json#documentation` for the themes browser.

## Overview

ThemesApp surfaces every installed theme as a 3-column card grid with screenshot + name + truncated description, and a per-card actions row (Details, Activate when non-active). The active theme floats to the front of the grid; the remainder sorts alphabetically by name. Activation uses an out-of-band custom endpoint because WordPress core REST does not expose a theme-switch operation natively — and falls back to wp-admin's classic activate link when the endpoint is missing.

This **graceful-fallback** pattern is the most interesting thing here: when an optimized native path can't be guaranteed (custom endpoint missing, plugin gated, etc.), the right answer is often "navigate the user back into wp-admin to complete the action" rather than failing loudly. The user gets the correct outcome with one extra page load — preferable to a broken Activate button.

## Architecture

`sorted` is a derived `useMemo` over `themes` that puts the active theme first and sorts the rest by name. `activeStylesheet` is read from the records first, then falls back to `window.wpAdminShell.activeTheme` for the brief window before core-data hydrates.

`details` holds `{ theme, isActive }` — a small object so the modal can render Activate buttons that aren't disabled when the user lands directly via details for the current active theme.

The activate handler:

1. Tries POST `/wp-admin-shell/v1/activate-theme` `{ stylesheet }`.
2. On success: `invalidateResolution` on the theme query + close any open details modal.
3. On failure: `window.location.href = adminUrl + 'themes.php?action=activate&stylesheet=...'` — the user lands in wp-admin's flow.

The custom endpoint is implemented on the PHP side (out of scope of this doc); rebuilds in other frameworks need their own.

## Rebuild guide

For a non-WPDS rebuild:

- Cards: any 3-column grid + media + content layout. Tailwind `grid-cols-3 gap-4` works directly.
- Details modal: a sizable modal with a media slot. Don't load the screenshot at full resolution unless the modal is open.
- Activation: either implement a server-side switch endpoint or fall back to wp-admin's `themes.php?action=activate&stylesheet=...` link with `_wpnonce` (note: nonce flow needs care; the shell's endpoint avoids this by relying on REST capability checks).
- Sort: active first, then alphabetical.

## Known limitations

- No install / upload flow. Adding themes happens in wp-admin.
- No theme preview (live preview via Customizer or block-theme preview).
- The screenshot URL is loaded directly from the theme record; large screenshots are not lazy-loaded.
- Description truncation is hard 140 chars. No "read more" affordance — long descriptions live in the details modal.
- The fallback URL flow loses the user's place in the shell; we don't restore it on return.
- **The classic-activate fallback link is missing `_wpnonce`.** `themes.php?action=activate&stylesheet=…` requires a fresh nonce or it silently bounces back to the themes list without activating. Per `docs/research/app-validation-2026-05-04.md`, this fallback path should either (a) call `wp_create_nonce('switch-theme_'.stylesheet)` from PHP and inject the resulting `&_wpnonce=…` into the link, or (b) route through a small PHP shim that performs the activation server-side. Until then, the fallback is best-effort only.
