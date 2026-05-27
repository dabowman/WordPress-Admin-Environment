# block.json Schema Reference

**Purpose:** Quick reference for WordPress 6.8+ block.json metadata. This is the single source of truth for block registration.

## Minimal Required block.json

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "namespace/block-name",
  "title": "Block Title",
  "category": "text",
  "icon": "smiley",
  "editorScript": "file:./index.js"
}
```

## Complete Reference

### Required Properties

```json
{
  "apiVersion": 3,
  "name": "namespace/block-name",
  "title": "Human Readable Title"
}
```

### Identification & Metadata

```json
{
  "name": "namespace/block-name",  // Unique, lowercase, hyphenated
  "title": "My Custom Block",
  "category": "text",              // text, media, design, widgets, theme, embed
  "icon": "smiley",               // Dashicon name, SVG string, or object
  "description": "Brief description shown in block inserter",
  "keywords": ["search", "terms", "tags"],
  "textdomain": "my-plugin",
  "version": "1.0.0"
}
```

**Icon options:**
```json
// Dashicon
"icon": "admin-site"

// Custom SVG
"icon": "<svg>...</svg>"

// With colors
"icon": {
  "src": "admin-site",
  "background": "#7e70af",
  "foreground": "#fff"
}
```

### Scripts & Styles

```json
{
  "editorScript": "file:./index.js",        // Editor JS (required for edit)
  "script": "file:./script.js",             // Frontend & editor JS
  "viewScript": "file:./view.js",           // Frontend only JS (legacy)
  "viewScriptModule": "file:./view.js",     // Frontend module (Interactivity API)
  
  "editorStyle": "file:./editor.css",       // Editor only styles
  "style": "file:./style.css",              // Frontend & editor styles
  
  "render": "file:./render.php"             // Server-side rendering
}
```

**Build tool flags:**
```json
{
  "scripts": {
    "build": "wp-scripts build --experimental-modules",
    "start": "wp-scripts start --experimental-modules"
  }
}
```

### Attributes

```json
{
  "attributes": {
    "content": {
      "type": "string",
      "source": "html",
      "selector": "p",
      "default": ""
    },
    "alignment": {
      "type": "string",
      "enum": ["left", "center", "right"]
    },
    "mediaId": {
      "type": "number"
    },
    "mediaUrl": {
      "type": "string",
      "source": "attribute",
      "selector": "img",
      "attribute": "src"
    },
    "isEnabled": {
      "type": "boolean",
      "default": true
    },
    "items": {
      "type": "array",
      "default": []
    },
    "settings": {
      "type": "object",
      "default": {}
    }
  }
}
```

**Attribute source types:**
- `html` - innerHTML of element
- `text` - textContent of element
- `attribute` - Specific attribute value
- `meta` - Post meta field
- `query` - Multiple elements (complex)

### Block Supports

```json
{
  "supports": {
    "align": ["wide", "full"],
    "anchor": true,
    "color": {
      "text": true,
      "background": true,
      "link": true,
      "gradients": true
    },
    "spacing": {
      "margin": true,
      "padding": true,
      "blockGap": true
    },
    "typography": {
      "fontSize": true,
      "lineHeight": true,
      "fontFamily": true
    },
    "layout": {
      "default": { "type": "flex" }
    },
    "interactivity": true
  }
}
```

See [block-supports.md](./block-supports.md) for complete list.

### Examples

```json
{
  "example": {
    "attributes": {
      "content": "Preview text",
      "alignment": "center"
    }
  }
}
```

### Variations

```json
{
  "variations": [
    {
      "name": "blue",
      "title": "Blue Variant",
      "isDefault": false,
      "attributes": {
        "className": "is-style-blue"
      },
      "icon": "admin-appearance"
    }
  ]
}
```

### Block Styles

```json
{
  "styles": [
    {
      "name": "default",
      "label": "Default",
      "isDefault": true
    },
    {
      "name": "outline",
      "label": "Outline"
    }
  ]
}
```

Generates class: `is-style-{name}`

### Parent & Ancestor

```json
{
  "parent": ["core/column"],              // Only in these blocks
  "ancestor": ["core/group", "core/cover"] // Anywhere in these blocks
}
```

### Allowed Blocks & Inner Blocks

```json
{
  "allowedBlocks": ["core/paragraph", "core/heading"],
  "providesContext": {
    "namespace/customValue": "customAttribute"
  },
  "usesContext": ["postId", "postType"]
}
```

### Template & Template Lock

```json
{
  "template": [
    ["core/heading", { "placeholder": "Enter title..." }],
    ["core/paragraph", { "placeholder": "Enter content..." }]
  ],
  "templateLock": "all"  // all, insert, contentOnly, false
}
```

### Editor Settings

```json
{
  "inserter": true,     // Show in block inserter
  "multiple": true,     // Allow multiple instances
  "reusable": true,     // Can be synced pattern
  "lock": true          // Can be locked
}
```

## File References

### Relative Paths
```json
{
  "editorScript": "file:./index.js",
  "script": ["file:./view.js", "lodash"],
  "style": "file:./style.css"
}
```

Paths relative to block.json location. Use `file:` prefix for local files.

### Dependency Arrays
```json
{
  "script": [
    "file:./view.js",
    "wp-element",
    "lodash"
  ]
}
```

## Complete Example

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "namespace/hero",
  "title": "Hero Section",
  "category": "design",
  "icon": "cover-image",
  "description": "Full-width hero with heading and CTA",
  "keywords": ["banner", "header", "hero"],
  "textdomain": "my-plugin",
  "attributes": {
    "heading": {
      "type": "string",
      "source": "html",
      "selector": "h1",
      "default": ""
    },
    "mediaId": {
      "type": "number"
    },
    "mediaUrl": {
      "type": "string",
      "source": "attribute",
      "selector": "img",
      "attribute": "src"
    }
  },
  "supports": {
    "align": ["full"],
    "color": {
      "text": true,
      "background": true
    },
    "spacing": {
      "padding": true
    },
    "typography": {
      "fontSize": true,
      "lineHeight": true
    }
  },
  "example": {
    "attributes": {
      "heading": "Welcome to Our Site"
    }
  },
  "editorScript": "file:./index.js",
  "editorStyle": "file:./editor.css",
  "style": "file:./style.css"
}
```

## Registration in PHP

**With @wordpress/scripts:**
```php
function register_block() {
  register_block_type( __DIR__ . '/build' );
}
add_action( 'init', 'register_block' );
```

**Multiple blocks (6.8+):**
```php
function register_blocks() {
  wp_register_block_types_from_metadata_collection(
    __DIR__ . '/build',
    __DIR__ . '/build/blocks-manifest.php'
  );
}
add_action( 'init', 'register_blocks' );
```

**Build with manifest:**
```json
{
  "scripts": {
    "build": "wp-scripts build --blocks-manifest"
  }
}
```

## Validation

Use JSON schema for validation:
```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json"
}
```

Many editors (VS Code, PhpStorm) provide autocomplete with this.

## Common Patterns

### Static Block (save.js)
```json
{
  "editorScript": "file:./index.js",
  "style": "file:./style.css"
}
```

### Dynamic Block (render.php)
```json
{
  "editorScript": "file:./index.js",
  "render": "file:./render.php",
  "style": "file:./style.css"
}
```

### Interactive Block (Interactivity API)
```json
{
  "editorScript": "file:./index.js",
  "viewScriptModule": "file:./view.js",
  "render": "file:./render.php",
  "style": "file:./style.css",
  "supports": {
    "interactivity": true
  }
}
```

## Block Bindings (WP 6.5+)

Block Bindings let a core block attribute (paragraph `content`, image `url`, button `text`, etc.) read from a named data source at render time — no custom block required. Stable since 6.5. Two new core sources landed in **6.9**: `core/post-data` and `core/term-data`.

### Core-registered sources

| Source | Since | Purpose |
|---|---|---|
| `core/post-meta` | 6.5 | Registered post meta (must be `'show_in_rest' => true`) |
| `core/pattern-overrides` | 6.5 | Synced-pattern overrides |
| `core/post-data` | 6.9 | Post fields: `date`, `modified`, `link` |
| `core/term-data` | 6.9 | Taxonomy term fields: `id`, `name`, `link`, `slug`, `description`, `parent`, `count` |

### Registering a custom source from PHP

```php
register_block_bindings_source( 'my-plugin/weather', array(
    'label'              => __( 'Live Weather', 'my-plugin' ),
    'get_value_callback' => function ( array $source_args, WP_Block $block, string $attribute_name ) {
        // Return a string (or null/false to fall through to fallback markup).
        return get_transient( 'my_plugin_temp_' . $source_args['city'] );
    },
    'uses_context'       => array( 'postId' ),
) );
```

`get_value_callback` receives `$source_args` (the `args` from the block's `metadata.bindings` entry), the `WP_Block` instance, and the attribute name. Defined in `wp-includes/block-bindings.php`.

### Hardcoded bindable attributes per core block

Not every attribute on every block is bindable. Core defines the list in `get_block_bindings_supported_attributes()`:

| Block | Bindable attributes |
|---|---|
| `core/paragraph` | `content` |
| `core/heading` | `content` |
| `core/image` | `id`, `url`, `title`, `alt`, `caption` |
| `core/button` | `url`, `text`, `linkTarget`, `rel` |
| `core/post-date` | `datetime` |
| `core/navigation-link` | `url` |
| `core/navigation-submenu` | `url` |

Plugins extend the list via the `block_bindings_supported_attributes` filter (global) or `block_bindings_supported_attributes_{$block_type}` (per-block).

### `metadata.bindings` shape in serialized markup

Bindings are declared on the instance, not on `block.json`:

```html
<!-- wp:paragraph {"metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"subtitle"}}}}} -->
<p></p>
<!-- /wp:paragraph -->
```

See `wordpress-block-markup` for authoring rules around `metadata.bindings` in serialized block HTML.

---

## Block Hooks (WP 6.4+)

Block Hooks let a block auto-insert itself next to an "anchor" block in templates, template parts, synced patterns, or content — without the user placing it.

### block.json declaration

```json
{
  "blockHooks": {
    "core/navigation": "lastChild",
    "core/post-content": "after"
  }
}
```

Positions: `before`, `after`, `firstChild`, `lastChild`. (`firstChild`/`lastChild` require the anchor block to accept inner blocks.)

### PHP filters

Defined in `wp-includes/blocks.php`:

| Filter | Since | Purpose |
|---|---|---|
| `hooked_block_types` | 6.4 | Modify the list of blocks to hook into an anchor: `($hooked_block_types, $relative_position, $anchor_block_type, $context)` |
| `hooked_block` | 6.5 | Mutate the parsed hooked-block array before insertion (return `null` to suppress): `($parsed_hooked_block, $hooked_block_type, $relative_position, $parsed_anchor_block, $context)` |
| `hooked_block_{$type}` | 6.5 | Type-specific variant of `hooked_block` |

### User opt-out

The editor records per-instance opt-outs as `metadata.ignoredHookedBlocks` on the anchor block:

```html
<!-- wp:navigation {"metadata":{"ignoredHookedBlocks":["my-plugin/social-icons"]}} /-->
```

Core skips insertion when the hooked block type appears in that array. Useful when a user explicitly removes a hooked block — without the opt-out record it would re-insert on next save.

---

## Resources

- [block.json Official Documentation](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/)
- [Block Bindings API](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/)
- [Block Hooks](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/#block-hooks)
- [JSON Schema](https://schemas.wp.org/trunk/block.json)
- [@wordpress/scripts](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-scripts/)
