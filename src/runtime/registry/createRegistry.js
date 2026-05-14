/**
 * Source registry — single mutable map keyed by `id`.
 *
 * The runtime uses one registry instance per kernel mount. Sources are
 * added via `register()`; the kernel then resolves config-declared
 * references through `get()` (kind-checked) or the looser `find()`.
 *
 * **App registration shapes.** Two shapes are accepted:
 *
 *   1. Eager — `{ kind: 'app', id, Component, … }`. The component renders
 *      synchronously; its module is part of the boot bundle. Used for
 *      always-mounted chrome apps (navigation, site-hub, toolbar-actions,
 *      notices-banner, notices-snackbar) where lazy-loading adds a
 *      flicker without saving bytes.
 *
 *   2. Lazy — `{ kind: 'app', id, load: () => import('...'), … }`. The
 *      `load` thunk returns a Promise resolving to a module namespace
 *      (`{ default: Component }`) or a bare component. Webpack code-splits
 *      each `import()` into its own chunk; mount-time logic awaits the
 *      load. Subsequent mounts of the same id reuse the cached component
 *      reference — no double-loading.
 *
 * Engines always use the eager shape — there's exactly one engine
 * mounted per shell and it's needed before any region renders.
 *
 * Both shapes cannot be set simultaneously (`Component` + `load`) —
 * that's a contradictory declaration and the registry rejects it. The
 * descriptor stored in `sources` keeps this invariant for life — the
 * read path resolves through separate caches rather than mutating the
 * descriptor (`resolveComponent` writes `loadCache`; `getResolvedComponent`
 * reads `resolvedCache`).
 */

const VALID_KINDS = new Set( [ 'app', 'engine' ] );

export function createRegistry() {
	const sources = new Map();
	// Promise cache: id → Promise<Component>. Identity-stable so the
	// mount path can feed the same Promise into `React.lazy()` across
	// renders.
	const loadCache = new Map();
	// Synchronous cache: id → Component. Populated after a Promise
	// resolves. Lets consumers skip the lazy/Suspense path on the
	// second mount without mutating the registered descriptor.
	const resolvedCache = new Map();

	function register( source ) {
		if ( ! source || typeof source !== 'object' ) {
			throw new Error(
				'createRegistry: register() requires a source object'
			);
		}
		if ( ! source.id || typeof source.id !== 'string' ) {
			throw new Error(
				'createRegistry: source.id must be a non-empty string'
			);
		}
		if ( ! VALID_KINDS.has( source.kind ) ) {
			throw new Error(
				`createRegistry: invalid kind "${ source.kind }" for source "${ source.id }"`
			);
		}
		if ( sources.has( source.id ) ) {
			throw new Error(
				`createRegistry: duplicate source id "${ source.id }"`
			);
		}
		if (
			source.kind === 'engine' &&
			source.ThemeProvider !== undefined &&
			typeof source.ThemeProvider !== 'function'
		) {
			throw new Error(
				`createRegistry: engine "${ source.id }" ThemeProvider must be a React component`
			);
		}
		const hasComponent = source.Component !== undefined;
		const hasLoad = source.load !== undefined;
		if ( hasComponent && hasLoad ) {
			throw new Error(
				`createRegistry: source "${ source.id }" declares both Component and load — pick one`
			);
		}
		if ( hasLoad && typeof source.load !== 'function' ) {
			throw new Error(
				`createRegistry: source "${ source.id }" load must be a function returning a Promise`
			);
		}
		if ( source.kind === 'engine' && hasLoad ) {
			throw new Error(
				`createRegistry: engine "${ source.id }" cannot be lazy — engines must be eager`
			);
		}
		sources.set( source.id, source );
		// Eager app entries are immediately available synchronously.
		// Engines route through `get(id, 'engine')` instead so we
		// keep `resolvedCache` app-only — matches `resolveComponent`'s
		// app-only contract.
		if ( hasComponent && source.kind === 'app' ) {
			resolvedCache.set( source.id, source.Component );
		}
		return source;
	}

	function get( id, kind ) {
		const source = sources.get( id );
		if ( ! source ) {
			return null;
		}
		if ( kind && source.kind !== kind ) {
			return null;
		}
		return source;
	}

	function find( id ) {
		return sources.get( id ) || null;
	}

	function list( kind ) {
		const all = Array.from( sources.values() );
		return kind ? all.filter( ( s ) => s.kind === kind ) : all;
	}

	function has( id ) {
		return sources.has( id );
	}

	/**
	 * Resolve the React component for an app source. Returns a Promise
	 * that resolves to the component reference. Eager registrations
	 * resolve synchronously (wrapped in `Promise.resolve`). Lazy
	 * registrations call `load()` once on first request and cache the
	 * resolved component reference — subsequent calls return the same
	 * Promise (identity stable, no double-load).
	 *
	 * Returns `null` for unknown ids or non-app kinds.
	 *
	 * The mount path consumes this through `React.lazy` so the same
	 * cached Promise drives Suspense without extra plumbing.
	 *
	 * @param {string} id App source id.
	 * @return {Promise<Function>|null} Resolved component, or null for
	 *   unknown / non-app ids.
	 */
	function resolveComponent( id ) {
		const source = sources.get( id );
		if ( ! source || source.kind !== 'app' ) {
			return null;
		}
		if ( loadCache.has( id ) ) {
			return loadCache.get( id );
		}
		if ( source.Component ) {
			const eager = Promise.resolve( source.Component );
			loadCache.set( id, eager );
			resolvedCache.set( id, source.Component );
			return eager;
		}
		if ( typeof source.load !== 'function' ) {
			return null;
		}
		const promise = Promise.resolve()
			.then( () => source.load() )
			.then( ( mod ) => {
				// Accept either a module namespace (`{ default: Component }`)
				// or a bare component reference. Dynamic `import()`
				// resolves to the former; hand-rolled thunks may return
				// either. The cached Promise resolves to the unwrapped
				// component so consumers don't have to repeat the check.
				const Component =
					mod && typeof mod === 'object' && 'default' in mod
						? mod.default
						: mod;
				if ( typeof Component !== 'function' ) {
					throw new Error(
						`createRegistry: load() for "${ id }" did not resolve to a React component`
					);
				}
				// Populate the sync cache so subsequent
				// `getResolvedComponent` calls skip the Promise
				// machinery. The descriptor itself is left untouched
				// — `Component XOR load` stays true for the life of
				// the registration.
				resolvedCache.set( id, Component );
				return Component;
			} );
		loadCache.set( id, promise );
		return promise;
	}

	/**
	 * Synchronous accessor for an already-resolved component. Returns
	 * the component reference for eager registrations and for lazy
	 * registrations whose load promise has settled successfully.
	 * Returns `null` for unresolved-lazy / unknown / non-app ids — the
	 * caller falls back to `resolveComponent` + Suspense in that case.
	 *
	 * Distinguishing "not loaded yet" from "loaded and resolved to a
	 * real component" lets the mount path skip the React.lazy wrapper
	 * once a chunk is cached, avoiding an extra Suspense flash on
	 * re-mounts.
	 *
	 * @param {string} id App source id.
	 * @return {Function|null} Cached component reference, or null.
	 */
	function getResolvedComponent( id ) {
		return resolvedCache.get( id ) || null;
	}

	/**
	 * Drop the cached Promise + resolved-component for an id so the
	 * next `resolveComponent` call re-fires `load()` from scratch.
	 *
	 * The mount path's error-boundary retry button calls this — without
	 * it, a rejected chunk-load Promise lives in `loadCache` for the
	 * lifetime of the registry and every retry attempt hits the same
	 * stale rejection. Webpack 5's `import()` does NOT auto-retry on
	 * 404/network errors (only on a narrow set of timeout-style
	 * transient signals), so the recovery path has to clear the cache
	 * deliberately.
	 *
	 * No-op when there's nothing cached. Always returns the descriptor
	 * for chaining or null for unknown ids.
	 *
	 * @param {string} id App source id.
	 * @return {Object|null} Source descriptor, or null for unknown ids.
	 */
	function invalidateComponent( id ) {
		const source = sources.get( id );
		if ( ! source ) {
			return null;
		}
		loadCache.delete( id );
		// Eager entries stay resolved — their Component is part of the
		// boot bundle, there's nothing to re-fetch. Only invalidate the
		// resolvedCache for lazy entries (where `load` is the source of
		// truth).
		if (
			source.Component === undefined &&
			typeof source.load === 'function'
		) {
			resolvedCache.delete( id );
		}
		return source;
	}

	return {
		register,
		get,
		find,
		list,
		has,
		resolveComponent,
		getResolvedComponent,
		invalidateComponent,
	};
}
