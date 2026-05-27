# Actions API

Actions define operations users can perform on items in DataViews. They appear as inline buttons (primary) or in a "More actions" kebab menu.

## Action Interface

```typescript
interface Action<Item> {
  // Required
  id: string;
  label: string | ((items: Item[]) => string);

  // Display
  isPrimary?: boolean;             // Inline button vs menu item. Requires `icon` when true
  icon?: React.ReactElement;       // Icon for primary actions
  disabled?: boolean;              // Greyed out (default: false)
  context?: 'list' | 'single';    // Where action appears

  // Eligibility
  isEligible?: (item: Item) => boolean;   // Per-item availability check
  supportsBulk?: boolean;                  // Multi-item support (default: false)

  // Execution — provide ONE of these, never both
  callback?: (items: Item[], context: { registry: any; onActionPerformed?: (items: Item[]) => void }) => void;
  RenderModal?: React.ComponentType<{
    items: Item[];
    closeModal: () => void;
    onActionPerformed?: (items: Item[]) => void;
  }>;

  // Modal configuration (only with RenderModal)
  hideModalHeader?: boolean;
  modalHeader?: string | ((items: Item[]) => string);
  modalSize?: 'small' | 'medium' | 'large' | 'fill';     // default: 'medium'
  modalFocusOnMount?: boolean | 'firstElement' | 'firstContentElement';
}
```

**Note:** `isDestructive` was removed from the Action API. Destructive intent should be communicated through flow (e.g., a confirmation modal) and color within that modal, not via a property on the action itself.

## Rules

1. Every action must have either `callback` OR `RenderModal` — never both, never neither.
2. Primary actions (`isPrimary: true`) must have an `icon`.
3. Bulk actions require `supportsBulk: true` AND the DataViews component must have `selection` + `onChangeSelection` props.
4. `isEligible` runs per-item — if it returns false, the action won't appear for that item.
5. `context: 'single'` means the action only appears when viewing a single item detail. `context: 'list'` (default) means it appears in the list/table view.

## Pattern: Immediate Callback Action

For actions that execute immediately without confirmation:

```jsx
{
  id: 'view',
  label: 'View',
  isPrimary: true,
  icon: <Icon icon={external} />,
  isEligible: (item) => item.status === 'publish',
  callback: (items) => {
    window.open(items[0].url, '_blank');
  },
}
```

## Pattern: Modal Confirmation Action

For actions that need user confirmation or additional input:

```jsx
{
  id: 'delete',
  label: (items) => `Delete ${items.length} item(s)`,
  supportsBulk: true,
  RenderModal: ({ items, closeModal, onActionPerformed }) => {
    const [isDeleting, setIsDeleting] = useState(false);

    return (
      <VStack spacing={4}>
        <Text>
          Are you sure you want to delete {items.length} item(s)?
          This action cannot be undone.
        </Text>
        <HStack justify="right">
          <Button variant="tertiary" onClick={closeModal}>
            Cancel
          </Button>
          <Button
            variant="primary"
            isDestructive
            isBusy={isDeleting}
            onClick={async () => {
              setIsDeleting(true);
              await Promise.all(items.map(item => deleteItem(item.id)));
              onActionPerformed?.(items);
              closeModal();
            }}
          >
            Delete
          </Button>
        </HStack>
      </VStack>
    );
  },
}
```

## Pattern: Edit Modal with DataForm

Combine actions with DataForm for inline editing modals:

```jsx
{
  id: 'edit',
  label: 'Quick Edit',
  icon: <Icon icon={pencil} />,
  isPrimary: true,
  modalSize: 'medium',
  RenderModal: ({ items, closeModal, onActionPerformed }) => {
    const [editedItem, setEditedItem] = useState(items[0]);

    const editFields = fields.filter(f => ['title', 'status', 'date'].includes(f.id));
    const form = { layout: { type: 'regular' }, fields: ['title', 'status', 'date'] };
    const { isValid, validity } = useFormValidity(editedItem, editFields, form);

    return (
      <VStack spacing={4}>
        <DataForm
          data={editedItem}
          fields={editFields}
          form={form}
          validity={validity}
          onChange={(edits) => setEditedItem(prev => ({ ...prev, ...edits }))}
        />
        <HStack justify="right">
          <Button variant="tertiary" onClick={closeModal}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!isValid}
            onClick={async () => {
              await saveItem(editedItem);
              onActionPerformed?.([editedItem]);
              closeModal();
            }}
          >
            Save
          </Button>
        </HStack>
      </VStack>
    );
  },
}
```

## Pattern: Bulk Action

```jsx
{
  id: 'export',
  label: (items) => `Export ${items.length} selected`,
  supportsBulk: true,
  icon: <Icon icon={download} />,
  callback: (items, { onActionPerformed }) => {
    const csv = generateCSV(items);
    downloadFile(csv, 'export.csv');
    onActionPerformed?.(items);
  },
}
```

For bulk actions to work, DataViews needs selection state:

```jsx
const [selection, setSelection] = useState([]);

<DataViews
  selection={selection}
  onChangeSelection={setSelection}
  actions={actionsWithBulkSupport}
  /* ... */
/>
```

## Pattern: Dynamic Label

```jsx
{
  id: 'toggle-status',
  label: (items) => {
    if (items.length > 1) return `Update ${items.length} items`;
    return items[0].status === 'publish' ? 'Unpublish' : 'Publish';
  },
  supportsBulk: true,
  callback: async (items, { onActionPerformed }) => {
    const newStatus = items[0].status === 'publish' ? 'draft' : 'publish';
    await Promise.all(items.map(item =>
      updateItem(item.id, { status: newStatus })
    ));
    onActionPerformed?.(items);
  },
}
```

## Pattern: Conditional Eligibility

```jsx
{
  id: 'restore',
  label: 'Restore',
  // Only show for trashed items:
  isEligible: (item) => item.status === 'trash',
  callback: async (items, { onActionPerformed }) => {
    await restoreItems(items.map(i => i.id));
    onActionPerformed?.(items);
  },
}
```

## Complete Actions Array Example

```jsx
const actions = [
  // Primary actions (inline buttons with icons)
  {
    id: 'view',
    label: 'View',
    isPrimary: true,
    icon: <Icon icon={external} />,
    isEligible: (item) => item.status === 'publish',
    callback: (items) => window.open(items[0].url, '_blank'),
  },
  {
    id: 'edit',
    label: 'Edit',
    isPrimary: true,
    icon: <Icon icon={pencil} />,
    callback: (items) => navigate(`/edit/${items[0].id}`),
  },

  // Menu actions (in kebab dropdown)
  {
    id: 'duplicate',
    label: 'Duplicate',
    supportsBulk: true,
    callback: async (items, { onActionPerformed }) => {
      const newItems = await duplicateItems(items);
      onActionPerformed?.(newItems);
    },
  },
  {
    id: 'export',
    label: (items) => `Export ${items.length > 1 ? items.length + ' items' : 'item'}`,
    supportsBulk: true,
    callback: (items) => downloadCSV(items),
  },

  // Destructive action with modal confirmation
  {
    id: 'delete',
    label: 'Move to Trash',
    supportsBulk: true,
    RenderModal: ({ items, closeModal, onActionPerformed }) => (
      <VStack spacing={4}>
        <Text>Move {items.length} item(s) to trash?</Text>
        <HStack justify="right">
          <Button variant="tertiary" onClick={closeModal}>Cancel</Button>
          <Button variant="primary" isDestructive onClick={async () => {
            await trashItems(items.map(i => i.id));
            onActionPerformed?.(items);
            closeModal();
          }}>Move to Trash</Button>
        </HStack>
      </VStack>
    ),
  },
];
```

## The onActionPerformed Callback

Always call `onActionPerformed` after successful action execution. DataViews uses this to:

1. Clear selection after bulk actions
2. Refresh the view if needed
3. Trigger any parent-level side effects

```jsx
callback: async (items, { onActionPerformed }) => {
  await doSomething(items);
  onActionPerformed?.(items);  // always call this on success
},
```
