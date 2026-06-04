# core:settings

Prose accompanying `app.json#documentation` for the settings host.

## Overview

SettingsApp is a thin composer — it owns the vertical nav and panel-switching state, but every actual settings UI lives in a standalone sibling app (`core:settings-general`, `core:settings-writing`, `core:settings-reading`, `core:settings-discussion`) imported by default export, or in `IframeApp` for the three wp-admin screens without REST coverage. The decomposition matches WordPress's settings page list one-for-one. Each native panel is also registered as its own builtin app, so a workspace can mount it directly as a screen (the default `wp-admin-default` workspace does exactly this) instead of routing through this host's internal nav.

Native panels (general, writing, reading, discussion) are React components that hit core-data directly. Iframed panels (permalinks, media, privacy) wrap `wp-admin/options-{permalink,media,privacy}.php` with chrome stripped. The decision matrix is documented in `docs/admin-json-api-validation.md#core-settings` — when REST coverage exists for a setting, it's native; when it doesn't, the iframe pattern preserves the right user-visible outcome at the cost of some workspace-chrome polish.

## Architecture

`BUILTIN_PANELS` is a module-level constant — id, label, Component or iframe URL, required capability. Workspaces narrow via `config.panels[]` allowlist; unknown ids in the allowlist are silently filtered out.

State:

- `activeId` (`useState`) — currently selected panel id. Initial value comes from URL segment (`segments[0]`) when present, falling back to `panels[0]?.id`.
- `activePanel` — the matched object, with safety fallback to `panels[0]` for unknown ids.

The right-column renderer:

- `PanelComponent` defined → render `<PanelComponent app={app} config={...} />`.
- `iframeUrl` defined → render `<IframeApp app={app} config={{ url }} />`.
- Neither → `null` (unreachable in practice).

The active state lives in `useState`, not the URL. This is a deliberate v1 compromise — refreshing the page lands on the first panel, not the one you were on. A future iteration should move this to a query slot (analogous to NavigationApp's `?screen=`).

## Rebuild guide

Two patterns worth preserving:

- **Decompose by panel.** Each settings sub-screen has its own data + form contract. Keeping them as siblings (not as one giant 1000-line component with a `switch`) means panels can be added, removed, or replaced independently. A non-WPDS rebuild ports each panel separately.
- **Iframe fallback for un-REST-able settings.** Permalinks, Media, and Privacy don't have clean REST surfaces; rather than reimplement them with custom endpoints, the iframe path preserves the right outcome with minimal effort. Mark these clearly in your panel registry so authors know which paths are "native" vs "iframed."

A non-WPDS rebuild needs a Tab / SegmentedControl / vertical-nav primitive, and equivalents of `ItemGroup + Item` for the panel list.

## Known limitations

- **Active panel id not in URL.** Refreshing the page returns to the first panel.
- **No plugin-panel registry.** The slot/fill extension was retired in V2.M4; plugins can ship their own apps but can't slot panels into `core:settings`. v2.x may reintroduce a registry once the surface stabilizes.
- **Capability gating is uniform** — every built-in panel requires `manage_options`. Per-panel capability differentiation (e.g. a future site-health-related panel needing `view_site_health_checks`) isn't wired up.
- **Empty-allowlist edge case** — if `config.panels = []` or filters out every built-in, the empty-state copy renders. Authoring tools should warn.
- **Site Icon picker not in any panel.** `docs/screens/settings-general.md` documents one as part of General settings, but `core:settings-general` does not ship it (see that app's Known limitations) and `core:settings` has no overlay UI for it either.
