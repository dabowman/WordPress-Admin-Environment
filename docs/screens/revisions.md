# Screen Spec: Revisions (Compare and Restore)

**Status:** Tier 2 — full spec.
**Source PHP:** `wp-admin/revision.php` + `wp-admin/includes/revision.php` (server data prep) + `wp-includes/revision.php` (storage)
**Current workspace coverage:** None. Reachable only as `iframe:revision.php?revision={id}` if a workspace config wires it.

This spec describes the **revision compare** screen — the side-by-side diff view used to review and restore prior versions of a post or autosave.

---

## 1. Identity

| Field | Value |
|---|---|
| Slug | `revisions` |
| Display name | "Compare Revisions of {Post title}" |
| Original URL (compare) | `/wp-admin/revision.php?revision={revision_id}` |
| Original URL (range compare) | `/wp-admin/revision.php?from={a}&to={b}` |
| Original URL (restore) | `/wp-admin/revision.php?action=restore&revision={id}&_wpnonce=…` |
| Menu location | None — reached from edit screen "Browse / View Revisions" link or "{N} revisions" panel |
| Parent app | The editor screen (block or classic) for the post |
| Sub-screens | None |
| Title in HTML | "Revisions" (constant; the visible H1 is "Compare Revisions of '{title}'") |

---

## 2. Purpose

Review the history of changes to a post; compare any two revisions; restore to a prior version.

Jobs to be done:
- **Recover lost work** — restore a paragraph that was deleted earlier today.
- **Audit changes** — see what an editor changed between draft 3 and the published version.
- **Resolve autosave conflict** — view the autosave that's newer than the visible post; restore or discard.
- **Compare authorship** — see who edited what and when.

---

## 3. Capabilities & access

| Action | Capability | Source |
|---|---|---|
| View screen | `read_post` for the revision (which delegates to `edit_post` for parent) | `revision.php` line ~97 |
| Restore a revision | `edit_post` for the parent post | `revision.php` line ~42 |
| Delete a revision | `delete_post` (admin-only in practice) | `WP_REST_Revisions_Controller::delete_item_permissions_check` |

Additional gating:
- Revisions are disabled when `wp_revisions_enabled( $post )` returns false (some post types have revisions registered, some don't).
- If revisions are disabled but the revision is an autosave, view/restore still works (autosave path).
- If the parent post is locked (someone else editing), restore is blocked at the PHP level (`revision.php` line ~58).

**Permission-denied state:** redirects to `edit.php` with no message. The workspace should mirror with a 403 inside the revisions screen, with a back link.

---

## 4. Data model

### Primary entity: revision (`postType: revision`)

A revision is itself a `WP_Post` with `post_type = 'revision'` and `post_parent` pointing to the original post. Two flavors:

| Type | Behavior | `post_name` pattern | `post_status` |
|---|---|---|---|
| **Manual revision** | Created by `wp_save_post_revision()` on each save | `{parent}-revision-v1` | `inherit` |
| **Autosave** | Created by `wp_create_post_autosave()` per user per post (single autosave; subsequent autosaves overwrite) | `{parent}-autosave-v1` | `inherit` |

### REST endpoints

`WP_REST_Revisions_Controller`:

| Method | Path | Purpose | Cap |
|---|---|---|---|
| `GET` | `/wp/v2/{parent_base}/{parent}/revisions` | List revisions for a post | `edit_post` parent |
| `GET` | `/wp/v2/{parent_base}/{parent}/revisions/{id}` | Read one revision | `edit_post` parent + `read_post` revision |
| `DELETE` | `/wp/v2/{parent_base}/{parent}/revisions/{id}` | Delete a revision | `delete_post` parent + admin-only |

**Restore is NOT a REST endpoint.** It is `wp-admin/revision.php?action=restore&revision={id}&_wpnonce=…` — an admin-post action. Documented as a gap.

### Fields on a revision

| Field | REST path | Notes |
|---|---|---|
| `id` | `id` | Revision post ID |
| `parent` | `parent` | Parent post ID |
| `author` | `author` | User who triggered the save |
| `date` / `date_gmt` / `modified` / `modified_gmt` | … | Revision creation time |
| `title` | `title.rendered` (raw via `?context=edit`) | Snapshot of post_title at that moment |
| `content` | `content.rendered` / `content.raw` | Snapshot of post_content |
| `excerpt` | `excerpt.rendered` / `excerpt.raw` | Snapshot of post_excerpt |
| `slug` | `slug` | Snapshot |
| `meta` | `meta` | Snapshot of registered post-meta (only fields where `revisions_enabled => true`) |

Note: revisions only snapshot **title, content, excerpt** by default in core. Custom-field/meta revisioning requires `register_post_meta` `revisions_enabled` flag (added in 6.4).

### Server-prepared JS payload

`wp_prepare_revisions_for_js( $post, $revision_id, $from )` (in `wp-admin/includes/revision.php`) builds a structured payload localized as `_wpRevisionsSettings`:

```jsonc
{
  "postId": 123,
  "nonce": "abc123",
  "revisionData": [
    {
      "id": 999,
      "title": "Revision title",
      "author": { "id": 1, "avatar": "...", "name": "..." },
      "date": "5 minutes ago",
      "dateShort": "Apr 30, 2026",
      "timeAgo": "5 minutes ago",
      "autosave": false,
      "current": true,
      "restoreUrl": "/wp-admin/revision.php?action=restore&revision=999&_wpnonce=…"
    },
    …
  ],
  "to": 999,
  "from": 998,
  "compareTwoMode": false,
  "diffData": { "999": { "fields": [ { "id": "post_title", "name": "Title", "diff": "<table>…</table>" } ], … } }
}
```

The diff is **server-rendered HTML** using PHP `wp_text_diff()` (which uses `Text_Diff` and `Text_Diff_Renderer_inline` from PEAR-style inclusion in core). The workspace's REST equivalent must either use a similar server-side diff (custom endpoint) or compute diffs client-side.

### Diff fields

By default core diffs three fields:

| Field | Source |
|---|---|
| Title | `post_title` |
| Content | `post_content` |
| Excerpt | `post_excerpt` |

Plugins can add more via `_wp_post_revision_fields` filter.

---

## 5. Layout regions (semantic)

```
┌────────────────────────────────────────────────────────────────┐
│ HEADER                                                          │
│  ├─ H1: "Compare Revisions of '{post title}'"                  │
│  └─ Link: "← Go to editor"                                     │
├────────────────────────────────────────────────────────────────┤
│ TOOLBAR                                                         │
│  ├─ "Compare any two revisions" toggle (off by default)        │
│  ├─ Restore This Revision / Restore This Autosave button       │
│  │   (single-handle mode: enabled when not on the current rev) │
│  │   (compare-two mode: enabled when neither is current)        │
│  └─ Previous / Next buttons (single-handle mode only)          │
├────────────────────────────────────────────────────────────────┤
│ TIMELINE / SLIDER                                               │
│  Single-handle mode:                                            │
│   |-----------●--------------------|                            │
│   ↑ first rev    ↑ selected rev     ↑ current                   │
│  Compare-two mode:                                              │
│   |---●-----------●----------------|                            │
│   ↑ "from" handle ↑ "to" handle                                 │
│                                                                 │
│  Tick-marks at every revision; tooltip on hover shows {date}   │
│  + {author name + avatar}                                       │
├────────────────────────────────────────────────────────────────┤
│ METADATA STRIP                                                  │
│  Single-handle:                                                 │
│   "{author avatar} {author name} — {date}"                      │
│   "Current Revision" badge if at the current end                │
│   "Autosave" badge if revision is an autosave                  │
│  Compare-two:                                                   │
│   Two columns of metadata (from / to)                           │
├────────────────────────────────────────────────────────────────┤
│ DIFF VIEW                                                        │
│  For each diffed field (Title, Content, Excerpt):              │
│  ┌─ Field label (e.g. "Title") ─────────────────────────┐     │
│  │ ┌── Removed (red, left) ──┐ ┌── Added (green, right) ─┐│   │
│  │ │ <strikethrough text>    │ │ <highlighted text>      ││   │
│  │ └─────────────────────────┘ └─────────────────────────┘│   │
│  └────────────────────────────────────────────────────────┘   │
│  When fields are unchanged, they are hidden (no row rendered)  │
└────────────────────────────────────────────────────────────────┘
```

The slider is the central interaction. Drag-handle mode shows a single revision diffed against the current. "Compare any two" mode reveals two handles and lets the user compare any pair.

---

## 6. States

| State | Trigger | Display |
|---|---|---|
| Loading initial | Cold load | Slider rendered with all ticks; spinner on diff area until first diff loads |
| Loading diff | Slider drag / handle move | Spinner over diff area; metadata updates immediately |
| No revisions | Post has only the current state | Redirect back to editor (`revision.php` redirects to `edit.php`) |
| Revisions disabled | `wp_revisions_enabled()` false AND no autosave | Redirect back to edit list |
| Selected = current | Slider on rightmost position (single-handle mode) | "Current Revision" badge; Restore button disabled |
| Selected = autosave | Currently selected revision is an autosave | "Autosave" badge; Restore button label = "Restore This Autosave" |
| Compare-two | "Compare any two revisions" toggle on | Two handles on slider; metadata strip splits into two columns |
| Restore in progress | User clicked Restore | Brief loading; full page redirect to `post.php?…&message=5` (banner: "Post restored to revision from {date}.") |
| Restore failed | Non-200 / lock conflict | Redirect with no banner; or 403 |
| Locked | Parent post is locked by another user | Restore is server-blocked; should display "Restore unavailable — post is locked by {user}" — currently just silent failure (gap) |
| Permission denied | User lacks `edit_post` parent | Redirect to `edit.php` |

---

## 7. Actions

### Slider drag (single-handle mode)
- **Drag handle** — selecting a revision; loads its diff against the current.
- **Click tick mark** — jump to that revision.
- **← / →** keyboard arrows — adjacent revision.
- **Home / End** — first / last revision.

### Slider drag (compare-two mode)
- Two independent handles labeled "from" (left) and "to" (right).
- Either handle can be moved; constrained so from < to (left handle stays left).
- Tick-clicks set the closest handle.

### Toolbar buttons

| Button | Behavior |
|---|---|
| **Compare any two revisions** toggle | Switches between single-handle and compare-two modes; URL updates with `compareTwoMode=true` |
| **Previous** (single-handle) | Move handle one tick to the left |
| **Next** (single-handle) | Move handle one tick to the right |
| **Restore This Revision** / **Restore This Autosave** | POST/redirect to `wp-admin/revision.php?action=restore&revision={id}&_wpnonce=…`. Disabled when selected revision is the current. After success: redirect to editor with banner. Side effect: the restore creates a NEW revision representing the restored state (so undo is possible). |

### Header link
- **← Go to editor** — navigates back to `post.php?post={parent}&action=edit`.

### Per-revision delete
- Not exposed on this screen. Admins can DELETE via REST `/wp/v2/{parent_base}/{parent}/revisions/{id}` separately. Most plugins surface a "Manage revisions" admin tool elsewhere.

---

## 8. Filters, sort, search, pagination

N/A — revisions are listed all at once on the slider. The slider is the navigation primitive.

Sort: implicit chronological (oldest left → newest right).

Pagination: none — all revisions for a post fit on the slider. For posts with many revisions (e.g. 100+), the slider auto-spaces ticks; tooltip on hover identifies each.

Note: WP defaults to keep all revisions; sites can configure `WP_POST_REVISIONS` constant or `wp_revisions_to_keep` filter to cap.

---

## 9. Forms & inputs

N/A — this is a read-only inspect-and-restore screen. The only input is the slider drag.

Restore is a one-click action through a nonce-protected URL — no form fields.

---

## 10. Routing & URL state

### Original wp-admin URL params
- `?revision={id}` — start with this revision selected (single-handle)
- `?from={a}&to={b}` — start in compare-two mode with these handles
- `?action=restore&revision={id}&_wpnonce=…` — restore action target
- `?action=view` (default) — view-only
- `?action=edit` (legacy alias) — same as view

### Recommended workspace URL state
```
#/revisions?type=post&id=123&revision=999
#/revisions?type=post&id=123&from=998&to=999
```

Browser back from a restore must return to the editor (where the restore success banner lives).

---

## 11. Inter-app navigation

### Inbound
| Source | Trigger |
|---|---|
| Editor (block) — Document tab → Status panel → Revisions count | "{N} revisions" link → opens this screen with parent post id |
| Editor (classic) — Revisions meta-box | Same |
| Save success banner — "Post restored from revision" | Includes link back to revisions for next compare |

### Outbound
| Trigger | Destination |
|---|---|
| "← Go to editor" link | Block editor / classic editor for parent post |
| Restore Success | Editor with `?message=5&revision={id}` banner |

---

## 12. Notifications & feedback

| Event | Pattern |
|---|---|
| Restore success | Redirect to editor; banner: "Post restored to revision from {timestamp}." |
| Restore conflict (post locked) | Server silently redirects (gap — should surface) |
| Slide to invalid revision | Slider snaps back; no notice |
| Network error loading diff | Show inline error in diff region: "Couldn't load diff. Retry." |
| Revision missing (deleted between page-load and click) | Banner above slider: "This revision is no longer available." |

---

## 13. Accessibility & keyboard

### Keyboard
| Key | Action |
|---|---|
| **Tab** | Move focus through Compare toggle → slider handle → Previous / Next → Restore |
| **← / →** (slider focused) | Move handle by 1 revision |
| **Page Up / Page Down** | Move handle by 10 revisions |
| **Home / End** | Jump to first / last revision |
| **Enter / Space** (Restore button) | Trigger restore |

### ARIA
- Slider uses `role="slider"` with `aria-valuemin=0`, `aria-valuemax={count-1}`, `aria-valuenow`, `aria-valuetext` (the human-readable date + author).
- Compare-two-mode slider exposes `role="slider"` per handle, with `aria-label="from"` / `aria-label="to"`.
- Diff region uses `role="region"` with `aria-label="Diff for {field}"`.
- "Removed" / "Added" markup uses `<del>` / `<ins>` semantically.
- Restore button has `aria-disabled="true"` when on current revision, with explanatory help text.

### Screen reader
- Selecting a revision announces "{author} {timeAgo}" via `aria-valuetext`.
- "Autosave" badge announced.
- "Current Revision" badge announced.
- Diff content read in field order (Title → Content → Excerpt).

### Focus
- After Restore success → focus on editor banner (browser default; workspace should ensure).
- After mode toggle → focus stays on toggle (no focus jump).

### Pain points (rebuild opportunities)
- Diff is HTML table-based in core — challenging for screen readers; `<del>`/`<ins>` is the only assistive cue.
- No keyboard shortcut to switch mode.
- Slider with 100+ ticks is hard to navigate by keyboard precisely (no jump-to-revision dropdown).

---

## 14. Extension points

| Hook | Purpose | Recommendation |
|---|---|---|
| `_wp_post_revision_fields` filter | Add fields to diff | Honor — workspace's diff list respects the filter output |
| `wp_post_revision_meta_keys` filter | Specify which meta keys to revision | Honor at storage layer (already in core 6.4+) |
| `wp_text_diff_renderer_inline` filter | Replace the diff renderer | Honor at presentation layer |
| `wp_save_post_revision_check_for_changes` filter | Skip revision creation when no changes detected | Honor at storage layer |
| `wp_revisions_to_keep` filter | Per-post revision cap | Honor at storage layer |
| `wp_revisions_enabled` filter | Toggle revisioning per post | Honor — gates this screen |

The screen surface itself has minimal extension points — the diff fields filter is the main one. Plugins typically don't extend revisions UI; instead they offer alternative browse/diff tools.

---

## 15. Mapping & implementation status

### Current workspace coverage
- **None.** The workspace does not expose a `core:revisions` source. Reachable only via `iframe:revision.php?…` if a workspace config wires it.

### Gaps (rebuild list)

| Gap | Priority | Notes |
|---|---|---|
| Native revisions screen as `core:revisions` source | Medium | Modern workspaces will want native compare-and-restore |
| Slider component with single + compare-two modes | Medium | Use `@wordpress/components` `RangeControl` or build custom |
| Diff renderer (Title / Content / Excerpt) | Medium | Two paths: (a) call a custom REST endpoint that returns server-rendered diff HTML, or (b) compute diff client-side (e.g. `diff` library — but no external npm allowed; use `@wordpress/rich-text` `getTextContent` + custom diff via simple LCS) |
| Author + timestamp metadata strip | Low | Reads `revision.author` (embed user) + `revision.date_gmt` |
| Tick marks on slider with hover tooltip | Medium | Density check for high-revision posts |
| **Restore via REST** | **High** | Currently only `wp-admin/revision.php?action=restore&_wpnonce=…`. **No REST endpoint exists for restore in core.** Workspace should expose a custom endpoint `POST /wp-admin-workspaces/v1/posts/{id}/restore-revision/{revision_id}` that calls `wp_restore_post_revision()` server-side and returns the new state. Track upstream gap |
| Lock-conflict feedback | Medium | Server blocks restore silently when post is locked. Surface clearly |
| Revisions list panel embedded inside editor inspector | Medium | "View revisions" should expand inline in inspector for short lists |
| Per-revision delete (admin-only) | Low | `DELETE /wp/v2/{parent_base}/{parent}/revisions/{id}` — exposed via "Manage revisions" UI, not this screen |
| Keyboard shortcut to toggle compare mode | Low | E.g. `c` |
| Visual diff mode (rendered content side-by-side, not just markup) | Low | Compare rendered HTML rather than block markup — desirable for block-edited posts |
| Block-aware diff (per-block changes for block posts) | Medium | Core's text-diff treats block markup as text; a block-aware diff would highlight added/removed/moved blocks |
| Meta-field diffs (registered post-meta with `revisions_enabled`) | Medium | Already supported server-side since 6.4; surface in UI |

### Acceptable interim
Use `iframe:revision.php?revision={id}` as the v1 escape hatch when workspace needs revisions support. The iframe inherits all server-rendered diff and works correctly for restore (form-post inside iframe survives).

---

## 16. Out of scope

- **Cross-post revision compare** — comparing post 1 rev N with post 2 rev M. Not a core feature.
- **Branching / non-linear revisions** — core revisions are strictly linear.
- **Real-time collaboration / collaborative revisioning** — none in core.
- **Revision pruning UI** — core doesn't expose; admins use database tools.
- **Site-editor `wp_template` revisions** — handled by `WP_REST_Template_Revisions_Controller` (separate). Out of scope for this screen.

---

## 17. Reference

- Router + restore handler: `wp-admin/revision.php`
- Server-side data prep: `wp-admin/includes/revision.php` `wp_prepare_revisions_for_js()`
- Storage: `wp-includes/revision.php` (`wp_save_post_revision`, `wp_restore_post_revision`, `wp_create_post_autosave`, `wp_get_post_revisions`)
- REST controller: `wp-includes/rest-api/endpoints/class-wp-rest-revisions-controller.php`
- Diff rendering: `wp-admin/includes/misc.php` `wp_text_diff()` + `wp-includes/wp-diff.php`
- Templates: `wp_print_revision_templates()` (Underscore.js templates rendered into the page)
- Editor integration: `wp-admin/edit-form-blocks.php` (autosave detection lines 291–300); `wp-admin/edit-form-advanced.php` (lines 230–257)
- Site-editor template revisions (sibling): `wp-includes/rest-api/endpoints/class-wp-rest-template-revisions-controller.php`
- Site-editor template autosaves (sibling): `wp-includes/rest-api/endpoints/class-wp-rest-template-autosaves-controller.php`

---

## Spec template usage notes

This screen is unusual because:
1. The primary read flow has a REST equivalent.
2. The primary write flow (restore) does NOT — it remains an admin-post action behind a nonce.
3. The diff rendering is server-side HTML, with no REST equivalent.

Any rebuild that wants Restore-via-REST must ship a custom workspace-side REST endpoint that wraps `wp_restore_post_revision()`. This is the highest-priority gap.
