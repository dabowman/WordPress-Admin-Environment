# WordPress Admin Shell — Design Spec

> **Status:** Living design document. Authoritative source for the WP Admin Shell architecture beyond MVP.
> **Last revised:** 2026-04-29
> **Replaces:** Nothing. The MVP spec ([`wp-admin-shell-mvp-spec.md`](./wp-admin-shell-mvp-spec.md)) remains the record of the proof-of-concept implementation that validated the approach. This document defines the comprehensive system that MVP work feeds into.

---

## Table of contents

1. [Vision](#1-vision)
2. [Principles](#2-principles)
3. [Architecture](#3-architecture)
4. [`admin.json` configuration layer](#4-adminjson-configuration-layer)
   0. [The three-document design system (`tokens.json` + `admin.json` + `theme.json`)](#40-the-three-document-design-system)
   1. [Top-level shape](#41-top-level-shape)
   2. [`settings` — capabilities](#42-settings--capabilities)
      - [Region kinds](#421-region-kinds)
      - [Pinned vs routable apps](#422-pinned-vs-routable-apps)
      - [Selection event bus](#423-selection-event-bus)
      - [Capability gating](#424-capability-gating)
   3. [`styles` — presentation](#43-styles--presentation)
      - [Expected slot contract](#431-expected-slot-contract)
      - [CSS emission](#432-css-emission)
      - [Worked example](#433-worked-example)
   4. [Origin cascade](#44-origin-cascade)
      - [Restrict-only override semantics](#441-override-stack-restrict-only-semantics)
      - [Customization affordances](#442-customization-affordances)
      - [Resolver and caching](#443-resolver-and-caching)
      - [Per-role and per-user shell selection](#444-per-role-and-per-user-shell-selection)
   5. [Discovery and registration](#45-discovery-and-registration)
   6. [Schema and versioning](#46-schema-and-versioning)
5. [Source contract](#5-source-contract)
   1. [Built-in `core:*` application sources](#51-built-in-core-sources)
   2. [Plugin-contributed `plugin:{slug}` sources](#52-plugin-contributed-pluginslug-sources)
   3. [`iframe:{url}` escape hatch](#53-iframeurl-escape-hatch)
   4. [Layout engine sources](#54-layout-engine-sources)
   5. [Region sources](#55-region-sources)
6. [Runtime contract](#6-runtime-contract)
   1. [Mount and config delivery](#61-mount-and-config-delivery)
   2. [Routing](#62-routing)
   3. [Data layer](#63-data-layer)
   4. [Command palette](#64-command-palette)
   5. [Notices and slot system](#65-notices-and-slot-system)
7. [Extensibility model](#7-extensibility-model)
8. [Capabilities and permissions](#8-capabilities-and-permissions)
9. [Theming and tokens](#9-theming-and-tokens)
10. [Compatibility and migration](#10-compatibility-and-migration)
11. [Roadmap](#11-roadmap)
12. [Non-goals](#12-non-goals)
13. [Open questions](#13-open-questions)
14. [References](#14-references)

---

## 1. Vision

WP Admin Shell is a configurable admin environment for WordPress. The traditional `wp-admin` is a single, fixed UI shaped over twenty years for one audience: the technical site administrator. WP Admin Shell separates the **admin interface** from the **WordPress system**, then lets a single declarative document — `admin.json` — describe an admin experience tailored to a specific role, brand, or workflow.

A site can ship multiple `admin.json` files. Different users can land in different shells. The same WordPress install can present a focused writer environment, a branded client portal, and a full developer console — without forking core, without custom plugins per surface, and without sacrificing the REST API contract that powers everything.

The MVP proved this is technically and ergonomically viable. This document describes the comprehensive design the MVP feeds into.

---

## 2. Principles

The design rests on seven principles. When a decision is unclear, they are the tiebreakers.

1. **Declarative over imperative.** `admin.json` describes *what* exists, not *how* to render it. The runtime interprets the declaration. Lesson from `theme.json`, KDE Global Themes, VS Code `package.json` contributions.
2. **Convention parity with `theme.json`.** Anyone who can read `theme.json` should be able to read `admin.json`. Same vocabulary (`settings`/`styles`), same cascade idea (origins merge deepest-wins), same schema discipline (versioned JSON Schema at `schemas.wp.org`), same extension hooks (`*_data` filters).
3. **Three-tier design system: primitives → common → component.** A separate `tokens.json` document holds the author's design system as a standard W3C DTCG (Design Tokens Community Group, 2025.10) token file. `theme.json` and `admin.json` are sibling consumers — each declares the *names* WordPress expects (theme.json's `settings.color.palette[].slug`, admin.json's WPDS token-matrix paths) and *aliases* those names to whatever tokens the author has defined. Authors bring any DTCG-conformant design system (Carbon, Material, custom); WordPress dictates only the consumer slot names, not the primitive shape. This is a deliberate fix for theme.json's awkward `settings.custom` injection pattern.
4. **Pure data, no code.** Configuration is JSON. Code lives elsewhere — in PHP filters, in registered React components, in plugin source registrations. This keeps configs portable across stores, AI-generatable, and trivially diff-able.
5. **REST API is the only contract.** The shell never reaches into PHP-rendered admin internals. Every screen reads/writes through `/wp-json/`. If the API can't do it, the shell can't do it (or it lives in the iframe escape hatch until the API can).
6. **Open extension, closed defaults.** Plugins extend by registering new sources, filtering data, contributing slots — never by patching the shell. The shell ships a small, opinionated set of `core:*` sources; everything else comes through declared extension points.
7. **The escape hatch is a feature.** `iframe:{url}` is permanent infrastructure, not a transitional crutch. WordPress will always have screens that aren't worth porting. Wrapping them keeps the shell useful from day one and forever after.

---

## 3. Architecture

Three layers, mirroring the structure of every shell environment surveyed (GNOME, KDE, VS Code, fish, Hyprland):

| Layer | What it is | WordPress equivalent |
|---|---|---|
| **System** | Capabilities exposed to the shell | REST API + `@wordpress/core-data` entities |
| **Shell** | Runtime kernel: config loader, router, registries, event bus, token compiler | React runtime (this plugin) |
| **Configuration** | Declarative description of the shell | `admin.json` (this document) |

The shell layer is itself composed of three primitives:

- **Layout engines** — pluggable components that arrange regions into DOM. Default `core:site-editor-layout`. Swappable for tiling, floating, single-pane, or custom (§5.4).
- **Regions** — typed containers (sidebar, toolbar, content, preview, overlay, drawer, etc). Each region is itself an app whose source is a region container (§5.5). Custom regions are first-class.
- **Applications** — addressable mountable units. Some are pinned into regions (`core:navigation`, `core:user-menu`). Some are routable — the router places them into routable regions based on the URL hash.

Everything is regions and apps. How they're presented = layout engine. The runtime kernel does not know what a sidebar is; it knows how to ask the layout engine to render a set of regions, and how to ask each region to render its contained apps.

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser                                │
│                                                              │
│   ┌────────────────────────────────────────────────────────┐ │
│   │              Configuration layer                        │ │
│   │              (admin.json — merged origins)              │ │
│   └────────────────────────────────────────────────────────┘ │
│                            │                                  │
│   ┌────────────────────────▼───────────────────────────────┐ │
│   │              Shell runtime kernel                       │ │
│   │  Config resolver · Router · Source registry · Event bus │ │
│   │  Token compiler · Capability gate · Cascade merger      │ │
│   └────────────────────────┬───────────────────────────────┘ │
│                            │                                  │
│   ┌────────────────────────▼───────────────────────────────┐ │
│   │              Layout engine (pluggable)                  │ │
│   │   core:site-editor-layout (default) | tiling | floating │ │
│   │   | single-pane | plugin:{slug}/{name}                  │ │
│   └────────────────────────┬───────────────────────────────┘ │
│                            │                                  │
│   ┌────────────────────────▼───────────────────────────────┐ │
│   │   Regions (typed containers, themselves apps)           │ │
│   │   persistent · overlay · drawer · floating · tiled      │ │
│   └────────────────────────┬───────────────────────────────┘ │
│                            │                                  │
│   ┌────────────────────────▼───────────────────────────────┐ │
│   │   Applications (core:* / plugin:* / iframe:*)           │ │
│   └────────────────────────┬───────────────────────────────┘ │
│                            │                                  │
│        @wordpress/core-data · @wordpress/api-fetch           │
└────────────────────────────┼──────────────────────────────────┘
                             │
                    WordPress REST API
                    /wp-json/wp/v2/...
```

The boundaries are strict:

- The **system layer** does not know the shell exists. WordPress is unaware its REST API is being consumed by a shell instead of by `wp-admin`.
- The **shell runtime kernel** does not know about specific applications, regions, or layout engines. It loads sources by string identifier, asks the layout engine to render, and routes hash changes to routable regions.
- The **layout engine** does not know about specific apps. It receives a region tree and arranges it; regions render their contained apps independently.
- The **configuration layer** does not know about React. It is data.

Crossing a boundary is a design smell. If a `core:*` source needs to call WordPress directly via PHP-injected globals, that source has leaked through the system layer. If a layout engine needs to know that a region contains a navigation app, the engine has leaked through the region boundary.

---

## 4. `admin.json` configuration layer

### 4.0 The three-document design system

WP Admin Shell does not invent a design system. It joins one. Three sibling documents form a layered design system:

```
                ┌─────────────────────────────────────┐
                │   tokens.json (W3C DTCG-conformant) │   author's design system
                │   author-defined shape              │   (any DTCG file works)
                └──────┬──────────────────────────┬───┘
                       │                          │
       aliased by author                aliased by author
                       │                          │
                       ▼                          ▼
        ┌──────────────────────┐  ┌──────────────────────┐
        │   admin.json         │  │   theme.json         │   declares the *names*
        │   styles.{slot}      │  │   styles.{slot}      │   WordPress expects;
        │   = "{token.path}"   │  │   = "{token.path}"   │   author maps tokens
        │                      │  │                      │   into those slots
        └──────────┬───────────┘  └───────────┬──────────┘
                   │                          │
                   ▼                          ▼
              WordPress reads             WordPress reads
              named slots:                named slots:
              --wp-admin-shell--*        --wp--preset--* (existing)
```

**The contract is the *names*, not the shape.** WordPress defines two consumer-slot vocabularies: `theme.json` (existing schema — `settings.color.palette[].slug`, `settings.typography.fontSizes[].slug`, etc.) and `admin.json.styles` (this spec — the WPDS token matrix, e.g. `color.bg.interactive.brand.strong`, `dimension.gap.md`). Authors must produce values for those slots. The values can be literal (`"#3b82f6"`, `"16px"`) or — preferably — DTCG aliases into a tokens.json file. The author's tokens.json shape is unconstrained; only the names admin.json/theme.json *expose* are constrained.

Three tiers, mapping to the DTCG architecture:

| Tier | Where it lives | Author owns shape? | Examples |
|---|---|---|---|
| **Primitives** — raw values, not tied to use | `tokens.json` (DTCG) | **Yes** — any DTCG-conformant shape | Carbon `$color.blue.50`, Material `md.ref.palette.primary40`, custom `brand.cobalt.500` |
| **Common tokens** — semantic, consumer-scoped | `admin.json.styles`, `theme.json.styles` (existing slots) | **No** — names dictated by WordPress | `palette[].slug = "accent"`, `fontSizes[].slug = "md"` |
| **Component tokens** — fine-grained, per-element overrides | `admin.json.styles.regions[*]`, `admin.json.styles.applications[*]`, `theme.json.styles.blocks[*]` | Partial — slot structure dictated, fields are slots themselves | `regions.sidebar.color.background = "{color.surface}"` |

**Why this fixes a `theme.json` ergonomic problem.** Today, theme authors who want primitive tokens inject them into `settings.custom.*` (which compiles to `--wp--custom--*` CSS variables, undocumented and ad-hoc), then alias them into presets via the awkward `var(--wp--custom--*)` pattern. The result is non-portable, IDE-hostile, not interchangeable with industry tooling (Figma Tokens Studio, Style Dictionary), and discoverable only through reading other themes. Switching to a standalone DTCG token file means any design system already represented in DTCG (most are) drops in unchanged.

#### 4.0.1 `tokens.json` is a DTCG file (not a WP-specific shape)

`tokens.json` MUST be a valid W3C DTCG (2025.10) token file. Format quick reference:

- **File extension.** `.tokens.json` is preferred (DTCG convention). The WordPress runtime also accepts a plain `tokens.json` filename for parity with `theme.json`/`admin.json`. Either way, content type is `application/design-tokens+json`.
- **Structure.** Tokens are JSON objects with `$value`, `$type`, optional `$description`/`$deprecated`/`$extensions`. Groups inherit `$type` to children.
- **Aliases.** DTCG curly-brace syntax: `"$value": "{color.blue.500}"`. The path is dot-separated within the same DTCG file.
- **Token types.** All 13 DTCG types supported: `color`, `dimension`, `fontFamily`, `fontWeight`, `duration`, `cubicBezier`, `number`, `typography`, `shadow`, `border`, `gradient`, `transition`, `strokeStyle`.

Example (Carbon-style):

```json
{
  "color": {
    "$type": "color",
    "blue": {
      "50":  { "$value": { "colorSpace": "srgb", "components": [0.93, 0.96, 1] } },
      "500": { "$value": { "colorSpace": "srgb", "components": [0.23, 0.51, 0.96] } },
      "900": { "$value": { "colorSpace": "srgb", "components": [0.05, 0.28, 0.63] } }
    },
    "neutral": {
      "0":   { "$value": { "colorSpace": "srgb", "components": [1, 1, 1] } },
      "900": { "$value": { "colorSpace": "srgb", "components": [0.07, 0.07, 0.07] } }
    }
  },
  "size": {
    "$type": "dimension",
    "1": { "$value": { "value": 4,  "unit": "px" } },
    "2": { "$value": { "value": 8,  "unit": "px" } },
    "4": { "$value": { "value": 16, "unit": "px" } }
  }
}
```

Example (Material-style, equally valid — author's choice):

```json
{
  "md": {
    "ref": {
      "palette": {
        "$type": "color",
        "primary40": { "$value": { "colorSpace": "srgb", "components": [0.4, 0.49, 0.92] } }
      }
    }
  }
}
```

WordPress does not require any particular path. Both files are accepted as-is.

CSS variable emission: each DTCG token compiles to a `--wp--token--{path-with-dashes}` CSS custom property at admin-page mount time. `color.blue.500` → `--wp--token--color--blue--500`. The runtime emits these in a `<style id="wp-admin-shell-tokens">` block. Authors and engines may consume them directly when convenient, but the canonical consumption path is through the named slots in admin.json/theme.json (§4.0.2).

#### 4.0.2 Aliasing tokens into admin.json / theme.json slots

WordPress dictates the *slot names* downstream consumers expect. For `theme.json` these are the existing schema slot names (e.g., `settings.color.palette[].slug`). For `admin.json` these are the WPDS token-matrix paths (e.g., `color.bg.interactive.brand.strong`) plus the chrome extension slugs. Authors fill those slots — typically by aliasing into their tokens.json, sometimes by inlining literal values.

The aliasing syntax is the same DTCG curly-brace form, expanded by the resolver against the loaded tokens.json:

```jsonc
// admin.json — top-level $wpds + WPDS-shaped slots
"$wpds": "6.9",
"styles": {
  "color": {
    "bg": {
      "interactive": { "brand":   { "strong": "{color.blue.500}", "strong-active": "{color.blue.600}" } },
      "surface":     { "neutral": { "strong": "{color.neutral.0}", "weak": "{color.neutral.50}" } }
    },
    "fg":     { "content":     { "neutral": { "default": "{color.neutral.900}" } } },
    "stroke": { "focus":       { "brand":   "{color.blue.500}" } }
  },
  "font":      { "family": { "body": "{font.sans}" }, "size": { "md": "13px" } }
}

// theme.json — existing palette/preset shape
"settings": {
  "color":      { "palette": [ { "slug": "accent", "color": "{color.blue.500}", "name": "Accent" } ] },
  "typography": { "fontFamilies": [ { "slug": "system", "fontFamily": "{font.sans}", "name": "System" } ] }
}
```

Resolver rules:

- **Curly-brace strings inside expected-slot values are DTCG aliases.** `"{color.blue.500}"` resolves against the merged tokens.json.
- **Literal CSS values still work.** A theme that wants to skip tokens.json entirely can write `"color": "#3858e9"`; backwards compatible with current theme.json.
- **Resolution is deep.** A DTCG alias may itself reference another alias (`{color.brand.primary}` → `{color.blue.500}`); the resolver follows chains and detects cycles.
- **Type coercion.** When admin.json/theme.json expects a CSS color string but the DTCG token is `{ "colorSpace": "srgb", "components": [...] }`, the resolver converts to the appropriate CSS form (`rgb()`, `oklch()`, `color(srgb ...)`) per the slot's declared output. Same for dimensions, durations, etc.
- **Schema enforces slot names, not token shapes.** The admin.json schema validates that the `styles` tree matches the WPDS matrix at the pinned `$wpds` version; the theme.json schema validates the theme.json slot enum. Neither cares what the resolved value's source shape is.

If an author's tokens.json doesn't have a token named `color.blue.500` (e.g., because it uses Material's `md.ref.palette.primary40`), the author writes `"{md.ref.palette.primary40}"` instead. The slot name (`color.bg.interactive.brand.strong` or `settings.color.palette.accent`) is the contract WordPress reads; the alias path is the author's mapping.

#### 4.0.3 The expected-slot contract

WordPress declares two fixed slot vocabularies that consumers must fill (or that fall back to `core` defaults). Slot names are documented in:

- **theme.json** — existing schema at `https://schemas.wp.org/trunk/theme.json` (`settings.color.palette[].slug`, `settings.typography.fontSizes[].slug`, etc.)
- **admin.json** — this spec, §4.3.1: the WPDS token matrix at the pinned `$wpds` version (sourced from `wp-includes/css/dist/theme/style.css`) plus the chrome extension slug list.

Neither document constrains the *shape* or *naming* of the underlying DTCG tokens. The author can use Carbon, Material, Polaris, Tailwind-style scales, or hand-curated names. The mapping job is one alias-string per slot.

WordPress core governs the WPDS matrix; the shell tracks it via the `$wpds` version pin (§4.3.1). New WPDS slots become available when the shell bumps the pin. Chrome slugs are stable across spec versions and additive — new slugs may be added, existing slugs do not change. Authors may add custom slugs under `chrome.*` for engines that declare `requiredTokens`; the WPDS surface is not author-extensible.

#### 4.0.4 Discovery and precedence

`tokens.json` (or `*.tokens.json`) is discovered at:

1. **Site root** (`{site}/tokens.json` or `{site}/.tokens/`) — site-wide tokens. Canonical home, like `theme.json`.
2. **Theme root** (`{theme}/tokens.json`) — theme-shipped tokens.
3. **Plugin root** (`{plugin}/tokens.json`) — plugin-shipped tokens.

Multiple files merge under the same cascade rules as admin.json origins (§4.4): site > theme > plugin > core. Within a single tokens.json file the existing DTCG semantics apply; cross-file conflicts (two files defining the same token path) log a warning and resolve by origin order.

The shell ships a `core` tokens.json baseline so missing/empty author files don't break the resolver — every expected-slot has a fallback value.

#### 4.0.5 Roadmap status of `tokens.json`

The `tokens.json` layer is a **v2** roadmap item for shipped infrastructure. v1 inlines literal values in admin.json `styles` and runs without a tokens.json loader. The schema and resolver land in v2 alongside the WordPress-core coordination work.

The full proposal warrants its own spec document: [`tokens-json-spec.md`](./tokens-json-spec.md) (planned, not yet written). That spec covers DTCG conformance details, the resolver's type-coercion rules, the expected-slot contract for both admin and theme consumers, build-tool integration (Style Dictionary, Tokens Studio export/import), and the WordPress-core proposal pathway. Coordinating with WordPress core before public publication is essential — `theme.json` v3 may want to adopt the same model, and a divergent path forks the ecosystem.

---

### 4.1 Top-level shape

`admin.json` mirrors `theme.json`'s top-level partition: capabilities go in `settings`, presentation goes in `styles`. Metadata sits at the root.

```jsonc
{
  "$schema": "https://schemas.wp.org/admin/v1.json",
  "version": 1,
  "$wpds": "6.9",                     // pins the WPDS slot matrix (§4.3.1)

  "name": "developer-admin",          // kebab-case, unique per install
  "title": "Developer Admin",         // human-readable
  "description": "Full admin shell with all WordPress capabilities exposed.",

  "settings": { /* capabilities — see §4.2 */ },
  "styles":   { /* presentation — see §4.3 */ }
}
```

`$wpds` is a **top-level field**, not nested under `styles`. The pin governs the entire resolver — slot validation, defaults loading, and compat-bridge derivation — not just the styles tree. The resolver loads `wpds-defaults-{$wpds}.json` as the implicit `core` baseline so missing author values cannot break the runtime.

This is a structural change from the MVP's flat layout. The flat layout (`branding`, `applications`, `navigation`, `toolbar` all at root) is preserved as a deprecated reading path; new authoring uses the partitioned form. The runtime accepts both via the cascade resolver (§4.4), which normalizes flat configs into the partitioned shape on load.

### 4.2 `settings` — capabilities

`settings` declares **what is available** in this shell. This is the equivalent of `theme.json`'s `settings` block, which declares what features blocks may use.

The settings model is built on three primitives: **shell** (which layout engine renders the experience), **regions** (typed containers), and **applications** (mountable units that fill regions or are placed by the router).

```jsonc
"settings": {

  // ──────────────────────────────────────────────────────────────────
  // SHELL — which layout engine renders, and which regions exist.
  // ──────────────────────────────────────────────────────────────────
  "shell": {
    "layoutEngine": "core:site-editor-layout",   // §5.4 — pluggable
    "config": {
      "arrangement": "sidebar-content",          // engine-specific preset
      "regions": [                               // ordered list of region ids
        "toolbar",
        "sidebar",
        "content",
        "preview",
        "command-palette"
      ]
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // REGIONS — typed containers. Each region is itself an app whose
  // source produces a container. Custom regions are first-class —
  // any plugin can register a new region source and declare it here.
  // ──────────────────────────────────────────────────────────────────
  "regions": {

    "sidebar": {
      "source": "core:sidebar-region",
      "kind": "persistent",                      // hint to layout engine
      "config": {
        "position": "left",
        "width": 280,
        "collapsible": true
      },
      "contains": [ "site-hub", "nav" ]          // app ids to mount inside
    },

    "toolbar": {
      "source": "core:toolbar-region",
      "kind": "persistent",
      "config": { "height": 48 },
      "contains": [ "command-trigger", "user-menu", "shell-switcher" ]
    },

    "content": {
      "source": "core:content-region",
      "kind": "persistent",
      "config": {
        "router": true,                          // routable: router fills it
        "selectionScope": "content"              // selections published here
      },
      "contains": []                             // populated by router
    },

    "preview": {
      "source": "core:preview-region",
      "kind": "persistent",
      "config": {
        "position": "right",
        "width": 480,
        "respondsTo": "content.selection"        // listens to selection scope
      },
      "contains": [ "preview-pane" ]
    },

    "command-palette": {
      "source": "core:overlay-region",
      "kind": "overlay",
      "config": {
        "trigger": { "command": "core/open-command-palette",
                     "shortcut": "Mod+K" },
        "dismiss": "Escape | overlay-click",
        "anchor": "viewport-top",
        "width": 600
      },
      "contains": [ "command-picker" ]
    }
  },

  // ──────────────────────────────────────────────────────────────────
  // APPLICATIONS — addressable mountable units. Some are pinned into
  // regions by id (the system apps that compose the shell). Some are
  // routable — apps with a `route` field are placed into routable
  // regions when the URL hash matches.
  // ──────────────────────────────────────────────────────────────────
  "applications": {

    // System apps — placed in regions via `contains`.
    "site-hub":        { "source": "core:site-hub",        "config": {} },
    "command-trigger": { "source": "core:command-trigger", "config": {} },
    "user-menu":       { "source": "core:user-menu",       "config": {} },
    "shell-switcher":  { "source": "core:shell-switcher",  "config": {} },
    "command-picker":  { "source": "core:command-picker",  "config": {} },
    "preview-pane":    { "source": "core:preview-pane",
                         "config": { "follow": "content.selection" } },

    // The navigation app. Items reference other apps by id (or sub-screens,
    // separators, external links — see core:navigation config schema).
    "nav": {
      "source": "core:navigation",
      "config": {
        "items": [
          { "app": "posts" },
          { "app": "pages" },
          { "app": "media" },
          { "separator": true },
          { "screen": "system", "label": "System", "icon": "admin-tools",
            "items": [ { "app": "users" }, { "app": "settings" } ] },
          { "label": "View Site", "href": "/", "external": true,
            "icon": "external" }
        ]
      }
    },

    // Routable user apps. `route` makes them mountable in routable regions.
    "posts": {
      "source": "core:posts",
      "title": "Posts",
      "icon": "post",
      "capability": "edit_posts",
      "route": "/posts",
      "config": { "postType": "post" }
    },
    "pages": {
      "source": "core:posts",
      "title": "Pages",
      "icon": "page",
      "capability": "edit_pages",
      "route": "/pages",
      "config": { "postType": "page" }
    },
    "media": {
      "source": "core:media",
      "title": "Media",
      "icon": "media",
      "route": "/media",
      "config": {}
    }
  },

  // Default route on first load. Defaults to first routable app.
  "defaultRoute": "/posts",

  // Extra commands bound by this shell. Built-in commands are always present.
  "commands": [
    { "id": "shell/switch-to-content-author",
      "label": "Switch to Content Author shell",
      "action": { "type": "switchShell", "name": "content-author" } }
  ]
}
```

**Why this lives in `settings`.** Each entry is a *capability declaration* — this layout engine is selected, this region exists, this app is available, this command can fire. No visual decisions live here. Same semantic split `theme.json` makes between `settings.color.palette` (the palette is *available*) and `styles.color.background` (the background is *set to* a palette value).

#### 4.2.1 Region kinds

Regions get a `kind` field — a hint the layout engine uses to decide how to render. The kind taxonomy is fixed (custom kinds would force every engine to handle every kind):

| Kind | Behavior | Examples |
|---|---|---|
| `persistent` | Always in DOM. Stable position. | Sidebar, toolbar, content, preview |
| `overlay` | Mounted on demand via trigger. Modal-like. Dismissible. | Command palette, AI chat, modal dialogs |
| `drawer` | Slides in from a side. Persistent until dismissed. | Settings panel, contextual help |
| `floating` | Draggable, resizable window. State persists per-user. | Floating-engine windows |
| `tiled` | Split pane in a tiling tree. Resizable splits. | Tiling-engine panes |

Layout engines may collapse kinds they don't differentiate (a tiling engine renders `floating` as `tiled`). Engines document which kinds they honor; configs that depend on a kind the active engine doesn't support degrade gracefully.

#### 4.2.2 Pinned vs routable apps

An app appears at runtime in one of two ways:

- **Pinned** — listed in a region's `contains[]` by id. Mounts when the region mounts. Persists across navigation. Use for system apps (nav, toolbar buttons, preview pane).
- **Routable** — declares a `route` field. The router places it into the active routable region (any region with `config.router: true`) when the URL hash matches. Default routable region: `content`.

A single app cannot be both pinned and routable in the same shell — pick one. The same source can back both: `core:posts` pinned in a side-panel listing, *and* `core:posts` routable as a full content view, are two distinct app entries with different ids and configs.

#### 4.2.3 Selection event bus

Regions communicate via a small typed event bus. The runtime kernel exposes selection scopes; regions publish selections; other regions subscribe via `respondsTo`.

- A region with `config.selectionScope: "content"` publishes selection events to scope `content`.
- A region with `config.respondsTo: "content.selection"` receives those events; the apps it contains can read the current selection via the `useSelection( scope )` hook.

Scopes are namespaced (`content.selection`, `preview.selection`, `nav.activeItem`). Custom regions may declare custom scopes. The bus is a `core/admin-shell/selection` Redux store under the hood.

**Lifetime: per-mount by default; opt-in `persist: true` on the publishing region keeps the scope's last value across remount.** Selections clear when the publishing region unmounts unless the region declares `config.persist: true` for that scope. This keeps the common case simple (selections are ephemeral UI state tied to what is on screen) while allowing apps that need cross-mount memory (a recently-edited post id, a sticky filter) to opt in. Persisted scopes are stored under `wp_admin_shell_user_prefs.selection[<scope>]` and reload on shell mount. Subscribers always read whatever value is current; the persist flag is a publisher-side concern.

#### 4.2.4 Capability gating

Apps and regions both accept a `capability` field. The runtime hides apps and regions the user lacks capability for, both from rendering and from direct routing. Source-declared capabilities (§5) are the floor — even if an app omits `capability`, the source's required caps still apply. See §8.

### 4.3 `styles` — presentation

`styles` declares **how the shell looks**. The shell consumes WordPress's existing `--wpds-*` design-token surface (the `@wordpress/theme` package, autogenerated by Terrazzo) directly. The shell does not invent a parallel namespace; it fills the existing one. The full WPDS surface, its sibling systems, and their cross-relationships are catalogued in [`wordpress-design-tokens-catalog.md`](./wordpress-design-tokens-catalog.md).

**Why WPDS-native.** Per the catalog's migration trajectory, `@wordpress/components` and `@wordpress/ui` are converging on `--wpds-*`. Setting our shell theming on the WPDS surface means every present and future component consumer inside the shell picks up the shell's overrides automatically — including rebrand-via-tokens, density variants, and per-shell color schemes.

**The token contract is the layout engine contract.** Every visual property a layout engine renders — surfaces, borders, shadows, spacing, type, motion, focus — must resolve to a `--wpds-*` token. Engines never hardcode colors, sizes, or timings. Engines reading shell-only chrome slots (sidebar, toolbar, siteHub, content card) read `--wp-admin-shell--chrome--*` instead; that small extension namespace covers the surfaces WPDS does not yet describe.

`styles` is a tree shaped 1:1 to the WPDS token matrix. Each leaf accepts a DTCG alias (`"{color.brand.500}"`), a literal CSS value (`"#3858e9"`, `"16px"`), or an inline DTCG object (`{ "$value": "#3858e9", "$type": "color" }`). The resolver walks the tree and for each leaf emits a CSS variable whose name is the path joined by `-`, prefixed `--wpds-`. The tree mirrors WPDS slot names verbatim — no translation table.

```jsonc
"styles": {
  // Brand identity for this shell.
  "branding": {
    "logo":  "./assets/acme-logo.svg",
    "title": "Acme Corp",                 // overrides site title in SiteHub
    "icon":  "./assets/icon.svg"          // square mark, fallback to logo
  },

  // WPDS surface — output is --wpds-*. Path = wpds slot name verbatim.
  "color": {
    "bg": {
      "interactive": {
        "brand":   { "strong": "{color.brand.500}", "strong-active": "{color.brand.600}",
                     "weak":   "transparent",       "weak-active":   "{color.brand.50}" },
        "neutral": { "strong": "{color.neutral.900}", "strong-active": "{color.neutral.950}",
                     "strong-disabled": "{color.neutral.200}",
                     "weak":   "transparent",         "weak-active":   "{color.neutral.100}",
                     "weak-disabled": "transparent" },
        "error":   { "strong": "{color.red.600}",  "strong-active": "{color.red.700}",
                     "weak":   "transparent",       "weak-active":   "{color.red.50}" }
      },
      "surface": {
        "neutral": { "strong": "{color.neutral.0}", "weak": "{color.neutral.50}",
                     "default": "{color.neutral.100}" },
        "brand":   "{color.brand.50}",
        "error":   "{color.red.100}",
        "info":    "{color.blue.100}",
        "success": "{color.green.100}",
        "warning": "{color.yellow.100}",
        "caution": "{color.amber.100}"
      },
      "thumb":   { "brand":   { "default": "{color.brand.500}",   "active": "{color.brand.500}" },
                   "neutral": { "weak":    "{color.neutral.500}", "weak-active": "{color.neutral.600}",
                                "disabled": "{color.neutral.300}" } },
      "track":   { "neutral": { "default": "{color.neutral.300}", "weak": "{color.neutral.200}" } }
    },
    "fg": {
      "content":     { "neutral":  { "default": "{color.neutral.900}", "weak": "{color.neutral.600}" },
                       "error":    { "default": "{color.red.900}",     "weak": "{color.red.600}" },
                       "info":     { "default": "{color.blue.900}",    "weak": "{color.blue.600}" },
                       "success":  { "default": "{color.green.900}",   "weak": "{color.green.700}" },
                       "warning":  { "default": "{color.yellow.900}",  "weak": "{color.yellow.700}" },
                       "caution":  { "default": "{color.amber.900}",   "weak": "{color.amber.700}" } },
      "interactive": { "brand":    { "default": "{color.brand.500}",   "active": "{color.brand.500}",
                                     "strong":  "{color.neutral.50}",  "strong-active": "{color.neutral.50}" },
                       "neutral":  { "default": "{color.neutral.900}", "active": "{color.neutral.900}",
                                     "disabled": "{color.neutral.500}",
                                     "weak":    "{color.neutral.600}", "weak-disabled": "{color.neutral.500}",
                                     "strong":  "{color.neutral.100}", "strong-active": "{color.neutral.100}",
                                     "strong-disabled": "{color.neutral.500}" },
                       "error":    { "default": "{color.red.600}",     "active": "{color.red.600}",
                                     "strong":  "{color.neutral.50}",  "strong-active": "{color.neutral.50}" } }
    },
    "stroke": {
      "focus":       { "brand": "{color.brand.500}" },
      "interactive": { "brand":   { "default": "{color.brand.500}", "active": "{color.brand.700}" },
                       "neutral": { "default": "{color.neutral.500}", "active": "{color.neutral.600}",
                                    "disabled": "{color.neutral.300}", "strong": "{color.neutral.600}" },
                       "error":   { "default": "{color.red.600}",  "active": "{color.red.800}",
                                    "strong":  "{color.red.600}" } },
      "surface":     { "brand":   { "default": "{color.brand.300}", "strong": "{color.brand.500}" },
                       "neutral": { "default": "{color.neutral.300}", "weak": "{color.neutral.200}",
                                    "strong":  "{color.neutral.500}" },
                       "error":   { "default": "{color.red.300}",  "strong": "{color.red.600}" },
                       "info":    { "default": "{color.blue.300}", "strong": "{color.blue.600}" },
                       "success": { "default": "{color.green.300}","strong": "{color.green.700}" },
                       "warning": { "default": "{color.yellow.300}","strong": "{color.yellow.700}" } }
    }
  },

  "dimension": {
    "base":    "{spacing.4}",
    "gap":     { "xs": "{spacing.4}", "sm": "{spacing.8}", "md": "{spacing.12}",
                 "lg": "{spacing.16}", "xl": "{spacing.24}", "2xl": "{spacing.32}", "3xl": "{spacing.40}" },
    "padding": { "xs": "{spacing.4}", "sm": "{spacing.8}", "md": "{spacing.12}",
                 "lg": "{spacing.16}", "xl": "{spacing.20}", "2xl": "{spacing.24}", "3xl": "{spacing.32}" }
  },

  "border": {
    "radius": { "xs": "{radius.1}", "sm": "{radius.2}", "md": "{radius.4}", "lg": "{radius.8}" },
    "width":  { "xs": "{border.1}", "sm": "{border.2}", "md": "{border.4}", "lg": "{border.8}",
                "focus": "{border.focus}" }
  },

  "elevation": {
    "x-small": "{shadow.xs}",
    "small":   "{shadow.sm}",
    "medium":  "{shadow.md}",
    "large":   "{shadow.lg}"
  },

  "font": {
    "family":      { "body":    "{font.family.sans}",
                     "heading": "{font.family.sans}",
                     "mono":    "{font.family.mono}" },
    "size":        { "xs": "11px", "sm": "12px", "md": "13px",
                     "lg": "15px", "xl": "20px", "2xl": "32px" },
    "line-height": { "xs": "16px", "sm": "20px", "md": "24px",
                     "lg": "28px", "xl": "32px", "2xl": "40px" },
    "weight":      { "regular": 400, "medium": 499 }
  },

  // Density variant. Resolver writes `data-wpds-density` attribute on the
  // shell root. WPDS already ships density-keyed gap/padding overrides.
  "density": "default",   // "default" | "compact" | "comfortable"

  // Shell-only chrome — surfaces WPDS does not describe.
  // Output is --wp-admin-shell--chrome--*.
  "chrome": {
    "sidebar":  { "background": "{color.neutral.950}",
                  "foreground": "{color.neutral.50}",
                  "border":     "{color.neutral.800}",
                  "item": { "background":        "transparent",
                            "background-hover":  "{color.neutral.900}",
                            "background-active": "{color.brand.700}",
                            "foreground":        "{color.neutral.100}",
                            "foreground-active": "{color.neutral.0}" },
                  "width":      "240px" },
    "toolbar":  { "background": "{color.neutral.0}",
                  "foreground": "{color.neutral.900}",
                  "border":     "{color.neutral.200}",
                  "height":     "48px" },
    "siteHub":  { "background": "{color.neutral.950}",
                  "foreground": "{color.neutral.50}",
                  "icon-size":  "32px",
                  "padding":    "{spacing.16}" },
    "content":  { "background":      "{color.neutral.50}",
                  "card-background": "{color.neutral.0}",
                  "card-radius":     "{radius.8}",
                  "card-shadow":     "{shadow.sm}",
                  "card-padding":    "{spacing.24}",
                  "card-max-width":  "1200px" }
  },

  // Per-region style overrides. Same shape as styles, restricted to leaves.
  "regions": {
    "sidebar": { "color": { "bg": { "surface": { "neutral": { "strong": "{color.neutral.950}" } } } } }
  },

  // Per-application style overrides. Same shape.
  "applications": {
    "posts": { "color": { "bg": { "surface": { "neutral": { "strong": "{color.neutral.0}" } } } } }
  }
}
```

**DTCG alias resolution.** Strings of the form `"{path.to.token}"` are DTCG aliases (§4.0.2) resolved against the merged tokens.json. Literal CSS values still work — both forms coexist field-by-field.

**Within-document references.** When you need to point one slot at another inside admin.json (e.g., chrome's sidebar background should equal whatever `color.bg.surface.neutral.strong` resolves to), the same curly-brace syntax works with a `styles.` prefix: `"{styles.color.bg.surface.neutral.strong}"`. The resolver disambiguates: paths starting with a top-level token category in tokens.json (`color`, `spacing`, `radius`, etc.) resolve into tokens.json; paths starting with `styles.` resolve within admin.json.

#### 4.3.1 Expected slot contract

The required slot list **is the WPDS token matrix at a pinned WPDS version**. Authors do not write a flat slug list; they write the WPDS-shaped tree above. The `core` origin ships defaults for every WPDS slot, taken from the upstream Terrazzo output (`wp-includes/css/dist/theme/style.css`), so missing author values cannot break the runtime.

```jsonc
{
  "version": 1,
  "$wpds": "6.9",   // resolver loads wpds-defaults-6.9.json as the `core` baseline
  "styles": { /* WPDS-shaped tree */ }
}
```

A CI parity test parses the pinned WordPress's `dist/theme/style.css` and diffs against the snapshot. Added, renamed, or removed WPDS slots fail the build so we ship a coordinated bump on each WordPress release. See §13 for the open question on cross-version compat shims.

The chrome extension namespace adds shell-only slots WPDS does not yet describe:

| Path under `styles.chrome` | Output CSS variable |
|---|---|
| `sidebar.background` | `--wp-admin-shell--chrome--sidebar--background` |
| `sidebar.foreground` | `--wp-admin-shell--chrome--sidebar--foreground` |
| `sidebar.border` | `--wp-admin-shell--chrome--sidebar--border` |
| `sidebar.item.background` | `--wp-admin-shell--chrome--sidebar--item--background` |
| `sidebar.item.background-hover` | `--wp-admin-shell--chrome--sidebar--item--background-hover` |
| `sidebar.item.background-active` | `--wp-admin-shell--chrome--sidebar--item--background-active` |
| `sidebar.item.foreground` | `--wp-admin-shell--chrome--sidebar--item--foreground` |
| `sidebar.item.foreground-active` | `--wp-admin-shell--chrome--sidebar--item--foreground-active` |
| `sidebar.width` | `--wp-admin-shell--chrome--sidebar--width` |
| `toolbar.background` | `--wp-admin-shell--chrome--toolbar--background` |
| `toolbar.foreground` | `--wp-admin-shell--chrome--toolbar--foreground` |
| `toolbar.border` | `--wp-admin-shell--chrome--toolbar--border` |
| `toolbar.height` | `--wp-admin-shell--chrome--toolbar--height` |
| `siteHub.background` | `--wp-admin-shell--chrome--site-hub--background` |
| `siteHub.foreground` | `--wp-admin-shell--chrome--site-hub--foreground` |
| `siteHub.icon-size` | `--wp-admin-shell--chrome--site-hub--icon-size` |
| `siteHub.padding` | `--wp-admin-shell--chrome--site-hub--padding` |
| `content.background` | `--wp-admin-shell--chrome--content--background` |
| `content.card-background` | `--wp-admin-shell--chrome--content--card-background` |
| `content.card-radius` | `--wp-admin-shell--chrome--content--card-radius` |
| `content.card-shadow` | `--wp-admin-shell--chrome--content--card-shadow` |
| `content.card-padding` | `--wp-admin-shell--chrome--content--card-padding` |
| `content.card-max-width` | `--wp-admin-shell--chrome--content--card-max-width` |

Roughly 23 chrome-only slots. Authors may add custom slugs under `chrome.*`. Layout engines reading custom chrome slugs declare them via `EngineSource.requiredTokens` (§5.4) so the runtime validates at activation and surfaces a clear error when a config does not supply them.

The slot contract evolves additively across spec versions. WPDS slot churn is governed by the `$wpds` pin; chrome slugs are stable across spec versions.

#### 4.3.2 CSS emission

Three families are written into the shell stylesheet, in this order. **The runtime emits at `:root` rather than `#wp-admin-shell`** so portal-mounted UI (`@wordpress/commands` palette, modals, dropdowns) inherits shell theming — those portals render outside the `#wp-admin-shell` DOM tree. Per-region / per-app overrides (§4.3.7) keep their narrow `[data-region-id]` / `[data-app-id]` selectors and still win for descendants because of selector specificity. The `#wp-admin-shell` root selector below is illustrative; the actual emission site is `:root`.

```css
#wp-admin-shell {
  /* 1. WPDS surface — full matrix from styles tree. */
  --wpds-color-bg-interactive-brand-strong:        #3858e9;
  --wpds-color-bg-interactive-brand-strong-active: #2e49d9;
  /* …154 wpds vars… */

  /* 2. Chrome extensions — shell-only, no wpds analog. */
  --wp-admin-shell--chrome--sidebar--background: #0a0a0a;
  /* …chrome vars… */

  /* 3. Compat bridge — fixed map. Makes legacy WordPress consumers inherit
        shell theming without needing wpds awareness. */
  --wp-admin-theme-color:           var(--wpds-color-bg-interactive-brand-strong);
  --wp-admin-theme-color--rgb:      56, 88, 233;            /* derived numerically */
  --wp-admin-theme-color-darker-10: var(--wpds-color-bg-interactive-brand-strong-active);
  --wp-admin-theme-color-darker-20: rgb(23.69, 58.15, 214.31);
  --wp-admin-border-width-focus:    var(--wpds-border-width-focus);
  --wp-components-color-accent:     var(--wpds-color-bg-interactive-brand-strong);
  --wp-components-color-background: var(--wpds-color-bg-surface-neutral-strong);
  --wp-components-color-foreground: var(--wpds-color-fg-content-neutral);
}

#wp-admin-shell[data-wpds-density="compact"]      { /* WPDS density block applies as-is */ }
#wp-admin-shell[data-wpds-density="comfortable"]  { /* WPDS density block applies as-is */ }
```

The compat bridge is **static** — it lives in the resolver as a hardcoded post-pass, not in author files. Authors cannot remove or override the bridge; it is the contract that makes legacy `@wordpress/components`, wp-admin pages, and SCSS-compiled CSS inherit shell theming.

`--wp-admin-theme-color--rgb` and `-darker-20` need numeric derivation (RGB triplet, HSL lightness adjust). The resolver computes both from the resolved `bg-interactive-brand-strong` value at compile time. The brand value must terminate at a literal hex/rgb after alias chasing, so derivation is possible — the resolver surfaces a clear error if it terminates at an unresolvable `var()`.

`--wp-admin-theme-color--rgb` is consumed by `rgba(var(--wp-admin-theme-color--rgb), 0.04)` patterns in legacy SCSS-compiled CSS. The triplet must match the brand color or buttons render off-tinted on hover.

Sources, layout engines, and apps consuming admin styling reference the named variables. They do not read hex values, raw px, or hardcoded durations from inline styles.

#### 4.3.3 Worked example

One tokens.json drives both admin.json (WPDS output) and theme.json (theme.json output).

**Author writes one tokens.json:**

```jsonc
// /tokens.json — DTCG, author-owned shape
{
  "$schema": "https://design-tokens.org/schemas/2025-10/tokens.schema.json",

  "color": {
    "$type": "color",
    "brand":   { "500": { "$value": "#3858e9" }, "600": { "$value": "#2e49d9" },
                 "700": { "$value": "#2337c8" }, "50":  { "$value": "#ecf0f9" } },
    "neutral": { "0":   { "$value": "#ffffff" }, "50":  { "$value": "#f8f8f8" },
                 "100": { "$value": "#f0f0f0" }, "200": { "$value": "#e0e0e0" },
                 "300": { "$value": "#d8d8d8" }, "500": { "$value": "#8a8a8a" },
                 "600": { "$value": "#6d6d6d" }, "900": { "$value": "#1e1e1e" },
                 "950": { "$value": "#0a0a0a" } },
    "red":     { "100": { "$value": "#f6e6e3" }, "300": { "$value": "#daa39b" },
                 "600": { "$value": "#cc1818" }, "700": { "$value": "#b90000" },
                 "900": { "$value": "#470000" } }
  },

  "spacing": { "$type": "dimension",
               "4":  { "$value": "4px"  }, "8":  { "$value": "8px"  },
               "12": { "$value": "12px" }, "16": { "$value": "16px" },
               "20": { "$value": "20px" }, "24": { "$value": "24px" },
               "32": { "$value": "32px" }, "40": { "$value": "40px" } },

  "radius":  { "$type": "dimension",
               "1": { "$value": "1px" }, "2": { "$value": "2px" },
               "4": { "$value": "4px" }, "8": { "$value": "8px" } },

  "border":  { "$type": "dimension",
               "1": { "$value": "1px" }, "2": { "$value": "2px" },
               "focus": { "$value": "2px" } },

  "shadow":  { "$type": "shadow",
               "sm": { "$value": "0 1px 3px rgba(0,0,0,0.08)"  },
               "md": { "$value": "0 4px 12px rgba(0,0,0,0.12)" },
               "lg": { "$value": "0 12px 40px rgba(0,0,0,0.25)" } },

  "font":    { "family": { "$type": "fontFamily",
                           "sans": { "$value": "system-ui, -apple-system, sans-serif" },
                           "mono": { "$value": "Menlo, Consolas, monospace" } } }
}
```

**admin.json aliases tokens.json into WPDS slots** (excerpted to show the brand path end-to-end):

```jsonc
// /admin.json
{
  "version": 1,
  "$wpds": "6.9",
  "styles": {
    "color": {
      "bg":     { "interactive": { "brand": { "strong": "{color.brand.500}",
                                               "strong-active": "{color.brand.600}" } },
                  "surface":     { "neutral": { "strong": "{color.neutral.0}",
                                                "weak":   "{color.neutral.100}" } } },
      "fg":     { "content":     { "neutral": { "default": "{color.neutral.900}" } },
                  "interactive": { "brand":   { "strong":  "{color.neutral.0}" } } },
      "stroke": { "focus":       { "brand":   "{color.brand.500}" } }
    },
    "dimension": { "base": "{spacing.4}", "gap": { "md": "{spacing.12}" } },
    "border":    { "width": { "focus": "{border.focus}" } },
    "chrome":    { "sidebar": { "background": "{color.neutral.950}",
                                "foreground": "{color.neutral.50}",
                                "width":      "240px" } }
  }
}
```

**theme.json aliases the same tokens.json into theme.json slots:**

```jsonc
// /theme.json
{
  "$schema": "https://schemas.wp.org/trunk/theme.json",
  "version": 3,
  "settings": {
    "color": {
      "palette": [
        { "slug": "accent",     "name": "Accent",     "color": "{color.brand.500}" },
        { "slug": "background", "name": "Background", "color": "{color.neutral.0}" },
        { "slug": "foreground", "name": "Foreground", "color": "{color.neutral.900}" },
        { "slug": "muted",      "name": "Muted",      "color": "{color.neutral.500}" }
      ]
    },
    "typography": {
      "fontFamilies": [
        { "slug": "system", "name": "System", "fontFamily": "{font.family.sans}" },
        { "slug": "mono",   "name": "Mono",   "fontFamily": "{font.family.mono}" }
      ]
    },
    "spacing": {
      "spacingSizes": [
        { "slug": "20", "name": "Small",  "size": "{spacing.8}"  },
        { "slug": "30", "name": "Medium", "size": "{spacing.16}" },
        { "slug": "40", "name": "Large",  "size": "{spacing.24}" }
      ]
    }
  }
}
```

**Resolved CSS output:**

```css
/* admin.json output — written by shell, applied to #wp-admin-shell */
#wp-admin-shell {
  /* WPDS surface */
  --wpds-color-bg-interactive-brand-strong:        #3858e9;
  --wpds-color-bg-interactive-brand-strong-active: #2e49d9;
  --wpds-color-bg-surface-neutral-strong:          #ffffff;
  --wpds-color-bg-surface-neutral-weak:            #f0f0f0;
  --wpds-color-fg-content-neutral:                 #1e1e1e;
  --wpds-color-fg-interactive-brand-strong:        #ffffff;
  --wpds-color-stroke-focus-brand:                 #3858e9;
  --wpds-dimension-base:                           4px;
  --wpds-dimension-gap-md:                         12px;
  --wpds-border-width-focus:                       2px;
  /* …remaining wpds slots from core defaults… */

  /* Chrome extensions */
  --wp-admin-shell--chrome--sidebar--background: #0a0a0a;
  --wp-admin-shell--chrome--sidebar--foreground: #f8f8f8;
  --wp-admin-shell--chrome--sidebar--width:      240px;

  /* Compat bridge */
  --wp-admin-theme-color:           var(--wpds-color-bg-interactive-brand-strong);
  --wp-admin-theme-color--rgb:      56, 88, 233;
  --wp-admin-theme-color-darker-10: var(--wpds-color-bg-interactive-brand-strong-active);
  --wp-admin-theme-color-darker-20: rgb(23.69, 58.15, 214.31);
  --wp-admin-border-width-focus:    var(--wpds-border-width-focus);
  --wp-components-color-accent:     var(--wpds-color-bg-interactive-brand-strong);
  --wp-components-color-background: var(--wpds-color-bg-surface-neutral-strong);
  --wp-components-color-foreground: var(--wpds-color-fg-content-neutral);
}

/* theme.json output — written by core, applied site-wide */
:root {
  --wp--preset--color--accent:       #3858e9;
  --wp--preset--color--background:   #ffffff;
  --wp--preset--color--foreground:   #1e1e1e;
  --wp--preset--color--muted:        #8a8a8a;
  --wp--preset--font-family--system: system-ui, -apple-system, sans-serif;
  --wp--preset--font-family--mono:   Menlo, Consolas, monospace;
  --wp--preset--spacing--20:         8px;
  --wp--preset--spacing--30:         16px;
  --wp--preset--spacing--40:         24px;
}
```

Brand `#3858e9` flows from `tokens.json:color.brand.500` to four destinations: `--wpds-color-bg-interactive-brand-strong` (admin), `--wp-admin-theme-color` (legacy admin, via bridge), `--wp-components-color-accent` (legacy components, via bridge), and `--wp--preset--color--accent` (frontend, via theme.json). One token, four destinations, no duplication. To re-brand the shell + frontend, the author edits `color.brand.500` once.

### 4.4 Origin cascade

Multiple `admin.json` documents merge into the active config. Origins, deepest wins (highest priority last):

| Origin | Source | Mutable by | Purpose |
|---|---|---|---|
| **`core`** | Built-in defaults shipped with the plugin | Plugin updates | Sane fallback — empty `admin.json` works |
| **`plugin`** | `admin.json` registered by the active plugin/theme | Authors at install time | The shell as authored |
| **`site`** | Per-site overrides stored in `wp_admin_shell_site_config` option | Site admins via Settings | Site-level customization |
| **`role`** | Per-role overrides stored in `wp_admin_shell_role_config` option (keyed by role) | Site admins via Settings | Role-scoped feature gating |
| **`user`** | Per-user overrides stored in `wp_admin_shell_user_prefs` user meta | Each user via prefs UI | Density, accent, defaults |

Merge semantics are field-aware:

- **Scalars and refs**: replace.
- **Objects**: deep merge.
- **Arrays of items with `id`/`slug`/`name`**: keyed merge — entries with the same key replace each other; new entries append. `applications`, `palette`, `fontSizes` all use this rule.
- **Plain arrays without keys**: the deepest origin's array wins outright (consistent with how `theme.json` treats `templateParts`).

The merged config is the single source of truth at runtime. Filters run on each origin before merge (`wp_admin_shell_data_core`, `wp_admin_shell_data_plugin`, `wp_admin_shell_data_site`, `wp_admin_shell_data_role`, `wp_admin_shell_data_user`) and on the final merged result (`wp_admin_shell_data`). This mirrors `theme.json`'s `wp_theme_json_data_*` filter family.

#### 4.4.1 Override stack: restrict-only semantics

A higher origin can **restrict but not expand** what a lower origin allows. If the plugin shell disables an app or feature, no role or user override can re-enable it. This is the same model `theme.json`'s `appearanceTools` and per-block-supports flags use.

Each restrictable field accepts a normalized form:

```jsonc
"applications": {
  "posts": {
    "source": "core:posts",
    "config": { "postType": "post" },
    "userCustomizable": true              // user origin may override config
  }
}
```

If `userCustomizable` is `false` (or omitted, since the default is `false`), origins below the declaring origin cannot modify that entry. If `true`, origins below may modify it but cannot un-restrict it back upward. This matches block supports — features are available but not necessarily exposed by default.

Disabled-by-default rule: **anything an upstream origin removes stays removed.** A plugin shell that omits `core:plugins` from `applications` cannot have `core:plugins` re-added by a role or user origin. To make an app *available but disabled by default*, the plugin shell declares it with `"disabled": true` and `"userCustomizable": true`.

#### 4.4.2 Customization affordances

The shell declares which downstream customizations are *available* even if not *enabled* — the equivalent of block supports being declared but not always rendered in the inspector sidebar:

```jsonc
"applications": {
  "posts": {
    "source": "core:posts",
    "config": { "postType": "post" },
    "userCustomizable": [
      "config.perPage",
      "config.defaultView"
    ]
  }
}
```

`userCustomizable` accepts:
- `false` (default) — no downstream override allowed
- `true` — full downstream override allowed (any field on this entry)
- `string[]` — explicit list of dot-paths inside this entry that may be overridden

The user prefs UI (`core:appearance`, v1) reads this declaration to render only the controls a given shell allows. A shell can ship a feature with rich defaults and let the user adjust narrow aspects, without exposing the full surface.

The same mechanism applies at every level of the config (regions, applications, styles, layout engine config). Authors opt fields into customization explicitly.

#### 4.4.3 Resolver and caching

The cascade resolver follows `theme.json`'s pattern (`WP_Theme_JSON` + `WP_Theme_JSON_Resolver`):

- Origins are loaded lazily and cached.
- The merged config is computed once per `(active_shell, current_user_id, role)` triple.
- Cache key incorporates a hash of all origin contents — file mtimes for disk-backed origins, option versions for DB-backed origins.
- Cache invalidates on shell switch, user change, role change, or any origin write.
- The validated, merged config is stored in `WP_Object_Cache` under group `wp_admin_shell` for the request, and in a transient (`wp_admin_shell_resolved_<hash>`) for cross-request reuse.
- Source `configSchema` validation results are cached separately, keyed by `(sourceId, configHash)`, so re-validation on every mount is amortized.

Same caching strategy `theme.json` uses for its own resolver — proven scale, well-understood invalidation.

#### 4.4.4 Per-role and per-user shell selection

Three layers determine which shell a user sees, in order:

1. **Site default.** Stored in `wp_admin_shell_active_shell` option. Applies to everyone.
2. **Role override.** Stored in `wp_admin_shell_role_config[<role>].shell`. Applies to all users with that role; takes precedence over site default. Role overrides also contribute their own origin to the cascade for the matching user.
3. **User override.** Stored in `wp_admin_shell_user_prefs.shell`. Per-user; takes precedence over role and site. Available only when the active shell sets `userSwitchable: true` at root.

A user with no role or user override gets the site default. A role override changes the shell for everyone in that role. A user override changes only that user. All three combine through the cascade — the active shell defines the structure, and role/user origins layer modifications on top within the limits the shell allows (§4.4.1, §4.4.2).

### 4.5 Discovery and registration

Three registration paths:

1. **Convention path.** A plugin places `admin.json` at its root. On `init`, the runtime auto-registers it as a shell with `name` taken from the file. This is the `theme.json`-equivalent zero-config path.
2. **Multi-shell path.** A plugin places shells in `{plugin}/shells/*.json`. Each is registered. The MVP's three bundled shells use this path.
3. **Programmatic path.** A plugin calls `wp_admin_shell_register( $name, $config_array_or_path )` from PHP, or the JS equivalent registers via `dispatch( 'wp-admin-shell' ).registerShell( name, config )`. Used for dynamic configs.

The active shell selection is determined by the cascade in §4.4.4 (site → role → user).

#### 4.5.1 `admin.json` as the trigger for the shell environment

The long-term design intent is that the presence of `admin.json` activates the shell experience the same way `theme.json` activates the Site Editor for block themes:

- **Theme parallel.** A theme with `theme.json` is treated as a block theme — the Site Editor turns on, classic Customizer is hidden, the FSE flow takes over.
- **Plugin parallel.** A plugin with `admin.json` (or a site with a plugin-registered active `admin.json`) signals "this site uses the WP Admin Shell environment." Standard wp-admin remains available as a peer for now (§10), but the shell becomes the default landing for users.

Full drop-in replacement (intercepting `/wp-admin/*` URLs and rendering the shell at every admin route) is a **v3** roadmap goal — significant compatibility surface, must be built incrementally. Through v1 and v2, the shell mounts at a single page (`admin.php?page=wp-admin-shell`) and the trigger is "active shell exists" rather than "URL intercepted." The architecture is built for the eventual handoff so v3 doesn't require restructuring.

### 4.6 Schema and versioning

`admin.json` is a versioned schema. The `version` field declares which generation the document targets.

- `version: 1` — partitioned shape (`settings`/`styles`), tokens, cascade. **Current.**
- `version: 0` — MVP flat shape (`branding`, `applications`, `navigation`, `toolbar` at root). Accepted by the runtime, normalized to `version: 1`. Deprecated for new authoring.

The schema is published at `https://schemas.wp.org/admin/v1.json` (planned location — not yet hosted; for now lives at `docs/schemas/admin-v1.json` in this repo and is referenced via `$schema` for IDE validation).

Forward-compatibility rule: a higher `version` than the runtime knows triggers a warning and best-effort merge of fields the runtime understands. Same rule `theme.json` follows.

---

## 5. Source contract

A **source** is a string identifier that maps to a renderable unit. The shell has three source families, all registered through the same registry but distinguished by `kind`:

| Family | `kind` | Purpose | Examples |
|---|---|---|---|
| **Application source** | `app` | Mountable unit placed in a region by id or by route | `core:posts`, `core:navigation`, `plugin:woocommerce/orders` |
| **Region source** | `region` | Container that holds apps. Honored by layout engines based on region kind | `core:sidebar-region`, `core:overlay-region`, `plugin:foo/dock-region` |
| **Layout engine** | `engine` | Component that arranges regions into DOM | `core:site-editor-layout`, `core:tiling-layout`, `plugin:bar/floating-layout` |

The shared contract:

```ts
interface Source {
  kind: 'app' | 'region' | 'engine';

  // The React component to mount.
  Component: React.ComponentType<SourceProps>;

  // Capabilities required to mount this source (floor for any consumer).
  capabilities?: string[];

  // JSON Schema for the `config` object this source accepts.
  configSchema?: JSONSchema;

  // Default config values, merged below user config.
  defaults?: object;

  // Commands this source contributes when active.
  commands?: CommandDefinition[];
}
```

`SourceProps` differs by `kind`:

```ts
// kind: 'app'
interface AppSourceProps {
  config: object;
  route?: Route;          // present only for routable apps
  regionId: string;       // which region mounted this app
}

// kind: 'region'
interface RegionSourceProps {
  config: object;
  contains: AppRef[];     // app ids this region must mount
  kind: RegionKind;       // persistent | overlay | drawer | floating | tiled
  selectionScope?: string;
  respondsTo?: string;
}

// kind: 'engine'
interface EngineSourceProps {
  config: object;
  regions: Record<string, RegionInstance>;
  arrangement?: string;
}
```

Sources register via `registerSource( id, definition )` (JS). Region and engine sources register the same way; the runtime kernel routes them to the right consumer based on `kind`.

### 5.1 Built-in `core:*` sources

Shipped with the plugin. Cover the highest-traffic admin surfaces.

| Source | Component | REST endpoints | Status |
|---|---|---|---|
| `core:posts` | `<PostsApp>` (DataViews) | `/wp/v2/posts`, `/wp/v2/pages`, any CPT | **MVP** |
| `core:editor` | `<EditorApp>` (full block editor, iframed) | `/wp/v2/posts/<id>` | **MVP** (iframe) |
| `core:simple-editor` | `<SimpleEditorApp>` (Substack-style) | `/wp/v2/posts/<id>` | **MVP** (native) |
| `core:media` | `<MediaApp>` | `/wp/v2/media` | **MVP** |
| `core:profile` | `<ProfileApp>` | `/wp/v2/users/me` | **MVP** |
| `core:site-editor` | `<SiteEditorApp>` (native mount) | `/wp/v2/templates`, `/wp/v2/global-styles` | **v1** |
| `core:settings` | `<SettingsApp>` (composable) | `/wp/v2/settings`, custom registries | **v1** |
| `core:users` | `<UsersApp>` (DataViews) | `/wp/v2/users` | **v1** |
| `core:comments` | `<CommentsApp>` (DataViews + moderation) | `/wp/v2/comments` | **v1** |
| `core:dashboard` | `<DashboardApp>` (composable widgets via slots) | varies | **v2** |
| `core:plugins` | `<PluginsApp>` (manage installed plugins) | `/wp/v2/plugins` | **v2** |

Each source has its own `config` schema. See [`admin-json-api-validation.md`](./admin-json-api-validation.md) for the per-source REST coverage matrix the MVP audited.

### 5.2 Plugin-contributed `plugin:{slug}` sources

Plugins register sources keyed by slug. WooCommerce could ship `plugin:woocommerce/orders` and `plugin:woocommerce/products`. These show up in `admin.json` by string and slot in like any built-in.

Registration (PHP):

```php
add_action( 'wp_admin_shell_register_sources', function( $registry ) {
    $registry->register( 'woocommerce/orders', array(
        'script_handle' => 'wc-shell-orders',
        'capabilities' => array( 'manage_woocommerce' ),
        'config_schema' => /* JSON Schema */,
    ) );
} );
```

Registration (JS, runs after script enqueued):

```js
import { registerApplicationSource } from '@wordpress/admin-shell';
import OrdersApp from './orders-app';

registerApplicationSource( 'woocommerce/orders', {
    Component: OrdersApp,
    capabilities: [ 'manage_woocommerce' ],
    defaults: { perPage: 20 },
} );
```

The PHP side declares the script to enqueue and the capability gate. The JS side registers the React component. The runtime does not load plugin source scripts until the user navigates to an app that uses one — this is `@wordpress/scripts`-style code splitting at the source level.

### 5.3 `iframe:{url}` escape hatch

Wraps any wp-admin URL. The runtime hides the iframed page's chrome (admin menu, admin bar, footer) by injecting CSS through a same-origin script run on the iframed window. URL is relative to `admin_url()`.

The iframe source has no `config` beyond the URL. Capability gating uses the wrapping app's `capability`. This will remain in the system permanently — there are wp-admin screens (network admin, certain plugin pages, the theme installer) that are not worth porting.

### 5.4 Layout engine sources

Layout engines are sources with `kind: 'engine'`. They receive the region tree and produce DOM. The shell ships several built-in engines and accepts custom engines from plugins.

Built-in engines:

| Source | Behavior | Use case | Status |
|---|---|---|---|
| `core:site-editor-layout` | Site-editor-style: dark chrome, elevated cards, fixed dock positions. Sidebar left, toolbar top, content center, preview right, overlays centered. | Default. Most shells. | **v1** |
| `core:single-pane-layout` | Stack regions vertically. One persistent region visible at a time. Overlays full-screen. | Mobile, single-task contexts | **v1** |
| `core:tiling-layout` | Hyprland-style tiling. Persistent regions arranged in a tree of splits. Keyboard-navigable splits. Overlays modal-centered. | Power users, devs | **v2** |
| `core:floating-layout` | Plasma-style desktop. Persistent regions are draggable, resizable windows. State persists per-user. | Desktop-app-like shells | **v3** |

Engine source contract additions:

```ts
interface EngineSource extends Source {
  kind: 'engine';

  // Region kinds this engine honors. Kinds outside this list are
  // collapsed to a fallback (declared below).
  honorsKinds: RegionKind[];

  // Fallback for unsupported kinds. e.g., tiling engine maps
  // 'floating' → 'tiled'.
  kindFallbacks?: Record<RegionKind, RegionKind>;

  // Tokens this engine reads beyond the §4.3.1 minimum set.
  // Validated against the merged styles at activation.
  requiredTokens?: TokenRef[];

  // Per-user state key (window positions, split ratios). Persisted
  // through the user origin of the cascade.
  stateKey?: string;
  defaultState?: object;

  // Whether the engine supports live-switching to another engine.
  // Default false — switching reloads the shell. Engines that share
  // a state model can opt-in.
  liveSwitchable?: boolean;
}
```

Engine state (resize ratios, window positions, drawer-open flags) persists through the user origin of the cascade (§4.4) under `wp_admin_shell_user_prefs.layoutState[stateKey]`. One store, no shadow datastore.

**Engine switching is not live by default.** An engine is a setting, not a frequent toggle. Switching engines reloads the shell. If a single engine wants to expose multiple sub-layouts (a tiling engine offering "dwindle" vs "master" modes), that lives inside the engine's `arrangement` config, not as a separate engine.

### 5.5 Region sources

Region sources are sources with `kind: 'region'`. They render a container that mounts a list of apps. Built-in region sources cover the default kinds; plugins register custom region sources for novel containers.

Built-in region sources:

| Source | Default kind | Behavior |
|---|---|---|
| `core:sidebar-region` | `persistent` | Vertical stack, full height, configurable width |
| `core:toolbar-region` | `persistent` | Horizontal strip, configurable height, left/center/right alignment |
| `core:content-region` | `persistent` | Main content area, supports `router: true` for routable apps |
| `core:preview-region` | `persistent` | Side panel that responds to a selection scope |
| `core:overlay-region` | `overlay` | Modal-like popup. Triggered by command/shortcut, dismissible |
| `core:drawer-region` | `drawer` | Slides from a side. Persistent until dismissed |
| `core:dock-region` | `persistent` | Strip of pinned apps with hover/active states. For app launchers |

Region sources are how custom containers enter the system. A plugin shipping a status-bar widget area registers `plugin:foo/status-bar-region`; users place it in their shell config; the layout engine renders it according to its kind.

---

## 6. Runtime contract

### 6.1 Mount and config delivery

PHP renders an empty mount point at `admin.php?page=wp-admin-shell`. The merged `admin.json` is delivered to JS via `wp_add_inline_script` + `wp_json_encode` on `window.wpAdminShell.config`. Type fidelity matters; `wp_localize_script` is rejected because it stringifies values.

The runtime mounts into `#wp-admin-shell`. The default wp-admin chrome is hidden via CSS shipped by the plugin. Authentication is the existing cookie session — REST nonces ride on `wpApiSettings.nonce`.

### 6.2 Routing

Hash-based client-side routing. Routes match `route` fields on routable apps. The router places the matched app into the active routable region — any region with `config.router: true`. Default routable region: `content`.

Examples: `#/posts`, `#/posts/42`, `#/editor/post/42`, `#/media/upload`.

Sub-routes are owned by the source, not the shell. The shell exposes a `useRoute()` hook returning `{ appId, segments, params }`. Sources interpret `segments` as they see fit.

Three navigation primitives:

- `navigate( '#/posts' )` — programmatic
- `<a href="#/posts">` — declarative, browser-native back/forward
- `useNavigator()` from `@wordpress/components` — drill-down sub-screens within an app

Cross-app navigation always reads as a hash change so the browser back stack works. In-app drill-down uses `NavigatorProvider` and does not change the hash.

**Multiple routable regions** are allowed (master-detail layouts: a routable nav region + routable content region resolving independent URL segments). When more than one routable region exists, each region declares a `routeScope` and the URL hash carries scoped segments: `#/posts?detail=42`. Most shells use a single routable region; multi-routable is a v2 feature.

### 6.3 Data layer

Two rules, no exceptions:

1. **Entity reads/writes go through `@wordpress/core-data`.** `useEntityRecord`, `useEntityRecords`, `useEntityProp`, `editEntityRecord`, `saveEditedEntityRecord`. The shell never calls REST endpoints for entities directly. This gives us undo/redo, auto-batched dispatches, automatic caching, optimistic updates, and `_fields`/`_embed` resolution for free.
2. **Non-entity calls go through `@wordpress/api-fetch`.** Media uploads, custom plugin endpoints, autosave, anything `core-data` doesn't model.

Raw `fetch()` is forbidden in shell or source code. Plugins contributing `plugin:*` sources follow the same rule.

When a plugin source needs entity data not modeled by `core-data`, it should register a custom entity via `dispatch( 'core' ).addEntities( [ ... ] )` rather than bypassing the layer.

### 6.4 Command palette

The command palette is a region. The default shell declares a `command-palette` overlay region containing the `core:command-picker` app. The picker app composes `@wordpress/commands` internally.

Two command sources at runtime:

- **Built-in commands** registered by `core:*` sources when active (e.g., the editor registers "Save draft", "Publish", "Toggle inserter").
- **Shell commands** declared in `settings.commands` of `admin.json`.

Commands are scoped — switching shells changes the active command set. The trigger (Cmd+K / Ctrl+K) is declared on the region's `config.trigger`, not hardcoded — a shell can rebind it or expose multiple command-like overlays (notifications drawer, AI chat) using the same overlay-region pattern.

Power users can pin the picker inline as a persistent region instead of an overlay by changing the region source from `core:overlay-region` to `core:sidebar-region`. No special-cased plumbing.

#### 6.4.1 Shell switching

Shell switching is a future feature delivered through the user prefs UI (`core:appearance`, v2). The MVP's toolbar dropdown was demo-only and is removed in v1.

The architecture must remain switchable from day one — the cascade resolver (§4.4) and active-shell selection (§4.4.4) treat `current_shell` as a cache key, not a startup constant. v1 builds the plumbing without surfacing it: the runtime is capable of switching shells mid-session, but no UI exposes the action. v2 adds the user prefs panel that exposes the switcher to users on shells with `userSwitchable: true`.

### 6.5 Composition and contribution points

Composition is layered:

1. **Region `contains`** — the primary composition mechanism. Apps are placed in regions by id. This is sufficient for most extensibility.
2. **Slot/Fill within an app** — for finer-grained insertion *inside* an app (a sidebar plugin contributing a panel into the post editor's right sidebar). Apps declare named slots; plugins fill them.
3. **Notice consolidation** — `@wordpress/notices` is the single source of truth for notices. The default shell pins `core:notices-banner` and `core:notices-snackbar` apps into known regions; plugins use `@wordpress/notices` rather than reaching into the shell.

App-level slots that ship with built-in sources:

| Slot | Source exposing it | Use case |
|---|---|---|
| `core:toolbar.left` / `.right` | `core:toolbar-region` | Add buttons in toolbar alignment groups |
| `core:navigation.footer` | `core:navigation` | Status indicators, account stub |
| `core:posts.row-actions` | `core:posts` (DataViews actions) | Bulk-action contributions |
| `core:editor.sidebar` | `core:editor` / `core:simple-editor` | Editor plugin panels |
| `core:app.before` / `.after` | Any app | Banners around the active app |

Slots are filled with `<Fill>` from `@wordpress/components`. The shell or app renders `<Slot>`. Same pattern Gutenberg uses for editor plugins.

---

## 7. Extensibility model

Nine extension points, in increasing power:

1. **Filter the merged config.** `wp_admin_shell_data` (PHP) / `wp.hooks.applyFilters( 'adminShell.data', config )` (JS). Last-mile mutation. Use for conditional removal of nav items based on environment, A/B experiments, runtime logic.
2. **Filter per-origin configs.** `wp_admin_shell_data_{origin}` for plugin/site/role/user/core. Mutate before merge.
3. **Declare downstream customization affordances.** §4.4.2. A shell config declares which fields downstream origins (role, user) may modify via `userCustomizable`. The user prefs UI reads this declaration to render only the controls a given shell allows. Same pattern as block supports — features available but not always exposed.
4. **Register a `plugin:*` application source.** §5.2. Adds an app to the registry; references in any `admin.json` resolve to it.
5. **Register a region source.** §5.5. Adds a custom container kind. e.g., a status-bar region, a notification dock.
6. **Register a layout engine.** §5.4. Replaces or supplements the default arrangement system.
7. **Register slot fills.** §6.5. Insert UI inside an app at named extension points.
8. **Register commands.** Via `@wordpress/commands` `useCommand` API; commands registered at runtime appear in the palette, scoped to the active shell when registered with `context`.
9. **Register a complete shell.** §4.5 programmatic path. Most powerful — define an entire `admin.json` from PHP based on user role, site state, etc.

What is **not** an extension point, by design:

- Patching the shell's own React tree.
- Replacing core sources by re-registering the same id (the registry rejects duplicate ids; use a different id and switch via shell config).
- Loading code outside the WordPress script enqueue system (no dynamic CDN loads, no inline `<script>` injection).
- Adding new region kinds. Kinds are fixed (§4.2.1) so every layout engine can reason about every kind.
- Re-enabling features an upstream origin restricted. The cascade is restrict-only (§4.4.1).

---

## 8. Capabilities and permissions

Four layers of permission checks, evaluated outside-in:

1. **Region visibility (fast-path).** A region with a `capability` field is hidden entirely if the user lacks the cap. The runtime skips mounting region contents — no apps inside that region are evaluated. This is the cheapest gate: one cap check skips a whole subtree.
2. **Application visibility.** An `application` entry can declare `capability: "edit_posts"`. The runtime hides apps the user lacks the capability for, both from rendering and from direct routing (a `#/users` URL with no `list_users` cap renders a 403 view). App caps are checked even when the region containing the app has no `capability` field — the region fast-path is an optimization, not a substitute.
3. **Source-declared capabilities.** A source's `capabilities[]` array is the floor. Even if a shell config omits `capability`, the source's required caps still apply.
4. **REST API enforcement.** The actual gatekeeper. The shell's UI checks are advisory; the REST API is authoritative. A user who somehow reaches a screen they can't operate will see "Sorry, you are not allowed" responses from `core-data`, which surface as inline errors.

**Navigation drilldowns with no permitted children disappear.** A `screen` drill-down whose `items[]` are all gated out for the current user is removed from the rendered nav by the navigation app — the user sees nothing rather than an empty leaf. Recursive: a parent screen with one nested screen, where the nested screen has no permitted children, also disappears. Logic lives in `core:navigation`, not the runtime kernel; custom nav apps may implement different policies.

Capability resolution uses `core-data`'s `canUser()` selector for entity-level checks (`canUser( 'create', 'posts' )`). Custom capabilities resolve via a small REST endpoint the plugin exposes (`/wp-admin-shell/v1/can/{capability}`) for non-entity gating. Results are cached for the request via `WP_Object_Cache`.

The `defaultRoute` falls through: if the configured default isn't permitted, the shell lands on the first permitted routable app.

---

## 9. Theming and tokens

Every visual property the shell renders is bound to a CSS variable. The shell consumes WordPress's existing `--wpds-*` token surface directly (the `@wordpress/theme` package, autogenerated by Terrazzo); chrome surfaces WPDS does not describe use a small `--wp-admin-shell--chrome--*` extension namespace. The full slot set is enumerated in §4.3.1; this section covers the operating model. The catalog of WordPress's three coexisting CSS-variable token systems is in [`wordpress-design-tokens-catalog.md`](./wordpress-design-tokens-catalog.md).

**The token contract is the layout engine contract.** A layout engine that needs a color, a duration, a shadow, or a z-index reads a `--wpds-*` token. Engines never hardcode values, never invent ad-hoc CSS variables, and never branch on theme detection. This is the deliberate first-principles fix for the WordPress ecosystem-debt problem: when the core token model is incomplete, plugin authors invent their own and the surface fragments. WPDS's matrix is intentionally comprehensive — color (bg/fg/stroke × interactive/surface/content × brand/neutral/status × weak/normal/strong × default/active/disabled), type, spacing, border, shadow, density — so engines never need to. Chrome engines additionally read `--wp-admin-shell--chrome--*` for sidebar/toolbar/siteHub/content surfaces WPDS does not yet describe.

**Token emission.** Tokens are emitted at mount time as a `<style id="wp-admin-shell-tokens">` block scoped to `#wp-admin-shell` (or `:root` when the shell is the entire document). Three families are emitted in order: WPDS surface (full matrix), chrome extensions, and a fixed compat bridge that aliases legacy `--wp-admin-theme-color*` and `--wp-components-*` variables onto the WPDS surface so unmodified `@wordpress/components` and wp-admin pages inherit shell theming. See §4.3.2.

**Custom token slugs.** Authors may add custom slugs under `chrome.*`. They compile to the same `--wp-admin-shell--chrome--{category}--{slug}` namespace. Engines reading custom slugs declare them via `EngineSource.requiredTokens` (§5.4) so the runtime can validate at activation time and surface a clear error if a config doesn't supply them. Authors do not invent new slots inside the WPDS surface — that namespace is governed by WordPress core.

**Density.** The `styles.density` enum (`default | compact | comfortable`) writes a `data-wpds-density` attribute on the shell root. WPDS already ships density-keyed gap/padding overrides under that selector; no shell-side density CSS is needed.

**User-origin overrides** (§4.4 user origin) support density, accent customization, dark/light variant. The user prefs UI is a small standalone application (`core:appearance`, v1) that writes to `wp_admin_shell_user_prefs`.

**Cross-pollination with `theme.json`.** Both `admin.json.styles` (WPDS-shaped) and `theme.json.settings` (theme.json-shaped) consume the same DTCG `tokens.json` via aliasing. One brand token in tokens.json fans out to admin (`--wpds-*`), legacy admin/components (compat bridge), and frontend (`--wp--preset--*`) without duplication. See the worked example in §4.3.3.

---

## 10. Compatibility and migration

**WordPress version floor.** WordPress 6.7+ for the MVP. v1 requires 6.8+ for stable Block Bindings + speculative loading filters. v2 may require 6.9+ for `core/post-data` bindings if the dashboard slot system uses them.

**Browser support.** Evergreen browsers. The shell relies on ES2020+, dynamic imports, and CSS custom properties. No IE, no legacy Edge. Matches `@wordpress/scripts` defaults.

**Data compatibility.** All persistence is via WordPress core options/user-meta and the REST API. There is no shadow datastore. Uninstalling the plugin reverts users to standard wp-admin with no data loss; the shell-specific options (`wp_admin_shell_*`) are removed in `uninstall.php`.

**Coexistence with wp-admin.** Standard wp-admin remains fully functional. Users can navigate to either. A site setting opts users into the shell as their default landing on login; users can opt out per-user. This is critical for adoption — switching is a preference, not a takeover.

**Migration of MVP `admin.json` files.** v0 (flat) configs are accepted indefinitely. The runtime normalizes them to v1 internally. A `wp admin-shell upgrade-config <name>` WP-CLI command writes the normalized form back to disk for authors who want to migrate.

---

## 11. Roadmap

Three releases after MVP. Each builds on the prior; no skipped foundations.

### v1 — Comprehensive shell (target: ~3 months post-MVP)

Goal: every wp-admin surface has a path through the shell, native or iframed, with the cascade, token system, and regions+apps model fully in place. Single layout engine (`core:site-editor-layout`).

**v1 is a kernel rebuild, not a refactor.** The MVP runtime (`src/shell/Shell.js`, `ShellLayout.js`, `ShellNavigation.js`, etc.) hardcodes a single arrangement: sidebar + toolbar + content. v1's regions+apps+engine model requires every layout decision to flow through a registry-driven indirection layer the MVP does not have. Attempting to retrofit the MVP code in place produces a worst-of-both intermediate that has neither the MVP's simplicity nor v1's flexibility. v1 builds the kernel from scratch in `src/runtime/` (or equivalent), keeps the MVP's working app components (`PostsApp`, `MediaApp`, `ProfileApp`, `SimpleEditorApp`, `SettingsGeneralApp`) as adapted source registrations, and retires the MVP shell scaffolding when the new kernel reaches feature parity. The MVP code stays on `feat/wp-admin-shell-mvp` as the validated proof-of-concept. The detailed milestone plan lives in [`wp-admin-shell-v1-plan.md`](./wp-admin-shell-v1-plan.md).

- [ ] `settings`/`styles` partition + cascade resolver (§4.4)
- [ ] 5-origin cascade with restrict-only override semantics (§4.4.1)
- [ ] `userCustomizable` affordance declarations (§4.4.2)
- [ ] Resolver caching matching `WP_Theme_JSON_Resolver` (§4.4.3)
- [ ] Per-role and per-user shell selection (§4.4.4)
- [ ] Regions+apps+layout-engine model (§4.2)
- [ ] Built-in region sources: sidebar, toolbar, content, preview, overlay, drawer (§5.5)
- [ ] **`core:site-editor-layout` engine only** — only engine shipped in v1
- [ ] Selection event bus (§4.2.3)
- [ ] User-origin overrides + prefs UI (`core:appearance`)
- [ ] Comprehensive token system per §4.3.1
- [ ] `core:site-editor` native mount (replacing iframe escape hatch)
- [ ] `core:settings` composable settings app
- [ ] `core:users` DataViews-based users app
- [ ] `core:comments` DataViews + moderation
- [ ] 4-layer capability gating (§8) including region fast-path and recursive nav drilldown removal
- [ ] App-level slots (§6.5)
- [ ] JSON Schema published at `schemas.wp.org/admin/v1.json`
- [ ] Shell-switching architecture in place but unsurfaced (§6.4.1)
- [ ] WP-CLI: `wp admin-shell list|activate|register|upgrade-config`

### v2 — Extension ecosystem + tokens.json (target: ~6 months post-MVP)

Goal: third parties can ship sources of every kind (apps, regions, engines) without forking the shell. Three-document design system shipped.

- [ ] **`tokens.json` primitives layer** (§4.0): loader, schema, ref resolver, baseline `core:tokens.json`
- [ ] **Coordinate `tokens.json` proposal with WordPress core** for potential adoption by `theme.json` v3
- [ ] `tokens-json-spec.md` published as standalone spec document
- [ ] `plugin:{slug}` source registry (§5.2) with PHP + JS registration
- [ ] Plugin-contributed region sources (e.g., `plugin:foo/status-bar-region`)
- [ ] `core:tiling-layout` engine
- [ ] Shell switcher exposed in user prefs UI (§6.4.1)
- [ ] Multi-routable regions (§6.2 master-detail)
- [ ] `core:dashboard` composable widget host
- [ ] `core:plugins` plugins management app (replacing iframe)
- [ ] Per-shell command scoping refinements
- [ ] Reference plugin sources: `plugin:woocommerce/orders` (app), a custom region, a custom engine — as worked examples

### v3 — Drop-in replacement + polish (target: ~9 months post-MVP)

Goal: shell becomes the canonical wp-admin experience when active — `admin.json` presence triggers full URL interception. Platform polish for ecosystem.

- [ ] **Drop-in replacement of `wp-admin`** (§4.5.1): URL interception of `/wp-admin/*`, transparent route-to-app mapping for legacy URLs, parity coverage
- [ ] `core:floating-layout` engine with persistent window state
- [ ] Schema-aware authoring tool (visual `admin.json` editor)
- [ ] Shell marketplace patterns (sharing/exporting `admin.json` bundles)
- [ ] Performance: source-level code splitting, suspense boundaries per app
- [ ] Accessibility audit with assistive tech (NVDA, VoiceOver, JAWS)
- [ ] Mobile layout adaptation (sidebar collapses, gestures)
- [ ] i18n: shell-config strings translatable via `_x` keys with context
- [ ] WordPress UI theme engine integration: parts of `tokens.json` generated from a theme config rather than hand-authored

---

## 12. Non-goals

These are explicitly out of scope. Listing them prevents scope creep arguments later.

- **Replacing the block editor.** The shell composes the editor; it does not reimplement it.
- **Replacing the REST API.** The shell consumes the API; it does not extend or replace it (except via the standard `register_rest_route` plugin path).
- **Multisite network admin shell.** The same shell may eventually run at network-admin level, but network-admin-specific features (site management, network plugins) are explicitly deferred.
- **Headless WordPress tooling.** The shell runs inside `wp-admin`, against an authenticated session. Rendering it as a standalone SPA against a remote WordPress is interesting but not in scope.
- **PHP-rendered admin pages.** The shell is React-only. Plugins that want shell integration ship JS.
- **Backwards compatibility with `admin_menu` / `add_submenu_page` hooks.** These continue to work in standard wp-admin. They do not appear in the shell unless wrapped via `iframe:`.
- **Theme-based shells.** `admin.json` is plugin-shipped, not theme-shipped, in v1. A theme could ship one, but the canonical home is plugins so admin experience is decoupled from frontend theme.
- **Live engine switching.** Switching layout engines reloads the shell. Engines are a setting, not a frequent toggle. Engines that want to expose multiple sub-layouts (a tiling engine offering "dwindle" vs "master" modes) implement that themselves via `arrangement` config, not by being multiple engines.
- **Per-region layout engines.** A single layout engine renders the entire shell. Mixing engines per region (sidebar tiling, content single-pane) is rejected — too much surface, too little payoff. If a region needs internal layout flexibility, that lives in the app the region contains, not in the engine boundary.
- **Custom region kinds.** The kind taxonomy (§4.2.1) is fixed. Custom kinds would force every layout engine to know how to render every kind, defeating the point of pluggable engines. Plugins introduce novel containers via custom region *sources*, all of which fall under one of the existing kinds.

---

## 13. Open questions

Real unknowns. Each needs resolution before its dependent roadmap item ships.

1. ~~**Selection scope API surface.**~~ Resolved 2026-04-30 (moved below).
2. **`tokens.json` precedence under multiple sources.** §4.0.4 lists discovery order: site > theme > plugin > core. Within plugins specifically, if two plugins both ship `tokens.json` with overlapping token paths, who wins? — Lean: alphabetical plugin slug with logged warning. Validate with v2 implementation.
3. **DTCG type-coercion table.** Resolver must convert DTCG values (e.g., `{ colorSpace: "srgb", components: [r,g,b] }`) into CSS strings appropriate to the admin/theme slot they're aliased into. Need an exhaustive coercion table covering all 13 DTCG types × all CSS-string formats admin/theme schemas accept (`#hex`, `rgb()`, `oklch()`, `color(srgb ...)`, etc). Authoring belongs in [`tokens-json-spec.md`](./tokens-json-spec.md).
4. **Token-file extension and discovery.** §4.0.1 accepts both `tokens.json` and `*.tokens.json`. DTCG convention is `*.tokens.json`. WordPress convention is `theme.json`/`admin.json` without dot prefix. Final pick affects schema URL, IDE config, and core proposal language. — Lean: accept both, document `tokens.json` as canonical for parity.
5. **Source script lifecycle / memory pressure.** Confirmed warm-by-default with LRU eviction. Open: what's the eviction threshold? — Lean: 5 most-recently-used non-active app sources kept warm. Needs measurement.
6. **Resolver cache invalidation on tokens-file change.** When a tokens file changes, every shell config that aliases into it needs re-resolution. Watch via file mtime (disk-backed) and option version (DB-backed). Need to confirm that WP_Object_Cache + transient versioning is sufficient under high write contention.
7. **DTCG `$extensions` for WordPress-specific metadata?** DTCG allows vendor extensions (`$extensions.com.wordpress.*`). Use this to mark which tokens are intended for which consumers (admin vs frontend), accessibility flags, or expected-slot hints in tokens.json. — Pursue in `tokens-json-spec.md`. Useful but not critical for v1.
8. **WPDS slot drift across WordPress versions.** Top-level `$wpds` pins the matrix to a WordPress release; a CI parity test against `wp-includes/css/dist/theme/style.css` flags rename/remove. When WP 7.0 renames a wpds slot, do we ship a one-version compat shim that re-emits the old name as `var(new-name)` for plugin authors who hardcoded the old slug? — Lean: yes for one minor cycle with a deprecation notice; align with WP core's own deprecation policy.
9. ~~**`$wpds` field placement.**~~ Resolved 2026-04-30 (moved below).
10. ~~**`color.palette[]` in `admin.json`?**~~ Resolved 2026-04-30 (moved below).
11. **`theme.json` v3 dependency.** The §4.3.3 worked example uses `theme.json` v3 (RC late March 2026). DTCG aliasing inside `settings.color.palette[].color` requires v3 resolver support. v2 themes can only inline literal values. Document the constraint and the migration path.
12. **Chrome surface upstreaming.** Sidebar/toolbar/siteHub/content slots live in `--wp-admin-shell--chrome--*` because WPDS does not describe them. If WPDS adds analogous tokens (e.g., `--wpds-color-bg-surface-sidebar-*`), do we migrate and emit both for a deprecation cycle? — Lean: migrate to WPDS when available; one-version dual emit; track via the v2 work.

### Resolved (kept for history)

- **Selection scope lifetime** (resolved 2026-04-30): selection scopes are **per-mount by default**, with opt-in `config.persist: true` on the publishing region for scopes that need to survive remount. Persisted scopes write through the user origin (`wp_admin_shell_user_prefs.selection[<scope>]`); ephemeral scopes live only in the in-memory `core/admin-shell/selection` Redux store. Common case (transient on-screen UI state) stays simple; cross-mount memory is explicit. v1 implements both modes; the bus API (`useSelection`, `dispatch('core/admin-shell/selection').setSelection`) is identical for callers regardless of persistence.
- **`$wpds` field placement** (resolved 2026-04-30): `$wpds` is a **top-level** field on `admin.json`, alongside `$schema` and `version`. Earlier drafts placed it under `styles.$wpds`; the pin governs the entire resolver (slot validation, defaults loading, compat-bridge derivation), so top-level is the right home. §4.1, §4.3.1, and the §4.3.3 worked example reflect the top-level form.
- **`color.palette[]` in `admin.json`** (resolved 2026-04-30): **dropped from admin.json.** Palette is a `theme.json` concern (block bindings, block supports). WPDS has no palette concept; apps inside the shell read `--wpds-*` directly. A shell that needs a named accent independent of WPDS aliases it via the chrome extension namespace or an app-level config field. Removes one slot category and avoids confusion between admin and frontend palette semantics.
- **Engines and tokens** (resolved 2026-04-29, revised 2026-04-29): engines read the WPDS `--wpds-*` namespace directly; chrome engines additionally read `--wp-admin-shell--chrome--*` for shell-only surfaces (sidebar, toolbar, siteHub, content card). The slot contract (§4.3.1) — WPDS matrix at the pinned `$wpds` version, plus the chrome slug list — is the engine contract. Engines reading custom chrome slugs declare them via `requiredTokens`; the runtime validates at activation. Earlier draft proposed a parallel `--wp-admin-shell--*` namespace for the full surface; superseded by the WPDS-native decision below.
- **WPDS-native styles** (resolved 2026-04-29): `admin.json.styles` is shaped 1:1 to the WPDS token matrix. Output is `--wpds-*` (full surface) plus `--wp-admin-shell--chrome--*` (shell-only chrome) plus a fixed compat bridge that aliases legacy `--wp-admin-theme-color*` and `--wp-components-*` onto WPDS. Rationale: `@wordpress/components` and `@wordpress/ui` are converging on `--wpds-*` (catalog §Migration trajectory). Setting shell theming on the WPDS surface means every present and future component consumer inside the shell inherits the shell's overrides automatically. No shadow namespace, no drift. Trade-off: shell tracks WPDS slot churn across WordPress versions; mitigated by the top-level `$wpds` version pin (§4.3.1, resolved 2026-04-30) and a CI parity test against `wp-includes/css/dist/theme/style.css`.
- **Live engine switching** (resolved 2026-04-29): not supported. Engines are set-and-use. Multiple sub-layouts within an engine = engine's responsibility, not the shell's. Listed as a non-goal in §12.
- **Per-region engines** (resolved 2026-04-29): not supported. One engine renders the entire shell. Listed as a non-goal in §12.
- **Bindings between `theme.json` and `admin.json`** (resolved 2026-04-29): both are sibling consumers of one DTCG `tokens.json` file (§4.0). They share primitives via aliasing; no automatic palette feed.
- **Per-role vs per-user shells** (resolved 2026-04-29): both. Cascade is site default → role override → user override (§4.4.4). Restrict-only semantics (§4.4.1).
- **Customization affordances** (resolved 2026-04-29): shells declare `userCustomizable` per field (§4.4.2). User prefs UI reads this to render only allowed controls. Same model as block supports.
- **`config` schema validation cost** (resolved 2026-04-29): cache validation results by `(sourceId, configHash)` following the `WP_Theme_JSON_Resolver` pattern (§4.4.3).
- **Drop-in replacement** (resolved 2026-04-29): yes, eventual goal. v3 work — `admin.json` presence activates the shell environment the same way `theme.json` activates the Site Editor (§4.5.1).
- **Capability gating for nav drilldowns** (resolved 2026-04-29): empty drilldowns disappear. Recursive. Logic in `core:navigation` app (§8).
- **Multi-shell switching UX** (resolved 2026-04-29): MVP toolbar dropdown removed in v1. Switching is a v2 user-prefs feature. Architecture must remain switchable from day one (§6.4.1).
- **Layout engine state schema** (resolved 2026-04-29): per-engine free-form, keyed by `stateKey`. v1 ships only `core:site-editor-layout`, so this is moot for v1.
- **Region capability gating granularity** (resolved 2026-04-29): region cap is fast-path that skips mounting children. App caps still apply when region cap absent. Both layers run when both present (§8).
- **`tokens.json` shape — WordPress-defined or author-defined?** (resolved 2026-04-29): author-defined. Any DTCG (W3C 2025.10) token file is valid. WordPress dictates only the *names* of the consumer slots in admin.json/theme.json `styles`. Author maps their tokens into those slots via DTCG curly-brace aliases. Tooling interop with Figma Tokens Studio, Style Dictionary, and other DTCG consumers comes for free.
- **Aliasing syntax** (resolved 2026-04-29): DTCG curly-brace `"{path.to.token}"` everywhere. Earlier draft's custom `{ "ref": "..." }` is replaced. Curly-brace strings inside admin.json/theme.json `styles` slot values are resolved against the merged tokens.json by the cascade resolver.
- **Cross-document ref cycles** (resolved 2026-04-29): tokens.json cannot reference admin.json/theme.json (one-way upward). Within tokens.json the resolver follows alias chains and detects cycles per DTCG semantics. Within admin.json/theme.json `styles`, intra-document refs use `"{styles.path.here}"` and are detected the same way.

---

## 14. References

In-repo:

- [`wp-admin-shell-mvp-spec.md`](./wp-admin-shell-mvp-spec.md) — MVP design spec, validated by working implementation
- [`admin-json-schema.md`](./admin-json-schema.md) — original schema design (v0/flat shape); kept as schema reference for the cascade resolver to read
- [`admin-json-api-validation.md`](./admin-json-api-validation.md) — REST API coverage matrix per source; informs §5.1
- [`wp-admin-screen-inventory.md`](./wp-admin-screen-inventory.md) — full surface map of `wp-admin` for porting prioritization

External:

- W3C Design Tokens Community Group spec (DTCG, 2025.10) — `https://tr.designtokens.org/format/`
- WordPress `theme.json` reference — `https://developer.wordpress.org/themes/global-settings-and-styles/`
- WordPress `theme.json` schema — `https://schemas.wp.org/trunk/theme.json`
- `@wordpress/core-data` reference — `https://developer.wordpress.org/block-editor/reference-guides/data/data-core/`
- `@wordpress/components` `<Slot>`/`<Fill>` — `https://developer.wordpress.org/block-editor/reference-guides/components/slot-fill/`
- `@wordpress/commands` — `https://developer.wordpress.org/block-editor/reference-guides/packages/packages-commands/`
- Style Dictionary (DTCG build tool) — `https://styledictionary.com/`
- Figma Tokens Studio (DTCG editor) — `https://tokens.studio/`
- KDE Global Themes — `https://develop.kde.org/docs/plasma/theme/global-themes/`
- VS Code contribution points — `https://code.visualstudio.com/api/references/contribution-points`
