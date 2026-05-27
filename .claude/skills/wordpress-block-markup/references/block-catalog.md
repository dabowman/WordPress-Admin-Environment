# Core Block Catalog — Exact Markup Patterns

Every core block's serialized markup for WordPress 6.7/6.8+. Use these as templates.
**S** = static, **D** = dynamic (self-closing), **H** = hybrid, **IB** = has innerBlocks.

## Table of Contents
1. [Text Blocks](#text-blocks)
2. [Media Blocks](#media-blocks)
3. [Design / Layout Blocks](#design--layout-blocks)
4. [Widget Blocks](#widget-blocks)
5. [Theme / Site Blocks](#theme--site-blocks)
6. [Embed Block](#embed-block)
7. [Utility Blocks](#utility-blocks)
8. [Rich Text Inline Formatting](#rich-text-inline-formatting)

---

## Text Blocks

### Paragraph — `core/paragraph` (S)
```html
<!-- wp:paragraph -->
<p>Plain paragraph text.</p>
<!-- /wp:paragraph -->
```
**Key attributes (comment):** `align`, `dropCap`, `backgroundColor`, `textColor`, `fontSize`, `fontFamily`, `gradient`, `style`, `anchor`, `className`
**Sourced:** `content` → `rich-text` from `p` selector

Aligned + drop cap:
```html
<!-- wp:paragraph {"align":"center","dropCap":true} -->
<p class="has-text-align-center has-drop-cap">Lorem ipsum dolor sit amet.</p>
<!-- /wp:paragraph -->
```

With preset colors:
```html
<!-- wp:paragraph {"backgroundColor":"vivid-cyan-blue","textColor":"white"} -->
<p class="has-white-color has-vivid-cyan-blue-background-color has-text-color has-background">Colored text.</p>
<!-- /wp:paragraph -->
```

With custom colors:
```html
<!-- wp:paragraph {"style":{"color":{"text":"#cf2e2e","background":"#fcb900"}}} -->
<p class="has-text-color has-background" style="color:#cf2e2e;background-color:#fcb900">Custom colored.</p>
<!-- /wp:paragraph -->
```

With preset font size:
```html
<!-- wp:paragraph {"fontSize":"large"} -->
<p class="has-large-font-size">Large text.</p>
<!-- /wp:paragraph -->
```

With custom font size:
```html
<!-- wp:paragraph {"style":{"typography":{"fontSize":"22px"}}} -->
<p style="font-size:22px">Custom size text.</p>
<!-- /wp:paragraph -->
```

### Heading — `core/heading` (S)
```html
<!-- wp:heading -->
<h2 class="wp-block-heading">Default H2 heading</h2>
<!-- /wp:heading -->
```
**Key attributes:** `level` (default: 2, omit when 2), `textAlign`, `anchor`, `style`, `fontSize`, `backgroundColor`, `textColor`
**Sourced:** `content` → `rich-text` from `h1`-`h6` selector

Other levels:
```html
<!-- wp:heading {"level":1} -->
<h1 class="wp-block-heading">H1 heading</h1>
<!-- /wp:heading -->

<!-- wp:heading {"textAlign":"center","level":3} -->
<h3 class="wp-block-heading has-text-align-center">Centered H3</h3>
<!-- /wp:heading -->
```

### List — `core/list` (S, IB → `core/list-item`)
```html
<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li>First item</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Second item</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list -->
```
**Key attributes:** `ordered` (boolean), `type` (e.g. "a", "A", "i"), `start`, `reversed`

Ordered:
```html
<!-- wp:list {"ordered":true} -->
<ol class="wp-block-list"><!-- wp:list-item -->
<li>Step one</li>
<!-- /wp:list-item -->

<!-- wp:list-item -->
<li>Step two</li>
<!-- /wp:list-item --></ol>
<!-- /wp:list -->
```

### List Item — `core/list-item` (S, IB → `core/list` for nesting)
```html
<!-- wp:list-item -->
<li>Item content</li>
<!-- /wp:list-item -->
```
Nested list (list-item containing a list):
```html
<!-- wp:list-item -->
<li>Parent item<!-- wp:list -->
<ul class="wp-block-list"><!-- wp:list-item -->
<li>Nested item</li>
<!-- /wp:list-item --></ul>
<!-- /wp:list --></li>
<!-- /wp:list-item -->
```

### Quote — `core/quote` (S, IB)
```html
<!-- wp:quote -->
<blockquote class="wp-block-quote"><!-- wp:paragraph -->
<p>Quoted text goes here.</p>
<!-- /wp:paragraph --><cite>Attribution</cite></blockquote>
<!-- /wp:quote -->
```
**Key attributes:** `className` (e.g. `is-style-large`)
**Sourced:** `citation` → `rich-text` from `cite` selector

### Code — `core/code` (S)
```html
<!-- wp:code -->
<pre class="wp-block-code"><code>function hello() {
  return "world";
}</code></pre>
<!-- /wp:code -->
```
**Sourced:** `content` → `rich-text` from `code` selector

### Preformatted — `core/preformatted` (S)
```html
<!-- wp:preformatted -->
<pre class="wp-block-preformatted">Preformatted text here.</pre>
<!-- /wp:preformatted -->
```

### Pullquote — `core/pullquote` (S)
```html
<!-- wp:pullquote -->
<figure class="wp-block-pullquote"><blockquote><p>Pull quote text.</p><cite>Citation</cite></blockquote></figure>
<!-- /wp:pullquote -->
```

### Verse — `core/verse` (S)
```html
<!-- wp:verse -->
<pre class="wp-block-verse">Line one
Line two
Line three</pre>
<!-- /wp:verse -->
```

### Table — `core/table` (S)
```html
<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></tbody></table></figure>
<!-- /wp:table -->
```
**Key attributes:** `hasFixedLayout` (default: true), `className` (e.g. `is-style-stripes`)

With caption:
```html
<!-- wp:table -->
<figure class="wp-block-table"><table class="has-fixed-layout"><tbody><tr><td>Data</td></tr></tbody></table><figcaption class="wp-element-caption">Table caption</figcaption></figure>
<!-- /wp:table -->
```

### Details — `core/details` (S, IB)
```html
<!-- wp:details -->
<details class="wp-block-details"><summary>Summary text</summary><!-- wp:paragraph -->
<p>Hidden content shown when expanded.</p>
<!-- /wp:paragraph --></details>
<!-- /wp:details -->
```
**Key attributes:** `showContent` (boolean, if initially open)

### Footnotes — `core/footnotes` (D)
```html
<!-- wp:footnotes /-->
```
Auto-inserted at the end of a post when footnotes are used. Renders the footnote list dynamically. Not manually insertable (`inserter: false`). Footnote anchors in text look like: `<a class="fn" href="#footnote-1" id="footnote-anchor-1"><sup>1</sup></a>`

### Classic / Freeform — `core/freeform` (S)
```html
<!-- wp:freeform -->
<p>Raw HTML content, no wrapper element.</p>
<!-- /wp:freeform -->
```

---

## Media Blocks

### Image — `core/image` (H)
```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo-1024x683.jpg" alt="Alt text" class="wp-image-42"/></figure>
<!-- /wp:image -->
```
**Key attributes (comment):** `id`, `sizeSlug`, `linkDestination` ("none"|"media"|"attachment"|"custom"), `align`, `width`, `height`, `aspectRatio`, `scale`, `className`, `style`
**Sourced:** `url` → attribute `src` on `img`, `alt` → attribute `alt` on `img`, `caption` → rich-text from `figcaption`

With caption:
```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42"/><figcaption class="wp-element-caption">Caption text</figcaption></figure>
<!-- /wp:image -->
```

With link wrapping:
```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"custom"} -->
<figure class="wp-block-image size-large"><a href="https://example.com"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42"/></a></figure>
<!-- /wp:image -->
```

Aligned:
```html
<!-- wp:image {"align":"center","id":42,"sizeSlug":"full","linkDestination":"none"} -->
<figure class="wp-block-image aligncenter size-full"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42"/></figure>
<!-- /wp:image -->
```

Rounded style:
```html
<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none","className":"is-style-rounded"} -->
<figure class="wp-block-image size-large is-style-rounded"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42"/></figure>
<!-- /wp:image -->
```

### Gallery — `core/gallery` (S, IB → `core/image`)
```html
<!-- wp:gallery {"linkTo":"none"} -->
<figure class="wp-block-gallery has-nested-images columns-default is-cropped"><!-- wp:image {"id":10,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/img1.jpg" alt="" class="wp-image-10"/></figure>
<!-- /wp:image -->

<!-- wp:image {"id":11,"sizeSlug":"large","linkDestination":"none"} -->
<figure class="wp-block-image size-large"><img src="https://example.com/img2.jpg" alt="" class="wp-image-11"/></figure>
<!-- /wp:image --></figure>
<!-- /wp:gallery -->
```
**Key attributes:** `columns`, `linkTo`, `imageCrop` (→ `is-cropped` class)

### Audio — `core/audio` (S)
```html
<!-- wp:audio {"id":50} -->
<figure class="wp-block-audio"><audio controls src="https://example.com/audio.mp3"></audio></figure>
<!-- /wp:audio -->
```

### Video — `core/video` (S)
```html
<!-- wp:video {"id":60} -->
<figure class="wp-block-video"><video controls src="https://example.com/video.mp4"></video></figure>
<!-- /wp:video -->
```
**Key attributes:** `autoplay`, `loop`, `muted`, `playsInline`, `preload`, `poster`

### Cover — `core/cover` (S, IB)
```html
<!-- wp:cover {"url":"https://example.com/bg.jpg","id":42,"dimRatio":50,"overlayColor":"black"} -->
<div class="wp-block-cover"><span aria-hidden="true" class="wp-block-cover__background has-black-background-color has-background-dim"></span><img class="wp-block-cover__image-background wp-image-42" alt="" src="https://example.com/bg.jpg" data-object-fit="cover"/><div class="wp-block-cover__inner-container"><!-- wp:paragraph {"align":"center","fontSize":"large"} -->
<p class="has-text-align-center has-large-font-size">Cover Heading</p>
<!-- /wp:paragraph --></div></div>
<!-- /wp:cover -->
```
**Key attributes:** `url`, `id`, `dimRatio` (default: **100** — full overlay; omit if 100), `overlayColor`, `customOverlayColor`, `focalPoint`, `minHeight`, `isDark` (default: true), `isUserOverlayColor`

With gradient overlay:
```html
<!-- wp:cover {"dimRatio":100,"gradient":"vivid-cyan-blue-to-vivid-purple"} -->
<div class="wp-block-cover"><span aria-hidden="true" class="wp-block-cover__background has-background-dim-100 has-background-dim has-vivid-cyan-blue-to-vivid-purple-gradient-background"></span><div class="wp-block-cover__inner-container"><!-- wp:paragraph -->
<p>Content on gradient.</p>
<!-- /wp:paragraph --></div></div>
<!-- /wp:cover -->
```

### File — `core/file` (S/H)
```html
<!-- wp:file {"id":70,"href":"https://example.com/doc.pdf"} -->
<div class="wp-block-file"><a id="wp-block-file--media-70" href="https://example.com/doc.pdf">Document Name</a><a href="https://example.com/doc.pdf" class="wp-block-file__button wp-element-button" download>Download</a></div>
<!-- /wp:file -->
```

### Media & Text — `core/media-text` (S, IB)
```html
<!-- wp:media-text {"mediaId":42,"mediaLink":"https://example.com/photo.jpg","mediaType":"image"} -->
<div class="wp-block-media-text is-stacked-on-mobile"><figure class="wp-block-media-text__media"><img src="https://example.com/photo.jpg" alt="" class="wp-image-42 size-full"/></figure><div class="wp-block-media-text__content"><!-- wp:paragraph -->
<p>Text beside the media.</p>
<!-- /wp:paragraph --></div></div>
<!-- /wp:media-text -->
```
**Key attributes:** `mediaPosition` ("left"|"right"), `mediaWidth` (default 50), `isStackedOnMobile`, `verticalAlignment`

---

## Design / Layout Blocks

### Group — `core/group` (S, IB)

Default (constrained layout):
```html
<!-- wp:group {"layout":{"type":"constrained"}} -->
<div class="wp-block-group"><!-- wp:paragraph -->
<p>Group content.</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
```

**Row variation** (horizontal flex):
```html
<!-- wp:group {"layout":{"type":"flex","flexWrap":"nowrap"}} -->
<div class="wp-block-group"><!-- wp:paragraph -->
<p>Item 1</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Item 2</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
```

**Stack variation** (vertical flex):
```html
<!-- wp:group {"layout":{"type":"flex","orientation":"vertical"}} -->
<div class="wp-block-group"><!-- wp:paragraph -->
<p>Stacked item 1</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Stacked item 2</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
```

**Grid variation**:
```html
<!-- wp:group {"layout":{"type":"grid","minimumColumnWidth":"12rem"}} -->
<div class="wp-block-group"><!-- wp:paragraph -->
<p>Grid cell 1</p>
<!-- /wp:paragraph -->

<!-- wp:paragraph -->
<p>Grid cell 2</p>
<!-- /wp:paragraph --></div>
<!-- /wp:group -->
```

**Custom tag name** (`tagName` attribute):
```html
<!-- wp:group {"tagName":"section","layout":{"type":"constrained"}} -->
<section class="wp-block-group"><!-- wp:paragraph -->
<p>Section content.</p>
<!-- /wp:paragraph --></section>
<!-- /wp:group -->
```
Valid tagName values: `div` (default), `main`, `section`, `aside`, `header`, `footer`, `article`

### Columns — `core/columns` (S, IB → `core/column`)
```html
<!-- wp:columns -->
<div class="wp-block-columns"><!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Column 1</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->

<!-- wp:column -->
<div class="wp-block-column"><!-- wp:paragraph -->
<p>Column 2</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column --></div>
<!-- /wp:columns -->
```
**Key attributes:** `isStackedOnMobile` (default true), `verticalAlignment`

### Column — `core/column` (S, IB, parent: `core/columns`)
```html
<!-- wp:column {"width":"33.33%"} -->
<div class="wp-block-column" style="flex-basis:33.33%"><!-- wp:paragraph -->
<p>Content</p>
<!-- /wp:paragraph --></div>
<!-- /wp:column -->
```
**Key attributes:** `width` → `style="flex-basis:{width}"`, `verticalAlignment`

### Buttons — `core/buttons` (S, IB → `core/button`)
```html
<!-- wp:buttons -->
<div class="wp-block-buttons"><!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://example.com">Click Me</a></div>
<!-- /wp:button --></div>
<!-- /wp:buttons -->
```
**Key attributes on buttons:** `layout` (for justification)

### Button — `core/button` (S, parent: `core/buttons`)
```html
<!-- wp:button -->
<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="https://example.com">Button Text</a></div>
<!-- /wp:button -->
```

As `<button>` element (via `tagName`):
```html
<!-- wp:button {"tagName":"button"} -->
<div class="wp-block-button"><button class="wp-block-button__link wp-element-button" type="button">Submit</button></div>
<!-- /wp:button -->
```

Outline style:
```html
<!-- wp:button {"className":"is-style-outline"} -->
<div class="wp-block-button is-style-outline"><a class="wp-block-button__link wp-element-button" href="https://example.com">Outline</a></div>
<!-- /wp:button -->
```

With colors:
```html
<!-- wp:button {"backgroundColor":"vivid-cyan-blue","textColor":"white"} -->
<div class="wp-block-button"><a class="wp-block-button__link has-white-color has-vivid-cyan-blue-background-color has-text-color has-background wp-element-button" href="https://example.com">Colored</a></div>
<!-- /wp:button -->
```
**Note:** Color classes go on the `<a>` element, not the wrapper `<div>`.

**Key attributes:** `tagName` ("a" default, "button"), `url` (sourced), `text` (sourced from `a,button`), `linkTarget`, `rel`, `width` (25|50|75|100 → class `has-custom-width wp-block-button__width-{n}`)
**Note:** Color classes go on the inner `<a>` or `<button>` element, not the wrapper `<div>`.

### Separator — `core/separator` (S)
```html
<!-- wp:separator -->
<hr class="wp-block-separator has-alpha-channel-opacity"/>
<!-- /wp:separator -->
```
**Key attributes:** `opacity` (default: `"alpha-channel"` → `has-alpha-channel-opacity` class), `tagName` (`"hr"` default or `"div"`), `className`

Wide style:
```html
<!-- wp:separator {"className":"is-style-wide"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-wide"/>
<!-- /wp:separator -->
```

Dots style:
```html
<!-- wp:separator {"className":"is-style-dots"} -->
<hr class="wp-block-separator has-alpha-channel-opacity is-style-dots"/>
<!-- /wp:separator -->
```

### Spacer — `core/spacer` (S)
```html
<!-- wp:spacer {"height":"50px"} -->
<div style="height:50px" aria-hidden="true" class="wp-block-spacer"></div>
<!-- /wp:spacer -->
```

### More — `core/more` (S)
```html
<!-- wp:more -->
<!--more-->
<!-- /wp:more -->
```

With custom text:
```html
<!-- wp:more {"customText":"Continue reading"} -->
<!--more Continue reading-->
<!-- /wp:more -->
```

### Page Break — `core/nextpage` (S)
```html
<!-- wp:nextpage /-->
```

---

## Widget Blocks

All widget blocks are **dynamic** (server-rendered) and use **self-closing** delimiters. They save no HTML to post_content.

### Shortcode — `core/shortcode` (S)
```html
<!-- wp:shortcode -->
[contact-form-7 id="123" title="Contact"]
<!-- /wp:shortcode -->
```
Note: shortcode stores raw shortcode text between balanced delimiters (not self-closing).

### Custom HTML — `core/html` (S)
```html
<!-- wp:html -->
<div class="custom-html">Any HTML here</div>
<!-- /wp:html -->
```

### Archives — `core/archives` (D)
```html
<!-- wp:archives /-->
<!-- wp:archives {"displayAsDropdown":true,"showPostCounts":true} /-->
```

### Calendar — `core/calendar` (D)
```html
<!-- wp:calendar /-->
```

### Categories — `core/categories` (D)
```html
<!-- wp:categories /-->
<!-- wp:categories {"displayAsDropdown":true,"showHierarchy":true,"showPostCounts":true} /-->
```

### Latest Comments — `core/latest-comments` (D)
```html
<!-- wp:latest-comments /-->
<!-- wp:latest-comments {"commentsToShow":3,"displayAvatar":false} /-->
```

### Latest Posts — `core/latest-posts` (D)
```html
<!-- wp:latest-posts /-->
<!-- wp:latest-posts {"postsToShow":4,"displayPostDate":true,"displayFeaturedImage":true,"featuredImageSizeSlug":"medium","excerptLength":20} /-->
```

### Page List — `core/page-list` (D)
```html
<!-- wp:page-list /-->
```

### RSS — `core/rss` (D)
```html
<!-- wp:rss {"feedURL":"https://example.com/feed","itemsToShow":5} /-->
```

### Search — `core/search` (D)
```html
<!-- wp:search {"label":"Search","showLabel":false,"buttonText":"Search"} /-->
```

### Social Links — `core/social-links` (S, IB → `core/social-link`)
```html
<!-- wp:social-links -->
<ul class="wp-block-social-links"><!-- wp:social-link {"url":"https://twitter.com/user","service":"twitter"} /-->

<!-- wp:social-link {"url":"https://github.com/user","service":"github"} /-->

<!-- wp:social-link {"url":"mailto:user@example.com","service":"mail"} /--></ul>
<!-- /wp:social-links -->
```
**Key attributes on social-links:** `iconColor`, `iconColorValue`, `iconBackgroundColor`, `iconBackgroundColorValue`, `size` (has-small-icon-size, has-normal-icon-size, has-large-icon-size, has-huge-icon-size), `className` (e.g. `is-style-logos-only`, `is-style-pill-shape`)

### Tag Cloud — `core/tag-cloud` (D)
```html
<!-- wp:tag-cloud /-->
<!-- wp:tag-cloud {"taxonomy":"post_tag","showTagCounts":true} /-->
```

---

## Theme / Site Blocks

All theme blocks are **dynamic** and **self-closing**.

### Site Identity
```html
<!-- wp:site-title /-->
<!-- wp:site-tagline /-->
<!-- wp:site-logo {"width":120} /-->
```

### Navigation
```html
<!-- wp:navigation {"ref":456} /-->
```
Navigation is complex — it references a `wp_navigation` post by ID. Inline navigation (without ref) uses inner blocks:
```html
<!-- wp:navigation -->
<!-- wp:navigation-link {"label":"Home","url":"/","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-link {"label":"About","url":"/about","kind":"custom","isTopLevelLink":true} /-->
<!-- wp:navigation-submenu {"label":"Services","url":"/services","kind":"custom","isTopLevelLink":true} -->
<!-- wp:navigation-link {"label":"Design","url":"/services/design","kind":"custom"} /-->
<!-- wp:navigation-link {"label":"Development","url":"/services/dev","kind":"custom"} /-->
<!-- /wp:navigation-submenu -->
<!-- wp:home-link /-->
<!-- /wp:navigation -->
```

### Query Loop
```html
<!-- wp:query {"queryId":0,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","author":"","search":"","exclude":[],"sticky":"","inherit":true}} -->
<div class="wp-block-query"><!-- wp:post-template -->
<!-- wp:post-title {"isLink":true} /-->
<!-- wp:post-excerpt /-->
<!-- wp:post-date /-->
<!-- /wp:post-template -->

<!-- wp:query-pagination -->
<div class="wp-block-query-pagination"><!-- wp:query-pagination-previous /-->
<!-- wp:query-pagination-numbers /-->
<!-- wp:query-pagination-next /--></div>
<!-- /wp:query-pagination -->

<!-- wp:query-no-results -->
<!-- wp:paragraph -->
<p>No posts found.</p>
<!-- /wp:paragraph -->
<!-- /wp:query-no-results --></div>
<!-- /wp:query -->
```

### Individual Post Data Blocks
```html
<!-- wp:post-title /-->
<!-- wp:post-title {"isLink":true,"level":2} /-->
<!-- wp:post-content /-->
<!-- wp:post-excerpt {"moreText":"Read more"} /-->
<!-- wp:post-date /-->
<!-- wp:post-date {"format":"F j, Y"} /-->
<!-- wp:post-featured-image {"isLink":true,"aspectRatio":"16/9"} /-->
<!-- wp:post-author /-->
<!-- wp:post-author-name {"isLink":true} /-->
<!-- wp:post-terms {"term":"category"} /-->
<!-- wp:post-terms {"term":"post_tag"} /-->
<!-- wp:read-more {"content":"Continue reading"} /-->
<!-- wp:post-author-biography /-->
<!-- wp:post-navigation-link /-->
<!-- wp:post-navigation-link {"type":"previous","label":"Previous Post"} /-->
```
**`post-navigation-link` key attributes:** `type` ("next" default, "previous"), `label`, `showTitle` (boolean), `linkLabel` (boolean), `arrow` ("none"|"arrow"|"chevron")

### Query Title — `core/query-title` (D)
```html
<!-- wp:query-title {"type":"archive"} /-->
```
Displays the title for archive/search/taxonomy views dynamically.
**Key attributes:** `type` ("archive"|"search"), `textAlign`, `level` (default 1)

### Query Total — `core/query-total` (D)
```html
<!-- wp:query-total /-->
```
Shows total result count inside a query loop (WP 6.8+). Must be an ancestor of `core/query`.

### Term Description — `core/term-description` (D)
```html
<!-- wp:term-description /-->
```
Displays the description of the current taxonomy term on archive pages.

### Template Parts
```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

### Comments Title — `core/comments-title` (D)
```html
<!-- wp:comments-title /-->
<!-- wp:comments-title {"level":3,"showPostTitle":false,"showCommentsCount":true} /-->
```
Displays "X comments on Post Title" dynamically. Must be inside `core/comments`.
**Key attributes:** `level` (default 2), `showPostTitle` (default true), `showCommentsCount` (default true), `textAlign`

### Comments
```html
<!-- wp:comments -->
<div class="wp-block-comments"><!-- wp:comments-title /-->
<!-- wp:comment-template -->
<!-- wp:comment-author-name /-->
<!-- wp:comment-date /-->
<!-- wp:comment-content /-->
<!-- wp:comment-reply-link /-->
<!-- wp:comment-edit-link /-->
<!-- /wp:comment-template -->
<!-- wp:comments-pagination -->
<!-- wp:comments-pagination-previous /-->
<!-- wp:comments-pagination-numbers /-->
<!-- wp:comments-pagination-next /-->
<!-- /wp:comments-pagination --></div>
<!-- /wp:comments -->
```

### Other Theme Blocks
```html
<!-- wp:loginout /-->
<!-- wp:avatar {"size":96} /-->
<!-- wp:post-comments-form /-->
```

---

## Embed Block

### `core/embed` — single block with provider variations

Base pattern:
```html
<!-- wp:embed {"url":"https://...","type":"video","providerNameSlug":"youtube","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">
https://www.youtube.com/watch?v=dQw4w9WgXcQ
</div></figure>
<!-- /wp:embed -->
```

**CSS class pattern:** `wp-block-embed is-type-{type} is-provider-{slug} wp-block-embed-{slug} [aspect-ratio-classes]`

**Key attributes:** `url`, `type` ("video"|"rich"|"photo"|"link"), `providerNameSlug`, `responsive`, `className`, `caption`

**Common providers and types:**
| Provider | providerNameSlug | type |
|----------|-----------------|------|
| YouTube | `youtube` | `video` |
| Vimeo | `vimeo` | `video` |
| Twitter/X | `twitter` | `rich` |
| Spotify | `spotify` | `rich` |
| SoundCloud | `soundcloud` | `rich` |
| TikTok | `tiktok` | `video` |
| Instagram | `instagram` | `rich` |
| Reddit | `reddit` | `rich` |
| Bluesky | `bluesky` | `rich` |
| WordPress | `wordpress` | `rich` |

With caption:
```html
<!-- wp:embed {"url":"https://vimeo.com/12345","type":"video","providerNameSlug":"vimeo"} -->
<figure class="wp-block-embed is-type-video is-provider-vimeo wp-block-embed-vimeo"><div class="wp-block-embed__wrapper">
https://vimeo.com/12345
</div><figcaption class="wp-element-caption">Video caption</figcaption></figure>
<!-- /wp:embed -->
```

---

## Utility Blocks

### Synced Pattern (Reusable Block) — `core/block` (D)
```html
<!-- wp:block {"ref":123} /-->
```
Content lives in a `wp_block` post type entry. Only the `ref` (post ID) is stored.

### Pattern Placeholder — `core/pattern`
```html
<!-- wp:pattern {"slug":"theme-name/pattern-slug"} /-->
```
Expanded at render time.

### Missing Block — `core/missing`
Internal only. Stores `originalName` and `originalContent` for unrecognized blocks.

---

## Rich Text Inline Formatting

Use these within any rich-text content (`<p>`, `<h2>`, `<li>`, etc.):

```html
<strong>Bold</strong>
<em>Italic</em>
<s>Strikethrough</s>
<a href="https://example.com">Link</a>
<a href="https://example.com" target="_blank" rel="noreferrer noopener">New tab link</a>
<code>Inline code</code>
<kbd>Keyboard input</kbd>
<sup>Superscript</sup>
<sub>Subscript</sub>
<mark style="background-color:#fcb900" class="has-inline-color has-luminous-vivid-amber-color">Highlight</mark>
<img class="wp-image-42" style="width:150px" src="https://example.com/inline.jpg" alt="Inline image"/>
```

### Language/direction marks
```html
<bdo dir="rtl">Right-to-left text</bdo>
<bdi>Bidirectional isolate</bdi>
```

### Footnotes (WP 6.3+)
Footnotes are stored as rich-text anchors and rendered by `core/footnotes`:
```html
<p>Text with a footnote<a class="fn" href="#footnote-1" id="footnote-anchor-1"><sup>1</sup></a>.</p>
```
The `core/footnotes` block at the end of the post renders them dynamically.
