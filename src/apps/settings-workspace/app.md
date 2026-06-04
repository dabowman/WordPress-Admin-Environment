# core:settings-workspace

DataForm panel for the **Activate WP Admin Workspace** toggle. Persists the `wp_admin_workspaces_workspace_enabled` option through `/wp/v2/settings`, and prompts the user to reload when the saved value flips — applying the change requires re-evaluating `wp_admin_workspaces_is_active()` on the next request.

## Why this exists

The W3 toolbar "Classic wp-admin" button was a session-scoped escape hatch (cookie). For a real preference you want persistence across sessions, devices, and reloads. This screen is that.

The toggle is a **veto** layer over the existing trigger logic, not a sufficient condition: a `wp-content/admin.json` file (or the legacy `wp_admin_workspaces_active_workspace` option) is still required to activate the workspace. The flag's only job is to let the user turn it OFF.

## Re-enabling from classic

A user who toggles the workspace off in workspace context lands in classic with no shell UI. To avoid stranding them, `wp-admin-workspaces.php` registers a parallel **Settings → WP Admin Shell** page (`add_options_page`) that writes the same option through the same sanitize callback. So:

| Where you are | How to toggle |
|---------------|---------------|
| Workspace     | Settings → Workspace (this screen) |
| Classic       | Settings → WP Admin Shell (`/wp-admin/options-general.php?page=wp-admin-workspaces-workspace`) |

Both write `wp_admin_workspaces_workspace_enabled` via the `wp_admin_workspaces_settings` registration group; the next page load picks the right surface.

## Rebuild guide (non-WPDS / non-React port)

- Read `wp_admin_workspaces_workspace_enabled` from `/wp/v2/settings` (boolean).
- Render a single checkbox with the label "Activate WP Admin Workspace" and the help text from `app.json#documentation.interactions`.
- On Save: `POST /wp/v2/settings` with `{ wp_admin_workspaces_workspace_enabled: bool }`. Show success / error notice.
- If the persisted value flipped, render a "Reload to apply" notice with a reload action.

## Known limitations

- **Reload required.** The workspace-active gate is server-evaluated on every admin request; the JS save updates the option but doesn't re-run the gate for the current session. The reload prompt is explicit so the user opts in to the disruption.
- **No legacy-option migration.** This toggle is independent of `wp_admin_workspaces_active_workspace` (the back-compat shell selector). Both options exist; the enabled flag overrides everything when set to false.
