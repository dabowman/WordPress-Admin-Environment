# App validation — WPDS / REST / core-data compliance

> **⚠️ v2-era audit (historical).** This is a point-in-time triage snapshot taken on the `feat/wp-admin-shell-v2` branch. Many findings have since been remediated; file paths and counts reflect the v2 tree, not the current v3 codebase. Read as a remediation checklist / historical context, **not** current v3 guidance. Verify any finding against the live source before acting.

**Date:** 2026-05-04
**Branch:** `feat/wp-admin-shell-v2` (validation worktree `validate-apps-wpds`)
**Scope:** Every app under `src/apps/` (22 files) and `src/runtime/apps/` (8 files + `_components/`)
**Method:** Five parallel sub-agents validated against `wordpress-design-system`, `wordpress-rest-api`, `wordpress-core-data`, `wordpress-dataviews` skills + WPDS MCP.

Severity legend: **BUG** = crash / wrong behavior; **VIOLATION** = breaks key rule from `CLAUDE.md`; **DUPE** = competing/dead implementation; **SMELL** = sub-optimal but works; **NIT** = cosmetic.

---

## Ship-blocking bugs (fix first)

| # | File | Issue |
|---|------|-------|
| 1 | `src/apps/DashboardApp.js:16` | `import { navigate } from '../routing/router'` — path doesn't exist. Router lives at `src/runtime/routing/router.js`. **App won't load.** |
| 2 | `src/apps/ToolsApp.js:14` | Same broken import. **App won't load.** |
| 3 | `src/apps/SettingsGeneralApp.js:189-200` | References `Notice.Root`/`Notice.Description` without importing `Notice`. Crashes whenever `pendingAdminEmail` is truthy. |
| 4 | `src/apps/SimpleEditorApp.js:242` | Reads `editedRecord.title` BEFORE the `! record \|\| ! hydrated` guard at line 303. Crash on first render if `editedRecord` is undefined. |
| 5 | `src/apps/SimpleEditorApp.js:374` | Slot `fillProps` hardcodes `postType: 'post'` ignoring the `postType` prop. Pages flow broken. |
| 6 | `src/apps/MediaApp.js:93-101, 252-266` | `handleDelete` and `handleSave` mutate via `deleteEntityRecord`/`saveEntityRecord` without invalidating the records list. Grid shows stale data. |
| 7 | `src/apps/UsersApp.js:144-170` | Bulk delete: no guard against deleting the acting user (reassign-to-self fails). No invalidation after delete. |
| 8 | `src/apps/CommentsApp.js:145-162, 212-231` | Status batch + trash both skip cache invalidation. Status-filter views won't drop just-moderated items. |
| 9 | `src/apps/TaxonomyApp.js:62, 156-164, 249-265` | `deleteEntityRecord` (`force: true`, correct) + `saveEntityRecord` paths skip `invalidateResolution`. List doesn't refresh. `handleSave` swallows errors silently. |
| 10 | `src/apps/TaxonomyApp.js:196` | `<Text size={20} weight={600}>` — props don't exist on `@wordpress/components` Text. Silently no-ops. |
| 11 | `src/apps/IframeApp.js:10-11` | `app.source.replace('iframe:', '')` (mid-string match) and `rawUrl.startsWith('http')` (misses `https`+protocol-relative). Anchor regex needed. |
| 12 | `src/runtime/apps/_components/SidebarNavigationScreen.js:64` | `Heading color="#e0e0e0"` hardcodes hex — chrome token bypass. |
| 13 | `src/runtime/apps/_components/SiteIcon.js:7` | Reads `config.branding.logo` without guarding `config.branding`. Caller currently safe but helper fragile. |

## Major duplications / dead code

| Path | Disposition |
|------|-------------|
| `src/apps/AppearanceApp.js` | **Dead.** Not registered. Canonical at `src/runtime/apps/AppearanceApp.js` (wired in `src/runtime/registry/builtins.js`). **Delete.** |
| `src/apps/SettingsWritingApp.js` | **Dead.** Better-built than wired-in `src/apps/settings-panels/SettingsWritingApp.js` (uses `SelectControl` + entity-records picker instead of free-text ID input). **Repoint host imports OR delete dead, fix wired.** |
| `src/apps/SettingsReadingApp.js` | Same pattern. Wired-in panel ships `page_on_front`/`page_for_posts` as numeric ID inputs; dead version has live page picker. |
| `src/apps/SettingsDiscussionApp.js` | Dead, materially equivalent to wired-in. Pick one and delete other. |

**Recommended:** repoint `SettingsApp.js` lines 11-13 to top-level files, delete `src/apps/settings-panels/`. Standardize notices on `core/notices` (top-level files use local `notice` state).

## Systemic WPDS violations

**21 of 30 apps still import from `@wordpress/components` instead of `@wordpress/ui`.** Affected:

- `src/apps/`: PostsApp, SimpleEditorApp, EditorApp, TaxonomyApp, MediaApp, ProfileApp, UsersApp, CommentsApp, DashboardApp, PluginsApp, ThemesApp, ToolsApp, SiteHealthApp, IframeApp.
- `src/runtime/apps/`: NavigationApp, SiteHubApp, ToolbarActionsApp, NoticesApp.
- `src/runtime/apps/_components/`: SidebarButton, SidebarNavigationItem, SidebarNavigationScreen.

**Compliant (use `@wordpress/ui` correctly):** `SettingsGeneralApp`, the four `settings-panels/*Panel.js`, `SettingsApp`, `src/runtime/apps/AppearanceApp.js`, `SiteEditorApp`, `PreviewPaneApp`, `SidebarContent`, `SidebarNavigationContext`.

**Mass migration mapping (apply across all 21):**

| Legacy | WPDS replacement |
|--------|------------------|
| `Button variant="primary" isBusy isDestructive` | `Button tone="brand\|critical" variant="solid" loading` |
| `Button variant="tertiary"` | `Button tone="neutral" variant="ghost"` |
| `TextControl onChange={setX}` (raw value) | `InputControl onChange={(e)=>setX(e.target.value)}` (DOM event) |
| `__experimentalHStack`/`__experimentalVStack` | `Stack direction="row\|column" gap="xs\|sm\|md..."` |
| `__experimentalHeading`/`__experimentalText` | `Text variant="heading-..." render={<h2/>}` |
| `Notice` | `Notice.Root` + `Notice.Description` + `Notice.Actions` + `Notice.CloseIcon` (intent="info\|warning\|success\|error") |
| `Modal` | `Dialog.Root` + `Dialog.Content` + `Dialog.Title` |
| `Card`/`CardHeader`/`CardBody` | `Card.Root` + `Card.Header` + `Card.Content` |

**Allowed `@wordpress/components` fallbacks:** `RadioControl`, `CheckboxControl`, `SelectControl`, `Spinner`, `Divider`, `TextareaControl` (no UI primitive yet), `Item`/`ItemGroup` (no UI equivalent), `__experimentalGrid` (no UI equivalent), `FormToggle`, `KeyboardShortcuts`.

## DataViews import path

PostsApp, TaxonomyApp, UsersApp, CommentsApp, PluginsApp all `import { DataViews } from '@wordpress/dataviews'`. WP plugin context should use `@wordpress/dataviews/wp` per dataviews skill (otherwise risks `Minified React error #130`). **Verify webpack handles aliasing; otherwise switch all five.**

## REST / core-data violations

| App | Issue |
|-----|-------|
| `PluginsApp` | Hand-rolled `apiFetch` cache against `/wp/v2/plugins`. Entity `'root', 'plugin'` already registered. Use `useEntityRecords`. |
| `ThemesApp` | Same pattern. Entity `'root', 'theme'` (key: `stylesheet`). |
| `DashboardApp` | Count-only queries omit `_fields=id`. Fetches full records. |
| `ProfileApp:16` | `window.wpAdminShell.userId` accessed at module scope without guard. |
| `EditorApp:128` | Same `wpAdminShell.adminUrl` no-guard issue. |
| `IframeApp:13` | Same. |
| `SiteHubApp:28`, `NavigationApp:166` | Use `window.wpAdminShell.siteName` instead of `useEntityRecord('root','site').record.title`. |
| `CommandPickerApp:51-92` | Uses `registerCommand`/`unregisterCommand` dispatch. Should use `useCommand`/`useCommandLoader` hooks (idiomatic; handles disposal). |

## SimpleEditorApp specifics

- Latent empty-paragraph seed CONFIRMED (line 104). EditorApp also seeds at line 46 — CLAUDE.md note "EditorApp has same latent bug" is **stale**: EditorApp is already fixed.
- `BlockEditorProvider` `onChange` vs `onInput` not differentiated (line 283). Typing inside a block won't mark `hasEdits=true` until structural commit. Consider `useEntityBlockEditor`.
- Auto-save effect re-runs every keystroke due to `editedRecord` reference churn (works via cleanup, but wasteful).
- Error handler (line 117-132) leaks raw API error JSON into UI string.

## Smaller items (non-blocking)

- `SiteHealthApp.js:30-57` — hardcoded hex pills bypass tokens. Use `Badge` with intent.
- `SiteHealthApp.js:170-175` — `dangerouslySetInnerHTML` on plugin-filterable content.
- `ThemesApp.js:73-89` — `themes.php?action=activate` legacy fallback missing `_wpnonce`. Activation will fail silently.
- `PostsApp.js:5`, `TaxonomyApp.js:5` — DataViews import path (see above).
- `PluginsApp.js:270` — error rendered as bare `<Text>` not `Notice.Root intent="error"`.
- `SiteHubApp:64-70`, `ToolbarActionsApp:42-79` — MVP `Button` props (`icon`/`shortcut`/`size="compact"`) don't map to `@wordpress/ui`. Migration needs `Tooltip.Root` wrapping + `<Icon/>` child slot.
- `NavigationApp:166` — site title not passed through `decodeEntities()`.
- `MediaApp:243-249` — `MediaDetailModal` doesn't reset state on `item` prop change. Add `key={item.id}`.
- `UsersApp:51-55` — role filter dead code (no `filterBy.operators` declared).
- `UsersApp:35` — `Registered` column field id `'registered'` doesn't match REST `orderby='registered_date'`. Sorting that column 400s.
- `CommentsApp:115-120` — `dangerouslySetInnerHTML` on `comment.content.rendered`. Trusted server-side but plugin-replaceable filter chain.
- `AppearanceApp` (runtime) `defaultRoute` field is free-text; should be `SelectControl` of known app ids.

## Compliance wins (already correct)

- `MediaApp` — `apiFetch` for binary multipart upload (documented exception). `force: true` + `context: 'edit'` correct.
- `UsersApp` — `force: true` + `reassign` on delete.
- `CommentsApp` — partial `saveEntityRecord('root', 'comment', { id, status })` for moderation (matches CLAUDE.md).
- All entity reads use `context: 'edit'`.
- `SettingsGeneralApp` + four `settings-panels/*` panels — full `@wordpress/ui` migration, `useEntityRecord('root','site')` + `edit()`/`save()`. No raw `apiFetch` to `/wp/v2/settings`.
- `src/runtime/apps/AppearanceApp.js` — model citizen. Full `@wordpress/ui`, kernel context, `core/notices`, validated hex input, `apiFetch` to `/wp-admin-shell/v1/user-prefs`.
- `NoticesApp` — correct `core/notices` subscription pattern (NOT custom event bus).
- `SiteHealthApp` — uses `/wp-site-health/v1/` namespace correctly (not `/wp/v2/`).
- `IframeApp` — chrome-hide CSS injection covers `#wpadminbar` + `#adminmenuwrap` + edit-site sidebar. URL relative to `adminUrl`.
- `ProfileApp` — null-guards `record`, uses `useEntityRecord.save()` (auto cache refresh).

---

## Recommended remediation order

1. **Ship-blockers (1 PR):** fix two broken `routing/router` imports (DashboardApp, ToolsApp); add missing `Notice` import in SettingsGeneralApp; null-guard `editedRecord` in SimpleEditorApp; fix `postType` hardcode in Slot fillProps.
2. **Cache invalidation sweep (1 PR):** add `invalidateResolution` after every `deleteEntityRecord`/`saveEntityRecord` that bypasses `useEntityRecord.save()` — covers MediaApp, UsersApp, CommentsApp, TaxonomyApp.
3. **Dead-code purge (1 PR):** delete `src/apps/AppearanceApp.js`; resolve Settings duplication (recommend: repoint host to top-level files, delete `settings-panels/`, standardize on `core/notices`).
4. **WPDS migration (multi-PR by domain):** 21 files need `@wordpress/components` → `@wordpress/ui`. Group by area (DataViews apps / system apps / sidebar components / settings).
5. **DataViews `/wp` path verification (small PR):** confirm webpack aliasing or switch all five imports.
6. **Core-data refactors (low-priority):** PluginsApp + ThemesApp → `useEntityRecords` for `'root','plugin'`/`'root','theme'`. DashboardApp → `_fields=id` on count queries.
7. **Site-title source-of-truth fix:** SiteHubApp + NavigationApp → `useEntityRecord('root','site').record.title`.
8. **CommandPickerApp:** migrate to `useCommand`/`useCommandLoader`.

## Out of scope (v2 will address)

- Selection-bus removal (PreviewPaneApp's `useSelection` subscription).
- Shell-level slot/fill removal.
- Per `docs/plans/wp-admin-shell-v2-migration-directive.md` §2 #4: don't fix triage items proactively during migration. Most of this report is post-v2 cleanup work.
