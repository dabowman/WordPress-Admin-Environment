---
name: wordpress-interactivity
description: WordPress Interactivity API development (stabilized WP 6.5; current: 6.9, released December 2025). MUST load before making Interactivity API claims — WordPress ships twice yearly and training data goes stale within months. Use when building interactive block frontends, adding client-side behavior to blocks, implementing modals/dialogs/accordions, creating filters/search with live results, handling forms with validation, enabling client-side navigation (SPA-like), sharing state across multiple blocks, or any frontend interactivity beyond CSS. Covers directives, stores, state management, async patterns, server-side rendering, client navigation with the Interactivity Router, and accessibility.
---

# WordPress Interactivity API — Complete Implementation Guide

Build interactive WordPress block frontends using the declarative directive-based Interactivity API and the Interactivity Router for client-side navigation. API stabilized in WordPress 6.5; current: 6.9, released December 2, 2025. ~11KB gzipped runtime built on Preact Signals. Router adds ~3KB.

## When to Use

✅ **Use Interactivity API for:**
- Toggles, modals, accordions, tabs, dropdowns
- Forms with live validation and async submission
- Search/filter with instant results
- Shopping carts, wishlists, cross-block communication
- Client-side page navigation (SPA-like pagination, infinite scroll)
- Any reactive UI state on the block frontend

❌ **Don't use for:**
- CSS-only effects (hover, focus, animations)
- Editor-side functionality (use React)
- Third-party library wrappers (use traditional enqueue)
- Full single-page applications (use React Router etc.)

## Architecture Overview

The Interactivity API is **server-rendered first**. PHP renders the initial HTML with directive attributes. A ~10KB Preact/Signals runtime hydrates and manages reactivity client-side. Directive values are **references to store properties**, never JavaScript expressions.

**Three-layer model:**
1. **HTML (render.php)** — Server-rendered markup with `data-wp-*` directive attributes
2. **Store (view.js)** — JavaScript module defining state, actions, and callbacks
3. **State (PHP)** — Server initializes global state via `wp_interactivity_state()`

## Quick Start

### 1. block.json

```json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "myplugin/my-block",
  "title": "My Interactive Block",
  "supports": {
    "interactivity": true
  },
  "viewScriptModule": "file:./view.js",
  "render": "file:./render.php"
}
```

For blocks using the Interactivity Router (client-side navigation):

```json
{
  "supports": {
    "interactivity": {
      "clientNavigation": true,
      "interactive": true
    }
  }
}
```

### 2. Build config (package.json)

```json
{
  "scripts": {
    "build": "wp-scripts build --experimental-modules",
    "start": "wp-scripts start --experimental-modules"
  }
}
```

### 3. render.php

```php
<?php
$context = ['isOpen' => false];

wp_interactivity_state('myplugin/my-block', [
  'count' => 0,
]);
?>
<div
  data-wp-interactive="myplugin/my-block"
  <?php echo wp_interactivity_data_wp_context($context); ?>
  <?php echo get_block_wrapper_attributes(); ?>
>
  <button
    data-wp-on-async--click="actions.toggle"
    data-wp-bind--aria-expanded="context.isOpen"
    type="button"
  >
    <span data-wp-text="context.isOpen ? 'Hide' : 'Show'"></span>
  </button>
  <div data-wp-bind--hidden="!context.isOpen">
    <?php echo $content; ?>
  </div>
</div>
```

### 4. view.js

```javascript
import { store, getContext } from '@wordpress/interactivity';

const { state } = store('myplugin/my-block', {
  state: {
    count: 0,
    get doubleCount() {
      return state.count * 2;
    },
  },
  actions: {
    toggle() {
      const ctx = getContext();
      ctx.isOpen = !ctx.isOpen;
    },
  },
});
```

## Directive Reference

All directives use `data-wp-*` prefix. Values are **references** to store properties (state, context, actions, callbacks), never JS expressions.

| Directive | Purpose |
|-----------|---------|
| `data-wp-interactive="ns/block"` | Activate namespace (required wrapper) |
| `data-wp-context='{...}'` | Local state scoped to element tree (nested contexts merge) |
| `data-wp-bind--[attr]` | Set HTML attribute; booleans toggle, ARIA booleans become `"true"`/`"false"` strings |
| `data-wp-class--[name]` | Toggle CSS class (use kebab-case — HTML attrs are case-insensitive) |
| `data-wp-style--[prop]` | Set inline CSS property |
| `data-wp-text` | Set text content (auto-escapes HTML; XSS-safe) |
| `data-wp-on-async--[event]` | **Preferred** async handler (yields to main thread → better INP) |
| `data-wp-on--[event]` | Sync handler — required for `preventDefault`/`stopPropagation`/`currentTarget` |
| `data-wp-on-window--[event]` / `data-wp-on-document--[event]` | Global listeners (resize, scroll, outside clicks, ESC); async variants exist |
| `data-wp-init` | Runs once on mount; return function for cleanup |
| `data-wp-watch` | Runs on mount and whenever referenced state changes; return function for cleanup |
| `data-wp-run` | Advanced: enables Preact hooks (`useState`, `useEffect`, etc.) |
| `data-wp-each="state.items"` | Iterate array inside `<template>` (item available as `context.item`) |
| `data-wp-each--name="state.xs"` + `data-wp-each-key="context.name.id"` | Custom item var + keyed iteration |

**Unique directive IDs (6.9+):** two directives of the same type on one element use triple-dash suffix — `data-wp-watch---analytics`, `data-wp-watch---logging`.

**Cross-namespace references:** prefix with `other/ns::` — e.g. `data-wp-text="shop/cart::state.itemCount"`.

Minimal examples:

```html
<div data-wp-interactive="myplugin/block"
     data-wp-context='{"id": 1, "isOpen": false}'>
  <button data-wp-on-async--click="actions.toggle"
          data-wp-bind--aria-expanded="context.isOpen"
          data-wp-class--is-active="context.isOpen">
    <span data-wp-text="context.isOpen ? 'Close' : 'Open'"></span>
  </button>
  <div data-wp-bind--hidden="!context.isOpen">Content</div>
</div>
```

See `references/directives.md` for every variant, full event-handler list, lifecycle cleanup patterns, and SSR notes.

## Store API

Exports from `@wordpress/interactivity`:

| Function | Purpose |
|----------|---------|
| `store(namespace, definition, { lock })` | Create/extend a store (multiple calls with same namespace merge) |
| `getContext()` / `getContext('other/ns')` | Local context for current element |
| `getElement()` | `{ ref, attributes }` for current element (ref is `null` during SSR) |
| `getServerState()` / `getServerContext()` | Read-only original server values (6.7+) |
| `getConfig(namespace)` | Static config from `wp_interactivity_config()` |
| `withSyncEvent(fn)` | Wrap actions needing sync event access — `preventDefault`, `currentTarget` (6.8+) |
| `withScope(fn)` | Preserve context in external callbacks (setTimeout, listeners) |
| `splitTask()` | Yield to main thread in generator actions (6.8+) |

Also re-exported for `data-wp-run`: `useState`, `useRef`, `useEffect`, `useLayoutEffect`, `useCallback`, `useMemo`, `useWatch`, `useInit`.

**Mental model — three state kinds:**
- **`state`** (global): defined in `store({ state })` or PHP `wp_interactivity_state()`. Shared across all instances; persists across client navigation (merged, not overwritten).
- **`context`** (local): defined in HTML via `data-wp-context` / `wp_interactivity_data_wp_context()`. Scoped to the element subtree; resets on client navigation.
- **Derived state**: JS getters on `state` (or PHP closures). Auto-recompute when their dependencies change. **Use getters in directives; never call actions from `data-wp-bind`/`data-wp-text`.**

Minimal store:

```javascript
import { store, getContext } from '@wordpress/interactivity';

const { state } = store('myplugin/block', {
  state: {
    items: [],
    filter: '',
    get filteredItems() {
      return state.items.filter(i => i.name.includes(state.filter));
    },
  },
  actions: {
    toggle() {
      const ctx = getContext();
      ctx.isOpen = !ctx.isOpen;
    },
  },
});
```

See `references/store-api.md` for every function signature, typed stores, private/locked stores, async-action details, and server-side PHP helpers.

## Critical Patterns

### ⚠️ Async Actions MUST Use Generator Functions

**This is the #1 source of bugs.** `async/await` breaks the Interactivity API's scope tracking. Always use `function*` generators with `yield`.

```javascript
// ❌ WRONG — context lost after await
async fetchData() {
  const ctx = getContext();     // OK here
  await fetch('/api');
  ctx.items = data;             // BROKEN — wrong context!
}

// ✅ CORRECT — generators preserve scope across yields
*fetchData() {
  const ctx = getContext();     // OK
  const response = yield fetch('/api');
  const data = yield response.json();
  ctx.items = data;             // Still correct context ✓
}
```

### ⚠️ withSyncEvent() Required for Event Methods (6.8+)

Any action using `event.preventDefault()`, `event.stopPropagation()`, or `event.currentTarget` **must** be wrapped:

```javascript
import { store, withSyncEvent, splitTask } from '@wordpress/interactivity';

store('ns/block', {
  actions: {
    handleSubmit: withSyncEvent(function*(event) {
      event.preventDefault();       // Works because of withSyncEvent
      event.stopPropagation();
      const form = event.currentTarget;
      const formData = new FormData(form);

      yield splitTask();            // Yield to main thread after sync work

      // Continue with async operations
      yield fetch('/api', { method: 'POST', body: formData });
    }),

    // Non-generator version for simple sync-only handlers
    handleClick: withSyncEvent((event) => {
      event.preventDefault();
      // Sync-only work here
    }),
  },
});
```

### withScope() for External Callbacks

Preserves context in `setTimeout`, `setInterval`, event listeners, etc.:

```javascript
import { store, withScope, getContext } from '@wordpress/interactivity';

store('ns/block', {
  callbacks: {
    startTimer() {
      setInterval(
        withScope(() => {
          const ctx = getContext(); // Correct context ✓
          ctx.elapsed++;
        }),
        1000
      );
    },
  },
});
```

### Private Stores

```javascript
const { state } = store('ns/private', { state: { internal: 'value' } }, { lock: true });

// Or with shared key
const KEY = Symbol('key');
store('ns/private', { state: {} }, { lock: KEY });
// Other module: store('ns/private', {}, { lock: KEY }); // Access granted
```

## Client-Side Navigation (Interactivity Router)

The `@wordpress/interactivity-router` package (~3KB) enables SPA-like navigation by updating designated "router regions" without full page reloads. Use it for paginated lists, filter/search results, infinite scroll, and anywhere you want to preserve client state across page transitions. Skip it for external links, form POSTs, and pages that don't share a region ID.

### Minimal Setup

**block.json** — declare `clientNavigation: true`. **render.php** — mark the updatable subtree with `data-wp-router-region="<stable-id>"` (same ID across pages = swap). **view.js** — lazy-import the router and call `navigate()`/`prefetch()`:

```javascript
import { store, getElement, withSyncEvent } from '@wordpress/interactivity';

store('myplugin/posts', {
  actions: {
    navigate: withSyncEvent(function*(event) {
      event.preventDefault();
      const { actions } = yield import('@wordpress/interactivity-router');
      yield actions.navigate(event.target.href);
    }),
    prefetch: async () => {
      const { ref } = getElement();
      const { actions } = await import('@wordpress/interactivity-router');
      actions.prefetch(ref.href);
    },
  },
});
```

```html
<a href="/page/2"
   data-wp-on--click="actions.navigate"
   data-wp-on-async--mouseenter="actions.prefetch">Next</a>
```

### State Synchronization After Navigation

Server state and router-region context behave differently on navigation — this is often misremembered:

- **Global state merges.** Navigating triggers `deepMerge(clientState, serverState, override=false)` — new server values are added, but existing client state keys are preserved (client wins on conflict). Nothing is removed.
- **Router-region context resets.** The router diffs regions and re-renders them, so `data-wp-context` values come from the new server markup — properties only on the old page disappear.

Use `getServerState()` and `getServerContext()` to access the fresh server values:

```javascript
import { store, getContext, getServerContext, getServerState } from '@wordpress/interactivity';

store('myblock', {
  callbacks: {
    syncAfterNav() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      ctx.items = serverCtx.items;
      ctx.page = serverCtx.page;
    },
  },
});
```

### Loading State

There is no built-in body class for router navigation. Track loading in your own store and toggle a class via `data-wp-class--is-loading="state.isNavigating"` — set `state.isNavigating = true` before `yield actions.navigate(...)` and `false` in `finally`.

### Deprecated `state.navigation` Getter

The `core/router` store exposes reactive `state.url`. Older code reads `state.navigation.hasStarted` etc. via a deprecated getter — this is scheduled for removal in WP 7.1. Track loading with your own store instead (above).

See `references/client-navigation.md` for the full `navigate()`/`prefetch()` option tables and pagination/search patterns, `references/router-api.md` for signatures and TypeScript types, and `references/region-behavior.md` for region matching, `attachTo` (6.9+ dynamic regions), nested regions, and automatic asset loading.

## Server-Side PHP

### wp_interactivity_state()

Initialize global state from PHP. Called in render.php or a hook.

```php
wp_interactivity_state('myplugin/block', [
  'items'    => get_posts(['post_type' => 'product']),
  'nonce'    => wp_create_nonce('my_action'),
  'ajaxUrl'  => admin_url('admin-ajax.php'),
  // Derived state via closure
  'isInCart' => function() {
    $ctx   = wp_interactivity_get_context();
    $state = wp_interactivity_state();
    return in_array($ctx['productId'], $state['cartItems'] ?? []);
  },
]);
```

### wp_interactivity_config()

Static config (not reactive, never changes client-side):

```php
wp_interactivity_config('myplugin/block', [
  'apiEndpoint' => rest_url('myplugin/v1/'),
  'maxItems'    => 100,
]);
```

### wp_interactivity_data_wp_context()

Safe JSON encoding for the context attribute:

```php
<div <?php echo wp_interactivity_data_wp_context([
  'postId' => get_the_ID(),
  'title'  => get_the_title(),
]); ?>>
```

### wp_interactivity_get_element() (6.7+)

Access the current element's attributes in PHP derived state closures:

```php
wp_interactivity_state('myplugin/block', [
  'hasCustomData' => function() {
    $element = wp_interactivity_get_element();
    return isset($element['attributes']['data-custom']);
  },
]);
```

Returns `array{attributes: array<string, string|bool>}` or `null` if called outside directive processing.

### wp_interactivity_process_directives()

Process directives for non-block HTML (shortcodes, classic themes):

```php
$html = '<div data-wp-interactive="ns/block"><span data-wp-text="state.msg"></span></div>';
echo wp_interactivity_process_directives($html);
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
      ctx.isOpen = !ctx.isOpen;
    },
  },
});
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
    },
  },
});
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `async/await` in actions | Use `function*` generators with `yield` |
| `preventDefault()` without wrapper | Wrap handler in `withSyncEvent()` |
| Context wrong in setTimeout/setInterval | Use `withScope()` |
| camelCase class names in `data-wp-class` | Use kebab-case: `--is-open` |
| Using actions in attribute bindings | Use derived state getters instead |
| Accessing `getElement().ref` during render | Check for null; use in `wp-init` |
| Missing `clientNavigation: true` | Add to block.json supports for router |
| Router region ID mismatch between pages | Use identical `data-wp-router-region` values |
| Expecting state overwrite after nav (pre-6.9) | Use `getServerState()`/`getServerContext()` |
| Using deprecated `state.navigation` from `core/router` | Track loading state in your own store (deprecated, removed WP 7.1) |
| Putting JS expressions in directive values | Only store references work (state.x, context.y) |
| Using in the block editor | Interactivity API is frontend-only |

## Implementation Templates

Complete working examples in `assets/templates/`:

| Template | Use Case | Key Features |
|----------|----------|--------------|
| `basic-toggle/` | Show/hide content | Context, bind, class, aria |
| `modal-dialog/` | Dialog with backdrop | Native `<dialog>`, focus trap, ESC, body scroll lock |
| `filter-search/` | Live filtering | Debounce, abort controller, async fetch, each directive |
| `form-handling/` | Form with validation | withSyncEvent, splitTask, field validation, nonce |
| `cross-block-state/` | Shared cart/wishlist | Multiple blocks sharing one store, derived state |
| `client-navigation/` | Paginated posts | Router region, prefetch on hover, loading state |
| `infinite-scroll/` | Load on scroll | Intersection Observer, router, append content |
| `tabbed-filter/` | Filter with URL updates | replace history, category tabs, a11y announcements |
| `modal-overlay/` | Modal from other page | attachTo, dynamic region creation (6.9+) |

**Replace `NAMESPACE` in templates** with your actual plugin namespace (e.g., `myplugin/block-name`).

## References

Detailed documentation for deep dives:

- **`references/directives.md`** — Complete directive syntax, all variants, SSR notes
- **`references/store-api.md`** — All functions, TypeScript types, async patterns, private stores, cleanup
- **`references/client-navigation.md`** — Router overview, regions, navigate/prefetch, pagination/search patterns
- **`references/router-api.md`** — Full API signatures, NavigateOptions, PrefetchOptions, TypeScript definitions, error types
- **`references/region-behavior.md`** — Region matching algorithm, attachTo, nested regions, lifecycle, asset handling
- **`references/state-management.md`** — State persistence, sync patterns, server state, loading states
- **`references/accessibility.md`** — Screen readers, focus management, ARIA, keyboard nav, reduced motion
- **`references/version-history.md`** — Changes from 6.5 → 6.9, migration guides

## Scaffolding

```bash
npx @wordpress/create-block@latest my-block \
  --template @wordpress/create-block-interactive-template
```
