# WordPress Core Blocks Catalog

**Purpose:** Comprehensive reference for WordPress 7.0+ core blocks. Use this to determine if a core block can solve your need before building custom.

## Decision Framework

```
Need a feature?
  1. Can a core block do this? → Check this catalog
  2. Can I extend a core block? → See block-extensions.md
  3. Can I combine core blocks in a pattern? → Use synced patterns
  4. Must I build custom? → See SKILL.md for workflows
```

## Text Blocks

### Paragraph
**Slug:** `core/paragraph`  
**Use for:** All body text, descriptions, general content  
**Capabilities:**
- Drop cap support
- Text alignment (left, center, right, justify)
- Full typography controls (font family, size, line height, letter spacing)
- Color (text, background, link)
- Spacing (margin, padding)
- Border, shadow support
**When to extend:** Add schema.org markup, reading time indicators, word count

### Heading
**Slug:** `core/heading`  
**Levels:** H1-H6  
**Capabilities:**
- Text alignment
- Typography controls
- Anchor generation for table of contents
- Color (text, background, gradient)
**When to extend:** Auto-generate anchor IDs, add decorative elements

### List
**Slug:** `core/list`  
**Types:** Ordered, unordered  
**Inner blocks:** `core/list-item`  
**Capabilities:**
- Nested lists
- Typography and spacing controls
- Custom markers via CSS
**When to extend:** Add custom icons, interactive checkboxes, filterable lists

### List Item
**Slug:** `core/list-item`  
**Use:** Individual item within `core/list`

### Quote
**Slug:** `core/quote`  
**Capabilities:**
- Citation support
- Typography and color controls
- Alignment options
**When to extend:** Pull quotes with author avatars, testimonial variations

### Code
**Slug:** `core/code`  
**Capabilities:**
- Preserves formatting and whitespace
- Monospace typography
**When to extend:** Syntax highlighting, copy button, language indicators

### Preformatted
**Slug:** `core/preformatted`  
**Capabilities:**
- Similar to code but for plain text
**When to extend:** ASCII art, terminal output styling

### Pullquote
**Slug:** `core/pullquote`  
**Capabilities:**
- Large emphasized quotes
- Border styling
- Citation
**When to extend:** Magazine-style layouts, interview highlights

### Verse
**Slug:** `core/verse`  
**Capabilities:**
- Preserves line breaks and whitespace
- Typography and color controls
**When to use:** Poetry, lyrics, any content where line breaks matter

### Table
**Slug:** `core/table`  
**Capabilities:**
- Header and footer sections
- Fixed or auto column width
- Stripe styling
- Typography, color, border, spacing controls
**When to extend:** Sortable columns, responsive collapse, data import

### Footnotes
**Slug:** `core/footnotes`  
**Capabilities:**
- Linked footnote references in text
- Auto-numbered footnote list
**When to use:** Academic content, citations, annotations

### Math
**Slug:** `core/math`  
**Capabilities:**
- LaTeX mathematical notation display
**When to use:** Mathematical formulas, equations, scientific content

## Media Blocks

### Image
**Slug:** `core/image`  
**Capabilities:**
- Responsive sizing
- Alignment (left, center, right, wide, full)
- Link wrapping
- Caption support
- Alt text
- Duotone filters
- Border, shadow
- Aspect ratio control
- Lightbox support
**When to extend:** Image comparison sliders, custom lightbox behavior

### Gallery
**Slug:** `core/gallery`  
**Capabilities:**
- Multiple column layouts
- Image cropping
- Captions per image
- Link to media file or attachment page
**When to extend:** Masonry layouts, filterable galleries, slideshow mode

### Video
**Slug:** `core/video`  
**Capabilities:**
- Upload or embed
- Autoplay, loop, muted controls
- Caption support
**When to extend:** Custom player skins, chapter markers, transcripts

### Audio
**Slug:** `core/audio`  
**Capabilities:**
- Upload or embed
- Autoplay, loop, preload controls
**When to extend:** Playlist functionality, waveform visualization

### File
**Slug:** `core/file`  
**Capabilities:**
- Download button
- File size display
- Custom button text
**When to extend:** File preview, download tracking, access restrictions

### Media & Text
**Slug:** `core/media-text`  
**Capabilities:**
- Image/video on left or right
- Vertical alignment options
- Image fill or contain
- Mobile stacking
**When to extend:** Parallax effects, video backgrounds

### Cover
**Slug:** `core/cover`  
**Capabilities:**
- Image or video background
- Overlay opacity and color
- Inner blocks support
- Parallax scrolling option
- Focal point picker
**When to extend:** Ken Burns effect, multiple background layers

### Icon
**Slug:** `core/icon`  
**WordPress version:** 7.0+  
**Capabilities:**
- Insert SVG icons from the Icons Registry
- Width control via `dimensions.width` support
- Color, spacing controls
**When to use:** Decorative icons, feature indicators, visual markers
**Related:** Uses `WP_Icons_Registry` and REST API endpoint for icon management

## Design Blocks

### Group
**Slug:** `core/group`  
**Capabilities:**
- Container for other blocks
- Background color, gradient, image
- Layout options (flow, constrained, flex, grid)
- Border, shadow
- Spacing controls
- **Variations:** Row (horizontal flex), Stack (vertical flex)
**When to use:** Sectioning content, applying shared styles, semantic HTML structure
**When to extend:** Tabs, accordions, carousels

> **Note:** `core/group` has built-in variations for Row and Stack layouts. Select Group and switch layout type — no separate blocks needed.

### Columns
**Slug:** `core/columns`  
**Capabilities:**
- 2-6 column layouts
- Variable column widths
- Responsive stacking
- Vertical alignment
**When to extend:** CSS Grid layouts, masonry columns

### Column
**Slug:** `core/column`  
**Capabilities:**
- Individual column within columns block
- Width percentage control
- Vertical alignment
**When to extend:** Sticky columns, overflow handling

### Spacer
**Slug:** `core/spacer`  
**Capabilities:**
- Adjustable height
- Simple vertical spacing
**When to use:** Quick spacing between sections
**Alternative:** Use margin/padding on Group blocks for more control

### Separator
**Slug:** `core/separator`  
**Capabilities:**
- Horizontal rule
- Wide and full width options
- Color control
**When to extend:** Decorative dividers, section breaks with icons

### Buttons
**Slug:** `core/buttons`  
**Capabilities:**
- Container for button blocks
- Horizontal and vertical layouts
- Alignment options
**When to use:** Call-to-action groups, form actions

### Button
**Slug:** `core/button`  
**Capabilities:**
- Link with text
- Border radius
- Fill or outline styles
- Width control (25%, 50%, 75%, 100%)
- Color, gradient backgrounds
**When to extend:** Icon buttons, loading states, multi-step forms

### Details
**Slug:** `core/details`  
**Capabilities:**
- Collapsible content using `<details>`/`<summary>` HTML
- Summary and content sections
**When to use:** FAQ sections, progressive disclosure
**When to extend:** Animated reveals

### Accordion
**Slug:** `core/accordion`  
**WordPress version:** 7.0+  
**Inner blocks:** `core/accordion-item`  
**Capabilities:**
- Multiple collapsible sections
- Auto-close other sections option
- Icon positioning
- Heading level control
**When to use:** FAQ sections, multi-section collapsible content

### Accordion Item
**Slug:** `core/accordion-item`  
**Inner blocks:** `core/accordion-heading`, `core/accordion-panel`

### Accordion Heading
**Slug:** `core/accordion-heading`  
**Use:** Heading child of accordion-item

### Accordion Panel
**Slug:** `core/accordion-panel`  
**Use:** Content panel of accordion-item

## Theme Blocks

### Site Logo
**Slug:** `core/site-logo`  
**Capabilities:**
- Displays site logo from Customizer
- Width control
- Link to homepage
**When to extend:** Multiple logo variations (light/dark mode)

### Site Title
**Slug:** `core/site-title`  
**Capabilities:**
- Displays site name
- Typography controls
- Optional link to homepage
**When to extend:** Animated titles, tagline integration

### Site Tagline
**Slug:** `core/site-tagline`  
**Capabilities:**
- Displays site description
- Typography controls

### Navigation
**Slug:** `core/navigation`  
**Capabilities:**
- Responsive menu system
- Nested submenus
- Overlay menu option
- Icon display
- Search integration
**Inner blocks:** `core/navigation-link`, `core/navigation-submenu`, `core/page-list`, `core/home-link`
**When to extend:** Mega menus, mobile-specific navigation

### Navigation Link
**Slug:** `core/navigation-link`  
**Capabilities:**
- Individual menu item
- Custom URL and label
- Open in new tab option

### Navigation Submenu
**Slug:** `core/navigation-submenu`  
**Use:** Submenu container within navigation

### Navigation Overlay Close
**Slug:** `core/navigation-overlay-close`  
**WordPress version:** 7.0+  
**Capabilities:**
- Custom close button for navigation overlays
- Display modes: icon, text, or both
**When to use:** Custom overlay template parts for navigation

### Home Link
**Slug:** `core/home-link`  
**Use:** Home link within navigation

### Template Part
**Slug:** `core/template-part`  
**Capabilities:**
- Reusable template sections (header, footer, sidebar)
- Area designation
**When to use:** Shared site structure elements

### Post Title
**Slug:** `core/post-title`  
**Capabilities:**
- Dynamic post/page title
- Link option
- Typography controls
**Use in:** Query Loop, template parts

### Post Content
**Slug:** `core/post-content`  
**Capabilities:**
- Outputs full post content
- Respects block markup
**Use in:** Single post templates

### Post Excerpt
**Slug:** `core/post-excerpt`  
**Capabilities:**
- Manual or auto-generated excerpt
- Custom "Read more" text
- Word count control

### Post Featured Image
**Slug:** `core/post-featured-image`  
**Capabilities:**
- Dynamic featured image
- Size selection
- Duotone, border, shadow
- Link options

### Post Date
**Slug:** `core/post-date`  
**Capabilities:**
- Published or modified date
- Custom date format
- Time option

### Post Author
**Slug:** `core/post-author`  
**Capabilities:**
- Author name, avatar, bio
- Byline layouts
**Related blocks:** `core/post-author-name`, `core/post-author-biography`, `core/avatar`

### Post Author Name
**Slug:** `core/post-author-name`  
**Use:** Author name display (standalone)

### Post Author Biography
**Slug:** `core/post-author-biography`  
**Use:** Author bio text (standalone)

### Avatar
**Slug:** `core/avatar`  
**Capabilities:**
- User avatar display
- Size control
- Border radius

### Post Terms
**Slug:** `core/post-terms`  
**Capabilities:**
- Display post categories, tags, or custom taxonomy terms
- Separator control
- Link to term archives

### Post Time to Read
**Slug:** `core/post-time-to-read`  
**Capabilities:**
- Estimated reading time

### Post Navigation Link
**Slug:** `core/post-navigation-link`  
**Capabilities:**
- Previous/next post links
- Arrow display
- Label customization

### Post Comments Count
**Slug:** `core/post-comments-count`  
**Use:** Display comment count for a post

### Post Comments Form
**Slug:** `core/post-comments-form`  
**Use:** Comment submission form

### Post Comments Link
**Slug:** `core/post-comments-link`  
**Use:** Link to comments section

### Query Loop
**Slug:** `core/query`  
**Capabilities:**
- Display multiple posts
- Filter by category, tag, author
- Custom post types
- Order by date, title, menu order
- Pagination support
- Inherit query from template
**Use for:** Blog listings, custom post type archives, related posts
**When to extend:** Advanced filtering, AJAX load more

### Post Template
**Slug:** `core/post-template`  
**Use:** Inner block of Query Loop defining post layout

### Query No Results
**Slug:** `core/query-no-results`  
**Use:** Content shown when query returns no posts

### Query Title
**Slug:** `core/query-title`  
**Use:** Archive/search query title

### Query Total
**Slug:** `core/query-total`  
**Use:** Total results count display

### Pagination
**Slug:** `core/query-pagination`  
**Inner blocks:** `core/query-pagination-previous`, `core/query-pagination-next`, `core/query-pagination-numbers`

### Terms Query
**Slug:** `core/terms-query`  
**WordPress version:** 7.0+  
**Capabilities:**
- Query block for taxonomy terms (categories, tags, custom taxonomies)
**Inner blocks:** `core/term-template`
**Related blocks:** `core/term-name`, `core/term-description`, `core/term-count`

### Term Template
**Slug:** `core/term-template`  
**Use:** Template for rendering individual terms

### Term Name
**Slug:** `core/term-name`  
**Use:** Display term name

### Term Description
**Slug:** `core/term-description`  
**Use:** Display term description

### Term Count
**Slug:** `core/term-count`  
**Use:** Display term post count

### Comments
**Slug:** `core/comments`  
**Capabilities:**
- Comments display (replaces legacy comments)
**Inner blocks:** `core/comment-template`, `core/comments-title`, `core/comments-pagination`

### Comment Template
**Slug:** `core/comment-template`  
**Inner blocks:** `core/comment-author-name`, `core/comment-content`, `core/comment-date`, `core/comment-edit-link`, `core/comment-reply-link`

### Comments Title
**Slug:** `core/comments-title`  
**Use:** Comments section heading

### Comments Pagination
**Slug:** `core/comments-pagination`  
**Inner blocks:** `core/comments-pagination-previous`, `core/comments-pagination-next`, `core/comments-pagination-numbers`

### Breadcrumbs
**Slug:** `core/breadcrumbs`  
**WordPress version:** 7.0+ (in development)  
**Capabilities:**
- Breadcrumb navigation

## Widget Blocks

### Archives
**Slug:** `core/archives`  
**Capabilities:**
- Monthly/yearly archive links
- Post count display
- Dropdown option

### Calendar
**Slug:** `core/calendar`  
**Capabilities:**
- Monthly calendar grid
- Links to posts by date

### Categories
**Slug:** `core/categories`  
**Capabilities:**
- Category list or dropdown
- Post count
- Hierarchy display

### Latest Posts
**Slug:** `core/latest-posts`  
**Capabilities:**
- Recent posts list or grid
- Featured image display
- Excerpt option
- Post count limit

### Latest Comments
**Slug:** `core/latest-comments`  
**Capabilities:**
- Recent comments list
- Avatar display
- Comment count limit

### Tag Cloud
**Slug:** `core/tag-cloud`  
**Capabilities:**
- Visual tag list
- Font size scales with usage
- Taxonomy selection

### RSS
**Slug:** `core/rss`  
**Capabilities:**
- Display external RSS feed
- Excerpt display
- Item count limit

### Search
**Slug:** `core/search`  
**Capabilities:**
- Search form
- Button or icon display
- Label customization
- Width options

### Social Icons
**Slug:** `core/social-links`  
**Capabilities:**
- Icon links to social profiles
- Multiple services supported
- Size and color controls
**Inner blocks:** `core/social-link` (individual icons)

### Social Link
**Slug:** `core/social-link`  
**Use:** Individual social icon within `core/social-links`

### Page List
**Slug:** `core/page-list`  
**Capabilities:**
- Hierarchical page list
- Parent page selection
- Depth control
**Inner blocks:** `core/page-list-item`

### Login/Logout
**Slug:** `core/loginout`  
**Capabilities:**
- Login/logout link
- Redirect URL option

### Read More
**Slug:** `core/read-more`  
**Capabilities:**
- Read more link for post excerpts
- Border radius, color, spacing controls

## Embed Blocks

### Embed
**Slug:** `core/embed`  
**Capabilities:**
- URL-based embedding via oEmbed protocol
- Responsive containers
- Caption support
- 40+ provider variations (YouTube, Twitter/X, Vimeo, SoundCloud, Spotify, Instagram, Facebook, TikTok, etc.)

**When to extend:** Custom embed handlers, GDPR-compliant lazy loading

## Utility Blocks

### Custom HTML
**Slug:** `core/html`  
**Use:** Raw HTML for custom markup

### Shortcode
**Slug:** `core/shortcode`  
**Use:** Legacy shortcode wrapper

### Classic Editor
**Slug:** `core/freeform`  
**Use:** Classic (TinyMCE) editor fallback

### More
**Slug:** `core/more`  
**Use:** "Read more" separator in post content

### Page Break
**Slug:** `core/nextpage`  
**Use:** Page break for multi-page posts

### Missing Block
**Slug:** `core/missing`  
**Use:** Placeholder for unrecognized blocks

### Reusable Block Reference
**Slug:** `core/block`  
**Use:** Reference to a synced/reusable pattern

### Pattern
**Slug:** `core/pattern`  
**Use:** Block pattern reference

## Key Block Combinations

### Hero Section
**Components:** Cover > Group > Heading + Paragraph + Buttons

### Card Layout
**Components:** Columns > Column > Image + Heading + Paragraph + Button

### Testimonial Slider
**Components:** Query Loop (custom post type) + Post Template > Image + Quote

### Feature Grid
**Components:** Group (Grid layout) > Group (repeated) > Image + Heading + Paragraph

### Newsletter Signup
**Components:** Group > Heading + Paragraph + Form (via plugin) OR custom block

### FAQ Section
**Components:** Accordion > Accordion Item (repeated) > Accordion Heading + Accordion Panel

## When Core Blocks Are NOT Enough

Build a custom block when:
1. **Third-party API integration** - MapLibre, Stripe, external data sources
2. **Complex client-side interactivity** - Calculators, configurators, real-time updates
3. **Unique data structures** - Custom schemas that don't map to post content
4. **Performance-critical features** - Custom caching, lazy loading beyond core
5. **Proprietary functionality** - Client-specific business logic

Even then, consider:
- Can I extend a core block with filters?
- Can I use a synced pattern with custom CSS/JS?
- Can I use the Interactivity API with core blocks?
