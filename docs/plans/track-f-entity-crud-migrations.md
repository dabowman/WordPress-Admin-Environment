# Track F — Entity-CRUD Migration Sweep (F5)

**Status:** blocked on Track E
**Estimate:** 5 × ~1d (parallelizable into 5 sub-tracks after E lands)
**Dependencies:** Track E (LABELS-table pattern, view-resync useEffect, fallback-slim convention)
**Branch base:** `feat/c2-postsapp-hardening` post-merge (or `main` once both C2 + E land)

## Goal

Migrate the five remaining entity-CRUD apps to consume `useViewConfig`, matching PostsApp's post-E shape. Each app's structural DataViews config moves to JSON (`app.json#viewConfig` + optional `viewConfigFallback.js` if needed); React-side keeps the action callbacks, modal contents, and label table.

Once all five migrate, every wp-admin-shaped entity list in the shell is cascade-overridable from admin.json + filters. Future plugin authors get full DataViews customization for free.

## Five sub-tracks

Each is independently mergeable; agents can claim one each.

| Sub-track | App | Entity triple | Estimate | Notable divergence |
|---|---|---|---|---|
| **F.1** | `core:taxonomy` | `(taxonomy, *)` (category / post_tag / custom) | ~1d | hierarchical for category; create/edit/delete terms inline |
| **F.2** | `core:users` | `(root, user)` | ~1d | bulk-delete with reassign-to-user modal; self-delete guard |
| **F.3** | `core:comments` | `(root, comment)` | ~1d | `partial-update` for approve/spam/trash status changes |
| **F.4** | `core:plugins` | `(root, plugin)` | ~1d | activate/deactivate via REST (not entity save) |
| **F.5** | `core:themes` | `(root, theme)` | ~1d | singleton-active; "Activate" is one-of-many |

## Shared scope (every sub-track does these)

**In:**
- Wrap inline DataViews `fields` / `actions` / `defaultView` / `defaultLayouts` declarations into a JSON-only `viewConfig` block on `app.json`.
- Replace inline `useState({ view shape })` with `useViewConfig(kind, name, variant)` consuming the cascade.
- Build per-app `FIELD_LABELS` + `ACTION_LABELS` tables (i18n recipe from Track E).
- Build per-app field-renderer + action-callback tables keyed by id. Renderers stay in `index.js`.
- Add view-state resync `useEffect` keyed on `[ kind-config, variant ]` (recipe from Track E).
- Title dedup pattern (strip `titleField` from `view.fields`, recipe from PostsApp).
- Update each app's `app.md` + `app.json#documentation.data.reads` to reflect the kernel-config view-config read.
- Optionally add the bundled `core:taxonomy` (etc) viewConfig baseline to `shells/developer-admin.json` to validate cascade overrides round-trip in the bundled demo.

**Out (per sub-track):**
- Consolidating into a shared `core:entity-list` renderer — that's a *downstream* refactor ("C2.5"), to be evaluated after all five complete and the pattern of divergence is visible.
- Changing the apps' user-facing behavior. Migration is parity-preserving; the only visible change is that admin.json can now override the spec.
- Adding new actions / fields beyond what the apps ship today.
- Bucket-level `fieldsRef` inheritance — feedback-deferred until 4+ migrations land.

## Files touched (per sub-track)

For app `core:<foo>`:

**Modified:**
- `src/apps/<foo>/index.js` — full rewrite of the DataViews mount; see PostsApp as the canonical reference
- `src/apps/<foo>/app.json` — add `viewConfig` block
- `src/apps/<foo>/app.md` — update Architecture + Translation recipe + parity-gap notes
- Possibly `shells/developer-admin.json` — declare an admin.json override to validate cascade end-to-end (optional)

**New (optional):**
- `src/apps/<foo>/viewConfigFallback.js` — only if the manifest baseline isn't sufficient as a fallback. Recommend skipping unless the app needs a runtime-computed default.

## Design notes (cross-cutting)

- **Action-callback shape.** Each app keeps its action callbacks in `index.js`, keyed by `spec.id`. Build a `callbacks = { edit: ..., spam: ..., trash: ... }` table; the action compiler attaches `compiled.callback = callbacks[spec.id]` or `compiled.RenderModal = modalRenderers[spec.id]` for actions that need confirm UI.
- **Per-app divergence stays per-app.** Taxonomy needs an inline create/edit-term modal — that's a JSX in `index.js`. UsersApp's reassign modal — same. CommentsApp's `partial-update` for status changes — invocation in the action callback, not in the spec. The C2 primitive just carries field/action *declarations*; behavior lives in the React layer.
- **Re-use STATUS_LABELS-style maps.** Each app that surfaces a categorical column (Comments: approved/pending/spam/trash; Plugins: active/inactive; Themes: active) defines its own value→label map; same shape as PostsApp's STATUS_LABELS.
- **Cap floor compatibility.** Each app's `capabilities[]` floor stays in the manifest. Cascade can't lower it. Users without the cap don't mount the app at all — view-config never runs.

## Per-sub-track checklist (use the same one for each)

- [ ] `app.json` declares `viewConfig` block with kind/name/fields/actions/defaultView/defaultLayouts
- [ ] `app.json#documentation.data.reads` lists the kernel-config view-config read first
- [ ] `index.js` imports `useViewConfig` + drops inline state seeds
- [ ] `FIELD_LABELS` + `ACTION_LABELS` tables present + applied via prefer-over-spec
- [ ] View-state resync `useEffect` present (keyed on the app's variant-axis config props)
- [ ] Title-dedup pattern applied (`titleField` stripped from `view.fields` at hydration)
- [ ] `viewConfigFallback.js` deleted (or kept structure-only if a runtime computed default is genuinely needed)
- [ ] `app.md` Architecture section + Translation recipe + parity-gap section updated
- [ ] Build + lint clean
- [ ] Browser smoke: app loads at its route, columns render, actions work, locale switch translates labels
- [ ] Optional: cascade override test — drop a temporary `viewConfigs.<kind>.<name>._default` block in developer-admin.json; reload; confirm the override wins

## Tests

- Manual browser smoke per app (existing test surface — no JSDOM mount yet, tracked in issue #30)
- Existing PHP suites stay green (no behavior change on the cascade side)

## Acceptance criteria

After all five sub-tracks land:

- [ ] Every entity-CRUD app reads its DataViews spec via `useViewConfig`
- [ ] All five apps' specs round-trip through the cascade (admin.json `viewConfigs.<kind>.<name>` overrides reach the rendered UI)
- [ ] Bundle of "what's left to migrate" is empty (no app still hardcodes a DataViews `fields`/`actions` array inline in JSX outside its viewConfig block)
- [ ] CLAUDE.md app table notes which apps consume view-configs

## Coordination

- Sub-tracks are mutually independent (each owns its own `src/apps/<foo>/*` dir).
- Conflicts with Track D (`src/runtime/registry/builtins.js`): both Track D and Track F may need to touch `builtins.js`. Track F only registers apps that already exist; no new entries. If Track D rewrites to the lazy shape first, F migrations don't need to change registration. If F lands first, D's rewrite picks up the migrated apps without trouble.
- Conflicts with Track C (`shells/developer-admin.json`): both may add `viewConfigs` entries. Append-only conflict at JSON-key level; rebase by hand if both target the same `(kind, name)` triple.
- Conflicts with Track E: F is *blocked* on E. Don't start sub-tracks until E lands and the LABELS-table pattern is documented in CLAUDE.md.

## Reference

- PostsApp post-E shape (`src/apps/posts/index.js`) is the canonical template. Copy structure, swap entity-specific logic.
- `docs/screens/<app>.md` for parity-gap notes (each existing app's `app.md` has them today; carry forward).
- C2 design memory: `project_c2_view_config_design`.
