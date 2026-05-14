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
 * that's a contradictory declaration and the registry rejects it.
 */

const VALID_KINDS = new Set( [ 'app', 'engine' ] );

export function createRegistry() {
	const sources = new Map();
	const loadCache = new Map();

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
		// Per-id Promise cache. Both shapes funnel through here so
		// repeat callers get identity-stable Promises — important
		// because the mount path feeds the Promise into React.lazy()
		// and identity drift would invalidate Suspense state.
		if ( loadCache.has( id ) ) {
			return loadCache.get( id );
		}
		if ( source.Component ) {
			const eager = Promise.resolve( source.Component );
			loadCache.set( id, eager );
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
				// Hydrate the registry entry so synchronous consumers
				// (the legacy `Component` read in `mountApp`) start
				// hitting the eager path after first resolution. The
				// Promise still owns identity for Suspense.
				source.Component = Component;
				return Component;
			} );
		loadCache.set( id, promise );
		return promise;
	}

	return { register, get, find, list, has, resolveComponent };
}
