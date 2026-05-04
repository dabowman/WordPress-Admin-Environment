# WordPress Admin Shell — Design Spec v2

> **Status:** Living design document. Authoritative source for the WP Admin Shell architecture beyond MVP.
> **Last revised:** 2026-05-01
> **Replaces:** Earlier drafts of this document (most recent: 2026-04-29). The MVP spec ([`wp-admin-shell-mvp-spec.md`](./wp-admin-shell-mvp-spec.md)) remains the record of the proof-of-concept implementation that validated the approach. The previous architecture draft is preserved at [`wp-admin-shell-design-spec-2026-04-29.md`](./wp-admin-shell-design-spec-2026-04-29.md) for reference; some sections from it (token system details, cascade resolver internals, capability gating layers) carry forward unchanged and are referenced rather than restated.
> **Major changes from prior draft:** The architecture has been substantially simplified. Three artifact types (app manifest, engine manifest, `admin.json`) replace the prior single-file shape. Region "kinds" are replaced by a three-layer vocabulary (`role` / `layout` / `platform`). Slots are removed in favor of recursive nested regions. The selection event bus is removed; app coordination is data-layer only. Navigation is URL-driven: every navigable surface in the shell is addressable by a URL, and the URL alone determines what each region mounts. Plain `<a href>` links work; `target` keeps its native HTML meaning (`_self`, `_blank`, etc.); no shell-specific overload of HTML attributes. The `tokens.json` layer moves from v2 to v1.

---

## Table of contents

1. [Vision](#1-vision)
2. [Principles](#2-principles)
3. [Architecture overview](#3-architecture-overview)
4. [The three artifacts](#4-the-three-artifacts)
   1. [App manifest (`app.json`)](#41-app-manifest-appjson)
   2. [Engine manifest (`engine.json`)](#42-engine-manifest-enginejson)
   3. [`admin.json`](#43-adminjson)
5. [Region vocabulary](#5-region-vocabulary)
   1. [`role` — ARIA semantics](#51-role--aria-semantics)
   2. [`layout` — CSS layout properties](#52-layout--css-layout-properties)
   3. [`platform` — platform service requests](#53-platform--platform-service-requests)
   4. [`routing` — navigation participation](#54-routing--navigation-participation)
   5. [Nested regions](#55-nested-regions)
6. [Navigation and routing](#6-navigation-and-routing)
   1. [HTML link semantics](#61-html-link-semantics)
   2. [Routes block](#62-routes-block)
   3. [URL parameter interpolation](#63-url-parameter-interpolation)
   4. [Multi-region URL state](#64-multi-region-url-state)
7. [Composition rules](#7-composition-rules)
8. [Bindings and keyboard shortcuts](#8-bindings-and-keyboard-shortcuts)
9. [Tokens and styling](#9-tokens-and-styling)
   1. [Three-document design system](#91-three-document-design-system)
   2. [WPDS-native styles](#92-wpds-native-styles)
   3. [Engine-shipped default styling](#93-engine-shipped-default-styling)
10. [Origin cascade](#10-origin-cascade)
11. [Capabilities and permissions](#11-capabilities-and-permissions)
12. [Runtime contract](#12-runtime-contract)
13. [Extensibility model](#13-extensibility-model)
14. [Compatibility and migration](#14-compatibility-and-migration)
15. [Roadmap](#15-roadmap)
16. [Non-goals](#16-non-goals)
17. [Open questions](#17-open-questions)
18. [Appendix A: Resolved architectural decisions](#18-appendix-a-resolved-architectural-decisions)
19. [References](#19-references)

---

## 1. Vision

WP Admin Shell is a configurable admin environment for WordPress. The traditional `wp-admin` is a single fixed UI shaped over twenty years to serve all audiences and now serves one user well: the technical site administrator. WP Admin Shell separates the **admin interface** from the **WordPress system**, then lets a small set of declarative documents — an `admin.json` per install plus app and engine manifests shipped with their respective code — describe an admin experience tailored to a specific role, brand, or workflow.

A site can ship multiple `admin.json` files. The same WordPress install can present a focused, customizable user experience based on user role or user preference — without forking core, without custom plugins per surface, and without sacrificing the REST API contract that powers everything. It also provides a stable framework for further customization: anyone wanting to write a custom shell to provide a very different admin experience can do so cleanly. React-based admin screens become substantially more portable and configurable through a minimal, configurable shared framework.

The MVP proved this is technically and ergonomically viable. This document describes the comprehensive design v1 implements.

---

## 2. Principles

The design rests on eight principles. When a decision is unclear, they are the tiebreakers.

1. **Declarative over imperative.** Configuration files describe *what* exists, not *how* to render it. The runtime interprets the declaration. Lesson from `theme.json`, KDE Global Themes, VS Code `package.json` contributions.

2. **Three artifacts, three responsibilities.** App manifests declare what an app *is*. Engine manifests declare what an engine *provides*. `admin.json` declares install-specific *decisions*. No artifact reaches into another's responsibility. The site author writing `admin.json` should never need to know an app's internal mechanics; the app author writing a manifest should never need to know which install will use it.

3. **Apps are intrinsically responsive; engines own geometry.** Apps render correctly at any reasonable container size their engine allocates. They never declare layout for their container. The browser/website analogy is exact: the engine is the browser, the app is the website. Browsers don't ask websites how big to be.

4. **One region, one app.** A region holds exactly one app. Multi-app patterns (toolbars, status bars) are produced by region templates that declare *child regions*, each holding one app. The region primitive recurses; the rule does not bend.

5. **The shell does not govern app internals.** Component composition inside an app is React's job, not the shell's. Plugins extend apps via existing WordPress patterns (`@wordpress/plugins`, slot/fill, filters); the shell sees one app and is unaware of intra-app extensions.

6. **HTML/CSS/ARIA vocabulary first, shell-specific vocabulary as remainder.** Authors writing region declarations use ARIA roles, CSS layout properties, and URLs directly — vocabularies with W3C-stable specifications they already know. Navigation is plain `<a href>`; the URL is the full app state; `target` keeps native HTML meaning. Shell-specific fields exist only for things HTML/CSS/URLs do not model (persistence across navigation, install-time bindings, declarative platform-service requests). The shell never overloads an HTML attribute to mean something other than its standard.

7. **REST API is the only system contract.** The shell never reaches into PHP-rendered admin internals. Every screen reads/writes through `/wp-json/`. If the API can't do it, the shell can't do it — or it lives in a thin app that internally iframes the legacy wp-admin screen until it can be ported.

8. **Open extension, closed defaults.** Plugins extend by registering new apps and engines, contributing to apps' existing extension points, and (rarely) registering new region templates. Plugins do not patch the shell runtime. The shell ships a small, opinionated set of `core:*` apps and engines; everything else comes through declared extension points.

---

## 3. Architecture overview

Three layers, mirroring the structure of every shell environment surveyed (GNOME, KDE, VS Code, fish, Hyprland):

| Layer | What it is | WordPress equivalent |
|---|---|---|
| **System** | Capabilities exposed to the shell | REST API + `@wordpress/core-data` entities |
| **Shell** | Runtime kernel: artifact loader, router, registries, token compiler, capability gate, cascade merger | React runtime (this plugin) |
| **Configuration** | Declarative description of the shell | App manifests + engine manifests + `admin.json` |

The shell layer is composed of three runtime primitives:

- **Apps** — addressable mountable units. Declared by app manifests shipped with their code. Render whatever they want internally, including any React component composition (slot/fill, hooks, etc.) the app's author chooses.
- **Regions** — typed containers, each holding one app. Declared in `admin.json` either by referencing an engine-shipped template or from scratch. Regions can declare child regions; nesting is the multi-app composition mechanism.
- **Engines** — pluggable components that arrange regions into DOM. Default `core:wp-default-layout`. Each engine ships region templates and a default arrangement algorithm. Swappable for floating-window, single-pane, or custom (§4.2).

The runtime kernel does not know what a sidebar is; it knows how to ask the active engine to render a region tree, and how to ask each region to render its assigned app.

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser                                  │
│                                                                  │
│   ┌────────────────────────────────────────────────────────────┐ │
│   │   Configuration artifacts (merged)                          │ │
│   │                                                             │ │
│   │   App manifests       Engine manifests       admin.json     │ │
│   │   (intrinsic)         (templates, services)  (install      )│ │
│   └────────────────────────────────┬───────────────────────────┘ │
│                                    │                              │
│   ┌────────────────────────────────▼───────────────────────────┐ │
│   │                Shell runtime kernel                         │ │
│   │  Manifest loader · Router · Registries · Token compiler     │ │
│   │  Capability gate · Cascade merger · Binding registry        │ │
│   └────────────────────────────────┬───────────────────────────┘ │
│                                    │                              │
│   ┌────────────────────────────────▼───────────────────────────┐ │
│   │                Active engine                                │ │
│   │  core:wp-default-layout  |  core:floating-layout  |  ...   │ │
│   │  Default arrangement algorithm + region templates           │ │
│   └────────────────────────────────┬───────────────────────────┘ │
│                                    │                              │
│   ┌────────────────────────────────▼───────────────────────────┐ │
│   │   Region tree (each region holds one app)                  │ │
│   └────────────────────────────────┬───────────────────────────┘ │
│                                    │                              │
│   ┌────────────────────────────────▼───────────────────────────┐ │
│   │   Apps (core:* / plugin:*)                                │ │
│   │   Internal composition via React (slot/fill, etc.)          │ │
│   └────────────────────────────────┬───────────────────────────┘ │
│                                    │                              │
│        @wordpress/core-data · @wordpress/api-fetch                │
└────────────────────────────────────┼──────────────────────────────┘
                                     │
                          WordPress REST API
                          /wp-json/wp/v2/...
```

The boundaries are strict:

- The **system layer** does not know the shell exists.
- The **shell runtime kernel** does not know about specific apps, regions, or engines. It loads them by string identifier and orchestrates rendering through the active engine.
- The **engine** does not know about specific apps. It receives a region tree, arranges it, and asks each region to render its app.
- The **regions** do not know about app internals. A region mounts one app and styles its container.
- The **apps** do not know about their region's geometry, the active engine, or any other app. They render intrinsically responsively into whatever container they are given.

Crossing a boundary is a design smell. If a `core:*` app needs to call WordPress directly via PHP-injected globals, that app has leaked through the system layer. If an engine needs to know that a region contains a navigation app, the engine has leaked through the region boundary. If an app needs to know its container size in pixels, the app has leaked through the layout boundary.

---

## 4. The three artifacts

The configuration layer is three artifacts with cleanly partitioned responsibilities. Authors of any one artifact need only know that artifact's contract.

### 4.1 App manifest (`app.json`)

The app manifest declares **what an app is**. It is shipped with the app's code, alongside the script and style assets the app needs. It does not describe where the app is installed, who can use it on a given site, or what it looks like in someone else's shell. Those are install decisions and live in `admin.json`.

```jsonc
{
  "$schema": "https://schemas.wp.org/admin-app/v1.json",
  "id": "core:command-palette",
  "version": 1,
  "title": "Command Palette",
  "description": "Searchable command launcher.",

  "role": "dialog",

  "platform": {
    "modal": true,
    "dismiss-on": [ "Escape", "backdrop-click" ],
    "autofocus-target": ".command-palette__input",
    "triggerable": true
  },

  "capabilities": [],

  "config-schema": { /* JSON Schema for the config object admin.json passes */ },

  "extension-points": {
    "PluginCommandPaletteItem": "@wordpress/commands"
  },

  "script": "core-command-palette",
  "style":  "core-command-palette"
}
```

Manifest fields:

| Field | Purpose |
|---|---|
| `id` | Globally unique app identifier. Format: `{namespace}:{name}`. `core:*` reserved for shipped-with-shell. `plugin:{slug}/{name}` for plugin contributions. (Legacy PHP wp-admin screens are wrapped by thin apps that internally render an iframe via the SDK helper, not by a magic id format. See open question #10.) |
| `version` | Manifest schema version. Bumped on breaking changes to this app's manifest contract. |
| `title`, `description` | Human-readable. |
| `role` | The app's primary ARIA role when mounted. Drives engine specialization (§5.1). Required. |
| `platform` | Platform service requests. See §5.3. The app declares what platform-level services it needs the engine to provide. |
| `capabilities` | Required WordPress capabilities to mount the app. Floor for any consumer; `admin.json` cannot lower this. |
| `config-schema` | JSON Schema for the config object `admin.json` passes when mounting. Validated at load time. |
| `extension-points` | Optional, documentary. Lists slot/fill, filter hooks, and other React/JS surfaces the app exposes to plugin extensions. Not load-bearing for the shell; useful for IDE tooling and ecosystem health. |
| `script`, `style` | WordPress script/style handles the app needs enqueued. Same pattern as `block.json`. |

**The manifest does not declare layout.** No width, no height, no positioning, no preferred geometry. The app is a black box that renders correctly at any size its container provides. This is non-negotiable: an app that demands geometry breaks composition across engines.

**The manifest does not enumerate keystrokes.** Bindings are declared in `admin.json` because they are install-level and user-customizable. The app may declare `triggerable: true` to indicate it can be invoked by a binding; *which* binding is decided at the install.

**Schema hosting.** `https://schemas.wp.org/admin-app/v1.json` is the canonical URL. Until the schema is hosted, it lives at `docs/schemas/admin-app-v1.json` in the plugin repo and is referenced via `$schema` for IDE validation. Same applies to the engine and admin.json schemas (§4.2, §4.3).

**Forward compatibility.** A manifest declaring a higher `version` than the runtime understands triggers a warning and a best-effort load: known fields are honored, unknown fields are preserved on the manifest object but ignored by the runtime. This matches `theme.json`'s policy.

App manifests are discovered by the runtime via:
1. **Convention path.** Plugin places `app.json` at the root of an "app folder" (`{plugin}/apps/{name}/app.json`). Auto-discovered on `init`.
2. **Programmatic path.** Plugin calls `wp_admin_shell_register_app( $manifest_array_or_path )` from PHP, or the JS equivalent.

### 4.2 Engine manifest (`engine.json`)

The engine manifest declares **what an engine provides**. It enumerates the region templates the engine ships, the ARIA roles it specializes for, the platform services it implements, and any default arrangement behavior.

```jsonc
{
  "$schema": "https://schemas.wp.org/admin-engine/v1.json",
  "id": "core:wp-default-layout",
  "version": 1,
  "title": "WordPress Default Layout",
  "description": "Default WP admin shell — sidebar, topbar, content, optional detail pane.",

  "specializes-roles": [
    "navigation", "banner", "main", "complementary", "dialog", "contentinfo"
  ],

  "honored-platform": [
    "modal", "dismiss-on", "autofocus-target", "triggerable",
    "persists-across-navigation", "dirty-state",
    "block-navigation-on-dirty", "trigger"
  ],

  "templates": {

    "core:sidebar": {
      "role": "navigation",
      "platform": { "persists-across-navigation": true },
      "default-style": {
        "inline-size": "240px",
        "block-size":  "100%",
        "background":  "{styles.chrome.sidebar.background}",
        "color":       "{styles.chrome.sidebar.foreground}"
      }
    },

    "core:topbar": {
      "role": "banner",
      "platform": { "persists-across-navigation": true },
      "default-style": {
        "block-size":  "48px",
        "inline-size": "100%",
        "background":  "{styles.chrome.toolbar.background}"
      },
      "regions": {
        "start":  { "role": "region" },
        "center": { "role": "region" },
        "end":    { "role": "region" }
      }
    },

    "core:main": {
      "role": "main",
      "default-style": { "inline-size": "100%", "min-inline-size": "0" }
    },

    "core:detail": {
      "role": "complementary",
      "platform": { "dismiss-on": [ "Escape" ] },
      "default-style": {
        "inline-size":     "min(720px, 50%)",
        "min-inline-size": "320px",
        "border-inline-start": "1px solid {styles.color.stroke.surface.neutral.weak}"
      }
    },

    "core:overlay": {
      "role": "dialog",
      "platform": { "modal": true },
      "default-style": {
        "inline-size":      "min(600px, 90vw)",
        "max-block-size":   "70vh",
        "position":         "fixed",
        "inset-block-start": "20vh",
        "inset-inline-start": "50%",
        "translate":        "-50% 0"
      }
    }
  },

  "default-arrangement": "wp-chrome",

  "script": "core-wp-default-engine",
  "style":  "core-wp-default-engine"
}
```

Manifest fields:

| Field | Purpose |
|---|---|
| `id`, `version`, `title`, `description` | Same as app manifest. |
| `specializes-roles` | ARIA roles for which this engine has chrome treatments and recognized layouts. Roles outside this list fall through to the engine's default arrangement algorithm (`default-arrangement`). |
| `honored-platform` | Platform service requests this engine implements. Apps requesting platform services outside this list still mount; the unhonored requests are no-ops with a logged warning. |
| `templates` | Region template catalog. Each entry declares a reusable region shape (`role`, `platform`, `default-style`, optional nested `regions`). Authors instantiate templates from `admin.json`. |
| `default-arrangement` | Identifier for the engine's spatial arrangement algorithm. The algorithm itself is implementation in the engine's script — this field is a marker for documentation and tooling. |
| `script`, `style` | Engine asset handles. |

**`templates` is the engine's primary contribution to authors.** A template ships with sensible defaults for everything an author might want — role, platform behaviors, geometry, child regions, even default apps for those child regions. The author instantiates templates and overrides only what they care about. Templates are reusable; an engine can ship many.

**Region templates can declare child regions** under a nested `regions` field. Children are independently addressable as `{parent}/{child}` paths in `admin.json`. Each child has the full region contract — its own role, platform, layout, app, even further nested regions. See §5.5.

**`default-style` references tokens** through curly-brace alias syntax (`{styles.chrome.sidebar.background}`). The resolver expands these against the merged styles tree at compile time. Templates are not tied to specific values; they are tied to slot names that the install fills.

**`default-arrangement` is implementation, not declaration.** Engines decide spatially how regions are arranged using whatever logic they want — flex, grid, absolute positioning, custom geometry. This field is a name (e.g., `wp-chrome`, `tiling-dwindle`, `floating-windows`) authors and tooling can reference for documentation. The actual algorithm is in the engine's React code.

Engines register the same way as apps: convention path (`{plugin}/engines/{name}/engine.json`) or programmatic. Most plugins will not ship engines; engines are infrastructure-level contributions.

### 4.3 `admin.json`

`admin.json` declares **install-specific decisions**: which engine renders, which regions exist on this install, which apps live in them, how URLs route, what keystrokes do what, and what the install looks like (token overrides). Every line is a decision a site author plausibly makes. Nothing intrinsic to apps or engines belongs here.

```jsonc
{
  "$schema": "https://schemas.wp.org/admin/v1.json",
  "version": 1,
  "$wpds":   "6.9",

  "name":  "developer-admin",
  "title": "Developer Admin",

  "engine": "core:wp-default-layout",

  "regions": {

    "sidebar": {
      "template": "core:sidebar",
      "app": "core:primary-nav"
    },

    "topbar": {
      "template": "core:topbar",
      "regions": {
        "start":  { "app": "core:site-hub",
                    "config": { "logo": "./assets/acme-logo.svg",
                                "title": "Acme Corp",
                                "icon":  "./assets/icon.svg" } },
        "center": { "app": "core:current-context" },
        "end":    { "app": "core:user-menu" }
      }
    },

    "main": {
      "template": "core:main",
      "routing": { "route-key": "_self" }
    },

    "detail": {
      "template": "core:detail",
      "routing": { "route-key": "detail" },
      "style": { "inline-size": "40%" }
    },

    "palette": {
      "template": "core:overlay",
      "app": "core:command-palette"
    },

    "status-bar": {
      "role":     "contentinfo",
      "platform": { "persists-across-navigation": true },
      "style":    { "block-size": "24px", "inline-size": "100%" },
      "position": "block-end",
      "app":      "plugin:dev-tools/status-bar"
    }
  },

  "routes": {
    "/posts":          { "app": "core:posts",  "config": { "post-type": "post" } },
    "/pages":          { "app": "core:posts",  "config": { "post-type": "page" } },
    "/media":          { "app": "core:media" },
    "/posts/{id}":     { "app": "core:editor", "config": { "post-type": "post", "post-id": "{id}" } },
    "/pages/{id}":     { "app": "core:editor", "config": { "post-type": "page", "post-id": "{id}" } },
    "/posts/new":      { "app": "core:editor", "config": { "post-type": "post" } }
  },

  "default-route": "/posts",

  "bindings": [
    { "shortcut": "Mod+K", "invoke": "core:command-palette" }
  ],

  "styles": { /* WPDS-shaped overrides + chrome slots — see §9 */ }
}
```

Top-level fields:

| Field | Purpose |
|---|---|
| `version` | admin.json schema version. v1 is the current shape. |
| `$wpds` | Pinned WPDS slot matrix version (§9). Governs slot validation and default loading. |
| `name`, `title` | Identifier and human-readable label for this shell. |
| `engine` | The engine to use for this shell. References an engine `id`. |
| `regions` | The region tree. Each entry references a template and/or declares a region from scratch. See §5. |
| `routes` | URL pattern → app + config mapping. See §6.2. (Distinct from the `routing` field on individual regions, which declares which slot of the URL each region reads from; see §5.4.) |
| `default-route` | Where the shell lands on first load. Falls through to first permitted route if not accessible. |
| `bindings` | Keyboard shortcut → app invocation mapping. See §8. |
| `styles` | WPDS-shaped style tree with token overrides. See §9. |

Notably absent compared to the prior draft:

- **No top-level `apps` array.** Apps referenced in `regions` and `routes` are auto-collected; the registry validates each is installed. Explicit listing was redundant.
- **No `settings` / `styles` partition at top level.** The partition was inherited from `theme.json`; in the artifact-separated architecture, settings-equivalent material lives in app and engine manifests, leaving `admin.json` mostly install decisions plus `styles`.
- **No selection event bus configuration.** Removed entirely (see §16).
- **No "kind" enum on regions.** Replaced by `role` + `platform` + `layout` + `routing` (§5).

`admin.json` discovery and registration use the same paths and origin cascade as the prior draft. Convention path: a plugin places `admin.json` at its root. Multi-shell path: `{plugin}/shells/*.json`. Programmatic: `wp_admin_shell_register( $name, $config )`. The five-origin cascade (`core` < `plugin` < `site` < `role` < `user`) is unchanged from the prior draft (§10).

---

## 5. Region vocabulary

A region is declared by combining four optional concerns: role, layout, platform, routing. Each maps to a vocabulary with precedent: ARIA roles, CSS layout properties, browser/OS-analog platform services, and URL semantics. The shell adds a small remainder of fields (persistence, position) that have no clean external precedent.

A region declaration has this shape:

```jsonc
"region-id": {
  "template": "engine-shipped-template-id",   // optional; instantiate template

  "role":     "navigation",                    // §5.1 — ARIA role
  "layout":   { /* CSS properties */ },        // §5.2 — geometry
  "platform": { /* service requests */ },      // §5.3 — engine services
  "routing":  { /* URL participation */ },     // §5.4 — route-key

  "position":   "block-end",                   // arrangement hint to the engine
  "style":      { /* style overrides */ },     // shorthand for overriding template's default-style
  "capability": "edit_posts",                  // optional cap gate; subtree skipped if user lacks

  "app":        "app-id",                      // mount this app (mutually exclusive with routing.route-key)
  "config":     { /* config for the mounted app */ },   // matches the app's config-schema

  "regions":  { /* nested child regions */ }   // §5.5
}
```

When `template` is set, the template's `role`, `platform`, and `default-style` are inherited. Locally declared `role` / `platform` / `style` override the template's values for those fields. Locally declared `regions` *merge* with the template's nested regions — a child region declared in both takes the local declaration; children only in the template carry through.

When `template` is absent, the region is declared from scratch. `role` is required in this case; everything else is optional.

**`config` for the mounted app.** When a region declares `app: "app-id"`, the `config` field passes values to that app at mount time. The runtime validates the config against the app manifest's `config-schema`. This is how install-level decisions reach apps that take configuration — for example, passing the logo URL to `core:site-hub`, or the post type to `core:posts`. Apps mounted via the routes block (URL-driven) receive their config from the matching route entry instead.

**`capability` is install-level gating.** It adds to the floor declared in the app manifest's `capabilities[]`. A region's capability gate is a fast-path check: if the user lacks the capability, the entire region subtree (including any nested child regions) is skipped before mount. See §11.

**`position` vocabulary.** When a region is declared from scratch (or when overriding template arrangement), `position` hints where the engine should place it relative to the engine's default arrangement. v1 accepts the CSS-aligned semantic values: `block-start`, `block-end`, `inline-start`, `inline-end`. Engines decide how to honor these against their layout algorithm; an engine without a clear "block-end" (e.g., a floating engine where everything is windows) may interpret the hint as initial placement or ignore it. Regions instantiated from a template inherit the template's arrangement and typically omit `position`.

### 5.1 `role` — ARIA semantics

`role` is the region's [ARIA landmark or document role](https://www.w3.org/TR/wai-aria-1.2/#landmark_roles). It serves three purposes:

1. **Accessibility.** The engine emits `role="..."` (and any role-implied attributes) on the region's DOM element. Screen readers announce the region appropriately.
2. **Engine specialization.** Engines declare which roles they specialize for in `engine.json`'s `specializes-roles`. A specialized role gets engine-shipped chrome (default styling, default platform behaviors, position in the default arrangement). Unspecialized roles fall through to the engine's default arrangement algorithm with author-provided styling.
3. **Default platform pairing.** A region with `role: "dialog"` paired with `platform.modal: true` is the standard modal pattern; the engine pairs them for focus trap, backdrop, ARIA modal attributes.

Common roles used in shell contexts:

| Role | ARIA meaning | Typical use |
|---|---|---|
| `navigation` | Collection of navigational elements | Sidebar nav |
| `banner` | Site-oriented header | Topbar |
| `main` | Main content of the document | Primary content area |
| `complementary` | Supporting content | Detail/inspector pane |
| `contentinfo` | Footer/site info | Status bar |
| `dialog` | Dialog window | Command palette, modals |
| `region` | Generic landmark | Anything not fitting a specific role |
| `search` | Search landmark | Search overlay |

Authors can use any valid ARIA role. Engines specialize for a subset; everything else uses defaults.

### 5.2 `layout` — CSS layout properties

`layout` is a constrained subset of CSS properties the engine reads to compute region geometry. The vocabulary is CSS itself, in its modern logical-property form, restricted to layout-relevant properties.

**Allowlist for v1:**

- Sizing: `inline-size`, `block-size`, `min-inline-size`, `min-block-size`, `max-inline-size`, `max-block-size`, `aspect-ratio`
- Positioning: `position`, `inset`, `inset-block-start`, `inset-block-end`, `inset-inline-start`, `inset-inline-end`, `translate`
- Flexbox participation (when in a flex parent): `flex-basis`, `flex-grow`, `flex-shrink`, `align-self`, `justify-self`, `order`

**Not in the allowlist:**

- `display` and any layout-context-defining property (engines own layout context, not author).
- Grid placement (`grid-area`, `grid-column`, etc.) — too tied to engine-specific grid templates.
- Decorative properties (`background`, `border`, `color`, `padding`, `margin`) — these belong in `style`, not `layout`. The split is intentional: `layout` informs the engine's geometry algorithm; `style` is decoration the engine passes to the region's container.

The `style` field accepts the broader set of CSS properties used for decoration (background, color, border, padding, etc.) and is applied to the region's container element. `layout` and `style` are emitted as CSS in the region's stylesheet at mount time.

Authors use logical properties (`inline-size`, `block-size`) rather than physical (`width`, `height`) so layouts work in vertical writing modes without modification.

### 5.3 `platform` — platform service requests

`platform` is the region's request for services the engine provides at the platform level — services the browser/OS would provide if this were a website. The test for inclusion in `platform` is: **does the browser handle anything analogous, and would every region author otherwise reimplement it the same way?**

**v1 platform services:**

| Field | Type | Purpose | Browser analog |
|---|---|---|---|
| `modal` | boolean | Trap focus inside region; render backdrop; ARIA modal | `<dialog>` modality |
| `dismiss-on` | string[] | Triggers that close an ephemeral region | Browser dialog dismissal |
| `autofocus-target` | CSS selector | Focus this element on mount | `autofocus` attribute |
| `triggerable` | boolean | This region/app can be invoked by a binding | Browser `commandfor` |
| `persists-across-navigation` | boolean | Region survives URL-driven app changes in *other* regions | Browser tab persistence |
| `trigger` | object | `{ shortcut: "Mod+K" }` — placeholder for declarative trigger; install-level binding overrides | `accesskey` |
| `dirty-state` | boolean | App may report unsaved state; engine asks before navigation | `beforeunload` |
| `block-navigation-on-dirty` | boolean | When dirty, engine shows confirm dialog rather than allowing navigation | `beforeunload` confirm |

The list grows additively. New platform services join when real apps surface real needs and the additions pass the browser-analog test. The `extensions` policy: a new field added in a minor spec version, engines may opt to honor; unhonored fields are no-ops with a logged warning. Apps requesting an unhonored service still mount.

**Out of scope for `platform`:**

- Inter-app coordination (selection, shared state, messaging). Use the data layer.
- Application-internal behavior (drag-to-reorder, tooltips, autocomplete). App responsibility.
- Visual animation/transitions for app content. App responsibility.
- Region mount/unmount transitions (entrance/exit animation). Engine responsibility, not declared.

### 5.4 `routing` — URL participation

`routing` declares which slot of the URL the region reads from. v1 has one field:

| Field | Purpose |
|---|---|
| `route-key` | The URL slot whose value resolves to a route, whose route's app mounts in this region. `_self` reads the URL's primary path. Any other value (e.g., `detail`) reads the URL query parameter of that name. |

A region with `route-key` is *routable*: the runtime takes the URL value at that slot, looks it up in the routes block (§6.2), and mounts the matching app in this region. Regions without `route-key` are non-routable — they hold a fixed `app` for the life of the shell, or are pure chrome with nested children.

Multiple regions may be routable. `route-key: "_self"` is conventionally used by exactly one region per shell (the primary content region); other routable regions use named keys (`detail`, `inspector`, etc.) that match query-parameter names in the URL grammar (§6.4).

**A region cannot have both a fixed `app` and `route-key`.** Either it holds an app for the life of the shell or it reads its app from the URL — never both. Mixing the two creates ambiguity about which app should be mounted at any given moment.

**No HTML-attribute overload.** `route-key` is a shell-specific declaration that names the URL slot a region reads from. It is *not* the HTML `<a target>` attribute, which keeps its native browsing-context meaning (`_self`, `_blank`, etc.). Authors who want a link to mount an app in the detail region write the URL itself (`<a href="?detail=/posts/42/edit">Edit</a>`); the URL is the full source of truth and the browser handles the click natively.

### 5.5 Nested regions

A region can declare child regions via the `regions` field. Children are independently addressable in `admin.json` as `{parent-id}/{child-id}` paths. Each child has the full region contract — role, platform, layout, app, even further nesting.

```jsonc
"topbar": {
  "template": "core:topbar",
  "regions": {
    "start":  { "app": "core:site-hub" },
    "center": { "app": "core:current-page-title" },
    "end":    { "app": "core:user-menu" }
  }
}
```

This is the multi-app composition mechanism. The toolbar isn't a region with three "slots"; it's a region whose template declares three child regions, each holding one app. The recursion is uniform: every level uses the same primitive.

**Authoring rule of thumb:** prefer engine-shipped templates over from-scratch declaration. A template encapsulates the role + platform + layout + child structure that makes a "toolbar" or "sidebar" coherent. Authors who want a custom shape declare from scratch with full control.

**No depth limit, but flat conventions.** The architecture permits arbitrary nesting; convention discourages going more than two levels deep. Deep region trees become hard to reason about; the same way the block editor's slot tree accumulated complexity, region trees can. Use templates that ship with the engine for common cases; only add depth when it represents real spatial structure.

---

## 6. Navigation and routing

Navigation in the shell is URL-driven. The URL is the full source of truth: every navigable surface in the shell is addressable by a URL, and the URL alone determines what each region mounts. Authors emit plain `<a href>` links; the browser handles clicks natively; the router observes URL changes and recomputes which app each routable region renders. There is no shell-specific overload of HTML attributes.

### 6.1 Plain HTML links

The shell uses standard HTML link semantics — no overload, no interception of clicks the browser would handle differently.

| Attribute | Behavior |
|---|---|
| `href` | The destination URL. In-shell destinations use the hash form `#/path?key=value` so the browser stays on the shell page; full URLs navigate as the browser would normally. |
| `target` | Standard HTML — `_self` (default, navigate in place), `_blank` (open in new tab/window), `_parent`, `_top`, or a named browsing context (existing iframe/window with that name). The shell does **not** redefine these. A link with `target="_blank"` opens a new browsing context; the new browsing context loads the same URL; the shell on that new context decomposes the URL and renders identical multi-region state. |
| `rel` | Standard HTML, used as the user-agent does. The shell does not require or override any `rel` token. |

Authors and plugins wire navigation by writing URLs into `href`. The router does not intercept link clicks at the document level — every standard browser interaction (left-click navigates in place; middle-click / Cmd-click / Ctrl-click opens in new tab; right-click → "Open in new tab"; drag-to-bookmark; copy link address) works because nothing is overloaded.

The router observes URL changes via the `hashchange` event (and the Navigation API's `navigate` event where supported) and decomposes the new URL into per-region routes (§6.2). No `event.preventDefault()` interception is required for `<a>` clicks targeting in-shell hash URLs — the browser navigates the hash, the URL updates, the router recomputes.

**Programmatic navigation.** A `navigate(href)` API exists for apps that need to navigate without rendering an `<a>` (e.g., from a button click handler). It is a thin wrapper around `location.hash = ...` (or the Navigation API where available) — exactly equivalent to the user clicking an `<a href>` with that target.

**Browser back/forward** is honored by URL-driven routing. Each navigation that changes the URL hash creates a history entry; browser back returns to the previous state and the router decomposes the previous URL.

### 6.2 Routes block

`admin.json`'s `routes` block maps URL patterns to app + config tuples. There is no `target` or destination-region field — the *URL slot* the route is matched against (primary path, named query parameter) determines which region mounts the app, via each region's `route-key` declaration (§5.4).

```jsonc
"routes": {
  "/posts/{id}": {
    "app": "core:editor",
    "config": {
      "post-type": "post",
      "post-id": "{id}"
    }
  }
}
```

Pattern syntax:

- Static segments: `/posts/new` matches `/posts/new` exactly.
- Parameter segments: `/posts/{id}` matches `/posts/42`, captures `id=42`.
- Wildcard suffix: `/media/*` matches `/media/anything/here`, captures the rest.

Pattern resolution is most-specific-wins: `/posts/new` beats `/posts/{id}` for `/posts/new`.

When the URL changes, for each routable region (a region with `route-key`), the runtime:
1. Reads the URL value at the region's `route-key` slot — the URL's primary path for `route-key: "_self"`, or the value of the URL query parameter named by the key for any other value.
2. Matches that value against the routes block; selects the most-specific matching pattern.
3. Resolves `{paramname}` placeholders in the route's `config` against captured params (§6.3).
4. Mounts the route's app into the region with the resolved config.
5. Validates the user has the app's required `capabilities`; renders 403 view if not.

A region whose `route-key` slot is empty (e.g., `route-key: "detail"` and the URL has no `?detail=` parameter) renders empty until a navigation populates it. A region whose slot value matches no route falls back to the engine's default empty/404 view for that region.

If the primary path matches no route and the URL is the initial load, the runtime navigates to `default-route`. If `default-route` is inaccessible (capability denial), it lands on the first permitted route in the routes block.

### 6.3 URL parameter interpolation

Route patterns capture parameters; route configs reference them via curly-brace substitution:

```jsonc
"/posts/{id}": {
  "app": "core:editor",
  "config": { "post-id": "{id}", "post-type": "post" }
}
```

`{id}` in the config value resolves against the route match params. Substitution is lexical — only string values containing `{paramname}` are substituted, and the value is replaced as-is (no type coercion; `post-id: "{id}"` becomes `post-id: "42"`, and the app's `config-schema` does any expected coercion).

**Disambiguation from token aliases.** `tokens.json` (§9) and `admin.json.styles` use the same curly-brace syntax for token references. Route config interpolation runs in a different resolver pass:

- Route config substitution: only inside `routes.{pattern}.config` and inside `regions[*].config`, only against URL params (and only for `routes`-driven mounts).
- Token alias resolution: only inside `styles` and inside engine `default-style`, only against the merged tokens tree.

The two namespaces never overlap because their containing fields never overlap. The resolver is unambiguous.

### 6.4 Multi-region URL state

The URL is the full app state — every routable region's currently-mounted app is encoded directly in the URL. The region with `route-key: "_self"` owns the URL's primary path; every other routable region's state lives in a URL query parameter named by its `route-key`:

```
#/posts                                            → main: posts list, detail: empty
#/posts?detail=/posts/42                           → main: posts list, detail: editor for post 42
#/posts?detail=/posts/42&inspector=/users/3        → main: posts list, detail: editor, inspector: user profile
#/posts/new                                        → main: editor for new post, detail: empty
```

Query-parameter values are URL-encoded route patterns (`/posts/42` becomes `%2Fposts%2F42` in the wire form; the router decodes before matching). The router resolves each query parameter against the routes block as if it were a standalone route, then mounts the resulting app into the region whose `route-key` matches the parameter name.

Region state is independently navigable. Adding `?detail=/posts/42` to the URL mounts the detail region without changing main; clearing the `detail` parameter unmounts detail without disturbing main. The browser's URL bar always reflects the current shell state; the user can copy/share/bookmark the URL to capture the full multi-region view, and reloading or opening in a new tab reproduces it identically.

**Why URL-only.** The earlier draft used an HTML-attribute overload (`<a target="detail">`) to signal which region a link should mount in. That mechanism was dropped because (a) HTML's `target` attribute names browsing contexts, not in-page DOM regions, so any non-special value would natively spawn a new tab/window unless every click were intercepted; (b) intercepting clicks must preserve middle-click / Cmd-click / right-click "Open in new tab" / drag-to-bookmark behaviors, all of which are easy to break; (c) overloading `target` makes shell-internal navigation visually indistinguishable from "open in new tab" in source code, harming readability. URL-only routing reduces shell-specific vocabulary, lets `target` keep its native HTML meaning (so `<a target="_blank">` opens a real new tab as expected), and makes the URL the single, copyable source of truth for app state.

---

## 7. Composition rules

The architecture has two composition mechanisms operating at two distinct layers:

**Region composition** (shell-level). How apps coexist visually in a shell. Mechanism: nested regions in `admin.json`, instantiated from engine-shipped templates. Each region holds one app. Composition is independent and addressable: each region is mounted/unmounted, capability-gated, styled, and replaced separately.

**Component composition** (app-internal). How an app's UI is constructed internally. Mechanism: React. Apps use whatever React patterns their author chooses — slot/fill, render props, context, hooks. The shell does not govern this layer.

The two are **not the same**. They share the metaphor of "filling a container with content," but their lifecycles, addressability, and replacement semantics are fundamentally different. The shell vocabulary intentionally reserves "region" for the shell-level concern and does not introduce a separate "slot" concept; a "slot" in this codebase always means a React `<Slot>`/`<Fill>` inside an app, never a shell-level container.

**When to use which:**

- **Use region composition** when the things being composed are independently swappable, addressable from `admin.json`, and have independent lifecycles. Toolbar's start/center/end are independently swappable apps → child regions.
- **Use component composition** when the things compose into one logical app whose internals are implementation detail. The block editor's inspector-vs-canvas split is React composition, not shell composition.

The test: if a site author would plausibly swap one piece without the other, it's region composition. If swapping breaks the meaning of the whole, it's component composition.

Sub-corollary: **plugin extensions to apps go through the app's existing extension API, not through the shell.** A plugin extending the block editor's inspector sidebar registers via `@wordpress/plugins` against the editor's slot tree; nothing in `admin.json` changes. The shell sees one app and is unaware.

---

## 8. Bindings and keyboard shortcuts

Keyboard shortcuts in the shell are install-level decisions and live in `admin.json`'s `bindings` block:

```jsonc
"bindings": [
  { "shortcut": "Mod+K", "invoke": "core:command-palette" },
  { "shortcut": "Mod+/", "invoke": "core:keyboard-shortcuts-help" }
]
```

Each binding maps a keystroke to an app invocation. The invoked app must have `platform.triggerable: true` in its manifest. When the binding fires, the engine ensures the app's region is mounted (mounting it if ephemeral) and applies the app's platform requests (focus trap, autofocus target, etc.).

`shortcut` syntax follows `@wordpress/keyboard-shortcuts`: `Mod+K` (Cmd on macOS, Ctrl elsewhere), `Shift+Mod+P`, `Alt+ArrowDown`, etc.

**Precedence: app shortcuts win when focus is inside the app's DOM.** This is the same model `@wordpress/keyboard-shortcuts` already uses for context-scoped shortcuts. When the user has an editor focused and presses a keystroke the editor handles internally (Cmd+S to save), the editor's shortcut fires. When focus is outside any app (or in an app that doesn't handle the keystroke), the shell's bindings fire.

**Conflict resolution.** If two `bindings` entries register the same shortcut, the later entry wins (cascade-aware: user origin > role > site > plugin > core). If the active app declares an internal shortcut matching a binding, the app wins when focused; the binding wins when not.

**Binding context** (optional, future). Apps that need to scope which keystrokes they capture can declare a `binding-context` in their manifest. The shell consults this when deciding precedence. v1 ships with the simple "focus-inside-app wins" rule; per-context refinement is a v1.x or v2 addition.

---

## 9. Tokens and styling

Token architecture is unchanged in fundamentals from the prior draft (§4.0–§4.3 of the 2026-04-29 spec). Three documents (`tokens.json`, `admin.json`, `theme.json`), three tiers (primitives → common → component), WPDS-native style emission, compat bridge for legacy consumers. **The change in this draft: `tokens.json` ships in v1, not v2.** The DTCG loader, alias resolver, and core baseline are all v1 deliverables.

Refer to the prior draft sections §4.0–§4.3 for full detail. The summary below captures the model.

### 9.1 Three-document design system

Authors bring any DTCG-conformant primitive token system in `tokens.json`. WordPress dictates only the *names* of the consumer slots in `admin.json.styles` (the WPDS token matrix at the pinned `$wpds` version, plus chrome extension slots) and `theme.json.settings` (the existing theme.json schema). Authors map their tokens into those slots via DTCG curly-brace aliasing:

```jsonc
// tokens.json (DTCG, author-owned shape)
{ "color": { "$type": "color",
             "brand": { "500": { "$value": "#3858e9" } } } }

// admin.json.styles (WPDS-shaped consumer slots)
"styles": {
  "color": { "bg": { "interactive": { "brand": { "strong": "{color.brand.500}" } } } }
}

// theme.json.settings (existing theme.json shape)
"settings": {
  "color": { "palette": [ { "slug": "accent", "color": "{color.brand.500}" } ] }
}
```

One brand token in tokens.json fans out to three destinations: WPDS surface (admin), legacy admin/components (compat bridge), frontend (`--wp--preset--*`). Re-branding edits one token.

`tokens.json` is a valid W3C DTCG (2025.10) file. Discovery: site root > theme root > plugin root > core baseline. Origins merge via the same cascade as `admin.json` (§10).

### 9.2 WPDS-native styles

`admin.json.styles` is shaped 1:1 to the WPDS token matrix (`color`, `dimension`, `border`, `elevation`, `font`, `density`) plus a chrome extension namespace for shell-only slots (`sidebar`, `toolbar`, `siteHub`, `content`, etc. — surfaces WPDS does not yet describe).

Output is three CSS variable families emitted at `:root`:

1. **WPDS surface** — full matrix as `--wpds-*`. Sourced from `wp-includes/css/dist/theme/style.css` defaults; author overrides applied.
2. **Chrome extensions** — shell-only slots as `--wp-admin-shell--chrome--*`.
3. **Compat bridge** — fixed map of legacy `--wp-admin-theme-color*` and `--wp-components-*` aliased onto WPDS so unmodified `@wordpress/components` and wp-admin pages inherit shell theming.

**Why `:root`, not `#wp-admin-shell`.** Portal-mounted UI (the `@wordpress/commands` palette, modals, tooltips, dropdowns) renders outside the `#wp-admin-shell` DOM tree, into portals attached at the document root. Emitting at `:root` means those portals inherit shell theming. Per-region and per-app overrides keep narrower selectors (`[data-region-id]` / `[data-app-id]`) and still win for descendants because of selector specificity.

Top-level `$wpds` field on `admin.json` pins the WPDS slot matrix to a WordPress version. CI parity test against `wp-includes/css/dist/theme/style.css` flags drift on each WordPress release.

Per-region and per-app style overrides live under `styles.regions[*]` and `styles.applications[*]`. Apps and regions can override any WPDS or chrome slot; overrides scope to the region/app via `[data-region-id]` / `[data-app-id]` selectors.

### 9.3 Engine-shipped default styling

Engines ship `default-style` blocks in their region templates (§4.2). These are CSS values, possibly with token references (`{styles.chrome.sidebar.background}`), that produce the engine's default appearance. The resolver merges:

1. Engine template's `default-style` (lowest priority)
2. `admin.json` region's `style` override
3. User-origin overrides via cascade

Final emission is region-scoped CSS at mount time.

---

## 10. Origin cascade

Five origins, deepest-wins, unchanged from prior draft:

| Origin | Source | Mutable by |
|---|---|---|
| `core` | Built-in defaults | Plugin updates |
| `plugin` | Plugin/theme `admin.json` | Authors at install time |
| `site` | `wp_admin_shell_site_config` option | Site admins via Settings |
| `role` | `wp_admin_shell_role_config` option | Site admins per-role |
| `user` | `wp_admin_shell_user_prefs` user meta | Each user |

Merge semantics: scalars and refs replace; objects deep-merge; keyed arrays merge by id; plain arrays use deepest-origin replacement.

**Restrict-only override semantics:** higher origins can disable, restrict, or hide what lower origins enable; they cannot expand beyond what a lower origin permits. A plugin shell removing an app makes that removal final for the install. To let downstream origins override a field, the declaring origin opts in via `customizable` on that field (renamed from prior draft's `userCustomizable` for clarity — overrides apply to *all* downstream origins, not just user). Default is `false`.

Resolver caching (§4.4.3 of prior draft) carries forward unchanged: per-`(active_shell, current_user_id, role)` cache key, hash-of-origins invalidation, `WP_Object_Cache` + transient layers.

Per-role and per-user shell selection (§4.4.4 of prior draft) carries forward unchanged: site default → role override → user override; user override only when `user-switchable: true` on the active shell.

---

## 11. Capabilities and permissions

Four-layer gating, unchanged from prior draft (§8 there):

1. **Region visibility (fast-path).** Region with `capability` field; user lacks → entire subtree skipped.
2. **App visibility.** App's `capability` requirement; routes to inaccessible apps render 403.
3. **Manifest-declared capabilities.** App manifest's `capabilities[]` is the floor; admin.json cannot lower.
4. **REST API enforcement.** Authoritative; UI checks are advisory.

Navigation drilldowns with all-gated children disappear recursively (logic in `core:navigation` app, not runtime kernel).

Capability resolution uses `core-data`'s `canUser()` for entity-level checks; custom caps resolve via `/wp-admin-shell/v1/can/{capability}` REST endpoint. Per-request cached.

`default-route` falls through to first permitted route on capability denial.

---

## 12. Runtime contract

### 12.1 Mount and config delivery

PHP renders an empty mount point at `admin.php?page=wp-admin-shell`. Merged manifests + admin.json delivered via `wp_add_inline_script` + `wp_json_encode` on `window.wpAdminShell.config`. Default wp-admin chrome hidden via plugin CSS. Authentication: existing cookie session; REST nonces via `wpApiSettings.nonce`.

### 12.2 Resolution sequence

The runtime resolves artifacts in this order:

1. Load merged `admin.json` from cascade (core + plugin + site + role + user origins).
2. Load app manifests for every app referenced in `regions` and `routes`. Validate each app is registered.
3. Load engine manifest for the configured `engine`.
4. Resolve token references: engine `default-style` against merged `tokens.json` + admin.json `styles`; admin.json `styles` against merged `tokens.json`.
5. Validate each region's `app` config against the app manifest's `config-schema`.
6. Validate user capabilities against each app's `capabilities[]` and each region's `capability`.
7. Mount the engine.
8. Engine instantiates regions per the merged region tree.
9. Each region with a fixed `app` mounts it.
10. The router decomposes the current URL; for each region with `route-key`, the URL slot value is matched against the routes block and the matching app mounts in that region.
11. Bindings register with the engine's keyboard shortcut layer.

### 12.3 Data layer

Two rules, unchanged:

1. **Entity reads/writes through `@wordpress/core-data`.** `useEntityRecord`, `useEntityRecords`, `useEntityProp`, `editEntityRecord`, `saveEditedEntityRecord`. Gives undo/redo, auto-batching, caching, optimistic updates, `_fields`/`_embed` resolution.
2. **Non-entity calls through `@wordpress/api-fetch`.** Custom plugin endpoints, autosave, anything `core-data` doesn't model.

Raw `fetch()` is forbidden in shell or app code. Plugin-contributed apps follow the same rule.

**App coordination through the data layer.** Apps that need to coordinate (post list updates → preview reflects) subscribe to the same `core-data` entity. No selection bus, no event bus, no shell-mediated messaging. The data layer is the coordination mechanism.

### 12.4 Command palette

The command palette is one possible app-region pairing. The default shell declares an overlay region (instantiated from `core:overlay` template) holding `core:command-palette`, plus a binding (`Mod+K → core:command-palette`).

`core:command-palette` composes `@wordpress/commands` internally. Plugins extend it via `@wordpress/commands` registration, not through the shell. The shell sees one app.

Power users can pin the palette inline by changing the region template from `core:overlay` to `core:sidebar` (or any persistent template). No shell-side plumbing required; the app renders responsively into whatever region it's given.

---

## 13. Extensibility model

Six extension points, in increasing power:

1. **Filter merged config.** `wp_admin_shell_data` (PHP) / `wp.hooks.applyFilters('adminShell.data', config)` (JS). Last-mile mutation.
2. **Filter per-origin configs.** `wp_admin_shell_data_{origin}` for each cascade origin.
3. **Register a `plugin:*` app.** New app available for routing/regions to reference. App manifest + script/style registration.
4. **Register a region template.** Plugin contributes a new template engines can reference, or that admin.json can instantiate. Templates are part of an engine's manifest; plugins extending an engine declare additions via `wp_admin_shell_register_template( $engine_id, $template )`.
5. **Register an engine.** Most powerful. Plugin ships an `engine.json` and the engine's React/JS implementation. Used for floating-window, tiling, custom paradigms.
6. **Register a complete shell.** A plugin programmatically registers an entire `admin.json` (e.g., based on user role at runtime).

What is **not** an extension point, by design:

- Patching the shell's React tree.
- Replacing core apps by re-registering the same id (registry rejects duplicates; use a different id and route to it).
- Loading code outside WordPress's enqueue system.
- Adding new ARIA roles or new platform services from plugin code (these are governed centrally; plugins request additions via the spec process).
- Re-enabling features an upstream origin restricted (cascade is restrict-only).
- Adding region "slots" or other new composition primitives. The architecture is one-region-one-app with nested regions; that is the only composition mechanism the shell governs.

App-internal extensibility (`PluginSidebar`, `InspectorControls`, `BlockControls`, etc.) is **not a shell extension point**. It is governed by each app's own React extension API (`@wordpress/plugins`, slot/fill, filters). The shell does not see or govern these.

---

## 14. Compatibility and migration

**WordPress version floor.** WordPress 6.7+ for MVP. v1 requires 6.5+ for stable Block Bindings and `Requires Plugins:` plugin headers (both stabilized 6.5); 6.8+ recommended for speculative loading filters. v2 may require 6.9+ if `core:dashboard` adopts `core/post-data` or `core/term-data` bindings (both stabilized 6.9).

**Browser support.** Evergreen. ES2020+, dynamic imports, CSS custom properties, CSS logical properties. Matches `@wordpress/scripts` defaults.

**Data compatibility.** All persistence via WordPress core options/user-meta and REST API. No shadow datastore. `uninstall.php` removes shell-specific options.

**Coexistence with wp-admin.** Standard wp-admin remains fully functional in v1/v2. v3 introduces drop-in URL interception. Through v1 and v2, shell mounts at one page (`admin.php?page=wp-admin-shell`); both admins coexist as peers. Site setting controls default landing; per-user opt-out available.

**Migration of MVP `admin.json` files.** v0 (MVP flat shape: `branding`, `applications`, `navigation`, `toolbar` at root) is the only previous shape that actually shipped. The runtime accepts v0 files and normalizes them to the new shape internally — MVP `applications` map to apps in `regions` and `routes`; the MVP toolbar dropdown's shell-switcher is dropped per §6.4.1 of the prior draft. A `wp admin-shell upgrade-config <name>` command writes the normalized form back to disk for authors who want a clean v1 file.

**Earlier draft.** The 2026-04-29 draft of this spec described a different v1 shape (`settings`/`styles` partition, region "kinds", selection event bus). That draft was never implemented. References to it in this document are historical only; there is no migration path from it because no shipping config used it.

---

## 15. Roadmap

Three releases after MVP. Each builds on the prior.

### v1 — Comprehensive shell (target: ~3-4 months post-MVP)

Goal: complete authoring surface (three artifacts, full vocabulary, two engines), plus the token system fully landed.

- [ ] Three-artifact configuration: app manifest, engine manifest, admin.json
- [ ] Region vocabulary: role + layout + platform + routing
- [ ] Nested regions; one-region-one-app rule
- [ ] URL-driven navigation; per-region `route-key` resolution; multi-region URL state via query parameters
- [ ] URL parameter interpolation in routes config
- [ ] Bindings block; app-internal-shortcut precedence
- [ ] **`tokens.json` primitives layer** (DTCG loader, ref resolver, baseline `core:tokens.json`)
- [ ] Five-origin cascade with restrict-only semantics
- [ ] `customizable` affordance declarations
- [ ] Resolver caching matching `WP_Theme_JSON_Resolver`
- [ ] Per-role and per-user shell selection (architecture in place; UI exposed v2)
- [ ] WPDS-native styles + chrome extension namespace + compat bridge
- [ ] **Two engines:**
  - `core:wp-default-layout` (sidebar/topbar/main/detail/overlay)
  - `core:floating-layout` (proves the engine boundary; demo-quality acceptable)
- [ ] Built-in apps:
  - `core:posts` (used for both posts and pages — `post-type` is config), `core:media`, `core:profile`, `core:editor`
  - `core:simple-editor`, `core:command-palette`, `core:user-menu`, `core:site-hub`, `core:primary-nav`
  - `core:settings`, `core:users`, `core:comments`
  - `core:site-editor` (native mount, replacing iframe)
- [ ] Four-layer capability gating with recursive nav drilldown removal
- [ ] JSON Schemas published at `schemas.wp.org/admin/v1.json`, `admin-app/v1.json`, `admin-engine/v1.json`
- [ ] WP-CLI: `wp admin-shell list|activate|register|upgrade-config`
- [ ] Coordinate `tokens.json` proposal with WordPress core for theme.json v3 alignment

**Provisional surfaces.** v1 marks the engine API and the platform-services vocabulary as **provisional** until external validation. Both are likely to need refinement once third-party engines and apps build against them. The artifact shapes (admin.json, app.json, engine.json) are stable; the lower-level engine APIs (how engines render regions, what they receive as props) are subject to revision in v1.x without major-version bump.

### v2 — Extension ecosystem (target: ~6-8 months post-MVP)

- [ ] `tokens-json-spec.md` published as standalone spec; coordinated WordPress core proposal
- [ ] Third engine: `core:tiling-layout` or `core:single-pane-layout` (engine API stress-test)
- [ ] Shell switcher exposed in user prefs UI
- [ ] `core:dashboard` composable widget host
- [ ] `core:plugins` plugins management app
- [ ] Plugin-contributed engines (worked example: `plugin:foo/floating-windows-pro`)
- [ ] Plugin-contributed region templates
- [ ] Per-shell command scoping refinements
- [ ] Reference `plugin:woocommerce/orders` app as worked example
- [ ] Engine API stabilization (move from provisional to stable)
- [ ] Platform-services vocabulary stabilization

### v3 — Drop-in replacement + polish (target: ~9-12 months post-MVP)

- [ ] **Drop-in replacement of `wp-admin`**: URL interception of `/wp-admin/*`, transparent route-to-app mapping for legacy URLs, parity coverage
- [ ] Schema-aware authoring tool (visual `admin.json` editor)
- [ ] Shell marketplace patterns (sharing/exporting bundles)
- [ ] Performance: app-level code splitting, suspense boundaries per app
- [ ] Accessibility audit with assistive tech (NVDA, VoiceOver, JAWS)
- [ ] Mobile layout adaptation (single-pane engine becomes default mobile)
- [ ] i18n: shell-config strings translatable
- [ ] WordPress UI theme engine integration: parts of `tokens.json` generated from theme config

---

## 16. Non-goals

These are explicitly out of scope. Listing them prevents scope creep arguments later.

- **Replacing the block editor.** The shell composes the editor; it does not reimplement it.
- **Replacing the REST API.** The shell consumes the API.
- **Multisite network admin shell.** Network-admin-specific features (site management, network plugins) deferred.
- **Headless WordPress tooling.** Shell runs inside `wp-admin` against authenticated session.
- **PHP-rendered admin pages.** Shell is React-only. Plugins wanting shell integration ship JS.
- **Backwards compatibility with `admin_menu` / `add_submenu_page` hooks.** They continue to work in standard wp-admin; they do not appear in the shell unless an app explicitly wraps the legacy screen (typically via the SDK's legacy-PHP-region helper — see open question #10).
- **Theme-based shells.** `admin.json` is plugin-shipped, not theme-shipped, in v1.
- **Live engine switching.** Switching engines reloads the shell.
- **Per-region engines.** A single engine renders the entire shell.
- **Region "slots" as a separate primitive.** Regions can hold child regions; that is the multi-app composition mechanism. There is no shell-level slot/fill concept distinct from React component composition.
- **Apps controlling their container size or position.** Apps are intrinsically responsive; engines own geometry. Apps that demand specific dimensions break the composability promise.
- **Shell-mediated inter-app messaging.** Apps coordinate via the data layer (`core-data` entities, custom Redux stores, URL state). The shell does not provide a pub/sub bus, selection bus, or message-passing API for apps.
- **Plugin extensibility surfaces at the shell layer.** Plugins extend apps via the apps' own React extension APIs (`@wordpress/plugins`, slot/fill, filters). The shell's extensibility is at the artifact layer (register apps, register engines, register templates).

---

## 17. Open questions

Real unknowns. Each needs resolution before its dependent roadmap item ships.

1. **Engine API stabilization timeline.** v1 ships engines as provisional. When does the API freeze? Lean: v2 stabilizes once at least one third-party engine has built against it and surfaced friction. Track via the `core:floating-layout` and `core:tiling-layout` implementations.

2. **Platform-services vocabulary growth.** v1 ships ~8 services. Sketching real apps surfaces 1-2 more per app. How does the spec accept additions without breaking compatibility? Lean: minor-version field additions; engines may opt to honor; unhonored fields are no-ops with logged warning.

3. **Region template registration from plugins.** v1 ships engines with their templates baked in. Plugins extending an engine with new templates use `wp_admin_shell_register_template( $engine_id, $template )` — but the engine has to know how to render the template's layout. How does an engine discover and render plugin-contributed templates? Open. Needs design before v2.

4. **Routing config interpolation namespace conflicts.** §6.3 disambiguates by container field, but as the spec grows, more curly-brace contexts may emerge (e.g., capability templates `"capability": "{post-type}"` ?). When does the syntax need explicit namespacing (`{url:id}` vs `{token:color.brand.500}`)? Lean: revisit if a third interpolation context appears.

5. **DTCG type-coercion table.** Resolver must convert DTCG values into CSS strings appropriate to the slot. Need exhaustive coercion table covering 13 DTCG types × CSS-string formats. Authoring belongs in `tokens-json-spec.md`.

6. **WPDS slot drift across WordPress versions.** `$wpds` pin governs; CI parity test flags drift. Compat shim for renamed slots — one minor cycle of dual emission, deprecation notice — needs concrete policy. Align with WP core's deprecation policy.

7. **Token-file extension and discovery.** §9 accepts both `tokens.json` and `*.tokens.json`. DTCG convention is `*.tokens.json`. WordPress convention is no dot prefix. Final pick affects schema URL, IDE config, and core proposal. Lean: accept both, document `tokens.json` as canonical.

8. **App config: where does install-level customization live?** §4.1 puts app config in admin.json's routes block (and per-region `config` for fixed-app regions). Some customizations feel install-level (default sidebar in editor) but live as app config. Line is fuzzy but workable. Track real cases before formalizing a clearer split.

9. **Binding-context vocabulary.** §8 punts per-context refinement to v1.x or v2. What does a context look like? Probably a string identifier matching an app's manifest declaration. Needs design before any app needs it.

10. **Legacy PHP rendering helper.** The metabox container pattern (PHP-rendered HTML inside React) recurs for any ported app. Needs an SDK helper (`<LegacyPHPRegion screen="..." />` or similar) before plugin-contributed apps can port from wp-admin cleanly. Not v1 shell spec; v1 SDK.

11. **Intrinsic-responsiveness test harness.** Apps must render correctly at multiple sizes. Test harness mounts apps in main, detail, floating-min, single-pane-mobile and produces visual diffs. Quality gate, not a spec field. Needs implementation by v2.

12. **Multi-region URL state for shells with many routable regions.** §6.4 covers two routable regions. Shells with three or more (multiple side-by-side detail panes) will need a more deliberate URL encoding. Defer until a real shell needs it.

---

## 18. Appendix A: Resolved architectural decisions

This appendix preserves decisions made across the design process so context is not lost when their motivations stop being immediately visible.

**One region, one app** (resolved 2026-05-01). A region holds exactly one app. Multi-app patterns produced by region templates declaring child regions. Rationale: keeps the shell out of arbitrary-app-coexistence layout decisions; nested regions provide the composition mechanism without introducing a separate "slots" primitive.

**Region "slots" rejected as separate primitive** (resolved 2026-05-01). Earlier sketches proposed engine-level slots inside regions for multi-app composition. Replaced by recursive nested regions. Rationale: "slot" carries React component-composition baggage that confuses two distinct layers; calling everything a "region" makes the architecture uniform and addressable.

**Apps do not declare layout** (resolved 2026-05-01). App manifests contain `role`, `platform`, and `capabilities` but no `preferred-layout`, `width`, `min-size`, etc. Engines own all geometry. Rationale: matches the browser-website analogy exactly; the only way apps stay composable across radically different engines (chrome, floating, tiling, single-pane) is by making zero assumptions about their container.

**Selection event bus removed** (resolved 2026-05-01). The earlier draft's `respondsTo` / selection-scope / event-bus machinery is removed. App coordination uses the data layer (`core-data` entities, Redux stores, URL state). Rationale: the bus was engine-mediated inter-app messaging, which is application logic, not platform service. Apps that need to coordinate already have mechanisms; the shell adding another was wrong-layer.

**Region "kind" enum removed** (resolved 2026-05-01). The earlier draft's fixed taxonomy (`persistent | overlay | drawer | floating | tiled`) is replaced by `role` (ARIA) + `platform` (services) + `layout` (CSS) + `routing` (URL participation). Rationale: kinds were a contract written against imagined engine consumers; the new vocabulary anchors on existing W3C/WHATWG specifications and admits engine variation without enumerated kinds.

**URL-only navigation; no HTML-attribute overload** (resolved 2026-05-04; supersedes the 2026-05-01 "HTML link semantics with `target`" decision). Earlier resolution proposed using `<a target>` to direct links to specific shell regions. Reversed because HTML's `target` names browsing contexts, not in-page DOM regions; using non-special target values would either spawn new tabs natively or require document-level click interception that's easy to break (middle-click, Cmd-click, drag-to-bookmark, "Open in new tab"). New resolution: navigation is URL-driven end-to-end. The URL is the full app state. Each routable region declares a `route-key` naming the URL slot it reads from (`_self` = primary path; any other value = same-named query parameter). Authors write plain `<a href>` links — `target` keeps native HTML meaning; the browser handles clicks; the router observes URL changes and recomputes per-region state. See §6.

**Three-layer region vocabulary: role / layout / platform** (resolved 2026-05-01). Plus `routing` as a separate fourth concern. Rationale: each layer maps to an existing standardized vocabulary (ARIA, CSS, browser/OS platform services), with shell-specific fields only as a small remainder. `behavior` was renamed to `platform` to make the browser-analog test explicit.

**`tokens.json` ships in v1** (resolved 2026-05-01). Earlier draft deferred to v2. Lifted to v1 because v1 without aliasing produces a worse author experience than today's `theme.json settings.custom` pattern. Rationale: completes the design system thought; without it, authors must inline ~150 WPDS slot values per shell.

**Three artifacts, three responsibilities** (resolved 2026-05-01). App manifest (intrinsic), engine manifest (capabilities + templates), admin.json (install decisions). Earlier draft conflated app-intrinsic and install-level concerns in one `admin.json`. Rationale: installing a new app should not require admin.json edits for the app to work as itself; admin.json should contain only install-time decisions a site author plausibly makes.

**Plugin extensibility is at the app layer, not the shell layer** (resolved 2026-05-01). The block editor's `PluginSidebar`, `InspectorControls`, etc. are governed by the editor app's React extension API, not by the shell. Rationale: validated by sketching the post editor against the architecture; the shell sees one app and has no business knowing about its extension surface.

**`userCustomizable` renamed to `customizable`** (resolved 2026-05-01). The prior draft used `userCustomizable` because user prefs were the most common downstream override consumer. With per-role and per-user origins both in the cascade, the affordance applies to all downstream origins, not just user. Renamed for accuracy. Default value (`false`) and semantics (opt-in declaration of which fields downstream origins may modify) are unchanged.

**Top-level `routes` (was `routing`)** (resolved 2026-05-01; refined 2026-05-04). The prior internal vocabulary used `routing` for both the URL-pattern table at admin.json's root *and* a region's URL participation declaration. Renamed the top-level table to `routes` (URL patterns → app + config tuples; no `target` field per the URL-only navigation decision) so it doesn't collide with the per-region `routing.route-key` field (which names the URL slot a region reads from). Two distinct concepts, two distinct names.

**WPDS-native styles** (resolved 2026-04-29; carried forward). admin.json `styles` is shaped 1:1 to the WPDS token matrix. Output is `--wpds-*` (full surface) plus `--wp-admin-shell--chrome--*` (chrome) plus a fixed compat bridge. Rationale: `@wordpress/components` and `@wordpress/ui` converge on `--wpds-*`; setting shell theming on the WPDS surface means every component consumer inherits shell overrides automatically.

**`$wpds` field is top-level on admin.json** (resolved 2026-04-30; carried forward). Pins the WPDS slot matrix to a WordPress version. Top-level rather than under `styles` because it governs the entire resolver, not just styles.

**`color.palette[]` not in admin.json** (resolved 2026-04-30; carried forward). Palette is a `theme.json` concern (block bindings, block supports). Apps in the shell read `--wpds-*` directly.

**Live engine switching not supported** (resolved 2026-04-29; carried forward). Switching engines reloads. Multiple sub-layouts within an engine are the engine's responsibility (e.g., "dwindle" vs "master" in a tiling engine), not separate engines.

**Per-region engines not supported** (resolved 2026-04-29; carried forward). One engine renders the entire shell.

**Bindings between theme.json and admin.json** (resolved 2026-04-29; carried forward). Both are sibling consumers of one DTCG `tokens.json`. They share primitives via aliasing; no automatic palette feed.

**Per-role + per-user shell selection** (resolved 2026-04-29; carried forward). Cascade: site default → role override → user override. Restrict-only semantics.

**Capability gating: region fast-path** (resolved 2026-04-29; carried forward). Region cap skips mounting children. App caps still apply when region cap absent. Both layers run when both present.

**Aliasing syntax is DTCG curly-brace** (resolved 2026-04-29; carried forward). `"{path.to.token}"` everywhere. Resolver follows alias chains and detects cycles.

**`tokens.json` shape is author-defined** (resolved 2026-04-29; carried forward). Any DTCG (W3C 2025.10) token file is valid. WordPress dictates only the *names* of the consumer slots in admin.json/theme.json `styles`. Tooling interop with Figma Tokens Studio, Style Dictionary, etc. comes for free.

**Drop-in wp-admin replacement is v3** (resolved 2026-04-29; carried forward). v1 and v2 mount at one page; v3 intercepts `/wp-admin/*` URLs. Architecture is built for the eventual handoff so v3 doesn't require restructuring.

---

## 19. References

In-repo:

- [`wp-admin-shell-mvp-spec.md`](./wp-admin-shell-mvp-spec.md) — MVP design spec
- [`wp-admin-shell-design-spec-2026-04-29.md`](./wp-admin-shell-design-spec-2026-04-29.md) — prior architecture draft (preserved for context)
- [`admin-customization-prior-art.md`](./admin-customization-prior-art.md) — Calypso, CIAB, Untangling, MSD context
- [`shell-architecture-research.md`](./shell-architecture-research.md) — GNOME, KDE, COSMIC, tiling WMs, VS Code, fish/nu — patterns informing this design
- [`wordpress-design-tokens-catalog.md`](./wordpress-design-tokens-catalog.md) — WPDS surface inventory, three coexisting WP token systems, migration trajectory
- [`wp-admin-screen-inventory.md`](./wp-admin-screen-inventory.md) — full surface map of `wp-admin` for porting prioritization
- [`tokens-json-spec.md`](./tokens-json-spec.md) — planned standalone spec for the DTCG primitives layer (v2 deliverable)

External:

- W3C Design Tokens Community Group spec (DTCG, 2025.10) — `https://tr.designtokens.org/format/`
- WordPress `theme.json` reference — `https://developer.wordpress.org/themes/global-settings-and-styles/`
- `@wordpress/core-data` reference — `https://developer.wordpress.org/block-editor/reference-guides/data/data-core/`
- `@wordpress/components` Slot/Fill — `https://developer.wordpress.org/block-editor/reference-guides/components/slot-fill/`
- `@wordpress/commands` — `https://developer.wordpress.org/block-editor/reference-guides/packages/packages-commands/`
- `@wordpress/keyboard-shortcuts` — `https://developer.wordpress.org/block-editor/reference-guides/data/data-core-keyboard-shortcuts/`
- WAI-ARIA 1.2 landmark roles — `https://www.w3.org/TR/wai-aria-1.2/#landmark_roles`
- Style Dictionary (DTCG build tool) — `https://styledictionary.com/`
- Figma Tokens Studio (DTCG editor) — `https://tokens.studio/`
- KDE Global Themes — `https://develop.kde.org/docs/plasma/theme/global-themes/`
- VS Code contribution points — `https://code.visualstudio.com/api/references/contribution-points`