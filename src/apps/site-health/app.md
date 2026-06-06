# core:site-health

Prose accompanying `app.json#documentation` for the site-health surface.

## Overview

SiteHealthApp is a two-tab Site Health surface (`@wordpress/ui` `Tabs`):

- **Status** — runs the synchronous **direct** tests server-side and the **async** tests client-side, rendering each as a card with a status pill (Good / Recommended / Critical) + a trusted HTML description. A count line summarizes direct + async results.
- **Info** — an accordion (`@wordpress/ui` `Collapsible`) over the full `WP_Debug_Data::debug_data()` report, with a **Copy site info** button.

Two correctness patterns carried over from the async-only version:

- **Per-test error fallback.** Each async test's `apiFetch` is wrapped in its own try/catch inside the `Promise.all`. A failing test renders as a `recommended` "A test is unavailable" card rather than rejecting the batch or scoring `critical` — mirroring classic (`site-health.js:333-349`), so a transient blip doesn't skew the result.
- **Authorization-header probe.** The `authorization-header` test is sent with an `Authorization: Basic dXNlcjpwd2Q=` header (mirroring `class-wp-site-health.php:2975`) so the server can observe whether it strips the header.

## Architecture

### Server-side endpoint

The bulk of the new capability lives in `includes/class-wp-admin-workspaces-site-health-rest.php`, which exposes two GET routes under `/wp-admin-workspaces/v1`, both gated on `current_user_can( 'view_site_health_checks' )` and run on demand (no caching):

- `GET /site-health/tests` — `require_once`s the wp-admin Site Health classes (REST context doesn't autoload them) and calls `WP_Site_Health::get_instance()->get_tests()` (which applies the `site_status_tests` filter). It runs each `['direct']` test synchronously — invoking the callback then applying the `site_status_test_result` filter (replicating `WP_Site_Health::perform_test()`'s body, since that core method is `private` and can't be called from the REST controller's scope; so plugin amendments classic honors aren't dropped — and resolves a string `test` to its `get_test_{slug}` method first, matching core's order), and returns the results as `direct[]`, plus an `async[]` **registry** (`{ id, label, has_rest }`) describing the async tests. This is the surface that de-hardcodes the client's test list and unblocks the ~22 direct tests + plugin extensibility.
- `GET /site-health/info` — returns `WP_Debug_Data::debug_data()`, normalized to `sections[]` where each section has `id` / `label` / `description` / `fields[]`, and each field carries `id` / `label` / `value` / `debug` / **`private`**. The `private` flag is preserved verbatim so the client can omit private values from the copy export.

### Client

`StatusTab`:

1. Fetch `/site-health/tests`. Store `direct` results; build the async test list from the `async` registry (filtering to `has_rest !== false`, since only REST-backed tests can be run from the browser). On failure, fall back to the static `FALLBACK_ASYNC_TESTS` list and skip the direct section.
2. `Promise.all` over the async tests against `/wp-site-health/v1/tests/{id}` (with the auth-header probe), streaming results in via per-test `setResults`.
3. Counts span both `directResults` and the streamed async `results`.

`InfoTab`:

1. Fetch `/site-health/info` on mount / run-token bump; centered Spinner while `sections === null`. As soon as `/info` resolves, **`setSections` immediately** with the base sections so the whole accordion paints right away — the `wp-paths-sizes` rows showing the `"Loading…"` placeholders core seeds for the uploads/themes/plugins/WordPress/database/total sizes. THEN fetch core's async `/wp-site-health/v1/directory-sizes` and, on success, `setSections` a second time with the merged result (`mergeDirectorySizes`) to patch the real sizes in. Rendering first matches classic `site-health-info.php`, which never blocks the report on the (potentially multi-second) disk walk core deliberately defers to a separate endpoint. The merge is resilient: if `directory-sizes` errors or is unavailable, the placeholder rows simply remain. (An `cancelled` flag guards both `setSections` calls so an unmount mid-fetch never sets state on an unmounted component.)
2. Render each section as a `Collapsible` accordion of label/value rows; private fields display a "Private" badge (they're shown, just flagged).
3. **Copy site info** builds a plain-text report from the sections via `formatInfoForClipboard`, which **skips any `private` field**, and writes it with `navigator.clipboard.writeText`. The clipboard API is guarded (insecure-context / rejection) with an error snackbar — the same no-clipboard fallback pattern as `MediaDetails`.

A shared `runToken` state in the root component bumps on the header action; the Status tab re-runs and the Info tab re-fetches keyed on it. A small `TestCard` component is shared by the direct + async lists.

## Rebuild guide

Patterns worth preserving:

- **Server-wrap admin-only PHP.** The direct tests and the debug report have no core REST surface — they're computed at wp-admin render and localized to the page. The workspace wraps the public `WP_Site_Health` / `WP_Debug_Data` methods in a custom endpoint (remembering to `require_once` the admin includes, which REST context doesn't autoload, and the update/misc/plugin helpers the direct tests pull in).
- **De-hardcode via a registry.** Don't ship a static test list — enumerate from `get_tests()` (which applies the `site_status_tests` filter) so plugin tests appear. Keep a static fallback for endpoint-unavailable resilience.
- **Respect `private` on export, not display.** Private debug fields are shown in the UI but excluded from the clipboard payload — the same split core makes.
- **Partial-result reporting + probe headers.** As before; treat async-test errors as `recommended` data, and keep the `Authorization: Basic` probe alongside the auth-header test.

A non-WPDS rebuild needs Tabs, Collapsible/accordion, Card, Badge, Button, Spinner, and dangerously-set-HTML (or equivalent) for trusted descriptions.

## Known limitations

- **No health-score donut / severity grouping.** The count line spans direct + async, but the classic score ring + Critical/Recommended/Passed sections with a collapsed "Passed" disclosure aren't reproduced yet.
- **Per-test `actions` not rendered.** The remediation HTML (`res.actions`) is still dropped; users can't act on a finding from the workspace.
- **Category badge collapsed into status.** The server-supplied `badge` (`{label,color}`, e.g. "Security"/"Performance") is ignored; the pill is derived from `status` only.
- **`page-cache` async test.** Production-gated server-side; still not in the list. The dynamic registry would surface it where applicable once `has_rest` is set.
- **No stale-cache write-back.** The `health-check-site-status-result` transient (dashboard widget + menu badge) isn't written.
- **HTTPS one-click migration** isn't implemented (no REST surface; classic-only action).
- **`view_site_health_checks` cap floor.** Subscribers can't see the screen — matches wp-admin.
- **Full-fidelity fallback.** `iframe:site-health.php` remains available as an escape hatch for everything not yet ported.
