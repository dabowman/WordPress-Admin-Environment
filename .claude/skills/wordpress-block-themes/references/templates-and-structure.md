# Templates, File Structure, and Style Variations

## Table of Contents

1. [Theme file structure](#theme-file-structure)
2. [Template hierarchy](#template-hierarchy)
3. [Template resolution order](#template-resolution-order)
4. [Core template examples](#core-template-examples)
5. [Template locking](#template-locking)
6. [Block patterns](#block-patterns)
7. [Style variations](#style-variations)
8. [Section styles](#section-styles)

---

## Theme file structure

```
mytheme/
├── style.css                    ← REQUIRED (metadata header only)
├── theme.json                   ← Practically required
├── templates/                   ← Required directory
│   ├── index.html               ← REQUIRED (makes it a block theme)
│   ├── front-page.html
│   ├── home.html
│   ├── single.html
│   ├── page.html
│   ├── archive.html
│   ├── search.html
│   ├── 404.html
│   ├── category.html
│   ├── tag.html
│   └── author.html
├── parts/
│   ├── header.html
│   ├── footer.html
│   ├── sidebar.html
│   └── comments.html
├── patterns/
│   ├── hero.php
│   └── call-to-action.php
├── styles/
│   ├── dark.json
│   └── serif.json
├── assets/
│   ├── fonts/
│   ├── images/
│   ├── css/
│   │   └── blocks/
│   │       ├── core-image.css
│   │       └── core-button.css
│   └── js/
├── functions.php                ← Optional
└── screenshot.png               ← 1200×900 for theme directory
```

The **primary differentiator**: the presence of `templates/index.html` (or legacy `block-templates/index.html`). Without either, WordPress treats the theme as classic.

---

## Template hierarchy

Block themes follow the identical hierarchy as classic themes, but with `.html` extensions in `/templates/`:

- **Single Post**: `single-{post-type}-{slug}.html` → `single-{post-type}.html` → `single.html` → `singular.html` → `index.html`
- **Page**: `page-{slug}.html` → `page-{id}.html` → `page.html` → `singular.html` → `index.html`
- **Category**: `category-{slug}.html` → `category-{id}.html` → `category.html` → `archive.html` → `index.html`
- **Tag**: `tag-{slug}.html` → `tag.html` → `archive.html` → `index.html`
- **Taxonomy**: `taxonomy-{tax}-{term}.html` → `taxonomy-{tax}.html` → `taxonomy.html` → `archive.html` → `index.html`
- **Author**: `author-{nicename}.html` → `author-{id}.html` → `author.html` → `archive.html` → `index.html`
- **Date**: `date.html` → `archive.html` → `index.html`
- **Search**: `search.html` → `index.html`
- **404**: `404.html` → `index.html`
- **Front Page**: `front-page.html` → Home/Page hierarchy fallback
- **Home (blog)**: `home.html` → `index.html`
- **Post Type Archive**: `archive-{post-type}.html` → `archive.html` → `index.html`

---

## Template resolution order

1. **User-modified templates** — stored as `wp_template` CPT in database with `publish` status
2. **Child theme** `/templates/` file
3. **Parent theme** `/templates/` file

WordPress syncs theme files to the `wp_template` CPT as `auto-draft`. When users edit in the Site Editor, status changes to `publish`, overriding the file. Users can reset to theme defaults through the Site Editor.

---

## Core template examples

### templates/index.html

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:query {"queryId":1,"query":{"perPage":10,"postType":"post","order":"desc","orderBy":"date","inherit":true}} -->
  <div class="wp-block-query">
    <!-- wp:post-template -->
      <!-- wp:post-featured-image {"isLink":true} /-->
      <!-- wp:post-title {"isLink":true} /-->
      <!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
      <div class="wp-block-group">
        <!-- wp:post-date /-->
        <!-- wp:post-author {"showAvatar":false} /-->
      </div>
      <!-- /wp:group -->
      <!-- wp:post-excerpt {"moreText":"Continue reading"} /-->
    <!-- /wp:post-template -->
    <!-- wp:query-pagination {"layout":{"type":"flex","justifyContent":"space-between"}} -->
    <div class="wp-block-query-pagination">
      <!-- wp:query-pagination-previous /-->
      <!-- wp:query-pagination-numbers /-->
      <!-- wp:query-pagination-next /-->
    </div>
    <!-- /wp:query-pagination -->
    <!-- wp:query-no-results -->
      <!-- wp:paragraph -->
      <p>No posts found.</p>
      <!-- /wp:paragraph -->
    <!-- /wp:query-no-results -->
  </div>
  <!-- /wp:query -->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

### parts/header.html

```html
<!-- wp:group {"layout":{"type":"constrained"},"style":{"spacing":{"padding":{"top":"var:preset|spacing|30","bottom":"var:preset|spacing|30"}}}} -->
<div class="wp-block-group">
  <!-- wp:group {"layout":{"type":"flex","justifyContent":"space-between"}} -->
  <div class="wp-block-group">
    <!-- wp:group {"layout":{"type":"flex"}} -->
    <div class="wp-block-group">
      <!-- wp:site-logo {"width":60} /-->
      <!-- wp:site-title {"level":0} /-->
    </div>
    <!-- /wp:group -->
    <!-- wp:navigation {"layout":{"type":"flex","justifyContent":"right"}} /-->
  </div>
  <!-- /wp:group -->
</div>
<!-- /wp:group -->
```

### templates/single.html

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:post-featured-image {"align":"wide"} /-->
  <!-- wp:post-title {"level":1} /-->
  <!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
  <div class="wp-block-group">
    <!-- wp:post-date /-->
    <!-- wp:post-author {"showAvatar":false} /-->
    <!-- wp:post-terms {"term":"category"} /-->
  </div>
  <!-- /wp:group -->
  <!-- wp:post-content {"layout":{"type":"constrained"}} /-->
  <!-- wp:post-terms {"term":"post_tag","separator":" · ","prefix":"Tags: "} /-->
  <!-- wp:template-part {"slug":"comments"} /-->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

### templates/page.html

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:post-title {"level":1} /-->
  <!-- wp:post-content {"layout":{"type":"constrained"}} /-->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

### templates/404.html

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:group {"tagName":"main","layout":{"type":"constrained"}} -->
<main class="wp-block-group">
  <!-- wp:heading {"level":1} -->
  <h1 class="wp-block-heading">Page not found</h1>
  <!-- /wp:heading -->
  <!-- wp:paragraph -->
  <p>The page you're looking for doesn't exist. Try searching:</p>
  <!-- /wp:paragraph -->
  <!-- wp:search {"label":"Search","showLabel":false,"buttonText":"Search"} /-->
</main>
<!-- /wp:group -->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

---

## Template locking

```html
<!-- Lock individual block -->
<!-- wp:heading {"lock":{"move":true,"remove":true}} -->
<h2>Locked</h2>
<!-- /wp:heading -->

<!-- Lock all inner blocks -->
<!-- wp:group {"templateLock":"all"} -->
<div class="wp-block-group"><!-- blocks here --></div>
<!-- /wp:group -->

<!-- Prevent insert/remove, allow move -->
<!-- wp:group {"templateLock":"insert"} -->

<!-- Content-only editing (structure hidden, only text/media editable) -->
<!-- wp:group {"templateLock":"contentOnly"} -->

<!-- Explicitly disable locking (override inherited lock) -->
<!-- wp:group {"templateLock":false} -->
```

---

## Block patterns

### patterns/ directory (auto-registered)

Pattern files in `/patterns/` are PHP files with a structured header comment:

```php
<?php
/**
 * Title: Hero Section
 * Slug: themeslug/hero
 * Categories: featured, banner
 * Keywords: hero, cta
 * Block Types: core/cover, core/post-content
 * Post Types: page
 * Viewport Width: 1376
 * Inserter: true
 */
?>
<!-- wp:cover {"overlayColor":"contrast","align":"full"} -->
<div class="wp-block-cover alignfull">
  <span class="wp-block-cover__background has-contrast-background-color has-background-dim-100 has-background-dim"></span>
  <div class="wp-block-cover__inner-container">
    <!-- wp:heading {"textAlign":"center"} -->
    <h2 class="wp-block-heading has-text-align-center"><?php esc_html_e( 'Welcome', 'themeslug' ); ?></h2>
    <!-- /wp:heading -->
    <!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
    <div class="wp-block-buttons">
      <!-- wp:button {"className":"is-style-outline"} -->
      <div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button"><?php esc_html_e( 'Get Started', 'themeslug' ); ?></a></div>
      <!-- /wp:button -->
    </div>
    <!-- /wp:buttons -->
  </div>
</div>
<!-- /wp:cover -->
```

**Required headers:** `Title`, `Slug`.  
**Optional headers:** `Categories`, `Keywords`, `Block Types`, `Post Types`, `Template Types`, `Viewport Width`, `Inserter`, `Description`.

### Starter patterns

Combine `Block Types: core/post-content` + `Post Types: page` to create patterns shown when users create new pages. At least 2 patterns required for the modal. Use `Template Types: front-page, home` for template creation patterns.

### Pattern overrides (6.6+)

Allow per-instance content customization in synced patterns (powered by Block Bindings API):

```html
<!-- wp:heading {"metadata":{"bindings":{"content":{"source":"core/pattern-overrides"}},"name":"Team Member Name"}} -->
<h2 class="wp-block-heading">Default Name</h2>
<!-- /wp:heading -->
```

### Remote patterns and controls

```json
{ "patterns": ["hero-banner-with-overlap-images"] }
```

```php
// Disable remote patterns from WordPress.org
add_filter( 'should_load_remote_block_patterns', '__return_false' );
// Remove core patterns
remove_theme_support( 'core-block-patterns' );
```

---

## Style variations

### styles/ directory

JSON files in `/styles/` are auto-discovered as style variations. Each is a partial theme.json that can override `settings` and `styles` but NOT `customTemplates`, `templateParts`, or `patterns`.

**Color scheme variation** (`styles/dark.json`):
```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "title": "Dark",
  "settings": {
    "color": {
      "palette": [
        { "color": "#1a1a2e", "name": "Base", "slug": "base" },
        { "color": "#e8e8e8", "name": "Contrast", "slug": "contrast" },
        { "color": "#e94560", "name": "Accent", "slug": "accent" }
      ]
    }
  },
  "styles": {
    "color": { "background": "var:preset|color|base", "text": "var:preset|color|contrast" }
  }
}
```

**Typography variation** (`styles/serif.json`):
```json
{
  "version": 3,
  "title": "Serif",
  "settings": {
    "typography": {
      "fontFamilies": [
        { "fontFamily": "Georgia, serif", "name": "Serif", "slug": "body" },
        { "fontFamily": "'Playfair Display', serif", "name": "Playfair Display", "slug": "heading" }
      ]
    }
  }
}
```

WordPress 6.6+ recognizes **color-only** and **typography-only** variations, showing them in the appropriate UI sections.

---

## Section styles (WordPress 6.6+)

Section styles extend block style variations to style nested blocks and elements:

**`styles/section-dark.json`:**
```json
{
  "version": 3,
  "title": "Dark Section",
  "slug": "dark-section",
  "blockTypes": ["core/group", "core/columns"],
  "styles": {
    "color": { "background": "var:preset|color|contrast", "text": "var:preset|color|base" },
    "elements": {
      "heading": { "color": { "text": "var:preset|color|base" } },
      "link": { "color": { "text": "var:preset|color|accent" } },
      "button": { "color": { "background": "var:preset|color|accent", "text": "var:preset|color|contrast" } }
    }
  }
}
```

Or register via PHP with `style_data`:
```php
register_block_style( ['core/group', 'core/columns'], [
    'name'       => 'dark-section',
    'label'      => __( 'Dark Section', 'themeslug' ),
    'style_data' => [
        'color' => [ 'background' => 'var:preset|color|contrast', 'text' => 'var:preset|color|base' ],
        'elements' => [
            'heading' => [ 'color' => [ 'text' => 'var:preset|color|base' ] ],
        ],
    ],
] );
```
