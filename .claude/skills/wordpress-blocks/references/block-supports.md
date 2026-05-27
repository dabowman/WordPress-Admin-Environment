# Block Supports Reference

**Purpose:** Complete reference for WordPress 7.0+ block supports. Block supports are standardized features blocks can opt into without custom code.

## Core Philosophy

Block supports provide:
1. **Consistent UX** - Same controls across all blocks
2. **Theme integration** - Automatic use of theme.json presets
3. **Generated attributes** - No manual attribute definitions needed
4. **CSS class generation** - Follows WordPress naming conventions

**Key principle:** Let theme.json define the design system, blocks just opt in.

## How Block Supports Work

### In block.json
```json
{
  "supports": {
    "color": {
      "text": true,
      "background": true
    },
    "typography": {
      "fontSize": true
    }
  }
}
```

### Generated Attributes (automatic)
```json
{
  "attributes": {
    "textColor": { "type": "string" },
    "backgroundColor": { "type": "string" },
    "fontSize": { "type": "string" },
    "style": { "type": "object" }
  }
}
```

### In Edit/Save Components
```typescript
import { useBlockProps } from '@wordpress/block-editor';

export default function Edit() {
  const blockProps = useBlockProps();
  // blockProps now includes all generated classes and styles
  return <div {...blockProps}>Content</div>;
}
```

### Rendered Output
```html
<div class="wp-block-namespace-blockname 
            has-text-color 
            has-vivid-red-color 
            has-background 
            has-pale-pink-background-color 
            has-medium-font-size">
  Content
</div>
```

## Complete Support Reference

### align
**Controls:** Block-level alignment (left, center, right, wide, full)  
**UI Location:** Block toolbar  
**Generated attribute:** `align` (string)

```json
{
  "supports": {
    "align": true  // All options
  }
}
```

```json
{
  "supports": {
    "align": ["left", "right", "full"]  // Specific options
  }
}
```

**CSS classes:** `alignleft`, `aligncenter`, `alignright`, `alignwide`, `alignfull`

**Common use:**
- `left/right` - Float content
- `wide` - Break out of content width (1080px typical)
- `full` - Full viewport width
- `center` - Center block

**Note:** Wide/full require theme support: `add_theme_support('align-wide')`

### alignWide
**Controls:** Whether block can use wide/full alignment  
**Default:** Inherits from theme

```json
{
  "supports": {
    "alignWide": false  // Disable even if theme supports it
  }
}
```

### anchor
**Controls:** HTML id attribute for jump links  
**UI Location:** Advanced panel in sidebar  
**Generated attribute:** `anchor` (string)

```json
{
  "supports": {
    "anchor": true
  }
}
```

**Use for:** Table of contents, scroll-to-section navigation

### ariaLabel
**Controls:** Accessible label for screen readers  
**UI Location:** None (set programmatically)  
**Generated attribute:** `ariaLabel` (string)

```json
{
  "supports": {
    "ariaLabel": true
  }
}
```

**Use for:** Blocks without visible text labels, icon buttons

### background
**Controls:** Background images and settings  
**WordPress version:** 6.5+

```json
{
  "supports": {
    "background": {
      "backgroundImage": true,
      "backgroundSize": true
    }
  }
}
```

**Properties:**
- `backgroundImage` - Image upload
- `backgroundSize` - cover, contain, etc.

### border
**Controls:** Border color, radius, style, width  
**Key:** `__experimentalBorder` in block.json  
**One of the most widely used supports — 67+ core blocks opt in.**

```json
{
  "supports": {
    "__experimentalBorder": {
      "color": true,
      "radius": true,
      "style": true,
      "width": true,
      "__experimentalDefaultControls": {
        "color": true,
        "radius": true,
        "style": true,
        "width": true
      }
    }
  }
}
```

**Generated attributes:**
- `style.border.color`, `style.border.radius`, `style.border.style`, `style.border.width`
- Per-side: `style.border.top.color`, etc.

**Theme.json integration:**
```json
{
  "settings": {
    "border": {
      "color": true,
      "radius": true,
      "style": true,
      "width": true
    }
  }
}
```

**Note:** Despite the `__experimental` prefix, this support is stable and used extensively in core. The prefix remains for historical reasons.

### customCSS
**Controls:** Per-instance custom CSS  
**Default:** true (most blocks opt in automatically)  
**WordPress version:** 7.0+

```json
{
  "supports": {
    "customCSS": true
  }
}
```

**How it works:** Users can add per-block-instance CSS via the block inspector. CSS is processed using the same method as global styles. Blocks that opt out: `core/block`, `core/shortcode`, `core/freeform`, `core/nextpage`, `core/more`, `core/missing`, `core/html`.

### className
**Controls:** Whether custom CSS classes can be added  
**Default:** true  
**UI Location:** Advanced panel

```json
{
  "supports": {
    "className": false  // Disable custom classes
  }
}
```

**Note:** Disabling removes "Additional CSS class(es)" field

### color
**Controls:** All color-related properties  
**Default:** `{ background: true, text: true }`

```json
{
  "supports": {
    "color": {
      "text": true,            // Text color
      "background": true,       // Background color
      "link": true,            // Link color (6.1+)
      "gradients": true,       // Gradient backgrounds
      "heading": true,         // Heading color (6.5+)
      "button": true,          // Button color (6.5+)
      "enableContrastChecker": true   // A11y warnings
    }
  }
}
```

**Generated attributes:**
- `textColor`, `backgroundColor`, `gradient` (preset slugs)
- `style.color.text`, `style.color.background`, `style.color.gradient` (custom values)

**CSS classes:**
- `has-text-color` + `has-{preset}-color`
- `has-background` + `has-{preset}-background-color`
- `has-{preset}-gradient-background`

**Theme.json integration:**
```json
{
  "settings": {
    "color": {
      "palette": [
        { "name": "Primary", "slug": "primary", "color": "#007bff" }
      ]
    }
  }
}
```

Block automatically gets access to `primary` color preset.

### customClassName
**Controls:** Whether the generated `wp-block-{namespace}-{name}` class is added  
**Default:** true

```json
{
  "supports": {
    "customClassName": false
  }
}
```

**Use case:** Blocks that shouldn't be styled by theme CSS

### dimensions
**Controls:** Width, height, aspect ratio  
**WordPress version:** 6.2+

```json
{
  "supports": {
    "dimensions": {
      "minHeight": true,
      "aspectRatio": true,
      "width": true,
      "height": true
    }
  }
}
```

**Properties:**
- `minHeight` - Minimum block height
- `aspectRatio` - Force aspect ratio (images, videos)
- `width` - Explicit width control (7.0+, used by Icon block)
- `height` - Explicit height control (7.0+)

### filter
**Controls:** CSS filter effects

```json
{
  "supports": {
    "filter": {
      "duotone": true  // Two-tone color overlay
    }
  }
}
```

**Use for:** Image blocks, media blocks

### html
**Controls:** Whether block can be edited as HTML  
**Default:** true  
**UI Location:** Block toolbar (three dots > Edit as HTML)

```json
{
  "supports": {
    "html": false  // Remove HTML editing
  }
}
```

**Use case:** Dynamic blocks that break with manual HTML edits

### inserter
**Controls:** Whether block appears in inserter  
**Default:** true

```json
{
  "supports": {
    "inserter": false  // Hide from block picker
  }
}
```

**Use case:** Blocks only meant for patterns or programmatic insertion

### interactivity
**Controls:** WordPress Interactivity API features  
**WordPress version:** 6.5+

```json
{
  "supports": {
    "interactivity": {
      "clientNavigation": true  // SPA-like navigation
    }
  }
}
```

### layout
**Controls:** Layout systems (flex, grid, flow)  
**Complex support with many options**

```json
{
  "supports": {
    "layout": {
      "default": { "type": "flex" },
      "allowSwitching": true,
      "allowEditing": true,
      "allowInheriting": true,
      "allowSizingOnChildren": true,
      "allowVerticalAlignment": true,
      "allowJustification": true,
      "allowOrientation": true,
      "allowCustomContentAndWideSize": true
    }
  }
}
```

**Layout types:**
- `default` - Flow layout (normal block flow)
- `constrained` - Constrained width with wide/full options
- `flex` - Flexbox layout
- `grid` - CSS Grid layout (6.6+)

**Properties:**
- `allowSwitching` - UI to change layout type
- `allowEditing` - Controls for gap, alignment, etc.
- `allowInheriting` - Inherit from parent
- `allowSizingOnChildren` - Child width controls
- `allowVerticalAlignment` - Vertical align options
- `allowJustification` - Justify content options
- `allowOrientation` - Horizontal/vertical toggle
- `allowCustomContentAndWideSize` - Custom width controls

**Use in:** Container blocks (Group, Cover, Columns)

### lock
**Controls:** Whether block can be locked  
**Default:** true

```json
{
  "supports": {
    "lock": false  // No locking UI
  }
}
```

### multiple
**Controls:** Whether block can be inserted multiple times  
**Default:** true

```json
{
  "supports": {
    "multiple": false  // One per post/page
  }
}
```

**Use case:** Post Title, Post Content (should only appear once)

### position
**Controls:** CSS position property  
**WordPress version:** 6.2+

```json
{
  "supports": {
    "position": {
      "sticky": true,
      "fixed": true
    }
  }
}
```

**Properties:**
- `sticky` - Sticky positioning with offset controls
- `fixed` - Fixed positioning (requires `settings.position.fixed: true` in theme.json)

### renaming
**Controls:** Block renaming in List View  
**Default:** true  
**WordPress version:** 6.5+

```json
{
  "supports": {
    "renaming": false
  }
}
```

### reusable
**Controls:** Whether block can be converted to reusable/synced pattern  
**Default:** true

```json
{
  "supports": {
    "reusable": false
  }
}
```

**Use case:** Blocks with site-wide configuration

### shadow
**Controls:** Box shadow  
**WordPress version:** 6.3+

```json
{
  "supports": {
    "shadow": true
  }
}
```

**Generated attribute:** `style.shadow`  
**Theme.json integration:** Uses `settings.shadow.presets`

### spacing
**Controls:** Margin, padding, gap  
**Complex support with granular control**

```json
{
  "supports": {
    "spacing": {
      "margin": true,              // All margin sides
      "padding": true,             // All padding sides
      "blockGap": true            // Gap between children
    }
  }
}
```

**Granular control:**
```json
{
  "supports": {
    "spacing": {
      "margin": ["top", "bottom"],  // Specific sides
      "padding": true
    }
  }
}
```

**Generated attributes:**
- `style.spacing.margin.top/right/bottom/left`
- `style.spacing.padding.top/right/bottom/left`
- `style.spacing.blockGap`

**Theme.json integration:**
```json
{
  "settings": {
    "spacing": {
      "spacingScale": {
        "steps": 10  // Generates --wp--preset--spacing-10 through --wp--preset--spacing-100
      }
    }
  }
}
```

**CSS classes:** No classes, uses inline styles

### splitting
**Controls:** Whether Enter splits block into two  
**Default:** false for most blocks

```json
{
  "supports": {
    "splitting": true
  }
}
```

**Use in:** Paragraph, Heading (allows Enter to create new block)

### visibility
**Controls:** Whether a block can be hidden, including per-viewport  
**Default:** true  
**WordPress version:** 6.9+ (viewport visibility added in 7.0)

```json
{
  "supports": {
    "visibility": false  // Prevent hiding this block
  }
}
```

**Viewport visibility (7.0+):** When enabled, blocks can be hidden per viewport — mobile (<=480px), tablet (<=782px), desktop (>782px). Uses CSS range media queries.

**Use case:** `false` for blocks that should always be visible (e.g., Missing, Freeform). Default `true` gives users show/hide and viewport controls.

### typography
**Controls:** All typography properties  
**Most commonly used support**

> **Important:** Many typography sub-properties use `__experimental` prefixes in block.json. The stable keys are `fontSize`, `lineHeight`, and `textAlign`. All others require the experimental prefix shown below.

```json
{
  "supports": {
    "typography": {
      "fontSize": true,                          // Stable
      "lineHeight": true,                        // Stable
      "textAlign": true,                         // Stable
      "__experimentalFontFamily": true,           // Font family picker
      "__experimentalFontWeight": true,           // Font weight
      "__experimentalFontStyle": true,            // Italic/normal
      "__experimentalTextTransform": true,        // Uppercase/lowercase
      "__experimentalTextDecoration": true,       // Underline/strikethrough
      "__experimentalLetterSpacing": true,        // Letter spacing
      "__experimentalWritingMode": true,          // Vertical text (6.6+)
      "__experimentalTextColumns": true,          // CSS column-count (6.3+)
      "__experimentalFitText": true,              // Auto text scaling (6.9+)
      "__experimentalTextIndent": true            // Text indent (7.0+)
    }
  }
}
```

**Generated attributes:**
- `fontSize` (preset slug)
- `fontFamily` (preset slug)
- `style.typography.*` (custom values)

**Additional sub-properties:**
- `__experimentalTextColumns` - CSS `column-count` on text blocks (6.3+)
- `__experimentalFitText` - Automatic text scaling to fit container (6.9+)

**CSS classes:**
- `has-{preset}-font-size`
- `has-{preset}-font-family`
- `has-text-align-{left|center|right|justify}`

**Theme.json integration:**
```json
{
  "settings": {
    "typography": {
      "fontFamilies": [
        {
          "name": "System Font",
          "slug": "system",
          "fontFamily": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        }
      ],
      "fontSizes": [
        { "name": "Small", "slug": "small", "size": "0.875rem" },
        { "name": "Medium", "slug": "medium", "size": "1rem" },
        { "name": "Large", "slug": "large", "size": "1.5rem" }
      ]
    }
  }
}
```

## Common Support Combinations

### Standard Content Block
```json
{
  "supports": {
    "align": ["wide", "full"],
    "anchor": true,
    "__experimentalBorder": {
      "color": true,
      "radius": true,
      "style": true,
      "width": true
    },
    "color": {
      "text": true,
      "background": true,
      "link": true
    },
    "spacing": {
      "margin": true,
      "padding": true
    },
    "typography": {
      "fontSize": true,
      "lineHeight": true
    }
  }
}
```

### Container/Layout Block
```json
{
  "supports": {
    "align": ["wide", "full"],
    "color": {
      "background": true,
      "gradients": true
    },
    "spacing": {
      "margin": true,
      "padding": true,
      "blockGap": true
    },
    "layout": {
      "allowSwitching": true,
      "allowEditing": true
    },
    "dimensions": {
      "minHeight": true
    }
  }
}
```

### Media Block
```json
{
  "supports": {
    "align": ["left", "right", "wide", "full"],
    "anchor": true,
    "color": {
      "__experimentalDuotone": true
    },
    "spacing": {
      "margin": true
    },
    "dimensions": {
      "aspectRatio": true
    },
    "filter": {
      "duotone": true
    }
  }
}
```

### Simple Utility Block
```json
{
  "supports": {
    "align": true,
    "spacing": {
      "margin": ["top", "bottom"]
    }
  }
}
```

## Default Attributes Pattern

When blocks opt into supports, you can provide defaults:

```json
{
  "attributes": {
    "align": {
      "type": "string",
      "default": "wide"
    },
    "fontSize": {
      "type": "string",
      "default": "medium"
    },
    "style": {
      "type": "object",
      "default": {
        "spacing": {
          "padding": {
            "top": "2rem",
            "bottom": "2rem"
          }
        }
      }
    }
  },
  "supports": {
    "align": ["wide", "full"],
    "typography": {
      "fontSize": true
    },
    "spacing": {
      "padding": true
    }
  }
}
```

## Checking Support in Code

```typescript
import { hasBlockSupport } from '@wordpress/blocks';

const supportsColor = hasBlockSupport('core/paragraph', 'color');
const supportsAlign = hasBlockSupport('core/paragraph', 'align');
```

## Performance Considerations

1. **Enable only what you need** - Each support adds UI controls and processing
2. **Prefer supports over custom controls** - Better performance, smaller bundle
3. **Use theme.json presets** - Faster than custom values
4. **Avoid style attribute bloat** - Combine related properties

## Accessibility Notes

1. **Always enable `anchor`** for major content blocks (headings, sections)
2. **Consider `ariaLabel`** for icon-only blocks
3. **Enable `color.enableContrastChecker`** for text-heavy blocks
4. **Test keyboard navigation** with layout supports

## Migration from Legacy Patterns

### Old way (manual attributes)
```json
{
  "attributes": {
    "textColor": { "type": "string" },
    "customTextColor": { "type": "string" }
  }
}
```

**Problems:**
- Manual CSS class generation
- No theme.json integration
- Custom UI controls needed

### New way (supports)
```json
{
  "supports": {
    "color": {
      "text": true
    }
  }
}
```

**Benefits:**
- Automatic attribute generation
- Free UI controls
- Theme.json integration
- Consistent UX

## References

- [Official Block Supports Documentation](https://developer.wordpress.org/block-editor/reference-guides/block-api/block-supports/)
- [theme.json Specification](https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/)
- [useBlockProps Hook](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-block-editor/#useblockprops)
