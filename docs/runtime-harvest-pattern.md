# Runtime-Harvest Pattern

Several WordPress extension surfaces have **no clean REST representation** — they're PHP runtime structures that core + plugins populate at request time:

- the **admin menu** (`$GLOBALS['menu']` / `$GLOBALS['submenu']`),
- the **admin bar** (`WP_Admin_Bar` nodes),
- **admin notices** (`do_action('admin_notices')` output).

The shell **harvests** these server-side and folds them into the resolved admin.json doc, so un-ported third-party plugins still surface in the workspace (menu entries, toolbar nodes, notices) without anyone writing shell config. This is the server-side sibling of the [no-API fallback](./no-api-fallback-pattern.md): when there's no REST surface to *read* a runtime registry, harvest it in PHP.

---

## The convention

A harvest is a **`wp_admin_shell_data_plugin` pass at priority ~6** (after the merge, alongside the existing menu bridge + dataView baselines). Each pass:

1. **Skip-lists the core entries the shell already ships first-class** — so we never double-render Posts/Settings (menu), site-name/my-account/+New (admin bar), etc.
2. **Ingests the remainder** and synthesizes shell data under a named, extensible container.
3. **Exposes a filter on its skip-list** (e.g. `wp_admin_shell_classic_menu_core_slugs`) so a shell that mirrors more surfaces natively can extend what's skipped.

Harvest passes are **PHP** (`includes/cascade/`); they emit *data*. The kernel never learns about them — rendering happens app/engine-side.

---

## Instances

1. **Menu bridge** — *exists* (`WP_Admin_Shell_Classic_Menu_Bridge`). Walks `$GLOBALS['menu']`/`$GLOBALS['submenu']`, skips core parent slugs, synthesizes `screens[ingested-<slug>]` + `menu.ingested.items[]`. **#127** extends it: carry the numeric `position`, nest core-parented plugin submenus under the real shell parent (Settings/Tools) instead of the generic `ingested` bucket, and harvest menu icons.
2. **Admin-bar bridge** — *new (#128)*. Instantiate `WP_Admin_Bar`, run `do_action('admin_bar_menu', $bar)`, read `$bar->get_nodes()`; skip the core nodes already owned by `site-hub` / `user-menu` / `toolbar-actions` (incl. `+new` — built natively by **#129**); render plugin nodes in the toolbar (submenus → dropdown). Shell-side answer to upstream **#155**.
3. **Admin-notices buffer** — *new (#128)*. `ob_start` around `do_action('admin_notices')` on the shell's own render pass; feed the captured HTML to `core:notices-banner`.

   **Documented limitation:** the shell is a SPA, but `admin_notices` is a *per-page-render* hook. Only notices that fire on the shell's own page load (global ones) are captured; per-screen notices keyed on `$pagenow` / the current screen **do not fire** and are not surfaced. **Global-only is the accepted interim**; the proper fix is a notices REST surface (upstream **#155**).

---

## Arbitrary-icon escape hatch

Harvested entries carry icons the kernel's **name-based** icon registry (`resolveIcon`) can't resolve — dashicon classes, data-URIs, image URLs (menu icons), and inline HTML (admin-bar node titles). The **engine** nav/toolbar renderers need a pass-through render path (`<img src>` / dashicon class / trusted SVG) that bypasses the name registry. Engine-side (DS-specific) — **never** the kernel registry. One decision, two consumers (#127 menu icons, #128 admin-bar node titles).

---

## Trust

Harvested HTML (notice markup, admin-bar node titles) is **admin-context**, the same trust level at which classic wp-admin renders it. No new exposure; not sanitized beyond what the emitting plugin already does — identical to classic. (The shell only renders it inside the already-`manage_options`/admin-gated workspace.)

## Boundary

Harvest = PHP data emission. Rendering (icons, notice HTML, toolbar nodes) = engine/app space. The kernel stays DS-neutral throughout.
