---
name: wordpress-block-themes
description: Build, configure, and migrate WordPress block themes (WP 6.5+; current: 6.9, released December 2025). MUST load before making theme.json schema claims — WordPress ships twice yearly and training data goes stale within months. Use whenever working with theme.json settings/styles/presets/custom properties, block theme file structure (templates/, parts/, styles/, patterns/), style variations, section styles, the four-origin CSS cascade, per-block stylesheets, fluid typography, Font Library, template hierarchy, template locking, or classic-to-block migration. Also trigger on "block theme", "full site editing", "FSE", "Site Editor styling", "global styles", "theme.json v3", theme CSS specificity, render_block filters, block hooks for themes, or speculative loading config. For building/extending individual blocks use wordpress-blocks instead. For Interactivity API stores/directives use wordpress-interactivity instead. This skill covers the theme layer.
---

# WordPress Block Theme Development (WP 6.5+; current: 6.9, released December 2, 2025)

Block themes replace PHP templates with HTML block markup, configure design through `theme.json` instead of `add_theme_support()` calls, and integrate with the Site Editor for full-site editing. This skill covers theme-level architecture: configuration, file structure, templates, styling, and migration.

## Reference Files

Read the appropriate reference before generating theme code:

| File | When to read |
|------|-------------|
| `references/theme-json.md` | Any work with theme.json settings, styles, presets, custom properties, or per-block overrides |
| `references/templates-and-structure.md` | Creating/editing templates, template parts, patterns, style variations, section styles, or theme file organization |
| `references/css-and-php.md` | CSS strategies, specificity model, per-block stylesheets, functions.php, render filters, block hooks, migration, or advanced 6.6–6.9 features |
| `references/verification.md` | Before asserting a theme.json field / block API exists or doesn't — upstream URLs for live schema, dev-notes, and handbook checks |

For large themes or complex theme.json work, read `references/theme-json.md` first — it's the single source of truth for design configuration.

**Before claiming a field doesn't exist, or when touching anything added in a recent WP release, consult `references/verification.md` and verify against `schemas.wp.org/trunk/theme.json`.** This skill is a snapshot; WordPress ships twice yearly.

## Core Concepts

### Block themes vs classic themes

The presence of `templates/index.html` makes a theme a block theme. Without it, WordPress treats the theme as classic regardless of other files present.

Block themes gain automatic theme supports (post-thumbnails, editor-styles, responsive-embeds, html5, etc.) — never add these manually in `functions.php`.

### The four-origin cascade

Understanding this cascade is essential for every theme decision:

1. **Default** — WordPress core baseline (`wp-includes/theme.json`)
2. **Blocks** — per-block defaults from each block's `block.json`
3. **Theme** — your `theme.json` (child theme merges on top of parent)
4. **Custom** — user edits in Site Editor (stored in `wp_global_styles` CPT)

Presets from different origins coexist (keyed by origin). Styles override — custom wins over theme wins over blocks wins over default. This means theme styles can always be overridden by the user in the Site Editor, which is by design.

### CSS specificity model (6.6+)

WordPress standardized all theme.json/global styles output at `0-1-0` specificity using `:root :where()`. Theme CSS should match this:

```css
/* Correct — matches system specificity */
:root :where(.wp-block-image.is-style-rounded img) {
  border-radius: 2em;
}

/* Wrong — 0-2-0 overrides user styles */
.wp-block-group.has-background { padding: 2rem; }
```

Preset utility classes (`.has-primary-color`) use `!important`. Inline block styles use the `style` attribute.

### theme.json as single source of truth

Almost all design configuration belongs in theme.json. The hierarchy of where to put styling:

1. **theme.json `settings`** — define presets (colors, fonts, spacing, shadows) and enable/disable UI controls
2. **theme.json `styles`** — apply styles to body, elements, blocks, and variations
3. **theme.json `styles.css`** — small CSS additions with `&` nesting support
4. **Per-block stylesheets** — larger block-specific CSS, loaded on demand via `wp_enqueue_block_style()` with `path` for inlining
5. **style.css** — only the metadata header is required; avoid putting styles here

### Preset reference syntax

In theme.json values, reference presets with the shorthand `var:preset|{category}|{slug}`:

```json
"color": { "background": "var:preset|color|base" }
"typography": { "fontSize": "var:preset|font-size|lg" }
"spacing": { "padding": { "top": "var:preset|spacing|40" } }
```

In CSS, use standard custom properties: `var(--wp--preset--color--base)`.

Custom settings generate properties as `--wp--custom--{kebab-path}`: camelCase keys become kebab-case, nested objects add segments.

## Decision Framework

```
Building a theme from scratch?
  → Read references/theme-json.md for settings/styles
  → Read references/templates-and-structure.md for file layout
  → Start with: style.css (header only), theme.json, templates/index.html

Configuring colors, fonts, spacing, or shadows?
  → Read references/theme-json.md § Settings
  → Define presets in settings, apply in styles
  → Set defaultPalette/defaultFontSizes/defaultSpacingSizes to false
    to hide WordPress defaults (v3 behavior change)

Creating templates or template parts?
  → Read references/templates-and-structure.md
  → Follow the block template hierarchy (same as classic, .html extension)
  → Register parts in theme.json templateParts array

Adding style variations (dark mode, serif, etc.)?
  → Read references/templates-and-structure.md § Style Variations
  → Create JSON files in /styles/ directory
  → Can override settings + styles but NOT templates/patterns

Writing CSS beyond theme.json?
  → Read references/css-and-php.md § CSS Strategies
  → Prefer per-block stylesheets with path param for inlining
  → Match 0-1-0 specificity with :root :where()

Migrating a classic theme?
  → Read references/css-and-php.md § Migration
  → Use the feature mapping table
  → Consider hybrid approach: add theme.json first, convert incrementally

Need PHP (functions.php, filters, hooks)?
  → Read references/css-and-php.md § PHP
  → Keep functions.php minimal — most config belongs in theme.json
  → Block themes auto-enable many theme supports
```

## WP 6.9 frontend performance wins (December 2025)

These ship without theme changes, but you should know they are active so profiling, audits, and migration plans aren't based on pre-6.9 assumptions:

- **On-demand CSS for classic themes.** Classic themes now load only the styles for blocks present on a page (block themes already had this). Reduces CSS payload 30–65%.
- **Zero render-blocking CSS for default-style block themes.** Themes that don't ship custom stylesheets (Twenty Twenty-Three/Four-style) now load with no render-blocking CSS — global styles + per-block styles inline. LCP improves materially.
- **Inline CSS limit raised.** More small stylesheets get inlined instead of becoming render-blocking link tags.

When debugging "styles missing" or "FOUC" reports on 6.9, check whether per-block stylesheets are correctly registered (`wp_enqueue_block_style()` with `path`) before assuming a regression — the on-demand machinery only fires for properly registered handles.

Reference: `https://make.wordpress.org/core/2025/11/18/wordpress-6-9-frontend-performance-field-guide/`

## theme.json v2 → v3 Migration (WordPress 6.6)

Three breaking changes to watch for:

1. **`settings.typography.defaultFontSizes`** — defaults to `true` in v3. Set to `false` to hide default sizes when defining custom ones.
2. **`settings.spacing.defaultSpacingSizes`** — same behavior change. Set to `false` to hide defaults.
3. **spacingSizes + spacingScale merging** — in v3 they merge instead of replace. Remove `spacingScale` if both were defined and set `defaultSpacingSizes: false`.

## Quick-Start Scaffold

Minimal block theme structure:

```
mytheme/
├── style.css                    ← REQUIRED (metadata header only)
├── theme.json                   ← Design configuration
├── templates/
│   └── index.html               ← REQUIRED (makes it a block theme)
├── parts/
│   ├── header.html
│   └── footer.html
└── screenshot.png               ← 1200×900 for theme directory
```

**style.css** — only the header:
```css
/*
Theme Name: My Theme
Theme URI: https://example.com
Author: Author Name
Description: A modern block theme.
Version: 1.0.0
Requires at least: 6.8
Tested up to: 6.9
Requires PHP: 8.0
License: GPL-2.0-or-later
Text Domain: mytheme
*/
```

**templates/index.html** — minimal:
```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:query {"queryId":1,"query":{"perPage":10,"postType":"post","inherit":true}} -->
  <div class="wp-block-query">
    <!-- wp:post-template -->
      <!-- wp:post-title {"isLink":true} /-->
      <!-- wp:post-date /-->
      <!-- wp:post-excerpt {"moreText":"Continue reading"} /-->
    <!-- /wp:post-template -->
    <!-- wp:query-pagination -->
    <div class="wp-block-query-pagination">
      <!-- wp:query-pagination-previous /-->
      <!-- wp:query-pagination-numbers /-->
      <!-- wp:query-pagination-next /-->
    </div>
    <!-- /wp:query-pagination -->
  </div>
  <!-- /wp:query -->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

For full theme.json example and complete template set, see the reference files.

## Block Markup Syntax Reminders

```html
<!-- Self-closing -->
<!-- wp:site-title {"level":0} /-->

<!-- With content -->
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Title</h1>
<!-- /wp:heading -->

<!-- With inner blocks -->
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group">
  <!-- wp:paragraph -->
  <p>Content</p>
  <!-- /wp:paragraph -->
</div>
<!-- /wp:group -->

<!-- Template part -->
<!-- wp:template-part {"slug":"header","tagName":"header","area":"header"} /-->
```

Layout types: `constrained` (centered with max-width), `flex` (flexbox), `grid` (CSS grid), `flow` (default block flow).

## Common Pitfalls

- **Don't add automatic theme supports** — block themes get them for free. Adding them in `functions.php` is a no-op at best, confusing at worst.
- **Don't use `add_theme_support('editor-color-palette')`** — use `settings.color.palette` in theme.json instead.
- **Don't forget `defaultPalette: false`** — in v3, your custom palette appends to defaults rather than replacing them unless you explicitly opt out.
- **Don't over-specify CSS** — keep selectors at `0-1-0` or wrap in `:root :where()` so user styles can override.
- **Don't put styles in style.css** — theme.json and per-block stylesheets are the correct locations. style.css is for the metadata header.
- **Don't hardcode colors/fonts in templates** — use preset classes and theme.json styles so style variations work.
- **Don't forget `"version": 3`** — v2 and v3 have different preset override behavior. Always use v3 for new themes on WP 6.6+.
