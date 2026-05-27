# Style Attribute Quick Reference

The `style` attribute is a JSON object stored in the block's comment delimiter. It holds custom (non-preset) values for all block supports. This document is a quick reference for building it correctly.

## When to Use `style` vs Top-Level Attributes

| Scenario | Use | Example |
|----------|-----|---------|
| Theme palette color | Top-level attribute | `"backgroundColor": "vivid-red"` |
| Custom hex color | `style.color` | `"style": {"color": {"background": "#ff0000"}}` |
| Theme font size preset | Top-level attribute | `"fontSize": "large"` |
| Custom pixel font size | `style.typography` | `"style": {"typography": {"fontSize": "22px"}}` |
| Theme spacing preset | `style.spacing` with var | `"style": {"spacing": {"padding": {"top": "var:preset|spacing|40"}}}` |
| Custom spacing | `style.spacing` | `"style": {"spacing": {"padding": {"top": "2em"}}}` |
| Theme border color | Top-level attribute | `"borderColor": "vivid-red"` |
| Custom border | `style.border` | `"style": {"border": {"width": "2px", "style": "solid"}}` |

**Rule**: If a theme.json preset slug exists for the value, use the top-level attribute (which generates a class). Otherwise, use the `style` object (which generates inline styles).

## Complete Style Object Schema

```json
{
  "style": {
    "color": {
      "background": "<color>",
      "text": "<color>",
      "gradient": "<gradient-string>"
    },
    "typography": {
      "fontSize": "<size-with-unit>",
      "fontFamily": "<font-stack>",
      "fontWeight": "<weight>",
      "fontStyle": "normal | italic | oblique",
      "lineHeight": "<number>",
      "textTransform": "none | capitalize | uppercase | lowercase",
      "textDecoration": "none | underline | line-through",
      "letterSpacing": "<size-with-unit>",
      "writingMode": "horizontal-tb | vertical-rl | vertical-lr"
    },
    "spacing": {
      "padding": {
        "top": "<size>",
        "right": "<size>",
        "bottom": "<size>",
        "left": "<size>"
      },
      "margin": {
        "top": "<size>",
        "right": "<size>",
        "bottom": "<size>",
        "left": "<size>"
      },
      "blockGap": "<size>"
    },
    "border": {
      "color": "<color>",
      "style": "none | solid | dashed | dotted | double | groove | ridge",
      "width": "<size>",
      "radius": "<size> | {topLeft, topRight, bottomLeft, bottomRight}",
      "top": {"color": "<color>", "style": "<style>", "width": "<size>"},
      "right": {"color": "<color>", "style": "<style>", "width": "<size>"},
      "bottom": {"color": "<color>", "style": "<style>", "width": "<size>"},
      "left": {"color": "<color>", "style": "<style>", "width": "<size>"}
    },
    "dimensions": {
      "minHeight": "<size>",
      "aspectRatio": "<ratio>"
    },
    "shadow": "<shadow-string> | var:preset|shadow|<slug>",
    "background": {
      "backgroundImage": {
        "url": "<url>",
        "id": "<attachment-id>",
        "source": "file"
      },
      "backgroundPosition": "<position>",
      "backgroundSize": "auto | cover | contain | <size>",
      "backgroundRepeat": "repeat | no-repeat | repeat-x | repeat-y"
    },
    "elements": {
      "link": {
        "color": {"text": "<color>"},
        ":hover": {"color": {"text": "<color>"}}
      },
      "heading": {
        "color": {"text": "<color>", "background": "<color>"},
        "typography": {"fontSize": "<size>", "fontWeight": "<weight>"}
      },
      "button": {
        "color": {"text": "<color>", "background": "<color>"}
      }
    }
  }
}
```

## Size Value Formats

- Pixels: `"20px"`
- Em: `"1.5em"`
- Rem: `"2rem"`
- Percentage: `"50%"`
- Viewport: `"100vh"`, `"50vw"`
- Calc: `"calc(100% - 20px)"`
- Clamp: `"clamp(1rem, 2vw, 2rem)"`
- Preset reference: `"var:preset|spacing|40"` → rendered as `var(--wp--preset--spacing--40)`

## Color Value Formats

- Hex: `"#ff0000"`, `"#f00"`
- RGB: `"rgb(255,0,0)"`
- RGBA: `"rgba(255,0,0,0.5)"`
- HSL: `"hsl(0,100%,50%)"`
- Preset reference: `"var:preset|color|vivid-red"` → rendered as `var(--wp--preset--color--vivid-red)`

## Common Combinations

### Paragraph with full styling
```json
{
  "backgroundColor": "pale-pink",
  "textColor": "vivid-red",
  "fontSize": "large",
  "style": {
    "typography": {
      "lineHeight": "1.8",
      "letterSpacing": "0.02em"
    },
    "spacing": {
      "padding": {
        "top": "var:preset|spacing|40",
        "bottom": "var:preset|spacing|40",
        "left": "var:preset|spacing|50",
        "right": "var:preset|spacing|50"
      }
    },
    "border": {
      "radius": "8px"
    }
  }
}
```

### Group with custom background and layout
```json
{
  "style": {
    "color": {
      "background": "#f5f5f5"
    },
    "spacing": {
      "padding": {
        "top": "3em",
        "bottom": "3em",
        "left": "2em",
        "right": "2em"
      }
    },
    "border": {
      "radius": "12px",
      "width": "1px",
      "style": "solid",
      "color": "#e0e0e0"
    }
  },
  "layout": {
    "type": "constrained"
  }
}
```

### Button with gradient and shadow
```json
{
  "style": {
    "color": {
      "gradient": "linear-gradient(135deg,#667eea 0%,#764ba2 100%)"
    },
    "border": {
      "radius": "50px"
    },
    "shadow": "0 4px 6px rgba(0,0,0,0.1)",
    "typography": {
      "fontWeight": "600"
    }
  }
}
```

## Merging Rules

When a block has BOTH a preset attribute AND custom style values for different properties, they merge:

```json
{
  "backgroundColor": "white",
  "style": {
    "color": {
      "text": "#333"
    },
    "typography": {
      "fontSize": "18px"
    }
  }
}
```
→ Classes: `has-white-background-color has-background has-text-color`
→ Style: `color:#333;font-size:18px`

A preset and custom value for the SAME property: the preset takes precedence. If `fontSize: "large"` is set AND `style.typography.fontSize: "22px"` exists, the preset wins and the custom value is ignored.
