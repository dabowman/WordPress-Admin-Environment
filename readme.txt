=== WP Admin Shell ===
Contributors: dabowman
Tags: admin, dashboard, react, dataviews, admin-ui
Requires at least: 6.7
Tested up to: 6.9
Requires PHP: 7.4
Stable tag: 0.1.0
Requires Plugins: gutenberg
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Replace wp-admin with a configurable, React-based admin environment driven by admin.json configuration files.

== Description ==

WP Admin Shell replaces the WordPress admin with a configurable, React-based admin
environment. The shell reads its layout, navigation, branding, and styling from
`admin.json` configuration files and renders a complete admin UI on top of
WordPress's existing REST API and design system.

WordPress has one admin interface — every user sees the same dashboard, menus, and
screens, and plugins add more. WP Admin Shell makes the admin **configurable**: a
JSON file declares which screens are available, how navigation is structured, what
branding to show, and which keyboard shortcuts do what. Swap the JSON file, swap the
admin experience. Same WordPress, same data, same plugins — a different admin for
different people.

**How it works**

* A `wp-content/admin.json` override layers over the bundled `wp-admin-default`
  baseline, like `theme.json` over core defaults — declare only what changes.
* A six-origin cascade resolver merges core / engine / plugin / site / role / user
  with field-aware, restrict-only semantics and trust tiers.
* Capability gating runs server-side (the config is pruned to the screens + menu a
  user can reach before it ships to the page) plus four runtime layers; every screen
  reads and writes through `/wp-json/`.
* Theming is engine-owned — the kernel is design-system-neutral and mounts the active
  engine's theme provider.

**Pluggable engines** — `core:default` (sidebar + content), `core:single-pane`
(mobile-first drawer), and `core:desktop` (windowed) ship bundled.

== Important: Gutenberg required ==

The Gutenberg plugin is a **hard runtime dependency** (declared via
`Requires Plugins: gutenberg`). `@wordpress/ui` overlay components opt into private
APIs against an allowlist WordPress core does not include but Gutenberg overrides.
Without Gutenberg active, the workspace stands down and classic wp-admin is served
instead. Activate Gutenberg first.

== Installation ==

1. Activate the **Gutenberg** plugin.
2. Upload `wp-admin-shell.zip` via **Plugins → Add New → Upload Plugin**, or copy the
   plugin folder into `wp-content/plugins/`.
3. Activate **WP Admin Shell**.
4. To turn the workspace on, drop a valid `admin.json` at `wp-content/admin.json`
   (copy a starter from the plugin's `shells/` directory and edit it). With no file
   present, wp-admin stays classic and untouched.

Press `Cmd/Ctrl+K` for the command palette. The workspace admin bar shows a
"Classic wp-admin" escape button (session-scoped, available to every logged-in user).

== Frequently Asked Questions ==

= Does this delete or modify my data? =

No. Every screen reads and writes through the standard WordPress REST API. The plugin
stores only its own configuration (options + per-user preference meta), and
`uninstall.php` removes all of it on delete. Your `wp-content/admin.json` is treated
as your content and is left in place on uninstall.

= How do I get back to classic wp-admin? =

Click the "Classic wp-admin" button in the workspace admin bar (a session-scoped,
nonce-protected toggle), or disable the workspace under Settings → WP Admin Shell.

= What happens if I deactivate Gutenberg? =

The workspace stands down and classic wp-admin is served, with an admin notice
explaining why. The admin never goes blank.

== Changelog ==

= 0.1.0 =
* First public-testing release. See CHANGELOG.md in the plugin for full detail.
