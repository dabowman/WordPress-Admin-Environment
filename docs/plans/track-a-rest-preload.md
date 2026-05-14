# Track A — REST Preload (C1)

**Status:** ready
**Estimate:** ~2d
**Dependencies:** none
**Branch base:** `feat/c2-view-config` (or `main` post-merge)
**Suggested branch name:** `feat/c1-rest-preload`

## Goal

Ship CIAB's REST preload middleware: a declarative `preload[]` block in admin.json that batches REST GETs server-side, ships responses inline via `wp.apiFetch.createPreloadingMiddleware`, and eliminates the round-trips `@wordpress/core-data` resolvers make on cold mount.

Biggest perf-per-LOC win in the CIAB-adoption plan.

## Scope

**In:**
- New `preload[]` top-level block in `admin-v2.json`. Each entry is `string` (path) or `[ path, method ]`.
- New PHP class `WP_Admin_Shell_Preload` that calls `rest_preload_api_request` on the cascade-resolved list and injects via `wp_add_inline_script` on the `wp-api-fetch` handle.
- Cascade merges additively across origins (no override semantics — preload is a strict union of all declarations).
- Per-origin contribution via the existing `wp_admin_shell_data_{origin}` filters (no new filter needed).
- New PHP test runner `run-preload-tests.php`.
- Spec §13 #9 + CLAUDE.md updates.

**Out:**
- Conditional preloads (only fetch when X is true) — author can use a filter callback.
- Cache-busting strategies — handled by WP's existing transient layer.
- Authentication-aware paths — `rest_preload_api_request` handles cookie auth already.

## Files touched

**New:**
- `includes/cascade/class-wp-admin-shell-preload.php`
- `tests/php/run-preload-tests.php`
- `tests/schema/fixtures/v2/admin/positive/04-preload.json`
- `tests/schema/fixtures/v2/admin/negative/07-preload-bad-shape.json`

**Modified:**
- `docs/schemas/admin-v2.json` — add `preload[]` top-level + `$defs/preloadEntry`
- `wp-admin-shell.php` — `require_once` for the new class + enqueue hook
- `CLAUDE.md` — extension points #9, test counts, file tree
- `docs/wp-admin-shell-design-spec.md` — §13 #9

## Design notes

- **Schema shape.** `preload: array<string | [string, string]>`. String form defaults to GET. Tuple form `[ "/wp/v2/users/me", "GET" ]` lets the author specify method when needed (CIAB doesn't support POST preloads either — sticking to CIAB shape for migration ergonomics).
- **Cascade.** Merge by concatenation across origins; site/role/user origins append their own preloads. `customizable` doesn't apply (preload entries don't carry a user-meaningful identity).
- **Where preloads fire.** PHP-side, on `admin_enqueue_scripts` for the shell page only, BEFORE the main `wp-admin-shell` script enqueue so the inline script lands first. Wrap in `try/catch` per entry so a single failing path doesn't break the whole bundle.
- **Schema-deduping.** Drop exact duplicates (string-match on path+method) before serializing to inline script.
- **No PHP runtime dependency between admin.json `preload[]` and the cascade.** The preload block is *additive*; it doesn't influence anything else in the resolved tree. Read after `WP_Admin_Shell_Resolver::resolve()` returns.

## Implementation steps

1. **Schema.** Add `preload` top-level property + `$defs/preloadEntry` (oneOf: string pattern `^/.+`, OR tuple `[string, "GET"|"POST"|"PUT"|"DELETE"|"PATCH"]`). Run `npm run test:schema`.
2. **Fixtures.** Positive: shell w/ 3 preloads (string + tuple). Negative: bad shape (`{ url: "..." }` object form rejected).
3. **PHP class.** `WP_Admin_Shell_Preload::collect( $config )` extracts + dedupes; `::inject()` calls `rest_preload_api_request` + `wp_add_inline_script`.
4. **Wire.** `wp-admin-shell.php` calls `WP_Admin_Shell_Preload::inject()` after `wp_admin_shell_get_active_config()` resolves, before the script enqueue.
5. **Tests.** `run-preload-tests.php`: cascade merge across origins, dedup, malformed entry skip, REST preload result shape.
6. **Docs.** CLAUDE.md status block + spec §13 #9 + extension points list update.

## Tests

PHP suite covering:
- Single-origin preload preserved
- Multi-origin preloads concatenated additively
- Duplicate path+method deduplicated
- Malformed entry (number, object) skipped without crashing
- `rest_preload_api_request` actually called with the merged list (mock with a counter)

Schema sweep:
- Positive fixture validates
- Negative fixture rejects

## Acceptance criteria

- [ ] Schema accepts string + tuple entries; rejects everything else
- [ ] PHP class collects, dedupes, and calls `rest_preload_api_request`
- [ ] Inline script lands before `wp-admin-shell` JS bundle
- [ ] Network panel: declared `/wp/v2/users/me` returns 200 from preloading middleware on first paint (no second request)
- [ ] Tests: schema sweep stays green; new PHP suite passes
- [ ] CLAUDE.md test count updated
- [ ] Spec §13 grows to 9 extension points

## Coordination

- `wp-admin-shell.php` `require_once` block: append-only; rebase if conflicting.
- `docs/schemas/admin-v2.json`: adds top-level `preload`; no conflict with Track C which adds `dashboardWidget` to admin-app-v2.
- `CLAUDE.md`: rebase test-count line if conflicting with other tracks.

## Reference

- CIAB source: `/Users/davidbowman/Github/ciab-admin/wordpress/plugins/ciab-admin/lib/pages/admin.php:76–118` (hardcoded list — model for the schema'd version).
- WP function: `rest_preload_api_request( $memo, $path )` in `wp-includes/rest-api.php`.
- Spec §13 #9 reservation slot (none today — append).
