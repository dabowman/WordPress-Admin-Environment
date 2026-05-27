# Block attributes and data sources

Block attributes are the *structured-data contract* of a block: a JSON-Schema-like declaration in `block.json` that the parser reconstructs from saved HTML on load and the serializer roundtrips back into `post_content` on save.

## `type` — JSON Schema primitives

Legal: `"string"`, `"boolean"`, `"integer"`, `"number"`, `"object"`, `"array"`, `"null"`. Combine with `enum` for allowed literals. If the saved value fails validation, the attribute falls back to `default`.

## `source` — where the value lives

| `source` | Stored where | Required fields | Since |
|---|---|---|---|
| *(omitted)* | Block comment delimiter JSON | — | 5.0 |
| `"attribute"` | Named HTML attribute | `selector` (opt), `attribute` | 5.0 |
| `"text"` | `textContent` of selector match | `selector` (opt) | 5.0 |
| `"html"` | `innerHTML` of selector match | `selector`, `multiline` (opt) | 5.0 |
| `"query"` | Array of sub-parsed matches | `selector`, `query` | 5.0 |
| `"raw"` | Full innerHTML of block root | — | 5.0 |
| `"rich-text"` | `RichTextData` instance | `selector` (opt) | 6.5 stable |

**Removed/legacy:**
- `"meta"` — **REMOVED in 6.5.** Use Block Bindings (see `block-bindings.md`).
- `"children"` / `"node"` — deprecated long ago.

## Canonical declaration

```json
{
  "attributes": {
    "url":     { "type": "string",   "source": "attribute", "selector": "img", "attribute": "src" },
    "alt":     { "type": "string",   "source": "attribute", "selector": "img", "attribute": "alt", "default": "" },
    "caption": { "type": "rich-text","source": "rich-text","selector": "figcaption" },
    "content": { "type": "string",   "source": "html",     "selector": "p", "role": "content" },
    "items":   {
      "type": "array", "source": "query", "selector": "li.item",
      "query": {
        "href":  { "type": "string", "source": "attribute", "selector": "a", "attribute": "href" },
        "label": { "type": "string", "source": "text", "selector": "a" }
      },
      "default": []
    },
    "settings": { "type": "object", "default": { "columns": 3 } },
    "blobUrl":  { "type": "string", "role": "local" }
  }
}
```

## `role: "content"` vs `role: "local"` (stable WP 6.7)

- **`role: "content"`** — designates the attribute as user-editable content. Honored by content-only locking, write mode, and (WP 7.0) the relaxed `canInsertBlockType` rule that permits inserting `role:"content"` blocks inside `templateLock:"contentOnly"` containers.
- **`role: "local"`** — transient; the serializer skips it. Use for blob URLs during upload, ephemeral UI state.

## Static `save()` vs dynamic render

### Static — `save.js` emits HTML the parser reads back

```js
import { useBlockProps, RichText } from '@wordpress/block-editor';
export default function save( { attributes } ) {
  return (
    <figure { ...useBlockProps.save() }>
      <img src={ attributes.url } alt={ attributes.alt } />
      <RichText.Content tagName="figcaption" value={ attributes.caption } />
    </figure>
  );
}
```

### Dynamic — `save()` returns `null`; `render.php` renders server-side

```php
// render.php — receives $attributes, $content, $block (WP_Block)
$post_id = $block->context['postId'] ?? get_the_ID();
printf(
  '<div %s><h2>%s</h2>%s</div>',
  get_block_wrapper_attributes(),
  esc_html( $attributes['title'] ?? '' ),
  wp_kses_post( $content )
);
```

Dynamic rendering is required when:
- Output depends on block context (post ID, query, etc).
- Output depends on values that change between save and render (counts, current user, options).
- The block participates in block bindings whose values must be resolved server-side.

## `register_post_meta` — full signature

```php
register_post_meta( 'post', 'subtitle', array(
  'type'              => 'string',
  'single'            => true,                   // REQUIRED for bindings
  'default'           => '',
  'sanitize_callback' => 'sanitize_text_field',
  'auth_callback'     => fn () => current_user_can( 'edit_posts' ),
  'show_in_rest'      => true,                   // REQUIRED for binding/editor
  'revisions_enabled' => true,                   // 6.4+
  'label'             => __( 'Subtitle', 'td' ), // 6.7+
) );
```

Object/array meta require an explicit schema:

```php
register_post_meta( 'post', 'coords', array(
  'type' => 'object', 'single' => true,
  'show_in_rest' => array( 'schema' => array(
    'type' => 'object',
    'properties' => array(
      'lat' => array( 'type' => 'number' ),
      'lng' => array( 'type' => 'number' ),
    ),
  ) ),
) );
```

**Protected keys** (leading `_`) require an explicit `auth_callback`. Use `register_meta` for user/term/comment meta. Site options need `register_setting` (see `core-data-entities.md`).

## Why `source: 'meta'` was removed

The legacy `source: 'meta'` wrote through post meta on every `setAttributes` — bypassing sanitization, conflicting with undo, and racing REST saves. Replaced in 6.5 by **Block Bindings** (`block-bindings.md`), which resolve meta values declaratively and route writes through the proper entity pipeline.

For legacy blocks, supply a `deprecated` migration mapping the old attribute to:

```js
metadata: {
  bindings: {
    <attr>: { source: 'core/post-meta', args: { key: '<old_meta_key>' } }
  }
}
```
