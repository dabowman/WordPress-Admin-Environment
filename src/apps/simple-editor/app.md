# core:simple-editor

Prose accompanying `app.json#documentation` for the inline minimal block editor.

## Overview

SimpleEditorApp is the Substack-style entry: title + a constrained block tree + a native document-settings sidebar + auto-save. It exists to prove the kernel can host a block editor inline (not iframed), and to be the reference implementation for shells that want a writer-focused editor without the full `@wordpress/edit-post` surface (block inspector, plugins panel, distraction-free mode, etc.). Composes Gutenberg's primitives directly: `BlockEditorProvider` + `BlockTools` + `WritingFlow` + `ObserveTyping` + `BlockList`. The block list renders in the shell's DOM tree so block styles inherit from the engine's ThemeProvider — no iframe boundary.

**Guiding principle (issue #119).** `core:simple-editor` is a lightweight **content-creation** surface — writing / blogging, Substack-style — *not* page-building or design. The sidebar reuses core *plumbing* (the post entity, the `/autosaves` endpoint, `@wordpress/dataviews` / `@wordpress/components` control primitives, the core media modal) but **not** core's document **UI** (`@wordpress/editor`'s `EditorProvider` / `PostSchedule` / `PostTaxonomies`, which drag the heavy editor store in). It is native, built from `DataForm`-style field controls + a hand-rolled `PublishPanel`.

## Architecture

**Routing.** Same shape as EditorApp — `#/{segment}/{postId}/edit` mounts directly; `#/{segment}/new` creates a draft, captures the id, `history.replaceState`s to the existing-post URL. The `segment` is `posts` for `postType=post`, `pages` for `postType=page`.

**Entity data.** `useEntityRecord('postType', postType, postId)` returns `{ record, editedRecord, edit, save, hasEdits, isSaving, isResolving }`. `edit({ title, content, status })` is the local-edit accumulator; `save()` flushes the accumulated edits to REST.

**Block-tree hydration.** A one-shot — parse `record.content.raw` after the first record arrives, set the `hydrated` flag, never re-parse. Re-parsing on subsequent records updates would clobber in-progress edits. Block state lives in local `useState` so the BlockEditorProvider has a stable identity; `onChange` syncs serialized HTML back to the entity edit via `edit({ content })`.

**Auto-save (shared hook).** The 2s-debounce autosave is the shared `useEntityAutosave` hook (`src/apps/_shared/forms/useEntityAutosave.js`), extracted from this app (issue #119) so the document-settings sidebar — and any future autosave-inspector host (e.g. #109 Media) — commits through one path. The hook owns: a single `setTimeout` ref scheduled on every change while `hasEdits` (cleared if another edit lands first), the save-status state machine, `useRestBase` (CPT `rest_base` derivation, issue #210), and the parent-vs-revision routing below. It returns `{ saveStatus, saveError, isBusy, runSave, flush, cancelPending }`. Publish/Update calls `flush()` (cancel pending timer + `save()` synchronously) so there's no double-save race.

The autosave target is status-gated to mirror core's autosaves controller (`autosaveTarget()` in `autosave.mjs`, the pure unit-tested primitive the hook consumes): **draft / auto-draft** posts flush the accumulated edits to the live record via `save()` (`PUT`), just as core's controller calls `wp_update_post` on the parent. **Pending / published / private / scheduled (`future`)** posts route the debounced autosave to `POST /wp/v2/{rest_base}/{id}/autosaves` instead, writing a per-user autosave revision and leaving the live record untouched. The edits stay accumulated in `editedRecord` (`hasEdits` remains true) until the author explicitly clicks **Update**, which calls `save()` and pushes them live. Any unknown/missing status fails closed to the autosaves path so an unrecognised state can never clobber a live record. This closes the issue-#101 data-integrity divergence where every 2s debounce PUT the live published post.

**Document-settings sidebar (issue #119).** A native sidebar rendered as `<Fill name="core:editor.sidebar">` (in `DocumentSettingsSidebar.js`), composing with the editor's `<Slot>` of the same name — plugin fills render alongside (after) the native panels, so the slot is never monopolized (the #20 plugin-extension vision). Every panel mutates the **same** `postType:{type}:{id}` entity via buffered `edit()`; the shared autosave debounce commits the changes. No new endpoint. Panels (each gated where appropriate on the resolved post-type entity's `supports` / `taxonomies` / `capabilities`):

| Panel | Field(s) | Control |
|---|---|---|
| Status & visibility / Publish-Schedule (`PublishPanel`, hand-rolled) | `status` (`private`) + `password`, `date` | visibility `SelectControl`, password input, `datetime-local`. Selected visibility is held in local `useState` (seeded from `deriveVisibility`) so "Password protected" sticks — and the password input reveals — before a password exists; `deriveVisibility` alone would snap the select back to Public. |
| URL | `slug` | text input |
| Categories | `categories[]` | `CheckboxControl` checklist (taxonomy slug `category`) |
| Tags | `tags[]` | `FormTokenField` (taxonomy slug `post_tag`) |
| Excerpt | `excerpt.raw` | `TextareaControl` |
| Featured image | `featured_media` | `MediaUpload` / `MediaUploadCheck` (core media modal) |
| Author | `author` | `SelectControl`, cap-gated on `edit_others_posts`. Options come from `useEntityRecords('root','user',{ who:'authors' })` — `who=authors` (NOT `capabilities[]=edit_posts`, which requires the admin-only `list_users` cap and would 403 for the Editors this panel targets). |
| Discussion | `comment_status`, `ping_status` | `FormToggle` ×2 (gated on comment support) |

`PublishPanel` is the one deliberately hand-rolled bit — the *simple* version of core's publish matrix (Draft / Publish / Schedule / Private + password), bounded by the `block-editor.md` §4 field mapping. The toolbar Publish button sets `status` to `publish` / `private` / `future` (future-dated) and flushes.

**Scope fences (explicit).** Document-tab metadata **only** — **NO Block tab / per-block inspector / block supports / design controls**, **NO Page Attributes** (parent / `menu_order` / template), **NO custom fields / meta**, **NO post-format / sticky**. The canvas stays the constrained core-block writing surface; design is left to future pre-made patterns, never this sidebar.

> Core *also* gates the parent-update on the editor being the post author; this helper is status-only, so an admin autosaving someone else's draft PUTs the parent where core would write a revision. Lower-frequency, accepted divergence.

**Status indicator.** The `saveStatus` state machine (`idle | saving | saved | autosaved | error`) drives the toolbar status text. `saved` is a live-record flush; `autosaved` is the per-user revision path for published/scheduled posts (the live record still has pending edits). Both auto-fade back to `idle` after 2s via a second `setTimeout`; after an `autosaved` fade the `Unsaved changes` indicator returns because `hasEdits` is still true.

The autosaves endpoint only persists `title` / `content` / `excerpt`; the sidebar's metadata edits (slug, categories, tags, featured_media, author, comment_status, date, status, password) stay buffered until the author clicks Update — matching core. So `useEntityAutosave` **suppresses** the `autosaved` status whenever the buffered edit set (read via `getEntityRecordEdits`) contains any non-content field: the content revision is still written, but `saveStatus` drops straight back to `idle` so the toolbar reads `Unsaved changes` (accurate — the metadata change is still pending) rather than flashing a misleading `Auto-saved`.

**Dirty-state.** `useDirtyState(regionId, hasEdits, { blocksNavigation: true })` reports unsaved-state to the kernel. The NavigationGuard component (shell-level) shows the standard "unsaved changes" confirmation on `beforeunload`, Navigation API, and intra-shell route changes.

**Title input.** Native `<input type="text">` outside the block tree — not a "title block". Tab/Enter from the title focuses the first contenteditable in the body. The shell mounts the editor with `core:autofocus-target` pointing at this input so a fresh editor lands cursor-in-title.

## Rebuild guide

The Gutenberg primitives are tightly coupled — `BlockEditorProvider` expects a specific settings shape, block types must be registered against the global block-type registry, etc. A non-Gutenberg rebuild needs to replace the block tree wholesale (TipTap, Lexical, ProseMirror, Slate) and adopt the surrounding shell patterns:

1. **Toolbar with back, status, save** — Stack of three controls. Back navigates to the list; status reflects save state; save is the primary action with `loading` indicator + label that flips between Publish/Update.
2. **Title + body layout** — Native input for the title, rich-text editor below it. Tab/Enter from title focuses first body element.
3. **Entity-record save semantics** — Local accumulator of edits + `save()` flush. Don't write to the server on every keystroke; batch via the auto-save timer.
4. **Auto-save debounce** — Single timer ref, cancellable on flush. 2s feels about right; tighter risks spam, looser feels stale. **Gate the autosave target by status**: only true draft-like posts (draft / auto-draft) should write back to the live record; pending / published / scheduled posts must write a per-user autosave revision (`POST .../autosaves`) so an in-progress autosave never overwrites under-review or public content.
5. **Dirty-state contract** — Report unsaved state to whatever NavigationGuard your host shell ships; block navigation when dirty.
6. **Draft seed for new posts** — REST rejects empty-everything posts; seed a placeholder block (any non-empty content) so the auto-draft saves before the user types.

## Known limitations

- **Page Attributes / templates / custom meta / post-format / sticky** — deliberately **out of scope** (issue #119 scope fences), not a gap to be closed. The simple editor stays a writing surface; structural/design metadata belongs to the full `core:editor` (iframed) or to future pattern tooling.
- **Tags create-on-the-fly is not supported.** The tag token field only assigns *existing* term ids — unknown tokens are dropped rather than creating a new tag via REST. Core's editor creates missing tags inline; matching that needs a `saveEntityRecord('taxonomy','post_tag',…)` per new token before assignment. (Taxonomy entities are keyed by slug — `category` / `post_tag` — not the REST base.)
- **`core:editor.sidebar` is a shared slot.** The native document-settings panels fill it via `<Fill>`; plugin fills (`{ postId, postType, status }` fillProps) render alongside. No plugin ships one today, but the slot is no longer empty.
- **Hydration is one-shot.** Reloading the record from elsewhere in the app (e.g. an external panel mutating status) would not re-parse the block tree. Edge case but worth flagging.
- **Block library registers all ~30 core blocks** even though `allowedBlockTypes` restricts the slash menu to nine. A future iteration may switch to per-block lazy registration via `registerCoreBlock` to avoid loading unused blocks.
- **`editedRecord.title` shape inconsistency** — sometimes a string (from a previous local edit), sometimes an object (from REST). The titleValue reader handles both; `core-data` should arguably normalize this.
- **Custom post type support.** The REST base is derived from the post-type entity (`getPostType(postType)?.rest_base` via `useRestBase`) so CPTs with a custom `rest_base` route correctly for draft creation, the autosaves endpoint, and `backHref`. Draft creation is gated on the entity resolving (returns early while `postTypeRestBase === undefined`) to prevent a stray `post` draft being created against the wrong route. The classic `post`/`page` ternary is kept as an immediate fallback for built-in types. A CPT must have `show_in_rest: true` for this editor to function — without a REST API it cannot save. **Constraint:** `backHref` and the `replaceState` URL after draft creation both use `rest_base` as the client-router path segment (e.g. `#/{rest_base}/{id}/edit`). A CPT whose `rest_base` differs from its list-screen route path in the shell config will produce a broken back link and a wrong post-edit URL. Deriving the router target from the matched route config is out of scope here; keep `rest_base` and the list-screen `path` in sync when wiring a CPT to this editor.
- **No "newer autosave" recovery banner.** Pending / published / scheduled autosaves now land in a per-user autosave revision (issue #101), but the app does not yet read it back: there is no `modified_gmt` comparison on load and no banner offering to restore a newer autosave. So an autosave for a non-draft post is write-only — it protects the live record but the author can only recover the edits within the same session (the edits remain in `editedRecord` until Update). Full parity needs the recovery banner (parity audit, block-editor.md API blocker #3).
