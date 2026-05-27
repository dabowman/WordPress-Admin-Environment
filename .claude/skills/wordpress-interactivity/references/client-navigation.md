# Client-Side Navigation Reference

SPA-like page transitions using `@wordpress/interactivity-router` (6.9+).

## Overview

Client-side navigation fetches new pages without full reload, updating only designated "router regions" while preserving JavaScript state.

## Setup

### block.json

```json
{
  "supports": {
    "interactivity": {
      "clientNavigation": true,
      "interactive": true
    }
  },
  "viewScriptModule": "file:./view.js"
}
```

### Router Regions

Mark regions that should update on navigation:

```php
<div 
  data-wp-interactive="myblock" 
  data-wp-router-region="main-content"
>
  <!-- This content updates on client navigation -->
  <ul>
    <?php foreach ($posts as $post): ?>
      <li><?php echo esc_html($post->post_title); ?></li>
    <?php endforeach; ?>
  </ul>
  
  <a href="/page/2" data-wp-on--click="actions.navigate">Next</a>
</div>
```

Regions with same ID across pages get swapped.

## Navigation Actions

### Basic Navigation

```javascript
import { store, withSyncEvent } from '@wordpress/interactivity';

store('myblock', {
  actions: {
    navigate: withSyncEvent(function*(event) {
      event.preventDefault();
      const { actions } = yield import('@wordpress/interactivity-router');
      yield actions.navigate(event.target.href);
    }),
  }
});
```

### Navigation Options

```javascript
yield actions.navigate(url, {
  // Force re-fetch even if URL is cached
  force: false,
  
  // Replace current history entry instead of push
  replace: false,
  
  // Timeout in milliseconds
  timeout: 10000,
  
  // Show loading animation during fetch
  loadingAnimation: true,
  
  // Announce page change to screen readers
  screenReaderAnnouncement: true,
});
```

### Prefetching

Preload pages for instant navigation:

```javascript
actions: {
  prefetchLink: async () => {
    const { actions } = await import('@wordpress/interactivity-router');
    const { href } = getContext();
    actions.prefetch(href);
  }
}
```

```html
<a 
  href="/about"
  data-wp-on-async--mouseenter="actions.prefetchLink"
  data-wp-on--click="actions.navigate"
>About</a>
```

## Router Region Options (6.9+)

### attachTo

Specify where region content renders, even if target is outside initial region:

```html
<!-- Modal that renders to body -->
<div 
  data-wp-interactive="myModal" 
  data-wp-router-region='{"id": "modal-region", "attachTo": "body"}'
>
  <div class="modal-content">
    <!-- Content -->
  </div>
</div>
```

### Region Configuration

```html
<div 
  data-wp-router-region='{
    "id": "unique-region-id",
    "attachTo": "body"
  }'
>
```

## State Persistence

### Global State

Global store state persists across navigation:

```javascript
store('shop/cart', {
  state: {
    items: [], // Persists across page changes
    get count() { return state.items.length; }
  }
});
```

### Server State Sync

Use `getServerState()` and `getServerContext()` to access fresh server values after navigation:

```javascript
import { store, getContext, getServerContext } from '@wordpress/interactivity';

store('myblock', {
  callbacks: {
    syncAfterNav() {
      const ctx = getContext();
      const serverCtx = getServerContext();
      
      // Server has fresh data after navigation
      if (serverCtx.lastUpdated > ctx.lastUpdated) {
        ctx.items = serverCtx.items;
        ctx.lastUpdated = serverCtx.lastUpdated;
      }
    }
  }
});
```

## Loading States

The router does not add a CSS class to `<body>` during navigation. Track loading state in your own store and apply classes via directives.

### JavaScript Loading State

```javascript
store('myblock', {
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

### CSS via Directive

```html
<div data-wp-router-region="content"
     data-wp-class--is-loading="state.isNavigating">
  <!-- content -->
</div>
```

```css
.is-loading {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.2s;
}
```

## Script & Style Loading (6.9+)

WordPress 6.9 automatically loads new scripts and stylesheets required by navigated pages:

- Script modules referenced by blocks on the new page load automatically
- Stylesheets needed by new blocks inject into `<head>`
- No manual handling needed

## Pagination Pattern

```php
<?php
$page = get_query_var('paged') ?: 1;
$posts = new WP_Query([
  'posts_per_page' => 10,
  'paged' => $page
]);

wp_interactivity_state('myblock', [
  'currentPage' => $page,
  'totalPages' => $posts->max_num_pages
]);
?>

<div 
  data-wp-interactive="myblock"
  data-wp-router-region="posts-list"
>
  <ul>
    <?php while ($posts->have_posts()): $posts->the_post(); ?>
      <li><?php the_title(); ?></li>
    <?php endwhile; ?>
  </ul>
  
  <nav class="pagination">
    <?php if ($page > 1): ?>
      <a 
        href="<?php echo get_pagenum_link($page - 1); ?>"
        data-wp-on--click="actions.navigate"
      >Previous</a>
    <?php endif; ?>
    
    <?php if ($page < $posts->max_num_pages): ?>
      <a 
        href="<?php echo get_pagenum_link($page + 1); ?>"
        data-wp-on--click="actions.navigate"
        data-wp-on-async--mouseenter="actions.prefetch"
      >Next</a>
    <?php endif; ?>
  </nav>
</div>
```

```javascript
import { store, withSyncEvent, getElement } from '@wordpress/interactivity';

store('myblock', {
  actions: {
    navigate: withSyncEvent(function*(event) {
      event.preventDefault();
      const { actions } = yield import('@wordpress/interactivity-router');
      yield actions.navigate(event.target.href);
      // Scroll to top after navigation
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }),
    
    prefetch: async () => {
      const { ref } = getElement();
      const { actions } = await import('@wordpress/interactivity-router');
      actions.prefetch(ref.href);
    }
  }
});
```

## Filter/Search with Client Navigation

```php
<div 
  data-wp-interactive="searchBlock"
  data-wp-router-region="search-results"
>
  <input 
    type="search"
    data-wp-on--input="actions.handleSearch"
    value="<?php echo esc_attr($_GET['s'] ?? ''); ?>"
  />
  
  <ul>
    <?php foreach ($results as $result): ?>
      <li><?php echo esc_html($result->post_title); ?></li>
    <?php endforeach; ?>
  </ul>
</div>
```

```javascript
let searchTimeout;

store('searchBlock', {
  actions: {
    handleSearch: async (event) => {
      clearTimeout(searchTimeout);
      const query = event.target.value;
      
      searchTimeout = setTimeout(async () => {
        const { actions } = await import('@wordpress/interactivity-router');
        const url = new URL(window.location);
        
        if (query) {
          url.searchParams.set('s', query);
        } else {
          url.searchParams.delete('s');
        }
        
        await actions.navigate(url.toString(), { replace: true });
      }, 300);
    }
  }
});
```

## Accessibility

Client navigation handles:
- Focus management (focus moves to main content)
- Screen reader announcements (page title change)
- Browser history (back/forward work)

Customize announcements:

```javascript
yield actions.navigate(url, {
  screenReaderAnnouncement: true // Default, announces new page title
});
```

## Compatibility Notes

- Works with blocks that declare `clientNavigation: true`
- Falls back to full page reload for external links or non-compatible pages
- Scripts/styles from previous page remain unless explicitly unloaded
- Form submissions typically require full page reload (use fetch instead)
