# Block editor strategy — handoff, chromeless embed, purpose-built native editors

Status: **decided** (2026-06-10, repo owner). This began as a feasibility study for porting the full block editor as a workspace-native app; the option-space analysis below changed the conclusion. The full-recreation analysis is retained in §6 because its component inventory and infrastructure findings power Tier 3. Companion docs: `docs/parity/block-editor.md` (feature/REST parity audit), `docs/screens/editor-block.md` (tier-2 spec), feedback issue #79.

## The decision

Three tiers, replacing the single question "how do we embed the editor?":

1. **Default: full-page handoff to the real editor** — workspace → `post.php` is a real top-level navigation, exactly as core navigates `edit.php` → `post.php` today. Full fidelity, every plugin, meta boxes, zero compatibility treadmill.
2. **Option: a server-rendered chromeless editor page, iframed** — a first-party admin endpoint that runs the real editor bootstrap but never renders wp-admin chrome. For workspaces that want the editor *inside* the workspace (multi-pane, desktop windows, branded flows) without the current chrome-hide CSS hacks.
3. **Purpose-built native editors per use case** — not one recreated "main editor," but small native editors composed from `@wordpress/editor`'s public components for specific users and jobs. `core:simple-editor` is the proof of concept.

**This is the workspace identity:** full capability when you want it, through handoff — and the ability to make yourself a *specific* editor for a *specific* user, instead of trying to make the main editor fit every container. The main editor stays core's product; the workspace's product is the configurability around and beside it.

A full native recreation of the post editor (the original subject of this study) is **rejected for now** — see §6 for the analysis and the narrow conditions for revisiting.

## 1. The option space (why these three)

| | Iframe `post.php` (status quo) | **Tier 1: Handoff** | **Tier 2: Chromeless page** | Full native recreation (rejected) |
|---|---|---|---|---|
| Editor fidelity / plugin compat | High but seamy | **Total** | High (real bootstrap, meta boxes work) | Trails core; plugin long-tail risk |
| Maintenance burden | Chrome-hide CSS + 15-subsystem bridge, per-release | **Near zero** | Small PHP fork of `edit-form-blocks.php`, per-release | Permanent shell treadmill |
| Workspace integration (palette, dirty-state, theming, modes) | Partial, via postMessage bridge | None (by design) | Partial, via a *smaller* bridge | Total |
| Multi-pane / desktop-engine windows | Yes, seamy | No | **Yes** | Yes |
| URL / title / history / deep links | Degraded | **Native browser** | Degraded (iframe) | Native + extensible |
| Tracks future core editor features (incl. RTC) | Automatic | **Automatic** | Automatic | Manual adoption, always trailing |
| Build effort | Sunk | **Smallest (mostly removal)** | M | XL |

Precedent that settled it: **WordPress.com's Calypso spent years embedding Gutenberg in an iframe ("Gutenframe") and Automattic ultimately abandoned the embed, defaulting to wp-admin's editor directly.** The organization with the most resources and the strongest incentive to embed concluded the iframe wasn't worth its maintenance. Core itself ships the same model we're adopting: list screens and the editor are separate apps joined by navigation.

The current iframe-`post.php` approach (with its chrome-hide CSS and the chromeless bridge's editor sub-systems) is **superseded**: Tier 1 replaces it as default; Tier 2 replaces it as the embed surface. Retirement is gradual — the `core:editor` app keeps working until Tier 2 lands.

## 2. Tier 1 — handoff (default)

The user is "in the workspace" to browse and manage, "in the editor" to write, with a real page navigation between. Core users live with this exact cut today.

**Mechanics — mostly removal, the architecture already cooperates:**

- Workspace edit links become real `<a href="post.php?post=X&action=edit">` anchors. The capture-phase `adminLinkInterceptor` only rewrites hrefs that map to workspace routes via `window.wpAdminWorkspaces.adminRoutes`; with the editor screens' `legacy_path` mappings removed, these anchors **pass through** to a normal top-level navigation. No new mechanism — this is the existing "workspace links never bypass the interceptor" rule doing its job.
- Remove the post-edit screens' `legacy_path`/`legacy_query` mappings so a direct visit to `post.php` no longer redirects into the workspace.
- **Return trip is already built:** the editor's exit button targets `edit.php`, which *stays* legacy-mapped to the workspace posts screen — so leaving the editor lands back in the workspace automatically, via machinery that already ships. The elegance of this is the strongest sign the model fits the architecture.
- Dirty-state guarding is the browser's native `beforeunload` from the editor itself; the workspace-side `useDirtyState`/bridge relay becomes unnecessary for this surface.

**Costs, accepted:** no workspace command palette inside the editor; no workspace theming of editor chrome; the workspace SPA re-boots on return. **One measurement owed:** the editor's dirty-state `beforeunload` handler can disqualify back/forward cache — measure the return-trip cost against `docs/perf-baseline.md` and tune (the kernel boot + preload hydration path is the same one every cold workspace load pays).

**Effort: S.** Mostly deleting mappings + pointing list-app row actions at classic hrefs + a smoke pass on new-post flow (`post-new.php` handoff replaces the current REST auto-draft seeding).

## 3. Tier 2 — server-rendered chromeless editor page (embed option)

A first-party admin endpoint (e.g. a dedicated chromeless action under the existing hijack machinery) that runs the same server bootstrap `wp-admin/edit-form-blocks.php` does — settings build via `get_block_editor_settings()` + `block_editor_settings_all`, block bootstrap via `wp.blocks.unstable__bootstrapServerSideBlockDefinitions(…)`, `enqueue_block_editor_assets`, REST preloads, meta-box form context — but **never renders the admin menu/toolbar**. The page is born chromeless.

What this buys over the status quo iframe:

- **Deletes the chrome-hide CSS hack** (`chromeHide.mjs`'s wp-admin selectors, rev'd each release) and the chrome-flash bug — there is no chrome to hide.
- **Shrinks the bridge.** Of the chromeless bridge's editor-relevant sub-systems, only dirty-state relay (#15) and link interception (#9) remain necessary; the rest exist to compensate for embedding a page that was never meant to be embedded.
- **Meta boxes keep working** — it's a real PHP editor page with form context (parity blocker #6 stays solved the only way it can be).
- **Serves every embed surface:** multi-pane (`screens[].apps[]` + mirror routing), `core:desktop` editor windows, branded takeover flows — and it can also be served top-level as an alternate handoff target for workspaces that want a chromeless editor without wp-admin's shell at all.

Cost: a maintained PHP fork of `edit-form-blocks.php`'s essentials (~300 lines: settings, enqueues, bootstrap inline scripts, meta-box loader plumbing) — fragile in a much smaller, server-side-testable way than CSS selectors against wp-admin's DOM. Prior art: Automattic's `blocks-everywhere` PHP loader, `isolated-block-editor`'s WordPress loader. **Per-release watch:** diff `edit-form-blocks.php` against the fork at each WP release (add to the release checklist next to the WPDS parity sweep).

The `core:editor` app id is the contract (same pattern as `core:site-editor`): when Tier 2 lands, the app's iframe URL switches from chrome-hidden `post.php` to the chromeless endpoint, and the hide-CSS path is deleted. Workspace.json consumers don't migrate anything.

**Effort: M.** The endpoint + bootstrap fork + bridge slimming + tests (PHP shape tests for the bootstrap output; the existing chromeless-bridge test file extends).

## 4. Tier 3 — purpose-built native editors (the workspace identity)

Instead of one recreated main editor, the workspace grows a **family of small native editors**, each composed for a job: the Substack-style writer (`core:simple-editor`, the existing POC), and future candidates like a comment/reply composer, a docs/notes surface, an email-template editor, a landing-page builder with a locked block palette. Each is an ordinary workspace app — cap-gated, themable, engine-portable, palette-integrated — which is exactly what no embedded full editor can be.

**The toolkit** (verified against Gutenberg trunk; all public, externalized, shipped by core as `wp.editor` / `wp.blockEditor`):

| Concern | Public components |
|---|---|
| Provider | `EditorProvider` (owns the `core/editor` store: dirty-state, autosave routing, post semantics, RTC when core ships it) |
| Title + canvas | `PostTitle`; `BlockCanvas` + `BlockTools` (iframed canvas, same one core uses) |
| Header pieces | `DocumentBar`, `EditorHistoryUndo/Redo`, `PostSavedState`, `PostPreviewButton`, `PostPublishButton`, `PostSwitchToDraftButton`, `WordCount`, `DocumentOutline` |
| Document panels | `PostSchedulePanel`, `PostVisibility`, `PostURLPanel`, `PostAuthorPanel`, `PostFeaturedImagePanel`, `PostTaxonomiesPanel`, `PostExcerptPanel`, `PostDiscussionPanel`, `PageAttributesPanel`, `PostTemplatePanel`, `PostFormat`, `PostSticky`, `PostTrash`, `PostLastRevisionPanel` — each with a `*Check` gate |
| Block inspector | `InspectorControls.Slot` and friends from `wp.blockEditor` |
| Publish flow | `PostPublishPanel`, `EntitiesSavedStates` |
| Autosave / recovery | `AutosaveMonitor`, `LocalAutosaveMonitor`, `UnsavedChangesWarning` |
| Locking | `PostLockedModal` |
| Code editing | `PostTextEditor`, `PostTitleRaw` |
| Notices / shortcuts | `EditorNotices`, `EditorSnackbars`, `ErrorBoundary`, `EditorKeyboardShortcuts(Register)` |
| Plugin slots | `PluginSidebar`, `PluginDocumentSettingPanel`, `PluginPrePublishPanel`, `PluginPostPublishPanel`, `PluginMoreMenuItem`, `PluginPostStatusInfo` (mount only if a given editor *wants* third-party fills) |

**Guidance for Tier 3 apps:**

1. **Prefer `EditorProvider` over raw `BlockEditorProvider` when editing a post-shaped entity.** simple-editor predates this guidance and hand-rolled autosave routing (issue #101) and dirty-state because raw `BlockEditorProvider` has no post semantics. `EditorProvider` *is* those semantics — and it's the RTC-compatibility line when collaboration ships. Migrating simple-editor onto it is a candidate cleanup, not an obligation.
2. **Private-API budget: zero.** Everything above is public. If a future editor genuinely needs a private unlock, copy the `WpdsThemeProvider` pattern (try/catch, public fallback, inline justification) and record it here.
3. **Block registration:** `registerCoreBlocks()` with `allowedBlockTypes` works for constrained editors (simple-editor's pattern). An editor that should host *third-party* blocks needs the Tier 2 bootstrap instead — at which point reconsider whether that use case is really Tier 2's.
4. **Shared REST endpoints, built on demand** (each wraps an admin-ajax-only operation; from the parity audit): `POST /post-lock` (acquire/refresh/takeover — blockers #1/#2), `POST /revisions/{id}/restore` (#4), `GET /preview-link?post=<id>` (#5). None blocks simple-editor today; build under `wp-admin-workspaces/v1` with the standard cap-floor test sweep when the first Tier 3 editor needs them, and tag for upstreaming.
5. **Known seam:** editor components are `@wordpress/components`-styled inside WPDS chrome. Document per-app in `app.json#design-system-leakage`, same as DataViews.

## 5. What this strategy deliberately gives up

Stated so nobody rediscovers them as surprises:

- **No workspace command palette / theming / cross-screen dirty-guard inside the main editor** (Tier 1 is outside the SPA; Tier 2 is behind an iframe boundary with a thin bridge).
- **No deep links into main-editor state** (selected block, open panel). Tier 3 editors can have them; the main editor's URL stays `post.php?post=X`.
- **The main editor never becomes a workspace region.** Multi-pane and desktop windows get the Tier 2 iframe, with iframe-grade integration.

## 6. Rejected: full native recreation (retained analysis)

The original study concluded a full port was *feasible* — composed on the public API above, ~80% reachable, with the gaps being PHP bootstrap (now Tier 2's job), three REST endpoints (now Tier 3 §4.4), and meta boxes (unsolvable natively; now moot — Tiers 1/2 keep them). It was rejected anyway because of what feasibility doesn't cover:

- **The treadmill:** every core editor shell improvement (new header widgets, zoom-out refinements, collaboration affordances) would need conscious re-adoption, leaving our "main editor" permanently trailing the real one — a worse product for the users who know the editor best.
- **Plugin long-tail:** SlotFill plugins selecting from the `core/edit-post` store or touching edit-post DOM would break one support thread at a time.
- **The strategic insight that replaced it:** the embed-dependent wins (multi-pane, desktop windows) are served by Tier 2, and the integration wins (palette, theming, purpose-fit UX) are served *better* by Tier 3 editors that don't carry full-parity obligations.

**Revisit only if** all three hold: (a) a flagship workspace surface demands full-parity editing *inside* a region with native-grade integration that Tier 2's iframe can't deliver; (b) core's public editor API still covers the shell (re-verify the §4 inventory); (c) someone accepts the treadmill as a permanent staffing cost. Mechanical notes for that future: `edit-post` is a thin wrapper over `@wordpress/editor`'s private `Editor`; the private-apis gate is string-match-only (the `WpdsThemeProvider` precedent); the canvas stays iframed by upstream design (WP 7.0 iframes the post-editor canvas when all inserted blocks are Block API v3+).

## 7. Sequencing

1. **Tier 1 (S):** remove editor `legacy_path` mappings + switch list-app edit/new actions to classic hrefs + bfcache/return-trip measurement. Default experience flips to handoff.
2. **Tier 2 (M):** chromeless endpoint + bootstrap fork; `core:editor` app retargets to it; delete chrome-hide CSS path; slim the bridge; add the per-release `edit-form-blocks.php` diff to the release checklist. Demos (desktop engine, multi-pane) move onto it.
3. **Tier 3 (ongoing, per-app):** simple-editor stays the POC; next purpose-built editor is product-driven. `EditorProvider` migration for simple-editor as opportunistic cleanup; REST endpoints on first need.

## 8. Resolved and open

Resolved by this decision: meta-box policy (Tiers 1/2 keep them natively — no detection heuristics needed); private-API budget (zero for Tier 3; n/a for Tiers 1/2); simple-editor's fate (stays, as the Tier 3 archetype); the old "flip `core:editor` to native" plan (dropped).

Open items: the Tier 1 bfcache/return-trip measurement; the Tier 2 endpoint's exact shape under the hijack (dedicated action vs. admin page) — decide at implementation; whether `post-new.php` handoff fully replaces the REST auto-draft seeding flow (it should — core's auto-draft creation happens server-side on that page).
