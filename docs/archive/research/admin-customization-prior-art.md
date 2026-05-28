# Prior art: WordPress admin customization efforts at Automattic

Research compiled 2026-04-29 via context-a8c (MGS, Slack, P2 posts). Maps historical and active efforts that intersect with WP Admin Shell — what they tried, what they learned, where shell fits.

## TL;DR

Three major arcs over 8 years. All hit the same wall: **lack of consensus on what one admin should be**. Shell-as-config sidesteps that wall by allowing multiple admins per install. Most relevant active project: **CIAB Admin's View Configuration API** (Oct 2025) — a server-side cousin of `admin.json` that proves config-driven admin pages work in production. CIAB initiative paused/cancelled April 2026.

---

## 1. Calypso + Calypsoify (2015–2024)

- **Calypso** (2015–): React SPA on top of REST API. Aimed to replace wp-admin on WordPress.com. Proved REST is sufficient to power a full admin.
- **Calypsoify** (2018–): plugin injecting Calypso-like CSS into wp-admin pages Calypso couldn't replicate. Cookie + `?calypsoify=1` query-arg state machine.

### What they uncovered

- REST API alone can power a full admin (validates shell premise).
- Two parallel admins = constant user confusion. Years of HE tickets ("I ended up on a Calypsoified page!").
- `?disable-nav-unification&calypsoify=0` became a standard support workaround. Lived in HE scripts for years.
- Cookie + referrer logic created infinite-redirect loops, broke plugin auth flows.
- Davi Pontes (Dotcom Design 2019): "WP Admin / Calypso / Front-end / Calypsoify / Store / Customizer" — five conflicting interfaces on one site.

### Pitfall the shell solves

Calypsoify failed because it tried to make wp-admin *look* like Calypso without actual separation. Shell makes the separation explicit — different shells, same underlying system.

### Key refs

- Field Guide: Nav Unification FAQs (2021-02-11)
- neptunep2 2019-12-12: "Calypsoification confusion for frittenwerkpommesmanufaktur"
- lannisterp2 2018-11-08: "Gutenberg Calypsoification Blocker: Infinite Redirects"
- explorersp2 2020-11-10: "Cycle 22 Priorities" — audit of where Calypsoify is used + plan to disable

---

## 2. Untangling Calypso (2024–present)

Reverse of Calypsoify — push WP.com features back into wp-admin. Lucas "copons" Mendes leading. P2: `untanglingcalypsop2`.

### Key posts

- **"Untangling Re-Envisioned (Take Two)"** (2025-04-28 → 2025-05-12): bottom-up approach failed. Switched to top-down IA unification. Source-of-truth = Jetpack self-hosted.
- **"State of Untangling — August 13, 2025"**: IA fragmentation across 4 contexts (Simple Calypso / Simple wp-admin / Atomic Calypso / Atomic wp-admin) is staggering. Every screen has 4 different versions.
- **"All I want for Easter is wp-admin — Future of Untangling 2026 Q1"** (2026-01-22): severely under-resourced. "Complexities greater than anticipated."

### Insights

- Same screen rendered 4 ways = "general vibe of sloppiness" (copons direct quote).
- IA is "entirely self-inflicted, decisions taken 10 years ago, never revisited."
- Bottom-up screen-by-screen migration = blocked by every team boundary.
- Top-down config that unifies IA across contexts = what's needed but no engine to drive it.
- Many screens explicitly **blocked on Core wp-admin redesign**.

### How shell helps

`admin.json` is that engine. One config → one IA → render everywhere. Untangling team could express target IA declaratively instead of porting screens one-by-one.

### Untangling FigJam IA

Source of truth FigJam contains the unified IA across all contexts. Shell could ship this as a bundled config. Low-effort win for both projects.

---

## 3. CIAB Admin / Next Admin (2025 – April 2026)

**Most relevant active parallel.** Riad Benguella leading. Internal repo: `github.a8c.com/Automattic/ciab-admin` (formerly `Automattic/next-admin`).

### Architecture matches shell's

- SPA, React, DataViews + DataForm
- REST API only for data
- Routes synced to URL
- Server-side fetch via `filterSortAndPaginate`
- Composes `@wordpress/components`
- Bridge plugins (`woocommerce-next`, `mailpoet-next`, `jetpack-next`) adapt existing plugins to the new UI

### View Configuration API (Cvetan Cvetanov / Team Moltres, 2025-10-31)

Cousin of `admin.json` — server-driven, plugin-author-driven instead of user-authored.

```
PHP Filters → REST API (/wp/v2/view-config) → React Store
```

Plugins register layouts/forms via filters like:
```php
add_filter( 'next_admin_entity_view_config_root_user', function( $config ) { ... } );
```

### Status April 2026

CIAB initiative paused / cancelled.
- Ceres P2 glossary (2026-04-28): "Since CIAB is cancelled..."
- Design Systems Slack (2026-04-17): "With CIAB development paused, we are losing a project where we can validate implementations."

### Insights for shell

- View Configuration API proved config-driven admin pages work in production.
- Their architecture validated DataViews + REST + filter-driven layouts.
- "Reducing hacks" (Luigi Teschio, 2026-03-16): CIAB now migrating off `@automattic/wp-build` + `@automattic/admin-toolkit` → `@wordpress/build` + `@wordpress/admin-ui`. Validates shell's "no external deps" rule.
- With CIAB paused, the team may have appetite to rejoin a different vehicle.

### Key refs

- archp2 2025-06-02: "Next Admin: Kick off"
- moltresichooseyou.wordpress.com 2025-10-31: "Introducing the View Configuration API in CIAB Admin"
- ciabp2 2026-03-16: "Reducing hacks and moving toward long-term solutions"

---

## 4. Multi-site Dashboard (MSD) + OmniBar (2025–2026)

**MSD** = unified dashboard for WP.com + Jetpack + A4A + VIP + (was) CIAB. Replaces Hosting Dashboard at `/sites`. Lives at `my.wordpress.com/sites`.

**OmniBar** (Lucas Mendes) = redesigned wp-admin top bar. Targeted for **WordPress 7.1** (Aug 19 2026) into Core.

### Key posts

- **"Hosting Platform direction for 2026"** (jboland8, 2026-01-09): explicit roadmap item #3 — "Continue separation of hosting, admin, and extension layers."
- **"Unblocking MSD: Timeline and Technical Details"** (Phil Jackson, 2026-03-18): "the OmniBar would change as you switch between wp-admin and MSD" — chrome inconsistency is shipping blocker.
- **"Bringing OmniBar updates into WordPress Core"** (Anne McCarthy, 2026-03-25): proposes pushing changes to Core 7.1.
- **"Multi-site Dashboard Rollout Plan"** (2026-04-02): default May 7 2026 for all WP.com users.

### Insights for shell

- WordPress 7.1 will likely ship Core admin chrome changes. Shell should track those.
- "Host-layer screens" vs site context vs vanilla — different installs need different chrome. Exactly the problem shell config solves.
- MSD adopted `my.wordpress.com` subdomain split — separation of host+admin layers as architecture pattern.

---

## 5. Riad's Core admin redesign (Gutenberg Phase 3)

WP Core admin reskin shipping in 7.0 (April 2026): CSS-only coat of paint matching site editor. DataViews/DataForms now in Core.

Per .Organization (2025-06-10): "[Next Admin] is the WP admin redesign... goal is to include many elements in WordPress 6.9." Slipped to 7.0/7.1.

### Insight

Shell sits *above* Core's redesign — consumes `@wordpress/components`, doesn't replace them. As Core ships DataViews-driven admin pages, shell automatically benefits.

---

## 6. Unified Orchestrator Agent (Em Shreve, 2025-10-17)

aip2: "One Agent, Every Surface". Big Sky / AI sidebar across wp-admin + CIAB Admin.

### Architecture

- Uses **Abilities API** (WP 6.9 — same primitive shell could expose)
- Environment detection (`client.environment` = `wp-admin` vs `ciab-admin`)
- Route-based tool registration: ability allowlist filtered by current page

### Insight for shell

Abilities API + shell's application registry are dual concepts. Each shell's `admin.json` could declare which abilities are exposed. Em Shreve already wrote: "I would like to investigate a more dynamic approach to this allowlist, so abilities can be added and removed as needed."

---

## 7. Adjacent precedents

- **CloudFest Hackathon 2024 — Alain Schlesser (Yoast) proposal** (dotorgnavigator 2024-01-17 comment): "Using JSON Schemas to build wp-admin forms" via react-jsonschema-form. "Could supersede Fields API." Tagged @youknowriad. Same idea, narrower scope.
- **Adam Zieliński's WordPress Recipes** (.Organization 2024-01-25): hypothetical `wp.json` declarative format for setting up sites. Configuration-as-code direction.
- **WooCommerce Admin (`wc-admin`)** — earliest "React framework inside wp-admin". Lessons: extension API, settings API, became a framework, eventually displaced by CIAB. Pattern shell should learn from: don't lock plugins out.
- **Newspack My Account Redesign Admin** (2024-04-12): publisher-customizable settings inside wp-admin. Smaller-scope cousin.

---

## Pitfalls historical efforts hit (and how shell sidesteps)

| Pitfall | Where | Shell answer |
|---|---|---|
| Two parallel admins confuse users | Calypso ↔ Calypsoify ↔ wp-admin | One admin renders at a time. Iframe escape hatch keeps legacy reachable but visually contained |
| Bottom-up screen porting takes years | Untangling 2024–present | Top-down config — declare IA, fall back to iframe for unconverted screens |
| Hardcoded layouts kill extensibility | Pre–View Config API CIAB | `admin.json` + application registry mirror the pattern |
| Custom build, custom admin-toolkit | CIAB pre-March 2026 | "Only `@wordpress/*` externals" rule is the lesson already |
| Chrome inconsistency between contexts | MSD ↔ wp-admin ↔ CIAB Admin | Shell *is* the chrome. Single render path |
| Consensus paralysis | Core admin redesign 2+ yrs | Multiple shells = multiple answers. No consensus required |

---

## Opportunities

1. **Pitch shell as the rendering target for Untangling's unified IA.** Lucas's FigJam already designed the cross-context IA. Shell could ship it as bundled config.
2. **Talk to Riad's team about pairing CIAB Admin's View Configuration API with `admin.json`.** Server-side complement to user-authored config. With CIAB paused, the team may be looking for a vehicle.
3. **Position shell as Phase-3-aligned.** Joen, Anne McCarthy, Riad care about admin redesign. Shell extends — not competes with — Core direction.
4. **Abilities API integration.** Command palette + applications could enumerate via Abilities. Em Shreve actively wants a dynamic approach.
5. **Hosting Platform direction Item #3** (jboland8) explicitly calls for "separation of hosting, admin, and extension layers". Shell *is* that separation made explicit.
6. **WP Cloud partner story** (Joshua Goode E2E AI comment): partners want Big Sky packaged. Shell-driven admin = product surface for hosts to white-label. Same use case as the "client portal" bundled shell.

---

## Key contacts

| Person | Slack/handle | Why |
|---|---|---|
| Lucas Mendes | @copons | Untangling DRI. Owns the cross-context IA |
| Riad Benguella | @youknowriad | Core admin redesign + Next Admin. Most important conversation |
| Cvetan Cvetanov | @morddeth | Built View Configuration API — direct architectural mirror |
| André Maneiro | @oandregal | DataForm DRI — forms layer |
| Aras Kocaoglan | @arasaraskocaoglan | MSD / Hosting Platform design |
| jboland8 | @jboland8 | Hosting Platform direction. Funding/staffing |
| Ian Stewart | @themeshaper | Cited across Untangling/MSD/CIAB design reviews |
| Joen Asmussen | @joen | Designed the original sidebar customization plugin that sparked this idea |
| Em Shreve | @emdashcodes | Orchestrator Agent + Abilities API integration |
| Anne McCarthy | @annezazu | Architecture team comms |
| Phil Jackson | (MSD tech lead) | OmniBar implementation tradeoffs |
| Luigi Teschio | (CIAB) | Authored "Reducing hacks" — knows CIAB tech debt deeply |

## Slack channels worth lurking

`#untangling-calypso`, `#ciab-admin`, `#ciab-admin-design`, `#ai-framework`, `#design-systems`, `#multi-site-dashboard`, `#dotorg`, `#team-moltres`

## Linear projects

- `linear.app/a8c/initiative/commerce-in-a-box` — CIAB initiative
- `linear.app/a8c/initiative/multi-site-dashboard-9e1b6914349a` — MSD
- `linear.app/a8c/project/msd-navigation-omnibar-alignment-68394a9ae200` — OmniBar
- `linear.app/a8c/project/untangling-my-home-2e5583a31ca0` — Untangling top priority
- `linear.app/a8c/project/cohesive-support-in-the-wp-admin-for-woo-and-jetpack-46238dc39939` — CSE

## Critical source documents

- `untanglingcalypsop2.wordpress.com/2025/04/28/untangling-re-envisioned-a-proposal/` (Take Two: 2025-05-12)
- `untanglingcalypsop2.wordpress.com/2026/01/22/all-i-want-for-easter-is-wp-admin-future-of-untangling-2026-q1/`
- `untanglingcalypsop2.wordpress.com/2025/08/13/state-of-untangling-august-13-2025/`
- `archp2.wordpress.com/2025/06/02/simple-admin-kick-off/` — Next Admin kickoff
- `moltresichooseyou.wordpress.com/2025/10/31/introducing-the-view-configuration-api-in-ciab-admin/`
- `ciabp2.wordpress.com/2026/03/16/reducing-hacks-and-moving-toward-long-term-solutions/`
- `archp2.wordpress.com/2026/01/09/hosting-platform-direction-for-2026/`
- `archp2.wordpress.com/2026/03/25/bringing-omnibar-updates-into-wordpress-core/`
- `multisitedashboardp2.wordpress.com/2026/03/18/unblocking-msd-timeline-and-technical-details/`
- `aip2.wordpress.com/2025/10/17/the-unified-wordpress-admin-orchestrator-agent-one-agent-every-surface/`
- `radicalupdates.wordpress.com/2026/04/23/wordpress-needs-an-admin-shell/` — original shell proposal
