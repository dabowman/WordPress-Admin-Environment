# Directives Reference

Complete reference for all WordPress Interactivity API directives (6.9+).

## Namespace & Context

### data-wp-interactive

Activates interactivity for element and descendants. Required wrapper.

```html
<div data-wp-interactive="vendor/block-name">
  <!-- All children can reference this store -->
</div>
```

### data-wp-context

Provides local state scoped to element tree. Nested contexts merge (child overrides parent).

```html
<!-- JSON in attribute -->
<div data-wp-context='{"isOpen": false, "itemId": 42}'>

<!-- PHP helper (recommended - handles escaping) -->
<div <?php echo wp_interactivity_data_wp_context([
  'isOpen' => false,
  'itemId' => $item_id
]); ?>>
```

Access in JS: `getContext().isOpen`

## Attribute Binding

### data-wp-bind--[attribute]

Dynamically sets HTML attributes.

```html
<!-- Boolean: true adds attribute, false removes -->
<button data-wp-bind--disabled="state.isLoading">
<input data-wp-bind--checked="context.selected">
<div data-wp-bind--hidden="!state.isVisible">

<!-- String values -->
<img data-wp-bind--src="state.imageUrl">
<a data-wp-bind--href="context.link">

<!-- ARIA (booleans become "true"/"false" strings) -->
<button data-wp-bind--aria-expanded="context.isOpen">
<div data-wp-bind--aria-hidden="!state.visible">
```

### data-wp-class--[classname]

Toggles CSS class based on boolean. **Use kebab-case** (HTML attributes case-insensitive).

```html
<div data-wp-class--is-active="context.isActive">
<div data-wp-class--is-loading="state.loading">
<div data-wp-class--has-error="state.error">

<!-- Multiple classes -->
<div 
  data-wp-class--is-open="context.open"
  data-wp-class--is-animating="state.animating"
>
```

### data-wp-style--[property]

Sets inline CSS properties.

```html
<div data-wp-style--color="context.textColor">
<div data-wp-style--background-color="state.bgColor">
<div data-wp-style--transform="state.transform">
<div data-wp-style--opacity="context.opacity">
```

### data-wp-text

Sets text content. **Auto-escapes HTML** (XSS safe).

```html
<span data-wp-text="state.message"></span>
<p data-wp-text="context.title"></p>
<div data-wp-text="state.count"></div>
```

## Event Handlers

### data-wp-on--[event]

Synchronous event handler. Use when you need `event` object methods.

```html
<button data-wp-on--click="actions.handleClick">
<input data-wp-on--input="actions.handleInput">
<form data-wp-on--submit="actions.handleSubmit">
<div data-wp-on--mouseenter="actions.handleHover">
<input data-wp-on--keydown="actions.handleKey">
<input data-wp-on--change="actions.handleChange">
<input data-wp-on--focus="actions.handleFocus">
<input data-wp-on--blur="actions.handleBlur">
```

### data-wp-on-async--[event]

**Preferred.** Async handler yields to main thread immediately for better INP scores.

```html
<button data-wp-on-async--click="actions.logClick">
<div data-wp-on-async--mouseenter="actions.prefetch">
```

Use sync (`data-wp-on`) only when you need `event.preventDefault()`, `stopPropagation()`, or `currentTarget`.

### data-wp-on-window--[event]

Attach listener to window object.

```html
<div data-wp-on-window--resize="callbacks.handleResize">
<div data-wp-on-window--scroll="callbacks.handleScroll">
<div data-wp-on-window--keydown="callbacks.handleGlobalKey">
```

### data-wp-on-document--[event]

Attach listener to document object.

```html
<div data-wp-on-document--click="callbacks.handleOutsideClick">
<div data-wp-on-document--keydown="callbacks.handleEscape">
```

### Async Variants

```html
<div data-wp-on-async-window--scroll="callbacks.handleScroll">
<div data-wp-on-async-document--click="callbacks.handleClick">
```

## Lifecycle

### data-wp-init

Runs once when element mounts. Return function for cleanup.

```html
<div data-wp-init="callbacks.initialize">
```

```javascript
callbacks: {
  initialize() {
    const observer = new IntersectionObserver(/*...*/);
    observer.observe(getElement().ref);
    // Return cleanup function
    return () => observer.disconnect();
  }
}
```

### data-wp-watch

Runs on mount AND when referenced state changes. Return function for cleanup before next run.

```html
<div data-wp-watch="callbacks.syncExternal">
```

```javascript
callbacks: {
  syncExternal() {
    const { count } = getContext();
    externalLibrary.update(count);
    return () => externalLibrary.cleanup();
  }
}
```

### data-wp-run

Enables Preact hooks inside directive. For advanced patterns.

```html
<div data-wp-run="callbacks.useCustomHook">
```

```javascript
import { store, useState, useEffect } from '@wordpress/interactivity';

callbacks: {
  useCustomHook() {
    const [inView, setInView] = useState(false);
    useEffect(() => {
      const { ref } = getElement();
      const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting));
      obs.observe(ref);
      return () => obs.disconnect();
    }, []);
    return inView;
  }
}
```

## Iteration

### data-wp-each

Renders list from array. Must use `<template>` tag.

```html
<!-- Basic iteration -->
<ul>
  <template data-wp-each="state.items">
    <li data-wp-text="context.item.name"></li>
  </template>
</ul>

<!-- Custom variable name -->
<template data-wp-each--product="state.products">
  <li data-wp-text="context.product.title"></li>
</template>

<!-- With key for efficient updates -->
<template 
  data-wp-each--item="state.items"
  data-wp-each-key="context.item.id"
>
  <li data-wp-text="context.item.name"></li>
</template>
```

Each item gets `context.item` (or custom name) automatically set.

## Unique Directive IDs (6.9+)

Multiple directives of same type use triple-dash `---` suffix:

```html
<!-- Multiple watchers -->
<div 
  data-wp-watch---analytics="callbacks.trackView"
  data-wp-watch---logging="callbacks.logState"
>

<!-- Multiple click handlers from different namespaces -->
<button
  data-wp-on--click---plugin-a="pluginA::actions.handle"
  data-wp-on--click---plugin-b="pluginB::actions.handle"
>
```

## Cross-Namespace References

Reference other stores with `namespace::` prefix:

```html
<div data-wp-interactive="myPlugin">
  <!-- Reference shared cart store -->
  <span data-wp-text="shop/cart::state.itemCount"></span>
  <button data-wp-on-async--click="shop/cart::actions.addItem">
    Add to Cart
  </button>
</div>
```

## Server-Side Rendering Notes

- Directives processed both server-side (PHP) and client-side (JS)
- Initial HTML includes resolved values for SEO/performance
- Client hydrates and takes over reactivity
- Use `wp_interactivity_process_directives($html)` for non-block HTML
