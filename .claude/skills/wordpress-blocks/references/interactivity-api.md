# WordPress Interactivity API Reference

**Purpose:** This file is intentionally a stub. It covers only what a block author needs to *opt a block into* the Interactivity API. For directives, the store API, client navigation, async patterns, and server-side state registration, go to the dedicated `wordpress-interactivity` skill.

## What it is

The Interactivity API is WordPress core's standard way to add client-side behavior to a block's frontend. A small, declarative system (HTML `data-wp-*` directives bound to a reactive JS store) keeps interactive blocks consistent across themes, supports block-to-block communication, and stays compatible with core features like client-side navigation. Reach for it when a custom block needs real frontend interactivity; skip it for purely presentational blocks.

## When it fits

Use it for:
- Toggles, accordions, tabs, modals, dropdowns
- Forms with live validation or instant search results
- Shopping carts, wishlists, filters
- Block-to-block communication on the frontend

Don't use it for:
- Pure CSS hover or focus effects
- One-time page-load animations
- Wrapping a third-party JS library (enqueue traditionally)
- Static, non-interactive content

## Opting a block in

**`block.json`:**
```json
{
  "supports": { "interactivity": true },
  "viewScriptModule": "file:./view.js"
}
```

`supports.interactivity` also accepts an object for finer control: `{ "interactive": true, "clientNavigation": true }`.

**`package.json`** — the view script must be built as an ES module:
```json
{
  "scripts": {
    "build": "wp-scripts build --experimental-modules",
    "start": "wp-scripts start --experimental-modules"
  }
}
```

## Minimal end-to-end example

**`render.php`:**
```php
<div
  data-wp-interactive="namespace/toggle"
  data-wp-context='<?php echo wp_json_encode( [ 'isOpen' => false ] ); ?>'
  <?php echo get_block_wrapper_attributes(); ?>
>
  <button data-wp-on--click="actions.toggle">Toggle</button>
  <div data-wp-bind--hidden="!context.isOpen"><?php echo $content; ?></div>
</div>
```

**`view.js`:**
```js
import { store, getContext } from '@wordpress/interactivity';

store( 'namespace/toggle', {
  actions: {
    toggle: () => {
      const context = getContext();
      context.isOpen = ! context.isOpen;
    },
  },
} );
```

## Further reading

- `wordpress-interactivity` skill — full directive reference, store API (state/actions/callbacks), derived state, async patterns, `withSyncEvent`, client-side navigation via the Interactivity Router, and accessibility.
- `wordpress-plugin-development/references/content-apis.md` — server-side state and config registration (`wp_interactivity_state()`, `wp_interactivity_config()`, `wp_interactivity_data_wp_context()`).
