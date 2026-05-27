# DataViewsPicker — Item Selection Component

`DataViewsPicker` is a purpose-built variant of DataViews optimized for selection flows: media pickers, item selectors, link inserters.

## Key Differences from DataViews

| Feature | DataViews | DataViewsPicker |
|---|---|---|
| Click behavior | Navigates/opens | Selects item |
| ARIA roles | table/grid roles | `listbox`/`option` roles |
| Selection | Optional | Required |
| Selection persistence | Clears on page change | Persists across pages |
| Layouts | table, grid, list, activity | pickerGrid, pickerTable only |
| Actions | Inline + menu | Footer text buttons |
| Actions type | callback or RenderModal | callback only |

## Unsupported Props

These DataViews props are NOT available on DataViewsPicker:
`isEligible`, `isItemClickable`, `renderItemLink`, `onClickItem`, `getItemLevel`, `header`

## Additional Props

#### `itemListLabel: string`
ARIA label for the listbox element. Important for accessibility.

## Basic Usage

```jsx
import { DataViewsPicker } from '@wordpress/dataviews/wp';
import { useState, useMemo } from '@wordpress/element';

function PagePicker({ pages, onConfirm, onCancel }) {
  const [selection, setSelection] = useState([]);
  const [view, setView] = useState({
    type: 'pickerGrid',
    search: '',
    filters: [],
    page: 1,
    perPage: 12,
    sort: { field: 'title', direction: 'asc' },
    fields: ['title', 'status'],
    titleField: 'title',
    mediaField: 'featured_image',
    layout: {},
  });

  const fields = [
    { id: 'title', type: 'text', label: 'Title', enableGlobalSearch: true },
    { id: 'status', type: 'text', label: 'Status',
      elements: [
        { value: 'publish', label: 'Published' },
        { value: 'draft', label: 'Draft' },
      ],
      filterBy: { operators: ['isAny'] },
    },
    { id: 'featured_image', type: 'media', label: 'Image',
      render: ({ item }) => item.imageUrl
        ? <img src={item.imageUrl} alt="" style={{ width: '100%', height: 120, objectFit: 'cover' }} />
        : null,
    },
  ];

  const actions = [
    {
      id: 'confirm',
      label: `Select ${selection.length || ''} page(s)`,
      isPrimary: true,
      supportsBulk: true,
      disabled: selection.length === 0,
      callback: () => {
        const selectedPages = pages.filter(p => selection.includes(p.id.toString()));
        onConfirm(selectedPages);
      },
    },
    {
      id: 'cancel',
      label: 'Cancel',
      supportsBulk: true,
      callback: () => onCancel(),
    },
  ];

  const { data, paginationInfo } = useMemo(
    () => filterSortAndPaginate(pages, view, fields),
    [pages, view, fields]
  );

  return (
    <DataViewsPicker
      data={data}
      fields={fields}
      view={view}
      onChangeView={setView}
      actions={actions}
      paginationInfo={paginationInfo}
      selection={selection}
      onChangeSelection={setSelection}
      defaultLayouts={{ pickerGrid: {}, pickerTable: {} }}
      itemListLabel="Select a page"
    />
  );
}
```

## Layout Types

### pickerGrid

Card-based grid optimized for visual selection. Best for media, pages with thumbnails.

```jsx
defaultLayouts={{ pickerGrid: { badgeFields: ['status'] } }}
```

### pickerTable

Table layout optimized for selection. Best for data-heavy items without thumbnails.

```jsx
defaultLayouts={{ pickerTable: {} }}
```

## Action Constraints

DataViewsPicker actions:
- Only `callback` is supported — no `RenderModal`
- Actions render as text buttons in a footer bar, not as inline icons
- `isPrimary` actions appear prominently, others are secondary
- Use `disabled` to control when actions are available

```jsx
const actions = [
  {
    id: 'select',
    label: selection.length > 0 ? `Add ${selection.length} items` : 'Select items',
    isPrimary: true,
    supportsBulk: true,
    disabled: selection.length === 0,
    callback: () => handleSelect(selection),
  },
  {
    id: 'clear',
    label: 'Clear selection',
    supportsBulk: true,
    disabled: selection.length === 0,
    callback: () => setSelection([]),
  },
];
```

## Single vs Multi Selection

DataViewsPicker supports both. The selection model depends on your callback logic:

```jsx
// Single selection — replace on each click
onChangeSelection={(ids) => setSelection(ids.slice(-1))}

// Multi selection — default behavior
onChangeSelection={setSelection}
```

## In a Modal Dialog

Common pattern: wrap DataViewsPicker in a WordPress Modal:

```jsx
import { Modal } from '@wordpress/components';

function MediaPickerModal({ isOpen, onClose, onSelect }) {
  if (!isOpen) return null;

  return (
    <Modal title="Select Media" onRequestClose={onClose} size="large">
      <PagePicker
        pages={mediaItems}
        onConfirm={(items) => { onSelect(items); onClose(); }}
        onCancel={onClose}
      />
    </Modal>
  );
}
```
