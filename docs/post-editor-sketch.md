# The Post Editor in WP Admin Shell — A Decomposition Sketch

**Purpose.** Test whether the architecture we've designed survives contact with the most complex real screen in WordPress core. If the post editor decomposes cleanly into the regions/apps/manifests model, the architecture is real. Where it doesn't, we've found the gaps that need addressing before v1 ships.

**Method.** Map the editor's actual structure — the `InterfaceSkeleton` component from `@wordpress/interface` (the layout primitive), `@wordpress/edit-post` (the editor wrapper), and `@wordpress/editor` (the post-aware editor) — onto the shell's region/app/template vocabulary. Identify where parity holds, where it strains, where it breaks.

**Source of truth.** The actual code at `WordPress/gutenberg` trunk: `packages/interface/src/components/interface-skeleton/style.scss` (regions enumerated as CSS classes) plus the editor extension API surface (`PluginSidebar`, `PluginSidebarMoreMenuItem`, `PluginDocumentSettingPanel`, `BlockControls`, `InspectorControls`, the legacy metabox container).

---

## What the editor actually is

`InterfaceSkeleton` is the layout primitive. Verbatim from `style.scss`, its named child elements are:

- `__header` — top bar with title, document tools, save, settings toggle, plugin menu
- `__editor` — wrapper for body + footer
- `__body` — flex row holding secondary-sidebar + content + sidebar
- `__secondary-sidebar` — left auxiliary panel (block inserter, list view, patterns)
- `__content` — main canvas
- `__sidebar` — right inspector
- `__footer` — block breadcrumb at bottom (medium+ viewports only)
- `__actions` — entity save view that slides up from bottom-right

Plus, layered into the bottom of `__content` and not part of `InterfaceSkeleton` itself: the legacy **metabox container**, an iframe-equivalent surface that runs PHP-rendered metaboxes inside the React editor. Its visibility is gated on post type and rendering mode (per Gutenberg issue #66507: `! DESIGN_POST_TYPES.includes(currentPostType) && isRenderingPostOnly`).

Inside `__sidebar`, two parallel concerns share the panel: the **document/block inspector** (driven by `core/edit-post`'s sidebar state — toggles between document tab and selected-block tab) and **plugin sidebars** (registered by `PluginSidebar`, each with its own name, toggleable from the more-menu).

Inside `__content`, the actual block canvas is itself a small layout: a **block toolbar** that floats above the selected block (anchored, not docked — its position depends on selection), the **post title** input, the **block list** rendering parsed `post_content`. The block toolbar can be either floating-per-block or pinned to the top of the canvas depending on user preference.

That's the editor as it really is. Now decompose it.

---

## Decomposition

### Tier 1: Things that are clearly one app

**`core:editor`** — the whole thing, treated as one mountable unit. This is the ceiling of decomposition for v1. The editor is a coherent application: a post (entity) is loaded, blocks are parsed from `post_content`, the user edits, the entity is saved. All of that state — selected block, dirty state, save status, undo history — lives in the `core/editor` and `core/block-editor` Redux stores and is fundamentally one logical session. There is no clean boundary inside the editor that would let a separate "block canvas app" coexist with a separate "inspector app" while they share the same selection and undo history.

This matches your earlier instinct (the navigation app's site-hub and primary-nav are sub-components, not separable apps, because no one swaps the site-hub independently of primary-nav). Same here: nobody swaps "the inspector sidebar" while keeping "the block canvas." The editor is one app. Its internal regions are React component composition, not shell-level region composition.

So the shell mounts `core:editor` into one region. End of shell-level decomposition for the editor itself.

But: this leaves a lot of structure on the floor. The editor's *internal* layout is non-trivial, and several pieces of it are points where third parties extend. We need to look at what survives the "it's all one app" decision and what doesn't.

### Tier 2: Things that look like apps but are app-internal

These are real, important UI surfaces, but they belong inside the `core:editor` app's React tree, not as separate apps mounted by the shell. The shell architecture doesn't govern them; the editor's existing extension API does.

- **The block toolbar** (`BlockControls`). Floats above the selected block. Its position is computed from selection state, not from layout configuration. Plugins extending blocks contribute toolbar buttons via `<BlockControls><ToolbarButton /></BlockControls>`. This is React component composition entirely inside the canvas.

- **The block inspector** (`InspectorControls`). Right sidebar's "Block" tab. Plugins fill it via `<InspectorControls><PanelBody /></InspectorControls>`. Driven by which block is selected. Same — component composition inside the editor.

- **Document settings panels** (`PluginDocumentSettingPanel`). Plugins register panels into the right sidebar's "Document" tab. Same pattern.

- **Plugin sidebars** (`PluginSidebar` + `PluginSidebarMoreMenuItem`). Plugins register entirely separate sidebar pages, accessible via the more-menu. Each has its own name; one is active at a time. *This is the closest case to "should these be apps?"*  — and I think the answer is still no, because they (a) live inside the same `__sidebar` region as the inspector, (b) share the inspector's open/closed state, (c) only make sense in the editor context. They're plugin contributions to the editor app, not standalone apps.

- **Snackbars and notices** (the editor's own `EditorSnackbars`). These render inside the editor's React tree, surfacing save errors, autosave status, etc. They're per-editor-session UI.

- **Pre-publish and post-publish panels.** Slide in from the right when publishing; show validation, schedule, social-share confirmations. Part of the editor's publish flow.

The contract with the shell here is: **the editor is one app the shell mounts; everything else above is React extension surface inside that app, governed by `@wordpress/plugins` registration, not by `admin.json`.**

This is a clean line and matches the principle we landed on. The shell doesn't reach inside apps; apps use whatever React patterns they want.

### Tier 3: Things that look app-internal but are actually shell concerns

This is where it gets interesting. A few pieces of the editor's chrome map *better* onto shell-level concepts than onto editor-internal concerns.

- **Save state / dirty-state warning.** When the user navigates away with unsaved changes, the editor prompts. Currently this is implemented inside the editor via `useEntityRecord` + a custom blocker. In our architecture, this is the `platform.dirty-state` request the editor makes — the *shell* (engine) intercepts navigation and asks the editor "ok to unmount?" The mechanism moves up; the policy ("warn on unsaved post content") stays in the editor.

- **Keyboard shortcut registration.** The editor registers many shortcuts (save, undo, redo, toggle inspector, command palette, etc.) via `@wordpress/keyboard-shortcuts`. Some of these (Cmd+K for command palette) are clearly shell-level. Some (Cmd+S for save) are app-level. Some are ambiguous (Cmd+Shift+, for inspector toggle — feels editor-specific, but other apps might want their own "toggle right panel" binding). Our architecture's `bindings` block in `admin.json` handles the shell-global ones; the editor app keeps its own internal shortcuts. The line between them is "is this binding meaningful only inside this app?" — Cmd+S is yes, Cmd+K is no.

- **Modality during save.** When saving, the editor shows a modal "saving..." state and disables interaction. That's editor-internal — not the shell's modality.

- **The `__actions` slot — "entity save view".** This is a slide-up panel showing pending saves across multiple entities (the post, its template, its global styles, its featured image media item). It's *editor-internal* in the current code, but conceptually it belongs above the editor — it's "things that need saving in the current shell context," not specific to one editor session. v1 leaves it editor-internal; v2 might lift it to a shell concern.

### Tier 4: The legacy metabox container

This deserves its own treatment because it's the awkward case. Legacy PHP metaboxes, registered via `add_meta_box()`, render as HTML at the bottom of `__content`. They submit to `post.php` directly via a hidden form, separate from the React save flow. They're third-party PHP code WordPress can't migrate.

In the shell architecture this is *exactly* the iframe escape-hatch case. The editor app, when mounting, includes a sub-region that iframes (or moral-equivalent of iframes — same-origin script injection, the current approach) the legacy metabox HTML. This is editor-internal in v1: the `core:editor` app handles its own legacy metabox rendering. It's not a shell concern.

But it's worth noting because it's the kind of thing a **plugin** version of the editor (`plugin:woocommerce/order-editor`, say) would also need. The escape-hatch pattern is reusable; the shell ought to provide a documented helper for "render legacy PHP UI inside my React app." That's an SDK concern, not a shell-config concern.

---

## What the manifests look like

### `core:editor` app manifest

```jsonc
{
  "$schema": "https://schemas.wp.org/admin-app/v1.json",
  "id": "core:editor",
  "version": 1,
  "title": "Post Editor",
  "description": "Block-based editor for posts, pages, and custom post types.",

  "role": "main",

  "platform": {
    "triggerable": true,
    "dirty-state": true,
    "block-navigation-on-dirty": true
  },

  "capabilities": [ "edit_posts" ],

  "config-schema": {
    "type": "object",
    "properties": {
      "post-type": { "type": "string", "default": "post" },
      "post-id":   { "type": "integer" }
    },
    "required": [ "post-type", "post-id" ]
  },

  "extension-points": {
    "PluginSidebar":              "@wordpress/editor",
    "PluginSidebarMoreMenuItem":  "@wordpress/editor",
    "PluginDocumentSettingPanel": "@wordpress/editor",
    "PluginPrePublishPanel":      "@wordpress/editor",
    "PluginPostPublishPanel":     "@wordpress/editor",
    "PluginPostStatusInfo":       "@wordpress/editor",
    "BlockControls":              "@wordpress/block-editor",
    "InspectorControls":          "@wordpress/block-editor"
  },

  "script": "wp-edit-post",
  "style":  "wp-edit-post"
}
```

**`platform.dirty-state: true`** is the request to the engine: "intercept navigation away from me and ask whether to proceed."

**`platform.block-navigation-on-dirty: true`** is a refinement — when the answer is "post is dirty," the engine should show the standard browser-like confirm dialog, not just allow navigation. This is the platform service for the unsaved-changes warning. (Worth flagging this surfaced a new platform field we hadn't enumerated. The list grows when we sketch real apps. v1 should expect 2-3 more to surface.)

**`extension-points`** is new and didn't appear in the earlier sketches. The editor exposes an extension API — slot/fill registrations, filter hooks — that plugins target. Documenting these in the manifest serves three purposes: (a) machine-discoverable for tooling, (b) versionable so the editor can deprecate/rename, (c) a contract surface independent of the shell. The shell doesn't *do* anything with this field; it's documentation. This might belong outside the manifest in a docs file, but I'd lean toward keeping it manifest-level so it's queryable by IDE tooling, similar to how `block.json`'s `supports` field documents what a block accepts.

### `admin.json` excerpt for editor routing

```jsonc
{
  "regions": {
    "main":   { "template": "core:main",   "accepts-target": "_self" },
    "detail": { "template": "core:detail", "accepts-target": "detail" }
  },

  "routing": {
    "/posts/{id}": {
      "app": "core:editor",
      "target": "detail",
      "config": { "post-type": "post" }
    },
    "/pages/{id}": {
      "app": "core:editor",
      "target": "detail",
      "config": { "post-type": "page" }
    },
    "/posts/new": {
      "app": "core:editor",
      "target": "_self",
      "config": { "post-type": "post" }
    }
  }
}
```

Note `/posts/new` targets `_self` — creating a new post takes the whole content area, no list-detail split — while `/posts/{id}` targets `detail`, opening alongside the posts list. Same app, two routing intents, distinguished by URL pattern. This works.

The `{id}` placeholder needs to flow into the app's config. The editor needs `post-id` to be set from the route. The simplest version: the router resolves `{id}` against the URL and passes it as `config.post-id`. Worth being explicit in the routing schema:

```jsonc
"/posts/{id}": {
  "app": "core:editor",
  "target": "detail",
  "config": {
    "post-type": "post",
    "post-id": "{id}"
  }
}
```

Curly-brace substitution in config values is a small addition to the spec. Consistent with the DTCG alias syntax we already have, but resolves against route params rather than tokens. Document the namespace separation.

---

## Where the architecture holds

**The editor is one app, mountable in any region the engine offers.**  Run that through the three engines:

- **wp-default in `main`:** full content area, looks like classic edit-post. Inspector sidebar is part of the editor app's React tree, not a shell-level region. Width is whatever main gets.
- **wp-default in `detail`:** half-width pane next to a posts list. The editor's inspector sidebar competes for that 720px or whatever. The editor's intrinsic responsive design needs to handle "I'm in a narrow context" — collapse the inspector by default, hide secondary sidebar entirely. This is editor app code, not shell code. **The contract puts the burden on the editor to be intrinsically responsive.**
- **floating engine:** the editor opens in a window. The window is sized by the engine. Same intrinsic-responsiveness requirement.
- **single-pane engine (mobile):** fullscreen. The editor's existing mobile layout (which already exists in `InterfaceSkeleton` — the `@include break-medium()` queries everywhere) handles this.

The block editor is *already* substantially intrinsically responsive — the existing CSS has extensive media-query work for mobile, and the upcoming WPDS density variants extend this. Apps that aren't yet intrinsically responsive will be. The contract aligns with where the codebase is heading.

**Plugin extension to the editor doesn't touch admin.json.** A plugin shipping `PluginSidebar` registers via `@wordpress/plugins`, no changes to admin.json needed. This was the principle ("installing a new app shouldn't require admin.json changes") and it holds for plugin extensions too. The plugin extends the editor app's slot tree, the editor app surfaces those extensions when mounted; admin.json never sees them.

**The block toolbar's odd positioning is inside the editor.** This was a worry — the toolbar floats over content in a position computed from selection — and it would have been weird if the shell had to know about anchored-to-selection positioning. The shell doesn't. It's React positioning inside the editor's canvas component.

**Save state lives in `core-data`.** When the editor saves, it's writing through `useEntityRecord`. A separate "preview" app subscribed to the same entity would see the changes immediately. No selection-bus needed; the data layer does the coordination. This validates the decision to drop the selection bus.

---

## Where the architecture strains (but doesn't break)

**Plugin sidebars are app-internal, but feel like they should be addressable.**  A site author might reasonably want to say "this shell uses the Yoast SEO sidebar by default." Currently, sidebar visibility is controlled by Gutenberg's user preferences — toggled via the more-menu, persisted per-user. The editor app is the canonical owner of which sidebar is open.

In our architecture, this means "default sidebar" is editor-app config (likely a setting in the user's editor preferences), not admin.json. That's defensible but slightly awkward — admin.json is the canonical "what does this install look like" file, and "Yoast on by default" feels like an install-level choice. The escape valve: admin.json's per-app config can pass an initial-sidebar hint to the editor:

```jsonc
"routing": {
  "/posts/{id}": {
    "app": "core:editor",
    "config": {
      "post-type": "post",
      "post-id": "{id}",
      "default-sidebar": "yoast/sidebar"
    }
  }
}
```

Editor reads its config, applies the default. Site author got their install-level customization, editor stayed in charge. Fine — but it does mean editor apps will accumulate config knobs, and the line between "shell config" and "editor config" stays a little fuzzy. Not broken, just imperfect.

**The `__secondary-sidebar` is editor-internal but houses three different things** (block inserter, list view, patterns library). Each is toggled by a separate header button. This is an internal-multi-mode-sidebar pattern that isn't quite captured by anything in our architecture. It just lives in the editor's React tree and works. Worth noting because if other apps want the same pattern (a left auxiliary panel that toggles between modes), they'll reimplement it. There's no shell-provided "secondary sidebar" primitive. v1 doesn't need one; it's an app-internal pattern. But if a *third* app later wants the same shape, refactoring it into a shared `@wordpress/components` thing is the right move — not pulling it into the shell.

**Per-shell editor variants.** Could a "content author" shell ship a *simpler* editor — fewer toolbar buttons, fewer panels, no template editing? Two paths: (a) a different app id (`core:simple-editor`) backed by a slimmer codebase, or (b) `core:editor` with config that hides surfaces. The MVP appears to have done (a), and I think that's right — `core:simple-editor` and `core:editor` can share underlying packages (`@wordpress/block-editor`) but ship as different apps with different chrome. The shell architecture supports this naturally; admin.json just routes posts to whichever app the shell wants.

---

## Where the architecture genuinely doesn't fit

**The legacy metabox container is the one place where the editor needs to render PHP-rendered HTML inside its React tree.** The current implementation (`<MetaBoxes>` component, hidden form submission) is a workaround that the shell architecture doesn't make easier. It works because the editor app implements it; the shell just mounts the editor.

This is fine for v1 — escape hatch for legacy PHP UI is editor-internal. But it points at a missing helper: any app porting from PHP wp-admin will need the same pattern. A shared `@wordpress/legacy-php-region` component in the SDK would let plugins do `<LegacyPHPRegion screen="..."  />` to embed PHP-rendered content. Not a shell-level concern, but a real ecosystem need.

**The block editor's keyboard shortcuts overlap with shell shortcuts.** The editor registers Cmd+K for command palette, Cmd+/ for help, etc. The shell's bindings block also registers Cmd+K. There needs to be a *contract for shortcut precedence* when both shell and app want the same key. Three options:

1. Shell wins everywhere. Editor's Cmd+K is shadowed by shell Cmd+K.
2. App wins when focused inside app DOM. Shell wins outside.
3. Shell registers a binding *to the app* — i.e., the shell's Cmd+K invokes whichever app declares "I handle the command-palette shortcut."

(2) is what most operating systems do, and is what `@wordpress/keyboard-shortcuts` already does internally with focus-aware contexts. The shell should adopt the same model: shell-level bindings fire only when no focused app has overridden them. Document this. Add a `binding-context` field to apps that handle conflicting shortcuts.

This is a real spec gap surfaced by the editor case. The earlier sketches didn't have it because none of the apps in those sketches had keyboard-shortcut conflicts.

---

## What the editor case proves about the architecture

**The "one region, one app" rule survives the editor.** The editor is one app, period. Its internal complexity is React, not shell-managed regions. The line we drew between component composition (React) and region composition (shell) holds.

**The platform-services list will grow.** `dirty-state`, `block-navigation-on-dirty`, and shortcut-precedence-context are all new fields surfaced by sketching one real app. v1 needs to expect 5-10 more from the next handful of real apps. The spec should have a clear extension policy for `platform.*` so adding a new platform service in v1.1 doesn't require shell-level changes — just engines opting to honor or ignore.

**Intrinsic responsiveness is the contract burden, not optional.** The editor has to render well in main, in detail, in floating, in single-pane. It currently does, mostly, because the team has invested in responsive CSS for years. New apps inheriting the contract need to commit to the same investment. This isn't a shell-architecture problem; it's an app-quality expectation. The shell should publish a "rendering well at any size" testing harness.

**Routing-config interpolation needs to be in v1 spec.** `{id}` substitution from URL params into app config is necessary for the editor case and would have shown up in any other entity-detail app too. Worth specifying explicitly: routing config values can use `{paramname}` placeholders that resolve against route match params.

**Plugin extensibility is a problem we don't have to solve at the shell layer.** `@wordpress/plugins` already does it at the app layer. The shell sees one app; the plugins extend the app via existing APIs. This means we don't need a shell-level plugin contribution surface in v1, which was a real worry. The block editor proves that React's composition + WordPress's existing plugin registration is enough for in-app extensibility, no shell help needed.

---

## v1 spec deltas this sketch surfaces

Concrete additions to the v1 spec:

1. **Add `platform.dirty-state` and `platform.block-navigation-on-dirty`** to the platform-services vocabulary. Engine intercepts navigation, asks app, optionally shows confirm dialog. The editor needs both.

2. **Routing config interpolation.** `{paramname}` placeholders in routing-block config values, resolved from URL match params. Distinct from token aliases (which use the same curly-brace syntax but resolve against tokens.json). The resolver disambiguates by namespace prefix or by which resolver runs — TBD.

3. **Keyboard-shortcut precedence rules.** Document that bindings declared at app level shadow bindings declared at shell level when the focused element is inside the app's DOM. Same model as `@wordpress/keyboard-shortcuts`. Apps may declare a `binding-context` if they need to scope which shortcuts they capture.

4. **Manifest `extension-points` field.** Optional. Apps document the extension API surface they expose to plugins. Machine-readable, queryable, not load-bearing for the shell — pure documentation. Probably useful for IDE tooling and for ecosystem health.

5. **SDK helper for embedding PHP-rendered legacy content.** Not v1 shell spec, but flag for the SDK roadmap. Any ported app will need it.

6. **Intrinsic-responsiveness test harness.** The shell should ship a test that mounts an app at multiple sizes (main, detail, floating-min, single-pane-mobile) and produces visual diffs. App authors run this against their app; shell maintainers run it against `core:*` apps. Quality gate, not a spec field.

None of these are architectural changes. They're refinements that surfaced from running a real app through the contract. The architecture itself — three artifacts, one-region-one-app, regions-with-nested-regions, role/layout/platform vocabulary, link-semantic navigation, no selection bus — survives unchanged.

The post editor decomposes cleanly into the architecture. The places where it strains are places where the shell doesn't reach inside the app, which is a feature. The places where it doesn't fit (legacy PHP metaboxes) are app-internal escape hatches that don't break the shell contract.

This is a strong signal the architecture is real.