# theme.json Integration for Custom Blocks

**Purpose:** What a block author needs to know to consume a theme's `theme.json` — CSS custom properties, preset utility classes your `save` must emit, and reading settings from JS. For authoring theme.json itself (schema, settings/styles layout, v2→v3 migration, style variations, fluid typography, layout config, etc.), use the **`wordpress-block-themes`** skill.

## Read Presets, Don't Hardcode Values

Custom blocks should be **themed, not self-styled**. The theme defines the design system; your block consumes it.

**Anti-patterns**

- Hard-coded colors, spacing, or font sizes in block CSS
- Custom design tokens that duplicate theme presets
- Inline styles that ignore the user's preset selections
- Bootstrap or other third-party CSS frameworks inside a block

**Correct patterns**

- Reference `var(--wp--preset--*)` custom properties in block CSS
- Let `useBlockProps()` / `useBlockProps.save()` attach the preset utility classes
- Read presets with `useSettings()` when you need them at render time
- Only define new presets (via a block-level `theme.json`) when the theme's vocabulary is genuinely missing something

## CSS Custom Property Convention

WordPress generates one CSS custom property per preset, scoped to `:root`:

```
--wp--preset--{category}--{slug}
```

| theme.json preset path | Generated variable |
|---|---|
| `settings.color.palette[].slug = "primary"` | `--wp--preset--color--primary` |
| `settings.color.gradients[].slug = "sunset"` | `--wp--preset--gradient--sunset` |
| `settings.typography.fontSizes[].slug = "lg"` | `--wp--preset--font-size--lg` |
| `settings.typography.fontFamilies[].slug = "sans"` | `--wp--preset--font-family--sans` |
| `settings.spacing.spacingSizes[].slug = "40"` | `--wp--preset--spacing--40` |
| `settings.shadow.presets[].slug = "deep"` | `--wp--preset--shadow--deep` |

Layout globals (set by `settings.layout`):

- `--wp--style--global--content-size`
- `--wp--style--global--wide-size`

Custom settings under `settings.custom` generate `--wp--custom--{kebab-path}` (camelCase → kebab-case, nested keys append segments).

**Use them from your block's stylesheet:**

```css
.wp-block-acme-card {
  padding-block: var(--wp--preset--spacing--50);
  padding-inline: var(--wp--preset--spacing--40);
  font-size: var(--wp--preset--font-size--md);

  /* Fall back to theme defaults if the user hasn't set colors */
  &:not(.has-background) {
    background-color: var(--wp--preset--color--base);
  }
  &:not(.has-text-color) {
    color: var(--wp--preset--color--contrast);
  }

  /* Respect theme layout constraints */
  max-width: var(--wp--style--global--content-size);
  margin-inline: auto;

  &.alignwide  { max-width: var(--wp--style--global--wide-size); }
  &.alignfull  { max-width: none; }
}
```

## Preset Classes Your `save` Must Emit

When a user picks a preset in the Inspector, the editor stores the slug on an attribute (e.g. `backgroundColor`, `textColor`, `fontSize`). The editor auto-renders these as classes — but on the frontend **your `save` function is responsible for serializing them** so WordPress's generated utility CSS can take effect.

Using `useBlockProps.save()` with the block supports system handles this automatically. If you hand-render markup you must emit the classes yourself.

| Attribute | Required classes on the element |
|---|---|
| `backgroundColor: "primary"` | `has-primary-background-color has-background` |
| `textColor: "contrast"` | `has-contrast-color has-text-color` |
| `gradient: "sunset"` | `has-sunset-gradient-background has-background` |
| `fontSize: "lg"` | `has-lg-font-size` |
| `fontFamily: "sans"` | `has-sans-font-family` |
| `align: "wide" \| "full"` | `alignwide` / `alignfull` (on wrapper) |
| `textAlign: "center"` | `has-text-align-center` |
| Border color preset `"accent"` | `has-accent-border-color has-border-color` |

Notes:

- The `has-background` / `has-text-color` / `has-border-color` companion class is required — the preset color class alone has no effect without it.
- Custom (non-preset) colors go into inline `style` instead, not these classes.
- Font-size and spacing preset slugs with numeric names (e.g. `"40"`) produce `has-40-font-size` / `--wp--preset--spacing--40`. Prefer meaningful slugs where the theme allows it.

**Easy path — let block supports do it:**

```jsx
// save.js
import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

export default function save() {
  const blockProps = useBlockProps.save();
  // Contains every preset + custom-style class derived from supports.
  return (
    <div {...blockProps}>
      <InnerBlocks.Content />
    </div>
  );
}
```

## Reading Settings in `edit.js`

Use `useSettings()` (WP 6.5+, replaces the deprecated `useSetting`) when the editor needs to branch on what the theme provides — e.g. to populate a custom control or pick a fallback.

```jsx
import { useSettings } from '@wordpress/block-editor';

export default function Edit() {
  // Returns an array in path order; each entry is the resolved setting or undefined.
  const [ palette, fontSizes, spacingSizes, hasCustomColor ] = useSettings(
    'color.palette',
    'typography.fontSizes',
    'spacing.spacingSizes',
    'color.custom'
  );

  // palette  = [ { name, slug, color }, ... ]  (global + block-scoped merged)
  // fontSizes = [ { name, slug, size }, ... ]
  // hasCustomColor = boolean — is the custom color picker enabled?
  // ...
}
```

Outside React (e.g. in a filter), the equivalent is `getSettings()` from `@wordpress/block-editor`'s data store:

```js
import { select } from '@wordpress/data';
import { store as blockEditorStore } from '@wordpress/block-editor';

const settings = select( blockEditorStore ).getSettings();
const palette = settings.colors; // editor-normalized shape
```

Prefer `useSettings()` inside components — it subscribes to changes.

## Per-Block `theme.json`

A block can ship its own `theme.json` alongside `block.json`. WordPress merges it into the theme's cascade at the **Blocks** origin (below theme, below user). Use this to:

- Register block-scoped presets the global palette doesn't include
- Provide opinionated defaults a theme can still override

```
acme-card/
├── block.json
├── theme.json      ← block-scoped
├── index.js
├── edit.js
├── save.js
└── style.scss
```

```json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "color": {
      "palette": [
        { "name": "Card Accent", "slug": "card-accent", "color": "#ff6b6b" }
      ]
    }
  },
  "styles": {
    "spacing": {
      "padding": {
        "top": "var:preset|spacing|50",
        "bottom": "var:preset|spacing|50"
      }
    }
  }
}
```

This adds `--wp--preset--color--card-accent` and a default padding the user can still override in the Inspector. Keep per-block theme.json small — if you find yourself redefining the design system, that's the theme's job.

## Minimal Integration Example

```json
// block.json
{
  "apiVersion": 3,
  "name": "acme/card",
  "supports": {
    "align": ["wide", "full"],
    "color": { "background": true, "text": true },
    "spacing": { "padding": true, "blockGap": true },
    "typography": { "fontSize": true }
  }
}
```

```css
/* style.css */
.wp-block-acme-card {
  padding: var(--wp--preset--spacing--40);
  max-width: var(--wp--style--global--content-size);
  margin-inline: auto;

  &:not(.has-background) { background-color: var(--wp--preset--color--base); }
  &:not(.has-text-color) { color: var(--wp--preset--color--contrast); }
  &.alignwide { max-width: var(--wp--style--global--wide-size); }
  &.alignfull { max-width: none; }
}
```

```jsx
// save.js
import { useBlockProps, InnerBlocks } from '@wordpress/block-editor';

export default function save() {
  return (
    <div { ...useBlockProps.save() }>
      <InnerBlocks.Content />
    </div>
  );
}
```

Result: the block inherits the theme's colors, spacing scale, typography, and layout widths. Users switch themes and the block follows.

## See Also

- **`wordpress-block-themes`** — authoring `theme.json` (settings/styles schema, v2→v3 migration, style variations, block style variations, fluid typography, layout config, custom CSS, section styles, four-origin cascade)
- `./block-supports.md` — which `supports` keys emit which preset classes
- [theme.json Living Reference](https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/)
- [`useSettings` hook](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-block-editor/#usesettings)
