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
 * @typedef {SourceBase & {
 *   kind: 'engine',
 *   Component: (props: EngineSourceProps) => any
 * }} EngineSource
 */

/**
 * Union of every source kind the registry can hold.
 *
 * @typedef {AppSource | EngineSource} Source
 */

export {};
