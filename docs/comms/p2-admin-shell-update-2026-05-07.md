# WordPress admin shell: what shipped, what we learned

Two weeks ago I [made the case for an admin shell](https://radicalupdates.wordpress.com/2026/04/23/wordpress-needs-an-admin-shell/) — a configurable layer between WordPress's capabilities and the interface you use to manage them, driven by a JSON file the way `theme.json` drives the frontend. Since then the project has shipped two betas and the architecture has gotten substantially sharper. This post covers both.

## What shipped

**v1.0.0-beta.1** went out at the start of May. The MVP scope from the original post landed: a React shell rendered with `@wordpress/ui` and `@wordpress/components`, configurable via `admin.json`, mounting native apps for posts/pages/media/profile, with an iframe escape hatch for everything not yet ported. Five demo shells in the box.

**v2.0.0-beta.1** went out a week later. v2 is a substantial architecture refactor — closer to the shape I'd actually want to propose for core. Same surface from the user's perspective: activate the plugin, get a configurable admin. Underneath, the model is meaningfully different.

Both are tagged in the repo: [github.com/dabowman/WordPress-Admin-Environment](https://github.com/dabowman/WordPress-Admin-Environment)

## How the vision sharpened

The shell concept itself held up. What changed is how the responsibilities are split.

### One JSON file became three

The original `admin.json` was carrying layout regions, applications, capabilities, branding, the engine itself, and the rendering details. By the third demo shell it was clear it was doing too much.

v2 splits it into three artifacts that map onto how core already thinks about things:

- **`app.json`** — per-app intrinsics. Ships with the app's code. What data sources it needs, which capabilities it requires, whether it participates in routing. Like `block.json`.
- **`engine.json`** — the rendering shell itself. Region templates, layout primitives, default styles. Ships with the engine's code.
- **`admin.json`** — install-time decisions only. Which apps go in which regions, branding, what's customizable per role/user.

Three artifacts, three audiences. Engine authors write `engine.json`. App authors write `app.json`. The person assembling a shell only writes `admin.json` — and never has to repeat what the engine and app authors already declared.

### Regions stopped being a `kind` enum

The original sketch had a `kind` field on each region — `sidebar`, `toolbar`, `content`, `modal`. Tidy until the second engine showed up. Then "sidebar" meant different things in a persistent-pane engine vs. a mobile drawer engine.

v2 retires `kind` for four orthogonal axes:

- **`role`** — the ARIA semantic role. What assistive tech sees.
- **`layout`** — a CSS subset describing how children flow.
- **`platform`** — browser-analog services. Is the region modal? Does it persist across navigation? Is it triggerable by keyboard? Does it want dirty-state guarding?
- **`routing`** — does it participate in the URL?

These compose. A modal is `role: "dialog"` plus platform services declaring it's modal, dismissable by Escape, autofocuses the first input. A drawer is the same role with different platform services. A sidebar is `role: "navigation"`, persistent, optionally routable. The shell stops needing to know about specific kinds — it reads platform services off the region.

This is closer to how the web platform actually thinks. Roles, layout, services, URLs are separate concerns. We were collapsing them.

### URL is the full app state

The original post handwaved navigation. The first iteration tried to be clever — a custom event bus, a `target` attribute on links picking which region rendered the click. None of it survived contact with reality.

v2 collapses to: the URL is the state. Routable regions declare a `routing.route-key` naming the URL slot they read. Plain `<a href>` is the navigation primitive. Refresh works. Deep-links work. Middle-click opens a new tab. Cmd+click does the right thing. Browser back/forward Just Works because the browser already knows how.

The change paid for itself immediately. Sidebar drill-down state, modal open/close, preview-pane visibility — every state-management bug we'd been fighting collapsed into "put it in the URL."

### The engine picks the design system

This is the change I'm most excited about.

The shell doesn't ship a theme. It ships a *seam*. Engines plug their own `ThemeProvider` into the seam — WPDS is the default, but an engine can ship Material, Tailwind tokens, a brand-locked palette, whatever it wants. Render-time errors in a third-party provider fall back to WPDS so the shell keeps painting.

Authors customize through four layers, escape-hatch order:

1. **Seeds** under `styles.theme.{color, cursor, density}` — maps 1:1 to the ThemeProvider's props. Set `color.primary: "#FF0000"` and the full palette derives from it.
2. **Nested seeds** — the same shape scoped per region or per app via nested `<ScopedThemeProvider>`.
3. **Slot overrides** — direct WPDS slot writes for cases seeds can't reach.
4. **DTCG `tokens.json`** — W3C-standard primitive tokens, consumable from any tier above via curly-brace aliases like `{tokens.color.brand}`.

A site builder can stay at tier 1 and never see a CSS variable. A power user can drop to tier 4 and define a full token system. The engine's design system shows through at every tier.

### The default shell mirrors wp-admin

The original post pitched the shell as *different* admin experiences for different users. Still the headline story. But the operational reality is that everyone already has a wp-admin they rely on, and "different" cannot mean "broken."

`wp-admin-default` ships as the default install shell and mirrors wp-admin's nav, capability gating, and screen routes. Native apps render where they exist (posts, media, users, comments, settings, plugins, themes, tools, site health, profile, dashboard, ~16 surfaces total). Iframe fallback covers the rest. Activate the plugin and the admin you already know is what you see. Configurability is opt-in, not forced.

This made the migration story believable. It's not "throw out wp-admin and adopt the shell." It's "the shell renders wp-admin by default, and you shape it from there."

### Six extension points

The original post talked about plugin authors registering apps. v2 has six stable extension surfaces, all wired:

1. Filter the merged `admin.json` (and per-origin filters for core / engine / plugin / site / role / user).
2. Register a `plugin:*` app from a plugin.
3. Register a region template into an existing engine.
4. Register a whole engine.
5. Register a complete shell programmatically.
6. Filter per-origin configs.

These mirror how block themes, blocks, and patterns extend the frontend. They're the surfaces I'd want stable in a core proposal.

## What's there to look at

```bash
git clone https://github.com/dabowman/WordPress-Admin-Environment
cd WordPress-Admin-Environment
npm install && npm run build
wp-env start
```

Activate the plugin. Default shell renders wp-admin. Switch shells via the toolbar dropdown:

- **`developer-admin`** — drill-down design nav (Templates / Patterns / Navigation / Styles), worked example of the v2 region vocabulary.
- **`content-author`** — minimal writing shell.
- **`client-portal`** — branded; agency logo, scoped nav, red accent.

The full v2 architecture is documented in `docs/wp-admin-shell-design-spec.md`. 571 test assertions cover the cascade, capability gating, manifest shape, runtime resolution, and a worked example from the spec. Manual smoke (a11y, keyboard, perf) signed off 2026-05-06.

One real constraint: the shell has a hard runtime dependency on the Gutenberg plugin (declared via `Requires Plugins: gutenberg`). The unstable APIs that `@wordpress/ui`, `@wordpress/theme`, and `@wordpress/dataviews` rely on are only allowlisted by Gutenberg's `wp-private-apis` override. Without Gutenberg the shell renders empty. Honest gap; on the path to core this gets resolved upstream.

## What's next

- **Native `@wordpress/edit-post` and `@wordpress/edit-site` mounts.** Both iframe today. Five blockers documented inline (preferences-store registration, commands, full-screen CSS, hash-router collisions, `edit-site` not in `BUNDLED_PACKAGES`). Tracked for v2.x.
- **Bindings runtime polish.** The `bindings` block (keyboard shortcuts → triggerable apps) lands ahead of beta.2.
- **Schema hosting.** v2 JSON schemas have canonical `$id`s pointing at `schemas.wp.org/admin/v1.json`; beta cycle uses raw-GitHub URLs.
- **Outreach.** A handful of folks I want to walk through this with in person. The shell concept overlaps meaningfully with what's already happening in core and Gutenberg, and v2 is far enough along to be evaluable.

The thing I keep coming back to is what was in the original post. WordPress already democratized what websites *look like*. An admin shell could democratize what they *feel like to manage* — and it could do it without anyone agreeing on what the right answer is. The right answer is whatever you need.

v2 is the version where I think we can credibly propose that to core.

— David

+pixelsandpointsp2
