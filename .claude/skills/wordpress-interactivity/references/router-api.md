# Router API Reference

Complete API reference for `@wordpress/interactivity-router`.

## Importing the Router

The router should be **dynamically imported** to reduce initial bundle size:

```javascript
// Inside a generator action
const { actions, state } = yield import('@wordpress/interactivity-router');

// Inside an async function (for non-critical paths like prefetch)
const { actions } = await import('@wordpress/interactivity-router');
```

## Store: core/router

When loaded, the package registers a store under `core/router` namespace:

```javascript
store('core/router', {
  state: {
    url: window.location.href,
    // navigation.hasStarted and navigation.hasFinished are available
    // via a deprecated getter (removed in WP 7.1).
    // Prefer tracking loading state in your own store instead.
  },
  actions: {
    *navigate(href, options) { /* ... */ },
    *prefetch(url, options) { /* ... */ },
  },
});
```

> **Deprecation (WP 7.0+):** `state.navigation.hasStarted` and `state.navigation.hasFinished` are deprecated and will stop working in WordPress 7.1. The actual values live in the private `core/router/private` store. Track navigation loading state in your own store instead (wrap navigate calls with your own flags).

## actions.navigate()

Navigates to the specified page using client-side region replacement.

### Signature

```typescript
function* navigate(
  href: string,
  options?: NavigateOptions
): Generator<Promise<void>, void, unknown>
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `href` | `string` | Target URL (absolute or relative) |
| `options` | `NavigateOptions` | Optional configuration object |

### NavigateOptions

```typescript
interface NavigateOptions {
  force?: boolean;              // Default: false
  html?: string;                // Default: undefined
  replace?: boolean;            // Default: false
  timeout?: number;             // Default: 10000
  loadingAnimation?: boolean;   // Default: true
  screenReaderAnnouncement?: boolean; // Default: true
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `force` | `boolean` | `false` | Re-fetch URL even if cached |
| `html` | `string` | `undefined` | HTML string to use instead of fetching |
| `replace` | `boolean` | `false` | Replace current history entry instead of pushing |
| `timeout` | `number` | `10000` | Milliseconds before navigation aborts |
| `loadingAnimation` | `boolean` | `true` | Show top loading bar during navigation |
| `screenReaderAnnouncement` | `boolean` | `true` | Announce navigation to screen readers |

### Usage Examples

**Basic navigation:**
```javascript
actions: {
  goToPage: withSyncEvent(function* (e) {
    e.preventDefault();
    const { actions } = yield import('@wordpress/interactivity-router');
    yield actions.navigate(e.target.href);
  }),
}
```

**With options:**
```javascript
actions: {
  applyFilter: withSyncEvent(function* (e) {
    e.preventDefault();
    const { actions } = yield import('@wordpress/interactivity-router');
    yield actions.navigate(e.target.href, {
      replace: true,      // Don't add to history
      timeout: 15000,     // 15 second timeout
      force: true,        // Bypass cache
    });
  }),
}
```

**Using provided HTML:**
```javascript
actions: {
  *showPreview() {
    const { actions } = yield import('@wordpress/interactivity-router');
    const html = yield fetch('/preview').then(r => r.text());
    yield actions.navigate('/preview', { html });
  },
}
```

### Behavior

1. **URL Normalization**: The provided href is normalized to an absolute URL
2. **Cache Check**: If URL was previously fetched, cached HTML is used (unless `force: true`)
3. **Fetch**: If not cached, fetches the target page HTML
4. **Parse**: Parses HTML into DOM structure
5. **Region Match**: Finds all `data-wp-router-region` elements in both current and new page
6. **Update**: Swaps content of matching regions using batched DOM updates
7. **State Sync**: Extracts and merges `wp_interactivity_state()` from new page
8. **History**: Pushes new entry (or replaces if `replace: true`)
9. **Assets (6.9+)**: Loads new stylesheets/script modules, disables removed ones

### Full Page Reload Triggers

Navigation falls back to full page reload when:
- Timeout is exceeded
- Fatal error during fetch/parse
- No matching router regions between pages
- Incompatible script modules detected
- Target is an external URL

## actions.prefetch()

Prefetches and caches page HTML for faster subsequent navigation.

### Signature

```typescript
function* prefetch(
  url: string,
  options?: PrefetchOptions
): Generator<Promise<void>, void, unknown>
```

> Like `navigate()`, `prefetch()` is a generator function. The Interactivity API runtime handles the generator protocol automatically, so callers can `yield` or `await` the result.

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | `string` | URL to prefetch |
| `options` | `PrefetchOptions` | Optional configuration |

### PrefetchOptions

```typescript
interface PrefetchOptions {
  force?: boolean;  // Default: false
  html?: string;    // Default: undefined
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `force` | `boolean` | `false` | Re-fetch even if already cached |
| `html` | `string` | `undefined` | HTML string to cache instead of fetching |

### Usage Examples

**Prefetch on hover:**
```javascript
actions: {
  prefetch: async () => {
    const { ref } = getElement();
    const { actions } = await import('@wordpress/interactivity-router');
    actions.prefetch(ref.href);
  },
}
```

```html
<a href="/page/2" data-wp-on-async--mouseenter="actions.prefetch">Next</a>
```

**Force re-prefetch:**
```javascript
actions.prefetch('/products', { force: true });
```

**Cache custom HTML:**
```javascript
const customHtml = await generatePreview();
actions.prefetch('/preview', { html: customHtml });
```

### Behavior

1. **Normalize URL**: Converts to absolute URL
2. **Check Cache**: Returns immediately if already cached (unless `force: true`)
3. **Deduplicate**: Stores fetch promise to avoid duplicate requests for same URL
4. **Cache (6.9+)**: Also prefetches associated stylesheets and script modules

## state.url

Reactive property synchronized with current URL.

```javascript
const { state } = store('core/router');

// Read current URL
console.log(state.url);

// React to URL changes
store('myblock', {
  callbacks: {
    onUrlChange() {
      const { state } = store('core/router');
      console.log('URL changed to:', state.url);
    }
  }
});
```

```html
<div data-wp-watch="callbacks.onUrlChange">
  <span data-wp-text="state.url"></span>
</div>
```

## Navigation Loading State

> **Deprecation:** `state.navigation.hasStarted` and `state.navigation.hasFinished` on the `core/router` public store are deprecated (removed in WP 7.1). Track loading state in your own store instead.

### Recommended Pattern

```javascript
import { store, withSyncEvent } from '@wordpress/interactivity';

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
});
```

```html
<div data-wp-interactive="myblock">
  <div data-wp-bind--hidden="!state.isNavigating"
       class="loading-overlay"
       role="status"
       aria-live="polite">
    Loading...
  </div>
</div>
```

## TypeScript Definitions

```typescript
// Navigate options
interface NavigateOptions {
  force?: boolean;
  html?: string;
  replace?: boolean;
  timeout?: number;
  loadingAnimation?: boolean;
  screenReaderAnnouncement?: boolean;
}

// Prefetch options  
interface PrefetchOptions {
  force?: boolean;
  html?: string;
}

// Router state
interface RouterState {
  url: string;
}

// Router store
interface RouterStore {
  state: RouterState;
  actions: {
    navigate: (href: string, options?: NavigateOptions) => Generator;
    prefetch: (url: string, options?: PrefetchOptions) => Generator;
  };
}
```

## Error Handling

The `navigate()` function can throw errors. Always implement error handling:

```javascript
actions: {
  navigate: withSyncEvent(function* (e) {
    e.preventDefault();
    const ctx = getContext();
    
    try {
      const { actions } = yield import('@wordpress/interactivity-router');
      yield actions.navigate(e.target.href);
    } catch (error) {
      console.error('Navigation failed:', error);
      ctx.error = 'Failed to load page';
      
      // Fallback to full page navigation
      window.location.href = e.target.href;
    }
  }),
}
```

### Error Behavior

Navigation does not throw typed error classes. On failure, the router silently falls back to a full page reload via `window.location.assign()`. Failures that trigger this fallback include:

- Fetch timeout exceeded
- Network error during fetch
- Invalid HTML response
- No matching router regions between pages
- Incompatible script modules detected

Wrap navigation in try/catch to handle the fallback gracefully:

```javascript
actions: {
  navigate: withSyncEvent(function* (e) {
    e.preventDefault();
    try {
      const { actions } = yield import('@wordpress/interactivity-router');
      yield actions.navigate(e.target.href);
    } catch (error) {
      // Router already handles fallback to full reload,
      // but you can add custom error UI here
      console.error('Navigation failed:', error);
    }
  }),
}
```
