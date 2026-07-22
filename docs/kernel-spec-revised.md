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
4. [Cascade & trust tiers](#4-cascade--trust-tiers) — **Proposed** (CAS-1, CAS-2, CAS-4, CAS-5; CAS-3, 6–11 recorded)
5. _Theming seam_ — placeholder (TBD)
6. _Config delivery & boot snapshot_ — placeholder (TBD)

> Sections 2, 3, 5, 6 are reserved for findings still to be worked through. They
> are named so cross-references written now stay stable; their content is TBD.

---

## Cross-cutting principles

Principles that span sections. Findings reference these by id instead of
restating the rationale.

**CC-1 — One invariant, one implementation; tests target the shipping path.**
When a rule is enforced in two places, or its enforcer has a mirror (a "what is
allowed" describer, a parallel "test surface" method), the copies drift: one
gets a fix the other misses, and the divergence is invisible until it ships a
wrong answer. The rule:

- A given invariant has exactly **one** implementation. A second view of it
  (an inverse "describe" surface, a boot-time projection) must be **derived from
  that same implementation**, not re-authored alongside it.
- Where redundant guards exist for defense-in-depth, they must encode the **same
  policy** — a stricter guard silently preempting a looser one is a bug, not
  depth (see §4 CAS-4).
- Tests exercise the code path that actually runs in production, never a
  parallel method that merely resembles it.

Referenced by: §1 **F4**, §4 **CAS-4**, §4 **CAS-5**.

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

---

## 4. Cascade & trust tiers

**Supersedes:** master spec §10 ("Origin cascade") and the merge/`customizable`
mechanics in `docs/schema-sketch.md` §4.4 once adopted. Complements — does not
replace — the trust-tier prose in `CLAUDE.md`.

**Status:** Proposed. This draft fully specs **CAS-1** (trust-tier source of
truth), **CAS-2** (in-place `customizable` evaluation), and **CAS-4 / CAS-5**
(the redundant-permissions-guard and the describe/enforce mirror — both
instances of **CC-1**). **CAS-3, CAS-6–CAS-11** are recorded in §4.2 as a
findings backlog and are not yet specced — they are kept here so the review work
isn't lost and cross-references stay stable.

### 4.1 What exists today (as-built)

Six origins merge in fixed precedence (low → high): `core → engine → plugin →
site → role → user`, in two phases (`WP_Admin_Workspaces_Resolver::resolve_with`):

- **Trusted phase** — `core`/`engine`/`plugin`: per-origin filter → origin-tag →
  `merge_authoritative` (enumeration is canonical; omitted keyed-array entries
  become `__removed` tombstones consumers can't resurrect).
- **Consumer phase** — `site`/`role`/`user`: per-origin filter →
  `Customizable::filter_doc` (deny-list + per-field allowlist) →
  `Permissions::enforce_origin_tier` (shrink-only perms) → origin-tag → merge
  (`site` = `merge_with_tombstones`, additive + tombstones honored; `role`/`user`
  = plain `merge`, additive + tombstones no-op).
- Then the `wp_admin_workspaces_data` filter → strip origin tags → stamp each
  screen's `dataView._resolved`.

The merge engine is field-aware (scalars replace, objects deep-merge, keyed
arrays merge by `id`/`slug`/`name`, plain arrays replace) with three flavors and
`null` / `{id,__tombstone:true}` / `__origin:"__removed"` removal markers. The
resolver memoizes through `WP_Admin_Workspaces_Cache`; the key fingerprints
workspace slug + every origin's on-disk/option/user-meta signal (per-user).

### 4.2 Findings

Fully specced in this draft:

- **CAS-1 — The trust-tier split is triplicated across three classes with
  divergent `site` membership.** `Resolver` classes `site` as a **consumer**
  (Phase 2, additive merge); `Permissions` and `Customizable` class it as
  **trusted** (`ADD_REMOVE_ORIGINS` / `TRUSTED_ORIGINS` both include it). The
  design is coherent — *site is trusted content, merged additively so it can't
  wipe the baseline by omission* — but it lives as three independently-authored
  constant lists with no shared definition. A maintainer adding a fourth
  governance gate has even odds of copying the wrong list and mis-tiering `site`.

- **CAS-2 — `customizable` enforcement flattens the doc to dotted strings, then
  spends ~120 lines repairing the shape it destroyed.** `filter_v3_block`
  flattens a consumer patch to dotted leaves, filters, and rehydrates via
  `dot_set`; because the flatten keys keyed-lists by id, rehydration turns
  `commands: [{id}]` (list) into `commands: {id:…}` (map), which the next merge
  sees as a shape mismatch and **replaces the whole base list** (shipped as a
  corruption bug — the `filter_v3_block` comment cites "PR #61 review finding
  #1"). `collect_list_shapes` / `restore_list_shapes` / `LIST_INDEX_SENTINEL` /
  longest-path-first re-listification exist only to undo that. See §4.3.2 for the
  provenance — this machinery is a reaction to a discovered bug, not a design.

- **CAS-4 — The permissions guard is doubled, the two copies encode *conflicting*
  policies, and the stricter one silently wins — voiding a documented ability.**
  Consumer writes to `screens[].permissions` pass two guards in order:
  `Customizable::filter_doc` (the `screens.*.permissions` **deny-list** — blocks
  *all* consumer perms writes) then `Permissions::enforce_origin_tier` (the
  **shrink-only** rule — removals allowed, additions rejected). The deny-list
  runs first and strips every perms write, so `enforce_origin_tier` sees nothing
  to shrink and is inert in the normal path (it only fires under the
  `customizable_bypass`). Two consequences: (a) the CLAUDE.md-documented "role/
  user … can REMOVE caps/roles from `screens[].permissions`" **does not work** —
  removals are deny-listed alongside additions; (b) the *tested* method is
  `enforce_trust_tiers`, a parallel implementation that is not on the pipeline
  (this is exactly **F4** from §1). A CC-1 violation on two axes at once.

- **CAS-5 — `describe_writable_paths` is a hand-authored mirror of `filter_doc`
  enforcement.** The Abilities API advertises "what a consumer may write" from
  `describe`, while `filter_doc` decides "what actually gets written." Two
  walkers (`collect_decl_paths` vs `path_is_allowed` + `collect_leaves`) that the
  code comments admit must "mirror … exactly." If enforcement changes and
  describe doesn't, the AI-facing surface lies about what a write will accept. A
  CC-1 violation (a derived view re-authored instead of derived).

Recorded, not yet specced (backlog — sharpest first):

| ID | Finding | Class |
| --- | --- | --- |
| CAS-3 | Cache invalidation is opt-in for imperative/request-varying contributors (default signals cover disk+option+user-meta only); cache-hit skips all filters, freezing request-varying filters at warm time. | reliability |
| CAS-6 | Keyed-array key detection is positional/heuristic — first entry decides; a leading no-id entry (e.g. a separator) makes the whole list "plain" → replace not merge; mixed key fields across origins → silent duplicates. | correctness |
| CAS-7 | `[]`/`{}` can't express "clear to empty" (indistinguishable post-`json_decode`); removal is tombstone-only — an undocumented expressiveness gap. | correctness |
| CAS-8 | Three removal representations (`null` key, `{id,__tombstone}`, `__origin:"__removed"`) on separate code paths; `__*` tags are in-band metadata sharing the author key namespace. | consolidation |
| CAS-9 | The dotted-path deny-list is sound only because every id in a deny-pattern path is schema-constrained to exclude `.`; an undocumented coupling with no asserting test. | latent coupling |
| CAS-10 | Merge flavor is two booleans (4 combos, 3 valid); the incoherent 4th is reachable via a `null`-default in `merge_keyed_arrays`. A single `mode` enum is unrepresentable-wrong. | simplification |
| CAS-11 | First-role-wins for multi-role users in `role_origin` / `active_workspace_slug` (documented non-goal). | limitation |

> CAS-4, CAS-5, and §1's **F4** are all instances of **CC-1** (one invariant, one
> implementation; tests target the shipping path). Their target designs (§4.3.3,
> §4.3.4) resolve the specific duplications; CC-1 is the general rule.

### 4.3 Target design

#### 4.3.1 CAS-1 — One trust-tier definition, imported everywhere

Introduce a single owner of the origin/tier vocabulary — e.g.
`WP_Admin_Workspaces_Origins` — exposing the canonical lists and the semantics
each tier gets, and have `Resolver`, `Permissions`, and `Customizable` read from
it instead of declaring their own constants:

```
Origins::ALL              // [core, engine, plugin, site, role, user] (precedence order)
Origins::AUTHORITATIVE    // [core, engine, plugin]      — merge_authoritative
Origins::TRUSTED          // [core, engine, plugin, site] — author doc shape; exempt from per-field / may add perms
Origins::CONSUMER         // [role, user]                — per-field enforced; shrink-only perms
Origins::merge_mode( $origin )  // authoritative | additive_tombstones | additive
```

The key move is that **the `site` straddle becomes explicit and documented in
one place**: `site ∈ TRUSTED` (governance) but `site ∉ AUTHORITATIVE`
(merge sequencing / additive) — the two facts that today are only discoverable
by reading three files and noticing they disagree. Each consuming class asks
`Origins` the question it needs (`is_trusted`, `merge_mode`, `is_consumer`)
rather than testing membership in a locally-defined list. No behavior change;
this is a refactor that removes the divergence surface. Pin it with a test that
asserts the three former constant sets equal the `Origins` projections, so a
future edit to one can't silently re-diverge.

#### 4.3.2 CAS-2 — Evaluate `customizable` in place; never flatten data

**Provenance (why it's built the way it is).** The enforcement *rules* are
path-shaped by deliberate design — the deny-list is dotted patterns
(`screens.*.permissions`) and `customizable` allowlists are dotted paths
(`customizable: ["tools.items.import.label"]`), mirroring theme.json
block-supports. `collect_leaves` flattens the *data* into the same path-space so
both checks reduce to string comparisons ("the result keys carry the FULL dotted
path so deny-pattern matching + allowlist comparison can operate on global paths
uniformly"). That was sound at its original M2 scope, where enforcement ran only
over a single shallow `settings.applications[id]` / `settings.regions[id]` entry
(`filter_writes`). v3 generalized the same flatten-to-paths mechanism to the
whole doc (`filter_v3_block`), where it first met lists of keyed objects
(`commands[]`) — and rehydration's list→map lossiness surfaced as the PR #61
corruption. The list-shape machinery is the patch for that, not a design.

**The contract does not change.** Deny-list patterns and `customizable`
declarations stay exactly as authored — dotted paths, same semantics
(`true` / `false` / path-allowlist, default-deny, deny-list beats allowlist,
shallowest declaration wins). This is purely an internal evaluator swap.

**Target: a single in-place traversal.** Walk the consumer patch tree recursively
while carrying the current dotted path as a descent parameter. At each node:

1. Compute this node's dotted path (parents already known from the descent; a
   keyed-list child contributes its `id`/`slug`/`name` value as the next
   segment — the *same* segment the current flatten produces, so path-space
   matching is byte-identical).
2. If the path matches `DENY_PATTERNS` → drop this node (and its subtree); log.
3. Else consult the closest ancestor `customizable` declaration (the walker
   already holds the ancestor chain) → allow / keep-walking / allowlist-match,
   exactly as `path_is_allowed` does today.
4. Kept nodes are copied into the output **in their native shape** — a list
   child stays a list, a map child stays a map. Because nothing is flattened,
   nothing is rehydrated, and there is no list→map corruption to repair.

This **deletes** `collect_list_shapes`, `restore_list_shapes`,
`LIST_INDEX_SENTINEL`, the longest-path-first ordering constraint, and the
flatten/rehydrate pair in `filter_v3_block` — roughly 120 lines and the
cascade's most intricate ordering hazard. `path_matches_any_pattern` /
`glob_match_segments` (the rule matcher) and the deny/allowlist declarations are
retained unchanged.

**`describe_writable_paths` (CAS-5) rides the same traversal** — see §4.3.4.

#### 4.3.3 CAS-4 — One permissions guard, one policy, tested on the live path

This is a **CC-1** fix. Today two guards claim `screens[].permissions` and
disagree; resolving it is first a **policy decision**, then a de-duplication.

**Decide the policy (open — see §4.5).** What may a consumer origin (role/user)
do to a screen's `permissions` OR-set?

- **Option A — Locked (deny all).** Consumers cannot touch `permissions` at all;
  to restrict a role's reach, use `hidden: true` or role-config screen removal.
  This is what the code *actually does today* (the deny-list wins). Simplest;
  matches the "security gate survives even `customizable`" intent.
- **Option B — Shrink-only (the documented behavior).** Consumers may *remove*
  caps/roles (which only makes a screen harder to reach — safe, non-escalating)
  but never add. This is what CLAUDE.md and `enforce_origin_tier` describe, and
  what does *not* currently work because the deny-list preempts it.

The two are a real fork: removing from an OR-set is provably non-escalating, so
B is defensible governance; A is stricter and simpler. **The spec does not
pick — the owner does.** Whichever wins, there is exactly one guard afterward:

- **If A:** delete `enforce_origin_tier` *and* the parallel `enforce_trust_tiers`
  entirely. The `screens.*.permissions` deny-list is the sole guard. Correct
  CLAUDE.md / `docs/schema-sketch.md` to state "consumers cannot modify
  `permissions`."
- **If B:** the deny-list can no longer be a blanket path match (it can't express
  "removals only"). Move the shrink-only decision into the single permissions
  enforcer, run it where the deny-list does *not* preempt it, and drop the
  blanket `screens.*.permissions` deny entry in favor of the enforcer's
  add-rejecting intersection. `enforce_trust_tiers` is deleted regardless.

**Test on the live path.** Whichever guard survives is the one the security
cascade tests exercise (`run-security-cascade-tests.php`). Delete the untested
parallel method so no test can pass against code that never runs (CC-1).

#### 4.3.4 CAS-5 — Derive `describe` from the enforcer, don't mirror it

Extract the per-node rule decision — *given a dotted path and the upstream
declaration chain, return `allow` / `deny` / `{mode: exact|subtree}`* — into a
single function, and have **both** callers drive it from the CAS-2 in-place
traversal (§4.3.2):

- **enforce** (`filter_doc`) walks a consumer *patch*, calls the decision per
  node, keeps the allowed subtree.
- **describe** (`describe_writable_paths`) walks the merged *doc*, calls the same
  decision per node, emits a `{path, mode}` wherever it returns an allow.

One rule function, one traversal, two thin callers. `collect_decl_paths` is
deleted; describe and enforce become structurally incapable of drifting because
they share the decision. Pin with a test asserting that for a corpus of docs,
every path `describe` reports as writable is in fact accepted by `filter_doc`,
and every path it omits is rejected — the parity that is currently only a
comment.

### 4.4 Migration

1. **CAS-1 first** — cheap, no behavior change, clarifying. Add `Origins`, point
   the three classes at it, add the equivalence test. Unblocks every later
   cascade change by giving trust-tier questions one answer.
2. **CAS-2** — build the in-place evaluator behind the existing `filter_doc`
   signature. Gate the swap on a **differential test**: feed the current corpus
   of consumer patches through both the old and new evaluators and assert
   identical surviving output on all non-corrupting cases, plus explicit
   correct-shape assertions on the `commands[]` / `preload[]` / `routes[]`
   list cases the old path corrupted. Add the list-shape fixtures **before** the
   swap (repo rule: fixture precedes the fix). Delete the repair machinery only
   once the differential test is green.
3. **CAS-4** — resolve the policy fork (§4.5) first; it decides whether guards
   are deleted (Option A) or restructured (Option B). Either way, delete
   `enforce_trust_tiers` and ensure `run-security-cascade-tests.php` targets the
   surviving guard. Independent of CAS-2, but the CAS-5 unification (step 4) is
   cleaner once CAS-2's in-place traversal exists.
4. **CAS-5** — build on CAS-2's traversal: extract the shared rule-decision
   function, route `filter_doc` and `describe_writable_paths` through it, delete
   `collect_decl_paths`, add the parity test. Do after CAS-2.

### 4.5 Open questions

- **CAS-2 output ordering.** The current rehydrate reconstructs order from
  `dot_set` insertion; the in-place walk preserves source order natively. Confirm
  the differential test treats key/entry order as significant where the merge
  engine does (keyed arrays merge by id, so order should be preserved but not
  semantically load-bearing — verify against `run-security-cascade-tests.php`).
- **CAS-1 scope.** Does `Origins` also absorb the cache-signal registration
  surface (CAS-3), or is that a separate owner? Decide when CAS-3 is specced.
- **CAS-4 policy fork (blocking).** Option A (consumers cannot touch
  `permissions`) or Option B (shrink-only removal, the documented-but-broken
  behavior)? This is a governance decision, not an implementation detail — it
  determines whether the permissions enforcer is deleted or restructured, and
  whether CLAUDE.md is corrected or the code is fixed to match it. Needs an
  owner's call before CAS-4 can be built.
