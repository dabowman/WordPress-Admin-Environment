# Router Region Behavior Reference

Detailed documentation on `data-wp-router-region` directive behavior.

## Defining Router Regions

Router regions are DOM elements whose content updates during client-side navigation.

### Basic Syntax

```html
<div data-wp-interactive="namespace/block"
     data-wp-router-region="unique-region-id">
  <!-- Content that updates on navigation -->
</div>
```

### Requirements

1. **Must have `data-wp-interactive`**: Region must be on an interactive element
2. **Must be root interactive element**: Cannot be nested inside another `data-wp-interactive` element
3. **Unique ID required**: Each region needs a distinct identifier
4. **Same ID across pages**: Matching regions on different pages must use identical IDs

## Region ID Formats

### Simple String

```html
<div data-wp-router-region="main-content">
```

### JSON Object (6.9+)

```html
<div data-wp-router-region='{"id": "modal", "attachTo": "body"}'>
```

## Region Matching Algorithm

When `navigate()` is called, the router:

1. **Extracts regions** from both current and target pages
2. **Matches by ID** - regions with identical IDs are paired
3. **Applies updates** based on match results

### Matching Outcomes

| Current Page | Target Page | Result |
|--------------|-------------|--------|
| Region A exists | Region A exists | Content **replaced** with new content |
| Region A exists | Region A missing | Region A **removed** from DOM |
| Region A missing | Region A exists (no `attachTo`) | Region A **NOT added** |
| Region A missing | Region A exists (with `attachTo`) | Region A **created & appended** |

### Example Scenarios

**Scenario 1: Pagination**
```html
<!-- Page 1 -->
<div data-wp-interactive="posts" data-wp-router-region="posts-list">
  <article>Post 1</article>
  <article>Post 2</article>
</div>

<!-- Page 2 (navigating to) -->
<div data-wp-interactive="posts" data-wp-router-region="posts-list">
  <article>Post 3</article>
  <article>Post 4</article>
</div>

<!-- Result: Content replaced, region preserved -->
```

**Scenario 2: Conditional Content**
```html
<!-- Home page -->
<div data-wp-interactive="site" data-wp-router-region="hero">
  <h1>Welcome</h1>
</div>

<!-- About page (no hero) -->
<!-- Hero region doesn't exist -->

<!-- Result: Hero region removed when navigating to About -->
```

**Scenario 3: Modal (with attachTo)**
```html
<!-- Page without modal -->
<!-- No modal region exists -->

<!-- Page with modal -->
<div data-wp-interactive="shop"
     data-wp-router-region='{"id": "cart-modal", "attachTo": "body"}'>
  <div class="modal">Cart Contents</div>
</div>

<!-- Result: Modal created and appended to body -->
```

## The attachTo Property (6.9+)

Enables dynamic region creation for content that doesn't exist on every page.

### Syntax

```html
<div data-wp-interactive="namespace"
     data-wp-router-region='{"id": "region-id", "attachTo": "css-selector"}'>
```

### How It Works

1. When navigating to a page with an `attachTo` region
2. If that region doesn't exist on current page
3. Router creates the region and appends it to the element matching the CSS selector

### Use Cases

**Modals:**
```html
<div data-wp-interactive="shop"
     data-wp-router-region='{"id": "product-modal", "attachTo": "body"}'>
  <div class="modal-backdrop">
    <div class="modal-content">
      <?php echo $product_details; ?>
    </div>
  </div>
</div>
```

**Slide-out Panels:**
```html
<div data-wp-interactive="site"
     data-wp-router-region='{"id": "sidebar-panel", "attachTo": "#app"}'>
  <aside class="slide-panel">
    <?php echo $sidebar_content; ?>
  </aside>
</div>
```

**Toast Notifications:**
```html
<div data-wp-interactive="notifications"
     data-wp-router-region='{"id": "toast-container", "attachTo": "body"}'>
  <div class="toast-stack">
    <?php foreach ($toasts as $toast): ?>
      <div class="toast"><?php echo $toast; ?></div>
    <?php endforeach; ?>
  </div>
</div>
```

### Important Notes

- `attachTo` is only used when region **doesn't exist** on current page
- If region exists on both pages, `attachTo` is **ignored** (content updates in place)
- CSS selector should match a single element
- Parent element must exist on current page

## Nested Regions (6.9+)

WordPress 6.9+ supports nested router regions.

```html
<div data-wp-interactive="app"
     data-wp-router-region="main-layout">
  <header>Site Header</header>
  
  <main data-wp-interactive="content"
        data-wp-router-region="page-content">
    <!-- Inner content updates independently -->
  </main>
  
  <footer>Site Footer</footer>
</div>
```

### Behavior

- Outer and inner regions can update independently
- Inner region updates don't affect outer region's other content
- Both regions must match between pages for partial updates

## Region Lifecycle

### During Navigation

1. **Start**: `state.navigation.hasStarted = true`
2. **Fetch**: Target page HTML retrieved (or from cache)
3. **Parse**: HTML converted to virtual DOM
4. **Match**: Regions paired by ID
5. **Update**: DOM mutations applied in batch
6. **Complete**: `state.navigation.hasFinished = true`

### Callbacks

Use `data-wp-init` and `data-wp-watch` for region lifecycle:

```javascript
store('myblock', {
  callbacks: {
    onRegionInit() {
      // Called when region mounts (including after navigation)
      console.log('Region initialized');
    },
    watchRegionContent() {
      // Called when region content changes
      const ctx = getContext();
      console.log('Content updated:', ctx);
    }
  }
});
```

```html
<div data-wp-interactive="myblock"
     data-wp-router-region="content"
     data-wp-init="callbacks.onRegionInit"
     data-wp-watch="callbacks.watchRegionContent">
</div>
```

## State and Context Handling

### Global State Persistence

Global store state persists across navigation:

```javascript
store('cart', {
  state: {
    items: [], // Survives navigation
    total: 0,
  }
});
```

### Context Reset

Context within router regions is **reset** to server-provided values after navigation:

```php
<div data-wp-interactive="posts"
     data-wp-router-region="post-list"
     <?php echo wp_interactivity_data_wp_context(['page' => $current_page]); ?>>
```

After navigating, `context.page` reflects the new page's value.

### Server State Access (6.7+)

Use `getServerState()` and `getServerContext()` to access fresh server values:

```javascript
import { store, getContext, getServerContext } from '@wordpress/interactivity';

store('myblock', {
  callbacks: {
    syncWithServer() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Server context has fresh values after navigation
      if (serverCtx.version > ctx.version) {
        ctx.items = serverCtx.items;
        ctx.version = serverCtx.version;
      }
    }
  }
});
```

## Asset Handling (6.9+)

### Stylesheets

- New stylesheets required by target page are loaded into `<head>`
- Existing stylesheets are preserved
- Removed stylesheets are disabled (not removed, for potential back navigation)

### Script Modules

Blocks must declare client navigation support:

```json
{
  "supports": {
    "interactivity": {
      "clientNavigation": true
    }
  }
}
```

Script modules for new blocks:
- Load automatically when their block appears in target page
- Must be registered with `add_client_navigation_support_to_script_module()`

## Common Patterns

### Multiple Regions on Same Page

```html
<div data-wp-interactive="layout" data-wp-router-region="header-nav">
  <!-- Navigation updates on page change -->
</div>

<div data-wp-interactive="content" data-wp-router-region="main-content">
  <!-- Main content updates -->
</div>

<div data-wp-interactive="sidebar" data-wp-router-region="sidebar-widgets">
  <!-- Sidebar updates -->
</div>
```

### Region with Loading State

```html
<div data-wp-interactive="posts"
     data-wp-router-region="posts-grid"
     data-wp-class--is-loading="state.isNavigating">
  <?php foreach ($posts as $post): ?>
    <article><?php echo $post->post_title; ?></article>
  <?php endforeach; ?>
</div>
```

```css
.is-loading {
  opacity: 0.5;
  pointer-events: none;
}
```

### Preserving Scroll Position

```javascript
store('myblock', {
  state: {
    scrollPositions: {}
  },
  callbacks: {
    saveScroll() {
      const { state } = store('core/router');
      this.state.scrollPositions[state.url] = window.scrollY;
    },
    restoreScroll() {
      const { state } = store('core/router');
      const saved = this.state.scrollPositions[state.url];
      if (saved) window.scrollTo(0, saved);
    }
  }
});
```

## Debugging Regions

### Verify Region IDs

```javascript
// In browser console
document.querySelectorAll('[data-wp-router-region]').forEach(el => {
  console.log('Region:', el.getAttribute('data-wp-router-region'));
});
```

### Check Region Matching

```javascript
// Before navigation, log current regions
const currentRegions = [...document.querySelectorAll('[data-wp-router-region]')]
  .map(el => el.getAttribute('data-wp-router-region'));
console.log('Current regions:', currentRegions);
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Content not updating | Region ID mismatch | Ensure identical IDs |
| Region disappears | Region missing on target | Add region to target page |
| Region not appearing | Missing `attachTo` | Add `attachTo` for dynamic regions |
| Nested region ignored | Not root interactive | Move to root `data-wp-interactive` |
