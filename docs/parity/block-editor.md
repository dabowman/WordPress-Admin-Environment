# Parity: Block Editor (core:editor + core:simple-editor)

> Audited 2026-05-29 against WordPress 7.0 core. Shell apps: `src/apps/editor/` (iframe adapter) + `src/apps/simple-editor/` (native restricted mount). Classic counterpart: `src/wp-admin/post.php` (router) + `src/wp-admin/post-new.php` (new entry) + `src/wp-admin/edit-form-blocks.php` (renderer) → `@wordpress/edit-post` + `@wordpress/editor` + `@wordpress/block-editor`.

## Verdict

**Major gaps** (two apps, two very different parity stories — neither reaches the full editor, so the worst case governs the headline).

- **`core:editor` (iframe → `post.php`)** is at **near-parity for the editing surface** because it loads the real WordPress block editor inside a chrome-stripped iframe. The editing canvas, inspector, inserter, patterns, autosave, post-lock, revisions, pre-publish, and every plugin slot all work — they are WordPress's, not the shell's. The gaps are at the **integration seam**: dirty-state is *declared but not wired* (the shell's `NavigationGuard` is blind to the iframe's unsaved state), the iframe does **not** install the `iframeBridge` (so in-iframe navigation — "View Post", the post-trash redirect, "Manage Patterns" — escapes the workspace or breaks), there is **no session-expiry / `wp-auth-check` recovery** (the sibling `iframe-fallback` app has all of this; `core:editor` has none of it), and the post-trash redirect bounces to `edit.php` which re-enters the hijack rather than landing on the shell's list.
- **`core:simple-editor` (native `BlockEditorProvider`)** is **major gaps by design**: title + 9 allowed blocks, no inspector, no inserter panel, no patterns, no list view, no featured image / taxonomy / excerpt / slug / scheduling / visibility / page-attributes, no undo-redo UI, no preview, no code editor, no fullscreen, no command palette, no revisions, **no post-lock**, and — the data-loss finding — **its 2-second debounced `save()` writes directly to the live published post** (core routes published-post autosaves to a separate per-user autosave row via `POST .../autosaves`; simple-editor PUTs the live record).

Both are explicitly positioned as interim (`app.md` "v2-beta concession" / "MVP scope"), and the full native `@wordpress/edit-post` mount is deferred pending the five SiteEditorApp blockers. The audit's job is to enumerate exactly what is missing and which gaps are shell-fixable vs upstream.

## Counterpart mapping

- **Classic screen(s):**
  - `src/wp-admin/post.php` — the router. Handles `action=edit` (caps gate at line 138, trash-409 at line 142, `wp_set_post_lock` at line 148/192), `action=trash` (line 238, redirects to `edit.php` at line 264), `untrash`, `delete`, `editpost`. **No list-table class** — the editor is a single-record screen.
  - `src/wp-admin/post-new.php` — new-post entry; creates an auto-draft and falls through to `edit-form-blocks.php`.
  - `src/wp-admin/edit-form-blocks.php` — the renderer. Enqueues `wp-edit-post` + `heartbeat`, builds the `$preload_paths` array (lines 61-118), sets the heartbeat interval to **10s for post-lock refresh** (line 193), preloads **lock details** via `wp_check_post_lock`/`wp_set_post_lock` (lines 216-248), preloads `AUTOSAVE_INTERVAL` + `postLock` into editor settings (lines 271-273), surfaces the **newer-autosave banner** (lines 291-298), and wires the **back-compat meta-box AJAX loader** (`meta-box-loader=true`, lines 175-188).
  - JS surface: `@wordpress/edit-post` (`packages/edit-post/src/editor.js`), `@wordpress/editor` (`PostPublishPanel`, `PostFeaturedImage`, `PostTaxonomies`, `PostSchedule`, `PostVisibility`, `PostSlug`, `PostExcerpt`, `PostAuthor`, `PageAttributes`, `EditorHistoryUndo/Redo`, `PostPreviewButton`, `PostSwitchToDraftButton`, `CodeEditor`, `KeyboardShortcutHelpModal`), `@wordpress/block-editor` (`Inserter`, `BlockInspector`, `BlockToolbar`, `__experimentalListView`), `@wordpress/commands`, `@wordpress/preferences`, `@wordpress/notices`.

- **REST / core-data surface used by the shell apps:**
  - `core:editor` (iframe): writes only — `POST /wp/v2/posts | /wp/v2/pages` (auto-draft creation, `src/apps/editor/index.js:81-95`). All editing data flows through the *iframed* `post.php`, which uses core's full preload + REST stack. Reads `window.wpAdminShell.adminUrl` for the iframe `src`.
  - `core:simple-editor` (native): `useEntityRecord('postType', postType, postId)` (`src/apps/simple-editor/index.js:228-236`) — `GET`/`PUT /wp/v2/{posts|pages}/{id}` with `context: 'edit'` (declared in `app.json:45`). Auto-draft create: `POST /wp/v2/{posts|pages}` (`index.js:143-151`). **Does not touch** `/autosaves`, `/revisions`, block-types, block-patterns, blocks, global-styles, or `/batch/v1`.

- **Project screen spec:** `docs/screens/editor-block.md` (overview/header/canvas/save) + `docs/screens/editor-block-inspector.md` + `docs/screens/editor-block-modes.md` + `docs/screens/editor-block-data.md` (REST/preload/autosave/revisions). This is the most complete tier-2 spec in the repo; the §15 gap tables there already enumerate most of what follows. The classic TinyMCE editor that §16 cross-references is specced separately in `docs/screens/editor-classic.md` (a full tier-2 spec, landed in PR #36) — the earlier "no `editor-classic.md` exists" note was a stale-snapshot artifact of this 2026-05-29 audit.

## Feature parity matrix

Two shell columns because the two apps diverge sharply. `editor` = `core:editor` iframe; `simple` = `core:simple-editor` native.

| Feature | wp-admin behavior | `editor` (iframe) | `simple` (native) | Status | Notes |
|---|---|---|---|---|---|
| **Edit existing post** | `post.php?post={id}&action=edit` (post.php:107/186) | iframes that URL (`index.js:168`) | `useEntityRecord` load + parse `content.raw` (`index.js:286-293`) | editor ✅ / simple 🟡 | simple is title+9-blocks only |
| **New post (auto-draft)** | `post-new.php` → `get_default_post_to_edit` creates `auto-draft` | `POST /wp/v2/posts` seeded paragraph, then `replaceState` to `/posts/{id}/edit` (`index.js:81-112`) | identical flow (`index.js:143-160`) | ✅ | Both seed `<!-- wp:paragraph --><p></p>` to dodge `empty_content` (post.php:4604) |
| **Empty-post REST guard** | `wp_insert_post_empty_content` → `WP_Error empty_content` (post.php:4602-4604) | seeds paragraph block | seeds paragraph block | ✅ | Verified against live source |
| **Title input** | rich-text contenteditable; `enter_title_here` filter; `title.raw` | core's (iframed) | native `<input>` + `title.raw`; Tab/Enter → first block (`index.js:313-323`) | editor ✅ / simple 🟡 | simple's is a plain input, not a rich-text title block; ignores `enter_title_here` |
| **Block canvas (WYSIWYG)** | full `@wordpress/block-editor` | core's (iframed) | `BlockEditorProvider`+`BlockList`+`WritingFlow`+`ObserveTyping` (`index.js:415-429`) | editor ✅ / simple 🟡 | simple has block list but no inspector/toolbar-host beyond `BlockTools` |
| **Allowed block set** | all registered blocks; `allowed_block_types_all` filter | full set (iframed) | 9 blocks via `allowedBlockTypes` setting (`index.js:55-65,339`) | editor ✅ / simple 🟠 | `allowedBlockTypes` is the correct editor-setting key; intentional restriction |
| **Block inserter (Blocks/Patterns/Media tabs)** | `Inserter` panel | full (iframed) | **none** — slash menu only, no `+` panel | editor ✅ / simple ❌ | spec §15 "Native full-canvas inserter — High" |
| **Block toolbar (transform/align/group/lock/move)** | floating `BlockToolbar` | full (iframed) | inherited from `BlockTools` (floating toolbar renders) but no top-toolbar option | editor ✅ / simple 🟡 | `BlockTools` does host the contextual toolbar; group/lock/transform present per block defaults |
| **Block inspector (Block tab + Advanced)** | `BlockInspector` sidebar | full (iframed) | **none** | editor ✅ / simple ❌ | No `InspectorControls` host → per-block color/typography/spacing/anchor/CSS unreachable |
| **Document settings sidebar** | Status, Visibility, Schedule, URL/slug, Author, Featured image, Excerpt, Discussion, Page attributes, Categories, Tags | full (iframed) | **none** (a `core:editor.sidebar` Slot exists at `index.js:432` but no fill ships) | editor ✅ / simple ❌ | The single biggest simple-editor gap cluster |
| → Featured image | `PostFeaturedImage` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `featured_media` field reachable via REST; just no UI |
| → Categories / Tags | `PostTaxonomies` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `categories[]`/`tags[]` REST-reachable |
| → Excerpt | `PostExcerpt` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `excerpt.raw` REST-reachable |
| → Slug / permalink | `PostSlug` + `PostPermalink` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `slug`/`permalink_template`/`generated_slug` REST-reachable (context=edit) |
| → Visibility (public/private/password) | `PostVisibility` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `status`/`password` REST-reachable |
| → Schedule (future date) | `PostSchedule` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `date`/`date_gmt` REST-reachable; simple can only publish "now" |
| → Author picker | `PostAuthor` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `author` REST-reachable |
| → Discussion (comments/pings) | `PostDiscussionPanel` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `comment_status`/`ping_status` REST-reachable |
| → Page attributes (parent/template/order) | `PageAttributes` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `parent`/`template`/`menu_order` REST-reachable |
| → Sticky / post-format | `PostSticky` / `PostFormat` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | `sticky`/`format` REST-reachable |
| **Patterns + synced patterns (reusable blocks)** | inserter "Patterns"/"My Patterns" tabs; `wp_block` CPT | ✅ (iframed) | **disabled** — `__experimentalReusableBlocks: []` + empty pattern arrays (`index.js:341-343`) | editor ✅ / simple ❌ | `/wp/v2/block-patterns/*` + `/wp/v2/blocks` REST-reachable |
| **List View / Document Overview** | `__experimentalListView` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | spec §15 High |
| **Undo / Redo** | `EditorHistoryUndo/Redo` + Cmd-Z | ✅ (iframed) | **no UI** (block-editor store has history but no toolbar buttons / Cmd-Z wiring beyond `BlockEditorKeyboardShortcuts`) | editor ✅ / simple 🟡 | `BlockEditorKeyboardShortcuts.Register` gives in-block undo; no document-level undo button |
| **Save / Publish button state machine** | Publish/Schedule/Submit-for-Review/Update/Save-as-pending matrix (spec §7) | full (iframed) | binary Publish↔Update only (`index.js:388-399`) | editor ✅ / simple 🟠 | No Schedule, no Submit-for-Review, no Save-as-pending, no Switch-to-Draft |
| **Save draft / Switch to draft** | `PostSwitchToDraftButton` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | Can't revert a published post to draft |
| **Save status indicator** | "Saving…/Saved/Save failed" via `aria-live` | core's (iframed) | `SaveStatus` text component (`index.js:28-53`); **not aria-live** by design | editor ✅ / simple 🟡 | Status is visible text only; spec §13 expects `aria-live=polite` |
| **Autosave (every 60s → /autosaves)** | `AUTOSAVE_INTERVAL`; published→`POST .../autosaves` (autosaves-controller), draft→PUT parent | core's (iframed) | **2s debounce PUT to live record** (`index.js:258-273`); **no /autosaves** | editor ✅ / simple ❌ | **Data-loss risk on published posts** — see API blockers |
| **"Newer autosave" recovery banner** | compares `modified_gmt` (edit-form-blocks.php:291-298) | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | No banner; no autosave row to compare against |
| **Local-storage offline backup** | `localAutosaveSet/Get` (sessionStorage) | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | spec §15 Medium |
| **Post lock (acquire + 10s heartbeat)** | `wp_set_post_lock` + `wp.heartbeat.interval(10)` (edit-form-blocks.php:193,243) | ✅ (iframed — inherits core) | ❌ **none** | editor ✅ / simple ❌ | Two users editing in simple-editor = silent last-write-wins clobber |
| **Lock takeover modal** | `?get-post-lock=1&_wpnonce` / heartbeat exchange | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | No REST equivalent (upstream gap) |
| **Revisions panel + restore** | revisions panel (`edit_post`); restore = `revision.php?action=restore` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | Revision **read** is REST; **restore** is not (upstream gap) |
| **Pre-publish panel** | `PostPublishPanel` (Visibility/Schedule/slug/featured-image/excerpt/tags checks) | ✅ (iframed) | ❌ — Publish saves immediately, no checks | editor ✅ / simple ❌ | spec §9 |
| **Post-publish panel** | confirmation + copy-link + share + add-new | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | |
| **Preview (desktop/tablet/mobile + new-tab + View Site)** | `PostPreviewButton` + `?preview=true&preview_id&preview_nonce` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | Preview link uses a nonce — see API blockers |
| **Code editor mode** | `CodeEditor` (Cmd+Shift+Alt+M) | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | |
| **Fullscreen mode** | `is-fullscreen-mode` toggle | ✅ (iframed, but **double chrome** — see divergences) | ❌ | editor 🟡 / simple ❌ | |
| **Distraction-free / Spotlight / Zoom-out** | preferences | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | |
| **Editor command palette (Cmd+K)** | `@wordpress/commands` | ✅ inside iframe (separate from shell's Cmd+K) | ❌ | editor 🟡 / simple ❌ | Two command palettes (iframe's + shell's) coexist; shell's Cmd+K can't act on iframe content |
| **Keyboard-shortcuts modal (Cmd+Shift+H)** | `KeyboardShortcutHelpModal` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | |
| **Find/Replace (Cmd+F)** | `EditorFindReplace` | ✅ (iframed) | ❌ | editor ✅ / simple ❌ | |
| **Meta boxes (back-compat)** | `meta-box-loader=true` AJAX iframe (edit-form-blocks.php:175-188) | ✅ (iframed — inherits core) | ❌ | editor ✅ / simple ❌ | Non-REST; pure server-render (upstream/structural gap) |
| **Plugin slots** (`PluginDocumentSettingPanel`, `PluginSidebar`, `PluginPostStatusInfo`, `PluginMoreMenuItem`, `PluginPrePublishPanel`, `BlockControls`, `InspectorControls`) | full `@wordpress/edit-post` slot host | ✅ (iframed — Yoast/Jetpack/ACF panels render) | ❌ — only a single bespoke `core:editor.sidebar` Slot, no fill | editor ✅ / simple ❌ | **simple breaks every SEO/marketing plugin.** editor preserves them by virtue of the iframe |
| **`unfiltered_html` honoring** | cap-gated; else `kses` strips | ✅ (server-enforced) | ✅ (server-enforced on PUT) | ✅ | Server is authoritative in both |
| **Capability gating (reach screen)** | `edit_posts` (post.php gate) | screen `permissions.capabilities: [edit_posts]` (shell) | same | ✅ | Shell screens declare `edit_posts`/`edit_pages` |
| → Edit-others / published / private | meta-cap map (`edit_post`/`edit_others_posts`/`edit_published_posts`) | server-enforced (iframed `post.php` does the `current_user_can('edit_post',$id)` at line 138) | **server-enforced on PUT only** — no client-side per-post cap check before mount | editor ✅ / simple 🟡 | simple mounts the editor for any `edit_posts` holder, then the PUT 403s; no friendly pre-mount 403 |
| **Trash 409 (post in trash)** | `wp_die(...,409)` (post.php:142) | iframe shows core's 409 page (chrome-hidden) | **no guard** — would load a trashed post into the editor | editor 🟡 / simple ❌ | simple has no `status==='trash'` block + Restore CTA (spec §3) |
| **Permission-denied (403)** | `wp_die` 403 page (post.php:139) | iframe shows core's 403 (chrome-hidden) | generic error string from REST `err.message` (`index.js:182-196`) | editor 🟡 / simple 🟡 | Neither renders the spec's "403 inside the editor region preserving shell chrome" |
| **Nonces / security (writes)** | `X-WP-Nonce` on REST; `check_admin_referer` on post.php actions | `apiFetch` nonce (create) + core's nonces (iframed) | `apiFetch`/core-data nonce | ✅ | core-data/apiFetch attach `X-WP-Nonce` automatically |
| **Dirty-state → NavigationGuard** | core's `beforeunload` (inside iframe) | **declared but NOT wired** (`app.json:10-11`); shell `NavigationGuard` blind to iframe (`useDirtyState` never called in `index.js`) | ✅ wired (`useDirtyState(regionId, hasEdits, {blocksNavigation:true})`, `index.js:238`) | editor ❌ / simple ✅ | editor's manifest lies; iframe's own `beforeunload` still fires for full-page exits but intra-shell nav is unguarded |
| **In-iframe navigation round-trip (iframeBridge)** | n/a (classic is full-page) | **NOT installed** — `core:editor` never calls `installIframeBridge` (cf. `iframe-fallback/index.js:56-74`) | n/a (native) | editor ❌ | "View Post"/"Manage Patterns"/trash-redirect inside the iframe don't route up to the workspace |
| **Session-expiry recovery (`wp-auth-check`)** | n/a | **NOT handled** (cf. `iframe-fallback/index.js:81-142`) | n/a | editor ❌ | If the session dies, the editor iframe silently shows the login form |
| **Post-save redirect** | REST save = no redirect (SPA); trash action redirects to `edit.php` (post.php:264) | trash-from-iframe redirects iframe to `edit.php` → re-enters hijack as a nested shell or breaks | save via core-data, stays in app; Back button navigates to list | editor 🟡 / simple ✅ | The trash redirect is the concrete breakage |
| **Browser title** | `<title>Edit Post …</title>` set by `post.php` | **not synced** — shell title unchanged; iframe's own title hidden | not synced | editor 🟡 / simple 🟡 | Neither updates `document.title` to the post being edited |
| **Back button** | full-page history | iframe load via `replaceState` for new-post (no extra entry); intra-iframe nav adds entries the shell can't see | hash-route history | editor 🟡 / simple ✅ | editor's iframe history is opaque to the shell router |
| **Empty state (new post)** | empty title placeholder + "Type / to choose a block" | core's (iframed) | title placeholder "Title" + body placeholder "Tell your story…" (`index.js:340,412`) | ✅ | simple uses custom placeholders, not the filtered core ones |
| **Error state (load/save fail)** | inline banner + Retry (spec §12) | iframe error opaque to shell | error string in empty-state div (`index.js:182-196`); save error = `SaveStatus` text | editor 🟡 / simple 🟡 | No Retry affordance in either; no `core/notices` banner |
| **Extensibility (`enqueue_block_editor_assets`)** | fires; third-party fills register | ✅ (iframed) | ❌ — native mount doesn't run the hook | editor ✅ / simple ❌ | simple is a sealed mini-editor |

Legend: ✅ full · 🟡 partial · 🟠 partial-by-design (intentional restriction) · ❌ missing.

## Functional divergences

Behaviors present in both the classic editor and a shell app, but implemented differently with a user-visible consequence.

1. **Autosave semantics — simple-editor mutates the live record where core would write a safe autosave.**
   - Classic: `editor.savePost({ isAutosave: true })` every `AUTOSAVE_INTERVAL` (60s). For a **published** post the autosaves controller calls `create_post_autosave` → a separate `_wp_post_revision`-style autosave row (`class-wp-rest-autosaves-controller.php:34,56`); the live post is untouched. For a draft/auto-draft it `wp_update_post`s the parent (line 54).
   - Shell (`simple-editor`): a single 2s debounce calls `save()` from `useEntityRecord` (`src/apps/simple-editor/index.js:258-273,244-256`), which is a `PUT /wp/v2/{type}/{id}` against the **live record regardless of status**.
   - Consequence: editing a *published* post in simple-editor pushes every 2-second debounce straight to the public post — no autosave isolation, no "discard and revert to last published" path, and a failed network call leaves a half-saved public post. Core never does this for published content.

2. **Dirty-state: the iframe editor declares the platform service but cannot honor it.**
   - `src/apps/editor/app.json:10-11` declares `core:dirty-state: true` + `core:block-navigation-on-dirty: true`, but `src/apps/editor/index.js` never calls `useDirtyState`. The shell's `NavigationGuard` (`src/runtime/dirty-state/NavigationGuard.js`) only sees state reported through `setDirty`, so intra-shell navigation away from a dirty iframe editor is **not** intercepted by the shell.
   - Partial mitigation: the iframed `post.php` registers its own `beforeunload`, so a full browser-tab close still warns. But clicking a shell nav item (a hash route change) is governed by `NavigationGuard`'s `hashchange`/Navigation-API path, which queries `hasBlockingDirty()` — and the iframe never set it. So **a sidebar click silently discards unsaved iframe edits** with no confirm. `simple-editor` wires this correctly (`index.js:238`); `editor` does not.

3. **In-iframe link clicks have no parent-side bridge in `core:editor`.**
   - The PHP chromeless bridge (`includes/engines/core-desktop/chromeless-bridge.php`) injects into **any** same-origin admin iframe (gated only by `Sec-Fetch-Dest: iframe` via `wp_admin_shell_is_chromeless_request()` in `includes/engines/core-desktop/bootstrap.php:39`). It posts `wp-admin-shell-admin-link` / `wp-admin-shell-external-link` messages up to the parent for every in-iframe link click. The sibling `iframe-fallback` app consumes them via `installIframeBridge` (`src/apps/iframe-fallback/index.js:56-74`). **`core:editor` does not install the bridge at all** (`src/apps/editor/index.js` has no `installIframeBridge` import).
   - Consequence: post-publish "View Post", "Manage Patterns", a featured-image "Manage Media" jump, or the trash redirect to `edit.php` fire bridge messages into the void. Best case they do nothing; the trash redirect actually navigates the iframe to `edit.php` (post.php:264), which the hijack then tries to render — a classic list inside the editor iframe instead of routing to the shell's `#/posts` list.

4. **No session-expiry recovery in `core:editor`.**
   - `iframe-fallback` detects WordPress's login form inside the frame and forces a heartbeat poll so the shell-level `wp-auth-check` modal appears, then reloads the frame on re-auth (`src/apps/iframe-fallback/index.js:81-142,121-142`). `core:editor`'s `onIframeLoad` (`src/apps/editor/index.js:132-135`) only flips `iframeLoading` and injects chrome-hide CSS — no login-form detection, no re-auth reload.
   - Consequence: if the session expires mid-edit, the editor iframe silently swaps to the login form with the chrome hidden; the user sees a stripped login page and loses their place.

5. **Chrome-hide injection is one-shot in `core:editor` but re-armed in `iframe-fallback`.**
   - `iframe-fallback` re-hides the iframe on the next in-iframe `beforeunload` so the user never flashes un-stripped wp-admin chrome during in-iframe navigation (`src/apps/iframe-fallback/index.js:157-165`), and injects CSS *before* revealing (`isReady` gate). `core:editor` injects on `load` and shows a spinner only until first load (`index.js:43,132-134,182-186`); any subsequent in-iframe navigation (e.g. opening the media modal triggers no reload, but a code-editor toggle or a meta-box submit can) momentarily shows full chrome.
   - Consequence: cosmetic chrome flashes during certain in-iframe transitions; lower severity than 1–4.

6. **Title field is a plain input, not a rich-text title block (simple-editor).**
   - Classic title is a contenteditable rich-text field honoring `enter_title_here` and supporting inline formatting paste-handling. simple-editor uses `<input type="text">` (`src/apps/simple-editor/index.js:406-414`).
   - Consequence: no `enter_title_here` placeholder filter honored (plugins that customize the title prompt are ignored), and pasting rich content into the title is flattened. Acceptable for the Substack use-case, but a divergence.

7. **`use_block_editor_for_post` / `use_block_editor_for_post_type` not consulted.**
   - Classic routes to the classic editor when these filters return false (post.php:186). Neither shell app checks them: `core:editor` always iframes `post.php` (which *does* honor the filter and would itself render classic — so editor inherits correct behavior), but `simple-editor` always mounts the block editor regardless, so a post type forced to classic by a plugin would still get the block UI in simple-editor.

## API & platform blockers

The hard parity blockers — what the classic editor does that the shell **cannot** do through REST/core-data — each verified against live 7.0 source.

1. **Post-lock acquire + 10-second heartbeat refresh — no REST surface.** `[upstream]`
   - Classic: `wp_set_post_lock($post->ID)` at editor boot (`edit-form-blocks.php:243`, also `post.php:148/192`) writes the `_edit_lock` meta; `wp.heartbeat.interval(10)` (`edit-form-blocks.php:193`) refreshes it every 10s via `admin-ajax.php?action=heartbeat` carrying `data['wp-refresh-post-lock']`. There is **no `/wp/v2/.../lock` REST route** — locking is admin-ajax + post-meta only.
   - Shell impact: `simple-editor` ships zero lock handling → concurrent editors silently clobber. `core:editor` inherits core's lock because it iframes the real `post.php`. A native rebuild **cannot** acquire/refresh a lock through REST/core-data; it would need a custom `wp-admin-shell/v1` endpoint wrapping `wp_set_post_lock`/`wp_check_post_lock`, or to poll heartbeat directly. Tag upstream because the real fix (a REST lock surface) belongs in core.

2. **Post-lock takeover — admin-ajax / nonce-redirect only.** `[upstream]`
   - Classic: `?get-post-lock=1&_wpnonce=…` redirect or the heartbeat `wp-refresh-post-lock` exchange. No REST. A native shell editor cannot offer "Take over" without a custom endpoint.

3. **Per-user autosave for published posts behaves correctly only via the autosaves controller — core-data `save()` cannot target it.** `[shell]`
   - The route exists: `POST /wp/v2/{parent}/autosaves` (`class-wp-rest-autosaves-controller.php:105-108`, perm `edit_post` at line 167/189). It is REST-reachable. But `useEntityRecord('postType', …).save()` only PUTs the parent record — there is **no core-data primitive that routes a save to the autosaves child route**. So the *blocker is shell-side*: closing it means hand-rolling `apiFetch({ path: '/wp/v2/{type}/{id}/autosaves', method:'POST', … })` on the autosave tick and a `modified_gmt` comparison on load for the newer-autosave banner. Tagged `[shell]` — the API is there, the shell just isn't using it (and is doing the wrong thing instead, per divergence #1).

4. **Restore-from-revision — not a REST operation.** `[upstream]`
   - Revision **read** is REST (`GET /wp/v2/{parent}/revisions`, `class-wp-rest-revisions-controller.php:96`; **delete** is REST too, `DELETABLE` at line 126). But **restore** is `POST /wp-admin/revision.php?action=restore&revision={id}` with nonce `restore-post_{id}` — there is no `restore` REST route. A native shell revisions panel can list/diff/delete revisions via REST but **cannot restore one** without either a custom endpoint (`[shell]` workaround) or a core addition (`[upstream]` proper fix).

5. **Preview link requires a server-minted nonce.** `[upstream]`
   - Classic preview saves an autosave then opens `?preview=true&preview_id={id}&preview_nonce=…`. The `preview_nonce` is generated server-side (`wp_create_nonce('post_preview_' . $id)`); it is **not exposed in the posts REST schema**. A native shell cannot construct a working draft-preview URL for an unsaved/draft post without that nonce. (Published posts can use the public `link` field, which *is* in the schema — so "View Site" is fine; "Preview draft" is the blocker.)

6. **Back-compat meta boxes are pure server-render via `meta-box-loader`.** `[upstream]`
   - `edit-form-blocks.php:175-188` builds `post.php?meta-box-loader=true&meta-box-loader-nonce=…`; core fetches that HTML chunk and injects it. There is **no REST representation** of legacy meta boxes (they are arbitrary `do_meta_boxes` output). `core:editor` inherits them (iframed); a native rebuild can only reproduce them by iframing that same loader URL — not via REST.

7. **Editor settings / preload / server-registered block bootstrap are PHP-only.** `[upstream]`
   - `get_block_editor_settings()` (the `block_editor_settings_all` filter chain), `wp.blocks.unstable__bootstrapServerSideBlockDefinitions(...)` (`edit-form-blocks.php:151-154`), block-bindings sources registration (`:157-172`), and `block_editor_rest_api_preload($preload_paths)` (`:120`) all run server-side at editor-page render. `block-types` *are* REST-listable (`/wp/v2/block-types`), but the **bootstrap call shape** and the **settings array** are not REST endpoints. A native shell editor cannot get a correct dynamic-block registry + editor settings purely through `@wordpress/core-data` without a server-side preload step on the shell page. `core:editor` sidesteps this entirely (the iframed page runs the real bootstrap).

8. **`enqueue_block_editor_assets` does not fire for the native mount.** `[shell]`
   - This action is where third-party plugins register their slot fills (`PluginDocumentSettingPanel` etc.). `core:simple-editor` mounts `BlockEditorProvider` on the shell page where that hook never ran for the editor context, so **no plugin fills exist**. The iframe editor inherits them. Closing this for a native mount requires the shell to enqueue the editor asset bundle + fire the hook on its page — a substantial shell-side build, tagged `[shell]`.

Not blockers (REST-reachable, just unbuilt in simple-editor): featured image (`featured_media`), taxonomy (`categories`/`tags` + `/wp/v2/categories|tags` CRUD), excerpt (`excerpt.raw`), slug/permalink (`slug`/`permalink_template`/`generated_slug`, context=edit), visibility/password (`status`/`password`), schedule (`date`/`date_gmt`), author (`author`), discussion (`comment_status`/`ping_status`), page attributes (`parent`/`template`/`menu_order`), sticky/format, synced patterns (`/wp/v2/blocks`), and the inserter's pattern data (`/wp/v2/block-patterns/*`). All of these are confirmed present in the posts controller schema / dedicated controllers and are **missing-feature (type 2)**, not API blockers, for simple-editor.

## DataViews / DataForms review

**N/A.** Neither app uses DataViews or DataForm — verified: `grep` for `_shared/forms`, `_shared/dataviews`, `DataForm`, `DataViews` across both app dirs returns nothing. This is correct: the block editor is a single-record block-composition surface, not a tabular or flat-field form. The post **settings sidebar** (categories/tags/excerpt/slug/discussion/page-attributes) is the one place a `DataForm` *could* plausibly drive a future simple-editor settings panel (it is structurally similar to the `profile` / settings panels that already use `EntityDataForm` in `src/apps/_shared/forms/`), but the full editor's inspector intentionally uses bespoke `@wordpress/editor` panels (`PostTaxonomies`, `PostSchedule`, etc.) with rich affordances (hierarchical category tree, tag autocomplete, date picker) that exceed `DataForm`'s flat-field model — so a `DataForm` rebuild would itself be a parity downgrade for those panels. Recommendation: if a settings sidebar lands in simple-editor, use `DataForm` only for the genuinely flat fields (excerpt, slug, menu_order, comment toggle) and keep bespoke controls for taxonomy/schedule/featured-image.

## Recommendations / future work

**P1 — correctness / data-loss / integration breakage**

1. **Stop simple-editor from auto-saving published posts to the live record.** Either (a) gate the 2s debounce so it only runs when `record.status` is `draft`/`auto-draft`/`pending`, and for published posts switch the autosave path to `POST /wp/v2/{type}/{id}/autosaves` (REST-reachable, `class-wp-rest-autosaves-controller.php:105`), or (b) disable auto-save entirely for published posts and require an explicit Update. *Shell-side.* (`src/apps/simple-editor/index.js:258-273`.) **This is the headline data-integrity fix.**

2. **Wire `core:editor`'s declared dirty-state, or stop declaring it.** Today `app.json:10-11` promises `core:dirty-state` + `core:block-navigation-on-dirty` but `index.js` never calls `useDirtyState`, so a sidebar click discards unsaved iframe edits with no confirm. Minimum: post a `dirty`/`clean` message from the chromeless bridge (read `wp.data.select('core/editor').isEditedPostDirty()` inside the iframe) up to the parent and call `setDirty(regionId, …)`. If that's out of scope, remove the manifest claim so the contract isn't a lie. *Shell-side* (+ a small `[upstream]`-flavored bridge addition to read the iframe's dirty state). (`src/apps/editor/index.js`, `includes/engines/core-desktop/chromeless-bridge.php`.)

3. **Install `installIframeBridge` in `core:editor`.** It already exists and is used by `iframe-fallback` (`src/apps/iframe-fallback/index.js:56-74`). Without it, "View Post", "Manage Patterns", and especially the **post-trash redirect to `edit.php`** (post.php:264) either no-op or break out of the workspace. *Shell-side.* (`src/apps/editor/index.js`.)

4. **Add session-expiry recovery to `core:editor`.** Port the login-form detection + `wp-auth-check` heartbeat reload from `iframe-fallback` (`src/apps/iframe-fallback/index.js:81-142`). Otherwise a mid-edit session timeout silently shows a stripped login form. *Shell-side.*

5. **Trash/restore guard in simple-editor.** Add a `status === 'trash'` block with a Restore CTA (`PUT { status: 'draft' }`) per spec §3, and a friendly pre-mount cap check (or graceful 403 view) instead of a raw REST error string. *Shell-side.* (`src/apps/simple-editor/index.js:182-207`.)

**P2 — closeable feature gaps in simple-editor (REST is ready)**

6. **Ship the document-settings sidebar via the existing `core:editor.sidebar` Slot** (`src/apps/simple-editor/index.js:432`). All the data is REST-reachable: featured image (`featured_media`), categories/tags, excerpt, slug, visibility/password, schedule (`date`), author, discussion, page-attributes. This is the single highest-leverage simple-editor improvement and unblocks the Publish/Schedule/Submit-for-Review state machine. *Shell-side.*

7. **Hand-roll autosave + newer-autosave banner for simple-editor** using `POST .../autosaves` + a `modified_gmt` compare on load. *Shell-side* (the autosaves controller is REST-reachable; only core-data lacks a primitive).

8. **Sync `document.title`** to the post being edited in both apps (read `editedRecord.title` for simple; read it from the bridge or the create response for editor). Minor but affects tab identity and back-button legibility. *Shell-side.*

9. **Fix the chrome-hide flash in `core:editor`** by adopting `iframe-fallback`'s "inject-before-reveal" `isReady` gate + re-hide-on-`beforeunload` pattern (`src/apps/iframe-fallback/index.js:144-165`). *Shell-side.*

**P3 — depends on the deferred native `@wordpress/edit-post` mount or upstream**

10. **Resolve the five native-mount blockers** (preferences-store collision, command double-registration, fullscreen CSS, hash-router collision, no `BUNDLED_PACKAGES` entry — see `app.json:129`) so simple-editor can graduate to the full inspector/inserter/patterns/list-view/code-editor surface, or so a third `core:native-editor` app can replace the iframe. *Shell-side, large.*

11. **Upstream: a REST surface for post-lock acquire/refresh/takeover** (currently admin-ajax + post-meta only — blocker #1/#2) and **restore-from-revision** (currently `revision.php` nonce action — blocker #4). Until these land, any native editor must wrap them in custom `wp-admin-shell/v1` endpoints. *Upstream WP/REST; shell can stopgap with custom endpoints.*

12. **Upstream: expose `preview_nonce` (or a draft-preview URL) in the posts REST schema** (blocker #5) so a native editor can offer draft preview without a server round-trip. *Upstream.*

13. ✅ **Done — `docs/screens/editor-classic.md` exists.** A full tier-2 classic-editor spec landed in PR #36; this audit's 2026-05-29 snapshot predated it. Correctly cross-referenced by `editor-block.md` §16. *No action.*
