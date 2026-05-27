# WordPress Extensibility API

WordPress 6.9 introduced an extensibility API for registering and unregistering actions and fields on entity-based DataViews in the WordPress admin. This allows plugins to customize the built-in Pages, Templates, and Patterns screens without forking core code.

## Overview

The extensibility API lives in `@wordpress/editor` and operates through the WordPress data store (`wp.data`). It works specifically with core's entity-based DataViews — the ones that display post types, taxonomies, and other WordPress entities.

**Important:** This API is for extending core admin views. If you're building your own DataViews from scratch, you don't need this — just define your fields and actions directly.

## Registering Custom Actions

Add custom actions to entity-based DataViews (post lists, page lists, etc.):

```jsx
// In your plugin's JavaScript:
import { store as editorStore } from '@wordpress/editor';
import { dispatch } from '@wordpress/data';

// Register a custom action for all posts:
dispatch(editorStore).registerEntityAction('postType', 'post', {
  id: 'my-plugin/export-pdf',
  label: 'Export as PDF',
  callback: async (items, { onActionPerformed }) => {
    const response = await apiFetch({
      path: `/my-plugin/v1/export-pdf`,
      method: 'POST',
      data: { postIds: items.map(i => i.id) },
    });
    window.open(response.downloadUrl);
    onActionPerformed?.(items);
  },
});

// Register for pages:
dispatch(editorStore).registerEntityAction('postType', 'page', {
  id: 'my-plugin/clone-page',
  label: 'Clone Page',
  supportsBulk: true,
  callback: async (items, { onActionPerformed }) => {
    for (const item of items) {
      await apiFetch({
        path: `/my-plugin/v1/clone/${item.id}`,
        method: 'POST',
      });
    }
    onActionPerformed?.(items);
  },
});
```

### Action Registration in PHP

For actions that need PHP-side logic, register the action in JavaScript but handle execution via REST API:

```php
// PHP: Register REST endpoint
add_action('rest_api_init', function() {
    register_rest_route('my-plugin/v1', '/clone/(?P<id>\d+)', [
        'methods' => 'POST',
        'callback' => 'my_plugin_clone_post',
        'permission_callback' => function() {
            return current_user_can('edit_posts');
        },
    ]);
});

function my_plugin_clone_post($request) {
    $post_id = $request['id'];
    $post = get_post($post_id);
    // Clone logic...
    return new WP_REST_Response(['id' => $new_post_id], 201);
}
```

```jsx
// JavaScript: Register the action
dispatch(editorStore).registerEntityAction('postType', 'post', {
  id: 'my-plugin/clone',
  label: 'Clone',
  callback: async (items) => {
    await apiFetch({ path: `/my-plugin/v1/clone/${items[0].id}`, method: 'POST' });
  },
});
```

## Unregistering Built-in Actions

Remove default actions from core DataViews:

```jsx
import { store as editorStore } from '@wordpress/editor';
import { dispatch } from '@wordpress/data';

// Remove "Move to Trash" from posts:
dispatch(editorStore).unregisterEntityAction('postType', 'post', 'move-to-trash');

// Remove "Duplicate" from pages:
dispatch(editorStore).unregisterEntityAction('postType', 'page', 'duplicate-post');
```

### Known Core Action IDs

These are the built-in action IDs you can unregister:

- `move-to-trash` — Move to trash
- `duplicate-post` — Duplicate post/page
- `view-post` — View on frontend
- `view-post-revisions` — View revisions
- `rename-post` — Rename
- `permanently-delete` — Permanently delete
- `restore` — Restore from trash
- `reset-template` — Reset template to default (templates only)

## Registering Custom Fields

Add custom fields/columns to entity-based DataViews:

```jsx
dispatch(editorStore).registerEntityField('postType', 'post', {
  id: 'my-plugin/word-count',
  type: 'integer',
  label: 'Word Count',
  getValue: ({ item }) => item.meta?.word_count || 0,
  enableSorting: true,
  render: ({ item }) => <span>{item.meta?.word_count || '—'}</span>,
});
```

## Unregistering Fields

```jsx
dispatch(editorStore).unregisterEntityField('postType', 'post', 'field-id');
```

## Timing: When to Register

Register actions and fields early in the WordPress admin lifecycle. Use the `wp.domReady` callback:

```jsx
import domReady from '@wordpress/dom-ready';

domReady(() => {
  dispatch(editorStore).registerEntityAction('postType', 'post', myAction);
  dispatch(editorStore).registerEntityField('postType', 'post', myField);
});
```

Or in your plugin's main script that loads in the editor context:

```php
add_action('enqueue_block_editor_assets', function() {
    wp_enqueue_script(
        'my-plugin-dataviews-extensions',
        plugins_url('build/dataviews-extensions.js', __FILE__),
        ['wp-data', 'wp-editor', 'wp-dom-ready'],
        '1.0.0',
        true
    );
});
```

## The @wordpress/views Package

WordPress 6.9 also introduced `@wordpress/views` for managing view state persistence using WordPress preferences:

```jsx
import { loadView, useView, useViewConfig } from '@wordpress/views';

// Load a saved view configuration:
const savedView = loadView('my-plugin/posts-view');

// Use view with automatic persistence:
const { view, isModified, updateView, resetToDefault } = useView('my-plugin/posts-view', defaultView);
// Changes are automatically saved to user preferences.
// isModified: true when view differs from default.
// resetToDefault(): resets the view back to the default you provided.

// useViewConfig — additional view configuration hook:
const viewConfig = useViewConfig('my-plugin/posts-view');
```

**Note:** `@wordpress/views` is a newer package and may have limited documentation. Check the Gutenberg repo for the latest API surface.

## Limitations

1. The extensibility API only works with entity-based DataViews in the WordPress admin — not with custom DataViews you build yourself.
2. Custom layout types cannot yet be registered by plugins.
3. The API operates through the WordPress data store, so it requires the full WordPress editor environment.
4. Field registration is limited — you can add columns but complex nested configurations may not work as expected.
5. The "PHP first" philosophy means Automattic targets ~80% of extensibility via PHP and 20% via JS for advanced cases. Expect more PHP-based extension points in future releases.
