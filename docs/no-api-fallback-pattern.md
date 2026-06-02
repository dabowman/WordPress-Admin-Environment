# No-API Fallback Pattern

When a wp-admin capability has **no REST surface**, the shell must not dead-end or silently drop the control. It offers a **consistent, tiered fallback** so the user — or their agent — can still complete the action. This is the companion to the `iframe:` escape hatch: a deliberate feature, not a compromise.

> Use this anywhere the workspace can't write something through `/wp/v2/*` or `/wp-admin-shell/v1/*`. A large share of the parity backlog is `[upstream]`/no-REST (session destroy, admin password reset, confirmation flows, page-attribute templates, legacy options); they should all be handled **identically** via this pattern.

---

## Shim, or fall back?

Decide per capability:

| | Treatment |
|---|---|
| Common + safe + belongs in the workspace UX | **Shim it first-class** (e.g. `register_setting( show_in_rest )` for standard settings — see #202/#118). Inline editing is the point. |
| Legacy, rare, risky, or genuinely not REST-able | **No-API fallback** (this pattern). |

Don't make a user drop to the CLI to toggle a common setting; don't build a fragile shim for a legacy or sensitive one (e.g. we deliberately keep `mailserver_pass` out of REST). The fallback is the consistent treatment for the **long tail**, not a replacement for first-class surfaces.

---

## Why REST-absent ≠ unreachable

Every option lives in `wp_options`; most no-REST actions have a CLI / PHP path. Reachability tiers, by how many users can use them:

1. **Classic screen (universal).** The legacy wp-admin screen, reached through the shell's existing `legacy_path` / classic-mode routing. Needs **no** agent or CLI — works for every admin. Always the base tier.
2. **WP-CLI (scriptable).** `wp option update <name> '<value>'` — calls `update_option()` under the hood, so it runs `sanitize_option`, fires `update_option_{$name}` hooks, and handles autoload + object cache. Works for **any** option regardless of `show_in_rest`. (This product's dev/wp-env contexts ship WP-CLI.)
3. **Agent (agentic).** A ready-to-paste instruction the user hands to their coding agent (the context this product targets), e.g. *"Set the WordPress option `comment_moderation` to `1` using `wp option update`."*

### Guardrails (non-negotiable)

- **Always `wp option update` / `update_option`, never raw SQL.** `UPDATE wp_options …` bypasses `sanitize_option`, the update hooks, and cache invalidation (it can desync the `alloptions` cache and store an unsanitized value). The pattern must never emit SQL.
- **The agent tier is advisory.** It generates an instruction the user *chooses* to run — it never auto-executes.
- **Tier 1 is the floor.** WP-CLI availability varies (dev/wp-env: yes; some production: no), so the classic-screen link is always offered as the universally-available path.

---

## The component

A single shared component renders all three tiers and degrades gracefully.

**Home:** `src/apps/_shared/fallback/UnavailableViaApi.js` — deliberately **global** app-space (not under `_shared/forms` or `_shared/dataviews`), because it serves settings *and* non-settings gaps. It renders WPDS, so it lives in **app space, never `src/runtime/*`** (the kernel stays DS-neutral — see `CLAUDE.md`). The classic link rides the existing capture-phase admin-link interceptor / `legacy_path` routing, so no new navigation surface is needed.

Two shapes:

```jsx
// Option flavor — pre-fills the value the user just entered, so they don't retype.
<UnavailableViaApi
    kind="option"
    name="comment_moderation"
    value={ enteredValue }
    classicPath="options-discussion.php"
/>

// Action flavor — non-option capabilities (session destroy, password reset, …).
<UnavailableViaApi
    kind="action"
    command="wp user session destroy 42"
    agentPrompt="Destroy all login sessions for user 42 using wp-cli."
    classicPath="users.php"
/>
```

Renders: a short "this isn't writable through the workspace API" explanation → the **entered value** (option flavor) → **classic-screen link** (tier 1) → **copy-paste `wp option update` / command** (tier 2) → **agent prompt** (tier 3). WPDS throughout (`@wordpress/ui` / `@wordpress/components`).

---

## Consumers

- **#118** — the legacy Writing options (`mailserver_*`, `ping_sites`, `default_link_category`, `use_balanceTags`) get the fallback affordance instead of silently vanishing. First consumer.
- **`[upstream]` no-REST gaps** — session destroy (#144), admin-initiated password reset, confirmation flows (#160), page-attribute templates, and the rest of the `[upstream]` backlog.

## Boundary

App-space shared, DS-specific. The kernel never learns about this. The classic link uses the existing `legacy_path` / admin-link-interceptor path; the CLI/agent tiers are static, copy-only affordances with no privileged execution from the shell itself.
