/**
 * Source-type contracts for the WP Admin Shell v1 runtime.
 *
 * These are JSDoc typedefs only — pure shape, no runtime. They mirror
 * spec §5 of `docs/wp-admin-shell-design-spec.md`.
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
 * @property {SourceKind}     kind          - Discriminant.
 * @property {string}         id            - Globally unique identifier (e.g. `core:posts`).
 * @property {string}         [title]       - Human-readable title (used in registries / pickers).
 * @property {Object}         [configSchema] - Optional JSON Schema for the source's instance config.
 * @property {string[]}       [capabilities] - Capability floor (spec §8 layer 3). Every cap listed
 *                                            must be held by the current user for the source to
 *                                            mount. Enforced at registry lookup time.
 */

/* ──────────────────────── App sources ─────────────────────── */

/**
 * Props delivered to an `AppSource.Component` when it mounts inside a region.
 *
 * @typedef {Object} AppSourceProps
 * @property {Object} app           - The application instance from the resolved config.
 * @property {string} app.id        - The application id from admin.json.
 * @property {string} app.source    - The source string (e.g. `core:posts`).
 * @property {string} [app.title]   - Display title.
 * @property {string} [app.icon]    - Icon name (resolved via iconMap).
 * @property {Object} [config]      - Per-instance config validated against `configSchema`.
 * @property {string[]} [segments]  - Sub-route segments (single routable region only in v1).
 * @property {string} regionId      - The id of the region currently mounting this app.
 */

/**
 * @typedef {SourceBase & {
 *   kind: 'app',
 *   Component: (props: AppSourceProps) => any,
 *   routable?: boolean
 * }} AppSource
 */

/* ──────────────────────── Engine sources ──────────────────── */

/**
 * Props delivered to an `EngineSource.Component` — the layout engine that
 * arranges all regions for a shell.
 *
 * `regions` is keyed by region id; each value is a fully-resolved region
 * declaration. Engines render regions by passing them to the generic
 * `<Region>` renderer (see `src/runtime/regions/Region.js`).
 *
 * @typedef {Object} EngineSourceProps
 * @property {Object} config                       - The full resolved shell config.
 * @property {Object<string, Object>} regions      - Region declarations keyed by region id.
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
 *     `data-wpds-theme-provider-id={id}` (or an equivalent attribute the
 *     engine declares) so shell-level scoped detail CSS can target them.
 *   - The `density` prop must be honored — typically by setting
 *     `data-wpds-density={density}` on the wrapper.
 *   - Tier-3 slot overrides + chrome → WPDS bridge + region/app scoped
 *     overrides are emitted as a sibling `<style>` block by the kernel,
 *     scoped to the wrapper id. Engines do NOT need to reimplement them.
 *
 * @typedef {Object} EngineThemeProviderProps
 * @property {boolean} isRoot
 * @property {Object}  styles
 * @property {Object}  tokens
 * @property {string}  [density]
 * @property {*}       children
 */

/**
 * @typedef {SourceBase & {
 *   kind: 'engine',
 *   Component: (props: EngineSourceProps) => any,
 *   ThemeProvider?: (props: EngineThemeProviderProps) => any
 * }} EngineSource
 */

/**
 * Union of every source kind the registry can hold.
 *
 * @typedef {AppSource | EngineSource} Source
 */

export {};
