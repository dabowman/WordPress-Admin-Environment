# Block editor native port — feasibility study

Status: **analysis, no code**. Companion to `docs/parity/block-editor.md` (feature/REST parity audit, which this doc builds on and does not repeat), `docs/screens/editor-block.md` (tier-2 functional spec), and feedback issue #79 (native mounts deferred). Scope: the **post editor** (`core:editor`, today an iframe of `post.php`). The site editor (`core:site-editor`) shares some findings but has extra blockers (its own hash router, global-styles surface) and is out of scope here.

## Verdict

**Feasible, as a phased composition on `@wordpress/editor`'s public API — not as a mount of `@wordpress/edit-post`, and not (primarily) via the private-API unlock.** Roughly 80% of full-editor functionality is reachable through public, externalized, core-shipped components. The remaining 20% splits into: (a) PHP bootstrap work on the workspace page (editor settings, block asset enqueue, preloads) — substantial but mechanical; (b) three custom REST endpoints wrapping admin-ajax-only operations (post lock, revision restore, preview nonce); and (c) classic meta boxes, which are **not portable** and need a permanent iframe fallback policy.

The iframe `core:editor` stays as the fallback throughout (and likely forever, for meta-box-bearing posts). The native app ships behind a separate app id, and replaces the implementation behind the `core:editor` contract id only after parity sign-off — the same "id is the contract" pattern `core:site-editor`'s app.md already documents.

## 1. The three candidate strategies

### A. Mount `@wordpress/edit-post` wholesale — **rejected**

`edit-post` is a *page owner*, not a component. Its `initializeEditor` expects to own the document: `FullscreenMode` toggles `body.is-fullscreen-mode` classes, `BrowserURL` rewrites `?post=…&action=edit` query params over our hash router, the meta-box system assumes `post.php`'s form context, and the welcome guide / fullscreen preferences fight the workspace's chrome. These are exactly the five blockers recorded in `src/apps/site-editor/index.js` and `docs/parity/block-editor.md` §"API & platform blockers" #10. Mounting it inside a region reproduces the iframe's "foreign shell" problem without the iframe's isolation. Dead end.

### B. Unlock `wp.editor`'s private `Editor` shell — **viable, but only as a tactical instrument**

Verified against installed `@wordpress/private-apis` 1.45.0 (`build-module/implementation.mjs:43-52`): `__dangerousOptInToUnstableAPIsOnlyForCoreModules` does **string-match-only** verification — no caller identity check, no once-per-module registration. Any code can opt in as `@wordpress/edit-site` and unlock anything. This plugin already crosses that line once, deliberately and narrowly: `engines/core-default/WpdsThemeProvider.js` unlocks `@wordpress/theme.ThemeProvider` this way.

Gutenberg trunk's `packages/editor/src/private-apis.js` locks the full `Editor` component (header + tabbed sidebar + canvas + publish flow — the thing `edit-post`'s `Layout` is now a thin wrapper around), plus `BackButton`, `PreferencesModal`, `PostCardPanel`, `usePostFields`, and the whole `interfaceStore`. So one unlock buys near-total parity with minimal code.

**Why it's not the primary strategy:** the private `Editor` brings its own chrome — header, sidebar layout, interface skeleton — which is the same architectural mismatch as strategy A minus the body classes. It does not decompose into workspace regions, its CSS is `interface-*`/`editor-*` skeleton CSS that assumes viewport ownership, and every WordPress release can rename/remove what's behind the lock (the consent string itself is versioned by upstream policy; it happened to survive 7.0 unchanged, per CLAUDE.md, but that is luck, not contract). Use unlocks the way `WpdsThemeProvider` does: **per-component, wrapped in try/catch with a public-API fallback, documented inline** — not as the foundation.

### C. Compose from `@wordpress/editor`'s public exports — **recommended**

Verified against Gutenberg trunk `packages/editor/src/components/index.js`: the public surface is ~80 components and covers nearly the whole post editor:

| Concern | Public components (all in `wp.editor`, externalized, shipped by core) |
|---|---|
| Provider | `EditorProvider` (stable, public — this is the load-bearing fact) |
| Title + canvas | `PostTitle`; `BlockCanvas` + `BlockTools` from `wp.blockEditor` (public; iframed canvas via `shouldIframe`, which is also WP 7.0's direction for the post editor) |
| Header | `DocumentBar`, `EditorHistoryUndo/Redo`, `PostSavedState`, `PostPreviewButton`, `PostPublishButton`/`PostPublishButtonLabel`, `PostSwitchToDraftButton`, `WordCount`/`TimeToRead`/`CharacterCount`, `TableOfContents`, `DocumentOutline` |
| Document sidebar | `PostSchedulePanel`, `PostVisibility`, `PostURLPanel`, `PostAuthorPanel`, `PostFeaturedImagePanel`, `PostTaxonomiesPanel` (hierarchical + flat term selectors), `PostExcerptPanel`, `PostDiscussionPanel`, `PageAttributesPanel`, `PostTemplatePanel`, `PostFormat`, `PostSticky`, `PostPendingStatus`, `PostTrash`, `PostLastRevisionPanel`, `PostSyncStatus` — each with its own `*Check` gate |
| Block sidebar | `InspectorControls.Slot` etc. from `wp.blockEditor` (public) |
| Publish flow | `PostPublishPanel` (pre- + post-publish), `EntitiesSavedStates`, `useEntitiesSavedStatesIsDirty` |
| Autosave / recovery | `AutosaveMonitor`, `LocalAutosaveMonitor`, `UnsavedChangesWarning` |
| Locking | `PostLockedModal` |
| Code editor | `PostTextEditor`, `PostTitleRaw` |
| Notices | `EditorNotices`, `EditorSnackbars`, `ErrorBoundary` |
| Shortcuts | `EditorKeyboardShortcuts`, `EditorKeyboardShortcutsRegister` |
| **Plugin extension points** | `PluginSidebar`, `PluginSidebarMoreMenuItem`, `PluginDocumentSettingPanel`, `PluginPrePublishPanel`, `PluginPostPublishPanel`, `PluginBlockSettingsMenuItem`, `PluginMoreMenuItem`, `PluginPostStatusInfo`, `PluginPreviewMenuItem` |

What composition costs us: we write the **shell** ourselves — the header bar layout, the tabbed Document/Block sidebar, the inserter panel and list-view drawers (using public `Inserter` / `__experimentalListView` from `wp.blockEditor`), and the wiring between them. That is real work, but it is exactly the work that makes the editor a *workspace citizen*: each shell piece is workspace chrome (region/slot/mode driven) instead of a foreign skeleton. `core:simple-editor` already proves the substrate end-to-end (native `BlockEditorProvider` canvas, entity-backed save, status-gated autosave, dirty-state into `NavigationGuard`) — the native full editor is `EditorProvider` (which owns the `core/editor` store, autosave routing, template resolution, RTC-readiness) layered over the same pattern.

**Note on what `EditorProvider` replaces:** simple-editor hand-rolled autosave routing (issue #101) and dirty-state because raw `BlockEditorProvider` + core-data has no post semantics. `EditorProvider` *is* those semantics — `core/editor`'s `isEditedPostDirty`, `autosave()`, `savePost()`, post-type template handling. The native port should not inherit simple-editor's hand-rolled layer; it rides `core/editor`.

## 2. The canvas stays an iframe — and that's correct

A "native port" means **no `post.php` page iframe**. It does not mean a DOM-inlined canvas. `wp.blockEditor`'s `BlockCanvas` renders block content inside a srcdoc-style iframe built from `settings.__unstableResolvedAssets` (verified in installed `@wordpress/block-editor` 15.16.0, `src/components/iframe/index.js:99-137`). WordPress 7.0 itself moves the post editor canvas into this iframe whenever every inserted block is Block API v3+ (enforcement deferred for gradual rollout). The canvas iframe gives style isolation (theme styles can't bleed into workspace chrome and vice versa) and is where upstream is going; fighting it would be porting *backwards*. The thing we eliminate is the **admin-page** iframe: wp-admin chrome-hide CSS hacks, the postMessage bridge for dirty-state/links/session, double scrollbars, no deep links, no URL ownership.

Consequence: third-party blocks that aren't iframe-ready (API v1/v2 relying on admin DOM access) degrade in the native canvas the same way they will in core 7.x. `BlockCanvas` accepts `shouldIframe={false}` for a compat mode if needed — same lever core uses.

## 3. The PHP bootstrap workstream (the real cost center)

Everything `wp-admin/edit-form-blocks.php` does server-side must happen on the workspace page when an editor screen is active. This closes parity blockers #7 and #8 from `docs/parity/block-editor.md`:

1. **Editor settings.** Call `get_block_editor_settings( array_merge( $custom, $defaults ), new WP_Block_Editor_Context( [ 'post' => $post ] ) )` and ship it via the existing `wp_add_inline_script` config channel. This runs the full `block_editor_settings_all` filter chain, so plugin-filtered settings (allowed blocks, color palettes, content width, `__unstableResolvedAssets` for the canvas iframe) match wp-admin exactly. Caveat: settings are **per-post-type** (and per-post for template resolution); the workspace page is one SPA. Plan: bootstrap settings for the common case at page load, and add a small `wp-admin-workspaces/v1/editor-settings?post=<id>` endpoint for per-post refinement at route entry. (Core's `/wp-block-editor/v1/settings` REST route exists but is Gutenberg-plugin-era and context-limited; verify coverage before depending on it.)
2. **Block registry + assets.** Server-registered block types bootstrap via `wp_add_inline_script( 'wp-blocks', 'wp.blocks.unstable__bootstrapServerSideBlockDefinitions(…)' )` exactly as core does, and third-party block edit code arrives by enqueueing block-type `editor_script` handles + firing **`enqueue_block_editor_assets`** on the workspace hook. Because the hijack renders through WordPress's own `admin-header.php`, this is an ordinary enqueue path — the workspace page *is* an admin page. This single hook is what makes Yoast/ACF/Jetpack-class block + SlotFill scripts load at all.
3. **Script weight policy.** The editor stack (`wp-editor`, `wp-block-library`, `wp-format-library`, plugin block bundles) is multiple MB and must NOT load for every workspace session. Options, in order of preference: (a) enqueue editor handles only when the resolved workspace contains an editor screen the user can reach **and** defer-load them (`$strategy = 'defer'`); (b) investigate core's new `@wordpress/lazy-editor` package (it appears in the 7.0 private-APIs allowlist — unverified, but the name suggests core is solving exactly this; if it ships a supported lazy-boot path, ride it); (c) a worst-case dynamic script-injection loader that prints ordered handle URLs from `WP_Scripts` for on-demand injection at route entry. Decide during Phase 1 with measurements against `docs/perf-baseline.md`.
4. **Preloads.** Reuse the existing `preload[]` cascade block to hydrate `apiFetch` for the editor's boot queries (post record with `context=edit`, types, taxonomies, autosaves, `/wp/v2/block-patterns/*`), mirroring `block_editor_rest_api_preload_paths`.

## 4. Three custom REST endpoints (wrapping admin-only operations)

Already identified as REST gaps in the parity audit; the native port finally forces building them under `wp-admin-workspaces/v1` (each tagged for upstreaming):

| Endpoint | Wraps | Parity blocker |
|---|---|---|
| `POST /post-lock` (acquire/refresh/release/takeover) | `wp_set_post_lock` / `wp_check_post_lock` + heartbeat semantics | #1, #2 |
| `POST /revisions/{id}/restore` | `wp_restore_post_revision` (today only `revision.php` + nonce) | #4 |
| `GET /preview-link?post=<id>` | autosave + `wp_create_nonce( 'post_preview_' . $id )` URL minting | #5 |

All three follow the existing controller pattern (`includes/*-rest.php`) and need the same test treatment as `run-activate-theme-rest-tests.php` (cap floor, 401/403/404/400 sweep). Heartbeat itself (`wp-refresh-post-lock` every 10s) keeps working natively — the workspace page already runs `wp.heartbeat` (the session-recovery code uses it today).

## 5. Third-party compatibility matrix

| Surface | Native port outcome |
|---|---|
| **Blocks** (registered via `block.json` + editor scripts) | ✅ Work, once §3.2 lands. They register against the same `wp.blocks` global; the canvas iframe is the same one core uses. API v1/v2 iframe-incompat blocks degrade identically to core 7.x. |
| **Editor SlotFills** (Yoast/RankMath/ACF panels via `registerPlugin` + `PluginSidebar` / `PluginDocumentSettingPanel`) | ✅ Mostly work: render `wp.plugins`' `PluginArea` inside our shell and mount the public `Plugin*` slots. Caveats: plugins importing from `wp.editPost`'s deprecated re-exports still resolve (core keeps the shims), but plugins that *select from* `core/edit-post` store directly (e.g. `isEditorSidebarOpened`) hit a missing/divergent store — we don't mount edit-post. Expect a long-tail compat list; mitigate per-plugin or fall back to iframe. |
| **Classic meta boxes** (`add_meta_box`) | ❌ Not portable. Server-rendered HTML via `post.php?meta-box-loader=true` with form semantics only `post.php` provides (parity blocker #6). **Policy decision** (see §8): detect at route time whether the post type has registered non-core meta boxes and route those posts to the iframe `core:editor`; everything else gets native. Upstream is aligned — in 7.0 meta boxes already disable collaboration mode and the resizable meta-box pane is getting rethought; classic meta boxes are a sunsetting surface. |
| **`enqueue_block_editor_assets` consumers** (custom CSS/JS for the editor page) | ✅ Hook fires on the workspace page (§3.2). Styles targeting editor-chrome classnames may mis-hit since our shell isn't the interface skeleton; canvas-targeting styles ride `__unstableResolvedAssets` unchanged. |
| **Real-time collaboration** (Yjs; pulled from 7.0 at the last minute, still coming) | ✅ By construction — RTC rides `EditorProvider`/core-data/`@wordpress/sync`. Strategy C inherits it when core ships it. Strategies that fork around `EditorProvider` (like simple-editor's hand-rolled save layer) would not. |

## 6. The five recorded native-mount blockers, re-examined for the *post* editor

The blockers in `src/apps/site-editor/index.js` were written against mounting `edit-site`/`edit-post` wholesale. Under strategy C, for the post editor specifically:

1. **Preferences-store collision** → shrinks to a policy. `core/preferences` is scope-keyed; editor component prefs live under their own scope and don't fight `core:appearance-preferences`' keys. Write the ownership rule down, don't build anything.
2. **Command-palette double-registration** → inverts into an opportunity (§7). We choose which editor commands register; they land in the same `core/commands` store the workspace palette reads.
3. **Fullscreen-mode CSS** → moot. We never mount `FullscreenMode`; the workspace **modes catalog** (focus/takeover) is the replacement, and it's a better one — declarative, per-region, engine-portable.
4. **Hash-router collision** → moot for the post editor (that's `BrowserURL`, which we don't mount; the workspace router owns the URL). Still real for the site editor.
5. **Editor-settings bootstrap** → real, costed in §3. This is the one genuine blocker, and it's plumbing, not architecture.

## 7. What porting natively lets us fix (the opportunity column)

Things broken or impossible in wp-admin's own editor that fall out of workspace-native architecture:

- **URL-addressable editor state / deep links.** The post editor has no router (`?post=5&action=edit` and nothing else). Workspace routes can expose `?screen=`-style slots for the selected block, open sidebar tab, code-editor mode — deep-link a reviewer to the exact block. Upstream has wanted canvas deep-links for years; the iframe made it impossible for us, native makes it cheap (corollary of the URL-as-state principle, spec §6/§18).
- **One command palette.** Today wp-admin has the editor's Cmd+K and our workspace Cmd+K as parallel universes (the iframe traps the editor's). Native, editor commands register into `core/commands` alongside workspace commands — one palette, full corpus, including workspace navigation from inside the editor.
- **Cross-screen dirty-state.** Core's editor only guards `beforeunload`. Ours feeds `core/editor` dirtiness into `useDirtyState` → `NavigationGuard`, which guards *workspace* navigation too — and natively it's a `useSelect` instead of chromeless-bridge sub-system 15's postMessage relay.
- **Fullscreen/`is-fullscreen-mode` body-class hack replaced by modes.** The editor screen declares `mode: focus/takeover`; engines render it; no global body classes, no CSS warfare. Works identically in `core:default`, single-pane, and desktop engines — the editor becomes engine-portable for free, including as a *window* in `core:desktop`.
- **Multi-pane editing.** `screens[].apps[]` + mirror routing puts a posts list and the editor side-by-side — the workspace's marquee layout trick, structurally impossible in wp-admin.
- **Editor chrome theming.** Native chrome rides `ThemeProviderHost`/DTCG tokens like every other app. The iframe's editor chrome was untouchable.
- **Title/identity.** `document.title`, browser history, back-button legibility — all currently degraded by the iframe — become ordinary.
- **Decomposed inspector.** The Document/Block sidebar can be its own region (slot `detail`/`inspector`), collapsible/dockable per engine, instead of edit-post's hardcoded 280px rail.
- **Saner meta-box story than core's.** Routing meta-box posts to the iframe editor is arguably a *cleaner* line than core's current half-state (resizable meta-box pane under an iframed canvas, with collaboration silently disabled).

**What a native port does NOT fix** (honesty section): block-level bugs, RichText quirks, inserter search quality, canvas-iframe compat for legacy blocks, performance of large posts — all live inside `block-editor`/`block-library` and ship to us unchanged. We also take on a **maintenance treadmill**: every editor feature core adds to the private `Editor` shell (new header widgets, new panels) must be consciously adopted into our shell. The iframe got those for free. That's the structural price of strategy C, and the main argument for keeping the iframe app as the always-available fallback.

## 8. Risks

1. **Public-API churn.** Public exports deprecate slowly (with shims), but the editor team moves surface between packages (`edit-post` → `editor` migration is recent history). Pin expectations to script handles core ships, add a parity smoke test against `wp.editor` exports (same spirit as `tests/parity` WPDS drift detection).
2. **Private-API exposure stays bounded.** Budget: zero private unlocks in Phase 1–2. If a Phase 3 gap genuinely needs one (e.g. `PostCardPanel`), copy the WpdsThemeProvider pattern — try/catch, fallback, inline justification — and record it in this doc.
3. **WPDS seam.** Editor components are `@wordpress/components`-styled; workspace chrome is `@wordpress/ui`/WPDS. The editor screen will be visually "Gutenberg-flavored" inside WPDS chrome. Acceptable (same is true of DataViews); document as known leakage in `app.json#design-system-leakage`.
4. **Plugin long-tail.** SlotFill plugins selecting `core/edit-post` store, or reading edit-post DOM. Mitigation: compat shim is *possible* (register a minimal `core/edit-post`-shaped store) but smells like strategy A creeping back; prefer the iframe fallback escape hatch per screen (`workspace.json` keeps `core:editor` available).
5. **Bundle/boot weight.** §3.3. Must be resolved in Phase 1 with numbers, not after.
6. **RTC unknowns.** When Yjs collaboration ships, it may assume shell affordances (collaborator avatars in header, etc.) that exist only in the private `Editor`. Watch upstream; our shell needs equivalents.

## 9. Phased plan

- **Phase 0 — spike (S).** Branch-level proof: `EditorProvider` + `PostTitle` + `BlockCanvas` + `PostPublishButton` mounted in a workspace region against a real post, with settings hand-fed. Validates externalization, store boot, canvas assets. Kill-switch decision point.
- **Phase 1 — bootstrap + core shell (L).** PHP settings/assets/preload workstream (§3, including the script-weight decision), new app `core:editor-native` (working id) with header, canvas, document sidebar from public panels, save/publish/autosave via `core/editor`, dirty-state + modes integration. Behind a screen flag; iframe stays default.
- **Phase 2 — parity grind (L).** Inserter + list-view drawers, code editor (`PostTextEditor`), publish panel flow, locking + the three REST endpoints (§4), autosave-recovery banner (closing the parity doc's open item), revisions panel, preview. Exit = `docs/parity/block-editor.md` matrix all-green except meta boxes.
- **Phase 3 — plugin compat + flip (M).** `PluginArea` + SlotFill mounts, `enqueue_block_editor_assets` on, per-plugin compat sweep against the top block/SEO plugins, meta-box detection routing to iframe fallback. Flip the `core:editor` contract id to the native implementation; keep iframe app available via workspace.json.
- **Continuous:** upstream the three REST endpoints + deep-link findings as core proposals (this is the "resolve the editor's own issues" channel with real leverage).

## 10. Open decisions (need owner input)

1. **Meta-box policy** — auto-detect-and-fallback to iframe (recommended), explicit per-screen workspace.json opt-in, or drop classic meta-box support in workspace context entirely?
2. **Private-API budget** — confirm "zero in Phase 1–2, case-by-case with fallback in Phase 3" or harder line?
3. **simple-editor's fate** — keep as a distinct writing surface (recommended; different product) or fold into the native editor as a constrained mode once `EditorProvider` makes the constrained version nearly free?
4. **Script-loading strategy** (§3.3) — needs a perf-baseline measurement before Phase 1 commits to (a)/(b)/(c).
