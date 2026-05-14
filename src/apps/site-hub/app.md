# core:site-hub

Prose accompanying `app.json#documentation` for the site-hub header.

## Overview

SiteHubApp pins to the top of the navigation sidebar in the default engine. Three controls: site icon (→ dashboard), site title (→ home URL, new tab), command-palette toggle. The role is `banner` (ARIA landmark for the site identity surface).

The title-source-of-truth distinction matters: `useEntityRecord('root','site').record.title` is the canonical source; `window.wpAdminShell.siteName` is a fallback for the brief window before core-data hydrates. A prior bug had the site-hub render the window-global value indefinitely, missing user-edits from the settings page until refresh.

## Architecture

`memo + forwardRef` wrapping is deliberate. Engines may attach refs to measure the hub's rendered size for layout calculations; the forwardRef keeps that contract usable. `memo` is a defensive optimization — the hub re-renders on every kernel state change otherwise.

`SiteIcon` (sibling helper) renders the branded icon — reads `styles.branding.*` from the cascade and resolves to whatever asset path is set, or falls back to a default WordPress mark.

The ellipsis-in-flex pattern for the title is the one CLAUDE.md calls out: `display: flex; min-width: 0;` on the wrapper + `flex-grow: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap` on the Button. Both halves are required — WPDS Button is `inline-flex` by default; the wrapper's `min-width: 0` overrides the default `min-width: auto`; the wrapper's `display: flex` makes the Button's `flex-grow` actually stretch.

All three controls use `render={<a href={...}/>}` so they're real anchors. WPDS Button + IconButton drop `href` silently otherwise.

## Rebuild guide

A non-WPDS rebuild needs:

- An anchor-rendering button primitive (or just `<a>` styled to look like a button).
- A clipboard / command-palette integration. The shell uses `@wordpress/commands` for the open() dispatch; rebuilds must wire to whatever palette they ship.
- HTML-entity decoding for the site title. WordPress stores entities (`&amp;`) and serves them rendered; raw display would show the entities.
- Ellipsis-in-flex CSS for the title. Without it, long titles overflow the sidebar width.

## Known limitations

- **Site icon doesn't honor `site_icon` REST field.** It uses the engine's branding cascade. A future iteration could fall back to the REST `site_icon` URL when no engine branding is configured.
- **No notification badge.** wp-admin shows update counts as a badge on the admin bar; the shell omits this here.
- **Command palette shortcut is shell-level.** The `Mod+K` binding is declared in admin.json's `bindings` block, not by this app. The hub only renders the shortcut hint.
- **`isTransparent` prop is engine-specific.** Single-pane engine uses it; default engine doesn't. Documented as a per-engine convention rather than a stable contract.
