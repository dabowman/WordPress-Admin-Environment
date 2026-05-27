# Anti-patterns — the fast-reference checklist

When auditing an existing plugin or reviewing code, grep for these. Each is a real bug that ships with measurable frequency.

## Security

1. **`echo $_POST['x']`** — no sanitize, no escape → XSS. Also missing `wp_unslash()`.
2. **`$wpdb->query("... WHERE id=$id")`** — SQL injection; always `$wpdb->prepare()` with `%s`/`%d`/`%i` placeholders.
3. **`if ( is_admin() )` as an auth check** — only tests whether the request is to `/wp-admin/`, not whether the user has admin rights. Any logged-in subscriber can hit admin-ajax.
4. **Nonce without cap check, or cap check without nonce.** Nonces prove intent; capabilities prove authorization. You need both.
5. **`esc_attr()` on `href`/`src`** — doesn't block the `javascript:` pseudo-protocol. Use `esc_url()`.
6. **`echo __( 'Hi', 'td' )`** — translations aren't auto-escaped; use `esc_html__()`.
7. **`esc_url_raw()` on output** — it's a sanitizer for DB storage; use `esc_url()` for output.
8. **Missing `wp_unslash()` before sanitize on `$_POST`/`$_GET`/`$_REQUEST`/`$_COOKIE`** — WP applies magic-quote-style slashes that must be stripped first.

## Data & storage

9. **Storing literal `false` in a transient** — indistinguishable from a miss. Wrap in an array or use a sentinel.
10. **Autoloading large options** — cripples every page load. Use `autoload=off` and prime on the specific `load-{hook}` where the option is read.
11. **Missing `require_once ABSPATH . 'wp-admin/includes/upgrade.php'` before `dbDelta()`** — fatal.
12. **Single space after `PRIMARY KEY` in `dbDelta()` SQL** — silent parse failure. Must be two spaces: `PRIMARY KEY  (id)`.
13. **`update_option` for network-wide data on multisite** — saves per-site; use `update_site_option()`.
14. **`switch_to_blog` without `restore_current_blog`** — globals leak across the rest of the request.

## Cron & scheduling

15. **`wp_schedule_event` without a `wp_next_scheduled` guard** — queues duplicates on every call.

## Shortcodes & rewrites

16. **Shortcode callbacks that `echo` instead of `return`** — shortcodes are filters on `the_content`; echoing breaks output order.
17. **`flush_rewrite_rules()` on `init`** — runs on every page. Only flush on activation/deactivation.

## Versioning

18. **`version_compare('1.02', '1.1', '>')` returns `true`** — WP uses string-based PHP version comparison. Always use dotted SemVer (`1.1.0`, `1.2.0`).
19. **`register_uninstall_hook` with a closure** — closures can't be serialized into the DB. Use `uninstall.php` instead.

## REST API

20. **REST endpoint without `permission_callback`** — instant Plugin Check fail. Use `'__return_true'` for truly public endpoints, never blank.
21. **Returning plain arrays without `rest_ensure_response()`** — can't set headers/status.

## Blocks

22. **Block `save` mismatch between versions** — "block validation" red error in the editor. Use block deprecations (`deprecated` array in metadata) to migrate old content.
23. **`InnerBlocks.Content` missing in dynamic block `save`** — nested blocks disappear.

## AJAX

24. **Using `ajaxurl` on frontend** — undefined outside admin. Pass it via `wp_localize_script` or `wp_add_inline_script`.
25. **AJAX handler without `wp_die()` / `wp_send_json_*()`** — trailing `0` in the response.
26. **Missing `wp_ajax_nopriv_`** — action silently fails for anonymous users.

## Build & JS

27. **Calling webpack directly instead of `wp-scripts`** — loses `@wordpress/dependency-extraction-webpack-plugin` that auto-generates `.asset.php` files.
28. **Using `wp_localize_script` with Script Modules** — they're separate systems. Modules don't get localized data; pass via `wp_interactivity_state` or inline `<script type="module">`.

## WooCommerce / HPOS

29. **Reading order data with `get_post_meta( $order_id, ... )` under HPOS** — always use `wc_get_order()` + `$order->get_meta()`.

## Tooling

30. **PSR-4 + WPCS file naming conflict** — WPCS wants `class-my-class.php`; PSR-4 wants `MyClass.php`. Pick one and exclude the other's sniffs in `phpcs.xml.dist`.

## Patterns distilled (the positive form)

Modern WordPress plugin development in 2024–2026 is converging on a handful of dominant patterns. When you see the opposite of any of these in a plugin, flag it for modernization:

- **Block-first UI** with `block.json` registration replaces shortcodes and widgets.
- **Dynamic blocks with `render.php`** + the **Interactivity API** replace jQuery/React-heavy frontends.
- **REST API + `permission_callback`** replaces `admin-ajax.php`.
- **Script Modules + wp-scripts** replace hand-rolled webpack.
- **`register_post_meta` with `show_in_rest`** + **Block Bindings** replace custom metaboxes.
- **HTML API** replaces regex and DOMDocument for output mutation.
- **Block Hooks** replace template-filter monkeypatching.
- **PSR-4 + Composer + Strauss/php-scoper** replace hand-prefixed classes.

For security, the three-step discipline — **validate or sanitize on input, escape at output, check nonce AND capability before state changes** — is non-negotiable and will be flagged by Plugin Check and reviewers.

Study WooCommerce and ACF as reference architectures: both demonstrate the winning extensibility recipe of an **abstract base class + pluggable storage layer + hook taxonomy scoped by object name**, letting third parties extend without forking. For background work at scale, depend on **Action Scheduler** (bundled with WooCommerce) rather than WP-Cron.

For WordPress.org distribution, run **Plugin Check** locally before every submission, keep `readme.txt` Stable tag + main-file Version in sync, ship appropriate `/assets/` imagery, and declare dependencies via the **Requires Plugins** header while retaining PHP-side guards for older WordPress versions.

The `init` hook is where most registration happens; `admin_init` for settings and form handlers; `rest_api_init` for REST routes; `enqueue_block_editor_assets` for block editor JS/CSS. Flush rewrite rules only on (de)activation. Guard every state-changing endpoint with nonce + capability. Sanitize early, escape late, always.
