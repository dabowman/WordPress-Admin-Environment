# core:plugins

Prose accompanying `app.json#documentation` for the plugin manager.

## Overview

PluginsApp lists every installed plugin and surfaces the activate / deactivate / delete actions with `activate_plugins` capability gating. Unlike most DataViews apps in the shell, the read is one-shot — there's no server-side pagination (REST returns the full list in a single request), so search + status filter run client-side against `data` in `useMemo`. This is fine because plugin counts are typically tens, not thousands.

Mutations split between two layers:

- **Reads** go through `core-data`'s `useEntityRecords('root', 'plugin')` so the entity layer caches the full list.
- **Writes** go through `apiFetch` directly because the plugin endpoint accepts a `{ status }` PATCH shape that doesn't map cleanly to `saveEntityRecord`. After each mutation, `invalidateResolution('getEntityRecords', ['root', 'plugin', query])` is fired manually so the entity layer refetches.

## Architecture

The client-side filter compares against the search string in name + stripped description. `stripTags()` runs once at projection time. The status filter accepts both array (`isAny`) and scalar (`is`) operator shapes.

Error handling is **terminal**: when a mutation fails, the app replaces the table with an error notice and stays there until the next action attempt clears it. This is more conservative than other DataViews apps in the shell (which surface dismissible banners) — plugin-state corruption is high-consequence enough that a noisy error feels right.

Plugin paths (`hello-dolly/hello.php`) carry slashes; `encodeURIComponent` is mandatory before interpolating into the REST path.

## Rebuild guide

The architectural pattern worth preserving: **single-shot read + manual invalidation on write**. For a non-`core-data` rebuild:

- Issue one `GET /wp/v2/plugins?context=edit` on mount; cache the response.
- Run search + filter client-side against the cached list.
- On activate/deactivate/delete, fire the REST call, then **refetch** (not patch the local cache — let the server be the source of truth).
- During refetch, the table can either show the previous state (optimistic) or a spinner (pessimistic). Shell uses the latter via `isLoading`.

A non-WPDS rebuild needs the standard DataViews equivalents plus an error banner primitive.

## Known limitations

- No install / upload flow — only manage what's installed. wp-admin's "Add new" + zip-upload paths aren't ported.
- No update flow. WordPress shows an "Update available" indicator + bulk update; the app reads `version` but doesn't compare against the .org repository version.
- Network-active deactivation falls through the multisite delegation chain; we don't verify the multisite path actually completes.
- The activate path doesn't surface a fatal-error rollback. If activation triggers a PHP error, WordPress traps it and returns `update`/`network_active` state; we don't currently parse that response to show a contextual error.
