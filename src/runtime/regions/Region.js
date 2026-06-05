/**
 * Generic, declaration-driven region renderer.
 *
 * v2-shape regions only — every region declares `role` (directly or
 * via `template` instantiation) plus optional `platform`, `routing`,
 * `style`, `app`, `config`, `regions`. The renderer composes behavior
 * from platform-service requests (spec §5.3) via `getPlatformServices`:
 *   - `isModal`           → ARIA modal + focus trap + constrained tabbing
 *   - `dismissTriggers`   → Escape / backdrop-click handlers
 *   - `autofocusSelector` → focus on mount (else useFocusOnMount default)
 *   - placement: 'overlay' → backdrop wrapper
 *   - `isTriggerable`     → start closed; an external binding flips
 *                           the open state. V2.M5 wires the binding
 *                           consumer.
 *
 * Capability gate runs at every Region level so nested children share
 * the same fast-path the kernel uses for top-level regions (spec §8
 * layer 1, recursive). Children are addressed as `parent/child` ids
 * per spec §5.5.
 */

import { useState, useCallback, useEffect, useId } from '@wordpress/element';
import {
	useFocusOnMount,
	useFocusReturn,
	useConstrainedTabbing,
	useMergeRefs,
} from '@wordpress/compose';
import { __ } from '@wordpress/i18n';

import { MountedApp } from './mountApp';
import { useRouteForRegion } from '../routing/useRoute';
import { useKernel, useDynamicChildren } from '../kernel-context';
import { shouldRenderRegion } from '../capabilities/shouldRenderRegion.mjs';
import { getPlatformServices } from './platformServices.mjs';
import { registerTrigger } from '../bindings/triggerStore.mjs';
import { ScopedThemeProvider } from '../styles/ThemeProviderHost';
import { useMode } from '../modes/useMode';
import { readRegionState } from '../modes/resolveMode.mjs';

export function Region( { region } ) {
	if (
		! shouldRenderRegion( region, window.wpAdminWorkspaces?.capabilities )
	) {
		return null;
	}
	return (
		<ScopedRegionTheme regionId={ region.id }>
			<GenericRegion region={ region } />
		</ScopedRegionTheme>
	);
}

/**
 * Wraps a region in a nested `<ScopedThemeProvider>` when the resolved
 * workspace.json declares `styles.regions[regionId]` (theme seeds OR direct
 * slot overrides). Zero-cost when the region has no styles authored —
 * just renders children.
 * @param {Object} root0
 * @param {*}      root0.regionId
 * @param {*}      root0.children
 */
function ScopedRegionTheme( { regionId, children } ) {
	const { config } = useKernel();
	const regionStyles = config?.styles?.regions?.[ regionId ];
	return (
		<ScopedThemeProvider styles={ regionStyles }>
			{ children }
		</ScopedThemeProvider>
	);
}

/**
 * Spec §5.5: nested children are addressable as `{parent}/{child}`. This
 * component materializes each child as a `<Region>` whose `id` is the
 * parent's id joined with the child's key. Children pass through the
 * same dispatcher recursively, so further nesting + per-child cap
 * gating work without coordination.
 *
 * Statically-declared `region.regions` render first; runtime children
 * added via the `core:dynamic-children` platform service (spec §5.5)
 * append after. Each entry's React key uses the child key directly so
 * runtime add/remove preserves identity for unchanged siblings.
 * @param {Object} root0
 * @param {*}      root0.region
 */
function RegionChildren( { region } ) {
	const { children: dynamic } = useDynamicChildren( region.id );
	const staticEntries =
		region.regions && typeof region.regions === 'object'
			? Object.entries( region.regions )
			: [];
	if ( staticEntries.length === 0 && dynamic.length === 0 ) {
		return null;
	}
	return (
		<>
			{ staticEntries.map( ( [ key, child ] ) => (
				<Region
					key={ key }
					region={ { id: childId( region.id, key ), ...child } }
				/>
			) ) }
			{ dynamic.map( ( { key, decl } ) => (
				<Region
					key={ key }
					region={ { id: childId( region.id, key ), ...decl } }
				/>
			) ) }
		</>
	);
}

function childId( parentId, key ) {
	if ( ! parentId ) {
		return key;
	}
	return `${ parentId }/${ key }`;
}

/* ─────────────────────── generic (v2 declarations) ─────── */

/**
 * Renderer for v2-shape declarations (no legacy `source`). Composes
 * the region's behavior from platform-service requests (spec §5.3) via
 * `getPlatformServices`:
 *   - `isModal`           → ARIA modal + focus trap + constrained tabbing
 *   - `dismissTriggers`   → Escape / backdrop-click handlers
 *   - `autofocusSelector` → focus on mount (else useFocusOnMount default)
 *   - placement: 'overlay' → backdrop wrapper
 *
 * Persistent regions render as a plain landmark container; modal
 * regions wrap with backdrop + focus trap. Children + app + contains[]
 * render inside the resolved container.
 *
 * V2.M7 will retire the legacy switch above; once bundled workspaces
 * migrate to v2, every region flows through this path.
 * @param {Object} root0
 * @param {*}      root0.region
 */
function GenericRegion( { region } ) {
	const services = getPlatformServices( region );
	const { config } = useKernel();
	const routesBlock = config?.routes || null;
	// Only routable regions need to subscribe to the router. A region
	// without `routing.route-key` will never have a matched route, so
	// running `useRouteForRegion` per-region per-URL-change wastes work
	// at scale. Gate the hook on the route-key declaration.
	const isRoutable = !! region?.routing?.[ 'route-key' ];
	const matched = useRouteForRegion(
		isRoutable ? region : null,
		routesBlock
	);

	// v3 mode resolution. Returns `{ modal, regions, modeId, screenId }`
	// for the active screen. Per-region state lives at
	// `regions[ region.id ]`; absent → render normally. Modal modes leave
	// chrome alone (`regions: null`).
	const mode = useMode();
	const regionState = readRegionState( region.id, mode );

	if ( services.isModal ) {
		return (
			<ModalRegion
				region={ region }
				services={ services }
				matched={ matched }
				regionState={ regionState }
				modeId={ mode.modeId }
			/>
		);
	}
	return (
		<PersistentRegion
			region={ region }
			services={ services }
			matched={ matched }
			regionState={ regionState }
			modeId={ mode.modeId }
		/>
	);
}

function PersistentRegion( { region, matched, regionState, modeId } ) {
	const role = region.role || 'region';
	const className = regionClassName( region, regionState );
	const style = toReactStyle( region.style );
	const stateAttrs = regionStateDataAttrs( regionState, modeId );
	// `data-app-mounted` lets engine CSS collapse multi-app peer
	// regions (e.g. `detail`, `inspector`, `preview`) when no route
	// matches. Emitted ONLY on regions that opt in via
	// `routing.mode: "mirror"`. The `_self` content region and
	// `query`-mode regions (palette etc.) keep their existing
	// always-rendered behavior — collapse-when-empty is exclusively
	// the multi-app peer-slot contract.
	const isMirrorRouted = region?.routing?.mode === 'mirror';
	const hasMountedApp = !! ( matched?.app || region.app );
	const appMountedAttr = isMirrorRouted
		? { 'data-app-mounted': hasMountedApp ? 'true' : 'false' }
		: {};
	return (
		<div
			role={ role }
			className={ className }
			data-region-id={ region.id }
			aria-label={ region.label || undefined }
			{ ...appMountedAttr }
			style={ style }
			{ ...stateAttrs }
		>
			{ renderRegionApp( region, matched ) }
			<RegionChildren region={ region } />
		</div>
	);
}

function ModalRegion( { region, services, matched, regionState, modeId } ) {
	const labelId = useId();
	const focusOnMountRef = useFocusOnMount();
	const focusReturnRef = useFocusReturn();
	const constrainTabbingRef = useConstrainedTabbing();
	const dialogRef = useMergeRefs( [
		focusOnMountRef,
		focusReturnRef,
		constrainTabbingRef,
	] );

	const closeOnEscape = services.dismissTriggers.includes( 'Escape' );
	const closeOnBackdrop =
		services.dismissTriggers.includes( 'backdrop-click' );

	// Triggerable regions (spec §5.3 `platform.triggerable: true`) sit
	// closed-by-default until invoked by a binding. Non-triggerable
	// modal regions render their dialog chrome immediately — the
	// classic "show this dialog now" pattern. The bundled command
	// palette region is triggerable: starting closed avoids the
	// always-visible backdrop. When workspace.json's `bindings` block
	// declares a keystroke for this app, BindingsConsumer dispatches
	// to the open handler we register below via triggerStore.
	const [ isOpen, setOpen ] = useState( ! services.isTriggerable );
	const close = useCallback( () => setOpen( false ), [] );

	// Register an open handler so `bindings` invocations can flip the
	// region open. Only triggerable regions register; non-triggerable
	// modals are always-open and have nothing to wire.
	const appId = region?.app || null;
	useEffect( () => {
		if ( ! services.isTriggerable || ! appId ) {
			return undefined;
		}
		return registerTrigger( appId, () => setOpen( true ) );
	}, [ services.isTriggerable, appId ] );

	useEffect( () => {
		if ( ! isOpen || ! closeOnEscape ) {
			return;
		}
		const onKey = ( e ) => {
			if ( e.key === 'Escape' ) {
				close();
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	}, [ isOpen, closeOnEscape, close ] );

	useEffect( () => {
		if ( ! isOpen || ! services.autofocusSelector ) {
			return;
		}
		// Defer one tick so refs attach + dialog mounts. Scope the
		// query to the dialog container so a stray selector match in a
		// sibling region can't steal focus.
		const id = window.setTimeout( () => {
			const root = dialogRef.current || document;
			const el = root.querySelector( services.autofocusSelector );
			if ( el && typeof el.focus === 'function' ) {
				el.focus();
			}
		}, 0 );
		return () => window.clearTimeout( id );
		// dialogRef is a stable merged ref — no need to depend on it.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ isOpen, services.autofocusSelector ] );

	const role = region.role || 'dialog';
	const className = regionClassName( region, regionState );
	const stateAttrs = regionStateDataAttrs( regionState, modeId );

	if ( ! isOpen ) {
		// Render an inert subtree so children that need to mount for
		// side-effects (e.g. `core:command-palette`'s `useCommandLoader`)
		// keep firing while the visible dialog chrome stays hidden. The
		// container is `display: none` + `aria-hidden` so AT and the
		// browser's focus trap leave it alone.
		return (
			<div
				className={ `${ className } is-modal-closed` }
				data-region-id={ region.id }
				aria-hidden="true"
				style={ { display: 'none' } }
				{ ...stateAttrs }
			>
				{ renderRegionApp( region, matched ) }
				<RegionChildren region={ region } />
			</div>
		);
	}

	const dialogStyle = toReactStyle( region.style );

	// Accessible name: an authored `label` reads cleanly; absent one, the
	// region id is the fallback (a raw slug like `editor/inspector`, but
	// still better than an unnamed dialog).
	const accessibleName = region.label || region.id;

	return (
		<>
			<button
				type="button"
				tabIndex={ -1 }
				aria-label={ __( 'Close', 'wp-admin-workspaces' ) }
				className="wp-admin-workspaces-region__backdrop"
				data-region-id={ region.id }
				onClick={ closeOnBackdrop ? close : undefined }
			/>
			<div
				ref={ dialogRef }
				role={ role }
				aria-modal="true"
				aria-labelledby={ accessibleName ? labelId : undefined }
				className={ `${ className } is-modal` }
				data-region-id={ region.id }
				style={ dialogStyle }
				{ ...stateAttrs }
			>
				{ accessibleName ? (
					<span id={ labelId } className="screen-reader-text">
						{ accessibleName }
					</span>
				) : null }
				{ renderRegionApp( region, matched ) }
				<RegionChildren region={ region } />
			</div>
		</>
	);
}

/**
 * Convert engine-template `default-style` (kebab-case CSS property keys
 * matching the underlying CSS property names) to React's camelCase
 * `style` shape. CSS variable values + `var(--…)` strings pass through
 * unchanged so the cascade still resolves them at consume time. Returns
 * `undefined` when there's nothing to apply, so React skips emitting a
 * `style` attribute entirely.
 * @param {*} style
 */
function toReactStyle( style ) {
	if ( ! style || typeof style !== 'object' ) {
		return undefined;
	}
	const out = {};
	let any = false;
	for ( const [ key, value ] of Object.entries( style ) ) {
		if ( value === undefined || value === null || value === '' ) {
			continue;
		}
		any = true;
		out[ kebabToCamel( key ) ] = value;
	}
	return any ? out : undefined;
}

function kebabToCamel( key ) {
	return String( key ).replace( /-([a-z])/g, ( _, c ) => c.toUpperCase() );
}

function regionClassName( region, regionState ) {
	const classes = [ 'wp-admin-workspaces-region' ];
	if ( region.id ) {
		const slug = String( region.id ).replace( /\//g, '__' );
		classes.push( `wp-admin-workspaces-region--${ slug }` );
	}
	// v3 mode state — each boolean-true key becomes a modifier class so
	// engine CSS can target both `[data-mode-*]` attributes and BEM
	// modifiers. Unknown keys also project to classes (engines that ship
	// custom region-state vocabulary work without kernel changes).
	if ( regionState && typeof regionState === 'object' ) {
		for ( const [ key, value ] of Object.entries( regionState ) ) {
			if ( value === true ) {
				classes.push( `wp-admin-workspaces-region--${ kebab( key ) }` );
			}
		}
	}
	return classes.join( ' ' );
}

/**
 * Project a region-state object onto `data-mode-*` attributes. Each
 * boolean key becomes `data-mode-<kebab-key>="true"` (boolean-true only;
 * boolean-false attributes would falsely target CSS selectors). Other
 * scalar values (string, number) project as-is so engines can ship
 * non-boolean vocabulary (e.g. `data-mode-density="comfortable"`).
 *
 * `modeId` always projects to `data-mode="<modeId>"` so engine CSS can
 * target full-mode states without enumerating each region-state key.
 *
 * Returns `undefined` when there's nothing to emit so React skips the
 * attribute pass entirely.
 *
 * @param {Object|null} regionState
 * @param {string|null} modeId
 */
function regionStateDataAttrs( regionState, modeId ) {
	const attrs = {};
	if ( modeId && modeId !== 'default' ) {
		attrs[ 'data-mode' ] = modeId;
	}
	if ( regionState && typeof regionState === 'object' ) {
		for ( const [ key, value ] of Object.entries( regionState ) ) {
			if ( value === true ) {
				attrs[ `data-mode-${ kebab( key ) }` ] = 'true';
			} else if (
				typeof value === 'string' ||
				typeof value === 'number'
			) {
				attrs[ `data-mode-${ kebab( key ) }` ] = String( value );
			}
		}
	}
	return Object.keys( attrs ).length ? attrs : undefined;
}

function kebab( s ) {
	return String( s )
		.replace( /([a-z0-9])([A-Z])/g, '$1-$2' )
		.toLowerCase();
}

/**
 * Decide which app to mount in a v2 region:
 *
 *   - If the region has `routing.route-key` and the URL slot resolved
 *     to a route entry, mount that route's app with its (interpolated)
 *     config.
 *   - Otherwise, if the region has a fixed `app`, mount it with the
 *     region's `config`.
 *   - Otherwise, render nothing.
 *
 * `app` and `routing.route-key` are mutually exclusive (spec §5.4 +
 * V2.M2 task 5 sanitization), so the two branches don't overlap.
 * @param {*} region
 * @param {*} matched
 */
function renderRegionApp( region, matched ) {
	let ref = null;
	if ( matched?.app ) {
		ref = { id: matched.app, source: matched.app, config: matched.config };
	} else if ( region.app ) {
		ref = { id: region.app, source: region.app, config: region.config };
	}
	if ( ! ref ) {
		return null;
	}
	return (
		<div className="wp-admin-workspaces-region__app">
			<MountedApp appRef={ ref } regionId={ region.id } />
		</div>
	);
}
