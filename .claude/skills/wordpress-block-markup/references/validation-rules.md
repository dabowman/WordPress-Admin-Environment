# Block Validation Rules

How Gutenberg validates block markup and how to avoid validation errors.

## Table of Contents
1. [The Validation Algorithm](#the-validation-algorithm)
2. [The isEquivalentHTML Comparison](#the-isequivalenthtml-comparison)
3. [Common Validation Failures](#common-validation-failures)
4. [Validation Checklist](#validation-checklist)
5. [Blocks That Skip Validation](#blocks-that-skip-validation)
6. [The Deprecation System](#the-deprecation-system)
7. [Manual Validation Procedure](#manual-validation-procedure)

---

## The Validation Algorithm

When the editor loads post content, every block is validated in these steps:

1. **Parse** `post_content` into block objects via the grammar parser
2. **Look up** the registered block type by `blockName`
3. **Source attributes** from both the comment JSON and the HTML markup using attribute definitions
4. **Regenerate** the expected HTML via `getSaveContent(blockType, attributes)` — this is what the block's `save()` function would produce
5. **Compare** the regenerated HTML against `block.originalContent` using `isEquivalentHTML()`

If the comparison fails → the block is marked invalid → the editor shows "This block contains unexpected or invalid content" with recovery options.

## The isEquivalentHTML Comparison

This is NOT a string comparison. Both HTML strings are **tokenized** and compared token-by-token with these normalization rules:

### What IS normalized (differences are ignored)
- **Tag name case**: `<DIV>` = `<div>`
- **Attribute name case**: `CLASS="foo"` = `class="foo"`
- **Attribute order**: `<div id="a" class="b">` = `<div class="b" id="a">`
- **Self-closing equivalence**: `<br>` = `<br />` = `<br/>`
- **Whitespace-only text nodes** between elements are skipped
- **Empty non-meaningful attributes**: `<div class>` = `<div>` (but NOT boolean attributes like `disabled`)
- **Quotes around attributes**: `<div class="foo">` = `<div class='foo'>`

### What is NOT normalized (differences cause failure)
- **Class value strings**: `class="foo bar"` ≠ `class="bar foo"` — ORDER MATTERS
- **Extra or missing classes**: `class="foo bar"` ≠ `class="foo"` — must match exactly
- **Style attribute values**: `style="color:red"` ≠ `style="color: red"` — whitespace in values matters
- **Text content**: any change to text content
- **Missing or extra elements**: structural HTML differences
- **Missing or extra attributes**: `<div data-x="y">` ≠ `<div>`
- **Changed attribute values**: `href="a"` ≠ `href="b"`

### Critical implication for class names
Since class values are compared as **exact strings**, you must:
- Use the exact same class names the block generates
- In the exact same order
- With no extra classes (unless added by the block itself)

## Common Validation Failures

### 1. Wrong class order
```html
<!-- WRONG -->
<p class="has-background has-vivid-cyan-blue-background-color">

<!-- CORRECT -->
<p class="has-vivid-cyan-blue-background-color has-background">
```

### 2. Missing required classes
```html
<!-- WRONG: missing has-text-color -->
<p class="has-white-color">

<!-- CORRECT -->
<p class="has-white-color has-text-color">
```

### 3. Extra whitespace in style values
```html
<!-- WRONG: space after colon -->
<p style="font-size: 22px">

<!-- CORRECT: no space -->
<p style="font-size:22px">
```

### 4. Wrong self-closing format
```html
<!-- WRONG for img -->
<img src="..." alt="">

<!-- CORRECT -->
<img src="..." alt=""/>
```

### 5. Missing wp-element-caption class (WP 6.1+)
```html
<!-- WRONG -->
<figcaption>Caption</figcaption>

<!-- CORRECT -->
<figcaption class="wp-element-caption">Caption</figcaption>
```

### 6. Missing wp-element-button class (WP 6.1+)
```html
<!-- WRONG -->
<a class="wp-block-button__link" href="#">Button</a>

<!-- CORRECT -->
<a class="wp-block-button__link wp-element-button" href="#">Button</a>
```

### 7. Missing wp-block-heading class (WP 6.2+)
```html
<!-- WRONG -->
<h2>Heading</h2>

<!-- CORRECT -->
<h2 class="wp-block-heading">Heading</h2>
```

### 8. Wrong wrapper element
```html
<!-- WRONG: table not in figure -->
<table>...</table>

<!-- CORRECT -->
<figure class="wp-block-table"><table>...</table></figure>
```

### 9. Incorrect hr self-closing
```html
<!-- WRONG -->
<hr class="wp-block-separator has-alpha-channel-opacity">

<!-- CORRECT -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
```

### 10. Sourced attributes in comment JSON
```html
<!-- WRONG: content is a sourced attribute -->
<!-- wp:paragraph {"content":"Hello world"} -->

<!-- CORRECT: content lives only in the HTML -->
<!-- wp:paragraph -->
<p>Hello world</p>
```

### 11. Default values in comment JSON
```html
<!-- WRONG: level 2 is the default for headings -->
<!-- wp:heading {"level":2} -->

<!-- CORRECT: omit defaults -->
<!-- wp:heading -->
```

## Validation Checklist

Before finalizing any block markup, verify:

- [ ] Block name uses lowercase, no `core/` prefix in delimiter
- [ ] Only non-default, non-sourced attributes are in the comment JSON
- [ ] JSON is valid (no trailing commas, proper quoting)
- [ ] Preset colors use class pattern: `has-{slug}-{type}-color` + flag class
- [ ] Custom colors use inline style + flag class only (`has-text-color`/`has-background`)
- [ ] Class names are in the correct order
- [ ] No extra spaces in `style` attribute values
- [ ] Self-closing tags use `/>` not `>` (for `img`, `hr`, `br`, `input`)
- [ ] `<figcaption>` has `wp-element-caption` class
- [ ] `<a>` in buttons has `wp-element-button` class
- [ ] `<h1>`-`<h6>` has `wp-block-heading` class
- [ ] Container blocks have inner blocks properly nested inside wrapper HTML
- [ ] Dynamic blocks use self-closing delimiter `<!-- wp:name /-->`
- [ ] Image class matches `wp-image-{id}` on the `<img>` element
- [ ] Image figure class includes `size-{sizeSlug}`
- [ ] Separator has `has-alpha-channel-opacity` class
- [ ] No leading/trailing whitespace inside rich-text wrapper elements

## Blocks That Skip Validation

These blocks bypass the save/compare validation:

- **Dynamic blocks** with `save: () => null` — all theme blocks, widget blocks, most server-rendered blocks. They save no HTML, so there's nothing to validate.
- **Freeform content** (`blockName: null`) — classic editor content between blocks.
- **Unregistered blocks** — blocks whose type isn't registered in the editor. Stored as-is with a `core/missing` wrapper.
- **`core/html`** — Custom HTML block, content is intentionally raw.

For these blocks, you only need valid delimiter syntax, not valid inner HTML.

## The Deprecation System

When current validation fails, the editor tries deprecated versions:

1. Iterates through the block's `deprecated` array (first match wins)
2. For each entry: re-parse attributes using deprecated definitions, validate against deprecated `save()` output
3. If valid: optionally run `migrate()` to transform attributes to current format
4. If all deprecations fail: block is marked invalid

**Practical implication**: Core blocks have multiple deprecations for markup changes across WP versions. This means older markup formats (pre-6.0 lists without inner blocks, pre-6.2 headings without `wp-block-heading`) may still validate through deprecations. However, always write the **current** format — deprecations are a safety net, not a target.

## Manual Validation Procedure

When debugging a block that shows as invalid:

1. **Identify the block name** from the opening comment delimiter
2. **Look up the current markup pattern** in `block-catalog.md`
3. **Extract the comment attributes** and the inner HTML separately
4. **Check each attribute value** against the expected CSS class or style output using `supports-css-mapping.md`
5. **Compare your HTML element-by-element** against the expected pattern:
   - Correct wrapper element (`div`, `figure`, `p`, etc.)?
   - Correct class string (exact match, correct order)?
   - Correct style string (no extra spaces)?
   - Correct self-closing tags?
   - Correct inner structure?
6. **Check the comment JSON**:
   - No sourced attributes present?
   - No default values present?
   - Valid JSON syntax?
7. **If attributes look correct but HTML doesn't match**, the block may have changed between WP versions. Check `make.wordpress.org/core` for markup update announcements.
