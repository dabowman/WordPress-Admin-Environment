# core:comments

Prose accompanying `app.json#documentation` for the moderation list.

## Overview

CommentsApp replaces `wp-admin/edit-comments.php` for the per-site moderation queue. It surfaces the four moderation actions that matter day-to-day — approve, unapprove, spam, trash — as DataViews row + bulk actions with per-action eligibility predicates so the action menu stays clean: an already-approved comment shows Unapprove (not Approve), an already-spam comment shows nothing destructive remaining, etc.

The non-trash status changes use a **partial saveEntityRecord** pattern: instead of fetching, mutating, and saving the full comment record, the app dispatches `saveEntityRecord('root', 'comment', { id, status })`. WordPress's REST endpoint accepts the partial payload and PATCHes only the status field; this both reduces round-trip size and avoids clobbering concurrent edits.

## Architecture

Four pieces of state drive the app:

1. **`viewConfig`** — pulled via `useViewConfig('root', 'comment', variant)`. Holds the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#viewConfig` and reaches the resolved cascade via `inject_app_baselines`. Site authors and plugin code override via admin.json `viewConfigs.root.comment._default` or the `wp_admin_shell_view_config_root_comment` filter. **Field renderers and action callbacks live in the React layer** — the spec only carries data; `FIELD_RENDERERS` and the `callbacks` table inside `buildActions()` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `viewConfig.defaultView`. Holds search string, active filters, page, perPage, sort, fields, and layout. A view-state resync `useEffect` keyed on `variant` reseeds when the triple flips on the same hook instance — the `useState` initializer runs once and would otherwise carry the previous variant's perPage/sort/filters into a flipped triple.
3. **`queryArgs`** — derived from `view` via `useMemo`. Maps DataViews concepts (filter operators, sort direction, sort field) to REST query arguments. The comments REST endpoint expects `date_gmt` as the orderby alias for the `date` column, so the mapper translates that one field explicitly.
4. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('root', 'comment', queryArgs)`. Reading `totalItems` + `totalPages` keeps DataViews' pagination footer accurate without a separate count call.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, author, authorEmail, content, status, date, rawRecord }`). The original record is kept on `rawRecord` so future row actions can read fields the projection doesn't surface.

The `setCommentsStatus` callback is shared across all three status-change actions (approve / unapprove / spam). It awaits a `Promise.all` of partial saves, invalidates the records query, and fires a success snackbar with the action-specific message. On error, an error notice surfaces `err.message`. The action ids in the spec are mapped to this callback inside `buildActions()` via the `callbacks` table.

Trash is separate: it's `deleteEntityRecord('root', 'comment', id)` without `force` (the standard trash-not-delete pattern). The action carries a `RenderModal` instead of a callback so DataViews surfaces the confirm dialog before mutating. The modal uses `Promise.allSettled` so one failure in a bulk operation doesn't collapse the rest; a partial-failure error notice surfaces the failed/total count, otherwise a "Moved to trash." snackbar fires.

The comment content cell uses `dangerouslySetInnerHTML` rather than text-only rendering. This is **safe** because `record.content.rendered` is the output of WordPress core's `wp_filter_comment_content` (kses + the comment-text filter chain) — author-supplied raw HTML has been sanitized server-side before it reaches the REST response. Rendering as HTML preserves the formatted view comment moderators expect.

## View-config integration (C2)

CommentsApp consumes the C2 view-config primitive (spec §13 #7). The cascade flow:

1. **Baseline** lives in `app.json#viewConfig` (machine-readable; same shape Ajv validates). `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple.
2. **Admin.json overrides** under `viewConfigs.root.comment._default` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline. Sites and plugins can swap columns, change default page size, hide actions, or add custom moderation actions without forking the app.
3. **Filter overrides** run last via `wp_admin_shell_view_config_root_comment`. Useful for dynamic mutations (per-request, per-user) that JSON can't express.
4. **CommentsApp consumes** via `useViewConfig('root', 'comment', variant?)` → `{ config, isLoading }`. The hook reads from `window.wpAdminShell.config.viewConfigs` synchronously when present; otherwise falls through to `/wp-admin-shell/v1/view-config` REST.

The renderer tables (`FIELD_RENDERERS` keyed by field id, action callbacks keyed by `spec.id`) stay app-side — they're the React half of the contract. Any view-config override that uses an unfamiliar field id falls through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (action declared but inert) until the app side adds a mapping.

### Eligibility predicates

The four bundled actions ship declarative `eligibleWhen` maps in `app.json#viewConfig.actions`:

```json
{ "id": "approve",   "eligibleWhen": { "status": [ "hold", "spam", "trash" ] } }
{ "id": "unapprove", "eligibleWhen": { "status": "approved" } }
{ "id": "spam",      "eligibleWhen": { "status": [ "hold", "approved", "trash" ] } }
{ "id": "trash",     "eligibleWhen": { "status": [ "hold", "approved", "spam" ] } }
```

`compileEligibility()` turns these into the `isEligible(item)` predicate DataViews expects. Array values are inclusive sets (`expected.includes(actual)`); scalar values are equality checks. The shape is intentionally restrictive — it doesn't support `not`/`!=` directly. To express "anything except X", enumerate the allowed values (the four bundled actions all use the enumerated-set form).

### Translation recipe

View-configs ship as locale-agnostic JSON primitives (spec §13 #7) — `app.json#viewConfig` and admin.json `viewConfigs` overrides reach DataViews with raw strings in whatever locale the spec was authored in. CommentsApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    author:  __( 'Author',  'wp-admin-shell' ),
    content: __( 'Comment', 'wp-admin-shell' ),
    status:  __( 'Status',  'wp-admin-shell' ),
    date:    __( 'Date',    'wp-admin-shell' ),
};

const ACTION_LABELS = {
    approve:   __( 'Approve',       'wp-admin-shell' ),
    unapprove: __( 'Unapprove',     'wp-admin-shell' ),
    spam:      __( 'Mark as spam',  'wp-admin-shell' ),
    trash:     __( 'Move to trash', 'wp-admin-shell' ),
};
```

`buildFields` and `buildActions` consult the table first:

```js
compiled.label = FIELD_LABELS[ spec.id ] ?? spec.label;
compiled.label = ACTION_LABELS[ spec.id ] ?? spec.label;
```

**Precedence — LABELS wins for ids the app knows; spec wins for ids it doesn't.** `??` ensures plugin extension columns and actions (ids the app didn't author) keep whatever string the cascade supplied. That preserves the third-party authoring path: a plugin adding a new moderation action via `wp_admin_shell_view_config_root_comment` filter controls its own label via the spec (wrapped in `__()` PHP-side); a plugin swapping a bundled label relabels via either an `app.json` LABELS contribution (future) or the same filter.

A parallel `STATUS_SUCCESS_LABELS` table holds the snackbar copy keyed by action id (`approve` → "Approved.", `unapprove` → "Set to pending.", `spam` → "Marked as spam."). Inline `__()` literals inside the trash `RenderModal` (modal copy, button labels) translate normally — only spec-supplied DataViews fields needed the recipe.

## Rebuild guide

Two patterns worth preserving:

- **Partial PATCH for single-field updates.** Rebuilds on REST clients other than core-data should mirror this — issue a PATCH with just the changed field, not a full PUT. Avoids clobbering concurrent edits on long-form fields like `content`.
- **Per-action eligibility.** DataViews' `isEligible: (item) => ...` predicates filter the action menu per-row. Equivalent: render-time guards inside your action menu component. Worth keeping the action set declarative so the row menu only shows what's reachable from the current state.

A non-WPDS rebuild needs:

- A **list view component** with selection + bulk actions. DataViews is the heavy lift; MUI DataGrid or TanStack Table are equivalents.
- A **REST/core-data adapter** returning `{ rows, total, isLoading }` shaped to match the WordPress REST shape (`useEntityRecords`'s `{ records, isResolving, totalItems, totalPages }`).
- A **destructive-action confirm modal**. Re-use whatever modal primitive the host DS provides.
- A **rendered-HTML cell renderer** — trust the server-side sanitization on `content.rendered` and render as HTML rather than plain text.
- A **notice bus** for success/error feedback after async actions.

## Known limitations

- No reply. wp-admin offers an inline reply form on each row; the v2 design defers this.
- No Quick Edit. wp-admin's row inline-edit (toggleable form for author / email / URL / content) is not wired up.
- No full single-comment Edit screen. wp-admin links to `comment.php?action=editcomment` for a full edit form with parent-comment selector + status switcher; the v2 app surfaces neither the link nor the screen.
- No author / IP / email row-level filtering.
- The Trash action lacks an undo path. wp-admin's edit-comments has a "Undo" snackbar after trash; we issue a plain success snackbar.
- Pagination caps perPage at 100 server-side; the app passes whatever DataViews sends.

Parity gaps versus `docs/screens/comments.md` not surfaced in the v2 app are tracked in that screen spec; they carry forward unchanged from the pre-C2 implementation.
