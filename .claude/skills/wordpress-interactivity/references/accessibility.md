# Accessibility Reference

Implementing accessible client-side navigation.

## Built-in Accessibility Features

The Interactivity Router includes several accessibility features by default:

### Screen Reader Announcements

When `screenReaderAnnouncement: true` (default):
- Navigation start is announced
- Page title change is announced on completion
- Errors are announced

```javascript
yield actions.navigate(url, {
  screenReaderAnnouncement: true // Default
});
```

### Focus Management

The router attempts to manage focus appropriately:
- Focus moves to main content area after navigation
- Tab order is preserved within updated regions

### Browser History

- Back/forward buttons work correctly
- URL updates reflect navigation state
- Bookmarking works as expected

## Customizing Announcements

### Custom Announcements

The router's internal announcement text is not exposed via the store. To provide custom screen reader announcements during navigation, use WordPress's built-in `wp-a11y-speak-polite` live region or create your own:

### Manual Announcements

```javascript
store('myblock', {
  actions: {
    navigate: withSyncEvent(function* (e) {
      e.preventDefault();
      
      // Custom pre-navigation announcement
      announce('Loading page, please wait');
      
      const { actions } = yield import('@wordpress/interactivity-router');
      yield actions.navigate(e.target.href);
      
      // Custom post-navigation announcement
      announce('Page loaded');
    }),
  }
});

function announce(message) {
  const announcer = document.getElementById('wp-a11y-speak-polite');
  if (announcer) {
    announcer.textContent = message;
  }
}
```

### Disable Automatic Announcements

```javascript
yield actions.navigate(url, {
  screenReaderAnnouncement: false
});
```

When disabled, implement your own:

```html
<div role="status" 
     aria-live="polite" 
     aria-atomic="true"
     class="screen-reader-text"
     data-wp-text="state.announcement">
</div>
```

## Focus Management

### Moving Focus After Navigation

```javascript
store('myblock', {
  callbacks: {
    manageFocus() {
      const { state } = store('core/router');
      
      if (state.navigation.hasFinished) {
        // Find appropriate focus target
        const heading = document.querySelector('[data-wp-router-region] h1, [data-wp-router-region] h2');
        
        if (heading) {
          // Make heading focusable
          heading.setAttribute('tabindex', '-1');
          heading.focus();
          
          // Remove tabindex after blur to maintain natural tab order
          heading.addEventListener('blur', () => {
            heading.removeAttribute('tabindex');
          }, { once: true });
        }
      }
    }
  }
});
```

### Focus Trap for Modals

When using `attachTo` for modals:

```javascript
store('modal', {
  callbacks: {
    trapFocus() {
      const ctx = getContext();
      if (!ctx.isOpen) return;
      
      const modal = getElement().ref;
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      
      // Focus first element
      firstFocusable?.focus();
      
      // Trap focus
      modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey && document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        } else if (!e.shiftKey && document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      });
    }
  }
});
```

## Loading States

### Visual Indicators

Always pair visual loading states with accessible announcements:

```html
<div data-wp-interactive="posts"
     data-wp-router-region="posts-list"
     data-wp-class--is-loading="state.isNavigating"
     aria-busy="state.isNavigating">
  
  <!-- Loading overlay -->
  <div data-wp-bind--hidden="!state.isNavigating"
       role="status"
       aria-live="polite">
    <span class="screen-reader-text">Loading content</span>
    <div class="spinner" aria-hidden="true"></div>
  </div>
  
  <!-- Content -->
  <ul>
    <!-- Items -->
  </ul>
</div>
```

### aria-busy

Use `aria-busy` during content updates:

```html
<div data-wp-router-region="content"
     data-wp-bind--aria-busy="state.isNavigating">
```

### Progress Indicators

For longer operations:

```html
<div role="progressbar"
     data-wp-bind--hidden="!state.isNavigating"
     data-wp-bind--aria-valuenow="state.loadProgress"
     aria-valuemin="0"
     aria-valuemax="100"
     aria-label="Page loading progress">
</div>
```

## ARIA Live Regions

### Polite Announcements

For non-urgent updates:

```html
<div aria-live="polite" aria-atomic="true" class="screen-reader-text">
  <span data-wp-text="state.statusMessage"></span>
</div>
```

### Assertive Announcements

For critical updates (errors):

```html
<div aria-live="assertive" role="alert" class="screen-reader-text">
  <span data-wp-text="state.errorMessage"></span>
</div>
```

## Keyboard Navigation

### Navigation Links

Ensure all navigation triggers are keyboard accessible:

```html
<!-- ✅ Good - native keyboard support -->
<a href="/page/2" data-wp-on--click="actions.navigate">Next</a>

<!-- ✅ Good - button with keyboard support -->
<button type="button" data-wp-on--click="actions.navigate">Next</button>

<!-- ❌ Avoid - divs as buttons -->
<div onclick="...">Next</div>
```

### Custom Key Handlers

```javascript
store('myblock', {
  actions: {
    handleKeydown: withSyncEvent(function* (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const { actions } = yield import('@wordpress/interactivity-router');
        yield actions.navigate(getContext().targetUrl);
      }
    }),
  }
});
```

```html
<div role="button"
     tabindex="0"
     data-wp-on--click="actions.navigate"
     data-wp-on--keydown="actions.handleKeydown">
  Navigate
</div>
```

## Skip Links

Ensure skip links work after navigation:

```javascript
store('site', {
  callbacks: {
    updateSkipLinks() {
      const { state } = store('core/router');
      
      if (state.navigation.hasFinished) {
        // Ensure skip link target exists
        const main = document.getElementById('main-content');
        if (main && !main.getAttribute('tabindex')) {
          main.setAttribute('tabindex', '-1');
        }
      }
    }
  }
});
```

## Reduced Motion

Respect user preferences:

```css
/* Disable animations for users who prefer reduced motion */
@media (prefers-reduced-motion: reduce) {
  [data-wp-router-region] {
    transition: none !important;
  }
  
  .loading-bar {
    animation: none !important;
  }
}
```

```javascript
// Check preference in JavaScript
const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

yield actions.navigate(url, {
  loadingAnimation: !prefersReducedMotion
});
```

## Error Handling

### Announcing Errors

```javascript
store('myblock', {
  actions: {
    navigate: withSyncEvent(function* (e) {
      e.preventDefault();
      
      try {
        const { actions } = yield import('@wordpress/interactivity-router');
        yield actions.navigate(e.target.href);
      } catch (error) {
        // Announce error to screen readers
        state.errorMessage = 'Failed to load page. Please try again.';
        
        // Also provide visual feedback
        state.showError = true;
      }
    }),
  }
});
```

```html
<div role="alert"
     aria-live="assertive"
     data-wp-bind--hidden="!state.showError">
  <span data-wp-text="state.errorMessage"></span>
  <button data-wp-on--click="actions.retry">Retry</button>
</div>
```

## Testing Accessibility

### Manual Testing Checklist

- [ ] Tab through all interactive elements
- [ ] Test with screen reader (NVDA, VoiceOver, JAWS)
- [ ] Verify announcements during/after navigation
- [ ] Test with keyboard only (no mouse)
- [ ] Check focus visible state
- [ ] Test with high contrast mode
- [ ] Test with 200% zoom
- [ ] Verify skip links work after navigation

### Automated Testing

```javascript
// Example using axe-core
import axe from 'axe-core';

async function testAfterNavigation() {
  // Trigger navigation
  await actions.navigate('/test-page');
  
  // Wait for completion
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Run accessibility audit
  const results = await axe.run();
  
  if (results.violations.length) {
    console.error('Accessibility violations:', results.violations);
  }
}
```

## Best Practices Summary

1. **Keep default announcements enabled** unless you implement your own
2. **Always move focus** to main content or relevant heading after navigation
3. **Use semantic HTML** - anchors for links, buttons for actions
4. **Provide loading indicators** with both visual and screen reader feedback
5. **Use `aria-busy`** during content updates
6. **Test with real screen readers** - automated tools catch only ~30% of issues
7. **Respect `prefers-reduced-motion`** for animations
8. **Announce errors clearly** and provide recovery actions
9. **Maintain skip link functionality** across navigations
10. **Ensure keyboard accessibility** for all navigation triggers
