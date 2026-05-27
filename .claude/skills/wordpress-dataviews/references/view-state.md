# View State, Layouts, and Filter Operators

The `view` object is the heart of DataViews' controlled state model. Every user interaction produces a new view object through `onChangeView`.

## View Interface

```typescript
interface View {
  // Layout
  type: 'table' | 'grid' | 'list' | 'activity';
  layout?: TableLayout | GridLayout | ActivityLayout;

  // Search
  search?: string;

  // Filtering
  filters?: ViewFilter[];

  // Sorting
  sort?: { field: string; direction: 'asc' | 'desc' };

  // Pagination
  page?: number;
  perPage?: number;

  // Visible fields and their order
  fields?: string[];

  // Special field roles
  titleField?: string;          // field ID used as item title/name
  mediaField?: string;          // field ID used for thumbnail/media
  descriptionField?: string;    // field ID used for excerpt/description

  // Display toggles
  showTitle?: boolean;          // default: true
  showMedia?: boolean;          // default: true
  showDescription?: boolean;    // default: true
  showLevels?: boolean;         // default: false — requires getItemLevel prop

  // Grouping (WP 6.9+)
  groupBy?: {
    field: string;
    direction?: 'asc' | 'desc';
    showLabel?: boolean;        // default: true — show field label in group header
  };

  // Infinite scroll (WP 6.9+)
  infiniteScrollEnabled?: boolean;  // enables infinite scroll mode
  startPosition?: number;           // 1-indexed start position (used with infinite scroll)
}
```

## Default View Template

Always initialize view state with all required properties:

```jsx
const defaultView = {
  type: 'table',
  search: '',
  filters: [],
  page: 1,
  perPage: 20,
  sort: { field: 'date', direction: 'desc' },
  fields: ['title', 'author', 'status', 'date'],  // visible fields in order
  titleField: 'title',
  layout: {},
};

const [view, setView] = useState(defaultView);
```

## Layout Type Configurations

### Table Layout

```typescript
interface TableLayout {
  density?: 'comfortable' | 'balanced' | 'compact';
  enableMoving?: boolean;  // column reordering via drag
  styles?: Record<string, {
    width?: string;
    maxWidth?: string;
    minWidth?: string;
    align?: 'left' | 'center' | 'right';
  }>;
}
```

```jsx
const view = {
  type: 'table',
  layout: {
    density: 'balanced',
    enableMoving: true,
    styles: {
      title: { width: '40%', minWidth: '200px' },
      date: { width: '150px', align: 'right' },
      status: { width: '120px', align: 'center' },
    },
  },
};
```

**Style guidance:** Right-align quantitative values (dates, numbers, sizes). Left-align text. Center status badges.

### Grid Layout

```typescript
interface GridLayout {
  badgeFields?: string[];   // field IDs rendered as badges on cards
  previewSize?: number;     // thumbnail size
}
```

```jsx
const view = {
  type: 'grid',
  mediaField: 'featured_image',
  layout: {
    badgeFields: ['status', 'category'],
    previewSize: 200,
  },
};
```

### List Layout

No layout-specific options. Compact display with title, description, and action buttons.

### Activity Layout

```typescript
interface ActivityLayout {
  density?: 'comfortable' | 'balanced' | 'compact';
}
```

Feed-style layout optimized for chronological content.

## Filters

### Filter Object Structure

```typescript
interface ViewFilter {
  field: string;        // field ID
  operator: Operator;   // one of 22 operators
  value: any;           // single value or array depending on operator
  isLocked?: boolean;   // prevents user from removing this filter
}
```

```jsx
const view = {
  filters: [
    { field: 'status', operator: 'isAny', value: ['publish', 'draft'] },
    { field: 'author', operator: 'is', value: 'admin' },
    { field: 'date', operator: 'after', value: '2024-01-01T00:00:00Z' },
    { field: 'category', operator: 'isAll', value: ['news', 'featured'] },
    // Locked filter — user cannot remove:
    { field: 'type', operator: 'is', value: 'post', isLocked: true },
  ],
};
```

### Primary Filters

Fields with `filterBy.isPrimary: true` appear permanently in the filter bar. Others are accessible via an "Add filter" button.

```jsx
{
  id: 'status',
  filterBy: { operators: ['isAny'], isPrimary: true },  // always visible
}
{
  id: 'author',
  filterBy: { operators: ['is', 'isNot'] },  // hidden behind "Add filter"
}
```

## All 22 Filter Operators

**Important:** Single-selection and multi-selection operators cannot be mixed within a single field's `filterBy.operators` array.

### Single-Selection Operators (value is a single item)

| Operator | Constant | Description | Compatible Types |
|---|---|---|---|
| `is` | `OPERATOR_IS` | Equal to | text, integer, number, boolean, color, email, url |
| `isNot` | `OPERATOR_IS_NOT` | Not equal to | text, integer, number, boolean, color, email, url |
| `contains` | `OPERATOR_CONTAINS` | Contains substring | text, email, url |
| `notContains` | `OPERATOR_NOT_CONTAINS` | Does not contain | text, email, url |
| `startsWith` | `OPERATOR_STARTS_WITH` | Starts with | text, email, url |

### Multi-Selection Operators (value is an array)

| Operator | Constant | Description | Compatible Types |
|---|---|---|---|
| `isAny` | `OPERATOR_IS_ANY` | Match any (OR) | text, integer, number, color, email, url, array |
| `isNone` | `OPERATOR_IS_NONE` | Match none | text, integer, number, color, email, url, array |
| `isAll` | `OPERATOR_IS_ALL` | Has all (AND) | text, integer, number, email, url, array |
| `isNotAll` | `OPERATOR_IS_NOT_ALL` | Missing at least one | text, integer, number, email, url, array |

### Date/Datetime Operators

| Operator | Constant | Description | Value Type |
|---|---|---|---|
| `before` | `OPERATOR_BEFORE` | Before date (exclusive) | ISO date string |
| `beforeInc` | `OPERATOR_BEFORE_INC` | Before or on date | ISO date string |
| `after` | `OPERATOR_AFTER` | After date (exclusive) | ISO date string |
| `afterInc` | `OPERATOR_AFTER_INC` | After or on date | ISO date string |
| `on` | `OPERATOR_ON` | On specific date | ISO date string |
| `notOn` | `OPERATOR_NOT_ON` | Not on date | ISO date string |
| `inThePast` | `OPERATOR_IN_THE_PAST` | Within last N units | `{ value: number, unit: string }` |
| `over` | `OPERATOR_OVER` | Older than N units | `{ value: number, unit: string }` |

### Numeric Operators

| Operator | Constant | Description | Value Type |
|---|---|---|---|
| `between` | `OPERATOR_BETWEEN` | Between two values | `[min, max]` |
| `lessThan` | `OPERATOR_LESS_THAN` | Less than | number |
| `lessThanOrEqual` | `OPERATOR_LESS_THAN_OR_EQUAL` | Less than or equal | number |
| `greaterThan` | `OPERATOR_GREATER_THAN` | Greater than | number |
| `greaterThanOrEqual` | `OPERATOR_GREATER_THAN_OR_EQUAL` | Greater than or equal | number |

### Deprecated Operators

`isNotAll` — deprecated, avoid using in new code.

## Practical Filter Configuration Patterns

### Status filter with enum values

```jsx
{
  id: 'status',
  type: 'text',
  elements: [
    { value: 'publish', label: 'Published' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'trash', label: 'Trashed' },
  ],
  filterBy: { operators: ['isAny', 'isNone'], isPrimary: true },
}
```

### Date range filter

```jsx
{
  id: 'created',
  type: 'datetime',
  filterBy: { operators: ['after', 'before', 'inThePast', 'on'] },
}
```

### Numeric range filter

```jsx
{
  id: 'price',
  type: 'number',
  filterBy: { operators: ['between', 'greaterThan', 'lessThan'] },
}
```

### Tag/category multi-select

```jsx
{
  id: 'tags',
  type: 'array',
  elements: tagElements,
  filterBy: { operators: ['isAny', 'isAll', 'isNone'] },
}
```

### Disable filtering entirely

```jsx
{
  id: 'description',
  type: 'text',
  filterBy: false,
}
```

## Sorting

Default sort uses the field's `type` for comparison. Override with a custom `sort` function:

```jsx
{
  id: 'title',
  type: 'text',
  sort: (a, b, direction) => {
    const result = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    return direction === 'asc' ? result : -result;
  },
}
```

Disable sorting on a field:

```jsx
{ id: 'actions_column', enableSorting: false }
```

## Pagination

For client-side pagination, `filterSortAndPaginate` handles everything:

```jsx
const { data, paginationInfo } = filterSortAndPaginate(records, view, fields);
// paginationInfo = { totalItems: 150, totalPages: 8 }
```

For server-side, compute from API response:

```jsx
const paginationInfo = {
  totalItems: parseInt(response.headers.get('X-WP-Total')),
  totalPages: parseInt(response.headers.get('X-WP-TotalPages')),
};
```

### Infinite Scroll (WP 6.9+)

Infinite scroll is controlled via View properties, not via `paginationInfo`:

```jsx
const [view, setView] = useState({
  type: 'table',
  // ... other view properties
  infiniteScrollEnabled: true,  // enables infinite scroll
  startPosition: 1,             // 1-indexed start position
  perPage: 20,                  // used as batch size when infinite scroll is enabled
});
```
