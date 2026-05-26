# WP Admin Shell — Demo Flow

Walkthrough of every shipped feature in `v2.0.0-beta.1` (tagged `01cc512`, 2026-05-06). Full run ~30 min; compressed cut ~10 min (§1 → §3 → §4 Posts+Plugins → §8 → §12 → §13 one filter).

## 0. Setup (pre-demo, off-camera)

- `npm install && npm run build` — confirm `build/` populated.
- `npx wp-env start` — Gutenberg plugin auto-loads from `.wp-env.json`.
- Login as admin. Open `/wp-admin/admin.php?page=wp-admin-shell`.
- Second tab w/ classic `/wp-admin/` for side-by-side compare.

## 1. Default install — wp-admin parity

**Show:** `wp-admin-default` shell loads first. Mirrors wp-admin nav 1:1.

- Walk sidebar. Every native item present (Posts/Pages/Media/Comments/Appearance/Plugins/Users/Tools/Settings).
- Click `Plugins` → native PluginsApp w/ DataViews. Activate/deactivate one. **No page reload** — REST mutation + cache invalidation.
- Click `Appearance → Editor` → SiteEditorApp iframe (capability-gated `edit_theme_options`).
- Hover toolbar. Site-hub + user menu render.

**Talking point:** drop-in default. Zero config required.

## 2. Capability gating

**Show:** four-layer gate (region → app → source-cap floor → REST).

- Open second browser as Subscriber-role user.
- Sidebar prunes to Profile only. Plugins/Users/Settings invisible.
- Try direct URL `…?page=wp-admin-shell#/users` → app blocks, shows fallback.
- Back to admin tab. Demo `wp-admin-default` matches what wp-admin natively shows for that role.

## 3. Shell switching

**Show:** runtime swap, no rebuild.

- Toolbar shell-picker dropdown → switch to `developer-admin`.
- Page reloads w/ new chrome. Dark sidebar, drill-down design nav, native apps everywhere.
- Switch to `content-author` → minimal writer chrome, collapsed nav.
- Switch to `client-portal` → branded (Acme logo, red accent). Same plugin, different `admin.json`.
- Open WP-CLI: `npx wp-env run cli wp admin-shell list-shells` → see all five registered.

## 4. Native app tour (on `developer-admin`)

DataViews + `@wordpress/core-data` everywhere. No raw `fetch()`.

- **Posts** → DataViews table. Sort, filter, change layout (table/grid/list).
- **Media** → grid, drag-drop upload, click → detail modal.
- **Users** → bulk-select two, delete w/ reassign-to-self guard (try selecting yourself; filtered out client-side).
- **Comments** → approve/spam/trash inline. Partial `saveEntityRecord` — no full PUT.
- **Plugins / Themes** → entity-driven DataViews on `'root','plugin'` / `'root','theme'`.
- **Site Health** → live `/wp-site-health/v1/tests/{id}` runner.

## 5. Editor flows

- **SimpleEditor** (Substack-style): Posts → New. Title input + 9-block allowlist. Type → see 2s debounced auto-save indicator (`Unsaved changes` → `Saving…` → `Saved`). Cmd+S flushes immediately.
- **Full Editor**: open existing post → iframe escape hatch into `post.php?action=edit`. Save → returns to shell w/ snackbar.
- Note: native `@wordpress/edit-post` mount deferred to v2.x — five blockers documented in `SiteEditorApp.js`.

## 6. Drill-down design nav (developer-admin)

- Sidebar → `Design`. Slides to sub-screen w/ back button + focus restoration.
- Sub-items: Templates / Template Parts / Blocks / Navigation / Styles.
- Click `Templates` → core:posts on `wp_template` entity. Reuse, not rebuild.
- Click `Styles` → site-editor iframe scoped to styles route, chrome hidden via injected CSS.
- Back button → returns to root, focus lands on `Design` item.

## 7. Multi-area / preview layout

- On shell w/ `preview` configured (e.g. demo `pages` app w/ `preview: "editor"`).
- Click row → primary card (480px) + preview card float on dark chrome.
- Resize window → cards hold elevation.

## 8. Command palette + bindings

- Press `Cmd+K` anywhere. `@wordpress/commands` palette opens.
- Type "new post" → fuzzy-match → enter → navigates.
- Show `bindings` block in `admin.json`: `[{shortcut: "g p", invoke: "open-app:posts"}]`. Press `g p` → triggerable region opens.

## 9. URL-driven routing (v2)

**Show:** URL is full app state.

- Click into Posts → URL hash updates `#/posts`.
- Cmd+click row → middle-click new tab → app deep-links from URL alone.
- Edit hash directly to `#/users` → app swaps. No JS state magic.
- Note: `routing.route-key` declares URL slot; plain `<a href>` navigates.

## 10. Dirty-state guard

- Open SimpleEditor, type content (don't save).
- Try sidebar nav away → `<NavigationGuard>` intercepts. Confirm dialog.
- Try browser back → hashchange-revert kicks. Confirm dialog.
- Try close tab → `beforeunload` fires.
- Save → guard releases. Nav freely.

## 11. Notices

- Save settings → snackbar (auto-dismiss).
- Trigger error (delete plugin you can't) → dismissible banner.
- Both `Notice.Root` from `@wordpress/ui`. SnackbarList still legacy (no WPDS port).

## 12. Theming via tokens

**Show:** chrome → WPDS bridge. No per-component overrides.

- Open `client-portal.json`. Show `chrome.sidebar.bg-default = "{color.brand.red.500}"`.
- Reload → sidebar Buttons/IconButtons inherit red palette automatically.
- Edit DTCG `tokens.json` → change brand red → reload → palette propagates.
- Note: PHP deep-merges site → theme → plugin → core; `.mjs` resolver coerces 8 DTCG types.

## 13. Extension points (live)

Pop terminal. Six surfaces, demo three:

- **Register app**: drop `plugin:*` manifest at `{plugin}/apps/foo/app.json` → activate plugin → app available in any shell that lists it.
- **Register shell**: `wp_admin_shell_register_shell( 'demo-runtime', $admin_json )` in mu-plugin → toolbar picker shows it.
- **Filter merged config**: `add_filter('wp_admin_shell_data', fn($c) => …)` → mutate one nav label → reload → see change.

## 14. a11y + keyboard

- Tab-only walk: nav → toolbar → main → user-menu. Visible focus ring, logical order.
- Open region w/ `isModal` (e.g. media detail) → focus trapped, Esc dismisses, return focus restored.
- VoiceOver on (Cmd+F5): site-hub announces as banner, nav as navigation, main as main.
- Run axe browser ext on rendered DOM. Should be clean.

## 15. Tests on screen (closer)

```bash
npm run test:schema && npm run test:parity && npm run test:runtime
npx wp-env run cli wp eval-file wp-content/plugins/WordPress-Admin-Environment/tests/php/run-cascade-tests.php
# … 527 assertions green
```

End: tag `v2.0.0-beta.1` at `01cc512`. Definition of Done met 2026-05-06.
