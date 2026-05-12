# Screen Spec: Block Editor — Modes & Auxiliary Surfaces

**Status:** Tier 2 — companion to [`editor-block.md`](./editor-block.md). Read that first.
**JS package surface:** `@wordpress/edit-post` (mode toggles), `@wordpress/block-editor` (`Inserter`, `__experimentalListView`), `@wordpress/commands` (command palette), `@wordpress/preferences`.

This document covers the editor's secondary surfaces and viewing modes:
- **List view** (block tree) and Document Overview
- **Patterns inserter** and the inserter's full surface
- **Code editor** mode
- **Distraction-free** mode
- **Fullscreen** mode
- **Spotlight** mode
- **Zoom-out** mode (6.5+)
- **Find/Replace** (6.5+)
- **Command palette**
- **Welcome guide** + keyboard shortcuts modal

---

## 1. Identity

| Surface | Toggle | Persisted |
|---|---|---|
| List view | Header button or Shift+Alt+O | Per-session |
| Code editor | Options menu → Editor → Code editor (Cmd/Ctrl+Shift+Alt+M) | Per-session |
| Distraction-free | Options menu → View → Distraction free (Cmd/Ctrl+Alt+/) | Preference |
| Fullscreen | Options menu → View → Fullscreen (Cmd/Ctrl+Shift+Alt+F) | Preference (default on) |
| Spotlight | Options menu → View → Spotlight | Preference |
| Zoom-out | Header button (icon) | Per-session |
| Top toolbar | Options menu → View → Top toolbar (Cmd/Ctrl+Shift+\) | Preference |
| Inserter (sliding panel) | Header `+` button | Per-session |
| Find/Replace | Cmd/Ctrl+F | Per-session |
| Command palette | Cmd/Ctrl+K | — |
| Welcome guide | Options menu → Welcome Guide | Preference (auto-shows once) |

All preferences live in `core/preferences` under namespace `core/edit-post` (or `core/edit-site` in site editor).

---

## 2. Purpose

Each mode reshapes the editor for a specific job:

| Mode | Job |
|---|---|
| List View | Navigate, reorder, multi-select, and lock blocks via tree view |
| Document Overview (List View tab 2) | Outline of headings; word/character counts |
| Patterns inserter | Drop pre-composed block patterns into content |
| Code editor | Edit block markup as raw text — inspect, fix, paste-in markup |
| Distraction-free | Hide all chrome to focus on writing |
| Fullscreen | Hide WP admin chrome (kept on by default in modern WP) |
| Spotlight | Dim non-active blocks to focus the active one |
| Zoom-out | See whole page, drag patterns, work at section level |
| Top toolbar | Anchor block toolbar to the header bar, never floats |
| Find/Replace | Search and replace within the post |
| Command palette | Quick jump to any action (`@wordpress/commands`) |
| Welcome guide | First-run product tour |

---

## 3. Capabilities & access

All modes are gated by editor access (same caps as the parent screen). No mode adds incremental cap requirements. Patterns visibility may be filtered server-side by post type and by `register_block_pattern` `categories`/`postTypes` arguments.

---

## 4. Data model

### List View
- **Source of truth:** `core/block-editor` store — `getClientIdsWithDescendants`, `getBlock(clientId)`, `getBlockOrder(parentClientId)`.
- **No REST.** Pure client state derived from the post `content`.

### Document Overview
- Outline derived from blocks where `block.attributes.level` and `block.attributes.content` exist (heading blocks).
- Word / character / time-to-read computed via `@wordpress/wordcount`.

### Patterns inserter
- Endpoint: `GET /wp/v2/block-patterns/patterns` returns array of `{title, name, content, categories[], blockTypes[], postTypes[], viewportWidth, source}`.
- Categories: `GET /wp/v2/block-patterns/categories`.
- Synced patterns ("Reusable blocks"): `GET /wp/v2/blocks` — saved as `wp_block` post type.
- Server-registered PHP patterns are also available in `__experimentalAdditionalBlockPatterns` editor setting (preloaded).
- 6.5+ "Starter content patterns" — patterns with `viewportWidth` and `postTypes: ['post']` show as starter choices on new posts.

### Code editor
- Edits the raw `content` string (block markup with `<!-- wp: -->` comments).
- On exit, the markup is re-parsed via `wp.blocks.parse()`. Invalid blocks surface block-error UI.

### Find/Replace
- Pure client-side traversal of block-list rich-text values.
- No REST.

### Command palette
- `@wordpress/commands` registry — global `core/commands` store.
- Entries: `{name, label, icon, callback, context}`.
- Block-editor registers ~30 commands (toggle modes, insert block, save, etc.).
- Plugins can `wp.data.dispatch('core/commands').registerCommand(...)`.

---

## 5. Layout regions (semantic)

### List View panel

```
┌── List View / Outline ──────────────┐
│ Tabs: [List View] [Outline]         │
├─────────────────────────────────────┤
│ List View                           │
│  ▼ Group                            │
│    ▼ Columns                        │
│      • Column                       │
│        – Paragraph                  │
│        – Image                      │
│      • Column                       │
│        – Heading                    │
│  • Quote                            │
│ (drag handles, lock indicators,     │
│  expand/collapse, multi-select)     │
└─────────────────────────────────────┘

┌── Document Overview ────────────────┐
│ Headings outline                    │
│  H1 Article title                   │
│   H2 Section A                      │
│    H3 Subsection                    │
│   H2 Section B                      │
│                                     │
│ Characters: 1,847                   │
│ Words: 312                          │
│ Time to read: 2 min                 │
│ Blocks: 18                          │
└─────────────────────────────────────┘
```

### Inserter

```
┌── Inserter ────────────────────────┐
│ Search                              │
│ ┌── Tabs ──────────────────────┐   │
│ │ Blocks │ Patterns │ Media │   │
│ │      Synced patterns          │   │
│ └──────────────────────────────┘   │
├─────────────────────────────────────┤
│ Tab: Blocks                         │
│  Categories (collapsible):          │
│   Text         (Paragraph, …)       │
│   Media        (Image, Gallery, …)  │
│   Design       (Group, Columns, …)  │
│   Widgets      (Latest Posts, …)    │
│   Theme        (Site Title, …)      │
│   Embeds       (YouTube, Twitter…)  │
│   Reusable     (synced patterns)    │
│                                     │
│ Hover preview: large preview tile   │
├─────────────────────────────────────┤
│ Tab: Patterns                       │
│  Category dropdown / chips          │
│  Pattern grid with previews         │
│  "Explore all patterns" button →    │
│   modal with full library           │
├─────────────────────────────────────┤
│ Tab: Media (6.5+)                   │
│  Image / Audio / Video sub-tabs     │
│  Drag from grid → drop on canvas    │
│  Openverse free-image search (6.5+) │
└─────────────────────────────────────┘
```

### Code editor mode
Replaces canvas with a single textarea showing block markup string. "Exit code editor" button at top.

### Distraction-free mode
Hides: header (mostly), inspector, list view, status bar. Reveals on hover at top edge.

### Fullscreen mode
Hides browser scrollbars + WP shell chrome (admin bar / nav). Editor takes full viewport.

### Spotlight mode
Dims non-active blocks (CSS opacity ~0.4); active block plus parent group at full opacity.

### Zoom-out mode (6.5+)
Canvas scales to fit viewport (~50–60% scale). Header swaps title input for breadcrumb. User can drag whole patterns at section level. Block-editing disabled in this mode — only structural reorder/insert.

### Find/Replace overlay
```
┌── Find & Replace ──────────────┐
│ Find:    [____________]        │
│ Replace: [____________]        │
│   [Match case] [Match word]    │
│   [Find prev] [Find next]      │
│   [Replace] [Replace all]      │
│   3 of 12 results              │
└────────────────────────────────┘
```

### Command palette overlay
```
┌── Command palette (Cmd+K) ──────────┐
│ > [search input]                    │
├─────────────────────────────────────┤
│ ⏏  Toggle distraction free          │
│ 🗂  Open list view                   │
│ ↺  Undo                              │
│ 💾  Save draft                       │
│ 📤  Publish post                     │
│ 🧱  Add a Paragraph                 │
│ ⚙️  Open keyboard shortcuts          │
│  …                                   │
└─────────────────────────────────────┘
```

---

## 6. States

| Mode | State | Display |
|---|---|---|
| List View | Empty post | Empty state: "No blocks yet" + Add block button |
| List View | Block selected | Row highlighted; in sync with canvas selection |
| List View | Locked block | Lock icon on row; row not draggable |
| List View | Synced pattern | Special icon + "Synced" label |
| Document Overview | No headings | Empty state: "Add headings to create an outline" |
| Code editor | Invalid markup | Error notice on exit; offer Resolve / Recover |
| Distraction-free | Active | All chrome hidden until hover top edge |
| Fullscreen | Active | Body class `is-fullscreen-mode`; admin bar gone |
| Spotlight | Active | Non-active blocks dimmed |
| Zoom-out | Active | Block-editing inputs disabled; only insert/reorder/delete |
| Patterns inserter | Loading | Skeleton tiles |
| Patterns inserter | Empty category | "No patterns in this category" |
| Find/Replace | No matches | "No results" |
| Command palette | No results | "No commands matching '{query}'" |

---

## 7. Actions

### List View

| Action | Behavior |
|---|---|
| Click row | Selects that block in canvas |
| Click expand caret | Show/hide children |
| Drag row | Reorder block (both within siblings and across containers) |
| Shift+Click | Range select |
| Cmd/Ctrl+Click | Add to multi-selection |
| Right-click / context menu | Block options menu (cut/copy/paste/duplicate/move to/lock/etc.) |
| Lock icon | Open lock modal; block movement / removal |
| Mode toggle | Edit / Select tools (mirrors header toggle) |

### Document Overview

| Action | Behavior |
|---|---|
| Click heading row | Selects that heading block in canvas |

### Inserter (Blocks tab)

| Action | Behavior |
|---|---|
| Click block tile | Inserts at last selected position (or end of post if none selected) |
| Drag block tile | Drop indicator on canvas; releases at drop point |
| Hover | Large preview tile shows block thumbnail + description |
| Search | Live filter across `block.title`, `block.keywords`, `block.description` |

### Inserter (Patterns tab)

| Action | Behavior |
|---|---|
| Pattern tile click | Inserts pattern at active position |
| Pattern tile drag | Drop on canvas |
| "Explore all patterns" | Opens full-screen pattern modal |
| Category chip / dropdown | Filters grid |

### Inserter (Media tab, 6.5+)

| Action | Behavior |
|---|---|
| Image / Audio / Video / Openverse sub-tabs | Filters source |
| Click media | Inserts as image/audio/video block |
| Drag media | Drop on canvas |

### Inserter (Synced patterns / "Reusable" tab)

| Action | Behavior |
|---|---|
| Pattern click | Inserts synced `wp_block` reference (changes propagate to all instances) |
| "Manage all reusable blocks" | Navigates out to `wp_block` list |

### Code editor mode

| Action | Behavior |
|---|---|
| "Exit code editor" button | Re-parses content via `wp.blocks.parse()`; if invalid blocks, shows recovery UI |
| Edit textarea | Plain textarea — no syntax highlighting |
| Save while in code mode | Saves the textarea content as `content.raw` |

### Distraction-free / Fullscreen / Spotlight / Top-toolbar / Zoom-out

Pure preference toggles. Each persists via `core/preferences` and re-renders affected regions on change.

### Find/Replace

| Action | Behavior |
|---|---|
| Find query | Highlights all matches in canvas; tracks current index |
| Replace | Replaces current match only |
| Replace all | Replaces all matches in document |
| Match case toggle | Case-sensitive |
| Match whole word toggle | Word-boundary regex |

### Command palette

| Action | Behavior |
|---|---|
| Type | Filters commands; uses fuzzy match |
| Enter / click | Executes command's `callback` |
| Esc | Closes palette |

### Welcome guide

Modal with 4 illustrated slides; can be re-shown from Options menu.

### Keyboard shortcuts modal (Cmd+Shift+H)

Lists every registered shortcut grouped by category. Read-only. Not user-customizable in core.

---

## 8. Filters, sort, search, pagination

### Inserter search
Single full-text input. Client-side fuzzy. Operates against pre-loaded block registry + paginated patterns query.

### Patterns query
`GET /wp/v2/block-patterns/patterns` returns full list (no pagination — the list is finite). The inserter applies category and post-type-compat filters client-side.

### Pattern filtering
Patterns can be filtered by:
- Category (UI category dropdown / chips)
- `postTypes` registration metadata (already filtered server-side per post being edited)
- `blockTypes` (when inserting from a sibling-block context)

---

## 9. Forms & inputs

| Surface | Inputs |
|---|---|
| Code editor | Single textarea bound to `content.raw` |
| Find/Replace | Find input, Replace input, Match-case toggle, Match-whole-word toggle |
| Command palette | Single search input |
| Inserter | Single search input |

Validation:
- Code editor: on exit, `wp.blocks.parse()` runs; invalid blocks rendered with `core/missing` and offered recovery.
- Find/Replace: Replace All operates atomically (single transaction in undo stack).

---

## 10. Routing & URL state

Modes are stored in `core/preferences` (per user, persisted across sessions for "preference" toggles) or `core/edit-post` ephemeral state (for "per-session" toggles like List View open/closed).

Recommended shell URL params:
```
#/editor?type=post&id=123&fullscreen=1
#/editor?type=post&id=123&list-view=1
#/editor?type=post&id=123&distraction-free=1
```

---

## 11. Inter-app navigation

| Trigger | Destination |
|---|---|
| Inserter → "Manage all reusable blocks" | `wp_block` post-type list |
| Patterns inserter → "Manage patterns" | Site Editor patterns or `wp_block` list |
| Command palette → any global command | Cross-app navigation supported (e.g. "Go to Site Editor") |
| List View → block click | Stays in editor (canvas selection change) |

The command palette is the **primary cross-app navigator** in WP 6.6+; the shell's `core:command-palette` source mirrors this.

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Pattern inserted | Snackbar: "Pattern inserted." (auto-dismiss) |
| Code editor exit with invalid markup | Inline notice on canvas: "This block contains unexpected or invalid content." Offers Resolve / Convert to HTML |
| Find/Replace replace all | Snackbar: "{N} matches replaced." |
| Mode toggled | Silent — UI change is the feedback |
| Welcome guide closed | Preference flag set; not shown again unless re-opened |

---

## 13. Accessibility & keyboard

### List View
- `role="treegrid"`; rows are `role="row"`; cells `role="gridcell"`.
- Arrow up/down to navigate rows; arrow left/right to expand/collapse.
- Home/End to jump to first/last row.
- Enter to select block in canvas.
- Drag-and-drop has keyboard equivalent: Cmd/Ctrl+↑ / Cmd/Ctrl+↓ to reorder.

### Inserter
- `role="listbox"` for results; arrow-key navigation.
- Enter inserts.
- Esc closes.

### Code editor mode
- Canvas region replaced; focus moves to textarea.
- Exit button receives focus when re-entered via keyboard.

### Distraction-free
- Inspector and list view become unreachable until exited.
- Esc on focused canvas does NOT exit — must use shortcut Cmd/Ctrl+Alt+/.

### Find/Replace
- Find input gains focus on open.
- Esc closes.
- F3 / Cmd/Ctrl+G next; Shift+F3 prev (where supported).

### Command palette
- Search input gains focus on open.
- Up/down arrows navigate results.
- Enter executes.
- Esc closes; restores focus to where it was before opening.
- `aria-live="polite"` announces result count.

### Keyboard shortcuts modal
- Lists are screen-reader navigable; each shortcut row is `role="row"`.

---

## 14. Extension points

### List View
- 6.4+ rich-text content extraction in row labels (heading text, button label) — not formally extensible.

### Inserter
- `__experimentalSetCallback` / `__experimentalSelector` (private) — used by site editor for custom inserters; not stable API.
- Block registration filters control what appears: `blocks.registerBlockType` filters can hide blocks per-context.
- Pattern registration: `register_block_pattern()` (PHP) and `wp.blocks.registerBlockPattern()` (JS).

### Command palette
- Plugins register commands via `wp.data.dispatch('core/commands').registerCommand({name, label, callback, icon, context})`.
- Context-scoped commands available in specific surfaces (e.g. `block-toolbar` context appears only when block selected).

### Welcome guide
- 6.4+ `wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false)`.

---

## 15. Mapping & implementation status

### Current shell coverage
- The shell's `core:command-palette` system app already integrates with `@wordpress/commands` global registry and surfaces a Cmd+K palette. All modes/inserter/list-view are absent from `core:simple-editor` and rely on the iframed `core:editor`.

### Gaps (rebuild list)

| Gap | Priority | Notes |
|---|---|---|
| List View panel host | High | `__experimentalListView` from `@wordpress/block-editor` |
| Document Overview tab | Medium | `DocumentOutline` from `@wordpress/editor` |
| Inserter — Blocks tab | High | `Inserter` from `@wordpress/block-editor` |
| Inserter — Patterns tab | High | Patterns must be preloaded; inserter renders them automatically |
| Inserter — Media tab (6.5+) | Medium | `__experimentalInserterMediaCategories` |
| Inserter — Synced patterns tab | Medium | wp_block post-type pivots into inserter |
| Code editor mode | Medium | `CodeEditor` |
| Distraction-free mode | Medium | Preference + body-class toggle + chrome auto-hide |
| Fullscreen mode | Low | Body-class toggle; default ON in WP since 6.0 |
| Spotlight mode | Low | Body-class; CSS dims `:not(.is-selected)` blocks |
| Top toolbar mode | Low | Re-anchors block toolbar to header — block-editor `BlockToolbar isFixed` mode |
| Zoom-out mode (6.5+) | Medium | `__unstableSetEditorMode('zoom-out')` |
| Find/Replace overlay (6.5+) | Medium | `EditorFindReplace` (private until stabilized) |
| Welcome guide modal | Low | `WelcomeGuide` |
| Keyboard shortcuts modal | Medium | `KeyboardShortcutHelpModal` |
| Command palette host | Done | Shell already mounts `core:command-palette` |
| Command palette: register editor commands | Medium | Each toggle/action above must register a command |
| Patterns preload (`block_editor_rest_api_preload_paths`) | High | Without preload, patterns fetch is a 200ms-1s network blocker |
| Synced-pattern (wp_block) inserter integration | Medium | `getEntityRecords('postType', 'wp_block')` |
| Block recovery UI on code-editor exit | Medium | `BlockEditor` ships this when given the canonical providers |

---

## 16. Out of scope

- **Custom inserter providers** (replacing the entire inserter) — private API; defer.
- **Pattern editing in-place from inserter** — has to navigate to `wp_block` editor.
- **Multi-find/replace across multiple posts** — single-document only.
- **Voice / dictation modes** — none in core.

---

## 17. Reference

- List View: Gutenberg `packages/block-editor/src/components/list-view/`
- Inserter: `packages/block-editor/src/components/inserter/`
- Patterns store: `packages/core-data/src/entities.js`, `block-patterns/patterns` REST
- Code editor: `packages/editor/src/components/text-editor/`
- Mode preferences: `packages/preferences/src/store/reducer.js`
- Zoom-out: `packages/edit-site/src/components/global-styles/zoom-out-toggle.js`
- Find/Replace: 6.5+ private `packages/editor/src/components/find-replace/`
- Command palette: `@wordpress/commands` package
- Welcome guide: `packages/edit-post/src/components/welcome-guide/`

**Companion files:**
- [`editor-block.md`](./editor-block.md)
- [`editor-block-inspector.md`](./editor-block-inspector.md)
- [`editor-block-data.md`](./editor-block-data.md)
