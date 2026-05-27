# Version History

Changes to WordPress Interactivity API by version.

## WordPress 6.9 (April 2025)

### New Features

**Unique Directive IDs**
Multiple directives of same type using `---` suffix:
```html
<div 
  data-wp-watch---analytics="callbacks.track"
  data-wp-watch---logging="callbacks.log"
>
```

**Router Region attachTo**
Specify render target for regions:
```html
<div data-wp-router-region='{"id": "modal", "attachTo": "body"}'>
```

**Automatic Script/Style Loading**
Scripts and stylesheets for blocks on navigated pages load automatically.

**TypeScript Async Action Helpers**
```typescript
import { type AsyncAction, type TypeYield } from '@wordpress/interactivity';

*fetchData(): AsyncAction<number> {
  const data = (yield fetch('/api')) as TypeYield<typeof fetch>;
}
```

### Deprecations

**data-wp-ignore deprecated**
Use specific directive configuration instead.

**state.navigation on core/router deprecated**
`state.navigation.hasStarted` and `state.navigation.hasFinished` are deprecated and will be removed in WordPress 7.1. The values now live in the private `core/router/private` store. Track navigation loading state in your own store instead.

---

## WordPress 6.8 (April 2025)

### New Features

**withSyncEvent() Wrapper**
Required for synchronous event access:
```javascript
import { withSyncEvent, splitTask } from '@wordpress/interactivity';

handleSubmit: withSyncEvent(function*(event) {
  event.preventDefault();
  yield splitTask();
})
```

**splitTask() Utility**
Yield to main thread in sync handlers:
```javascript
yield splitTask();
```

**.length Property in Directives**
```html
<span data-wp-text="state.items.length"></span>
```

### Breaking Changes

**Sync event access without withSyncEvent() deprecated**
```javascript
// ❌ Deprecated - warning in 6.8
handleClick: (event) => { event.preventDefault(); }

// ✅ Correct
handleClick: withSyncEvent((event) => { event.preventDefault(); })
```

### Deprecations

**Actions in attribute bindings deprecated**
```javascript
// ❌ Deprecated
actions: { isOpen() { return getContext().open; } }
// data-wp-bind--hidden="!actions.isOpen"

// ✅ Correct - use derived state
state: { get isOpen() { return getContext().open; } }
// data-wp-bind--hidden="!state.isOpen"
```

---

## WordPress 6.7 (November 2024)

### New Features

**getServerState() and getServerContext()**
Read-only access to original server values after client navigation:
```javascript
import { getServerState, getServerContext } from '@wordpress/interactivity';

callbacks: {
  sync() {
    const serverState = getServerState();
    const serverCtx = getServerContext();
  }
}
```

**State/Context Change Subscriptions**
For client-side navigation state management.

---

## WordPress 6.6 (July 2024)

### New Features

**Async Event Handlers**
```html
<button data-wp-on-async--click="actions.handle">
```
Variants: `data-wp-on-async-window--`, `data-wp-on-async-document--`

**PHP Derived State (Closures)**
```php
wp_interactivity_state('ns/block', [
  'isActive' => function() {
    $ctx = wp_interactivity_get_context();
    return $ctx['id'] === get_option('active');
  }
]);
```

**wp_interactivity_get_context() PHP Function**
Access context in server-side derived state.

**Preact DevTools Integration**
Works when `SCRIPT_DEBUG` is true.

**Warning System**
Console warnings for common directive mistakes.

---

## WordPress 6.5 (April 2024)

### Initial Stable Release

**Core Directives**
- `data-wp-interactive` - Namespace activation
- `data-wp-context` - Local state
- `data-wp-bind--*` - Attribute binding
- `data-wp-class--*` - Class toggling
- `data-wp-style--*` - Inline styles
- `data-wp-text` - Text content
- `data-wp-on--*` - Event handlers
- `data-wp-on-window--*` - Window events
- `data-wp-on-document--*` - Document events
- `data-wp-watch` - Reactive side effects
- `data-wp-init` - Mount lifecycle
- `data-wp-each` - List iteration

**Store API**
- `store()` - Create/extend stores
- `getContext()` - Access local context
- `getElement()` - Access DOM element
- `getConfig()` - Access static config

**Server-Side PHP**
- `wp_interactivity_state()` - Initialize state
- `wp_interactivity_config()` - Static config
- `wp_interactivity_data_wp_context()` - Safe context encoding
- `wp_interactivity_process_directives()` - Manual processing

**Script Modules API**
- `viewScriptModule` in block.json
- ES module support
- `--experimental-modules` build flag

**@wordpress/interactivity-router**
- `actions.navigate()` - Client navigation
- `actions.prefetch()` - Preloading
- `data-wp-router-region` - Update regions

---

## Migration Guide

### 6.7 → 6.8

1. **Wrap sync event handlers:**
```javascript
// Before
handleSubmit: (e) => { e.preventDefault(); /* ... */ }

// After
import { withSyncEvent } from '@wordpress/interactivity';
handleSubmit: withSyncEvent((e) => { e.preventDefault(); /* ... */ })
```

2. **Convert action getters to state getters:**
```javascript
// Before
actions: { isOpen() { return getContext().open; } }

// After
state: { get isOpen() { return getContext().open; } }
```

### 6.8 → 6.9

1. **Multiple same-type directives now supported:**
```html
<!-- Now valid -->
<div 
  data-wp-watch---a="callbacks.a"
  data-wp-watch---b="callbacks.b"
>
```

2. **data-wp-ignore deprecated** - Remove if present.

3. **Use TypeScript async action types** (optional):
```typescript
import { type AsyncAction } from '@wordpress/interactivity';
*myAction(): AsyncAction<ReturnType> { /* ... */ }
```
