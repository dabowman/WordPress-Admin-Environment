# core:comments

Prose accompanying `app.json#documentation` for the moderation list.

## Overview

CommentsApp replaces `wp-admin/edit-comments.php` for the per-site moderation queue. It surfaces the four moderation actions that matter day-to-day — approve, unapprove, spam, trash — as DataViews row + bulk actions with per-action eligibility predicates so the action menu stays clean: an already-approved comment shows Unapprove (not Approve), an already-spam comment shows nothing destructive remaining, etc.

The non-trash status changes use a **partial saveEntityRecord** pattern: instead of fetching, mutating, and saving the full comment record, the app dispatches `saveEntityRecord('root', 'comment', { id, status })`. WordPress's REST endpoint accepts the partial payload and PATCHes only the status field; this both reduces round-trip size and avoids clobbering concurrent edits.

## Architecture

Four pieces of state drive the app:

1. **`dataView`** — pulled via `useDataView(screenId)`. Holds the JSON spec for fields, default view, default layouts, and actions. The baseline ships in `app.json#dataView` and reaches the resolved cascade via `inject_app_baselines`. Site authors and plugin code override via admin.json `settings.dataViews.root.comment.<variant|_default>` or the `wp_admin_workspaces_data_view_config_root_comment[_<variant>]` filter. **Field renderers and action callbacks live in the React layer** — the spec only carries data; `FIELD_RENDERERS` and the `callbacks` table inside `buildActions()` map ids to behavior.
2. **`view`** — a local `useState` mirroring the DataViews controlled shape, seeded from `dataView.defaultView`. Holds search string, active filters, page, perPage, sort, fields, and layout. A view-state resync `useEffect` keyed on `variant` (or `screenId`) reseeds when the triple flips on the same hook instance — the `useState` initializer runs once and would otherwise carry the previous variant's perPage/sort/filters into a flipped triple.
3. **`queryArgs`** — derived from `view` via `useMemo`. Maps DataViews concepts (filter operators, sort direction, sort field) to REST query arguments. The comments REST endpoint expects `date_gmt` as the orderby alias for the `date` column, so the mapper translates that one field explicitly.
4. **`records / isResolving / totalItems / totalPages`** — pulled from `useEntityRecords('root', 'comment', queryArgs)`. Reading `totalItems` + `totalPages` keeps DataViews' pagination footer accurate without a separate count call.

`data` is a `useMemo` projection of `records` into the row shape DataViews wants (`{ id, author, authorEmail, content, status, date, rawRecord }`). The original record is kept on `rawRecord` so future row actions can read fields the projection doesn't surface.

The `setCommentsStatus` callback is shared across all three status-change actions (approve / unapprove / spam). It awaits a `Promise.allSettled` of partial saves, invalidates the records query, and either fires the action-specific success snackbar (no failures), surfaces the first rejection's `err.message` (every save failed — total wipeout, give the author the real reason), or surfaces a `%failed of %total comments failed to update` error notice for partial failure. The action ids in the spec are mapped to this callback inside `buildActions()` via the `callbacks` table.

Trash uses the same `allSettled` pattern via the `RenderModal` path: `deleteEntityRecord('root', 'comment', id)` without `force` (standard trash-not-delete behavior). The modal renderer owns the confirm dialog so DataViews handles focus + backdrop + dismiss; on confirm one failure doesn't collapse the rest and a partial-failure error notice surfaces the failed/total count, otherwise a "Moved to trash." snackbar fires.

The comment content cell uses `dangerouslySetInnerHTML` rather than text-only rendering. This is **safe** because `record.content.rendered` is the output of WordPress core's `wp_filter_comment_content` (kses + the comment-text filter chain) — author-supplied raw HTML has been sanitized server-side before it reaches the REST response. Rendering as HTML preserves the formatted view comment moderators expect.

## DataView integration (C2 / v3 restored)

CommentsApp consumes the dataView primitive (spec §13 #7). The cascade flow:

1. **Baseline** lives in `app.json#dataView` (machine-readable; same shape Ajv validates). `inject_app_baselines` injects it into the post-merge resolved tree only when nothing in the cascade declared the same triple.
2. **Admin.json overrides** under `settings.dataViews.root.comment.<variant|_default>` cascade through the 6 origins (core / engine / plugin / site / role / user). Declared triples are authoritative — they win outright over the manifest baseline. Sites and plugins can swap columns, change default page size, hide actions, or add custom moderation actions without forking the app.
3. **Filter overrides** run last via `wp_admin_workspaces_data_view_config_root_comment` (always fires) plus `wp_admin_workspaces_data_view_config_root_comment_<variant>` (fires when `variant !== '_default'`). Useful for dynamic mutations (per-request, per-user) that JSON can't express.
4. **CommentsApp consumes** via `useDataView(screenId)` → `{ config, isLoading }`. The hook reads from the inline `window.wpAdminWorkspaces.config` snapshot synchronously when present; otherwise falls through to `/wp-admin-workspaces/v1/data-view?screen=<id>` REST.

The renderer tables (`FIELD_RENDERERS` keyed by field id, action callbacks keyed by `spec.id`) stay app-side — they're the React half of the contract. Any dataView override that uses an unfamiliar field id falls through to DataViews' default renderer for the declared `type`; unfamiliar action ids surface with no callback (action declared but inert) until the app side adds a mapping.

### Eligibility predicates

The four bundled actions ship declarative `eligibleWhen` maps in `app.json#dataView.actions`:

```json
{ "id": "approve",   "eligibleWhen": { "status": [ "hold", "spam", "trash" ] } }
{ "id": "unapprove", "eligibleWhen": { "status": "approved" } }
{ "id": "spam",      "eligibleWhen": { "status": [ "hold", "approved", "trash" ] } }
{ "id": "trash",     "eligibleWhen": { "status": [ "hold", "approved", "spam" ] } }
```

`compileEligibility()` turns these into the `isEligible(item)` predicate DataViews expects. Array values are inclusive sets (`expected.includes(actual)`); scalar values are equality checks. The shape is intentionally restrictive — it doesn't support `not`/`!=` directly. To express "anything except X", enumerate the allowed values (the four bundled actions all use the enumerated-set form).

### Translation recipe

DataView docs ship as locale-agnostic JSON primitives (spec §13 #7) — `app.json#dataView` and admin.json `settings.dataViews` overrides reach DataViews with raw strings in whatever locale the spec was authored in. CommentsApp recovers translation by keeping two id→`__()` tables in `index.js`:

```js
const FIELD_LABELS = {
    author:  __( 'Author',  'wp-admin-workspaces' ),
    content: __( 'Comment', 'wp-admin-workspaces' ),
    status:  __( 'Status',  'wp-admin-workspaces' ),
    date:    __( 'Date',    'wp-admin-workspaces' ),
};

const ACTION_LABELS = {
    edit:                 __( 'Edit',               'wp-admin-workspaces' ),
    reply:                __( 'Reply',              'wp-admin-workspaces' ),
    approve:              __( 'Approve',            'wp-admin-workspaces' ),
    unapprove:            __( 'Unapprove',          'wp-admin-workspaces' ),
    spam:                 __( 'Mark as spam',       'wp-admin-workspaces' ),
    unspam:               __( 'Not spam',           'wp-admin-workspaces' ),
    trash:                __( 'Move to trash',      'wp-admin-workspaces' ),
    untrash:              __( 'Restore',            'wp-admin-workspaces' ),
    'delete-permanently': __( 'Delete permanently', 'wp-admin-workspaces' ),
};
```

`buildFields` and `buildActions` consult the table first:

```js
compiled.label = FIELD_LABELS[ spec.id ] ?? spec.label;
compiled.label = ACTION_LABELS[ spec.id ] ?? spec.label;
```

**Precedence — LABELS wins for ids the app knows; spec wins for ids it doesn't.** `??` ensures plugin extension columns and actions (ids the app didn't author) keep whatever string the cascade supplied. That preserves the third-party authoring path: a plugin adding a new moderation action via `wp_admin_workspaces_data_view_config_root_comment` filter controls its own label via the spec (wrapped in `__()` PHP-side); a plugin swapping a bundled label relabels via either an `app.json` LABELS contribution (future) or the same filter.

A parallel `STATUS_SUCCESS_LABELS` table holds the snackbar copy keyed by action id (`approve` → "Approved.", `unapprove` → "Set to pending.", `spam` → "Marked as spam.", `unspam` → "No longer marked as spam.", `untrash` → "Restored."). Inline `__()` literals inside the confirm `RenderModal`s and the Edit/Reply form modals (modal copy, button labels) translate normally — only spec-supplied DataViews fields needed the recipe.

## Status verbs (issue #113)

The status flow is fully bidirectional. Beyond `approve` / `unapprove` / `spam` / `trash`, the app wires:

- **Not spam (`unspam`)** and **Restore (`untrash`)** — both partial-PATCH `status` to `approved` through the shared `setCommentsStatus` callback (the same `Promise.allSettled` path the other status flips use). Mirroring wp-admin, neither restores the comment's *prior* state (REST does not preserve it); both land in the approved queue. `STATUS_TARGETS` maps `unspam`/`untrash` → `approved`.
- **Delete permanently (`delete-permanently`)** — `deleteEntityRecord('root','comment', id, { force: true })`, routed through a destructive `createBulkConfirmModal` (the same factory the Trash confirm uses) with an explicit "cannot be undone" message. Eligible only on `spam`/`trash` rows, matching wp-admin where permanent delete is reachable only from those queues.

Every status flip and delete refreshes both the list query and the per-status count queries via the shared `refreshList()` helper (`invalidateResolution` on `getEntityRecords` + `invalidateEntityElementCounts`), so the list, the status filter labels, and the view tabs all re-resolve.

## Author column (issue #112, Comments half)

`FIELD_RENDERERS.author` (the `AuthorCell` component) stacks every author field already present on the `edit`-context REST record:

- **Avatar** from `author_avatar_urls` (prefers 48px, falls back through the available sizes), rendered as a 32px `<img alt="">`.
- **Name** in bold (falls back to "Anonymous").
- **Email** as a `mailto:` link.
- **Author URL** as an external link (`target="_blank" rel="noopener noreferrer"`), label stripped of its protocol for a tidier display.
- **Author IP** — rendered **only** when `userCan('moderate_comments')` (resolved once at module load from the static cap map). Matches wp-admin's moderator-only IP exposure.

All five ride the same `data` projection (`useMemo` over `records`) — no extra request.

## Edit + Reply modals (issue #114)

Inline-in-row editing is upstream-blocked: DataViews has no editable-cell (#162) or detail-row (#169) primitive. So Quick Edit, full Edit, and Reply ship as **modal actions** built on the shared `createEntityFormModal` factory (`_shared/dataviews/EntityFormModal.js`) — no comments-only modal.

- **Edit** (one modal, Quick Edit ≡ full Edit) — `mode: 'edit'`. Exposes `author_name` / `author_email` (only when `moderate_comments`, gated via the `EDIT_FORM` field list) / `author_url` / `content` (textarea) / `status` (select) / `date`. Commits by PATCHing the buffered `editedRecord` through `useEntityRecord().save()`. `toData` normalizes `content.raw ?? content.rendered` into the textarea string.
- **Reply** — `mode: 'create'`, content-only POST. `parent` + `post` come from the subject row via `toRecord(draft, item)` and are never user-editable. The clicked comment renders as read-only context ("In reply to …") via the factory's `renderContext(item)` hook. Author defaults to the current moderator and the reply auto-approves, both server-side.

To support Reply's row-derived implicit fields, `createEntityFormModal`'s **create mode** was extended to thread the action's subject row into `toData(undefined, item)`, `toRecord(draft, item)`, and the new optional `renderContext(item)`. This is backward-compatible — existing single-arg `toData`/`toRecord` callers ignore the extra argument — and is the project's first inline-creation instance (the same Modal Create pattern grows to Add New User and create-with-meta).

## View tabs (issue #111, Comments half)

The shared `ViewTabs` strip renders above the list: **All / Pending / Approved / Spam / Trash** segments with live counts from `useEntityElementCounts`. Clicking a segment writes the corresponding `status` filter into `view.filters` (All clears it → unfiltered `status: 'any'`) and resets to page 1. `activeSegmentId(view)` derives the pressed segment back from the current filter, so deep-links and the existing status filter dropdown stay in sync. The counts object feeds both the tabs and the status-column filter labels — one set of requests.

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

- **Reply / Edit are modal, not inline.** wp-admin offers an inline reply form + a row Quick Edit toggle; DataViews has no editable-cell (#162) or detail-row (#169) primitive (both `blocked:upstream`), so both ship as modal actions. Swap the host to inline when those primitives land — not a missed requirement.
- No `Mine` view tab. The strip ships **All / Pending / Approved / Spam / Trash**; `Mine` (scoped to `author=<me>`) is not wired, and there is no `Mine` count.
- Parent-comment **selector** in Edit. wp-admin's full edit form lets a moderator re-parent a comment; the Edit modal exposes author / content / status / date but not a parent picker.
- No author / IP / email row-level filtering (the IP is displayed for moderators but not filterable — REST has no `author_ip` collection param).
- The Trash / spam / delete actions lack an undo path. wp-admin's edit-comments has an "Undo" snackbar; we issue a plain success snackbar.
- Pagination caps perPage at 100 server-side; the app passes whatever DataViews sends.
- Status **counts** drive both the `ViewTabs` strip and the status-column filter labels (`Approved (12)`, `Pending (3)`) via the shared `useEntityElementCounts` hook — one `per_page=1&_fields=id` request per status, read off the `X-WP-Total` header.

Parity gaps versus `docs/screens/comments.md` not surfaced in the v2 app are tracked in that screen spec; they carry forward unchanged from the pre-C2 implementation.
