---
name: wordpress-plugin-development
description: Build, review, and modernize WordPress plugins end-to-end — plugin structure, security, data layer, content APIs, REST endpoints, admin UI, WP-CLI commands, testing, and WordPress.org distribution. Use whenever writing or editing any PHP file destined for wp-content/plugins/, creating a plugin header, registering hooks/actions/filters, working with $wpdb, custom tables, options, transients, post meta, CPTs, taxonomies, the Settings API, admin menus, shortcodes, cron, REST routes, admin-ajax handlers, uninstall.php, readme.txt, Requires Plugins, Plugin Check, or shipping to the .org directory. Trigger on any mention of "plugin header", "activation hook", "register_rest_route", "register_post_type", "dbDelta", "sanitize/escape/nonce", "admin-ajax", "wpdb->prepare", "Plugin Check", "wp.org submission", or extending WooCommerce/ACF/Action Scheduler. Also trigger for legacy plugin audits, refactoring to PSR-4/Composer/namespaces, and modernizing plugins for WordPress 6.5–6.9 patterns (Block Bindings, Block Hooks, HTML API, Script Modules, Interactivity API integration at the plugin level). For deep block-specific work, defer to the wordpress-blocks, wordpress-interactivity, wordpress-block-markup, or wordpress-rest-api skills — this skill is the plugin-level scaffolding around them.
---

# WordPress Plugin Development

A reference distilled from the WordPress Plugin Handbook, Block Editor Handbook, REST API Handbook, WP-CLI Handbook, and current best practices (WordPress 6.5+; current: 6.9, released December 2, 2025). This SKILL.md contains the non-negotiables and routing logic; the `references/` directory has the depth.

**Shipping to wp.org?** Load `wordpress-plugin-directory-guidelines` for the 18-point review checklist (GPL compliance, naming/trademark, trialware/freemium rules). Plugin Check covers some of these, the human review covers the rest.

## ⚠ Verify before asserting

WordPress ships twice yearly. Before claiming a hook signature, a function arg, or a "this isn't supported", check the live source:

| Surface | Live source |
|---|---|
| Plugin Handbook | `https://developer.wordpress.org/plugins/` |
| Code reference (functions/hooks/classes) | `https://developer.wordpress.org/reference/` |
| Per-release dev-notes | `https://make.wordpress.org/core/tag/dev-notes/` |
| Plugin Check rules | `https://developer.wordpress.org/plugins/wordpress-org/plugin-check/` |

Positive claims from this skill's references are fine; negative claims need a live check.

## Non-negotiables (apply to every file you write)

These four rules are checked by `Plugin Check` and by wp.org reviewers. Violating any of them is grounds for rejection — don't ship code that does.

1. **Every PHP file starts with an ABSPATH guard.** First executable line after the header comment:
   ```php
   if ( ! defined( 'ABSPATH' ) ) { exit; }
   ```
   Without this, the file can be hit directly via URL and leak errors, paths, or logic.

2. **The security holy trinity for any state-changing endpoint:** nonce check + capability check + sanitize/escape. All three. Skipping any one is a vulnerability. See `references/security.md`.

3. **Prefix everything globally exposed** — functions, classes, hooks, options, meta keys, post types, taxonomies, CSS classes, JS globals. Handbook suggests ≥5 chars. Modern plugins use PHP namespaces (`Acme\MyPlugin\`) instead of prefix-stringing. See `references/foundations.md` §Prefixing.

4. **Sanitize on input, escape on output, late.** These are not interchangeable. Validation rejects malformed data; sanitization cleans data for storage; escaping makes data safe for a specific output context (`esc_html`, `esc_attr`, `esc_url`, `esc_js`, `wp_kses_post`). `__()` does NOT escape — use `esc_html__()` when interpolating into HTML. See `references/security.md` §Escaping.

## Critical hook execution order

Getting hook timing wrong is the second most common bug after missing sanitize/escape. Memorize this table:

| Hook | Use for |
|------|---------|
| `plugins_loaded` | Initialize singletons, run upgrade routines (version-option check), load textdomain *only if not wp.org-hosted* |
| `init` | Register CPTs, taxonomies, shortcodes, blocks, rewrite rules, scripts |
| `admin_init` | Register settings (`register_setting`), handle form submissions |
| `admin_menu` | `add_menu_page` / `add_submenu_page` |
| `admin_enqueue_scripts` | Admin JS/CSS (receives `$hook_suffix`) |
| `wp_enqueue_scripts` | Frontend JS/CSS |
| `enqueue_block_editor_assets` | Editor-only JS/CSS |
| `rest_api_init` | Register REST routes |
| `save_post` / `save_post_{type}` | Persist meta (with nonce + cap check — always) |

**Flush rewrite rules ONLY on activation/deactivation.** Calling `flush_rewrite_rules()` on `init` runs it every page load and is a notorious performance killer.

**WP 6.7+ i18n gotcha:** translation functions called before `after_setup_theme` has fired emit `_doing_it_wrong` (the notice itself tells devs to move calls to `init` or later). Don't translate in `plugins_loaded`.

## Decision trees

### "Where do I put this data?"

```
Is it small (<1 KB), request-critical, shared across pages?
├─ YES → Options (autoload)
└─ NO ↓
Is it large config read only on specific screens?
├─ YES → Options (autoload=off), prime on load-{hook}
└─ NO ↓
Editorial content with title/taxonomy/revisions?
├─ YES → Custom Post Type + post meta
└─ NO ↓
Per-object ad-hoc fields attached to posts/users/terms?
├─ YES → Metadata API (register_meta with show_in_rest)
└─ NO ↓
High-volume relational data, indexed queries, millions of rows?
├─ YES → Custom table via dbDelta()
└─ NO ↓
Expensive computation with a TTL, OK to lose?
└─ YES → Transients (never store literal true/false)
```

Full details: `references/data-layer.md`.

### "How should users interact with this plugin?"

```
Needs to run on page load, state change, or background?
├─ Backend page action (form submit, bulk op) → admin-post.php handler OR REST endpoint
├─ Frontend async call from JS → REST API (preferred) or admin-ajax
├─ Scheduled/deferred work → WP-Cron for simple; Action Scheduler for >50 jobs or retries
├─ Content in post body → Block (preferred) > Shortcode (legacy, still fine for email/RSS)
├─ Admin settings form → Settings API (register_setting + options.php target)
├─ Block editor sidebar/inspector → SlotFill via registerPlugin
└─ CLI/automation → WP-CLI command
```

For new frontend interactivity in blocks, defer to the `wordpress-interactivity` skill. For REST endpoint design depth, use `wordpress-rest-api`. This skill covers the plugin-level scaffolding.

### "Class architecture — singleton, static, or DI?"

```
Tiny plugin (<500 LOC, a few functions)?
└─ Procedural with prefix is fine. Don't over-engineer.

Medium plugin, some OOP desired?
└─ Namespaced classes, hook registration in constructors, invoked from bootstrap.

Large plugin, testable, multi-team?
├─ PSR-4 + Composer
├─ Dependency injection container (league/container, symfony/di, or hand-rolled)
├─ Split into Controllers (hooks) / Services (logic) / Repositories (DB/API)
└─ Strauss or php-scoper to prefix vendored namespaces (avoid conflict with other plugins)
```

**Avoid singletons** for new code — global state, untestable, no DI. Use them only to match an existing pattern in a plugin you're extending.

## Quick workflows

### New plugin scaffolding

1. Create `plugin-name/plugin-name.php` with the canonical header (see `references/foundations.md` §Plugin header).
2. ABSPATH guard + plugin constants (`VERSION`, `FILE`, `DIR`, `URL`, `BASENAME`).
3. `uninstall.php` — prefer over `register_uninstall_hook()` (closures don't serialize).
4. `readme.txt` with `Stable tag`, `Tested up to`, `Requires PHP`, `License: GPLv2 or later`.
5. `composer.json` with PSR-4 autoload, dev deps (PHPUnit, Brain Monkey, WPCS).
6. `package.json` with `@wordpress/scripts` for any JS/CSS build.
7. `.wp-env.json` for local Docker dev.
8. Register activation/deactivation hooks early in the main file; keep heavy logic in a class.

### Existing plugin audit

Before touching anything, run the checklist in `references/anti-patterns.md`. Then run `wp plugin check <slug>` locally. Common findings: missing ABSPATH guards, unescaped output, missing nonce verification, raw `$_POST` access without `wp_unslash()`, `is_admin()` used as auth check, `$wpdb->query()` with string interpolation, `flush_rewrite_rules()` on `init`, autoloaded bloat options.

### Preparing for wp.org submission

1. Run `wp plugin check <slug> --categories=plugin_repo,security,performance`. Fix every flag.
2. Sync version: header `Version:`, `readme.txt` `Stable tag:`, a PHP constant, Git tag. WP uses `version_compare()` which treats `1.02` as greater than `1.1` — always use dotted SemVer.
3. Prepare `/assets/` (SVN plugin-root, not in trunk): icon-128, icon-256, banner-772x250, banner-1544x500, screenshot-1..N.
4. No obfuscation, no minified-only source, no phoning home without opt-in, no admin hijacking, GPLv2-compatible license on everything bundled.
5. Add `Requires Plugins:` header for any wp.org-hosted dependencies, plus a runtime PHP guard for pre-6.5 WordPress.

See `references/distribution.md` for the full guideline set and SVN workflow.

## When to read which reference

Load the reference that matches the current task — don't read all of them upfront.

- **`references/foundations.md`** — plugin header, bootstrap, activation/deactivation/uninstall, prefixing, namespacing, upgrade routines, Composer/PSR-4/Strauss, architecture patterns, coding standards, hooks system deep-dive.
- **`references/security.md`** — validation vs sanitization vs escaping (with function tables), nonces (including guest nonce gotcha), capability checks, SQL injection prevention with `$wpdb->prepare()`, file uploads, SSRF, complete secure handler pattern.
- **`references/data-layer.md`** — `$wpdb` CRUD, custom tables with `dbDelta()` (strict formatting rules), Options API (autoload states in 6.6+), Transients, Metadata API + `register_meta`, Privacy/GDPR exporters/erasers, Multisite (`switch_to_blog`, network options, network activation).
- **`references/content-apis.md`** — CPTs, taxonomies, Settings API, admin menus, shortcodes, widgets (legacy), WP-Cron, i18n (WP 6.5+ rules), HTTP API, Filesystem API, Rewrite API, Heartbeat, JS/CSS enqueuing (`.asset.php` pattern, `wp_add_inline_script` vs `wp_localize_script`).
- **`references/rest-and-ajax.md`** — `register_rest_route` with `permission_callback`, `WP_REST_Controller` subclassing, `register_rest_field`, authentication, admin-ajax (`wp_ajax_` + `wp_ajax_nopriv_`), when to choose REST vs AJAX.
- **`references/tooling.md`** — WP-CLI custom commands (docblock format, output helpers), PHPUnit scaffolding + `WP_UnitTestCase` + Brain Monkey, performance (object cache, `WP_Query` flags, bulk priming), Plugin Check (CLI + CI).
- **`references/distribution.md`** — `readme.txt` format, SVN structure (trunk/tags/assets), Detailed Plugin Guidelines (18 rules), `Requires Plugins` header (WP 6.5+) + older-WP fallback.
- **`references/architectures.md`** — WooCommerce (`WC_Data`, data stores, HPOS, custom `WC_Data` subclasses), Advanced Custom Fields (field types, location rules, Local JSON sync, ACF Blocks), Action Scheduler (preferred over WP-Cron at scale), feature plugin pattern.
- **`references/anti-patterns.md`** — the 30-item fast-reference checklist of things to grep for in any audit.

## Modernization cheat sheet

WordPress plugin development in 2024–2026 is converging on these replacements. When you see the left column in a plugin, suggest the right:

| Old → | New |
|-------|-----|
| Shortcodes/widgets | Blocks (block.json registration) |
| jQuery frontend | Interactivity API (`viewScriptModule`) |
| `admin-ajax.php` | REST API + `permission_callback` |
| Hand-rolled webpack | `@wordpress/scripts` (generates `.asset.php`) |
| Custom metaboxes | `register_post_meta` + Block Bindings |
| Regex / DOMDocument on HTML | HTML API (`WP_HTML_Tag_Processor`) |
| Template filter monkeypatching | Block Hooks |
| Hand-prefixed classes | PSR-4 + Composer + Strauss/php-scoper |
| `wp_localize_script` (stringifies) | `wp_add_inline_script` with `wp_json_encode` |
| WP-Cron at volume | Action Scheduler |
| `get_post_meta($order_id, ...)` under HPOS | `wc_get_order()` + `$order->get_meta()` |

## Related skills — use them for depth

- **`wordpress-blocks`** — custom block development, block patterns, extending core blocks, theme.json integration.
- **`wordpress-interactivity`** — Interactivity API directives, stores, client-side navigation.
- **`wordpress-block-markup`** — writing/editing serialized block markup for post content.
- **`wordpress-rest-api`** — REST endpoint design, headless WordPress, authentication patterns.
- **`gutenberg-contributor`** — contributing to the Gutenberg monorepo directly.

When a task is primarily about one of those topics, load the matching skill instead of duplicating its guidance here.
