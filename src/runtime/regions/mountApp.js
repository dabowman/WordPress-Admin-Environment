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
import { __ } from '@wordpress/i18n';
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
		`wp-admin-shell DS mismatch: app "${ appId }" declares designSystem="${ appDs }" but active engine "${ engineId }" declares designSystem="${ engineDs }". Visual results will be inconsistent.`
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
			className="wp-admin-shell-app-loading"
			role="status"
			aria-live="polite"
			aria-busy="true"
		/>
	);
}

function AppLoadError( { appId, error, onRetry } ) {
	const message = error?.message || String( error );
	return (
		<div className="wp-admin-shell-app-error" role="alert">
			<p>
				{ __( 'Failed to load app', 'wp-admin-shell' ) }
				{ appId ? ` "${ appId }"` : null }.
			</p>
			<p className="wp-admin-shell-app-error__detail">{ message }</p>
			{ onRetry ? (
				<button type="button" onClick={ onRetry }>
					{ __( 'Retry', 'wp-admin-shell' ) }
				</button>
			) : null }
		</div>
	);
}

/**
 * Catches errors thrown by a suspending app's load. Without a boundary,
 * a rejected lazy() promise crashes the whole tree. Resetting via
 * `retry` clears the cached lazy() (so the next attempt re-fires the
 * underlying load thunk via the registry).
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
		// eslint-disable-next-line no-console
		console.error(
			`[wp-admin-shell] app "${ this.props.appId }" failed to load:`,
			error
		);
	}

	retry() {
		const { appId, onRetry } = this.props;
		if ( onRetry ) {
			onRetry( appId );
		}
		this.setState( { error: null } );
	}

	render() {
		if ( this.state.error ) {
			return (
				<AppLoadError
					appId={ this.props.appId }
					error={ this.state.error }
					onRetry={ this.retry }
				/>
			);
		}
		return this.props.children;
	}
}

function retryLazyApp( appId ) {
	// Drop the cached React.lazy wrapper so the next render rebuilds
	// it. The registry's resolveComponent cache is also wiped via the
	// load thunk being re-invoked. (Note: the registry itself does not
	// expose a public invalidate — the most common cause of a load
	// failure is a chunk fetch error, which webpack's chunk-loading
	// runtime already retries internally. The retry button mostly
	// re-tries any lazy() that errored during render.)
	lazyAppCache.delete( appId );
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
			<div className="wp-admin-shell-region__empty">
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

	// Eager registrations expose `Component` directly. Lazy ones need
	// a React.lazy wrapper backed by the registry's resolveComponent
	// Promise. Both paths produce the same `<AppComponent />` JSX; the
	// Suspense boundary below is a no-op for eager apps (their render
	// doesn't throw a Promise) so there's no perf cost to wrapping
	// uniformly.
	const Component =
		sourceDef.Component || getLazyComponent( registry, appInstance.source );
	if ( ! Component ) {
		return (
			<div className="wp-admin-shell-region__empty">
				Unknown source: { appInstance.source }
			</div>
		);
	}

	const mergedConfig = {
		...( sourceDef.defaults || {} ),
		...( appInstance.config || {} ),
	};

	return (
		<ScopedThemeProvider styles={ appStyles }>
			<div
				data-app-id={ appInstance.id }
				data-app-source={ appInstance.source }
				style={ { display: 'contents' } }
			>
				<AppErrorBoundary
					appId={ appInstance.source }
					onRetry={ retryLazyApp }
				>
					<Suspense fallback={ <AppLoading /> }>
						<Component
							app={ appInstance }
							config={ mergedConfig }
							regionId={ regionId }
							segments={ segments || [] }
						/>
					</Suspense>
				</AppErrorBoundary>
			</div>
		</ScopedThemeProvider>
	);
}

function resolveAppInstance( appRef ) {
	if ( ! appRef ) {
		return null;
	}
	if ( typeof appRef === 'string' ) {
		// Namespaced ids (core:* / plugin:*) are self-identifying — the id
		// is the source. Anything else is invalid in v2.
		if ( appRef.startsWith( 'core:' ) || appRef.startsWith( 'plugin:' ) ) {
			return { id: appRef, source: appRef };
		}
		return null;
	}
	return appRef;
}
