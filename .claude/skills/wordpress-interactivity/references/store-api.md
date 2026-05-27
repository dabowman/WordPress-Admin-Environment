# Store API Reference

Complete reference for WordPress Interactivity API store functions (6.9+).

## Core Functions

| Function | Purpose |
|----------|---------|
| `store(namespace, definition)` | Create/extend a store (multiple calls merge) |
| `getContext()` | Local context for current element |
| `getElement()` | DOM ref + attributes (`{ ref, attributes }`) |
| `getServerState()` | Read-only original server state (6.7+) |
| `getServerContext()` | Read-only original server context (6.7+) |
| `getConfig()` | Static config from `wp_interactivity_config()` |
| `withSyncEvent()` | Wrap actions needing sync event access (6.8+) |
| `withScope()` | Preserve context in external callbacks |
| `splitTask()` | Yield to main thread in sync handlers (6.8+) |

### Advanced Hooks (for use with `data-wp-run`)

| Export | Purpose |
|--------|---------|
| `useWatch` | Reactive watcher hook |
| `useInit` | Initialization hook |
| `useEffect` | Preact useEffect with scope preservation |
| `useLayoutEffect` | Preact useLayoutEffect with scope preservation |
| `useCallback` | Preact useCallback with scope preservation |
| `useMemo` | Preact useMemo with scope preservation |
| `useState` | Re-exported from preact/hooks |
| `useRef` | Re-exported from preact/hooks |

All hooks above are imported from `@wordpress/interactivity`.

### store()

Creates or extends a store. Multiple calls with same namespace **merge**.

```javascript
import { store } from '@wordpress/interactivity';

const { state, actions, callbacks } = store('vendor/block', {
  state: {
    count: 0,
    items: []
  },
  actions: {
    increment() { state.count++; }
  },
  callbacks: {
    onInit() { console.log('Ready'); }
  }
});
```

**Namespace format:** `vendor/block-name` or `vendor/feature`

### getContext()

Returns local context for current element. Works in actions, callbacks, derived state.

```javascript
import { store, getContext } from '@wordpress/interactivity';

store('ns/block', {
  actions: {
    toggle() {
      const ctx = getContext();
      ctx.isOpen = !ctx.isOpen;
    }
  },
  state: {
    // Context-aware derived state
    get isCurrentSelected() {
      const { id } = getContext();
      return state.selectedId === id;
    }
  }
});
```

**Cross-namespace:** `getContext('other/namespace')`

### getElement()

Returns DOM reference and attributes for current element.

```javascript
import { store, getElement } from '@wordpress/interactivity';

store('ns/block', {
  callbacks: {
    focusInput() {
      const { ref, attributes } = getElement();
      // ref is the actual DOM element
      ref.querySelector('input')?.focus();
      // attributes is object of data-* attributes
      console.log(attributes['data-custom']);
    }
  }
});
```

**Note:** `ref` is `null` during SSR and initial render. Use in `wp-init` or check for null.

### getServerContext() / getServerState()

Read-only access to original server-rendered values. Useful after client-side navigation.

```javascript
import { store, getContext, getServerContext, getServerState } from '@wordpress/interactivity';

store('ns/block', {
  callbacks: {
    resetToServer() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      const serverState = getServerState();
      
      // Reset to server values
      ctx.items = serverCtx.items;
      state.count = serverState.count;
    }
  }
});
```

### getConfig()

Retrieves static configuration from `wp_interactivity_config()`.

```javascript
import { store, getConfig } from '@wordpress/interactivity';

const config = getConfig('ns/block');
// { apiEndpoint: '...', maxItems: 100 }
```

## State Patterns

### Global State

Shared across all block instances.

```javascript
const { state } = store('ns/block', {
  state: {
    // Primitive
    count: 0,
    isLoading: false,
    
    // Arrays (use spread for immutable updates)
    items: [],
    
    // Objects
    settings: { theme: 'dark' }
  },
  actions: {
    addItem() {
      state.items = [...state.items, newItem]; // Immutable
    }
  }
});
```

### Context (Local State)

Scoped to element tree. Defined in HTML, mutated in JS.

```php
<!-- PHP -->
<div data-wp-context='<?php echo wp_json_encode([
  'postId' => get_the_ID(),
  'isExpanded' => false,
  'localCount' => 0
]); ?>'>
```

```javascript
actions: {
  toggle() {
    const ctx = getContext();
    ctx.isExpanded = !ctx.isExpanded;
    ctx.localCount++;
  }
}
```

### Derived State

Computed values using getters. Auto-updates when dependencies change.

```javascript
state: {
  items: [],
  filter: '',
  
  // Simple derived
  get itemCount() {
    return state.items.length;
  },
  
  // Filtered derived
  get filteredItems() {
    return state.items.filter(i => 
      i.name.includes(state.filter)
    );
  },
  
  // Context-dependent derived
  get isItemSelected() {
    const { itemId } = getContext();
    return state.selectedId === itemId;
  }
}
```

**Use in directives:** `data-wp-text="state.itemCount"`

## Async Patterns

### Generator Functions (Required for Async)

**Always use generators** for async operations to preserve scope.

```javascript
actions: {
  // ❌ WRONG - context lost after await
  async badFetch() {
    const ctx = getContext();
    await fetch('/api');
    ctx.data = data; // May be wrong context!
  },
  
  // ✅ CORRECT - generators preserve scope
  *goodFetch() {
    const ctx = getContext();
    state.loading = true;
    
    try {
      const response = yield fetch('/api');
      const data = yield response.json();
      ctx.data = data; // Correct context
    } catch (e) {
      state.error = e.message;
    } finally {
      state.loading = false;
    }
  }
}
```

### withSyncEvent()

Wrap actions that need synchronous event access.

```javascript
import { store, withSyncEvent, splitTask } from '@wordpress/interactivity';

store('ns/block', {
  actions: {
    // For preventDefault, stopPropagation, currentTarget
    handleSubmit: withSyncEvent(function*(event) {
      event.preventDefault();
      event.stopPropagation();
      
      const form = event.currentTarget;
      const formData = new FormData(form);
      
      yield splitTask(); // Yield to main thread after sync work
      
      // Continue with async work
      yield fetch('/api', { method: 'POST', body: formData });
    }),
    
    // Non-generator version for simple sync handlers
    handleClick: withSyncEvent((event) => {
      event.preventDefault();
      // Sync-only work
    })
  }
});
```

### withScope()

Preserves context in external callbacks (setTimeout, setInterval, event listeners).

```javascript
import { store, withScope, getContext } from '@wordpress/interactivity';

store('ns/block', {
  callbacks: {
    startAutoplay() {
      setInterval(
        withScope(() => {
          const ctx = getContext(); // Correct context
          ctx.slideIndex = (ctx.slideIndex + 1) % ctx.totalSlides;
        }),
        3000
      );
    },
    
    setupExternalListener() {
      window.someLibrary.on('event', withScope((data) => {
        const ctx = getContext();
        ctx.externalData = data;
      }));
    }
  }
});
```

## Private Stores

Prevent external access to internal stores.

```javascript
// Simple lock
const { state } = store(
  'ns/private',
  { state: { internal: 'value' } },
  { lock: true }
);

// Unlock with key (share between modules)
const PRIVATE_KEY = Symbol('private-key');

// Module A
store('ns/private', { state: {} }, { lock: PRIVATE_KEY });

// Module B (same key = access)
const { state } = store('ns/private', {}, { lock: PRIVATE_KEY });
```

## TypeScript Support

### Typed Context

```typescript
type MyContext = {
  isOpen: boolean;
  itemId: number;
  items: Array<{ id: number; name: string }>;
};

store('ns/block', {
  actions: {
    toggle() {
      const ctx = getContext<MyContext>();
      ctx.isOpen = !ctx.isOpen; // Typed
    }
  }
});
```

### Typed Store

```typescript
import { store } from '@wordpress/interactivity';

// Server state shape
type ServerState = {
  state: {
    items: Item[];
    nonce: string;
  };
};

// Client additions
const clientStore = {
  state: {
    isLoading: false,
    get itemCount() {
      return state.items.length;
    }
  },
  actions: {
    *fetchMore() { /* ... */ }
  }
};

type Store = ServerState & typeof clientStore;
const { state, actions } = store<Store>('ns/block', clientStore);
```

### Async Action Types (6.9+)

```typescript
import { store, type AsyncAction, type TypeYield } from '@wordpress/interactivity';

store('ns/block', {
  actions: {
    *fetchData(): AsyncAction<number> {
      const response = yield fetch('/api');
      const data = (yield response.json()) as TypeYield<typeof response.json>;
      return data.count;
    }
  }
});
```

## Server-Side PHP

### wp_interactivity_state()

Initialize global state from PHP.

```php
wp_interactivity_state('ns/block', [
  // Static values
  'items' => get_posts(['post_type' => 'product']),
  'nonce' => wp_create_nonce('my_action'),
  'ajaxUrl' => admin_url('admin-ajax.php'),
  
  // Derived state (closure)
  'isInCart' => function() {
    $context = wp_interactivity_get_context();
    $state = wp_interactivity_state();
    return in_array($context['productId'], $state['cartItems'] ?? []);
  }
]);
```

### wp_interactivity_config()

Static configuration (not reactive).

```php
wp_interactivity_config('ns/block', [
  'apiEndpoint' => rest_url('ns/v1/'),
  'maxItems' => 100,
  'features' => [
    'enableSearch' => true,
    'enableFilters' => current_user_can('edit_posts')
  ]
]);
```

### wp_interactivity_data_wp_context()

Safe JSON encoding for context attribute.

```php
<div <?php echo wp_interactivity_data_wp_context([
  'postId' => get_the_ID(),
  'title' => get_the_title(), // Auto-escaped
  'meta' => get_post_meta(get_the_ID(), 'key', true)
]); ?>>
```

### wp_interactivity_get_context()

Access context in PHP derived state closures.

```php
wp_interactivity_state('ns/block', [
  'isActive' => function() {
    $context = wp_interactivity_get_context();
    return $context['itemId'] === get_option('active_item');
  }
]);
```

### wp_interactivity_process_directives()

Process directives for non-block HTML (classic themes, shortcodes).

```php
$html = '<div data-wp-interactive="ns/block">
  <span data-wp-text="state.message"></span>
</div>';

echo wp_interactivity_process_directives($html);
```

## Cleanup Patterns

Always return cleanup functions to prevent memory leaks.

```javascript
callbacks: {
  // wp-init cleanup
  setupObserver() {
    const observer = new IntersectionObserver(/*...*/);
    observer.observe(getElement().ref);
    return () => observer.disconnect();
  },
  
  // wp-watch cleanup (runs before each re-run)
  syncToExternal() {
    const { value } = getContext();
    const subscription = externalStore.subscribe(value);
    return () => subscription.unsubscribe();
  }
}
```
