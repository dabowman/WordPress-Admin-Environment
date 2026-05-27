# State Management During Navigation

How state and context behave during client-side navigation.

## State Types Recap

| Type | Scope | Persistence | Access |
|------|-------|-------------|--------|
| Global State | All instances | Survives navigation | `state.prop` |
| Context | Element tree | Reset on navigation | `getContext()` |
| Server State | Read-only reference | Updated on navigation | `getServerState()` |
| Server Context | Read-only reference | Updated on navigation | `getServerContext()` |

## Global State Persistence

Global state defined in stores **persists** across navigation:

```javascript
store('shop/cart', {
  state: {
    items: [],           // Survives navigation
    isOpen: false,       // Survives navigation
    get count() {        // Survives navigation
      return state.items.length;
    }
  }
});
```

### Use Cases

- Shopping cart contents
- User preferences
- Authentication state
- UI state (sidebar open, theme selection)
- Cached data

### Example: Persistent Cart

```javascript
store('shop/cart', {
  state: {
    items: [],
    get total() {
      return state.items.reduce((sum, item) => sum + item.price, 0);
    }
  },
  actions: {
    addItem(item) {
      state.items.push(item);
    },
    removeItem(id) {
      state.items = state.items.filter(item => item.id !== id);
    }
  }
});
```

User navigates between pages—cart contents remain intact.

## Context Behavior During Navigation

### Pre-6.7 Behavior (Deprecated)

Before WordPress 6.7, `navigate()` **overwrote** all context properties with server values. This caused issues for blocks outside router regions.

### Current Behavior (6.7+)

`navigate()` only **adds new properties**—it never overwrites existing ones.

```javascript
// Before navigation
context = { page: 1, userModified: true }

// Server provides for new page
serverContext = { page: 2, totalPages: 10 }

// After navigation (6.7+)
context = { 
  page: 1,           // NOT overwritten (existed)
  userModified: true, // Preserved
  totalPages: 10     // Added (new property)
}
```

### Accessing Fresh Server Values

Use `getServerState()` and `getServerContext()`:

```javascript
import { store, getContext, getServerContext, getServerState } from '@wordpress/interactivity';

store('myblock', {
  callbacks: {
    syncAfterNavigation() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Explicitly update with server values
      ctx.page = serverCtx.page;
      ctx.items = serverCtx.items;
    }
  }
});
```

### How state and context sync on navigation

Two different behaviors — don't conflate them:

**Global state merges.** The router calls `deepMerge(clientState, serverState, false)` in `packages/interactivity/src/store.ts` — new keys are added from the server, but client-set keys win on conflict. Nothing is removed.

```javascript
// Before navigation
state = { cartCount: 3, filters: { tag: 'sale' } }

// Server provides for new page
serverState = { cartCount: 0, theme: 'dark' }

// After navigation (merged)
state = { cartCount: 3, filters: { tag: 'sale' }, theme: 'dark' }
// cartCount kept from client; theme added from server.
```

**Router-region context resets.** Each `data-wp-router-region` is diffed and re-rendered, so `data-wp-context` reflects the new page's server markup. Properties only on the old page disappear.

```javascript
// Before navigation
context = { page: 1, tempData: 'xyz' }

// Server markup for new page declares
context = { page: 2 }

// After navigation
context = { page: 2 }  // tempData gone — region re-rendered
```

If you need to carry client-side context across navigation, promote it to global state, or copy from `getServerContext()` into your own store in a callback.

## getServerState() API

Returns read-only reference to server-provided global state.

```javascript
import { getServerState } from '@wordpress/interactivity';

store('myblock', {
  callbacks: {
    onNavigate() {
      const serverState = getServerState();
      
      // serverState contains values from wp_interactivity_state()
      console.log(serverState.items);
      
      // Read-only - this won't work:
      // serverState.items = []; // Error or silently fails
    }
  }
});
```

### Server-Side Setup

```php
wp_interactivity_state('myblock', [
  'items' => get_posts(['numberposts' => 10]),
  'currentPage' => get_query_var('paged') ?: 1,
  'totalPages' => $wp_query->max_num_pages,
]);
```

## getServerContext() API

Returns read-only reference to server-provided context for current element.

```javascript
import { getContext, getServerContext } from '@wordpress/interactivity';

store('myblock', {
  callbacks: {
    syncContext() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Compare and update
      if (serverCtx.lastModified > ctx.lastModified) {
        ctx.data = serverCtx.data;
        ctx.lastModified = serverCtx.lastModified;
      }
    }
  }
});
```

### Server-Side Setup

```php
<div 
  data-wp-interactive="myblock"
  <?php echo wp_interactivity_data_wp_context([
    'id' => $post->ID,
    'data' => get_post_meta($post->ID, 'custom_data', true),
    'lastModified' => get_post_modified_time('U', false, $post),
  ]); ?>
>
```

## Synchronization Patterns

### Pattern 1: Always Sync

Replace client values with server values on every navigation:

```javascript
store('posts', {
  callbacks: {
    alwaysSync() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      Object.assign(ctx, serverCtx);
    }
  }
});
```

```html
<div data-wp-interactive="posts"
     data-wp-router-region="posts-list"
     data-wp-watch="callbacks.alwaysSync">
```

### Pattern 2: Selective Sync

Only sync specific properties:

```javascript
store('posts', {
  callbacks: {
    selectiveSync() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Sync these
      ctx.posts = serverCtx.posts;
      ctx.pagination = serverCtx.pagination;
      
      // Keep these (user preferences)
      // ctx.sortOrder - preserved
      // ctx.viewMode - preserved
    }
  }
});
```

### Pattern 3: Conditional Sync

Sync based on conditions:

```javascript
store('posts', {
  callbacks: {
    conditionalSync() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Only sync if server data is newer
      if (serverCtx.version > ctx.version) {
        ctx.posts = serverCtx.posts;
        ctx.version = serverCtx.version;
      }
      
      // Only sync if user hasn't modified
      if (!ctx.userHasModified) {
        ctx.filters = serverCtx.filters;
      }
    }
  }
});
```

### Pattern 4: Merge Arrays

Combine server and client arrays:

```javascript
store('infinite-scroll', {
  callbacks: {
    appendItems() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Append new items instead of replacing
      const existingIds = new Set(ctx.items.map(i => i.id));
      const newItems = serverCtx.items.filter(i => !existingIds.has(i.id));
      
      ctx.items = [...ctx.items, ...newItems];
      ctx.page = serverCtx.page;
    }
  }
});
```

## URL State Synchronization

The router maintains `state.url` synchronized with browser URL:

```javascript
const { state } = store('core/router');

// Current URL
console.log(state.url); // "https://example.com/page/2"

// React to URL changes
store('myblock', {
  callbacks: {
    onUrlChange() {
      const { state } = store('core/router');
      const url = new URL(state.url);
      
      // Parse query params
      const searchTerm = url.searchParams.get('s');
      const page = url.searchParams.get('paged') || 1;
      
      // Update local context
      const ctx = getContext();
      ctx.searchTerm = searchTerm;
      ctx.currentPage = parseInt(page);
    }
  }
});
```

## State During Loading

Track navigation loading state in your own store (the `core/router` public `state.navigation` getter is deprecated and will be removed in WP 7.1):

```javascript
const { state } = store('myblock', {
  state: {
    isNavigating: false,
  },
  actions: {
    navigate: withSyncEvent(function*(event) {
      event.preventDefault();
      state.isNavigating = true;
      try {
        const { actions } = yield import('@wordpress/interactivity-router');
        yield actions.navigate(event.target.href);
      } finally {
        state.isNavigating = false;
      }
    }),
  },
  callbacks: {
    watchLoading() {
      const ctx = getContext();
      ctx.showSpinner = state.isNavigating;
    },
  },
});
```

## Common Issues

### Issue: State Not Updating

**Problem**: Context seems stale after navigation.

**Solution**: Use `getServerContext()` explicitly:

```javascript
callbacks: {
  sync() {
    const ctx = getContext();
    const serverCtx = getServerContext();
    ctx.data = serverCtx.data; // Explicit update
  }
}
```

### Issue: State Overwritten Unexpectedly

**Problem**: User modifications lost on navigation.

**Solution**: Store user modifications in global state:

```javascript
store('myblock', {
  state: {
    userPreferences: {} // Persists across navigation
  },
  actions: {
    savePreference(key, value) {
      state.userPreferences[key] = value;
    }
  }
});
```

### Issue: Derived State Not Recalculating

**Problem**: Getters not updating after navigation.

**Solution**: Ensure getters reference reactive properties:

```javascript
store('myblock', {
  state: {
    items: [],
    // ✅ Correct - references reactive state.items
    get count() {
      return state.items.length;
    },
    // ❌ Wrong - captures items at definition time
    count: state.items.length
  }
});
```

## Best Practices

1. **Use global state for persistence**: Store important user data in global state
2. **Use context for per-instance data**: Page-specific data belongs in context
3. **Explicitly sync when needed**: Don't rely on automatic context merge
4. **Version your data**: Include version/timestamp for smart sync decisions
5. **Separate concerns**: Keep navigation logic separate from business logic
6. **Handle loading states**: Always show feedback during navigation
