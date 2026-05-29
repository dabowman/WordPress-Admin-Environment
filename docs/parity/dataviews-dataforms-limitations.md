# Parity audit: `@wordpress/dataviews` / `DataForm` — component-level limitations

**App / topic:** `dataviews-dataforms-limitations` (cross-cutting component layer)
**Counterpart:** classic wp-admin list tables (`class-wp-*-list-table.php`) + Settings API screens — cross-cutting
**Component version in tree:** `@wordpress/dataviews@14.0.0` (`node_modules/@wordpress/dataviews/package.json:2`; `gitHead 2cea906…`)
**Status:** minor-gaps (shell usage is largely idiomatic; the parity ceiling is set by genuine DataViews/DataForm limitations, several of which are now closeable because v14 shipped features the shell hasn't adopted)

This audit treats the **real package source** (`node_modules/@wordpress/dataviews/src/types/*.ts` are the authoritative API contract) and the **shell's shared harness** (`src/apps/_shared/dataviews/*`, `src/apps/_shared/forms/*`) as the two sources of truth, and WP core 7.0 list-table PHP as the parity target.

---

## Part 0 — The real API surface (so the rest of the doc has a baseline)

Public exports (`node_modules/@wordpress/dataviews/src/index.ts:1`): `DataViews`, `DataViewsPicker`, `DataForm`, `filterSortAndPaginate`, `useFormValidity`, `VIEW_LAYOUTS`, plus all types. **There is NO registration API** — no `registerEntityAction`, `registerField`, `registerFieldType`, `registerLayout`, `registerOperator` (`grep` over `src/` returns nothing; the action-extensibility lives in `@wordpress/fields`, which is **not** a dependency of this plugin — `ls node_modules/@wordpress/fields` → ABSENT). Actions, fields, operators are **all passed as props**; there is no global registry to extend. This shapes every recommendation below.

**Field definition** (`src/types/field-api.ts:190`): `id`, `label`, `header` (string|ReactElement), `description`, `placeholder`, `render`, `Edit` (component | string control-name | `EditConfig` object), `sort`, `isValid` (`Rules`), `isVisible(item)`, `enableSorting`, `enableGlobalSearch`, `enableHiding`, `elements`, `getElements()` (async), `filterBy` (`{ operators, isPrimary } | false`), `readOnly`, `getValue`, `setValue`, `format`, `getValueFormatted`, `type` (closed set — see below).

**Field types are a CLOSED set** (`src/field-types/index.tsx:40` hardcodes the list; no registration): `text · integer · number · datetime · date · media · boolean · email · password · telephone · color · url · array` (`src/types/field-api.ts:64`).

**View** (`src/types/dataviews.ts:99`, `ViewBase`): `type`, `search`, `filters[]`, `sort {field,direction}`, `page`, `perPage`, `fields[]`, `titleField`, `mediaField`, `descriptionField`, `showTitle/showMedia/showDescription`, **`showLevels`**, **`groupBy {field,direction,showLabel}`**, `infiniteScrollEnabled`, `startPosition`. Layouts: **`table · list · grid · activity`** (+ `pickerGrid · pickerTable`) — `src/types/dataviews.ts:345`. Table layout adds `layout.styles` (per-column width/align), `layout.density` (`compact|balanced|comfortable`), **`layout.enableMoving`** (column reorder).

**Operators** (`src/types/field-api.ts:40`, defined in `src/utils/operators.tsx`): `is · isNot · isAny · isNone · isAll · isNotAll · lessThan · greaterThan · lessThanOrEqual · greaterThanOrEqual · before · after · beforeInc · afterInc · contains · notContains · startsWith · between · on · notOn · inThePast · over`. **Date-range (`between`) and relative-date (`inThePast`, `over`) operators exist and ship a custom-selection filter widget** (`src/utils/operators.tsx:230,264,296` — `selection: 'custom'`). Filters reuse the field's own `Edit` control (`src/components/dataviews-filters/input-widget.tsx:42-76`).

**Actions** (`src/types/dataviews.ts:353`): `id`, `label` (string | `(items)=>string`), `icon`, `disabled`, `isPrimary`, `isEligible(item)`, `supportsBulk`, `context` ('list'|'single'). Two shapes: `ActionButton` (`callback(items, {registry, onActionPerformed})`) or `ActionModal` (`RenderModal({items, closeModal, onActionPerformed})` + `modalHeader`, `modalSize`, `hideModalHeader`).

**Pagination is server-driven**: `paginationInfo: {totalItems, totalPages}` is a prop (`src/dataviews/index.tsx:56`). **Selection** is controlled-or-uncontrolled via `selection: string[]` + `onChangeSelection` (`src/dataviews/index.tsx:159-204`). `getItemId`, `getItemLevel(item)`, `isLoading`, `empty`, `onClickItem`, `renderItemLink`, `isItemClickable`, `onReset` all props.

**DataForm** (`src/types/dataform.ts:170`): `data`, `fields`, `form`, `onChange(partial)`, **`validity?`**. Form layouts: **`regular · panel · card · row · details`** (`src/types/dataform.ts:9`). `FormField` supports nesting via **`children`** (`src/types/dataform.ts:148` — this is the renamed/expanded successor to the old `combinedFields`; a bare `combinedFields` key no longer exists). `labelPosition: top|side|none`. `isVisible` is field-level (declared on the `Field`, honored by the layout). Form controls (`src/components/dataform-controls/index.tsx:35`): `adaptiveSelect · array · checkbox · color · combobox · datetime · date · email · telephone · url · integer · number · password · radio · select · text · toggle · textarea · toggleGroup`. A field with `elements` and no explicit `Edit` auto-resolves to `adaptiveSelect` (`index.tsx:93`).

**Validation** (`src/types/field-api.ts:79`, `Rules`): `required`, `elements`, `pattern`, `minLength`, `maxLength`, `min`, `max`, **`custom`** (sync or **async** `(item, field) => null | string`). Surfaced through `useFormValidity` (`src/index.ts:5`) → pass result as `DataForm validity` prop.

---

## Part 1 — Correct-usage audit of `src/apps/_shared/*`

Overall: **idiomatic and well-factored.** The harness is a thin, honest wrapper around the prop-based API; no private-API reaching, no DOM hacks. Specific calls:

### 1.1 `buildFields.mjs` — FINE, one missed capability
`src/apps/_shared/dataviews/buildFields.mjs:28` compiles JSON specs → `Field[]`. Maps `id/type/label/elements/filterBy/render` + coerces `enable*` booleans. Correct.
- **Missed capability (not a bug):** it only forwards `enableGlobalSearch/enableHiding/enableSorting/elements/filterBy/render`. It drops `enableSorting`-adjacent niceties and never forwards `Edit`, `isValid`, `getValue`, `setValue`, `header`, `description`, `render`-config, `format`, `getValueFormatted`. For the list apps that's fine (those are edit-form concerns), **except** `filterBy.operators` — the apps declare `filterBy` but never wire date/range operators (see §2.7). Verdict: **fine for current scope**, but the compiler is the natural seam to add operator/`getElements` support.

### 1.2 `withElementCounts` + `useEntityElementCounts` — RISKY (N+1 requests), correct semantically
The status-tab-count emulation (`buildFields.mjs:105`, `useEntityElementCounts.js:27`) folds per-value counts into the element **label** (`"Published (12)"`) because *DataViews has no count slot on filter elements* — a real limitation (see §2.8). The approach is sound and the value is preserved for filtering (`buildFields.mjs:113`). **Risk:** it fires **one REST request per status value** (`useEntityElementCounts.js:44` loops `for value of values`, each `per_page:1 _fields:id` reading `X-WP-Total`). Posts has 6 statuses → 6 extra requests on every Posts mount, comments 4, users one-per-role. wp-admin computes all status counts in **one** `wp_count_posts()` / `wp_count_comments()` call server-side. Verdict: **risky at scale** (acceptable for now; see P2 recommendation to add a single-request count endpoint). The cache-invalidation mirror (`invalidateEntityElementCounts`, `useEntityElementCounts.js:86`) correctly matches the exact query keys — good.

### 1.3 `useEntityDataView.js` — the three "hacks" are all DEFENSIBLE
`src/apps/_shared/dataviews/useEntityDataView.js:33`:
- **Title-dedup** (`:54-65`) — strips `view.titleField` from `view.fields` before handing to DataViews, because the title cell renders from `titleField` and leaving the id in `fields` double-renders the column. **Verdict: fine, and arguably should be unnecessary** — DataViews' own `PropertiesSection` treats title as a locked field (`src/components/dataviews-view-config/properties-section.tsx:62-70`), so the dedup compensates for the shell seeding `fields` with the title id. Cleaner fix is to *not* include the title id in `VIEW_DEFAULTS.fields`/resolved `defaultView.fields` in the first place. Low priority; current code is correct.
- **View-resync `useEffect`** (`:45-52`) — re-seeds `view`+`selection` when `screenId`/`resyncKeys` flip on the same hook instance (e.g. `/posts` → `/posts/drafts` both mount `PostsApp`). Necessary because `useState` initializers run once. **Verdict: fine.** Correctly keyed on `screenId` (NOT `dataViewConfig`) so in-session view edits aren't clobbered when the cascade re-resolves — comment at `:16` documents this precisely.
- **Selection reset on resync** (`:50`) — correct; stale ids would mis-target bulk actions.

### 1.4 `buildActions.js` + `compileEligibility.mjs` — FINE
`src/apps/_shared/dataviews/buildActions.js:31` compiles `{id,label,isPrimary,isDestructive,supportsBulk,icon,isEligible}` + attaches `RenderModal` (wins) or `callback`. Clean. `eligibilityOverrides` (`:46`) correctly lets code-only presence checks beat the declarative `compileEligibility` (`compileEligibility.mjs:17`, AND-semantic equality/membership). **Note:** `isDestructive` is **not a DataViews `Action` field** (`src/types/dataviews.ts:353` has no `isDestructive`) — DataViews ignores it. The destructive styling is achieved inside the app's own `RenderModal` (`createBulkConfirmModal.js:78` uses `@wordpress/components` `Button isDestructive`), so the prop on the action object is **inert/dead metadata**. Harmless but misleading; document or drop it.

### 1.5 `createBulkConfirmModal.js` — FINE, good defensive code
`src/apps/_shared/dataviews/createBulkConfirmModal.js:37`. `Promise.allSettled` over targets, re-entry guard (`:53`), `finally`-clears-busy (`:124`), `filterItems` for the users self-delete guard (`:54`), partial-failure reporting via `onSettled`. This is the correct pattern for the "no bulk-edit, only bulk-confirm-destructive" model. The one anti-pattern: it hardcodes `padding: var(--wpds-dimension-padding-lg)` inline (`:67`) — fine since this is app-space (WPDS-married), not kernel.

### 1.6 `EntityDataForm.js` / `useEntitySave.js` / `eventValue.mjs` — FINE, **but validation is unwired**
`src/apps/_shared/forms/EntityDataForm.js:66` renders `DataForm` with `data/fields/form/onChange` but **never passes `validity`**. `grep -rn "validity=" src/apps/` → **zero matches**. So although fields declare `isValid` rules (e.g. taxonomy `name: { required: true }` at `src/apps/taxonomy/index.js:292`), the form **never calls `useFormValidity` and never surfaces validation state** — only the browser's native HTML5 control validation fires. The Save button gates on `hasEdits`/`isSaving` only, not validity. **Verdict: incomplete usage** — this is the single most impactful "we could close it today" gap in the form layer (see §3 P1). `useEntitySave.js:26` try/catch → snackbar/notice is correct. `eventValue.mjs` is only needed because the hand-rolled `settings-general` controls take a DOM event; DataForm controls don't — fine.

### 1.7 Per-app consumption — idiomatic
`PostsApp` (`src/apps/posts/index.js`), `CommentsApp`, `TaxonomyApp`, `UsersApp` all: gate `<DataViews>` on `records !== null` with a Spinner (`posts/index.js:282`) — correct (avoids the empty-state flash documented in CLAUDE.md), translate `view`→REST query in a memo, server-paginate via `paginationInfo`. **All correct.** Import path is `@wordpress/dataviews/wp` everywhere (`posts/index.js:7`) — correct (the bare path risks React #130).

---

## Part 2 — Limitations that block wp-admin parity

Legend: **(a)** hard limitation of DataViews today · **(b)** missing feature, viable upstream PR to `@wordpress/dataviews` · **(c)** achievable today with current API, just not done in the shell.

### 2.1 Inline **Quick Edit** — (a) hard limitation
wp-admin renders a per-row toggleable inline form editing status/author/slug/date/password/sticky/template/categories/tags **without leaving the list** (`class-wp-posts-list-table.php:1617` `inline_edit()`; the fieldset at `:1681` is shared `$bulk ? 'bulk-edit' : 'inline-edit'`). Terms have it too (`class-wp-terms-list-table.php:675`). **DataViews has no inline-row-edit primitive** — `Field.Edit` exists only for `DataForm` and the filter widget, never for an in-place table cell. The shell has none (acknowledged: `src/apps/posts/app.md:102`, `taxonomy/app.md:96`, `comments/app.md:101`). The closest DataViews offering is a row **action** opening a `DataForm` in a modal (TaxonomyApp's `TermEditModal`, `src/apps/taxonomy/index.js:312`). **Classification: (a)** at the component level — would require an upstream "editable cell / inline-edit row" feature in DataViews' table layout. Pragmatic shell answer today: a `RenderModal` "Quick Edit" action backed by `DataForm` (achievable now, just a modal not an inline row).

### 2.2 **Bulk Edit** (edit fields on many rows at once) — (a) hard limitation
wp-admin's Bulk Edit (same fieldset, `class-wp-posts-list-table.php:1681`, `id="bulk-edit"`) applies author/status/comments/sticky/template/category-adds to **all selected rows** via one form. DataViews bulk actions are **action-only** (`ActionButton.callback(items)` / `ActionModal`), there is **no bulk-edit-form primitive**. You *can* hand-roll it as a bulk `ActionModal` rendering a `DataForm`, then loop `saveEntityRecord` over selection — but DataViews offers no scaffolding and no "apply N fields to M items" UX. **Classification: (a)** as a primitive; **(c)** as a hand-rolled bulk `RenderModal`. None of the six list apps ship it (`posts/app.md:103`, `taxonomy/app.md:87`, `users/app.md:79` "no change-role bulk action").

### 2.3 **Hierarchical / indented rows** (categories, pages tree) — (c) achievable today, NOT done
**This is the highest-value closeable gap.** wp-admin recurses into a parent-indented tree for hierarchical taxonomies (`class-wp-terms-list-table.php:274` `_rows()` + `:386` `$pad = str_repeat('&#8212; ', $level)`) and for hierarchical post types / Pages (`class-wp-posts-list-table.php:849` `_display_rows_hierarchical()`). **DataViews v14 added native support**: `View.showLevels` (`src/types/dataviews.ts:179`) + `getItemLevel(item)` prop (`src/dataviews/index.tsx:71`, threaded to layouts at `:278`). **The shell does not use either** — `TaxonomyApp` renders categories flat (`src/apps/taxonomy/index.js` maps `parent` into the item at `:128` but never sets `getItemLevel`/`showLevels`, and the term modal has no parent picker — `TERM_FIELDS` at `:287` omits `parent`). `app.md` flags this as a future iteration (`taxonomy/app.md:86,97,108`) and as missing for Pages (`posts/app.md:100`). **Classification: (c)** — the API exists; the shell needs to (1) compute level from the parent chain, (2) pass `getItemLevel`, (3) set `showLevels`, (4) add a `parent` select to the term/page forms, (5) request hierarchical ordering. Caveat: server must return rows in tree order; the REST taxonomy/posts endpoints don't natively pad/sort hierarchically the way `class-wp-terms-list-table::_rows()` does, so the client must build the tree from a flat `parent`-bearing fetch — **(c) with a client-side tree-sort**, no API blocker.

### 2.4 Title-column **hover row-actions** fidelity — (c)/(a) partial
wp-admin shows row actions (Edit | Quick Edit | Trash | View) **on hover under the title** (`class-wp-posts-list-table.php:1575` `handle_row_actions`). DataViews puts per-row actions in a **trailing actions column / kebab menu** (`src/components/dataviews-item-actions/index.tsx`), `isPrimary` actions surface as inline buttons. This is a deliberate **functional divergence**, not a missing capability — DataViews' model is "actions menu," not "hover links under title." You can mark up to a couple actions `isPrimary` to get inline buttons (`Action.isPrimary`, `src/types/dataviews.ts:381`). **Classification: divergence by design / (a)** for exact hover-link fidelity. Low parity risk (the affordance exists, the placement differs).

### 2.5 Sort model: **whole-view single sort** vs per-column — (c) fine, minor divergence
wp-admin sorts by clicking sortable column headers (`get_sortable_columns()`), one column at a time. DataViews is the same: `View.sort` is a single `{field, direction}` (`src/types/dataviews.ts:118`); per-field opt-in is `Field.enableSorting`. **No multi-column sort** in either — parity holds. The shell wires `view.sort` → REST `orderby/order` correctly (`posts/index.js:117`). **Classification: at parity / (c).** One nuance: DataViews sorts only the fields you mark sortable; the shell's `buildFields` forwards `enableSorting` (`buildFields.mjs:51`) — fine.

### 2.6 **Custom filter operators** beyond the built-in set — (a) hard limitation
The operator set is **closed** (`src/utils/operators.tsx:109` `OPERATORS` array; `isRegisteredOperator` at `:712` only checks membership — **no register function**). A field's `filterBy.operators` can only *select from* that list. wp-admin filters that don't map to an operator (e.g. a custom meta-range, a taxonomy-AND-vs-OR toggle) can't be expressed as a DataViews operator. **Classification: (a)** — needs an upstream operator-registration API. (For the common cases — text `contains`, enum `isAny`, date `between`/`before`/`after` — the operators already exist; see §2.7.)

### 2.7 **Date-range & relative-date filters / taxonomy filters** — (c) achievable today, NOT done
wp-admin Posts ships a **months dropdown** (`class-wp-list-table.php:700` `months_dropdown`), a **categories dropdown** (`class-wp-posts-list-table.php:464`), and a **post-format dropdown** (`:502`), all via `extra_tablenav()` (`:567`). The shell wires **only** status (and author/roles) filters (`posts/index.js:128`, `users` roles at `users/index.js:101`); no date, category, or format filter. **DataViews fully supports these today:**
- **Date filters:** the `before/after/on/between/inThePast/over` operators exist with working widgets (`src/utils/operators.tsx`), and the **REST Posts controller accepts `before`/`after`/`modified_before`/`modified_after`** (`class-wp-rest-posts-controller.php:277-300`) and Comments accepts `before`/`after` (`class-wp-rest-comments-controller.php:294-301`). So a `date` field with `filterBy.operators:['before','after','inThePast']` → translate to REST `before/after` is **(c) achievable now**.
- **Taxonomy (category) filter:** declare a `categories` field with `elements`/`getElements` (async term fetch) + `isAny` operator → REST `categories` param. **(c).**
- **Format filter:** `elements` from registered post formats → REST `?format=` not a native param but doable via `tax_query`/`format` taxonomy. **(c)** (REST exposes formats as the `wp:post_format` taxonomy on supporting types).
**Classification: (c)** across the board — the component and REST both support it; the shell's `view→queryArgs` memos just don't translate these operators. The months-dropdown's exact "Month YYYY" preset UX is a minor divergence (DataViews uses generic date pickers), but functional date filtering is fully reachable.

### 2.8 **Status-tab counts** ("Published (12) | Drafts (3)") — (b) missing slot, (c) emulated
wp-admin renders status links with counts above the list (`get_views()`, `class-wp-list-table.php:495`; comments `comment_status_links` `:365`). **DataViews has no count slot on filter elements** — the shell emulates by folding the count into the element label (`buildFields.mjs:105`). It works but (i) costs N+1 requests (§1.2) and (ii) reads as "Published (12)" inside a filter dropdown, not as a row of clickable status tabs above the list. **Classification: (b)** for a native element-count slot upstream + a "primary filter as tab strip" presentation; **(c)** for the current emulation. (The `list` layout treats primary filters more like secondary filters per `FilterByConfig.isPrimary` docs at `src/types/field-api.ts:34`, so even `isPrimary` doesn't give a wp-admin-style tab strip.)

### 2.9 **Drag-reorder rows** (menu order, nav menus, widgets) — (a) hard limitation
wp-admin supports drag-reordering in several places (nav menus, widgets; Pages honor `menu_order`). **DataViews has no row-drag/reorder API** (no `onReorder`, no drag handle in any layout type — `src/components/dataviews-layouts/table/index.tsx` has `enableMoving` for **columns** only, `src/types/dataviews.ts:255`). **Classification: (a)** — would need an upstream row-DnD feature. Not currently surfaced by any list app (none of these screens are ported yet).

### 2.10 **Expandable / detail rows** — (a) hard limitation
No expand-in-place row API in DataViews. The shell uses a `RenderModal` "Details" action instead (ThemesApp, `src/apps/themes/app.md:26`). **Classification: (a)** for inline expansion; **(c)** for modal details (done).

### 2.11 **Column-toggle / Screen Options** parity — (c) close, assess
wp-admin Screen Options lets users hide columns + set per-page count, persisted server-side per user (`get_hidden_columns`, `screen.php:51`). DataViews' **`PropertiesSection`** (`src/components/dataviews-view-config/properties-section.tsx:49`) is the equivalent: it lists hideable fields with check toggles, honoring `Field.enableHiding` (`:32`) and locking title/media/description (`:62`). Per-page is the footer pagination's `perPageSizes` (`src/dataviews/index.tsx:73`). **So column-hiding + per-page ≈ at parity functionally.** Gaps: (i) **persistence** — wp-admin saves hidden columns to user meta; DataViews emits view changes via `onChangeView` and the shell **does not persist** them (the resync `useEffect` re-seeds from `defaultView` on navigation — `useEntityDataView.js:45`), so a user's column choices are lost on screen change/reload. Persisting `view` to user prefs (the shell has `/prefs` REST + `wp_admin_shell_user` origin) is **(c) not done**. (ii) DataViews has no "number of items to show" + "columns" combined panel labeled "Screen Options" — it's the gear/view-config dropdown. **Classification: (c)** — functional parity is reachable; persistence is the real missing piece.

### 2.12 **Row-level validation** (in lists) — (a)/(c)
No in-list validation because there's no in-list editing (§2.1). For the modal/`DataForm` path, validation rules exist (`Rules`, `src/types/field-api.ts:79`, incl. async `custom`) but the shell doesn't wire `validity` (§1.6). **Classification: (c)** for form validation (wire `useFormValidity`); **(a)** for inline-row validation (depends on inline-edit existing).

### 2.13 **DataForm field-type coverage** vs arbitrary settings controls — mixed
DataForm covers the common controls (`src/components/dataform-controls/index.tsx:35`): text/textarea/number/integer/select/radio/checkbox/toggle/toggleGroup/combobox/color/date/datetime/email/url/telephone/password/array. The shell uses these well (`settings-reading/index.js:64` radio + select with `isVisible` conditional fields; taxonomy textarea via `Edit:{control:'textarea',rows:4}` at `taxonomy/index.js:303`). **What DataForm CANNOT express, forcing hand-rolled controls:**
- **`<optgroup>` selects** — DataForm's `select`/`adaptiveSelect` take a flat `elements: Option[]` (`src/types/field-api.ts:19` — `{value,label,description}`, no group). The Site Language and Timezone selects need grouped options → **hand-rolled** `@wordpress/components` `SelectControl` with `<optgroup>` (`settings-general/index.js:249,281`). **(a)** unless upstream adds option groups; CLAUDE.md already codifies "settings-general stays hand-rolled."
- **Radio-with-custom-value** (date/time format presets + a Custom text field that appears when "Custom" is picked) → hand-rolled (`settings-general/index.js:312-363`). DataForm `isVisible` could show a dependent text field, but the "preset radio whose selection drives a sibling free-text whose value is what's actually saved" coupling is awkward in DataForm's flat model. **(c) partially**, **(a)** for the exact UX → keep hand-rolled.
- **Multi-checkbox group** — `array` control + `elements` gives checkbox-list-ish behavior (`src/components/dataform-controls/array.tsx`), so a multi-select set of checkboxes is **(c) achievable**. The Discussion settings' many independent boolean toggles are just individual `toggle`/`checkbox` fields — fine.
- **Media / file picker** — there is a **`media` field TYPE** (`src/field-types/media.tsx`) but it's a *display/render* type (renders an image from a URL/id); there is **no media-library-picker `Edit` control** in `FORM_CONTROLS`. Choosing an attachment (site icon, header image) needs `@wordpress/media-utils` `MediaUpload` hand-rolled. **(a)** for DataForm; **(c)** via custom `Edit` component.
- **Color** — supported (`color` control, `src/components/dataform-controls/color.tsx`). **(c).**
- **Range slider** — **no range control** in `FORM_CONTROLS`; `number`/`integer` give a numeric input, not a slider. **(b)** (small upstream add) or hand-roll `@wordpress/components RangeControl`.
- **Rich inter-field dependencies + conditional validation** — `isVisible(item)` gives show/hide dependencies (used at `settings-reading/index.js:86`). Cross-field *validation* (e.g. "end ≥ start") needs `Rules.custom(item, field)` which receives the whole item (`src/types/field-api.ts:87`) — **(c) achievable** but **not wired** (§1.6).

**Classification summary for forms:** optgroup-select and the exact preset-radio-with-custom UX are **(a)** (correctly kept hand-rolled); media/file picker and range are **(a) for DataForm / (c) via custom `Edit`**; conditional validation is **(c) but unwired**.

---

## Part 3 — Recommendations (prioritized)

### Standardize in `src/apps/_shared/*`

- **[P1] Wire validation into `EntityDataForm`.** Adopt `useFormValidity(fields, form, data)` (`src/index.ts:5`) and pass its result to `DataForm validity` (`EntityDataForm.js:66`), and gate the Save button on validity (not just `hasEdits`). Fields already declare `isValid` rules that are currently inert. Zero API blockers; pure shell work. (Closes §1.6 / §2.12-form.)
- **[P1] Persist `view` to user prefs.** The resync `useEffect` (`useEntityDataView.js:45`) discards column-hide / sort / perPage choices on navigation. Persist `view` (or its hideable subset) via the existing `/prefs` REST + `wp_admin_shell_user` origin so Screen-Options-equivalent state survives reload — the single biggest Screen Options parity gap (§2.11).
- **[P2] Add a `getItemLevel`/`showLevels` path to the shared harness + a `parent` select to the form helpers.** Build the tree client-side from a flat `parent`-bearing fetch; expose an opt-in for hierarchical taxonomies/post types. Closes the categories tree and Pages tree gaps (§2.3) with no API blocker.
- **[P2] Extend `buildFields` to forward `filterBy.operators` + `getElements`,** and add `view→queryArgs` translators for `before/after/inThePast/between/isAny` so date-range, category, and format filters light up (§2.7). REST already supports the params.
- **[P2] Replace the N+1 element-count loop with one request.** Add a small shell REST endpoint that returns all status/role counts in a single response (server-side `wp_count_posts`/`wp_count_comments`), consumed by `useEntityElementCounts` (§1.2).
- **[P3] Add a shared "Quick Edit" + "Bulk Edit" `RenderModal` factory** (DataForm-backed, looping `saveEntityRecord` over selection) as the pragmatic stand-in for true inline edit (§2.1, §2.2). Document it as a modal, not an inline row.
- **[P3] Drop the inert `isDestructive` from the action object** (`buildActions.js:42`) or document that DataViews ignores it and styling happens in the modal (§1.4).

### Request UPSTREAM in `@wordpress/dataviews` (concrete asks)

- **[P1] Inline-edit / editable-cell primitive for the `table` layout** — reuse `Field.Edit` to edit a cell in place, with row-level commit/cancel. This is the single biggest parity unlock (Quick Edit §2.1, Bulk Edit §2.2, inline reply §2.10/comments). Today there is **no** in-list editing primitive.
- **[P2] Native count slot on filter `elements`** (e.g. `Option.count`) + a "primary filter as tab strip" presentation, so status tabs with counts stop riding the label string (§2.8).
- **[P2] Option groups (`<optgroup>`) in `select`/`adaptiveSelect`** so grouped selects (Language, Timezone) don't force a hand-rolled control (§2.13).
- **[P2] Operator registration API** (mirror of how actions/fields are passed, but for `OPERATORS`) so custom filter semantics are expressible (§2.6). The set is currently closed (`src/utils/operators.tsx:712`).
- **[P3] Row reorder / drag-and-drop API** (`onReorder` + drag handle) for menu-order / nav-menu screens (§2.9). Column moving exists (`enableMoving`), row moving does not.
- **[P3] Range/slider form control** in `FORM_CONTROLS` (§2.13).

### Where an escape hatch is the right answer

- **Keep `settings-general` hand-rolled** — optgroup selects + preset-radio-with-custom-value are genuine DataForm limits (§2.13); CLAUDE.md already mandates this. Don't force it into DataForm.
- **Media-library pickers** (site icon, header) → custom `Edit` component wrapping `@wordpress/media-utils MediaUpload`, not DataForm's display-only `media` type (§2.13).
- **Block-editor-driven content** (post content, anything needing the block canvas) → iframe (the EditorApp pattern), never DataForm.
- **Modal `DataForm` for "edit one record"** (TaxonomyApp's `TermEditModal`, `taxonomy/index.js:312`) is the correct, idiomatic substitute for inline edit until the upstream primitive lands.

---

## API-blocker ledger (the Type-3 surfaces)

| Capability | wp-admin source | DataViews/REST status | Tag |
|---|---|---|---|
| Inline Quick Edit row | `class-wp-posts-list-table.php:1617` | No inline-edit primitive in DataViews | **[upstream]** dataviews |
| Bulk Edit (N fields × M rows) | `class-wp-posts-list-table.php:1681` (`id=bulk-edit`) | No bulk-edit-form primitive; hand-rollable as bulk modal | **[upstream]** dataviews (primitive) / **[shell]** (workaround) |
| Comment inline reply | `class-wp-comments-list-table.php:753,757` (`reply`) | No inline-edit; REST `POST /comments` exists → modal reply is **[shell]** | **[upstream]** for inline; **[shell]** for modal |
| Hierarchical indented rows | `class-wp-terms-list-table.php:274,386`; `class-wp-posts-list-table.php:849` | `getItemLevel`+`showLevels` exist (v14); REST returns flat `parent` → client tree-sort | **[shell]** (not done) |
| Custom filter operators | `extra_tablenav` custom filters | Operator set closed (`utils/operators.tsx:712`) | **[upstream]** dataviews |
| Date / category / format filters | `class-wp-list-table.php:700`; `class-wp-posts-list-table.php:464,502` | Operators + REST `before/after`/`categories` all exist | **[shell]** (not wired) |
| Status-tab counts (single request) | `class-wp-list-table.php:495`; `:365` | No element-count slot; emulated via label; N+1 requests | **[upstream]** (count slot) / **[shell]** (1-request endpoint) |
| Drag-reorder rows | nav-menu / widgets / `menu_order` | No row-DnD in any layout | **[upstream]** dataviews |
| Persisted column-hide (Screen Options) | `screen.php:51` `get_hidden_columns` | `PropertiesSection` toggles columns but shell doesn't persist `view` | **[shell]** (not done) |
| Form validation feedback | Settings API server validation | `useFormValidity` + `DataForm validity` exist; shell passes neither | **[shell]** (not wired) |
| optgroup select / media picker / range in DataForm | General Settings controls | Not in `FORM_CONTROLS`; hand-roll or custom `Edit` | **[upstream]** dataviews (native) / **[shell]** (escape hatch) |

**Bottom line:** the shell's `_shared/*` harness is idiomatic and correct; the real parity ceiling is set by genuine DataViews component limits (inline edit, bulk edit, custom operators, row DnD, count slots, optgroups — all **[upstream]**), but a meaningful tranche is **closeable today with current APIs** (hierarchical rows, date/category/format filters, view persistence, form-validation wiring — all **[shell]**) and should be the near-term focus.
