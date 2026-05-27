# DataViews Component Props Reference

Complete API reference for the `<DataViews>` component.

## All Props

### Required Props

#### `data: Object[]`
Array of objects representing your dataset. Each item should have an `id` property or use `getItemId`.

```jsx
const data = [
  { id: 1, title: 'Hello World', author: 'Admin', date: '2024-01-15T10:30:00Z' },
  { id: 2, title: 'Second Post', author: 'Editor', date: '2024-02-20T14:00:00Z' },
];
```

#### `fields: Field[]`
Defines how each data property is displayed, filtered, sorted, and edited. See `field-types.md` for the complete Field type reference.

#### `view: View`
Current UI state — layout type, filters, sort, pagination, visible fields. This is a controlled prop. See `view-state.md` for the complete View type reference.

#### `onChangeView: (view: View) => void`
Callback fired when the user changes any view aspect. Update your state with the new view object.

```jsx
const [view, setView] = useState(defaultView);
<DataViews view={view} onChangeView={setView} /* ... */ />
```

### Optional Props

#### `actions: Action[]`
Operations users can perform on items. See `actions-api.md`.

#### `paginationInfo: { totalItems: number; totalPages: number }`
Pagination metadata. Required for server-side pagination.

```jsx
// Client-side: filterSortAndPaginate returns this
const { data, paginationInfo } = filterSortAndPaginate(records, view, fields);

// Server-side: compute from API response headers
const paginationInfo = {
  totalItems: parseInt(response.headers['X-WP-Total']),
  totalPages: parseInt(response.headers['X-WP-TotalPages']),
};
```

#### `getItemId: (item) => string`
Default: `item => item.id`. Custom unique identifier extraction.

```jsx
// If your items use a different key:
getItemId={(item) => item.uuid}
```

#### `getItemLevel: (item) => number`
Returns hierarchical level. Required when `view.showLevels` is `true`. Used for indentation in list/table layouts (e.g., nested pages).

```jsx
getItemLevel={(item) => item.parent === 0 ? 0 : 1}
```

#### `search: boolean`
Default: `true`. Show/hide the search input.

#### `searchLabel: string`
Default: `"Search"`. Custom label for the search input.

#### `isLoading: boolean`
Default: `false`. Shows a loading skeleton when `true`.

#### `defaultLayouts: Record<string, Partial<View>>`
Restricts which layout types are available and provides default config for each. **Only layouts listed here will be offered to the user.** Keys are layout type strings.

```jsx
// Only table and grid:
defaultLayouts={{ table: {}, grid: {} }}

// Table only, with custom density:
defaultLayouts={{ table: { layout: { density: 'compact' } } }}

// All four layout types:
defaultLayouts={{ table: {}, grid: {}, list: {}, activity: {} }}
```

#### `selection: string[]`
Array of selected item IDs. Makes DataViews a controlled selection component. Requires `onChangeSelection` and at least one action with `supportsBulk: true`.

#### `onChangeSelection: (ids: string[]) => void`
Callback with updated selection array.

#### `isItemClickable: (item) => boolean`
Determines whether the media/primary field of an item is clickable. Works with `onClickItem`.

#### `onClickItem: (item) => void`
Callback when a clickable item is clicked. Common pattern for navigation to detail views.

```jsx
<DataViews
  isItemClickable={() => true}
  onClickItem={(item) => navigate(`/edit/${item.id}`)}
  /* ... */
/>
```

#### `renderItemLink: React.ComponentType<{ item, ...props }>`
(WP 6.9+) Custom component for clickable items. Enables integration with routing libraries.

```jsx
// React Router integration:
<DataViews
  renderItemLink={({ item, ...props }) => (
    <Link to={`/posts/${item.id}`} preload="intent" {...props} />
  )}
/>
```

#### `header: React.ReactNode`
Custom content rendered next to the view configuration button. Use for extra toolbar actions.

```jsx
<DataViews
  header={<Button onClick={handleExport}>Export CSV</Button>}
  /* ... */
/>
```

#### `config: { perPageSizes: number[] }`
(WP 6.9+) Available items-per-page options. Default: `[10, 20, 50, 100]`. Must contain 2–6 items.

#### `empty: React.ReactNode`
(WP 6.9+) Custom empty state element. Default: `<p>No results</p>`.

```jsx
<DataViews
  empty={
    <div className="my-empty-state">
      <Heading>No posts found</Heading>
      <Button onClick={handleCreate}>Create your first post</Button>
    </div>
  }
/>
```

#### `children: React.ReactNode`
(WP 6.9+) Enables **free composition mode**. When provided, DataViews renders children instead of the default layout, exposing subcomponents. See the free composition template.

#### `onReset: (() => void) | false`
(WP 6.9+) Callback to reset the view to its default state. Pass `false` to hide the reset button entirely.

---

## Server-Side: View-to-Query Translation

For server-side data fetching, translate the `view` object into API query parameters:

```jsx
const queryArgs = useMemo(() => {
  const args = {
    per_page: view.perPage,
    page: view.page,
    order: view.sort?.direction || 'desc',
    orderby: view.sort?.field || 'date',
    search: view.search || undefined,
    _embed: 'author',
  };

  // Translate filters to REST API params
  for (const filter of view.filters || []) {
    switch (filter.field) {
      case 'status':
        if (filter.operator === 'isAny') args.status = filter.value;
        if (filter.operator === 'is') args.status = [filter.value];
        break;
      case 'author':
        if (filter.operator === 'is') args.author = filter.value;
        break;
      case 'date':
        if (filter.operator === 'after') args.after = filter.value;
        if (filter.operator === 'before') args.before = filter.value;
        break;
    }
  }

  return args;
}, [view]);
```

---

## Exported Constants

Layout type constants:
- `LAYOUT_TABLE`, `LAYOUT_GRID`, `LAYOUT_LIST`
- `LAYOUT_PICKER_GRID`, `LAYOUT_PICKER_TABLE`

All operator constants: `OPERATOR_IS`, `OPERATOR_IS_NOT`, `OPERATOR_IS_ANY`, `OPERATOR_IS_NONE`, `OPERATOR_IS_ALL`, `OPERATOR_IS_NOT_ALL`, plus 16 more for date/number operators. See `view-state.md` for the full list.

## Exported Utilities

#### `filterSortAndPaginate(data, view, fields)`
Client-side filtering, sorting, and pagination. Returns `{ data: Item[], paginationInfo: { totalItems, totalPages } }`. **Always wrap in `useMemo`.**

```jsx
const { data: visibleData, paginationInfo } = useMemo(
  () => filterSortAndPaginate(allRecords, view, fields),
  [allRecords, view, fields]
);
```

#### `useFormValidity(data, fields, form)`
Computes validation state for DataForm. Returns `{ isValid: boolean, validity: object }`. See `dataform-api.md`.
