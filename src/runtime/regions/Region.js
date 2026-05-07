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
import { useKernel } from '../kernel-context';
import { userCan } from '../capabilities/userCan';
import { getPlatformServices } from './platformServices.mjs';
import { registerTrigger } from '../bindings/triggerStore.mjs';
import { ScopedThemeProvider } from '../styles/ThemeProviderHost';

export function Region( { region } ) {
	if ( ! region ) {
		return null;
	}
	if ( region.capability && ! userCan( region.capability ) ) {
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
 * admin.json declares `styles.regions[regionId]` (theme seeds OR direct
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
 * helper materializes each child as a `<Region>` whose `id` is the
 * parent's id joined with the child's key. Children pass through the
 * same dispatcher recursively, so further nesting + per-child cap
 * gating work without coordination.
 * @param {*} region
 */
function renderChildren( region ) {
	const children = region.regions;
	if ( ! children || typeof children !== 'object' ) {
		return null;
	}
	return Object.entries( children ).map( ( [ key, child ] ) => (
		<Region
			key={ key }
			region={ { id: childId( region.id, key ), ...child } }
		/>
	) );
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
 * V2.M7 will retire the legacy switch above; once bundled shells
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

	if ( services.isModal ) {
		return (
			<ModalRegion
				region={ region }
				services={ services }
				matched={ matched }
			/>
		);
	}
	return (
		<PersistentRegion
			region={ region }
			services={ services }
			matched={ matched }
		/>
	);
}

function PersistentRegion( { region, matched } ) {
	const role = region.role || 'region';
	const className = regionClassName( region );
	const style = toReactStyle( region.style );
	return (
		<div
			role={ role }
			className={ className }
			data-region-id={ region.id }
			style={ style }
		>
			{ renderRegionApp( region, matched ) }
			{ renderChildren( region ) }
		</div>
	);
}

function ModalRegion( { region, services, matched } ) {
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
	// always-visible backdrop. When admin.json's `bindings` block
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
	const className = regionClassName( region );

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
			>
				{ renderRegionApp( region, matched ) }
				{ renderChildren( region ) }
			</div>
		);
	}

	const dialogStyle = toReactStyle( region.style );

	return (
		<>
			<button
				type="button"
				tabIndex={ -1 }
				aria-label={ __( 'Close', 'wp-admin-shell' ) }
				className="wp-admin-shell-region__backdrop"
				data-region-id={ region.id }
				onClick={ closeOnBackdrop ? close : undefined }
			/>
			<div
				ref={ dialogRef }
				role={ role }
				aria-modal="true"
				aria-labelledby={ region.id ? labelId : undefined }
				className={ `${ className } is-modal` }
				data-region-id={ region.id }
				style={ dialogStyle }
			>
				{ region.id ? (
					<span id={ labelId } className="screen-reader-text">
						{ region.id }
					</span>
				) : null }
				{ renderRegionApp( region, matched ) }
				{ renderChildren( region ) }
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

function regionClassName( region ) {
	if ( ! region.id ) {
		return 'wp-admin-shell-region';
	}
	const slug = String( region.id ).replace( /\//g, '__' );
	return `wp-admin-shell-region wp-admin-shell-region--${ slug }`;
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
	const isFullscreen =
		typeof ref.source === 'string' &&
		( ref.source === 'core:editor' ||
			ref.source === 'core:iframe-fallback' );
	return (
		<div
			className={ `wp-admin-shell-region__app${
				isFullscreen ? ' is-fullscreen' : ''
			}` }
		>
			<MountedApp appRef={ ref } regionId={ region.id } />
		</div>
	);
}
