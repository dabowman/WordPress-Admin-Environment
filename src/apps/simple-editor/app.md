# core:simple-editor

Prose accompanying `app.json#documentation` for the inline minimal block editor.

## Overview

SimpleEditorApp is the Substack-style entry: title + a constrained block tree + auto-save. It exists to prove the kernel can host a block editor inline (not iframed), and to be the reference implementation for shells that want a writer-focused editor without the full `@wordpress/edit-post` surface (post settings, plugins panel, distraction-free mode, etc.). Composes Gutenberg's primitives directly: `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList`. The block list renders in the shell's DOM tree so block styles inherit from the engine's ThemeProvider — no iframe boundary.

## Architecture

**Routing.** Same shape as EditorApp — `#/{segment}/{postId}/edit` mounts directly; `#/{segment}/new` creates a draft, captures the id, `history.replaceState`s to the existing-post URL. The `segment` is `posts` for `postType=post`, `pages` for `postType=page`.

**Entity data.** `useEntityRecord('postType', postType, postId)` returns `{ record, editedRecord, edit, save, hasEdits, isSaving, isResolving }`. `edit({ title, content, status })` is the local-edit accumulator; `save()` flushes the accumulated edits to REST.

**Block-tree hydration.** A one-shot — parse `record.content.raw` after the first record arrives, set the `hydrated` flag, never re-parse. Re-parsing on subsequent records updates would clobber in-progress edits. Block state lives in local `useState` so the BlockEditorProvider has a stable identity; `onChange` syncs serialized HTML back to the entity edit via `edit({ content })`.

**Auto-save.** A single `setTimeout` ref scheduled on every change while `hasEdits`. Two-second debounce; if another edit lands first, the existing timer is cleared. Publish/Update flushes the pending timer + calls `save()` synchronously so there's no double-save race.

**Status indicator.** The `saveStatus` state machine (`idle | saving | saved | error`) drives the toolbar status text. `saved` auto-fades back to `idle` after 2s via a second `setTimeout`.

**Dirty-state.** `useDirtyState(regionId, hasEdits, { blocksNavigation: true })` reports unsaved-state to the kernel. The NavigationGuard component (shell-level) shows the standard "unsaved changes" confirmation on `beforeunload`, Navigation API, and intra-shell route changes.

**Title input.** Native `<input type="text">` outside the block tree — not a "title block". Tab/Enter from the title focuses the first contenteditable in the body. The shell mounts the editor with `core:autofocus-target` pointing at this input so a fresh editor lands cursor-in-title.

## Rebuild guide

The Gutenberg primitives are tightly coupled — `BlockEditorProvider` expects a specific settings shape, block types must be registered against the global block-type registry, etc. A non-Gutenberg rebuild needs to replace the block tree wholesale (TipTap, Lexical, ProseMirror, Slate) and adopt the surrounding shell patterns:

1. **Toolbar with back, status, save** — Stack of three controls. Back navigates to the list; status reflects save state; save is the primary action with `loading` indicator + label that flips between Publish/Update.
2. **Title + body layout** — Native input for the title, rich-text editor below it. Tab/Enter from title focuses first body element.
3. **Entity-record save semantics** — Local accumulator of edits + `save()` flush. Don't write to the server on every keystroke; batch via the auto-save timer.
4. **Auto-save debounce** — Single timer ref, cancellable on flush. 2s feels about right; tighter risks spam, looser feels stale.
5. **Dirty-state contract** — Report unsaved state to whatever NavigationGuard your host shell ships; block navigation when dirty.
6. **Draft seed for new posts** — REST rejects empty-everything posts; seed a placeholder block (any non-empty content) so the auto-draft saves before the user types.

## Known limitations

- **Featured image, taxonomy, excerpt, scheduling** — out of scope for MVP. Future "post settings panel" adds them.
- **Slot is exposed but no plugin contributes today.** `core:editor.sidebar` slot accepts `{ postId, postType, status }` fillProps; extensions would use this hook to add side panels without forking the app.
- **Hydration is one-shot.** Reloading the record from elsewhere in the app (e.g. an external panel mutating status) would not re-parse the block tree. Edge case but worth flagging.
- **Block library registers all ~30 core blocks** even though `allowedBlockTypes` restricts the slash menu to nine. A future iteration may switch to per-block lazy registration via `registerCoreBlock` to avoid loading unused blocks.
- **`editedRecord.title` shape inconsistency** — sometimes a string (from a previous local edit), sometimes an object (from REST). The titleValue reader handles both; `core-data` should arguably normalize this.
