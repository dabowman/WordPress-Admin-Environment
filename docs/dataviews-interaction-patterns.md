# DataViews Interaction Patterns

How the workspace re-expresses classic wp-admin's **inline list-table flows** (Quick Edit, inline Reply, Bulk Edit, row pickers, status links) as a small set of **shared, reusable patterns** that every DataViews-backed app builds against — instead of each app rolling its own.

> **Read this before building or reviewing any `area:dataviews` app.** The goal is one set of components and two contracts, not twelve bespoke modals. Tracking + the net-new shared work: see the umbrella issue referenced at the bottom.

WordPress DataViews has **no in-list editing or row-expansion primitive** — `Field.Edit`-in-cell (#162) and the expandable detail-row API (#169) are both `blocked:upstream`. So the inline affordances classic wp-admin renders *in the row* are, in the workspace, **substituted** by modals / screens. When the upstream primitives land we swap the **host**, not the logic — which is exactly what the two contracts below buy us.

---

## The two contracts

Every host pattern here obeys these. They are what make a flow portable across a modal, a side-pane/inspector, and a full screen without a rewrite.

### 1. Presentation-agnostic units

A flow (Edit / Create / Detail / Bulk) is a **unit** that owns:

- its **entity binding** — `useEntityRecord` / `useEntityRecords` with a **buffered `edit()`** exposing `save()` / `hasEdits` (never a hand-rolled `useState` mirror of server fields);
- its **fields** (via `@wordpress/dataviews` `DataForm`) and any **sub-slots** (e.g. a media preview / image-editor slot);
- **injectable actions** (Save, Cancel, Delete) — supplied or styled by the host.

The unit **does not own its chrome.** The host decides whether it lives in a modal, a region, or a screen.

### 2. The host chooses the commit strategy

| Host | Commit |
|---|---|
| Modal | **Explicit Save** (Save/Cancel footer) |
| Side-pane / inspector | **Autosave** on change (debounce / blur) |
| Full screen (editor-backed) | the editor's own save model |

Same field set, same validation — only the commit wiring differs. A unit exposes `save()` + `hasEdits` so a modal host renders a Save button; a pane host autosaves and ignores it. (Comments-edit is explicit-save in a modal; Media metadata autosaves — both correct, same unit shape.)

### Action → Host routing rule

Every app's `edit`/`create` action must choose a host. The rule:

| Situation | Host pattern |
|---|---|
| Small entity (comment, term, user, media item) — edit | **Modal Edit** (quick edit == full edit) |
| Small entity — create | **Modal Create** |
| Editor-backed entity (post, page) — quick edit | **Modal Edit** (metadata subset) |
| Editor-backed entity — full edit | **Navigate to the editor screen** |
| Apply fields to many selected rows | **Bulk Edit** |
| Destructive / irreversible | **Bulk Confirm** |

**Quick Edit and full Edit collapse into one surface for small entities** — once it's a modal, "quick" has no speed advantage, so expose the whole field set in one Modal Edit. Only editor-backed entities keep the quick-vs-full split (modal vs screen).

---

## Pattern catalog

### Host patterns — where a flow renders

#### Modal Edit
- **Intent:** edit one small entity's full field set. Substitutes classic Quick Edit **and** the single-record Edit screen.
- **Host / commit:** modal, explicit Save.
- **Shared:** `EntityFormModal` (a `RenderModal` action hosting `DataForm` + `useEntitySave`) — *net-new; promote from the taxonomy term modal.*
- **Consumers:** #114 (comments), taxonomy terms, users edit, #109 (media metadata, but autosaving — same unit, pane-style commit).
- **Substitutes:** #162.

#### Modal Create
- **Intent:** create a related entity inline. Classic inline Reply / "Add New".
- **Host / commit:** modal, explicit submit (blocking when the new id is needed).
- **Shared:** `EntityFormModal` in create mode (no id → POST).
- **Consumers:** #114 (comment Reply — content-only, parent/post implicit), #122 (Add New User), add-term. Content-minimal by default, **expandable** to richer create-with-meta (see Upload / Ingest).

#### Navigate-to-edit
- **Intent:** editor-backed entities open their editor screen rather than a modal.
- **Host / commit:** route navigation; the editor owns save.
- **Shared:** an `editHref(item)` / route-resolution helper + the Action→Host rule above.
- **Consumers:** posts/pages (`#107` defines the quick-vs-full boundary).

#### Bulk Edit
- **Intent:** apply a chosen subset of fields to M selected rows, with a per-field **"— No change —"** sentinel.
- **Host / commit:** modal, explicit Apply; `Promise.allSettled` over the selection with partial-failure reporting.
- **Shared:** `BulkEditModal` — *net-new.* `#110` (Users "Change role") is the degenerate single-field case and should consume the same component.
- **Consumers:** #107 (posts), #110 (users).
- **Substitutes:** #165 (upstream bulk-edit-form), #162.

#### Bulk Confirm (± embedded sub-form)
- **Intent:** destructive / irreversible bulk action; sometimes carries a small form (e.g. **reassign target** on user delete).
- **Host / commit:** modal, confirm; `Promise.allSettled`; self-safe filtering (users skip the acting user).
- **Shared:** `createBulkConfirmModal` — **exists.** Extend to host an optional sub-form for the reassign case.
- **Consumers:** trash / delete-permanent / empty-spam-trash (comments, posts), bulk user delete (#22 reassign).

#### Detail / read-only inspect
- **Intent:** read-only inspection of one row.
- **Host / commit:** modal (or future pane), no commit.
- **Shared:** the same presentation-agnostic unit as Modal Edit, in read-only mode.
- **Consumers:** themes `details` (precedent), comment full content, media detail.
- **Substitutes:** #169.

#### Upload / Ingest (Create whose *source is a file*)
- **Intent:** create entities from a file selection, optionally collecting meta in the same flow.
- **Host / commit:** header/toolbar trigger → optional meta modal; multipart `apiFetch` + per-file `try/catch` error notices; cache-invalidate only when ≥1 succeeds.
- **Shared:** an upload trigger + a Modal-Create variant whose initial data comes from the file(s); future drag-and-drop zone.
- **Consumers:** #109 (media — today a bare system dialog; the natural place to grow into create-with-meta), plugin/theme ZIP upload, import.

### Field / control patterns — reused *inside* forms and cells

#### Relational / hierarchical / async picker
- **Intent:** pick a related entity: parent term (tree), reassign user, featured media, post parent, "in response to".
- **Shared:** an async/hierarchical select control usable as a `DataForm` field type; a media-library picker control.
- **Consumers:** #115 (category parent tree), #170 (media picker), users reassign.

#### Cell-renderer library
- **Intent:** common column renderers shared across apps.
- **Shared:** `buildFields` renderers map (**exists**) extended with: avatar + name, status badge, relative date, media thumbnail, mime-type tile.
- **Consumers:** #112 (Comments Author column, Users username cell), #109 (media field tile).

### List-surface patterns

#### Declarative view → REST `queryArgs` mapper
- **Intent:** translate the DataViews `view` (search / filters / sort / paging) into REST query args, declaratively, instead of a hand-rolled mapper per app.
- **Shared:** `buildQueryArgs(view, mapping)` — *net-new* (today each app hand-rolls it).
- **Consumers:** #132 (date / category / format / author filters on Posts + Media), every list app.

#### Pinned view tabs / segment strip with counts
- **Intent:** the classic `All | Mine | Pending | …` subsubsub strip with live counts and an active state.
- **Shared:** a `ViewTabs` component fed by `useEntityElementCounts`. Pinned segments may **lock** the underlying status filter (see #209).
- **Consumers:** #111 (posts/comments status + Mine + Sticky), #163 (count slot).
- **Substitutes:** #163.

#### Action mutation (status flip, no form)
- **Intent:** one-click row/bulk status changes — approve / unapprove / spam / trash / restore / (de)activate.
- **Shared:** `buildActions` callbacks + partial-PATCH via `saveEntityRecord` — **exists.**
- **Consumers:** #113 (comments status verbs) extends the set; posts trash; themes/plugins activation.

---

## Shared-module map

| Module | Status | Patterns |
|---|---|---|
| `_shared/forms/EntityDataForm.js` | exists (explicit-save wrapper) | Modal Edit/Create (modal flavor) |
| `_shared/forms/useEntitySave.js` | exists | commit core |
| `_shared/forms/useEntityAutosave` | **net-new** (promote when #109 / #119 need it) | pane/inspector commit |
| `_shared/dataviews/createBulkConfirmModal.js` | exists | Bulk Confirm |
| `_shared/dataviews/buildActions.js` | exists | Action mutation, action→host wiring |
| `_shared/dataviews/buildFields.mjs` (+ renderers) | exists (extend) | Cell-renderer library |
| `_shared/dataviews/useEntityDataView.js` | exists | view state |
| `_shared/dataviews/useEntityElementCounts` | exists | counts for ViewTabs / filter labels |
| `_shared/dataviews/EntityFormModal` | exists | Modal Edit, Modal Create |
| `_shared/dataviews/BulkEditModal` | **net-new** | Bulk Edit |
| `_shared/dataviews/ViewTabs` | **net-new** | Pinned view tabs |
| `_shared/dataviews/buildQueryArgs` | **net-new** | view→REST mapper |
| `_shared/dataviews/pickers/*` | **net-new** | Relational/hierarchical/async pickers |
| `editHref` / Action→Host helper | partly exists (PostsApp) → codify | Navigate-to-edit |

**Kernel boundary:** all of the above live in **app space** (`src/apps/_shared/*`), never `src/runtime/*` — they import `@wordpress/dataviews` / `@wordpress/components` / WPDS, which the kernel must stay free of (see `CLAUDE.md` → "Kernel is DS-neutral").

### `EntityFormModal` usage

`createEntityFormModal` is a factory returning a DataViews `RenderModal`, consumed through the `buildActions` `modals` map — no bespoke `message` handler:

```js
import { createEntityFormModal } from '../_shared/dataviews/EntityFormModal';
import { buildActions } from '../_shared/dataviews/buildActions';

const editComment = createEntityFormModal( {
	entity: [ 'root', 'comment' ],   // [ kind, name ]
	mode: 'edit',                    // 'edit' | 'create'
	fields: COMMENT_FIELDS,          // DataForm field defs
	form: COMMENT_FORM,              // DataForm layout
	toData: ( record ) => ( {        // edit: editedRecord → form data (near-identity)
		content: record?.content?.raw ?? '',
		author_name: record?.author_name ?? '',
	} ),
	// NOTE: no `toRecord` on an edit modal — edit commits the buffered record
	// through `useEntityRecord().save()` and never re-maps the payload.
	messages: { saved: __( 'Comment updated.' ), error: __( 'Failed to save.' ) },
} );

const replyToPost = createEntityFormModal( {
	entity: [ 'root', 'comment' ],
	mode: 'create',
	fields: REPLY_FIELDS,
	form: REPLY_FORM,
	toData: () => ( { content: '', post: currentPostId } ), // seed the draft
	toRecord: ( data ) => data,      // create-only: form data → POST payload
	onSaved: ( record ) => invalidate( record ),
} );

const actions = buildActions( specs, { modals: { edit: editComment, reply: replyToPost } } );
```

- **Edit:** buffers through `useEntityRecord( kind, name, item.id ).edit()` (`data = editedRecord`, mapped near-identically by `toData`), keyed `key={item.id}` so per-item state resets between openings; **Save** commits the buffer via `useEntityRecord().save()` (wrapped by `useEntitySave`, which is threaded the entity coords so a REST failure is detected and the modal stays open — `saveEditedEntityRecord` resolves on error, so the success boolean, not a thrown catch, is authoritative); **Cancel** discards the buffer. `onSaved` receives the post-save server record.
- **Create:** seeds a local draft from `toData(undefined)`, maps it to the POST body with `toRecord`, **Submit** `POST`s via `saveEntityRecord` (blocking — returns the new record, or `undefined` on a REST failure, in which case the error notice shows and the modal stays open), then `onSaved(record)`.
- **`toRecord` is create-only.** Edit does NOT apply it; an edit modal that passes `toRecord` is a no-op for the value (only the create path consumes it). Keep `toData` for edit a near-identity projection of the buffered record.
- **Validation gating.** Both edit and create run `useFormValidity( data, fields, form )` and disable the commit button while `! isValid` (plus `! hasEdits` on edit) — same as `EntityDataForm`.
- **Explicit-save modal only** (contract #2). Autosaving hosts share the same `fields` / `form` but commit elsewhere — do not route them through this factory.

**Cascade caution:** any app shipping a new dataView family (e.g. `root/media/_default`) must declare its `defaultView` (incl. `mediaField` / `titleField`) **completely** — a workspace that redeclares the triple wins outright and a partial copy silently drops baseline keys (`CLAUDE.md` → "A workspace that redeclares a `settings.dataViews` triple wins OUTRIGHT").

---

## Upstream substitution table

When these land in `@wordpress/dataviews`, swap the **host**, keep the unit:

| Upstream issue | Workspace substitute today |
|---|---|
| #162 editable-cell / inline-edit | Modal Edit + Bulk Edit |
| #169 expandable detail-row | Detail / inspect modal |
| #163 native count slot / tab-strip | `ViewTabs` |
| #165 bulk-edit-form primitive | `BulkEditModal` |
| #170 media-library-picker control | picker control |

---

## Build order

Build (or stub) the **net-new shared components before the per-app lanes consume them**, so apps share one implementation instead of forking:

1. `EntityFormModal` (Modal Edit + Create) — unblocks #114, #122, taxonomy, #109.
2. `BulkEditModal` — unblocks #107, #110.
3. `buildQueryArgs` + `ViewTabs` — unblock #132, #111.
4. Pickers + renderer-library extensions — unblock #115, #112, #170.

Per-app issues should **consume** these and contribute entity-specific bits only (field defs, REST mapping, renderers). Scheduling lives in the umbrella tracking issue.
