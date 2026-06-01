# core:menus

Prose accompanying `app.json#documentation` for the native classic-menu editor (Appearance → Menus, issue #120, Option B — no drag-and-drop).

## Overview

MenusApp rebuilds wp-admin's `nav-menus.php` over the three nav-menu REST entities — menu containers, menu items, and theme locations — as a simplified native editor. It targets site authors on **classic themes** who still rely on `wp_nav_menu()` locations. On a **block theme** the app disables itself and points to the Site Editor's Navigation block (classic menus are superseded there), offering the classic `nav-menus.php` iframe as a power-user fallback.

The resolved design (issue #120) is **Option B**: instead of a bespoke nested-sortable (drag-and-drop), reorder and nesting happen through explicit **Up / Down / Indent / Outdent** controls per item, plus a numeric **Order** field in the item modal. Classic menus are a legacy surface (largely replaced by template parts + the Navigation block), so the investment in a custom DnD primitive isn't warranted; drag-reorder can be swapped in when the upstream primitive (issue #168) lands.

## Architecture

The app is hand-rolled native UI (not a DataViews list) because the reorder UX and the nested item tree don't fit DataViews' flat table model. State:

1. **`menus`** — `useEntityRecords('root', 'menu', { per_page: 100, context: 'edit' })`. Drives the menu selector and supplies the active menu's `name` + assigned `locations`.
2. **`locations`** — `useEntityRecords('root', 'menuLocation', …)`. Theme-declared locations, keyed by `name`. Rendered as assignment checkboxes.
3. **`selectedMenuId` / `activeMenuId`** — local selection; defaults to the first menu once they resolve.
4. **`items`** — `useEntityRecords('root', 'menuItem', { menus: activeMenuId, per_page: 100, context: 'edit' }, { enabled: activeMenuId !== null })`. Flat item records carrying `parent` + `menu_order`.
5. **`menuModal` / `itemModal`** — modal toggles (`'create'` or a record).

`window.wpAdminShell.config.workspace['theme-support']['block-theme']` is read once at mount (helper `readThemeSupport`). When true, the editor body never mounts — a disabled panel renders instead.

### Entity names

WordPress core-data registers the nav-menu entities under `kind: 'root'`:

- `root` / `menu` → `/wp/v2/menus`
- `root` / `menuItem` → `/wp/v2/menu-items` (`rawAttributes: ['title']`)
- `root` / `menuLocation` → `/wp/v2/menu-locations` (`key: 'name'`)

All three carry `baseURLParams: { context: 'edit' }` as the entity default; the app passes `context: 'edit'` explicitly per the shell convention. Menus are private-by-default since WP 6.8, so `edit` context is required.

### Item tree + reorder (`menuItemTree.mjs`)

`src/apps/menus/menuItemTree.mjs` is a pure helper (no imports → node-importable + unit-tested by `tests/runtime/menus-item-tree.test.mjs`), mirroring the taxonomy app's `termTree.mjs` convention:

- `buildItemTree(items)` — flattens the flat record list into depth-first display rows, each annotated with `depth` (0-based). Each level is sorted by `menu_order` (ties broken by id). Orphans (parent off the page) reparent to top level so no row is dropped; a visited-set guard breaks self-/cyclic-parent loops, and any item never reached appends flat at the end.
- `siblingsOf(items, parent)` — the ordered sibling list under a parent.
- `reorderSiblings(orderedSiblings)` — recomputes contiguous 1-based `menu_order` for a sibling array already in desired order, returning only the `{ id, menu_order }` pairs that changed (so the caller PATCHes the minimum).
- `parentOf` / `orderOf` — robust numeric coercion of the `parent` / `menu_order` fields.

The reorder handlers in `index.js` compose these:

- **Up / Down** (`moveItem`) — swap the item with its adjacent sibling, then `reorderSiblings` → PATCH the changed orders in parallel.
- **Indent** (`indentItem`) — reparent under the immediately-preceding sibling, placed last among that sibling's children. No-op for the first sibling (nothing to nest under).
- **Outdent** (`outdentItem`) — promote to the grandparent level, positioned right after the old parent; reparent first, then settle sibling orders. No-op when already top-level.

Each reorder is a small batch of `saveEntityRecord('root','menuItem', { id, … })` PATCHes followed by `invalidateResolution('getEntityRecords', ['root','menuItem', itemsQuery])` (the exact 3-element key the live query resolved under). Failures surface a dismissible error notice.

### Item modal (`MenuItemModal.js`)

Three item kinds, matching wp-admin's "Add menu items" panel:

- **Custom link** (`type: 'custom'`) — free `url` + navigation label.
- **Page or post** (`type: 'post_type'`, `object: 'page'|'post'`) — relational `SelectControl` over `useEntityRecords('postType', …, { status: 'publish' })`.
- **Category or tag** (`type: 'taxonomy'`, `object: 'category'|'post_tag'`) — relational `SelectControl` over `useEntityRecords('taxonomy', …)`.

The relational pickers are the lightweight **#115 stand-in** — a synchronous `useEntityRecords` (capped at `per_page: 100`) surfaced as select options, fetched only for the active kind (`enabled` gating avoids fetching both post + term lists). The shared relational picker primitive replaces this when #115 lands.

The modal also exposes the numeric **Order** field (Option B). On submit, custom links write `type:custom` + `url` (clearing any prior object linkage); relational kinds write `type` + `object` + `object_id`. New items carry `menus: menuId`; edits carry `id`.

### Menu-name modal (`MenuNameModal.js`)

A single text field for create / rename, hand-rolled (not `createEntityFormModal`) because it's toggled from the editor's own toolbar buttons rather than a DataViews action. Decode-on-seed avoids double-encoding an entity-bearing menu name.

### Theme-location assignment

Each location checkbox toggles the location name in the **active menu's** `locations` array and `saveEntityRecord('root','menu', { id, locations })`. Writing the menu's `locations` field is the canonical REST path for assignment (the `menuLocation` entity is read-only-ish — keyed by name and reflecting the menu→location binding).

### Notices

Success → snackbar, failure → dismissible banner, via `@wordpress/notices` — the canonical shell notices contract.

## Block-theme fallback (shared signal with #121)

`WP_Admin_Shell_Appearance_Menu` (PHP, `wp_admin_shell_data` priority 4) stamps `workspace.theme-support` with `{ block-theme, theme-supports }` and **also** prunes the native `menus` screen on block themes (and gates it on `current_theme_supports('menus')` for classic themes via the `requires` rule). The `nav-menus` iframe screen is deliberately **theme-agnostic** — it is NOT in the prune rules, so it survives on every theme as the deterministic full-fidelity classic editor.

So on a block theme the native `menus` screen is normally pruned before it ever reaches the runtime; the app's own `block-theme` short-circuit is defense-in-depth (and covers a custom shell that surfaces the screen unconditionally). When it fires, the panel links to `#/site-editor` (router navigation) and to `#/nav-menus` (the iframe screen). We link to the **workspace route** `#/nav-menus`, not the raw `/wp-admin/nav-menus.php`: the raw path is claimed by the native `menus` screen's `legacy_path`, so the capture-phase admin-link interceptor would map it back to `#/menus` (this same disabled panel on a block theme). Routing to `#/nav-menus` mounts the iframe screen deterministically — which is why that screen must stay agnostic to the prune.

### `nav-menus` reachability (the menu entry point)

The `#/nav-menus` fallback link is a **convenience**, not the sole way in. The bundled `wp-admin-default` shell pins the `nav-menus` screen as a real item in the **Appearance** menu group (`menu.appearance.items.nav-menus`, label "Menus (Classic)"). Because `nav-menus` is not in the prune `RULES`, that menu node survives on every theme. The resulting per-theme menu state:

- **Classic theme (supports menus):** both the native **Menus** editor (`core:menus`, the simplified DataForm editor) AND **Menus (Classic)** (`iframe:nav-menus.php`, full-fidelity) appear — distinct labels, both functional, no dead links.
- **Classic theme (no `current_theme_supports('menus')`):** the native **Menus** item is pruned by the `requires` gate; **Menus (Classic)** remains (wp-admin's `nav-menus.php` is reachable regardless of registered locations — you can build a menu without assigning it anywhere).
- **Block theme:** the native **Menus** item is pruned (superseded by the Site Editor's Navigation block — correct wp-admin parity); **Menus (Classic)** survives as the reachable classic escape hatch, and the block-theme self-disable panel's `#/nav-menus` link now resolves to it.

So the iframe screen is never reachable only by a hand-typed URL — it is always a real nav entry, and the block-theme panel link always resolves to a mounted screen.

## Rebuild guide

A non-WPDS / non-React rebuild needs:

- A **menu selector** + create / rename / delete affordances over the `root/menu` entity (`force: true` on delete).
- An **item tree renderer** that flattens `root/menuItem` records (`parent` + `menu_order`) into depth-first rows with per-row Up / Down / Indent / Outdent + Edit + Remove controls. The pure `menuItemTree.mjs` transforms are framework-agnostic and can be reused directly.
- An **item editor** (modal or panel) with a type switch (custom / post_type / taxonomy), relational pickers over the chosen object type, a navigation-label field, and a numeric order field.
- A **theme-location assignment** control writing the menu's `locations` array.
- A **notice bus** (snackbar success / banner error) and **`context: 'edit'`** on every read.
- The **block-theme guard** reading `workspace['theme-support']['block-theme']`.

Patterns to preserve:

- `context: 'edit'` on all three entities (private-by-default since 6.8).
- `{ force: true }` on every delete (menus + items have no trash).
- `invalidateResolution` with the exact query key after each mutation.
- `decodeEntities` on names/titles before render and modal seeding.

## Known limitations

- **No drag-and-drop.** Reorder is explicit Up / Down / Indent / Outdent + numeric Order (Option B). Drag-reorder waits on issue #168.
- **Relational pickers cap at 100 objects** (`per_page: 100`) and list only published posts/pages. Large sites won't see every candidate; replace with the #115 relational picker (search-backed) when it lands.
- **Editing an item that points at a non-published or paged-out object shows an empty picker.** The relational pickers query `status: 'publish'` + `per_page: 100`, so when you open the modal on an existing item linked to a draft/private/pending object — or an object beyond the first 100 — the seeded `objectId` matches no option and the `SelectControl` renders nothing selected. The underlying link is intact (the `objectId` state is retained, so re-saving without touching the picker preserves it), but it reads as "no selection." The #115 search-backed picker (which can resolve the currently-linked object explicitly) fixes this; until then, treat an empty picker on an existing relational item as "linked to an object outside the published first-100," not as a broken link.
- **No bulk add.** wp-admin lets you check several pages/posts and "Add to Menu" at once; this app adds one item per modal submission.
- **No "Add menu items" accordion** of all candidate objects — the modal picks one object at a time.
- **No item meta editing** beyond label / URL / order / link target — wp-admin's per-item panel also exposes Title Attribute, CSS Classes, Link Relationship (XFN), and Description. Those fields are writable via REST but not surfaced yet.
- **Auto-add new top-level pages** ("Automatically add new top-level pages to this menu") is not exposed.
- **Outdent ordering** places the promoted item right after its old parent; it does not preserve the item's prior descendants' relationship beyond what REST stores (children follow their `parent` pointer, which is unchanged).
- **Theme-location assignment** writes the menu's `locations` array; it does not surface the reverse (a location already bound to another menu is silently rebound on save, matching wp-admin's radio-like behavior only loosely — both menus may report the location until the next refetch).

Parity gaps versus `docs/screens/menus.md`:

- No screen-options / "Show advanced menu properties" toggles.
- No live preview of the rendered menu.
- No Manage Locations tab (locations are inline checkboxes on the active menu instead).
- No drag-and-drop nesting/reordering (Option B by design).
- No bulk select / delete of items.
- No per-item move-to-top / move-under-specific-item quick links beyond Up/Down/Indent/Outdent.
