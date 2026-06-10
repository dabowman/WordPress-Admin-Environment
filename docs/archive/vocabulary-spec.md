# WP Admin Workspaces — Vocabulary & Naming Spec

> **Status:** ARCHIVED — the rebrand this spec drove is complete and live. The
> v3 frame-shape (top-level `engine` / `default-screen` / `frame`), the
> `workspace.json` file name, and the `workspace-*.json` schema names all
> shipped; the live sources of truth are `docs/schemas/*` and
> `docs/schema-sketch.md`. Kept as the historical record of the rename and its
> glossary. Verify any claim against live source before acting on it.

The product was previously presented under a scatter of terms — "shell", "shell
environment", "environment", "admin.json". This spec unifies everything the user
or author sees under one banner: **workspaces**. Internal, descriptive terms
that authors and agents rely on as architecture vocabulary (runtime, kernel,
engine, region, app, …) are deliberately **kept** — see §8.

---

## 1. The model

Three levels. Each names exactly one thing.

| Level | Term | Meaning |
|---|---|---|
| **Product** | **WP Admin Workspaces** (plural) | The plugin, the system, the feature family. |
| **Unit** | **a workspace** (singular) | One complete, resolved admin experience a user actually gets — engine + screens + menu + frame + styles. Authored as one or more **workspace files**. |
| **Internals** | runtime · kernel · engine · region · app · screen · menu · command · mode · slot · cascade · origin | Descriptive architecture vocabulary. Author/agent-facing. **Unchanged** (§8). |

The one-sentence pitch the whole rebrand has to make true:

> *A **workspace** is defined by a `workspace.json` file. It's composed of **apps**
> mounted in **regions**, rendered by an **engine**.*

This parallels `theme.json` exactly — the file is named after the concept it
defines — which is the analogy the design already reaches for ("`admin.json` is
to the back-end what `theme.json` is to the front-end").

---

## 2. Canonical glossary

### Retired (remove from all user- and author-facing copy)

| Retired term | Replaced by | Notes |
|---|---|---|
| **shell** (the product) | **workspace** / WP Admin Workspaces | Plugin name, all prose. |
| **shell** (a bundled config) | **workspace** / **template** | A bundled config is a workspace **template** (§5). |
| **shell environment** | **workspace** | — |
| **environment** | **workspace** | Was only ever marketing copy + the repo name. Repo can rename later; not blocking. |
| **admin.json** (generic term) | **workspace file** / `workspace.json` | The literal filename also changes (§4). |
| **shell switcher** | **workspace switcher** | — |

### Coined / promoted

| Term | Meaning |
|---|---|
| **workspace file** | The author artifact. Generic name: `workspace.json`. May be role-keyed (§9). |
| **`frame`** (new block) | The persistent furniture *wired into* a workspace: branding, notice hosts, persistent widgets. The dissolved inner `workspace` block lands here (§3). Distinct from `styles.chrome`, which is how that furniture is *painted*. |
| **template** | A bundled, complete workspace file you copy as a starting point (§5). |

### Kept, unchanged in meaning

`engine`, `region`, `app`, `screen`, `menu`, `command(s)`, `mode`, `slot`,
`settings` (the registry block), `styles`, `preload`, `regions`/`routes`
(escape-hatch blocks), **`chrome`** (the *styling* concept — `styles.chrome`,
engine `default-styles.chrome`, app window-frame `chrome`), `cascade`, `origin`,
trust tier, `dataView`/`dataField`.

> **Why `frame`, not `chrome`.** `chrome` is already taken and means *visual
> paint*: `styles.chrome` (canvas/sidebar/toolbar/content tokens → `--…--chrome--*`
> CSS vars), engine `default-styles.chrome`, and the app window-frame `chrome`
> string. The dissolved block holds *what furniture exists and what app is wired
> into it* — a different axis. `frame` keeps them cleanly separated: **`frame` =
> the furniture; `styles.chrome` = its paint.**

---

## 3. The workspace file shape: dissolving `workspace`, introducing `frame`

The inner `workspace` block collided with "workspace" as the product term (you
can't have "the workspace's `workspace` block"). It is **dissolved**:

- `engine` → **promoted to a top-level field** (and stays *required*). It's an
  identity-level choice and is already specially protected in the cascade
  deny-list.
- `default-screen` → **promoted to a top-level field** (optional).
- `branding`, `notices`, `widgets`, `customizable` → moved under the new
  **`frame`** block.

### Before

```jsonc
{
  "version": 3,
  "$wpds": "6.9",
  "name": "wp-admin-default",
  "workspace": {
    "engine": "core:default",          // required
    "default-screen": "dashboard-home",
    "branding": { "title": "WordPress", "logo": null },
    "notices":  { "banner": { "app": "core:notices-banner" } },
    "widgets":  { "toolbar": [ /* … */ ] },
    "customizable": [ "default-screen", "branding.title" ]
  },
  "screens": { /* … */ }
}
```

### After

```jsonc
{
  "version": 3,
  "$wpds": "6.9",
  "name": "wp-admin-default",
  "engine": "core:default",            // promoted, required
  "default-screen": "dashboard-home",  // promoted, optional
  "frame": {
    "branding": { "title": "WordPress", "logo": null },
    "notices":  { "banner": { "app": "core:notices-banner" } },
    "widgets":  { "toolbar": [ /* … */ ] },
    "customizable": [ "branding.title" ]   // default-screen now top-level (see below)
  },
  "screens": { /* … */ }
}
```

### Schema + cascade consequences

- **`required`** changes from `[ "version", "$wpds", "name", "workspace", "screens" ]`
  to `[ "version", "$wpds", "name", "engine", "screens" ]`.
- **Cascade merge semantics carry over verbatim** to the new paths:
  `frame.widgets.<slot>` merges by entry `id`; `frame.branding` / `frame.notices`
  deep-merge per field; `null` tombstones honored as today.
- **Deny-list (`WP_Admin_Shell_Customizable::DENY_PATTERNS`)**: `workspace.engine`
  → **`engine`** (now top-level). The other entries are unaffected
  (`screens.*.permissions`, `menu.**.permissions`, `screens.*.app`,
  `commands.*.invoke`).
- **`customizable` allowlists**: relative paths that pointed into
  `workspace.branding.*` / `workspace.notices.*` / `workspace.widgets.*` now point
  into `frame.*`. `workspace.default-screen` becomes top-level `default-screen`.

---

## 4. The config-file family + schemas

The three author artifacts and their schemas get aligned and de-asymmetried.

| Artifact (author writes) | Was | Now |
|---|---|---|
| Workspace file | `wp-content/admin.json` | `wp-content/workspace.json` (+ role-keyed variants, §9) |
| App manifest | `app.json` | `app.json` *(unchanged — "app" is kept vocabulary)* |
| Engine manifest | `engine.json` | `engine.json` *(unchanged — "engine" is kept vocabulary)* |

| Schema file | Was | Now |
|---|---|---|
| Workspace schema | `docs/schemas/admin.json` | `docs/schemas/workspace.json` |
| App schema | `docs/schemas/admin-app.json` | `docs/schemas/workspace-app.json` |
| Engine schema | `docs/schemas/admin-engine.json` | `docs/schemas/workspace-engine.json` |

This fixes the prior asymmetry (`admin.json` vs `admin-app.json`) — the schema
family now shares the `workspace-` prefix while the files authors write keep
their short, descriptive names.

- Published `$id` URLs: `https://schemas.wp.org/admin*.json` →
  `https://schemas.wp.org/workspace*.json`.
- Public reference doc: `docs/public/admin-json-reference.md` →
  `docs/public/workspace-json-reference.md`. `app-json-reference.md` /
  `engine-json-reference.md` keep their names.
- Path filter `wp_admin_shell_admin_json_path` →
  `wp_admin_workspaces_workspace_json_path` (see §6 for the prefix rule).

---

## 5. Bundled workspaces → templates

- Directory: plugin `shells/` → **`workspaces/`**.
- Collective noun: "bundled shells" → **"bundled workspaces."**
- Framing: a bundled workspace you copy to start from is a **template**. The
  default install (`wp-admin-default`) is **the default workspace** (the
  baseline), not a "template"; the others (`single-pane-demo`, `desktop-demo`)
  are **example workspaces**. Stop calling them "demos / starter templates /
  shells" interchangeably — use *template* for the copy-to-start action,
  *example* for the demo configs, *default workspace* for the baseline.
- Slugs (`wp-admin-default`, `single-pane-demo`, `desktop-demo`) may stay as-is.
- `user-switchable` field unchanged.
- The "switch workspace" axis (a user opting into an alternative workspace) is
  **orthogonal** to role-targeting (§9). Copy must distinguish "the workspace
  for your role" (assigned) from "switch workspace" (chosen).

---

## 6. Prefix map — rename "all the way"

One rule: **the symbol prefix is the plugin slug, `wp-admin-workspaces`** (and
its case variants). Applied everywhere, no exceptions, so there is never a
question of which prefix a symbol uses.

| Surface | Was | Now |
|---|---|---|
| Plugin name | WP Admin Shell | **WP Admin Workspaces** |
| Plugin slug / text domain | `wp-admin-shell` | `wp-admin-workspaces` |
| Main plugin file | `wp-admin-shell.php` | `wp-admin-workspaces.php` |
| PHP functions / hooks / options | `wp_admin_shell_*` | `wp_admin_workspaces_*` |
| PHP classes | `WP_Admin_Shell_*` | `WP_Admin_Workspaces_*` |
| PHP constants | `WP_ADMIN_SHELL_*` | `WP_ADMIN_WORKSPACES_*` |
| JS global | `window.wpAdminShell` | `window.wpAdminWorkspaces` |
| Mount element id | `#wp-admin-shell` | `#wp-admin-workspaces` |
| Script / style handles | `wp-admin-shell` | `wp-admin-workspaces` |
| CSS classes | `.wp-admin-shell-*` | `.wp-admin-workspaces-*` |
| CSS custom props | `--wp-admin-shell--*` | `--wp-admin-workspaces--*` |

> **Plural-vs-singular sub-decision (resolved): plural everywhere.** Two spots
> read slightly long — `wp_admin_workspaces_register_workspace()` and the
> `--wp-admin-workspaces--*` token prefix — but a single, exceptionless rule is
> worth more than per-symbol terseness. (If we ever reverse this, the only
> alternative on the table is "plural slug/text-domain, singular symbol prefix
> `wp_admin_workspace_*`" — applied just as exceptionlessly.)

### Public API rename table (the author-facing extension surface)

| Was | Now |
|---|---|
| `wp_admin_shell_register_app` | `wp_admin_workspaces_register_app` |
| `wp_admin_shell_register_engine` | `wp_admin_workspaces_register_engine` |
| `wp_admin_shell_register_template` | `wp_admin_workspaces_register_template` |
| `wp_admin_shell_register_shell( $slug, $admin_json )` | `wp_admin_workspaces_register_workspace( $slug, $workspace_json )` |
| `wp_admin_shell_register_menu_item` | `wp_admin_workspaces_register_menu_item` |
| `wp_admin_shell_register_admin_route` | `wp_admin_workspaces_register_route` |
| `wp_admin_shell_register_dashboard_widget` | `wp_admin_workspaces_register_dashboard_widget` |
| `wp_admin_shell_register_menu_renderer` | `wp_admin_workspaces_register_menu_renderer` |
| `wp_admin_shell_data` (filter) | `wp_admin_workspaces_data` |
| `wp_admin_shell_data_{origin}` (filters) | `wp_admin_workspaces_data_{origin}` |
| `wp_admin_shell_admin_json_path` (filter) | `wp_admin_workspaces_workspace_json_path` |
| `wp_admin_shell_workspace_active()` | `wp_admin_workspaces_is_active()` |
| `wp_admin_shell_workspace_enabled` (option) | `wp_admin_workspaces_enabled` |
| `wp_admin_shell_active_shell` (option) | `wp_admin_workspaces_active_workspace` |
| `wp_admin_shell_get_available_shells()` | `wp_admin_workspaces_get_available_workspaces()` |
| `wp_admin_shell_sanitize_active_shell()` | `wp_admin_workspaces_sanitize_active_workspace()` |
| `window.wpAdminShell.switchShell()` | `window.wpAdminWorkspaces.switchWorkspace()` |
| `window.wpAdminShell.shells` | `window.wpAdminWorkspaces.workspaces` |
| `window.wpAdminShell.workspaceFileActive` | `window.wpAdminWorkspaces.fileActive` |
| JS `switchShell()` | `switchWorkspace()` |

> The full `wp_admin_shell_*` set (146 files), `WP_Admin_Shell_*` (106),
> `wpAdminShell` (119), `.wp-admin-shell-*` (184), `--wp-admin-shell--` (28) is a
> scripted codemod, applied one surface at a time, each gated by its own test
> suite (§10). The table above is the human-readable index of the public/API
> renames a third-party author would notice.

### User-facing strings

- Settings page: classic-side "Settings → WP Admin Shell" → **"Settings → WP
  Admin Workspaces"** (match the workspace-side "Settings → Workspace").
- "Activate WP Admin Workspace" toggle copy — already workspace-worded, keep.
- "Classic wp-admin" / "Back to workspace" admin-bar nodes — already correct, keep.
- Taglines (`package.json`, `readme.txt`, plugin header, `docs/index.html`):
  drop "environment" and "shell". New tagline e.g. *"A configurable,
  React-based WordPress admin workspace."*

---

## 7. The landing page is the litmus test

`docs/index.html` (the GitHub Pages landing page) is currently the most
load-bearing public surface and leans hardest on the retired words —
`<title>` "WP Admin Shell …", "environment" ×15, "shell" ×12, "workspace" ×9.
Rewriting it is the acceptance test for this vocabulary: if the page reads
cleanly with **zero** "shell"/"environment" and "workspace" carrying the weight,
the rename is coherent. Same pass covers `README.md`, `readme.txt`, the plugin
header, and `docs/public/*`.

---

## 8. What does NOT change

These are descriptive architecture terms authors and agents already reason in.
Renaming them would *reduce* clarity, not increase it.

`runtime` · `kernel` · `engine` · `region` · `app` · `screen` · `menu` ·
`command` · `mode` · `slot` · `cascade` · `origin` · trust tier ·
`settings` (registry block) · `styles` · `preload` · `regions`/`routes`
(escape hatches) · `chrome` (the *styling* concept) · `dataView` / `dataField`.

App ids stay namespaced (`core:*`, `plugin:{slug}/{name}`) and may be renamed
independently when their *meaning* changes (precedent: `core:appearance` →
`core:appearance-preferences`) — but not as part of this brand sweep.

---

## 9. Role-keyed workspace files (greenfield — design + open questions)

> **Not part of the pure rename.** This is net-new feature work. Today
> `WP_Admin_Shell_Origin_File` loads a single `wp-content/admin.json` into the
> `plugin` cascade slot, and the `role` origin is option-based
> (`wp_admin_shell_role_config`). The model below has to be *built*, and the
> trust-tier question below decided, before it ships. Sequenced after the rename.

The idea: a workspace file's **name encodes the audience it targets**, turning
the cascade's per-role layer into a first-class, legible authoring surface
instead of an opaque option.

```
wp-content/workspaces/
  workspace.json        ← base layer, applies to everyone
  administrator.json    ← deltas for the Administrator role
  editor.json           ← deltas for the Editor role
  author.json           ← deltas for the Author role
```

- Each file stays a **partial overlay** (deltas only — the established
  theme.json-style "declare what's different" model).
- The cascade merges `baseline → workspace.json → {role}.json → user` to produce
  the workspace a given user sees. One site can present genuinely different
  workspaces to different roles, legible at a glance from the directory listing.
- This finally gives the `role` origin an ergonomic surface and retires the
  worst-named file: `admin.json` stops meaning "config for the admin area" and
  becomes `administrator.json` = "the workspace for the Administrator role."

### Open questions to resolve before building

1. **Role slug vs friendly name.** Use canonical WP role slugs
   (`administrator.json`, `shop_manager.json`) — unambiguous, maps 1:1 to
   `current_user_can`/role checks, works for custom roles — or friendly aliases
   (`admin.json`)? **Lean: canonical slugs** (custom roles fall out for free).
2. **Location + base name.** Confirm `wp-content/workspaces/` (directory, not
   loose files) and that the all-roles base is literally `workspace.json` (vs
   `default.json`).
3. **Trust tier of file-authored role layers** — *the consequential one.* The
   `role` cascade origin is deliberately **shrink-only** (a consumer origin: it
   can remove caps/screens but never grow the OR-set), because it was imagined
   as runtime/DB-authored restriction. But a `{role}.json` *file* is written by
   whoever has filesystem access — a trusted developer, same as the site author.
   So file-authored role layers probably want **full site-level trust** (add
   *and* remove), with shrink-only semantics reserved for any future UI that
   lets a non-developer tweak a role at runtime. This changes the security model,
   not just a label — decide explicitly.
4. **Origin mapping.** Which cascade origin(s) do `workspace.json` (base) and
   `{role}.json` feed? Today the single file feeds `plugin`. Resolve alongside #3.

---

## 10. Migration sequence

Pure rename first (steps 1–6, mechanical, fully testable), feature work last.

1. **This spec** — adopted. The single source the codemod + doc rewrites cite.
2. **Schema + shape** — dissolve inner `workspace` → top-level `engine` /
   `default-screen` + new `frame` block; rename schema files
   (`admin*.json` → `workspace*.json`); update `required[]`, deny-list path,
   `customizable` paths; migrate all shells + fixtures + tests.
3. **Prefix codemod ("all the way")** — every surface in §6, scripted, one at a
   time, each gated by its suite (`test:schema`, `test:runtime`, `test:parity`,
   `test:engines`, the PHP suites).
4. **Config file rename** — `admin.json` → `workspace.json` (loader, default
   path, `wp-content/` reference, every doc mention).
5. **Public copy** — `docs/index.html`, `README.md`, `readme.txt`, plugin
   header, `docs/public/*`. Zero "shell"/"environment" in user-facing prose (§7).
6. **Bundled `shells/` → `workspaces/`** + template framing; `switchShell` →
   `switchWorkspace`, active-workspace option, switcher UI.
7. **(Separate, later) Role-keyed workspace files** (§9) — after the open
   questions, especially the trust tier (#3), are decided.

---

## 11. Open decisions (tracked)

- [ ] §6 plural-everywhere prefix rule — adopted here; flag if reversing.
- [ ] §9.1 canonical role slugs vs friendly aliases.
- [ ] §9.2 `wp-content/workspaces/` dir + `workspace.json` base name.
- [ ] §9.3 **trust tier of file-authored role layers** (security model).
- [ ] §9.4 cascade origin mapping for base + role files.
- [ ] Repo rename `WordPress-Admin-Environment` → `wp-admin-workspaces`
      (non-blocking; coordinate with GitHub Pages / clone URLs).
