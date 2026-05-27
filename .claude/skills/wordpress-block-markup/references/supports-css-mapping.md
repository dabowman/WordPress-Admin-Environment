# Block Supports → CSS Mapping Reference

How block support attributes translate to HTML classes and inline styles. This is the definitive mapping for writing valid block markup.

## Table of Contents
1. [Color Support](#color-support)
2. [Typography Support](#typography-support)
3. [Spacing Support](#spacing-support)
4. [Border Support](#border-support)
5. [Dimensions Support](#dimensions-support)
6. [Shadow Support](#shadow-support)
7. [Background Support](#background-support)
8. [Alignment](#alignment)
9. [Anchor](#anchor)
10. [Layout System](#layout-system)
11. [Elements (Link, Heading, Button Colors)](#elements-system)
12. [The Style Attribute Object](#the-style-attribute-object)
13. [Preset Reference Format](#preset-reference-format)

---

## Color Support

### Background Color

**Preset** (slug from theme.json palette):
```
Attribute:  backgroundColor: "vivid-cyan-blue"
Classes:    has-vivid-cyan-blue-background-color has-background
Style:      (none)
```

**Custom** (hex/rgb value):
```
Attribute:  style.color.background: "#ff0000"
Classes:    has-background
Style:      background-color:#ff0000
```

### Text Color

**Preset:**
```
Attribute:  textColor: "white"
Classes:    has-white-color has-text-color
Style:      (none)
```

**Custom:**
```
Attribute:  style.color.text: "#333333"
Classes:    has-text-color
Style:      color:#333333
```

### Gradient

**Preset:**
```
Attribute:  gradient: "vivid-cyan-blue-to-vivid-purple"
Classes:    has-vivid-cyan-blue-to-vivid-purple-gradient-background has-background
Style:      (none)
```

**Custom:**
```
Attribute:  style.color.gradient: "linear-gradient(135deg,#12c2e9,#c471ed)"
Classes:    has-background
Style:      background:linear-gradient(135deg,#12c2e9,#c471ed)
```

### Class ordering rule for colors
When both text and background colors are present, classes appear in this order:
`has-{text-slug}-color has-{bg-slug}-background-color has-text-color has-background`

Example:
```html
<p class="has-white-color has-vivid-cyan-blue-background-color has-text-color has-background">
```

---

## Typography Support

### Font Size

**Preset:**
```
Attribute:  fontSize: "large"
Classes:    has-large-font-size
Style:      (none)
```

**Custom:**
```
Attribute:  style.typography.fontSize: "22px"
Classes:    (none)
Style:      font-size:22px
```

### Font Family

**Preset:**
```
Attribute:  fontFamily: "inter"
Classes:    has-inter-font-family
Style:      (none)
```

**Custom:**
```
Attribute:  style.typography.fontFamily: "Arial, sans-serif"
Classes:    (none)
Style:      font-family:Arial, sans-serif
```

### Text Align
Always class-based (not inline style):
```
Attribute:  textAlign: "center"    (on heading/paragraph)
            align: "center"       (on some other blocks)
Classes:    has-text-align-center
Style:      (none)
```
Values: `left`, `center`, `right`

### Other Typography Properties
These are always inline styles (no preset class equivalent):

| Attribute path | CSS property | Example |
|---------------|-------------|---------|
| `style.typography.lineHeight` | `line-height` | `"1.5"` → `line-height:1.5` |
| `style.typography.fontWeight` | `font-weight` | `"700"` → `font-weight:700` |
| `style.typography.fontStyle` | `font-style` | `"italic"` → `font-style:italic` |
| `style.typography.textTransform` | `text-transform` | `"uppercase"` → `text-transform:uppercase` |
| `style.typography.textDecoration` | `text-decoration` | `"underline"` → `text-decoration:underline` |
| `style.typography.letterSpacing` | `letter-spacing` | `"0.05em"` → `letter-spacing:0.05em` |
| `style.typography.writingMode` | `writing-mode` | `"vertical-rl"` → `writing-mode:vertical-rl` |

---

## Spacing Support

All spacing values are inline styles. No class equivalents exist.

### Padding
```
Attribute:  style.spacing.padding: {"top":"20px","right":"20px","bottom":"20px","left":"20px"}
Style:      padding-top:20px;padding-right:20px;padding-bottom:20px;padding-left:20px
```

Shorthand (uniform):
```
Attribute:  style.spacing.padding: {"top":"2em","right":"2em","bottom":"2em","left":"2em"}
```

### Margin
```
Attribute:  style.spacing.margin: {"top":"0","bottom":"2em"}
Style:      margin-top:0;margin-bottom:2em
```

### Block Gap (for containers)
```
Attribute:  style.spacing.blockGap: "1.5em"
```
Block gap generates scoped CSS, not inline styles on the element itself.

### Preset Spacing Values
When using theme.json spacing presets, values use the `var:preset|spacing|{slug}` format:
```
Attribute:  style.spacing.padding: {"top":"var:preset|spacing|40"}
Rendered:   padding-top:var(--wp--preset--spacing--40)
```

---

## Border Support

### Border Color

**Preset:**
```
Attribute:  borderColor: "vivid-red"
Classes:    has-border-color has-vivid-red-border-color
Style:      (none)
```

**Custom:**
```
Attribute:  style.border.color: "#cccccc"
Classes:    (none)
Style:      border-color:#cccccc
```

### Border Width, Style, Radius
Always inline styles:

```
Attribute:  style.border.width: "2px"
Style:      border-width:2px

Attribute:  style.border.style: "solid"
Style:      border-style:solid

Attribute:  style.border.radius: "5px"
Style:      border-radius:5px
```

### Per-Side Borders
```json
"style": {
  "border": {
    "top": {"color": "#000", "width": "2px", "style": "solid"},
    "bottom": {"color": "#ccc", "width": "1px", "style": "dashed"}
  }
}
```
→ `border-top-color:#000;border-top-width:2px;border-top-style:solid;border-bottom-color:#ccc;...`

### Per-Corner Border Radius
```json
"style": {
  "border": {
    "radius": {
      "topLeft": "10px",
      "topRight": "0px",
      "bottomLeft": "0px",
      "bottomRight": "10px"
    }
  }
}
```
→ `border-top-left-radius:10px;border-top-right-radius:0px;...`

---

## Dimensions Support

```
Attribute:  style.dimensions.minHeight: "300px"
Style:      min-height:300px

Attribute:  style.dimensions.aspectRatio: "16/9"
Style:      aspect-ratio:16/9
```

---

## Shadow Support

```
Attribute:  style.shadow: "6px 6px 9px rgba(0,0,0,0.2)"
Style:      box-shadow:6px 6px 9px rgba(0,0,0,0.2)
```

Preset shadows use the format: `"var:preset|shadow|{slug}"`

---

## Background Support

```json
"style": {
  "background": {
    "backgroundImage": {
      "url": "https://example.com/img.jpg",
      "id": 123,
      "source": "file"
    },
    "backgroundPosition": "50% 50%",
    "backgroundSize": "cover",
    "backgroundRepeat": "no-repeat"
  }
}
```
→ Generates inline styles: `background-image:url(https://example.com/img.jpg);background-position:50% 50%;background-size:cover;background-repeat:no-repeat`

---

## Alignment

```
Attribute:  align: "full"
Classes:    alignfull       (on the wrapper element, often <figure> or <div>)
```

| Value | Class |
|-------|-------|
| `left` | `alignleft` |
| `center` | `aligncenter` |
| `right` | `alignright` |
| `wide` | `alignwide` |
| `full` | `alignfull` |

The class goes on the **outermost wrapper element** of the block (e.g., `<figure>` for image, `<div>` for group).

---

## Anchor

```
Attribute:  anchor: "my-section"
HTML:       id="my-section" (on wrapper element)
```

---

## Layout System

Layout is set on container blocks (Group, Columns, etc.) via the `layout` attribute. It generates CSS classes on the wrapper:

### Layout Types and Classes

| Layout type | Generated class | Description |
|------------|----------------|-------------|
| `constrained` | `is-layout-constrained` | Flow layout with max-width |
| `flow` | `is-layout-flow` | Normal document flow |
| `flex` | `is-layout-flex` | CSS Flexbox |
| `grid` | `is-layout-grid` | CSS Grid |

### Additional Layout Classes

Justification: `is-content-justification-{left|center|right|space-between}`
No-wrap (flex): `is-nowrap`
Vertical orientation: `is-vertical`

### Instance Classes
Each layout container gets a unique `wp-container-{hash}` class for scoped layout styles (gap, alignment, etc.). The hash is generated at render time by PHP, not saved in markup.

Layout classes are **applied server-side** by `wp_render_layout_support_flag()`. In serialized markup, you do NOT include layout classes like `is-layout-constrained` — the layout attribute in the comment JSON is sufficient.

---

## Elements System

For styling inner elements (links, headings, buttons) within a block:

```json
"style": {
  "elements": {
    "link": {
      "color": {
        "text": "var:preset|color|vivid-red"
      }
    },
    "heading": {
      "color": {
        "text": "#000000"
      }
    },
    "button": {
      "color": {
        "text": "#ffffff",
        "background": "#000000"
      }
    }
  }
}
```

These generate **scoped CSS rules** (not inline styles on the wrapper), using a generated class like `.wp-elements-{uuid}`:
```css
.wp-elements-abc123 a { color: var(--wp--preset--color--vivid-red); }
```

---

## The Style Attribute Object

Complete structure:
```json
{
  "style": {
    "color": {
      "background": "#fff",
      "text": "#000",
      "gradient": "linear-gradient(...)"
    },
    "typography": {
      "fontSize": "18px",
      "lineHeight": "1.5",
      "fontFamily": "Arial",
      "fontWeight": "700",
      "fontStyle": "italic",
      "textTransform": "uppercase",
      "textDecoration": "underline",
      "letterSpacing": "0.05em",
      "writingMode": "vertical-rl"
    },
    "spacing": {
      "padding": {"top": "20px", "right": "20px", "bottom": "20px", "left": "20px"},
      "margin": {"top": "10px", "bottom": "10px"},
      "blockGap": "1.5em"
    },
    "border": {
      "radius": "5px",
      "width": "1px",
      "color": "#ccc",
      "style": "solid"
    },
    "dimensions": {
      "minHeight": "300px",
      "aspectRatio": "16/9"
    },
    "shadow": "6px 6px 9px rgba(0,0,0,0.2)",
    "background": {
      "backgroundImage": {"url": "...", "id": 123, "source": "file"},
      "backgroundPosition": "50% 50%",
      "backgroundSize": "cover"
    },
    "elements": {
      "link": {"color": {"text": "#0073aa"}},
      "heading": {"color": {"text": "#000"}},
      "button": {"color": {"text": "#fff", "background": "#000"}}
    }
  }
}
```

---

## Preset Reference Format

Throughout the `style` object, preset values are referenced as:
```
"var:preset|{type}|{slug}"
```

This compiles to CSS custom properties:
```
var(--wp--preset--{type}--{slug})
```

Examples:
| Reference | CSS Output |
|-----------|-----------|
| `var:preset|color|vivid-red` | `var(--wp--preset--color--vivid-red)` |
| `var:preset|spacing|40` | `var(--wp--preset--spacing--40)` |
| `var:preset|font-size|large` | `var(--wp--preset--font-size--large)` |
| `var:preset|shadow|natural` | `var(--wp--preset--shadow--natural)` |

---

## Skip Serialization

Some blocks use `__experimentalSkipSerialization` for certain supports. This means the support's classes/styles are NOT auto-applied to the wrapper element — the block's `save()` function applies them manually to an inner element instead.

Common example: `core/image` skips border serialization on the `<figure>` wrapper because borders should apply to the inner `<img>` element. When writing image markup with borders, the border styles go on `<img>`, not `<figure>`.

When a support is skipped, the `style` attribute still holds the values in the comment JSON, but you must check the block's actual markup pattern (in `block-catalog.md`) to see where the CSS properties are applied.
