/**
 * Shared region helper: render a single contained app instance.
 *
 * `appRef` is either:
 *   - a namespaced id string (`core:posts`, `plugin:foo/bar`) — the
 *     v2-canonical reference. The id is the source; the registry
 *     resolves it. Optional inline config is supplied by the caller.
 *   - a fully-formed app instance object (`{ id, source, config?,
 *     capability? }`) — the runtime path the kernel uses when it
 *     pre-resolves regions, and the path region renderers use to mount
 *     route-matched apps with interpolated config.
 *
 * Regions delegate to this helper to keep the resolution path uniform.
 *
 * **Lazy apps.** Apps registered with `{ load: () => import(...) }`
 * resolve through the registry's `resolveComponent(id)` cache, which
 * returns a stable Promise per id. We wrap that Promise in `React.lazy`
 * once per id (memoized in `lazyAppCache`) so React's Suspense
 * machinery suspends the subtree until the chunk lands. An
 * `<AppErrorBoundary>` catches load failures and renders an inline
 * fallback rather than crashing the whole tree.
 */
import {
	Suspense,
	lazy,
	Component as ReactComponent,
} from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { useKernel } from '../kernel-context';
import { userCan } from '../capabilities/userCan';
import { ScopedThemeProvider } from '../styles/ThemeProviderHost';
import { getApp, getEngine } from '../manifests';

const IS_DEV =
	typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
const dsMismatchWarned = new Set();

function warnDsMismatch( engineId, appId, engineDs, appDs ) {
	if ( ! IS_DEV ) {
		return;
	}
	const key = `${ engineId }::${ appId }`;
	if ( dsMismatchWarned.has( key ) ) {
		return;
	}
	dsMismatchWarned.add( key );
	// eslint-disable-next-line no-console
	console.warn(
		`wp-admin-workspaces DS mismatch: app "${ appId }" declares designSystem="${ appDs }" but active engine "${ engineId }" declares designSystem="${ engineDs }". Visual results will be inconsistent.`
	);
}

// One React.lazy() wrapper per app id. React.lazy expects a thunk
// returning `{ default: Component }`; resolveComponent returns a
// Promise resolving to the bare component, so we adapt. The cache
// keeps identity stable across renders so React doesn't remount the
// suspending subtree on every parent re-render.
const lazyAppCache = new Map();

function getLazyComponent( registry, id ) {
	if ( lazyAppCache.has( id ) ) {
		return lazyAppCache.get( id );
	}
	const promise = registry.resolveComponent( id );
	if ( ! promise ) {
		return null;
	}
	const Lazy = lazy( () =>
		promise.then( ( Component ) => ( { default: Component } ) )
	);
	lazyAppCache.set( id, Lazy );
	return Lazy;
}

function AppLoading() {
	return (
		<div
			className="wp-admin-workspaces-app-loading"
			role="status"
			aria-live="polite"
			aria-busy="true"
		/>
	);
}

function AppLoadError( { appId, error, onRetry } ) {
	const message = error?.message || String( error );
	const headline = appId
		? sprintf(
				/* translators: %s: app id (e.g. "core:posts") */
				__( 'Failed to load app "%s".', 'wp-admin-workspaces' ),
				appId
		  )
		: __( 'Failed to load app.', 'wp-admin-workspaces' );
	return (
		<div className="wp-admin-workspaces-app-error" role="alert">
			<p>{ headline }</p>
			<p className="wp-admin-workspaces-app-error__detail">{ message }</p>
			{ onRetry ? (
				<button type="button" onClick={ onRetry }>
					{ __( 'Retry', 'wp-admin-workspaces' ) }
				</button>
			) : null }
		</div>
	);
}

/**
 * Webpack 5 throws `ChunkLoadError` for failed chunk fetches; our own
 * `resolveComponent` throws when the load thunk returns a non-component
 * module. Both are load-time failures the inline retry can address.
 * Anything else — a crash inside a resolved component, a thrown
 * `TypeError` from a stale ref — is a render-time bug; the boundary
 * re-throws so a developer-facing outer boundary catches the real
 * stack rather than masking it with our "Failed to load" copy.
 *
 * @param {*} error Thrown value caught by the boundary.
 * @return {boolean} True when this is a chunk-load failure.
 */
function isChunkLoadError( error ) {
	if ( ! error ) {
		return false;
	}
	if ( error.name === 'ChunkLoadError' ) {
		return true;
	}
	const message = String( error.message || '' );
	if ( /^Loading chunk /.test( message ) ) {
		return true;
	}
	if ( /^Loading CSS chunk /.test( message ) ) {
		return true;
	}
	if ( /^createRegistry: load\(\) for/.test( message ) ) {
		return true;
	}
	return false;
}

/**
 * Catches errors thrown by a suspending app's load. Render-time errors
 * inside the resolved component re-throw so they surface to outer
 * boundaries (or the dev console in dev mode) with their real stack.
 *
 * Mounted only on the lazy mount path — eager apps render without a
 * boundary so their render crashes propagate the same way they did
 * pre-C5.
 */
class AppErrorBoundary extends ReactComponent {
	constructor( props ) {
		super( props );
		this.state = { error: null };
		this.retry = this.retry.bind( this );
	}

	static getDerivedStateFromError( error ) {
		return { error };
	}

	componentDidCatch( error ) {
		if ( ! isChunkLoadError( error ) ) {
			return;
		}
		// eslint-disable-next-line no-console
		console.error(
			`[wp-admin-workspaces] app "${ this.props.appId }" failed to load:`,
			error
		);
	}

	retry() {
		const { appId, onRetry, registry } = this.props;
		if ( onRetry ) {
			onRetry( registry, appId );
		}
		this.setState( { error: null } );
	}

	render() {
		const { error } = this.state;
		if ( error ) {
			if ( isChunkLoadError( error ) ) {
				return (
					<AppLoadError
						appId={ this.props.appId }
						error={ error }
						onRetry={ this.retry }
					/>
				);
			}
			// Not a load failure — propagate so the upstream boundary
			// (or React's dev overlay) surfaces the real error.
			throw error;
		}
		return this.props.children;
	}
}

function retryLazyApp( registry, appId ) {
	// Two caches to clear: the per-id React.lazy wrapper, and the
	// registry's load/resolved caches. Webpack 5's `import()` does NOT
	// auto-retry on 404 / network errors, so clearing the registry
	// caches is what makes the retry actually re-fire the underlying
	// load thunk. Without `invalidateComponent`, the next render would
	// build a fresh React.lazy() wrapping the same rejected Promise.
	lazyAppCache.delete( appId );
	if ( registry?.invalidateComponent ) {
		registry.invalidateComponent( appId );
	}
}

export function MountedApp( { appRef, regionId, segments, fallback = null } ) {
	const { registry, config } = useKernel();

	const appInstance = resolveAppInstance( appRef );
	if ( ! appInstance ) {
		return null;
	}

	// Dev-mode: warn once per (engine, app) pair when designSystem
	// declarations disagree. Both fields are optional — missing data
	// skips the check.
	if ( IS_DEV ) {
		const engineId = config?.engine;
		const appManifest = getApp( appInstance.source );
		const engineManifest = engineId ? getEngine( engineId ) : null;
		const appDs = appManifest?.designSystem;
		const engineDs = engineManifest?.designSystem;
		if ( appDs && engineDs && appDs !== engineDs ) {
			warnDsMismatch( engineId, appInstance.id, engineDs, appDs );
		}
	}
	// Per-app theme override. `styles.applications[appId]` may declare
	// `theme` seeds (Tier 1) or direct slot overrides (Tier 3); when
	// present, wrap the app in a nested provider so its subtree carries
	// the override. Zero-cost when no overrides authored.
	const appStyles = config?.styles?.applications?.[ appInstance.id ];

	// Spec §8 layer 2 — apps with `capability` are hidden from rendering.
	if ( appInstance.capability && ! userCan( appInstance.capability ) ) {
		return fallback;
	}

	const sourceDef = registry.get( appInstance.source, 'app' );
	if ( ! sourceDef ) {
		return (
			<div className="wp-admin-workspaces-region__empty">
				Unknown source: { appInstance.source }
			</div>
		);
	}

	// Spec §8 layer 3 — source-declared capability floor. Even if the
	// shell config omits `capability`, the source's required caps still
	// apply.
	const sourceCaps = Array.isArray( sourceDef.capabilities )
		? sourceDef.capabilities
		: [];
	for ( const cap of sourceCaps ) {
		if ( ! userCan( cap ) ) {
			return fallback;
		}
	}

	// Branch on the registered descriptor — `Component` XOR `load` is
	// fixed for the registration's life, so the path each id takes is
	// stable from first render onward:
	//
	//   * **Eager** (`sourceDef.Component` set) — render the component
	//     directly. No boundary, no Suspense. Render-time crashes
	//     propagate to outer boundaries so a typo in NavigationApp
	//     surfaces honestly in dev rather than getting masked by our
	//     load-failure copy.
	//
	//   * **Lazy** (`sourceDef.load` set) — wrap in `<Suspense>` for
	//     the in-flight chunk fallback and `<AppErrorBoundary>` for
	//     load failures. The boundary re-throws non-load errors so
	//     a post-resolution render crash still surfaces honestly.
	//
	// Lazy chunks resolve through `lazyAppCache` (one React.lazy
	// wrapper per id, identity-stable across renders) backed by
	// `registry.resolveComponent` (one Promise per id). After first
	// resolve the Lazy is internally settled — Suspense is a no-op,
	// re-renders go straight through.
	const mergedConfig = {
		...( sourceDef.defaults || {} ),
		...( appInstance.config || {} ),
	};
	const appProps = {
		app: appInstance,
		config: mergedConfig,
		regionId,
		segments: segments || [],
	};

	let content;
	if ( sourceDef.Component ) {
		const Component = sourceDef.Component;
		content = <Component { ...appProps } />;
	} else {
		const Lazy = getLazyComponent( registry, appInstance.source );
		if ( ! Lazy ) {
			return (
				<div className="wp-admin-workspaces-region__empty">
					Unknown source: { appInstance.source }
				</div>
			);
		}
		content = (
			<AppErrorBoundary
				appId={ appInstance.source }
				registry={ registry }
				onRetry={ retryLazyApp }
			>
				<Suspense fallback={ <AppLoading /> }>
					<Lazy { ...appProps } />
				</Suspense>
			</AppErrorBoundary>
		);
	}

	return (
		<ScopedThemeProvider styles={ appStyles }>
			<div
				data-app-id={ appInstance.id }
				data-app-source={ appInstance.source }
				style={ { display: 'contents' } }
			>
				{ content }
			</div>
		</ScopedThemeProvider>
	);
}

function resolveAppInstance( appRef ) {
	if ( ! appRef ) {
		return null;
	}
	if ( typeof appRef === 'string' ) {
		// `iframe:<slug>` shorthand → the iframe-fallback app, slug as url.
		if ( appRef.startsWith( 'iframe:' ) ) {
			const slug = appRef.slice( 'iframe:'.length );
			return {
				id: appRef,
				source: 'core:iframe-fallback',
				config: { url: slug },
			};
		}
		// Namespaced ids (core:* / plugin:*) are self-identifying — the id
		// is the source.
		if ( appRef.startsWith( 'core:' ) || appRef.startsWith( 'plugin:' ) ) {
			return { id: appRef, source: appRef };
		}
		return null;
	}
	// Object form. Translate an `iframe:<slug>` source the same way; the
	// route synthesizer already does this for routed mounts, so this is the
	// catch-all for direct `region.app` / `screens[].apps[]` mounts.
	if (
		typeof appRef.source === 'string' &&
		appRef.source.startsWith( 'iframe:' )
	) {
		const slug = appRef.source.slice( 'iframe:'.length );
		const config =
			appRef.config && typeof appRef.config === 'object'
				? { ...appRef.config }
				: {};
		if ( config.url === undefined || config.url === '' ) {
			config.url = slug;
		}
		return { ...appRef, source: 'core:iframe-fallback', config };
	}
	return appRef;
}
