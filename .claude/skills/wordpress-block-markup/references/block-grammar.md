# Block Grammar Specification

## Table of Contents
1. [PEG Grammar](#peg-grammar)
2. [Delimiter Format](#delimiter-format)
3. [Attribute Sources](#attribute-sources)
4. [Parser Behavior](#parser-behavior)
5. [Serialization Rules](#serialization-rules)

---

## PEG Grammar

The canonical grammar lives in `packages/block-serialization-spec-parser/grammar.pegjs`:

```peg
Block_List       = ( Block / Freeform_Content )*
Block            = Block_Void / Block_Balanced
Block_Void       = "<!--" WS "wp:" Block_Name WS? ( Block_Attrs WS )? "/-->"
Block_Balanced   = Block_Start ( Block / Freeform_Content )* Block_End
Block_Start      = "<!--" WS "wp:" Block_Name WS? ( Block_Attrs WS )? "-->"
Block_End        = "<!--" WS "/wp:" Block_Name WS? "-->"
Block_Name       = Namespaced / Core
Namespaced       = [a-z][a-z0-9_-]* "/" [a-z][a-z0-9_-]*
Core             = [a-z][a-z0-9_-]*
Block_Attrs      = "{" JSON_Object_Contents "}"
Freeform_Content = ( !Block_Delimiter . )+
WS               = [ \t\r\n]+
```

Two parsers implement this grammar:
- **Spec parser** (`@wordpress/block-serialization-spec-parser`): PEG.js-generated, canonical reference
- **Default parser** (`@wordpress/block-serialization-default-parser` / `WP_Block_Parser` in PHP): Hand-written state machine, used in production

The PHP parser's tokenizer regex:
```
/<!--\s+(?P<closer>\/)?wp:(?P<namespace>[a-z][a-z0-9_-]*\/)?(?P<name>[a-z][a-z0-9_-]*)\s+(?P<attrs>{(?:(?:[^}]+|}+(?=})|(?!}\s+\/?-->).)*+)?}\s+)?(?P<void>\/)?-->/s
```

The `attrs` sub-pattern uses possessive quantifiers and lookahead to handle nested JSON objects (e.g., `{"style":{"color":{"text":"#000"}}}`) without catastrophic backtracking. A naive `\{[^}]*\}` would fail on any block with a `style` attribute.

## Delimiter Format

### Opening delimiter
```
<!-- wp:blockname {"key":"value"} -->
     ^            ^               ^
     |            |               exactly " -->" (space, two dashes, close)
     |            optional JSON, must be valid object
     lowercase block name, no core/ prefix
```

### Closing delimiter
```
<!-- /wp:blockname -->
     ^
     forward slash before wp:
```

### Self-closing (void) delimiter
```
<!-- wp:blockname {"key":"value"} /-->
                                 ^
                                 forward slash before -->
```

### Namespace rules
- Core blocks: OMIT `core/` → `<!-- wp:paragraph -->`
- Third-party: KEEP namespace → `<!-- wp:myplugin/myblock -->`
- Block name charset: `[a-z][a-z0-9_-]*` (lowercase start, then lowercase + digits + hyphens + underscores)

### Whitespace rules
- At least one space/tab/newline after `<!--` and before `-->`
- Optional whitespace between block name and attributes JSON
- Required whitespace between attributes JSON and `-->` or `/-->`
- Top-level blocks separated by `\n\n`

## Attribute Sources

When the parser encounters a block, it builds attributes from two sources:

### Comment attributes (no `source` property in block.json)
Stored as JSON in the delimiter. The serializer (`getCommentAttributes()`) includes only attributes where:
1. No `source` property defined
2. No `role: "local"` (WP 6.5+)
3. Value differs from the `default`

```json
// block.json defines:
"attributes": {
  "dropCap": { "type": "boolean", "default": false },
  "align": { "type": "string" }
}

// If dropCap=true, align="center":
// → Serialized as: {"dropCap":true,"align":"center"}
// If dropCap=false (default), align undefined:
// → No JSON in delimiter at all
```

### Sourced attributes (have `source` property in block.json)
Extracted from the block's inner HTML via DOM queries. NEVER appear in the comment JSON.

| Source type | Extraction | block.json fields |
|-------------|-----------|-------------------|
| `attribute` | `element.getAttribute(name)` | `selector`, `attribute` |
| `text` | `element.textContent` | `selector` |
| `html` | `element.innerHTML` | `selector` |
| `rich-text` | `element.innerHTML` (rich text) | `selector` |
| `query` | `querySelectorAll()` → array | `selector`, `query` |

Example — paragraph block:
```json
// block.json
"content": { "type": "rich-text", "source": "rich-text", "selector": "p" }
// → Parsed from: <p>Hello <strong>world</strong></p>
// → NEVER in the comment delimiter
```

### Generated attributes (from supports)
Block supports auto-register attributes. These are comment attributes:
- `textColor`, `backgroundColor`, `gradient` → from `supports.color`
- `fontSize`, `fontFamily` → from `supports.typography`
- `borderColor` → from `supports.border`
- `style` → catch-all object for custom values from any support
- `align` → from `supports.align`
- `anchor` → from `supports.anchor`

## Parser Behavior

The parser produces block objects with this shape:
```json
{
  "blockName": "core/paragraph",     // Full name WITH core/ prefix
  "attrs": {"align": "center"},      // Parsed JSON from delimiter
  "innerBlocks": [],                  // Array of child block objects
  "innerHTML": "\n<p class=\"has-text-align-center\">Text</p>\n",
  "innerContent": [                   // Mixed array: strings + null markers
    "\n<p class=\"has-text-align-center\">Text</p>\n"
  ]
}
```

For container blocks, `innerContent` uses `null` to mark where inner blocks go:
```json
{
  "blockName": "core/columns",
  "innerContent": [
    "\n<div class=\"wp-block-columns\">",
    null,  // ← first core/column goes here
    "\n\n",
    null,  // ← second core/column goes here
    "</div>\n"
  ]
}
```

Freeform content (non-block HTML) produces:
```json
{
  "blockName": null,
  "attrs": {},
  "innerHTML": "<p>Classic content</p>"
}
```

## Serialization Rules

When converting a block object back to HTML (`serialize_block`), the serializer:

1. Builds the comment attributes JSON (only non-default, non-sourced values)
2. If the JSON is `{}`, omits it entirely
3. Constructs the delimiter string with proper spacing
4. For void blocks: outputs just `<!-- wp:name {attrs} /-->`
5. For balanced blocks: opening delimiter + innerHTML (with innerBlocks re-serialized at null positions) + closing delimiter

Key serialization details:
- JSON uses no trailing commas
- JSON keys are camelCase
- Numbers are unquoted: `{"level":3}` not `{"level":"3"}`
- Boolean values: `{"dropCap":true}`
- Attribute order depends on PHP's associative array order (no explicit sorting)
- Empty string values are included if they differ from default
