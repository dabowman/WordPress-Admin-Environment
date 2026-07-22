# WP Admin Workspaces — Revised Kernel Spec (working draft)

> **Status:** Working draft. This document collects revisions to the runtime
> kernel that come out of an ongoing adversarial architecture review. Each
> section supersedes the correspondingly-named material in the master spec
> (`docs/wp-admin-workspaces-design-spec.md`) once it lands. Until a section is
> marked **Adopted**, the master spec remains authoritative.
>
> **Scope.** Kernel only — the DS-neutral runtime (`src/runtime/*` outside
> `engines/`) plus the PHP resolver/serialization pipeline that feeds it
> (`includes/cascade/*`, the boot-snapshot builder in `wp-admin-workspaces.php`).
> Engine- and app-level concerns are out of scope except where the kernel
> contract touches them.
>
> **Ground rules carried over from the master spec.**
> - The kernel stays design-system-neutral (key rule in `CLAUDE.md`; spec §3 + §13.1).
> - WordPress's own capability system (`current_user_can` / `user_can`) is the
>   only source of truth for authorization. Nothing here invents a parallel
>   permission model; it removes the ones that accreted.
> - Schema wins over prose when they disagree.

## Table of contents

1. [Capability gating](#1-capability-gating) — **Proposed**
2. _Region rendering & mount path_ — placeholder (TBD)
3. _Routing & URL-as-state_ — placeholder (TBD)
4. _Cascade & trust tiers_ — placeholder (TBD)
5. _Theming seam_ — placeholder (TBD)
6. _Config delivery & boot snapshot_ — placeholder (TBD)

> Sections 2–6 are reserved for findings still to be worked through. They are
> named so cross-references written now stay stable; their content is TBD.

---

## 1. Capability gating

**Supersedes:** master spec §11 ("Capabilities and permissions") and the
"four-layer" description in `CLAUDE.md`.

**Status:** Proposed. Not yet adopted. The **Rationale** subsection records the
findings that motivate the change; the **Target design** subsection is the
proposed end state; **Migration** sequences the work.

### 1.1 What exists today (as-built)

The current system is described as "four layers," but the implementation has
**more enforcement points, expressed in three different permission shapes**,
split across PHP and JS. Establishing this accurately is the point of the
review — the "four-layer" framing hides the real complexity.

**Server-side, authoritative:**

- **`WP_Admin_Workspaces_Permissions::user_passes()`** — the rich evaluator:
  AND-required app floor, then an OR-set of `capabilities[] ∪ roles[]`, plus
  `super-admin` magic and unknown-slug fail-closed.
- **`wp_admin_workspaces_prune_config_for_user()`** (`wp-admin-workspaces.php`) —
  runs `user_passes()` over every screen and menu node and **deletes
  unreachable ones from the config before it is serialized to the page.** This
  is the actual "the client never receives what it cannot reach" boundary. It
  is absent from the `CLAUDE.md` cap-gating summary despite being load-bearing.
- **Trust-tier enforcement** (`enforce_origin_tier()`) — shrink-only for
  `role`/`user` origins on `screens[].permissions`.
- **REST floors** — `/data-view` re-checks `user_passes()` (401/404/403);
  `core-data` returns its own 403s per entity; `/can/{cap}` answers single-cap
  runtime lookups.

**Client-side, advisory** (the nav code itself notes it is "no longer the
security boundary"):

| Point | Field read | Shape | Default |
| --- | --- | --- | --- |
| `shouldRenderRegion` (`Region.js`) | `region.capability` | single string | optimistic (missing → render) |
| `MountedApp` layer 2 | `app.capability` | single string | optimistic |
| `MountedApp` layer 3 | `sourceDef.capabilities[]` | array (AND) | optimistic |
| nav `itemPassesPermissions` | `screen.permissions` | OR-set, **caps only** | optimistic |
| `userCan` / `checkCan` | `window.wpAdminWorkspaces.capabilities` | `Map<slug,bool>` | optimistic |

So "can this user see X?" is expressed **four ways**: a rich
`{capabilities, roles}` OR-set (server), a flat `Map<slug,bool>` (client), a
v2-era single-string `capability` on regions/apps/menu-items, and a partial JS
re-implementation of the OR-eval that can read caps but not roles.

### 1.2 Findings (rationale)

- **F1 — The client re-derives a decision the server already made, and cannot
  do it correctly.** Because `prune_config_for_user` already ships only
  reachable screens/menu, `itemPassesPermissions` is dead for role-gated items
  (its own comment: "never reaches this code"). The client carries a caps-only
  OR-evaluator whose only distinct behavior is *failing* to evaluate roles.
- **F2 — Opposite default polarity between the halves.** The client is
  optimistic (unknown cap → show); the server is fail-closed (unknown cap →
  deny; empty perms → admin-only). An optimistically-rendered region can mount
  an app that then 403s — a built-in flicker/empty-state surface — and a reader
  of only the JS concludes the opposite of a reader of only the PHP.
- **F3 — `is_known_capability()` is a net-negative for correctness.** In the
  OR-set an unknown slug is skipped rather than passed to `user_can`; but
  `user_can` on a slug nobody holds already returns false, so for real caps the
  gate changes nothing. The one behavior it *does* change: a cap granted only
  via a `user_has_cap` / `map_meta_cap` filter (never `add_cap`, so absent from
  every role table) is deemed "unknown," so the code skips `user_can` and
  **denies a user who should pass** — and in the AND-floor it returns false
  outright. It trades a real fail-closed bug for author-typo diagnostics.
- **F4 — Two implementations of the trust-tier invariant.** `enforce_origin_tier()`
  ships; `enforce_trust_tiers()` is "the standalone test surface." The tests
  exercise a parallel implementation, not the shipping path — a coverage
  illusion and a drift risk.
- **F5 — Divergent empty-set semantics.** `user_passes()` has a floor-dependent
  branch (empty caps+roles → allow iff a floor gated the call) that `resolve()`
  claims to make unreachable by inflating empty → admin-only. Safe only by the
  discipline of always calling `resolve()` first.
- **F6 — `super-admin` is a magic value inside `roles[]`,** overloading a
  security-sensitive array with a sentinel the schema cannot distinguish from a
  real role of that name.
- **F7 — Minor.** `checkCan` caches transient network failures as a permanent
  `false` for the page's life; the cap-map enumerates the workspace's entire
  declared-cap vocabulary (with per-user booleans) into the page source.

### 1.3 Target design

**Principle: one permission model, evaluated once, on the server; the client
receives verdicts, not expressions.** WordPress's cap system stays the sole
source of truth. Defense-in-depth at the REST/`core-data` layer is retained
unchanged — the changes below target only the *client-side re-derivation* and
the *advisory cap-map*, neither of which is a security boundary.

#### 1.3.1 Single permission vocabulary

`screens[].permissions` — `{ capabilities: string[], roles: string[] }`,
OR-semantic, with the app manifest `capabilities[]` as an AND floor — is the
**only** permission expression an author writes. (Governance semantics,
trust tiers, and the deny-list are unchanged; see spec §11 / `docs/schema-sketch.md`.)

The single-string `region.capability`, `app.capability`, and menu-item
`capability` fields are **sugar**: at resolve time they normalize to
`{ capabilities: [ <value> ], roles: [] }`. After normalization the kernel
deals with exactly one shape. The sugar fields remain valid input (back-compat)
but are documented as shorthand, not a second system.

#### 1.3.2 Server stamps visibility; the client is dumb

The server already prunes unreachable **screens and menu nodes**. Extend the
same evaluation to the surfaces prune cannot remove — persistent chrome regions
and their apps (toolbar buttons, hubs, the user menu) — by stamping a resolved
boolean during serialization, mirroring how `dataView._resolved` is already
stamped:

- For every region and app instance in the serialized `client_config`, the
  boot-snapshot builder computes `user_passes()` once and stamps
  `region._visible` / `app._visible` (`false` only when the user fails; key
  absent ≡ visible, to keep the payload small).

The client render path collapses to a single check:

```js
// Region.js
if ( region._visible === false ) return null;
// MountedApp
if ( appInstance._visible === false ) return fallback;
```

This **deletes**, from the kernel:

- the cap-map builder (`wp_admin_workspaces_resolve_capabilities`) and the
  `window.wpAdminWorkspaces.capabilities` map,
- `userCan`'s map branch and `shouldRenderRegion`'s optimism rules,
- nav's `itemPassesPermissions` (prune already removed anything it would hide).

And it makes the client **strictly more correct**: it now honors roles,
OR-sets, and the app floor, because the server did the evaluation. F1 and F2
dissolve — there is no second evaluator and no polarity mismatch.

**Kept:** `/wp-admin-workspaces/v1/can/{cap}` (async `checkCan`) for genuinely
dynamic, resource-bound checks a static snapshot cannot precompute (e.g.
`current_user_can( 'edit_post', $id )`). This is the one legitimate
client→server capability query; it is not a rendering fast-path.

#### 1.3.3 Trust `user_can`; move typo-catching to lint time

Remove `is_known_capability()` from the runtime decision path. `user_passes()`
calls `user_can( $user_id, $cap )` directly for floor and OR-set caps.
`user_can` already denies unheld and typo'd slugs, and — unlike the current
heuristic — correctly *allows* filter-granted caps. (Fixes F3.)

Author-typo diagnostics, if wanted, move to a **build/validation-time** check:
validate cap slugs in a workspace against a captured registry snapshot during
`npm run test:schema` / the shape tests, not at runtime. A runtime that silently
hides a screen because a cap "looks unknown" is the friendliness bug we are
removing.

#### 1.3.4 Normalize empty-set and the super-admin sentinel

- `user_passes()` operates only on `resolve()`-normalized input (empty → admin-
  only), eliminating the floor-dependent empty-set branch. One rule everywhere.
  (Fixes F5.)
- Replace the `super-admin` magic string with an explicit
  `permissions.superAdmin: true` flag (or, minimally, reserve `super-admin` in
  the schema with validation). The resolver keeps routing it through
  `is_super_admin()`; the difference is that "super-admin membership" is no
  longer indistinguishable from a same-named role. (Fixes F6.)

#### 1.3.5 Minor hardening (F7)

- `checkCan` does not cache network failures — only definite `true`/`false`
  answers. A transient failure returns `false` for that call but is retried.
- With the cap-map deleted (1.3.2), the page source no longer enumerates the
  cap vocabulary; only per-surface `_visible` booleans for surfaces the user
  can already see ship.

### 1.4 Post-change model (summary)

- **One expression:** `screens[].permissions` (`{capabilities, roles}`) + app
  manifest floor. Single-string `capability` is sugar that normalizes to it.
- **One evaluator:** `user_passes()`, server-side, over `resolve()`-normalized
  input, using `user_can` directly.
- **One thing the client sees:** verdicts — pruned config + `_visible` booleans.
  No client-side permission expression, no cap-map, no second evaluator.
- **Defense in depth, unchanged:** REST/`core-data` 403 floors and `/can/{cap}`
  remain authoritative for data and dynamic checks.

### 1.5 Migration

Ordered by value / risk. Each step is independently shippable and testable; the
repo rule "add a fixture before fixing the next runtime-reader bug" applies.

1. **P1 — Drop `is_known_capability()` from the decision path (F3).** Highest
   leverage, lowest risk, self-contained. Fixture: a screen gated on a
   filter-granted cap must become reachable.
2. **P4 — Retire `enforce_trust_tiers()`; point the security-cascade tests at
   `enforce_origin_tier()` (F4).**
3. **P5 — Normalize empty-set + super-admin sentinel (F5, F6).**
4. **P3 — Normalize single-string `capability` → `{capabilities:[…]}` at resolve
   time.** Prerequisite for P2 to have one shape to stamp.
5. **P2 — Server-stamp `_visible`; delete the cap-map, `shouldRenderRegion`
   optimism, and `itemPassesPermissions` (F1, F2).** Largest change; do last.
6. **P-minor — `checkCan` failure-cache fix (F7).**

### 1.6 Open questions

- **Escape-hatch `regions`/`routes` and `commands`** are not pruned today
  (rarely role-gated; a command pointing at a pruned screen resolves to no
  route). Do they need `_visible` stamping under 1.3.2, or is
  "command resolves to nothing" a sufficient outcome?
- **Payload cost of `_visible` stamping** vs. the deleted cap-map. Expected net
  reduction (booleans on visible surfaces only vs. the full cap vocabulary), but
  measure against `docs/perf-baseline.md` on the largest bundled workspace.
- **`default-screen`** is always kept by prune so the kernel has a landing
  route; its app cap-gates itself. Confirm the stamped-`_visible` path preserves
  this invariant (a self-denying default-screen should still resolve, then the
  app renders its own denied state).
