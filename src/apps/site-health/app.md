# core:site-health

Prose accompanying `app.json#documentation` for the site-health runner.

## Overview

SiteHealthApp runs WordPress's async site-health checks and reports results in a card list. Each card shows the test label + status pill (Good / Recommended / Critical) + a description sourced from the REST response (which is HTML, written by WordPress core, and trusted accordingly). The toolbar summarizes results into three category counts; clicking Re-run resets results and fires the checks again in parallel.

The interesting pattern is the **per-test error fallback**: each test's `apiFetch` is wrapped in its own try/catch inside the `Promise.all`. A failing test doesn't reject the whole batch — it renders as a `recommended` "A test is unavailable" card with a friendly description naming the test. This mirrors classic (`site-health.js:333-349`), which treats an unreachable test as a soft notice rather than a critical failure; scoring it `critical` would let a transient network blip skew the score. This is the right call because site-health is a diagnostic surface; users want partial results when some checks fail.

The `authorization-header` test is sent with an `Authorization: Basic dXNlcjpwd2Q=` probe header (mirroring `class-wp-site-health.php:2975`). The entire point of that test is to detect whether the server strips the header in transit, so the request must carry one — without it the result is meaningless.

## Architecture

Tests live in a module-scope `ASYNC_TESTS` array — five entries today (dotorg-communication, background-updates, loopback, https, auth-header). Each entry has an id + a translated label.

`runTests`:

1. Set `isRunning=true`, clear results, clear error.
2. `Promise.all(ASYNC_TESTS.map(async t => { try { const res = await apiFetch({ path, ...(t.id === 'authorization-header' && { headers: { Authorization: 'Basic dXNlcjpwd2Q=' } }) }); setResults(prev => ({ ...prev, [t.id]: res })) } catch (err) { setResults(prev => ({ ...prev, [t.id]: { status: 'recommended', label: __('A test is unavailable'), description: '<p>…could not be run.</p>' } })) } }))`.
3. Set `isRunning=false`.

The per-test `setResults` calls are intentional — results stream in as each request completes rather than waiting for all five.

Category counts: `Object.values(results).reduce((acc, r) => { if (r?.status && acc[r.status] !== undefined) acc[r.status] += 1; return acc; }, { good: 0, recommended: 0, critical: 0 })`. Bucket pattern with init values; trivial.

## Rebuild guide

Two patterns worth preserving:

- **Partial-result reporting.** Most async-batch UIs reject the whole batch when one request fails. Site-health is the rare case where partial results are useful — wrap each request in try/catch and treat errors as data, not exceptions. Score the failure as `recommended` ("unavailable"), not `critical` — classic does the same so a flaky test doesn't tank the health score.
- **Probe headers belong with the test.** The authorization-header test only means something if the request carries the `Authorization: Basic` header it's probing for. Keep the header alongside the test definition when rebuilding.
- **Stream results as they arrive.** `setResults(prev => ({ ...prev, [id]: res }))` mounted per request beats `await Promise.all().then(setResults)` — the user sees progress.

A non-WPDS rebuild needs Card, Badge (status pill with intent), Button, Spinner, and dangerously-set-HTML (or equivalent) for trusted descriptions.

## Known limitations

- **Static test list.** WordPress site-health has plugin-extensible tests via `site_status_tests` filter. The workspace ignores plugin-contributed tests; a future iteration could enumerate them via a `/wp-site-health/v1/tests` index endpoint.
- **No "Run all checks" / "Run only failing" granularity.** Always all-or-nothing.
- **No direct-test runner.** WordPress has direct tests (synchronous PHP checks) shown alongside async tests; the workspace only runs async tests.
- **No history.** Re-running a test discards the previous result; no diff or trend over time.
- **`view_site_health_checks` cap floor.** Subscribers can't see the screen. This matches wp-admin's behavior.
