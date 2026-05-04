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
 * @typedef {'app' | 'region' | 'engine'} SourceKind
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

/* ──────────────────────── Region sources ──────────────────── */

/**
 * Region kinds — control how an engine arranges the region.
 *
 * `persistent` regions render in a fixed slot. `overlay` regions float over
 * persistent regions (e.g. command palette). `drawer` regions slide in from a
 * configurable side and persist until dismissed.
 *
 * `floating` and `tiled` are reserved for v2 — engines may collapse them to
 * `persistent` for v1.
 *
 * @typedef {'persistent' | 'overlay' | 'drawer' | 'floating' | 'tiled'} RegionKind
 */

/**
 * Props delivered to a `RegionSource.Component` when an engine mounts it.
 *
 * @typedef {Object} RegionSourceProps
 * @property {Object}   region            - Region instance from the resolved config.
 * @property {string}   region.id         - Region id (e.g. `nav`, `main`, `commands`).
 * @property {string}   region.source     - Region source string (e.g. `core:sidebar-region`).
 * @property {Object}   [region.config]   - Region-instance config.
 * @property {Object[]} [region.contains] - Resolved app instances assigned to this region.
 */

/**
 * @typedef {SourceBase & {
 *   kind: 'region',
 *   regionKind: RegionKind,
 *   Component: (props: RegionSourceProps) => any,
 *   routable?: boolean
 * }} RegionSource
 */

/* ──────────────────────── Engine sources ──────────────────── */

/**
 * Props delivered to an `EngineSource.Component` — the layout engine that
 * arranges all regions for a shell.
 *
 * `regions` is keyed by region id; each value is a fully-resolved region
 * instance ready to mount (the engine renders the region's `Component`).
 *
 * @typedef {Object} EngineSourceProps
 * @property {Object} config                       - The full resolved shell config.
 * @property {Object<string, Object>} regions      - Region instances keyed by region id.
 * @property {Object<string, Object>} regionSources - Region source defs keyed by source id.
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
 * @typedef {AppSource | RegionSource | EngineSource} Source
 */

export {};
