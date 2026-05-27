---
name: wordpress-dataviews
description: Build data browsing, filtering, and editing interfaces with WordPress DataViews (@wordpress/dataviews). Use when creating admin list views, data tables, grid layouts, item pickers, CRUD interfaces, or any structured data display — inside WordPress plugins or standalone React apps. Covers DataViews, DataForm, DataViewsPicker, field definitions, view state, actions, filtering, sorting, pagination, free composition, and the extensibility API.
---

# WordPress DataViews Development

`@wordpress/dataviews` provides React components for rendering, filtering, sorting, and editing structured datasets. It powers the WordPress Site Editor's Pages, Templates, and Patterns screens and is the foundation for admin interface development in WordPress 6.5+ (current: 6.9, released April 2025).

## Core Concepts

DataViews is a **controlled component system**. You own all state. The component never fetches data — you provide `data`, `fields`, `view`, and `actions`. When users interact (filter, sort, paginate, switch layouts), DataViews calls `onChangeView` with an updated view object. You decide how to respond — client-side filtering or server-side API calls.

**Three components, one field system:**

| Component | Purpose | Use for |
|---|---|---|
| `DataViews` | Browse/filter/sort collections | List pages, manage posts, browse media |
| `DataForm` | Edit single items | Edit forms, settings panels, detail views |
| `DataViewsPicker` | Select items from a collection | Media pickers, page selectors, link inserters |

All three share the same `fields` API — define fields once, reuse everywhere.

## Decision Framework

```
Need to display/manage structured data?

  ├─ Browse a collection?
  │  ├─ Standard layouts sufficient? → DataViews (basic)
  │  ├─ Need custom header/layout arrangement? → DataViews (free composition)
  │  └─ Selection/picker flow? → DataViewsPicker
  │
  ├─ Edit a single record?
  │  └─ DataForm
  │
  ├─ Full CRUD interface?
  │  └─ DataViews + DataForm together
  │
  └─ Where does it run?
     ├─ WordPress plugin → import from '@wordpress/dataviews/wp'
     └─ Standalone React app → import from '@wordpress/dataviews'
```

## ⚠️ Critical: Import Path

**This is the #1 source of runtime errors.** The wrong import path causes `TypeError: Cannot read properties of undefined` and `Minified React error #130`.

```jsx
// ✅ WordPress plugin context (wp-scripts build):
import { DataViews, DataForm, filterSortAndPaginate } from '@wordpress/dataviews/wp';

// ✅ Standalone React app (Vite, CRA, Next.js):
import { DataViews, DataForm, filterSortAndPaginate } from '@wordpress/dataviews';

// ❌ NEVER in a WordPress plugin:
import { DataViews } from '@wordpress/dataviews';  // WILL BREAK
```

WordPress plugins MUST use `/wp` sub-path. It bundles dependencies to prevent conflicts with core's registered package versions. You also need `@wordpress/dependency-extraction-webpack-plugin >= 6.14.0` and `@wordpress/scripts >= 30.6.2`.

## Quick Reference

| Topic | Reference |
|---|---|
| DataViews component props | `references/dataviews-props.md` |
| Field types, edit controls, validation | `references/field-types.md` |
| View state, layouts, filter operators | `references/view-state.md` |
| Actions API (single, bulk, modals) | `references/actions-api.md` |
| DataForm component and form layouts | `references/dataform-api.md` |
| DataViewsPicker for selection flows | `references/dataviews-picker.md` |
| WordPress extensibility API | `references/extensibility-api.md` |

---

## Workflow 1: Basic DataViews with Client-Side Filtering

**Use for:** Small-to-medium datasets (< 1000 items) where all data is loaded upfront.

**Template:** `assets/templates/basic-client-side/`

```jsx
import { DataViews, filterSortAndPaginate } from '@wordpress/dataviews/wp';
import { useState, useMemo } from '@wordpress/element';

function MyDataTable({ records }) {
  const fields = [
    {
      id: 'title',
      type: 'text',
      label: 'Title',
      enableGlobalSearch: true,
      enableHiding: false,
    },
    {
      id: 'status',
      type: 'text',
      label: 'Status',
      elements: [
        { value: 'publish', label: 'Published' },
        { value: 'draft', label: 'Draft' },
      ],
      filterBy: { operators: ['isAny'], isPrimary: true },
    },
    {
      id: 'date',
      type: 'datetime',
      label: 'Date',
    },
  ];

  const [view, setView] = useState({
    type: 'table',
    search: '',
    filters: [],
    page: 1,
    perPage: 20,
    sort: { field: 'date', direction: 'desc' },
    fields: ['title', 'status', 'date'],
    titleField: 'title',
    layout: {},
  });

  const { data, paginationInfo } = useMemo(
    () => filterSortAndPaginate(records, view, fields),
    [records, view, fields]
  );

  return (
    <DataViews
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {}, grid: {} }}
    />
  );
}
```

**Key pattern:** `filterSortAndPaginate` handles all client-side logic. Always wrap in `useMemo` with `[records, view, fields]` dependencies.

---

## Workflow 2: Server-Side Data Fetching

**Use for:** Large datasets, WordPress REST API integration, real-time data.

**Template:** `assets/templates/server-side-rest/`

Translate the `view` object into REST API query parameters. DataViews handles the UI; you handle the data fetching. See `references/dataviews-props.md` for the full view-to-query translation pattern.

---

## Workflow 3: CRUD with DataViews + DataForm

**Use for:** Full create/read/update/delete interfaces.

**Template:** `assets/templates/crud-with-dataform/`

Define fields once with both display (`render`) and edit (`Edit`, `isValid`) properties. Use DataViews for browsing, DataForm for editing. See `references/dataform-api.md` for form layouts and validation.

---

## Workflow 4: Standalone (Non-WordPress) Usage

**Use for:** React apps not running inside WordPress admin.

**Template:** `assets/templates/standalone-non-wp/`

Import from `@wordpress/dataviews` (no `/wp` suffix). You must manually import styles:

```js
import '@wordpress/components/build-style/style.css';
import '@wordpress/theme/design-tokens.css';
```

---

## Workflow 5: Free Composition Mode

**Use for:** Custom layout arrangements where the default DataViews chrome doesn't fit your design.

**Template:** `assets/templates/free-composition/`

Pass `children` to DataViews to unlock ten subcomponents: `DataViews.Search`, `DataViews.Filters`, `DataViews.FiltersToggle`, `DataViews.FiltersToggled`, `DataViews.Layout`, `DataViews.Pagination`, `DataViews.LayoutSwitcher`, `DataViews.ViewConfig`, `DataViews.BulkActionToolbar`, `DataViews.Footer` (combines BulkActionToolbar + Pagination in the default footer layout).

---

## Workflow 6: Item Selection with DataViewsPicker

**Use for:** Pickers, selectors, chooser dialogs.

**Template:** `assets/templates/picker-selection/`

See `references/dataviews-picker.md` for constraints vs DataViews.

---

## Key Reminders

1. **Import path matters** — `/wp` for plugins, bare import for standalone
2. **Controlled component** — you own `view` state, update via `onChangeView`
3. **Fields are shared** — same definitions work in DataViews, DataForm, and DataViewsPicker
4. **`filterSortAndPaginate` in `useMemo`** — always memoize client-side filtering
5. **`elements` for enum filters** — use `getElements` for async/lazy loading
6. **Actions need either `callback` or `RenderModal`** — never both, never neither
7. **Bulk actions require `selection` + `onChangeSelection` props** — plus `supportsBulk: true` on the action
8. **API is still experimental** — expect breaking changes between major versions

## When Stuck

1. **What props does DataViews accept?** → `references/dataviews-props.md`
2. **What field types exist?** → `references/field-types.md`
3. **How do filters/operators work?** → `references/view-state.md`
4. **How to add actions?** → `references/actions-api.md`
5. **How to build edit forms?** → `references/dataform-api.md`
6. **How to build a picker?** → `references/dataviews-picker.md`
7. **How to extend core admin views?** → `references/extensibility-api.md`
