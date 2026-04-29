# Implementation Plan: SimpleEditorApp (Substack-style editor)

Spec: inline (this document — no separate spec yet)

## Goal

Native React block editor app for the shell. Substack-style: distraction-free, text-first, narrow centered column, floating toolbars. Built with `@wordpress/block-editor` primitives. Lives **alongside** existing iframe `EditorApp` — config picks which app a shell uses. Intended for simplified shells (e.g. content-author).

## Scope (MVP)

**In:**
- Title (native input bound to `post.title`)
- Body (block editor, restricted block set)
- Auto-save (debounced)
- Publish / Update button
- Save status indicator
- Shell route + sourceRegistry entry

**Out (deferred to future post settings panel):**
- Subtitle / excerpt
- Featured image
- Taxonomy (tags, categories)
- Scheduling, visibility, revisions, slug, author

## Architecture

- New source: `core:simple-editor` → `src/apps/SimpleEditorApp.js`
- Composes: `BlockEditorProvider`, `BlockCanvas` (iframe), `BlockList`, `WritingFlow`, `ObserveTyping`, `BlockTools`
- Data layer: `useEntityRecord('postType', 'post', id)` for load/edit/save
- New post: `apiFetch` POST to create draft (matches `EditorApp` pattern)
- Existing iframe `EditorApp` stays untouched as escape hatch

### Allowed blocks
`core/paragraph`, `core/heading`, `core/image`, `core/quote`, `core/list`, `core/list-item`, `core/code`, `core/separator`, `core/embed`

### Layout
- `__experimentalFeatures.layout.contentSize: 680px` — narrow column
- Title input above canvas (not inside block tree)
- No `BlockInspector`, no document sidebar

## Tasks

- [ ] **Task 1: Source registration + routing**
  - Files: `src/config/sourceRegistry.js`, `src/routing/router.js` (verify dynamic routes work for `/simple-editor/:id`)
  - Add `core:simple-editor` mapping → `SimpleEditorApp` (lazy/static import per existing pattern)
  - Verify route param parsing matches existing `EditorApp` flow
  - Depends on: none
  - Tests: nav to `/simple-editor/123` resolves component, no console errors
  - Parallelizable: yes (independent of editor implementation)

- [ ] **Task 2: SimpleEditorApp scaffold + entity load**
  - Files: `src/apps/SimpleEditorApp.js` (new)
  - Read `postId` from route; `useEntityRecord('postType', 'post', postId)`
  - New-post flow: if no `postId`, `apiFetch` POST `/wp/v2/posts` with `status: 'draft'`, then redirect to `/simple-editor/{newId}`
  - Render placeholder while loading
  - Depends on: Task 1
  - Tests: existing post loads title + content; new-post URL creates draft and redirects
  - Parallelizable: no

- [ ] **Task 3: Block registration guard**
  - Files: `src/apps/SimpleEditorApp.js`
  - Call `registerCoreBlocks` once on mount; guard against double-registration with `getBlockTypes().length` check
  - Pass `allowedBlockTypes` array to provider settings
  - Depends on: Task 2
  - Tests: blocks register exactly once across mount/unmount/remount; slash menu only shows allowed types
  - Parallelizable: no

- [ ] **Task 4: Editor body (BlockEditorProvider + BlockCanvas iframe)**
  - Files: `src/apps/SimpleEditorApp.js`, `src/index.css` (or new `SimpleEditorApp.css`)
  - Wire `BlockEditorProvider` (value = blocks, onInput, onChange) → `BlockCanvas` (iframe) → `WritingFlow` → `ObserveTyping` → `BlockList`
  - Parse `record.content.raw` → blocks on load
  - Wrap in `BlockTools` for floating selection toolbar
  - Depends on: Task 3
  - Tests: typing works; floating format toolbar appears on selection; slash menu inserts blocks; iframe isolates styles
  - Parallelizable: no

- [ ] **Task 5: Title input**
  - Files: `src/apps/SimpleEditorApp.js`, CSS
  - Native `<input>` above canvas, value bound to `record.title`
  - onChange → `editEntityRecord('postType', 'post', id, { title })`
  - Tab from title → first block (focus bridge into iframe)
  - Empty placeholder: "Title"
  - Depends on: Task 4
  - Tests: title persists; tab order works; long titles wrap correctly
  - Parallelizable: no

- [ ] **Task 6: Auto-save (debounced)**
  - Files: `src/apps/SimpleEditorApp.js`
  - Debounce 2000ms after last edit; call `saveEditedEntityRecord('postType', 'post', id)`
  - Track save state: idle / saving / saved / error
  - Cancel pending save on unmount
  - Depends on: Tasks 4 + 5
  - Tests: edit → wait 2s → network call fires; rapid edits coalesce; unmount aborts
  - Parallelizable: no

- [ ] **Task 7: Publish button + save status**
  - Files: `src/apps/SimpleEditorApp.js`, `src/shell/ShellToolbar.js` (slot for app-injected actions)
  - Button label: "Publish" if `status === 'draft'`, "Update" if `status === 'publish'`
  - Click → flush pending auto-save → set `status: 'publish'` → save
  - Render save-status indicator next to button (Saving… / Saved / Error)
  - Decision: render via Slot/Fill or pass through ShellLayout prop — pick simpler. Slot/Fill preferred for app-injected toolbar content.
  - Depends on: Task 6
  - Tests: draft → publish flips label and status; auto-save in flight is awaited; error shows correct state
  - Parallelizable: no

- [ ] **Task 8: Substack typography + spacing**
  - Files: CSS
  - Title: ~48px, semibold, system serif fallback stack
  - Body: 18–20px, line-height 1.7
  - 680px max-width, centered, generous top padding
  - Hide block UI noise: advanced inspector buttons, block transform menu (keep format toolbar)
  - Empty paragraph placeholder text: "Tell your story…"
  - Depends on: Task 4
  - Tests: visual review on content-author shell; no horizontal scroll; reads cleanly on 1280px and 1920px viewports
  - Parallelizable: yes (parallel with Task 6/7 once Task 4 lands)

- [ ] **Task 9: Restrict slash inserter results**
  - Files: `src/apps/SimpleEditorApp.js`
  - Verify `allowedBlockTypes` filters slash menu correctly. If not, register a custom inserter media category or use `__experimentalBlockPatterns: []` to suppress patterns
  - Suppress block patterns in inserter (keep menu minimal)
  - Depends on: Task 4
  - Tests: typing `/` shows only the 9 allowed blocks; no patterns tab; no reusable blocks
  - Parallelizable: yes (parallel with Task 8)

- [ ] **Task 10: Demo wiring**
  - Files: `shells/content-author.json`
  - Swap `core:editor` → `core:simple-editor` for the editor app entry in content-author config
  - Keep `developer-admin.json` on `core:editor` (iframe escape hatch)
  - Depends on: Tasks 1–7
  - Tests: switching to content-author shell opens SimpleEditorApp on edit; switching to developer-admin opens iframe editor
  - Parallelizable: yes (after Tasks 1–7 land)

- [ ] **Task 11: Docs**
  - Files: `docs/wp-admin-shell-mvp-spec.md`, `docs/wp-admin-shell-agent-context.md`, `CLAUDE.md`
  - Document `core:simple-editor` source in application sources table
  - Note experimental APIs used (`__experimentalFeatures`, `BlockCanvas`)
  - Note allowed-block list and how to extend
  - Depends on: Tasks 1–10
  - Tests: docs render cleanly; agent-context has actionable notes for future work
  - Parallelizable: yes (after Task 10)

## Parallelization summary

Sequential spine: 1 → 2 → 3 → 4 → 5 → 6 → 7

Parallel branches (after Task 4 lands):
- 8 (typography) ‖ 9 (inserter restriction)

Final integration: 10 (demo wiring) → 11 (docs)

## Open questions (resolve during implementation)

1. **Slot/Fill vs prop drilling for toolbar actions.** Lean Slot/Fill — keeps `ShellLayout` agnostic of app internals.
2. **Iframe focus bridge from title → first block.** May need `useRef` + manual `.focus()` on the iframe's first contentEditable. Test cross-browser.
3. **`allowedBlockTypes` enforcement in slash menu.** WP behavior has shifted across versions; verify on 6.7 target. Fallback: filter in custom inserter component.
4. **Block registration scope.** If multiple shell apps eventually need core blocks, lift `registerCoreBlocks` to a higher boundary (e.g. `Shell.js` mount). For MVP keep in SimpleEditorApp with idempotent guard.

## Risks

- `@wordpress/block-editor` API surface includes experimental flags — pin to WP 6.7+ behavior, document in agent-context
- Iframe canvas styling requires CSS to be enqueued into the iframe (block editor handles this for core block styles, but custom shell CSS won't leak in — desired)
- Auto-save races with publish click — Task 7 must await pending save before status flip
- Bundle: `@wordpress/block-editor` is external (loaded from WP core), so no bundle hit — but runtime cost is real. Verify no regressions on PostsApp / MediaApp routes
