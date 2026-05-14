# Track E — PostsApp Hardening (i18n + view resync + fallback slim)

**Status:** ready
**Estimate:** ~2d
**Dependencies:** none
**Branch base:** `main` (C2 merged via PR #38)
**Suggested branch name:** `feat/c2-postsapp-hardening`

## Goal

PostsApp has three C2 follow-ups (`docs/feedback.md` inbox, 2026-05-14):

- **F1 — Render-time `__()` mapping for labels.** Cascade ships English labels (JSON-only primitive). Recover translation via an in-app `LABELS = { id: __('...') }` table consulted during the build-fields / build-actions compile step. **Gate** before any other entity-CRUD app migrates so the regression doesn't repeat per app.
- **F2 — View-state resync on triple flip.** `useState` initializer runs once; when `config.postType` or `config.variant` change on the same hook instance, the resolved `viewConfig.defaultView` updates but local `view` keeps the prior triple's `perPage` / `sort` / `filters`.
- **F4 — Slim `viewConfigFallback.js`.** Manifest baseline now reaches the cascade at boot (`inject_app_baselines`); the React-side fallback is defense-in-depth. Once F1 lands the fallback's `__()` strings are redundant; slim or delete.

This track lands all three together because they all touch `src/apps/posts/index.js` and the cleanup follows naturally from F1.

## Scope

**In:**
- `LABELS` constant (or two: `FIELD_LABELS` + `ACTION_LABELS`) in PostsApp, keyed by id, wrapping `__()` calls.
- `buildFields` / `buildActions` prefer `LABELS[id]` over `spec.label` when present; spec wins when the id isn't in the table (plugin extension columns).
- `useEffect` resyncing `view` state when `postType` or `variant` change. Spread `VIEW_DEFAULTS` over the new resolved `defaultView`.
- Slim or delete `viewConfigFallback.js`. If keeping for the cap-fast-path / no-cascade edge case, strip `__()` strings (structure-only); if deleting, remove import + all reference sites.
- Update PostsApp `app.md`: remove the optimistic "Translation contract" framing; replace with "Translation recipe" describing the LABELS-table pattern.
- Update `docs/feedback.md` to move F1/F2/F4 from Inbox → Done.

**Out:**
- Migrating any other app (Track F).
- Render-time bundle of `__()` translations at module load (already what `__()` does).
- A shared `LABELS` table across apps (future deduplication — premature).

## Files touched

**Modified:**
- `src/apps/posts/index.js` — add `LABELS`, prefer-over-spec in buildFields/buildActions, view-resync `useEffect`
- `src/apps/posts/viewConfigFallback.js` — slim or delete
- `src/apps/posts/app.md` — Translation recipe section
- `docs/feedback.md` — move F1/F2/F4 to Done with this PR's SHA
- `CLAUDE.md` — `Recurring patterns to enforce in review` gains a new pattern: "Entity-CRUD apps wrap labels in `LABELS = { id: __('...') }` table for cascade-shipped specs; spec labels lose to LABELS when both define id."

## Design notes

- **`LABELS` shape.**
  ```js
  const FIELD_LABELS = {
    title:  __( 'Title',  'wp-admin-shell' ),
    status: __( 'Status', 'wp-admin-shell' ),
    author: __( 'Author', 'wp-admin-shell' ),
    date:   __( 'Date',   'wp-admin-shell' ),
  };
  const ACTION_LABELS = {
    edit:  __( 'Edit',          'wp-admin-shell' ),
    view:  __( 'View',          'wp-admin-shell' ),
    trash: __( 'Move to Trash', 'wp-admin-shell' ),
  };
  ```
- **Precedence.** App-side `LABELS[id]` wins over spec-side `spec.label` for ids the app *knows*. Plugin-extension ids the app doesn't know fall through to `spec.label` (which is whatever locale the plugin authored in — same caveat the spec calls out).
- **View resync.** `useEffect` keyed on `[ postType, variant ]` resets `view` to a fresh `{ ...VIEW_DEFAULTS, ...resolvedDefaultView }`. Use a ref-guard if mid-edit-state preservation matters (filtering then flipping postType currently throws away the filters; users won't notice for the first wave of migrations).
- **Fallback file.** Recommend deleting. The hook + manifest baseline always supplies a config; the fallback only fires if the cascade is literally empty for the triple, which only happens when the app is mounted under a shell that has no manifest discovery (test harness, malformed install). Replace with a one-line `const EMPTY = { fields: [], actions: [], defaultView: {}, defaultLayouts: {} }` if a safety net is desired.

## Implementation steps

1. **Add `FIELD_LABELS` + `ACTION_LABELS` constants** at the top of `posts/index.js`.
2. **Update `buildFields`.** Inside the per-spec map, change `compiled.label = spec.label` to `compiled.label = FIELD_LABELS[spec.id] ?? spec.label`. Drop the `elements: Object.entries(STATUS_LABELS)...` derivation lock and let it stay — `STATUS_LABELS` is separate (status *values*, not column labels).
3. **Update `buildActions`.** Same prefer-over-spec for action labels. Both regular labels and modal copy stay JSX-literal `__()` (modal text isn't keyed by id).
4. **View resync `useEffect`.**
   ```js
   useEffect( () => {
       setView( {
           ...VIEW_DEFAULTS,
           ...( viewConfig.defaultView || {} ),
       } );
   }, [ postType, variant ] );
   ```
   Doesn't depend on `viewConfig` directly to avoid re-resetting whenever the cascade re-resolves (e.g. after a per-triple filter mutates the doc shape mid-session).
5. **viewConfigFallback.** Delete the file. Remove imports + the five reference sites. The remaining `useViewConfig` return (`config: doc ?? {}`) returns an empty object when nothing is in the cascade; `buildFields([])` and `buildActions([])` cleanly produce empty arrays → DataViews shows its built-in empty state.
6. **app.md.** Replace the "Translation contract for the JSON baseline" section with a "Translation recipe" that documents the LABELS-table pattern + the precedence rule (LABELS wins over spec for known ids).
7. **CLAUDE.md.** Add a bullet under `Recurring patterns to enforce in review` documenting the LABELS-table convention so the next entity-CRUD migration copies it.
8. **Feedback inbox.** Move F1 / F2 / F4 to Done with the PR's commit SHA.
9. **Test.** PostsApp doesn't have unit tests today (issue #30 tracks JSDOM mount). Manual browser smoke: switch site language to `de_DE` (or any non-en locale that ships with WP), confirm DataViews column headers + action labels render in that locale.

## Tests

No automated tests beyond keeping schema + runtime suites green. Issue #30 still tracks JSDOM mount tests; F1/F2 land before that infrastructure exists.

## Acceptance criteria

- [ ] PostsApp column headers + action labels translate via `__()` regardless of admin.json content
- [ ] Switching `config.postType` from `post` → `page` on the same mount produces a clean view state (no stale filters/sort/perPage from prior triple)
- [ ] `viewConfigFallback.js` deleted (or slimmed); build + lint stay green
- [ ] CLAUDE.md gains the LABELS-table review pattern
- [ ] Feedback inbox F1/F2/F4 moved to Done
- [ ] Browser smoke: `de_DE` locale renders translated headers

## Coordination

- `src/apps/posts/index.js`: solo within this track. No other active track touches this file.
- `CLAUDE.md` recurring-patterns list: rebase if other tracks touch the section.
- `docs/feedback.md`: this track moves three items to Done; other tracks may add new Inbox entries. Append-only conflict; trivial merge.

## Reference

- Feedback inbox entries 2026-05-14: bucket-fieldsRef (defer), i18n-mapping (this track), fallback slim (this track), view resync N2 (this track).
- Spec §13 #7 "i18n contract — accepted regression" — keep the spec language; this track delivers the recovery recipe.
- WP i18n primer: https://developer.wordpress.org/plugins/internationalization/
