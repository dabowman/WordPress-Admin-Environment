/**
 * Source-type contracts for the WP Admin Workspaces runtime.
 *
 * These are JSDoc typedefs only — pure shape, no runtime. They mirror
 * spec §5 of `docs/wp-admin-workspaces-design-spec.md`.
 *
 * Three kinds of `Source` exist: `app`, `region`, `engine`. All share
 * a common identity envelope; per-kind props differ in what `Component`
 * receives and what config the source consumes.
 */

/**
 * @typedef {'app' | 'engine'} SourceKind
 *
 * Region sources were retired in V2.M2. Regions are now rendered by the
 * generic `src/runtime/regions/Region.js` directly off declarations; the
 * registry only holds apps and engines.
 */

/**
 * Common identity envelope for any source registered with the runtime.
 *
 * @typedef {Object} SourceBase
 * @property {SourceKind} kind           - Discriminant.
 * @property {string}     id             - Globally unique identifier (e.g. `core:posts`).
 * @property {string}     [title]        - Human-readable title (used in registries / pickers).
 * @property {Object}     [configSchema] - Optional JSON Schema for the source's instance config.
 * @property {string[]}   [capabilities] - Capability floor (spec §8 layer 3). Every cap listed
 *                                       must be held by the current user for the source to
 *                                       mount. Enforced at registry lookup time.
 */

/* ──────────────────────── App sources ─────────────────────── */

/**
 * Props delivered to an `AppSource.Component` when it mounts inside a region.
 *
 * @typedef {Object} AppSourceProps
 * @property {Object} app         - The application instance from the resolved config.
 * @property {string} app.id      - The application id from workspace.json.
 * @property {string} app.source  - The source string (e.g. `core:posts`).
 * @property {string} [app.title] - Display title.
 * @property {string} [app.icon]  - Icon name (resolved via iconMap).
 * @property {Object} [config]    - Per-instance config validated against `configSchema`.
 * @property {string} regionId    - The id of the region currently mounting this app.
 */

/**
 * Optional window-mount hints declared on an app manifest. Engines that
 * mount apps inside window frames (windowed/MDI/desktop-style) consult
 * the block when spawning a window; default sidebar+toolbar+content
 * engines ignore it.
 *
 * @typedef {Object} AppManifestWindow
 * @property {{w: number, h: number}} [defaultSize]   Preferred initial window size (CSS px).
 * @property {{w: number, h: number}} [minSize]       Minimum window size (CSS px).
 * @property {string}                 [chrome]        Engine-defined frame-style id (e.g. `default`, `minimal`, `dialog`).
 * @property {boolean}                [multiInstance] When true, app may open as multiple simultaneous windows.
 * @property {string}                 [icon]          Icon registry name for the window frame titlebar.
 */

/**
 * @typedef {SourceBase & {
 *   kind: 'app',
 *   Component: (props: AppSourceProps) => any,
 *   routable?: boolean,
 *   window?: AppManifestWindow
 * }} AppSource
 */

/* ──────────────────────── Engine sources ──────────────────── */

/**
 * Props delivered to an `EngineSource.Component` — the layout engine that
 * arranges all regions for a workspace.
 *
 * `regions` is keyed by region id; each value is a fully-resolved region
 * declaration. Engines render regions by passing them to the generic
 * `<Region>` renderer (see `src/runtime/regions/Region.js`).
 *
 * @typedef {Object} EngineSourceProps
 * @property {Object}                 config  - The full resolved workspace config.
 * @property {Object<string, Object>} regions - Region declarations keyed by region id.
 */

/**
 * Optional ThemeProvider supplied by an engine. When present, the kernel
 * mounts this provider around the engine's render tree instead of the
 * platform-default (WPDS-backed) provider. Engines can use this to ship
 * an entirely different design system (Material, Tailwind tokens, brand-
 * locked palette, etc.) without touching kernel code.
 *
 * Contract:
 *   - Children must be rendered inside a wrapper carrying
 *     `data-theme-scope-id={id}` so workspace-level scoped detail CSS can
 *     target them. (The kernel emits this wrapper around the provider;
 *     engines render their children as siblings of the kernel-supplied
 *     scoped wrapper.)
 *   - The `density` prop must be honored according to the engine's own
 *     DS vocabulary — the kernel passes through whatever string the
 *     author authored on `styles.theme.density` without normalization.
 *   - Engine-supplied scoped overrides (chrome bindings, region/app
 *     scoped overrides) are emitted as a sibling `<style>` block by the
 *     kernel, scoped to the wrapper id. Engines do NOT need to
 *     reimplement them — they ship a `compileStyles` hook instead.
 *
 * @typedef {Object} EngineThemeProviderProps
 * @property {boolean} isRoot    True when mounted at the kernel root.
 * @property {Object}  styles    Resolved workspace.json `styles` block.
 * @property {Object}  tokens    Flattened DTCG tokens from `tokens.json`.
 * @property {string}  [density] Active density preset, if declared.
 * @property {*}       children  Tree to render inside the provider.
 */

/**
 * Engine-supplied style compiler. The kernel calls this hook from
 * `ThemeProviderHost` whenever the resolved styles or tokens change.
 *
 * Pure function — no React, no DOM. Returns three buckets of CSS-variable
 * assignments that the host serializes into a sibling `<style>` block
 * scoped to the engine's ThemeProvider wrapper:
 *
 *   - `top`:      scope-root variables (single rule on the wrapper).
 *   - `scoped`:   array of `{selector, vars}` for surface-scoped
 *                 variables (chrome bindings, sidebar palette, etc.).
 *   - `subtrees`: per-region / per-app variables, keyed by
 *                 `region:<id>` or `app:<id>`. Host emits one rule per
 *                 subtree under the appropriate descendant selector.
 *
 * Engines that omit this hook get zero scoped overrides; their
 * `ThemeProvider` must own all token plumbing directly.
 *
 * @callback EngineStyleCompiler
 * @param {Object} styles Resolved workspace.json `styles` block (deep-merged
 *                        with engine `default-styles`).
 * @param {Object} tokens Flattened DTCG tokens (paths → primitive values).
 * @return {{
 *   top:      Object<string,string>,
 *   scoped:   Array<{ selector: string, vars: Object<string,string> }>,
 *   subtrees: Object<string, Object<string,string>>
 * }}
 */

/**
 * Engine-supplied icon table. Maps icon-name strings (referenced from
 * `app.icon`, nav items, command-palette commands, etc.) to React
 * components. Engines call `registerIcons(table)` from the kernel
 * registry at module-load time; apps look up icons via `resolveIcon`
 * regardless of which engine populated the table.
 *
 * Lets each engine ship its own DS-appropriate icon set (e.g. core
 * uses `@wordpress/icons`; a Material engine ships Material icons)
 * without app code knowing which engine is active.
 *
 * @typedef {Object<string, *>} EngineIconTable
 */

/**
 * @typedef {SourceBase & {
 *   kind: 'engine',
 *   Component: (props: EngineSourceProps) => any,
 *   ThemeProvider?: (props: EngineThemeProviderProps) => any,
 *   compileStyles?: EngineStyleCompiler,
 *   iconTable?: EngineIconTable
 * }} EngineSource
 */

/**
 * Union of every source kind the registry can hold.
 *
 * @typedef {AppSource | EngineSource} Source
 */

export {};
