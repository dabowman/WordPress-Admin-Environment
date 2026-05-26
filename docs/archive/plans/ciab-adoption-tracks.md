# CIAB Adoption — Parallel Track Index

**Date:** 2026-05-14
**Status:** C2 merged to `main` via PR #38. Remaining phases split into six parallel tracks below.

## Dependency graph

```
                                       [main — C2 merged, PR #38]
                                              │
                  ┌──────────┬─────────────┬──┴──────────┬───────────────┐
                  ▼          ▼             ▼             ▼               ▼
              Track A    Track B       Track C       Track D       Track E
              REST       Menu/Route    Dashboard     Lazy App      PostsApp
              Preload    Shims         Grid          Registry      Hardening
              (C1, 2d)   (C3, 3d)      (C4, 8d)      (C5, 6d)      (F1+F2+F4, 2d)
                                                                          │
                                                                          ▼
                                                                     Track F
                                                                     Entity-CRUD
                                                                     Migrations
                                                                     (F5, 5×1d
                                                                      parallel)
```

**Independent (start now, any order):** A, B, C, D, E.
**Gated:** F is blocked on E (i18n recovery pattern must land before second migration).

Within Track F, the five sub-migrations (taxonomy / users / comments / plugins / themes) are mutually independent and can run in parallel after E ships.

## Branching strategy

Every track branches from `main` and works in its own `git worktree` under `~/wpas-worktrees/track-<id>-<short>/`. Each opens its own PR. Final integration order doesn't matter — tracks are designed to not conflict on shared files except where called out in each plan's "Coordination" section. See `docs/plans/agent-prompts.md` for the worktree setup + `wp-env` coordination details.

## Track files

- [Track A — REST Preload](track-a-rest-preload.md)
- [Track B — Menu + Admin-Route Shims](track-b-menu-route-shims.md)
- [Track C — Dashboard Widget Grid](track-c-dashboard-grid.md)
- [Track D — Lazy App Registration](track-d-lazy-app-loading.md)
- [Track E — PostsApp Hardening (i18n + view resync + fallback slim)](track-e-postsapp-hardening.md)
- [Track F — Entity-CRUD Migration Sweep](track-f-entity-crud-migrations.md)

## Shared conflict surfaces

Tracks that all add a `require_once` to `wp-admin-shell.php` (A, B, C) — trivial merge resolution; just append in any order.

Tracks that all add a top-level block to `docs/schemas/admin-v2.json` (A) or `admin-app-v2.json` (C) — additive, low conflict.

Tracks that all bump `CLAUDE.md` status/test-counts — manual rebase pass per agent.

Tracks D + F both touch `src/runtime/registry/builtins.js` — D rewrites; F (per-app migrations) declares new apps. Coordinate by landing D first OR running F migrations against the new registry shape from the start (D defines an interim adapter that accepts both `render: Component` and `load: () => import()` shapes — F doesn't have to know the difference).

## Out of scope

- Native script modules + `.asset.php` build modernization — orthogonal to CIAB primitives, months of work.
- `@automattic/design-system` package adoption — engine-pluggability concern, separate refactor.
- Server-side menu prune — nothing to integrate; shell's 4-layer cap gating is strictly more capable than CIAB's inline `current_user_can()`.

## After all tracks land

Per Riad's framing (2026-05-13): shell's cascade absorbs every CIAB infra primitive. Remaining gaps vs CIAB are (a) native script modules (modernization, not a primitive) and (b) A8C-internal DS package adoption (engine-pluggability, separate refactor). Both deferred indefinitely.

Estimated total wall-clock with 4 parallel agents: ~10–12d (longest single track is C at 8d).
