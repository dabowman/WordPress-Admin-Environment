# WordPress.org Distribution

readme.txt, SVN structure, Detailed Plugin Guidelines, and the `Requires Plugins` header.

## readme.txt

Lives at plugin root. Uses a WordPress-flavored Markdown subset.

```
=== Express Checkout for Shop ===
Contributors: janedev, acmeteam
Donate link: https://example.com/donate
Tags: checkout, ecommerce, payments, shop, express
Requires at least: 6.5
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Short description ≤150 chars, plain text, no markup.

== Description ==
Long description. Markdown allowed. YouTube/Vimeo URLs on their own line auto-embed.

== Installation ==
1. Upload to /wp-content/plugins/
2. Activate

== Frequently Asked Questions ==
= Does it work offline? =
Yes.

== Screenshots ==
1. Settings — screenshot-1.png
2. Frontend — screenshot-2.png

== Changelog ==
= 2.0.0 =
* Security fix.

== Upgrade Notice ==
= 2.0.0 =
Security release. Upgrade immediately. (≤300 chars)
```

### Key fields

- **Stable tag** — CRITICAL. Points to `/tags/X.Y.Z/` in SVN. Everything except the version header is read from that folder's `readme.txt`. Get this wrong and wp.org ships the wrong version or shows stale text.
- **Contributors** — wp.org usernames only, case-sensitive.
- **Tags** — max 5; stuffing = rejection.
- **Requires at least / Tested up to / Requires PHP** — version floors/ceilings. Keep `Tested up to` current with the latest stable WordPress.
- **License** — must be GPLv2-compatible.

## SVN structure

- **`/trunk`** — dev HEAD; NOT shipped unless `Stable tag: trunk` (discouraged).
- **`/tags/X.Y.Z/`** — immutable snapshots; `Stable tag` points here.
- **`/assets`** — plugin-root (not inside trunk), served by wp.org, not shipped to users:
  - `icon-128x128.(png|jpg|gif)`, `icon-256x256.(png|jpg|gif)` (retina)
  - `banner-772x250.(png|jpg)`, `banner-1544x500.(png|jpg)` (retina)
  - `screenshot-1.png` … `screenshot-N.png` (must match the `readme.txt` Screenshots list)
  - Optional `blueprint.json` for Playground previews
- **`/branches`** — optional, rarely used.

### Release workflow

```
svn cp /trunk /tags/2.0.0
# bump Version: in the main PHP file
# bump Stable tag: in readme.txt
svn commit -m "Release 2.0.0"
```

Propagates to the directory in ~15 minutes.

## Detailed Plugin Guidelines (18 rules, abridged)

1. GPLv2+ compatible license for all code, bundled fonts, libraries, images.
2. Developer is accountable for everything in the zip.
3. Stable versions only — no beta/trialware; SaaS OK.
4. Human-readable code — no obfuscation, no minified-only source.
5. No phoning home without explicit opt-in.
6. Serviceware allowed if the plugin itself is functional.
7. No loading PHP from third-party servers (`eval` of remote strings banned).
8. No admin hijacking (full-screen nags, unrelated notice hiding, dashboard redirects).
9. No illegal/dishonest actions.
10. Credit transparently; respect forks.
11. No public-facing credits/links without user opt-in.
12. No readme spam or keyword stuffing.
13. Respect trademarks — no slug starting with "WordPress", "WooCommerce", "Yoast", "Elementor", etc.
14. No developer conflict/duplicate-submission gaming.
15. WP.org may remove any plugin at will.
16. Don't abuse WP.org APIs or forums.
17. Must not break a site on activation; no editing core.
18. WP.org reserves the right to make exceptions.

### Common rejection reasons

Missing readme/license, trademarked slug, external script loading without justification, obfuscation, reinventing core APIs, missing nonces/cap checks, missing sanitization/escaping, raw `$_POST` access, raw `$wpdb->query` for schema, unprefixed globals, bundled framework collisions, tracking without opt-in, admin ads.

## Requires Plugins header (WP 6.5+)

```
Requires Plugins: woocommerce, advanced-custom-fields
```

### Rules

- Comma-separated **wordpress.org slugs only** (not paths, not URLs).
- No version constraints.
- No MU-plugins, no themes.

### Core behavior

- **Activate is blocked** on dependent plugins while dependencies are missing; UI shows Install/Activate links.
- **Deactivate/Delete is blocked** on a dependency while any dependent is active.
- "Requires:" / "Required by:" rows appear on the Plugins screen.
- Circular dependencies are detected and blocked.
- WP-CLI still blocks `activate` for unmet deps.
- Filter `wp_plugin_dependencies_slug` lets premium forks satisfy a dep via slug rewriting.
- `WP_Plugin_Dependencies` class: `has_dependents()`, `has_dependencies()`, `get_dependents($slug)`, `has_unmet_dependencies()`, etc.

### Fallback for older WordPress

Header is harmless on <6.5 (it's just ignored), but add a runtime guard for older WP and for version/feature-level checks:

```php
add_action( 'plugins_loaded', function() {
    if ( ! function_exists( 'is_plugin_active' ) ) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }
    if ( ! is_plugin_active( 'woocommerce/woocommerce.php' ) ) {
        add_action( 'admin_notices', fn() =>
            printf(
                '<div class="notice notice-error"><p>%s</p></div>',
                esc_html__( 'Plugin requires WooCommerce.', 'acme' )
            )
        );
        return;
    }
    acme_bootstrap();
} );
```

Ship both: the header for WP 6.5+ UX, PHP guards for older WP and for version/feature gating.
