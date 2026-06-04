# core:dashboard-widget-classic

Captured-HTML tile for an **un-ported classic dashboard widget**, bridged into the dashboard-host grid by the classic dashboard-widget bridge (#134). This is the render half; the harvest half is `WP_Admin_Workspaces_Dashboard_Bridge` (`includes/cascade/class-wp-admin-workspaces-dashboard-bridge.php`).

## Overview

The classic wp-admin dashboard is a runtime structure (`$wp_meta_boxes['dashboard']`) that core + plugins populate at request time via `wp_add_dashboard_widget()`. There is no clean REST surface to enumerate or render those widgets. The bridge **harvests** the meta-boxes server-side, skips the core widgets the shell ships native after #133, and synthesizes a `screens[dashboard-widgets].apps[]` tile for each surviving **plugin** widget — each tile mounts THIS app with per-tile `config.widgetId` + `config.title`.

This is the dashboard sibling of the #128 admin-bar / notices chrome harvest — the same runtime-harvest pattern (skip-core-first, ingest-rest, expose a skip-list filter). See `docs/runtime-harvest-pattern.md`.

## Architecture

- On mount, the tile fetches `GET /wp-admin-workspaces/v1/dashboard-widget/{widgetId}` via `@wordpress/api-fetch` (the documented non-entity HTML-capture exception). The endpoint (`WP_Admin_Workspaces_Dashboard_Widget_REST`) re-runs `wp_dashboard_setup()`, locates the meta-box callback by id, `ob_start`-captures its echoed HTML, and returns `{ id, title, html }`.
- The fetch is **lazy / per-tile** so a slow plugin widget (remote feed, heavy query) doesn't block the whole grid — the tile paints a Spinner and fills in when its own request resolves.
- The captured HTML is rendered at admin trust via `dangerouslySetInnerHTML` — identical to what classic wp-admin echoes for the same widget, same author-trust boundary as the #128 notices buffer.
- A per-tile toolbar toggle ("Open classic dashboard") swaps the captured HTML for an iframe of classic `index.php` (chromeless). wp-admin has no single-widget URL, so this loads the **entire** classic dashboard (every widget), not just this tile's widget — but the widget's own enqueued JS runs natively there, so it's the fidelity fallback for JS-driven widgets.

## Permission gate

`GET /wp-admin-workspaces/v1/dashboard-widget/{id}` floors on logged-in + `current_user_can('read')` (the classic dashboard's own view cap). The substantive gate is the per-widget check: the id must NOT be a shell-native core widget (`WP_Admin_Workspaces_Dashboard_Bridge::is_core_widget()`) AND must be a widget the dashboard actually registered this request — an unknown / core / removed id 404s. A caller can only render a widget the dashboard already registered, never an arbitrary callback.

## Rebuild guide

- Read `config.widgetId` + `config.title` from the mount config.
- Fetch the captured HTML from `/wp-admin-workspaces/v1/dashboard-widget/{widgetId}`.
- Render `{ html }` at admin trust (HTML injection — no sanitization beyond what the emitting plugin already does, matching classic).
- Provide an iframe fallback to `{adminUrl}index.php?wp_admin_workspaces_chromeless=1` for JS-driven widgets. This is the whole classic dashboard, not a single widget.
- States: loading (Spinner) / ready (HTML) / empty (no HTML) / error (message + nudge to classic dashboard) / iframe-fallback.

## Known limitations

- **JS loss.** Captured HTML is injected via `dangerouslySetInnerHTML`; React does NOT execute injected `<script>` tags, and the widget's enqueued JS / AJAX handles aren't loaded on the shell page. Widgets that depend on JS (live feeds, interactive charts, AJAX forms) degrade to **static HTML**. The per-tile **iframe fallback** is the fidelity path — it loads classic `index.php` where the widget's JS runs natively. This is the accepted interim, the same escape-hatch tier as the #128 notices iframe fallback.
- The iframe fallback shows the **whole** classic dashboard (chromeless), not just the one widget — there is no per-widget classic URL in wp-admin.
- Per-screen / per-widget styling from the plugin's enqueued admin CSS is not loaded; the captured markup inherits the tile's WPDS surroundings (links + images constrained; no attempt to restyle classic markup).
