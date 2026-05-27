---
name: wordpress-block-markup
description: Write, edit, and validate WordPress Gutenberg block markup using core blocks. Use this skill whenever composing post/page content as block markup, generating block HTML for the REST API or WP-CLI, converting content to Gutenberg blocks, editing existing block markup, fixing block validation errors, creating block patterns from scratch, or producing any serialized block content destined for post_content. Also trigger when a user asks to "write blocks", "create a page layout", "generate WordPress content", "fix invalid blocks", or mentions pasting block markup into Gutenberg. This skill is about authoring content with blocks, not building custom block types — for custom block development, use the wordpress-blocks skill instead.
---

# WordPress Block Markup Authoring (WP 6.5+; current: 6.9, released December 2, 2025)

## ⚠ Verify before asserting

WordPress ships twice yearly. Before claiming a block doesn't exist or an attribute is unsupported, check the live source — don't rely on training data:

| Surface | Live source |
|---|---|
| Core blocks reference | `https://developer.wordpress.org/block-editor/reference-guides/core-blocks/` |
| `block.json` schema | `https://schemas.wp.org/trunk/block.json` |
| Per-release dev-notes | `https://make.wordpress.org/core/tag/dev-notes/` |

A positive claim sourced from this skill's references is fine; a negative claim ("block X doesn't accept attribute Y") needs a live check.

Write valid WordPress Gutenberg block markup that passes editor validation without triggering recovery prompts. This skill makes you a headless Gutenberg editor — you produce the same serialized HTML that the block editor saves to `post_content`.

## When to Use This Skill

- Composing new post/page content as block markup
- Generating content for the WP REST API (`content.raw` field)
- Converting plain text, HTML, or markdown into valid block markup
- Editing or transforming existing block markup
- Fixing "This block contains unexpected or invalid content" errors
- Creating block patterns (which are just block markup in PHP files)
- Any task where the output is serialized Gutenberg block HTML

## Critical Rules (memorize these)

These rules are non-negotiable. Violating any one will cause validation failures.

### 1. Block Delimiter Format
```
Opening:      <!-- wp:blockname {"attr":"val"} -->
Closing:      <!-- /wp:blockname -->
Self-closing: <!-- wp:blockname {"attr":"val"} /-->
```

- **Strip `core/` prefix**: Write `wp:paragraph`, never `wp:core/paragraph`
- Third-party blocks keep their namespace: `wp:myplugin/myblock`
- Block names are lowercase: `[a-z][a-z0-9_-]*`
- Separate top-level blocks with `\n\n` (double newline)

### 2. Attribute Serialization Rules

Attributes live in **two places** and you must never mix them up:

**Comment JSON** (in the delimiter) — attributes with NO `source` property:
```html
<!-- wp:paragraph {"dropCap":true,"align":"center"} -->
```

**HTML markup** (in the inner content) — attributes WITH a `source` property:
```html
<p class="has-text-align-center">The text content lives here</p>
```

**Golden rule**: Omit any attribute that equals its default value. The serializer only includes non-default values in the comment JSON.

### 3. CSS Class Patterns Must Be Exact

Validation compares generated HTML token-by-token. Classes must match exactly — including **order**:

| Feature | Preset (slug-based) | Custom (value-based) |
|---------|---------------------|---------------------|
| Background color | `has-{slug}-background-color has-background` | class `has-background` + style `background-color:{val}` |
| Text color | `has-{slug}-color has-text-color` | class `has-text-color` + style `color:{val}` |
| Gradient | `has-{slug}-gradient-background has-background` | style `background:{val}` |
| Font size | `has-{slug}-font-size` | style `font-size:{val}` |
| Font family | `has-{slug}-font-family` | style `font-family:{val}` |
| Text align | `has-text-align-{val}` | (always class-based) |
| Alignment | `align{val}` (on wrapper figure/div) | — |

See `references/supports-css-mapping.md` for the complete mapping.

### 4. Block Types

**Self-closing** — no inner HTML, no children:
`<!-- wp:spacer {"height":"50px"} /-->`

**Content blocks** — HTML between delimiters, no child blocks:
`<!-- wp:paragraph --><p>Text</p><!-- /wp:paragraph -->`

**Container blocks** — HTML wrapper with child blocks inside:
```html
<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column">...children...</div>
<!-- /wp:column --></div>
<!-- /wp:columns -->
```

**Dynamic blocks** — server-rendered, always self-closing:
`<!-- wp:latest-posts {"postsToShow":5} /-->`

### 5. Block Bindings (WP 6.5+)

A core block can read an attribute value from a registered data source at render time by declaring `metadata.bindings` in the comment JSON. The fallback inner HTML stays in the markup — the server overwrites it when rendering.

```html
<!-- wp:heading {"metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"subtitle"}}}}} -->
<h2 class="wp-block-heading">Fallback text</h2>
<!-- /wp:heading -->

<!-- wp:image {"metadata":{"bindings":{"url":{"source":"core/post-meta","args":{"key":"hero"}},"alt":{"source":"core/post-meta","args":{"key":"hero_alt"}}}}} -->
<figure class="wp-block-image"><img src="" alt=""/></figure>
<!-- /wp:image -->
```

**Binding object shape:** `{ "source": "namespace/source", "args": { … } }`. Every binding must specify a `source` registered in PHP; `args` is source-specific.

**Bindable attributes are hardcoded per block.** Common cases:

| Block | Attributes that accept bindings |
|---|---|
| `core/paragraph` | `content` |
| `core/heading` | `content` |
| `core/image` | `id`, `url`, `title`, `alt`, `caption` |
| `core/button` | `url`, `text`, `linkTarget`, `rel` |
| `core/post-date` | `datetime` |

**Core-registered sources:** `core/post-meta` (6.5), `core/pattern-overrides` (6.5), `core/post-data` (6.9), `core/term-data` (6.9). Plugins register more via `register_block_bindings_source()` — see the `wordpress-blocks` skill for the registration side.

Keep the fallback markup valid — it's what renders if the source returns `null`/`false` or the binding fails.

### 6. Validation-Safe Whitespace

- No extra whitespace inside block wrapper tags
- Inner blocks sit directly inside parent wrapper HTML (no extra newlines between wrapper tags and child delimiters)
- Rich text content has no leading/trailing whitespace in the `<p>`, `<h2>`, etc.

## Reference Files

Read these before writing markup. They contain the detailed specifications.

| File | When to read | Size |
|------|-------------|------|
| `references/block-grammar.md` | Understanding delimiter parsing, attribute sources, the PEG grammar | ~150 lines |
| `references/block-catalog.md` | Looking up any core block's exact markup pattern, attributes, and structure | ~800 lines |
| `references/supports-css-mapping.md` | Applying colors, typography, spacing, borders, layout to any block | ~350 lines |
| `references/validation-rules.md` | Debugging invalid blocks, understanding the comparison algorithm | ~200 lines |
| `references/style-attribute-reference.md` | Building the `style` JSON object for custom (non-preset) values | ~150 lines |

**For most tasks, start with `block-catalog.md`** to find the right blocks and their exact patterns, then consult `supports-css-mapping.md` when adding styles.

## Workflow: Writing Block Content

### Step 1: Plan the structure
Identify which blocks you need. Prefer:
- `core/group` with layout variations for sections (Row, Stack, Grid)
- `core/columns` for multi-column layouts
- `core/cover` for hero/banner sections
- `core/paragraph`, `core/heading`, `core/list` for text content
- `core/image`, `core/gallery` for media
- `core/buttons` for CTAs

### Step 2: Write markup inside-out
Start with the innermost content blocks, then wrap them in containers. This prevents nesting errors.

### Step 3: Apply styles via supports
Use preset slugs when available (they generate classes). Fall back to the `style` attribute object for custom values. See `references/supports-css-mapping.md`.

### Step 4: Validate
Run the validation script or manually check against the rules in `references/validation-rules.md`.

## Workflow: Fixing Invalid Blocks

1. Identify the block name from the opening delimiter
2. Look up its expected markup in `references/block-catalog.md`
3. Compare class names, attribute order, and HTML structure
4. Check common culprits: wrong class order, extra/missing classes, incorrect self-closing tags, changed wrapper elements
5. See `references/validation-rules.md` for the full checklist

## Workflow: Delivering Block Content

### Via REST API
```
POST /wp/v2/posts
{
  "title": "My Post",
  "content": "<serialized block markup here>",
  "status": "draft"
}
```
The `content` field accepts raw block markup. WordPress performs no server-side block validation — it stores the string as-is. Validation only happens when the editor loads the post.

### Via MCP / WP-CLI
Same raw markup string. The key is that `post_content` is just a text column.

### For user pasting
Provide the complete markup as a code block. The user pastes it into the Gutenberg **Code Editor** (⋮ menu → Code editor), not the visual editor.

## Quick Examples

**Simple blog post:**
```html
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">Post Title</h1>
<!-- /wp:heading -->

<!-- wp:paragraph -->
<p>Opening paragraph with <strong>bold</strong> and <a href="https://example.com">a link</a>.</p>
<!-- /wp:paragraph -->

<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="Description" class="wp-image-42"/></figure>
<!-- /wp:image -->

<!-- wp:paragraph -->
<p>Closing paragraph.</p>
<!-- /wp:paragraph -->
```

**Two-column layout:**
```html
<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Left column.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Right column.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->
```

**Styled paragraph (preset colors + custom font size):**
```html
<!-- wp:paragraph {"backgroundColor":"vivid-cyan-blue","textColor":"white","style":{"typography":{"fontSize":"22px"}}} -->
<p class="has-white-color has-vivid-cyan-blue-background-color has-text-color has-background" style="font-size:22px">Styled content.</p>
<!-- /wp:paragraph -->
```

For comprehensive examples of every block type, see `references/block-catalog.md`.
