# CSS Strategies, PHP, Migration, and Advanced Features

## Table of Contents

1. [CSS custom properties from theme.json](#css-custom-properties)
2. [CSS specificity model](#specificity-model)
3. [Block markup CSS classes](#block-css-classes)
4. [CSS strategies for block themes](#css-strategies)
5. [Typography and Font Library](#typography-and-font-library)
6. [PHP in block themes](#php-in-block-themes)
7. [Block hooks](#block-hooks)
8. [Classic → block theme migration](#migration)
9. [Block Bindings API](#block-bindings-api)
10. [Speculative loading](#speculative-loading)
11. [Interactivity API in themes](#interactivity-api)
12. [WordPress 6.9 and 7.0](#wordpress-69-and-70)

---

## CSS custom properties

### From presets

`--wp--preset--{category}--{slug}`

```css
--wp--preset--color--primary: #0073aa;
--wp--preset--font-size--large: 36px;
--wp--preset--font-family--heading: "Inter", sans-serif;
--wp--preset--spacing--50: 1.5rem;
--wp--preset--gradient--vivid-cyan-blue: linear-gradient(...);
--wp--preset--shadow--natural: 6px 6px 9px rgba(0,0,0,0.2);
```

### From custom settings

`--wp--custom--{path}` (camelCase → kebab-case):

```css
--wp--custom--line-height-body: 1.6;
--wp--custom--form-input--border-color: #ccc;
```

### Layout properties

```css
--wp--style--global--content-size   /* from settings.layout.contentSize */
--wp--style--global--wide-size      /* from settings.layout.wideSize */
--wp--style--block-gap              /* from styles.spacing.blockGap */
--wp--style--root--padding-{side}   /* from styles.spacing.padding */
```

### Reference syntax

In theme.json: `var:preset|color|primary` or `var(--wp--preset--color--primary)`.
In CSS: `var(--wp--preset--color--primary)`.

---

## Specificity model

WordPress 6.6 standardized CSS specificity to **`0-1-0`** using `:root :where()`:

| Layer | Specificity | Mechanism |
|-------|-------------|-----------|
| Core block stylesheets | `0-1-0` | Complex selectors wrapped in `:root :where()` |
| Theme.json / Global Styles | `0-1-0` | Output with `:root :where()` |
| User Global Styles | `0-1-0` | Same specificity, loaded AFTER theme (wins by cascade) |
| Preset utility classes | `!important` | `.has-primary-color { color: ... !important; }` |
| Inline block styles | Inline attribute | `style="..."` on block wrapper |

**Write CSS that works with this model:**

```css
/* Correct: matches system specificity */
:root :where(.wp-block-image.is-style-rounded img) {
  border-radius: 2em;
}

/* Simple class = 0-1-0 naturally */
.wp-block-group { border: 1px solid currentColor; }

/* Wrong: 0-2-0, overrides user styles */
.wp-block-group.has-background { padding: 2rem; }

/* Fix: wrap in :root :where() */
:root :where(.wp-block-group.has-background) { padding: 2rem; }
```

---

## Block CSS classes

- **Block wrapper:** `.wp-block-{name}` (e.g., `.wp-block-image`, `.wp-block-group`)
- **Layout:** `.is-layout-flow`, `.is-layout-constrained`, `.is-layout-flex`, `.is-layout-grid`
- **Alignment:** `.alignwide`, `.alignfull`, `.aligncenter`, `.alignleft`, `.alignright`
- **Presets:** `.has-{slug}-{feature}` (e.g., `.has-primary-color`, `.has-large-font-size`)
- **Style variations:** `.is-style-{variation}` (e.g., `.is-style-outline`)

---

## CSS strategies

### Strategy 1: theme.json `styles.css` property

For small CSS additions. Supports `&` nesting where `&` becomes the block's root selector:

```json
{
  "styles": {
    "css": ".site-header { border-bottom: 1px solid currentColor; }",
    "blocks": {
      "core/table": {
        "css": "& thead th { background: #f5f5f5; }"
      }
    }
  }
}
```

### Strategy 2: Per-block stylesheets

For larger CSS, loaded on demand. With the `path` parameter, CSS is **inlined** in `<head>` (zero HTTP requests):

```php
add_action( 'init', 'themeslug_enqueue_block_styles' );
function themeslug_enqueue_block_styles() {
    $blocks = ['core/button', 'core/image', 'core/navigation'];
    foreach ( $blocks as $block ) {
        $slug = str_replace( '/', '-', $block );
        wp_enqueue_block_style( $block, [
            'handle' => "themeslug-block-{$slug}",
            'src'    => get_theme_file_uri( "assets/css/blocks/{$slug}.css" ),
            'path'   => get_theme_file_path( "assets/css/blocks/{$slug}.css" ),
        ] );
    }
}
```

### Strategy 3: style.css

Required but minimal in block themes. Only the header comment is needed for metadata. Most styles go in theme.json or per-block stylesheets.

---

## Typography and Font Library

### Fluid typography

```json
{
  "settings": {
    "typography": {
      "fluid": true,
      "fontSizes": [
        { "name": "Small", "slug": "sm", "size": "1rem", "fluid": false },
        { "name": "Medium", "slug": "md", "size": "1.25rem", "fluid": { "min": "1rem", "max": "1.5rem" } },
        { "name": "Large", "slug": "lg", "size": "2rem", "fluid": { "min": "1.5rem", "max": "2.5rem" } }
      ]
    }
  }
}
```

Generates `clamp()` values. Only works with `px`, `em`, or `rem` units. Sizes below `minFontSize` (default 14px) stay static.

### Font Library (WordPress 6.5+)

Accessed via Appearance → Editor → Styles → Typography → Manage Fonts. Stores fonts as `wp_font_family` and `wp_font_face` CPTs in `wp-content/uploads/fonts/`. Google Fonts downloaded locally for GDPR compliance.

```php
// Register custom font collection
wp_register_font_collection( 'brand-fonts', [
    'name'          => __( 'Brand Fonts', 'themeslug' ),
    'font_families' => get_theme_file_path( 'assets/fonts/brand-collection.json' ),
    'categories'    => [
        [ 'name' => __( 'Sans Serif' ), 'slug' => 'sans-serif' ],
    ],
] );

// Unregister Google Fonts collection
wp_unregister_font_collection( 'google-fonts' );

// Disable Font Library UI entirely
add_filter( 'block_editor_settings_all', function( $settings ) {
    $settings['fontLibraryEnabled'] = false;
    return $settings;
} );
```

---

## PHP in block themes

### Auto-enabled theme supports

Block themes automatically get: `post-thumbnails`, `editor-styles`, `responsive-embeds`, `automatic-feed-links`, `html5` (`comment-form`, `comment-list`, `search-form`, `gallery`, `caption`, `style`, `script`), plus the `should_load_separate_core_block_assets` and `should_load_block_assets_on_demand` filters set to `true` for on-demand block asset loading. **Do not** add these in `functions.php`.

### Minimal functions.php

```php
<?php
add_action( 'after_setup_theme', 'themeslug_setup' );
function themeslug_setup() {
    add_theme_support( 'wp-block-styles' );
    add_editor_style( 'assets/css/editor.css' );
}

add_action( 'init', 'themeslug_register_block_styles' );
function themeslug_register_block_styles() {
    register_block_style( 'core/image', [
        'name'  => 'rounded-shadow',
        'label' => __( 'Rounded Shadow', 'themeslug' ),
    ] );

    register_block_style( ['core/group', 'core/columns'], [
        'name'       => 'card',
        'label'      => __( 'Card', 'themeslug' ),
        'style_data' => [
            'border'  => [ 'radius' => '8px', 'width' => '1px', 'style' => 'solid' ],
            'shadow'  => 'var(--wp--preset--shadow--natural)',
            'spacing' => [ 'padding' => [
                'top' => '1.5rem', 'right' => '1.5rem',
                'bottom' => '1.5rem', 'left' => '1.5rem'
            ] ],
        ],
    ] );
}

add_action( 'init', 'themeslug_register_pattern_categories' );
function themeslug_register_pattern_categories() {
    register_block_pattern_category( 'themeslug-layouts', [
        'label' => __( 'Theme Layouts', 'themeslug' ),
    ] );
}

add_filter( 'should_load_remote_block_patterns', '__return_false' );

add_action( 'after_setup_theme', function() {
    remove_theme_support( 'core-block-patterns' );
} );
```

### Render block filters

```php
// Modify specific block output
add_filter( 'render_block_core/paragraph', 'themeslug_modify_paragraph', 10, 3 );
function themeslug_modify_paragraph( $block_content, $block, $instance ) {
    $processor = new WP_HTML_Tag_Processor( $block_content );
    if ( $processor->next_tag( 'p' ) ) {
        $processor->add_class( 'themeslug-paragraph' );
    }
    return $processor->get_updated_html();
}

// Short-circuit rendering
add_filter( 'pre_render_block', function( $pre_render, $parsed_block ) {
    if ( 'core/separator' === $parsed_block['blockName'] ) {
        return '<hr class="themeslug-separator" />';
    }
    return $pre_render;
}, 10, 2 );
```

**Available filters:** `pre_render_block`, `render_block_data`, `render_block`, `render_block_{ns/block}`, `render_block_context`.

### Key hooks

| Hook | Usage |
|------|-------|
| `after_setup_theme` | `add_theme_support()`, `add_editor_style()`, `remove_theme_support()` |
| `init` | `register_block_style()`, `register_block_pattern()`, `wp_enqueue_block_style()` |
| `wp_enqueue_scripts` | Front-end styles/scripts |
| `enqueue_block_editor_assets` | Editor-only JS/CSS |
| `enqueue_block_assets` | Both editor + front-end |

### Custom post type templates

```php
// theme.json customTemplates
{ "name": "single-portfolio", "title": "Portfolio", "postTypes": ["portfolio"] }

// Matching file: templates/single-portfolio.html

// Register default block content for CPT editor
$post_type_object = get_post_type_object( 'portfolio' );
$post_type_object->template = [
    ['core/image', ['align' => 'wide']],
    ['core/heading', ['placeholder' => 'Project Title']],
    ['core/paragraph', ['placeholder' => 'Description...']],
];
$post_type_object->template_lock = 'all';

// WP 6.7+ register_block_template() for plugins
register_block_template( 'myplugin//single-book', [
    'title'      => 'Single Book',
    'post_types' => ['book'],
    'content'    => '<!-- wp:template-part {"slug":"header"} /-->...',
] );
```

---

## Block hooks

WordPress 6.4+ — insert blocks automatically relative to anchor blocks.

**Via block.json:**
```json
{
  "name": "myplugin/like-button",
  "blockHooks": {
    "core/post-content": "after",
    "core/navigation": "last_child"
  }
}
```

**Via PHP filter:**
```php
add_filter( 'hooked_block_types', function( $hooked, $position, $anchor, $context ) {
    if ( 'after' === $position && 'core/post-content' === $anchor ) {
        if ( $context instanceof WP_Block_Template && 'single' === $context->slug ) {
            $hooked[] = 'myplugin/share-buttons';
        }
    }
    return $hooked;
}, 10, 4 );
```

Positions: `before`, `after`, `first_child`, `last_child`. Only works with dynamic blocks on unmodified templates.

---

## Migration

### Classic → block feature mapping

| Classic | Block Theme |
|---------|-------------|
| `index.php` | `templates/index.html` |
| `header.php` / `get_header()` | `parts/header.html` / `<!-- wp:template-part {"slug":"header"} /-->` |
| `the_title()` | `<!-- wp:post-title /-->` |
| `the_content()` | `<!-- wp:post-content /-->` |
| `the_excerpt()` | `<!-- wp:post-excerpt /-->` |
| `the_post_thumbnail()` | `<!-- wp:post-featured-image /-->` |
| `wp_nav_menu()` | `<!-- wp:navigation /-->` |
| `get_search_form()` | `<!-- wp:search /-->` |
| `comments_template()` | `<!-- wp:comments /-->` |
| `the_posts_pagination()` | `<!-- wp:query-pagination /-->` |
| `bloginfo('name')` | `<!-- wp:site-title /-->` |
| `the_custom_logo()` | `<!-- wp:site-logo /-->` |
| `register_sidebar()` | Template parts or group blocks |
| `register_nav_menus()` | Not needed; Navigation block in templates |
| `add_theme_support('editor-color-palette')` | `settings.color.palette` |
| `add_theme_support('editor-font-sizes')` | `settings.typography.fontSizes` |
| `$content_width` | `settings.layout.contentSize` |
| Customizer | Site Editor → Styles |
| Widgets | Group blocks with patterns in template parts |

### Widget equivalents

| Widget | Block |
|--------|-------|
| Recent Posts | `<!-- wp:latest-posts /-->` |
| Categories | `<!-- wp:categories /-->` |
| Tag Cloud | `<!-- wp:tag-cloud /-->` |
| Search | `<!-- wp:search /-->` |
| Text/HTML | `<!-- wp:paragraph /-->` or `<!-- wp:html /-->` |
| Navigation Menu | `<!-- wp:navigation /-->` |
| RSS | `<!-- wp:rss /-->` |
| Calendar | `<!-- wp:calendar /-->` |

### Hybrid (universal) themes

Incremental migration path:

1. **Add theme.json** — gains global styles and editor controls
2. **Enable block template parts:** `add_theme_support( 'block-template-parts' );`
3. **Use in PHP:** `<?php block_template_part( 'footer' ); ?>`
4. **Add patterns** in `/patterns/` (auto-registered since WP 6.0)
5. **Full conversion:** Add `templates/index.html` to make it a block theme

### create-block-theme plugin

Official WordPress plugin for building/migrating block themes. Features: create blank/child themes or clone existing, save Site Editor customizations back to theme files, export as installable ZIP, save fonts from Font Library to theme, create style variations from Global Styles changes.

---

## Block Bindings API

WordPress 6.5+ — connect block attributes to dynamic data without custom blocks.

**Built-in sources:**
- `core/post-meta` — custom fields (6.5+)
- `core/pattern-overrides` — per-instance pattern content (6.5+)
- `core/post-data` — post date, modified, link (6.9+)
- `core/term-data` — taxonomy term fields (6.9+)

```html
<!-- Bind paragraph to post meta -->
<!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"product_price"}}}}} -->
<p>$0.00</p>
<!-- /wp:paragraph -->
```

**Register custom binding source:**
```php
register_block_bindings_source( 'mytheme/site-info', [
    'label'              => __( 'Site Information', 'mytheme' ),
    'get_value_callback' => function( $source_args ) {
        return match( $source_args['key'] ?? '' ) {
            'year'      => date( 'Y' ),
            'copyright' => '© ' . date( 'Y' ) . ' ' . get_bloginfo( 'name' ),
            default     => null,
        };
    },
] );
```

**Compatible blocks (6.9):** `core/image` (id, url, title, alt, caption), `core/heading` (content), `core/paragraph` (content), `core/button` (url, text, linkTarget, rel), `core/post-date` (datetime), `core/navigation-link` (url), `core/navigation-submenu` (url).

---

## Speculative loading

WordPress 6.8 — uses the Speculation Rules API to prefetch/prerender URLs before navigation. Default: `prefetch` with `conservative` eagerness.

```php
// Customize speculative loading
add_filter( 'wp_speculation_rules_configuration', function( $config ) {
    return [
        'mode'      => 'prefetch',      // 'prefetch' or 'prerender'
        'eagerness' => 'conservative',   // 'conservative', 'moderate', or 'eager'
    ];
} );

// Exclude URLs
add_filter( 'wp_speculation_rules_href_exclude_paths', function( $paths ) {
    $paths[] = '/checkout/*';
    return $paths;
} );
```

Add `no-prefetch` or `no-prerender` CSS classes to opt specific links out.

---

## Interactivity API

WordPress 6.5+ — lightweight declarative frontend interactivity (~10KB runtime):

```html
<div data-wp-interactive="mytheme/toggle" data-wp-context='{"isOpen": false}'>
    <button data-wp-on--click="actions.toggle" data-wp-text="state.label">Toggle</button>
</div>
```

```js
import { store, getContext } from '@wordpress/interactivity';
store( 'mytheme/toggle', {
    state: { get label() { return getContext().isOpen ? 'Close' : 'Open'; } },
    actions: { toggle() { getContext().isOpen = !getContext().isOpen; } },
} );
```

For full Interactivity API coverage, use the `wordpress-interactivity` skill.

---

## WordPress 6.9 and 7.0

### 6.9 highlights (December 2, 2025)

**theme.json additions:**
- **`settings.border.radiusSizes`** — preset array (`[{name, slug, size}]`) generating `--wp--preset--radius--{slug}`. See `theme-json.md § settings.border`. No `defaultRadiusSizes` toggle — core ships no defaults, theme is sole source.

**New core blocks:**
- **`core/section`** — semantic `<section>` grouping block with its own layout/style support; target for section styles.
- **`core/accordion`** — native collapsible content (no custom block / Interactivity-API boilerplate needed).
- **`core/math`** — LaTeX/MathML rendering.
- **`core/terms-query`** — loop over taxonomy terms (the taxonomy analogue of Query Loop).
- **`core/comments-link`**, **`core/comments-count`** — dedicated blocks for comment permalinks and totals.
- **`core/time-to-read`** — dynamic reading-time display.

**Typography / layout:**
- **Fit Text** — auto-adjusts text size to fill container.
- **Gallery aspect ratio** — uniform ratio across gallery images.

**Internals / APIs:**
- **Block Processor** — streaming parser, prevents OOM on large `post_content`.
- **`block_bindings_supported_attributes` filter** — expand Block Bindings to custom block attributes.
- **Block Bindings sources** — `core/post-data` and `core/term-data` added (see Block Bindings section).
- **Interactivity API** — unique-directive IDs (`---name` suffix), Router asset auto-loading.

Before asserting a 6.9 feature exists or doesn't, verify against `schemas.wp.org/trunk/theme.json` and the dev-notes tag feed (`make.wordpress.org/core/tag/dev-notes+6-9/`). See `references/verification.md`.

### 7.0 roadmap (April 2026)

Phase 3 collaboration advancing: real-time collaborative editing, content-only editing improvements, enhanced template management, new admin design foundations, PHP-only block registration, View Transitions plugin for animated navigation.

- **Block-level pseudo-selectors** — `core/button` now supports `:hover`, `:focus`, `:focus-visible`, `:active` directly in theme.json `styles.blocks` (not just on the `button` element):
  ```json
  {
    "styles": {
      "blocks": {
        "core/button": {
          ":hover": { "color": { "background": "var:preset|color|secondary" } }
        }
      }
    }
  }
  ```
