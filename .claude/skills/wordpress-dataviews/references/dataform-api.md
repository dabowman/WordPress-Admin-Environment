# DataForm Component and Form Layouts

DataForm renders an editing interface for a single item, sharing the same `fields` API as DataViews. Define fields once, use them for both display and editing.

## DataForm Props

```typescript
interface DataFormProps<Item> {
  data: Item;                    // Single object to edit
  fields: Field[];               // Same field definitions as DataViews
  form: FormConfig;              // Layout and field arrangement
  onChange: (edits: Partial<Item>) => void;  // Receives partial updates
  validity?: ValidityState;      // From useFormValidity (optional)
}
```

## Basic Usage

```jsx
import { DataForm } from '@wordpress/dataviews/wp';
import { useState } from '@wordpress/element';

function EditPost({ post, onSave }) {
  const [data, setData] = useState(post);

  const fields = [
    { id: 'title', type: 'text', label: 'Title', isValid: { required: true } },
    { id: 'status', type: 'text', label: 'Status', Edit: 'select',
      elements: [
        { value: 'draft', label: 'Draft' },
        { value: 'publish', label: 'Published' },
      ],
    },
    { id: 'excerpt', type: 'text', label: 'Excerpt', Edit: { control: 'textarea', rows: 4 } },
    { id: 'date', type: 'datetime', label: 'Publish Date' },
  ];

  const form = {
    fields: ['title', 'status', 'excerpt', 'date'],
  };

  return (
    <DataForm
      data={data}
      fields={fields}
      form={form}
      onChange={(edits) => setData(prev => ({ ...prev, ...edits }))}
    />
  );
}
```

## The onChange Callback

`onChange` receives a **partial update object**, not the full item. This is the return value of the field's `setValue` function.

```jsx
// When user changes title to "New Title":
onChange({ title: 'New Title' })

// For nested fields (id: 'user.profile.name'):
onChange({ user: { profile: { name: 'New Name' } } })

// Your handler merges updates into state:
onChange={(edits) => setData(prev => ({ ...prev, ...edits }))}
```

## Form Configuration

The `form` prop controls layout, field ordering, and grouping.

### Simple flat form

```jsx
const form = {
  fields: ['title', 'status', 'excerpt', 'date'],
};
```

### Form with layout type

```jsx
const form = {
  layout: { type: 'regular', labelPosition: 'side' },
  fields: ['title', 'status', 'excerpt', 'date'],
};
```

### Form with grouped fields

```jsx
const form = {
  fields: [
    'title',
    'excerpt',
    {
      id: 'publishing',
      label: 'Publishing',
      children: ['status', 'date', 'visibility'],
      layout: { type: 'panel' },
    },
    {
      id: 'metadata',
      label: 'Metadata',
      children: ['slug', 'category', 'tags'],
      layout: { type: 'panel' },
    },
  ],
};
```

### Per-field layout overrides

```jsx
const form = {
  layout: { type: 'regular' },
  fields: [
    'title',
    { id: 'featured_image', layout: { type: 'regular' } },
    {
      id: 'settings',
      label: 'Settings',
      children: ['status', 'date'],
      layout: { type: 'card', isOpened: true },
    },
  ],
};
```

## Four Form Layout Types

### Regular

Default vertical layout. Best for simple forms.

```jsx
{ type: 'regular', labelPosition: 'side' | 'top' | 'none' }
```

- `side` — label left, input right (default)
- `top` — label above input
- `none` — no visible label (uses aria-label)

### Panel

Collapsible panel with optional summary. Best for grouped settings.

```jsx
{
  id: 'publishing',
  label: 'Publishing',
  children: ['status', 'date'],
  layout: {
    type: 'panel',
    summary: ({ data }) => `${data.status} — ${formatDate(data.date)}`,
  },
}
```

### Card (WP 6.9+)

Collapsible card sections. Best for complex forms with distinct sections.

```jsx
{
  id: 'media',
  label: 'Featured Media',
  children: ['featured_image', 'image_alt'],
  layout: {
    type: 'card',
    isOpened: true,
    withHeader: true,
    isCollapsible: true,
    summary: ({ data }) => data.featured_image ? 'Image set' : 'No image',
  },
}
```

### Row (WP 6.9+)

Horizontal field layout. Best for related fields that belong on the same line.

```jsx
{
  id: 'dimensions',
  label: 'Dimensions',
  children: ['width', 'height'],
  layout: {
    type: 'row',
    alignment: 'start' | 'center' | 'end',
  },
}
```

## Conditional Fields with isVisible

Show or hide fields based on item data:

```jsx
{
  id: 'password',
  type: 'password',
  label: 'Page Password',
  isVisible: (item) => item.visibility === 'password-protected',
}
```

## Validation with useFormValidity

The `useFormValidity` hook computes validation state from field `isValid` rules.

```jsx
import { DataForm, useFormValidity } from '@wordpress/dataviews/wp';

function EditForm({ item, fields, onSave }) {
  const [data, setData] = useState(item);

  const form = {
    fields: ['title', 'slug', 'status', 'category'],
  };

  const { isValid, validity } = useFormValidity(data, fields, form);

  return (
    <>
      <DataForm
        data={data}
        fields={fields}
        form={form}
        validity={validity}
        onChange={(edits) => setData(prev => ({ ...prev, ...edits }))}
      />
      <Button
        variant="primary"
        disabled={!isValid}
        onClick={() => onSave(data)}
      >
        Save
      </Button>
    </>
  );
}
```

### Validity State Structure

```jsx
// Example validity object:
{
  title: {
    required: { type: 'invalid' }
  },
  slug: {
    custom: { type: 'valid', message: 'Slug is available.' }
  },
  category: {
    elements: { type: 'invalid', message: 'Value must be one of the elements.' }
  }
}

// Check specific field validity:
const isTitleValid = validity?.title?.required?.type !== 'invalid';
```

### Validation Rule Types

```jsx
// Required — field must have a non-empty value
{ isValid: { required: true } }

// Elements — value must exist in the elements array
{ isValid: { elements: true }, elements: [...] }

// Pattern — value must match a regex
{ isValid: { pattern: '^[A-Z]{2}\\d{4}$' } }

// Length constraints
{ isValid: { minLength: 3, maxLength: 100 } }

// Range constraints (number/integer fields use numbers, date fields use strings)
{ isValid: { min: 1, max: 10 } }           // for integer/number
{ isValid: { min: '2024-01-01' } }          // for date/datetime

// Custom — sync or async function returning null (valid) or error string
{ isValid: {
  custom: (item, field) => {
    const val = field.getValue({ item });
    if (val.length < 3) return 'Must be at least 3 characters';
    return null;
  }
}}

// Async custom
{ isValid: {
  custom: async (item, field) => {
    const slug = field.getValue({ item });
    const exists = await checkSlugExists(slug);
    return exists ? 'Slug already taken' : null;
  }
}}

// Combined rules
{ isValid: { required: true, elements: true, minLength: 3, custom: myValidator } }
```

## Complete CRUD Example

```jsx
function PostManager() {
  const [records, setRecords] = useState(initialData);
  const [editingItem, setEditingItem] = useState(null);
  const [view, setView] = useState(defaultView);

  const fields = [
    { id: 'title', type: 'text', label: 'Title',
      enableGlobalSearch: true, enableHiding: false,
      isValid: { required: true } },
    { id: 'status', type: 'text', label: 'Status',
      Edit: 'select',
      elements: [
        { value: 'draft', label: 'Draft' },
        { value: 'publish', label: 'Published' },
      ],
      filterBy: { operators: ['isAny'], isPrimary: true },
      isValid: { required: true, elements: true } },
    { id: 'priority', type: 'integer', label: 'Priority',
      isValid: {
        custom: (item, field) => {
          const val = field.getValue({ item });
          return val > 0 && val <= 10 ? null : 'Priority must be 1-10';
        },
      } },
    { id: 'date', type: 'datetime', label: 'Date' },
  ];

  const form = {
    layout: { type: 'regular', labelPosition: 'top' },
    fields: [
      'title',
      {
        id: 'publishing',
        label: 'Publishing',
        children: ['status', 'date'],
        layout: { type: 'panel' },
      },
      'priority',
    ],
  };

  const actions = [
    {
      id: 'edit',
      label: 'Edit',
      isPrimary: true,
      icon: <Icon icon={pencil} />,
      callback: (items) => setEditingItem({ ...items[0] }),
    },
    {
      id: 'delete',
      label: 'Delete',
      supportsBulk: true,
      RenderModal: ({ items, closeModal, onActionPerformed }) => (
        <VStack spacing={4}>
          <Text>Delete {items.length} item(s)?</Text>
          <HStack justify="right">
            <Button variant="tertiary" onClick={closeModal}>Cancel</Button>
            <Button variant="primary" isDestructive onClick={() => {
              setRecords(prev => prev.filter(r => !items.some(i => i.id === r.id)));
              onActionPerformed?.(items);
              closeModal();
            }}>Delete</Button>
          </HStack>
        </VStack>
      ),
    },
  ];

  // Edit mode
  if (editingItem) {
    const { isValid, validity } = useFormValidity(editingItem, fields, form);
    return (
      <>
        <Button variant="tertiary" onClick={() => setEditingItem(null)}>← Back</Button>
        <DataForm
          data={editingItem}
          fields={fields}
          form={form}
          validity={validity}
          onChange={(edits) => setEditingItem(prev => ({ ...prev, ...edits }))}
        />
        <HStack>
          <Button variant="tertiary" onClick={() => setEditingItem(null)}>Cancel</Button>
          <Button variant="primary" disabled={!isValid} onClick={() => {
            setRecords(prev => prev.map(r => r.id === editingItem.id ? editingItem : r));
            setEditingItem(null);
          }}>Save</Button>
        </HStack>
      </>
    );
  }

  // List mode
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
      actions={actions}
      paginationInfo={paginationInfo}
      defaultLayouts={{ table: {}, grid: {} }}
    />
  );
}
```
