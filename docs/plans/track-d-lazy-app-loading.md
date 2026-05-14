# Track D — Lazy App Registration (C5)

**Status:** ready
**Estimate:** ~6d
**Dependencies:** none (but coordinates with Track C on `builtins.js`)
**Branch base:** `main` (C2 merged via PR #38)
**Suggested branch name:** `feat/c5-lazy-app-loading`

## Goal

Today every bundled app's React component imports eagerly in `src/runtime/registry/builtins.js` — every page that mounts the shell pulls every app's code. Migrate the registry to accept `{ id, kind, load: () => import('./apps/posts') }` alongside today's eager shape. Webpack code-splits each `import()` into its own named chunk; mount-time logic awaits the load. Cold-mount bundle shrinks proportional to the number of apps not on the user's path.

Modeled on CIAB's route+content split — different mechanism (webpack dynamic `import()` vs CIAB's native `wp_register_script_module`), same outcome.

## Scope

**In:**
- Registry's `register()` accepts both eager `{ render: Component }` and lazy `{ load: () => Promise<{ default: Component }> }` shapes.
- Region mount path (`src/runtime/regions/mountApp.js`) awaits the load on first match; cached for subsequent renders.
- Loading-state UI while a chunk is in flight (small spinner; consumes Suspense or a thin manual fallback so the region doesn't flash).
- Webpack named chunk hints via `import(/* webpackChunkName: "app-posts" */ ...)` for human-readable build output.
- Migrate `builtins.js` to lazy shape for every app except always-mounted system apps (`core:navigation`, `core:site-hub`, `core:toolbar-actions`, `core:notices-banner`, `core:notices-snackbar` — keep eager).
- Tests for both registration shapes + mount-time loading behavior.
- Webpack config tweak (chunk naming + asset manifest pickup).

**Out:**
- Server-side preload of likely-next chunks (could pair with Track A's preload primitive later — not now).
- Native script modules + `.asset.php` migration. Months of work, separate track.
- App-internal code-splitting (apps can use `import()` themselves; this track only addresses the registry layer).

## Files touched

**Modified:**
- `src/runtime/registry/createRegistry.js` — accept `load`, store lazy registrations
- `src/runtime/registry/builtins.js` — flip ~16 of ~18 apps to lazy form
- `src/runtime/regions/mountApp.js` — await `load()` on first mount per app id
- `src/runtime/regions/Region.js` — Suspense boundary or equivalent loading-state contract
- `webpack.config.js` — chunk naming, possibly publicPath if not already set
- `wp-admin-shell.php` — script enqueue may need to allow webpack's chunk-loading runtime (already does; verify)
- `CLAUDE.md` — status, file tree, app table notes
- Existing runtime tests: `tests/runtime/registry-theme-provider.test.mjs` etc. may need to accept the new shape

**New:**
- `tests/runtime/registry-lazy-app.test.mjs` — pure ESM test of the registry's lazy resolution

## Design notes

- **Backwards-compatible registry.** A registration with `render: Component` works as today; a registration with `load: () => import(...)` resolves on demand. The registry stores both possibilities; `mountApp` checks and awaits when needed.
- **Cache by id.** First successful `load()` resolves a promise; subsequent `mountApp` calls for the same id return the cached component reference. No double-loading.
- **Always-eager system apps.** Apps that always mount in chrome (`core:navigation`, `core:site-hub`, `core:toolbar-actions`) gain nothing from lazy loading and would add a flicker. Keep them eager.
- **Webpack chunk naming.** Use the magic comment `/* webpackChunkName: "app-<id>" */` so `build/app-posts.js`, `build/app-users.js`, etc. emit. Helps the network panel + perf debugging.
- **Manifest matters more than ever.** Lazy apps don't have their JS in the boot bundle, but their `app.json` manifest still ships eagerly through PHP. Registry checks the manifest on `register()`; the `load()` reference is the React-component side only.
- **Loading-state UX.** Plain spinner positioned inside the region's content area. Don't shift layout — reserve space via `min-block-size` or render an invisible spacer for the first paint. Specific Suspense boundary per app mount keeps blast radius small.
- **Error boundary.** If `load()` rejects (404 chunk, parse error), surface an inline error in the region rather than crashing the whole tree.

## Implementation steps

1. **Registry contract.** Update `createRegistry.js` to validate the `{ load: Function }` shape. Store `{ id, kind, load, _resolved?: Component }`. Add `resolve( id ): Promise<Component>` that caches.
2. **MountApp.** `mountApp.js` either renders the cached component or kicks off `resolve()` + returns a loading boundary. Suspense + lazy() works if all bundled apps are ESM; otherwise hand-roll.
3. **Webpack.** Verify chunk-loading runtime is included (`@wordpress/scripts` defaults do this). Add chunk-name magic comments. Confirm `publicPath` resolves correctly from inside wp-admin (PHP enqueue may need to set `__webpack_public_path__`).
4. **Builtins migration.** Convert each app entry in `builtins.js` from `import PostsApp from '...'; register({ id: 'core:posts', kind: 'app', render: PostsApp })` to `register({ id: 'core:posts', kind: 'app', load: () => import('../../apps/posts') })`. Keep system apps eager.
5. **Loading + error UI.** Tiny `<AppLoading />` + `<AppLoadError />` components. Style with chrome-neutral tokens.
6. **Tests.** Pure-ESM test exercises:
   - register with `load` succeeds, `resolve` returns the component
   - second `resolve` returns the cached reference (identity check)
   - register with both `load` + `render` rejects with WP_Error-equivalent
   - `resolve` of unknown id throws / returns null cleanly
7. **Webpack output check.** Run `npm run build` and confirm `app-*.js` chunks emit. Document the new chunk surface in CLAUDE.md.
8. **Browser smoke.** Open shell, navigate to a previously-eager route, confirm the chunk loads on demand (Network panel).
9. **Docs.** Status block + app-shape note.

## Tests

- `tests/runtime/registry-lazy-app.test.mjs` — pure registry contract
- `tests/runtime/registry-theme-provider.test.mjs` may need adaptation if it constructs eager registrations
- Manual browser smoke: lazy chunk loads on demand; system apps stay in main bundle

## Acceptance criteria

- [ ] Registry accepts both eager + lazy shapes; rejects mixed (`{ render, load }` w/ both set)
- [ ] `mountApp` awaits `load()` on first mount, caches for subsequent
- [ ] Main bundle size measurably smaller (`npm run build` size diff)
- [ ] Network panel: navigating to `/posts` triggers a new chunk request the first time
- [ ] Errors during chunk load surface inline (mock by 404'ing the chunk)
- [ ] System apps (navigation/site-hub/toolbar-actions/notices) stay eager
- [ ] Tests green; new lazy-registry test added
- [ ] Bundle size noted in CLAUDE.md or `docs/v1-perf-baseline.md`

## Coordination

- `src/runtime/registry/builtins.js`: Track C adds new bundled apps. If C lands first, the new apps register through the eager `render:` shape and this track migrates them; if D lands first, C registers in lazy shape from the start.
- `src/runtime/regions/Region.js` + `mountApp.js`: shared with no other active track.
- `CLAUDE.md` file tree + app table: rebase.
- `webpack.config.js`: standalone change.

## Reference

- CIAB source: `wp-build/lib/templates/index.php:195-233` (per-route module registration). Different mechanism (script modules), same conceptual split.
- Webpack docs: https://webpack.js.org/api/module-methods/#magic-comments
- React.lazy + Suspense: https://react.dev/reference/react/lazy
