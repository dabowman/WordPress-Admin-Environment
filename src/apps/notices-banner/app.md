# core:notices-banner

Prose accompanying `app.json#documentation` for the persistent banner notice host.

## Overview

NoticesBannerApp renders two sources at the top of its region:

1. **`@wordpress/notices`** filtered to `type: 'default'`, one `Notice.Root` each. The notice bus is the shell's primary cross-app messaging channel — apps fire `createNotice('error', message)` from anywhere; the banner host (mounted once per shell) surfaces them.
2. **Harvested `admin_notices` HTML (#128)** — global `admin_notices` output buffered server-side (`WP_Admin_Shell_Chrome_Harvest::capture_admin_notices()`) and exposed at `window.wpAdminShell.adminNotices`. Rendered unchanged inside a single neutral `Notice.Root` so an un-ported plugin's notice still surfaces in the workspace. Read once at mount (it's a static server-render snapshot) and locally dismissible.

No data ownership for stream 1: the app is a renderer. State lives in `@wordpress/notices`; updates flow through `useSelect` + `useDispatch`. Stream 2 is a static HTML snapshot dismissed via local `useState`.

## Rebuild guide

The notice-bus pattern is reusable across frameworks — Redux + a slice, Zustand store, Pinia, etc. The contract is:

- A central store with `notices: []` shape, each `{ id, type ('default'|'snackbar'), status ('info'|'warning'|'success'|'error'), content, isDismissible }`.
- A `createNotice(status, content, options)` dispatch.
- A `removeNotice(id)` dispatch for dismissals.
- Filtered rendering: banner host listens for `type: 'default'`; snackbar host listens for `type: 'snackbar'`.

A non-WPDS rebuild needs a Notice / Alert primitive with intent variants + a close affordance. Material has `Alert`, Tailwind needs hand-rolled — both are standard fare.

## Harvested admin_notices (server side)

`WP_Admin_Shell_Chrome_Harvest::capture_admin_notices()` wraps `ob_start()` around `do_action('admin_notices')` + `do_action('all_admin_notices')` on the shell's own render pass and returns the captured HTML. The markup is admin-context (same author-trust as classic wp-admin) and rendered via `dangerouslySetInnerHTML` — the shell only ever renders it inside the already-admin-gated workspace.

**Double-dispatch guard.** Capture runs from `wp_admin_shell_enqueue_assets()` on `admin_enqueue_scripts` (top of `admin-header.php`), which the hijack renders the shell through — and `admin-header.php` fires those same two actions AGAIN near its bottom. So immediately after buffering, the harvest `remove_all_actions()` on both hooks: the later native pass becomes a no-op (no double side effects, no duplicate markup beside the shell mount), and the buffered HTML is the single source this banner renders. The capture is memoized so a second call returns the same HTML without re-dispatching a now-drained hook. See the harvest class docblock.

## Known limitations

- **Global-only admin_notices (#128).** The shell is a SPA but `admin_notices` is a *per-page-render* hook. Only notices that fire on the shell's own page load (global ones) are captured; per-screen notices keyed on `$pagenow` / the current classic screen do not fire and aren't surfaced. **Global-only is the accepted interim** — the proper fix is a notices REST surface (upstream #155).
- **Harvested notices don't round-trip dismissal to the server.** The close icon hides the captured HTML for the session via local state; it does not call any `admin_notices` dismiss endpoint (there isn't one). A reload re-shows it if the plugin still emits it.
- **No notice grouping.** Five repeated errors render as five banners. wp-admin's notices collapse duplicates; the shell doesn't.
- **No order control.** Notices render in arrival order. No priority / pinned-at-top semantics.
- **No auto-dismiss for non-snackbar notices.** Banner notices are sticky until the user dismisses (or another notice with the same id arrives).
- **`Notice.Description` accepts strings only by convention.** Rich content (links inside notices) requires either authoring HTML or composing through `Notice.Actions`.
