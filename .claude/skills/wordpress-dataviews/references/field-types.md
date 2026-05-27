# Field Types, Edit Controls, and Validation

Fields are the core abstraction in DataViews. A single field definition controls display rendering, editing, filtering, sorting, and validation across DataViews, DataForm, and DataViewsPicker.

## Field Interface

```typescript
interface Field<Item> {
  // Identity
  id: string;                    // Unique identifier, supports dot notation (e.g., 'user.profile.name')
  type?: FieldType;              // One of 13 types — determines defaults for operators, rendering, edit controls
  label?: string;                // Human-readable name (default: value of id)
  header?: string | React.ReactElement;  // Custom header for table/grid layouts (defaults to label)
  description?: string | React.ReactElement;  // Description of the field
  placeholder?: string;          // Placeholder text in edit mode

  // Data access
  getValue?: ({ item }) => any;           // Extract value from item (auto-generated from id with dot notation)
  setValue?: ({ item, value }) => Partial<Item>;  // Return partial update object (auto-generated from id)

  // Display
  render?: ({ item, field, config }) => React.ReactElement;  // Custom display rendering

  // Editing
  Edit?: string | object | React.ComponentType;  // Edit control (see Edit Controls below)
  readOnly?: boolean;            // When true, uses render in edit contexts (default: false)

  // Sorting
  sort?: (a, b, direction) => number;  // Custom sort comparator
  enableSorting?: boolean;       // Whether sorting is available (default: true)

  // Visibility
  enableHiding?: boolean;        // Whether users can hide this field (default: true)
  enableGlobalSearch?: boolean;  // Include in global search (default: false)
  isVisible?: (item) => boolean; // Conditionally show/hide based on item data
  isDisabled?: boolean | ((args: { item, field }) => boolean);  // Conditionally disable in edit mode

  // Filtering
  elements?: Array<{ value: any; label: string; description?: string }>;  // Enum values for filters
  getElements?: () => Promise<Element[]>;  // Async element loading (cache results!)
  filterBy?: { operators?: Operator[]; isPrimary?: boolean } | false;     // Filter config or false to disable

  // Validation (DataForm only)
  isValid?: {
    required?: boolean;                    // Must have a value
    elements?: boolean;                    // Must be in elements list
    pattern?: string;                      // Regex pattern the value must match
    minLength?: number;                    // Minimum string length
    maxLength?: number;                    // Maximum string length
    min?: number | string;                 // Minimum value (number types) or date (date types)
    max?: number | string;                 // Maximum value (number types) or date (date types)
    custom?: (item, field) => null | string | Promise<null | string>;  // Custom validation
  };

  // Formatting
  format?: object;               // Type-specific display formatting
  getValueFormatted?: ({ item, field }) => string;  // Custom display formatting callback
}
```

## The 13 Field Types

| Type | Default Operators | Default Edit Control | Notes |
|---|---|---|---|
| `text` | `is`, `isNot`, `contains`, `startsWith` | `text` | Most common. Use for any string data |
| `integer` | `is`, `isNot`, `lessThan`, `greaterThan`, `between` | `integer` | Whole numbers only |
| `number` | `is`, `isNot`, `lessThan`, `greaterThan`, `between` | `number` | Decimal numbers |
| `datetime` | `before`, `after`, `on`, `inThePast`, `over` | `datetime` | Full date + time |
| `date` | `before`, `after`, `on`, `inThePast`, `over` | `date` | Date only, no time |
| `media` | none | none | Images, thumbnails. Typically render-only |
| `boolean` | `is`, `isNot` | `toggle` | True/false values |
| `email` | `is`, `isNot`, `contains` | `email` | Email addresses |
| `password` | none | `password` | Masked input |
| `telephone` | `is`, `isNot` | `telephone` | Phone numbers |
| `color` | `is`, `isNot`, `isAny` | `color` | Color picker |
| `url` | `is`, `isNot`, `contains` | `url` | URL strings |
| `array` | `isAny`, `isNone`, `isAll`, `isNotAll` | `array` | Multi-value fields (tags, categories) |

**When to omit `type`:** If you only need custom rendering without built-in filter/sort behavior, omit `type`. The field accepts any operator and has no default edit control.

## Dot Notation for Nested Properties

Setting `id: 'user.profile.name'` auto-generates:

```jsx
getValue: ({ item }) => item.user.profile.name
setValue: ({ value }) => ({ user: { profile: { name: value } } })
```

Override for computed or transformed values:

```jsx
{
  id: 'fullName',
  type: 'text',
  getValue: ({ item }) => `${item.firstName} ${item.lastName}`,
  setValue: ({ value }) => {
    const [first, ...rest] = value.split(' ');
    return { firstName: first, lastName: rest.join(' ') };
  },
}
```

## Format Options

**Date/datetime fields:**
```jsx
{ type: 'datetime', format: { date: 'F j, Y', weekStartsOn: 0 } }
// PHP date format string. weekStartsOn: 0=Sunday, 1=Monday, etc.
```

**Number fields:**
```jsx
{ type: 'number', format: { separatorThousand: ',', separatorDecimal: '.', decimals: 2 } }
```

**Integer fields:**
```jsx
{ type: 'integer', format: { separatorThousand: ',' } }
```

## Elements — Enum Values for Filtering

`elements` defines the set of possible values for a field. Used for filter dropdowns and validation.

```jsx
{
  id: 'status',
  type: 'text',
  elements: [
    { value: 'publish', label: 'Published' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending Review', description: 'Awaiting editor approval' },
  ],
  filterBy: { operators: ['isAny'], isPrimary: true },
}
```

**Async elements with `getElements`:** For large/dynamic element lists. Cache results — this function may be called many times.

```jsx
{
  id: 'category',
  type: 'text',
  getElements: async () => {
    const categories = await apiFetch({ path: '/wp/v2/categories?per_page=100' });
    return categories.map(cat => ({ value: cat.id.toString(), label: cat.name }));
  },
  filterBy: { operators: ['isAny', 'isNone'] },
}
```

## The 19 Bundled Edit Controls

Pass as a string to `Edit`, or as a config object for customization.

| Control | For types | Notes |
|---|---|---|
| `text` | text, email, url, telephone | Single-line input |
| `textarea` | text | Multi-line. Config: `{ control: 'textarea', rows: 5 }` |
| `integer` | integer | Number input, whole numbers |
| `number` | number | Number input, decimals |
| `email` | email | Email-specific input |
| `password` | password | Masked input |
| `telephone` | telephone | Phone input |
| `url` | url | URL input |
| `date` | date | Date picker |
| `datetime` | datetime | Date + time picker. Config: `{ control: 'datetime', compact: true }` |
| `color` | color | Color picker |
| `toggle` | boolean | On/off switch |
| `checkbox` | boolean | Checkbox |
| `select` | any with elements | Dropdown select |
| `combobox` | any with elements | Searchable typeahead select (good for large option lists) |
| `adaptiveSelect` | any with elements | Auto-selects `select` (<10 options) or `combobox` (>=10 options) |
| `radio` | any with elements | Radio button group |
| `toggleGroup` | any with elements | Segmented control |
| `array` | array | Multi-select for array fields |

**Default behavior:** When a field has `elements` and no explicit `Edit`, the `adaptiveSelect` control is used automatically.

### Edit control as string

```jsx
{ id: 'status', type: 'text', Edit: 'select', elements: [...] }
```

### Edit control as config object

```jsx
{ id: 'description', type: 'text', Edit: { control: 'textarea', rows: 8 } }
{ id: 'price', type: 'number', Edit: { control: 'number', prefix: DollarIcon } }
{ id: 'url', type: 'url', Edit: { control: 'text', suffix: CopyButton } }
```

Config options vary by control. `text` supports `prefix` and `suffix` (React components). `textarea` supports `rows`.

### Custom edit component

```jsx
{
  id: 'content',
  type: 'text',
  Edit: ({ data, field, onChange, hideLabelFromVision, validity, config }) => (
    <RichTextEditor
      value={field.getValue({ item: data })}
      onChange={(value) => onChange(field.setValue({ item: data, value }))}
      aria-invalid={validity?.content?.required?.type === 'invalid'}
    />
  ),
}
```

The `onChange` callback expects a partial update object (the return value of `setValue`).

## Custom Display Rendering

The `render` function controls how a field is displayed in DataViews layouts:

```jsx
{
  id: 'author',
  type: 'text',
  render: ({ item }) => (
    <HStack spacing={2} alignment="center">
      <img src={item.authorAvatar} alt="" width={24} height={24} />
      <span>{item.authorName}</span>
    </HStack>
  ),
}

// Media field with thumbnail:
{
  id: 'featured_image',
  type: 'media',
  render: ({ item }) => item.imageUrl ? (
    <img src={item.imageUrl} alt={item.title} style={{ width: 48, height: 48, objectFit: 'cover' }} />
  ) : null,
}
```

## Validation Rules (DataForm)

The `isValid` property defines validation rules evaluated by `useFormValidity`:

```jsx
{
  id: 'title',
  type: 'text',
  isValid: { required: true },
}

{
  id: 'category',
  type: 'text',
  elements: categoryElements,
  isValid: { elements: true },  // value must be in elements list
}

{
  id: 'isbn',
  type: 'text',
  isValid: {
    custom: (item, field) => {
      const value = field.getValue({ item });
      if (!value) return null;  // empty is OK (use required for that)
      return /^\d{13}$/.test(value) ? null : 'ISBN must be 13 digits';
    },
  },
}

// Async validation:
{
  id: 'slug',
  type: 'text',
  isValid: {
    required: true,
    custom: async (item, field) => {
      const slug = field.getValue({ item });
      const exists = await apiFetch({ path: `/wp/v2/posts?slug=${slug}` });
      return exists.length > 0 ? 'Slug already in use' : null;
    },
  },
}
```

Validation returns: `null` = valid, `string` = error message.

## Complete Field Example

```jsx
const fields = [
  {
    id: 'title',
    type: 'text',
    label: 'Title',
    enableGlobalSearch: true,
    enableHiding: false,
    isValid: { required: true },
    render: ({ item }) => <strong>{item.title}</strong>,
  },
  {
    id: 'status',
    type: 'text',
    label: 'Status',
    elements: [
      { value: 'publish', label: 'Published' },
      { value: 'draft', label: 'Draft' },
      { value: 'pending', label: 'Pending' },
    ],
    filterBy: { operators: ['isAny'], isPrimary: true },
    Edit: 'select',
    isValid: { required: true, elements: true },
  },
  {
    id: 'author.name',
    type: 'text',
    label: 'Author',
    enableSorting: true,
    render: ({ item }) => (
      <HStack>
        <Avatar src={item.author.avatar} size={20} />
        <span>{item.author.name}</span>
      </HStack>
    ),
    readOnly: true,
  },
  {
    id: 'date',
    type: 'datetime',
    label: 'Published',
    filterBy: { operators: ['after', 'before', 'inThePast'] },
  },
  {
    id: 'tags',
    type: 'array',
    label: 'Tags',
    elements: tagElements,
    filterBy: { operators: ['isAny', 'isAll'] },
    render: ({ item }) => item.tags?.map(t => <Badge key={t}>{t}</Badge>),
  },
  {
    id: 'featured_image',
    type: 'media',
    label: 'Image',
    render: ({ item }) => item.imageUrl
      ? <img src={item.imageUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }} />
      : <Placeholder />,
    enableSorting: false,
    enableHiding: true,
  },
];
```
