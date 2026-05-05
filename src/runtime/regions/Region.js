/**
 * Generic, declaration-driven region renderer (V2.M2 task 2 + task 4).
 *
 * Replaces the six per-source region modules
 * (`{sidebar,toolbar,content,preview,overlay,drawer}-region/`). The
 * region-source-as-class abstraction is gone — regions are just region
 * declarations, dispatched here by their resolved shape.
 *
 * v1 admin.json shells still ship `region.source: "core:sidebar-region"`
 * (etc.); this module dispatches behavior off that legacy id. v2-shape
 * declarations (no `source`, declared via `template` + `role` +
 * platform/style/regions/app) fall through to a generic container
 * renderer that honors `role` and recurses through `regions`. Task 6
 * will move dispatch onto platform services; task 7 will retire the
 * legacy source ids.
 *
 * Capability gate runs at every Region level so nested children share
 * the same fast-path the kernel uses for top-level regions (spec §8
 * layer 1, recursive). Children are addressed as `parent/child` ids
 * per spec §5.5.
 */

import { useState, useCallback, useEffect, useMemo, useId } from '@wordpress/element';
import {
	useFocusOnMount,
	useFocusReturn,
	useConstrainedTabbing,
	useMergeRefs,
} from '@wordpress/compose';
import { __ } from '@wordpress/i18n';

import { MountedApp, getApplications } from './mountApp';
import { useRoute } from '../routing/useRoute';
import { useKernel } from '../kernel-context';
import { useSelection } from '../selection/useSelection';
import { userCan } from '../capabilities/userCan';
import { getPlatformServices } from './platformServices.mjs';

export function Region( { region } ) {
	if ( ! region ) {
		return null;
	}
	if ( region.capability && ! userCan( region.capability ) ) {
		return null;
	}
	switch ( region.source ) {
		case 'core:sidebar-region':
			return <SidebarRegion region={ region } />;
		case 'core:toolbar-region':
			return <ToolbarRegion region={ region } />;
		case 'core:content-region':
			return <ContentRegion region={ region } />;
		case 'core:preview-region':
			return <PreviewRegion region={ region } />;
		case 'core:overlay-region':
			return <OverlayRegion region={ region } />;
		case 'core:drawer-region':
			return <DrawerRegion region={ region } />;
		default:
			return <GenericRegion region={ region } />;
	}
}

function renderContains( region ) {
	return ( region.contains || [] ).map( ( appRef, idx ) => (
		<MountedApp
			key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
			appRef={ appRef }
			regionId={ region.id }
		/>
	) );
}

/**
 * Spec §5.5: nested children are addressable as `{parent}/{child}`. This
 * helper materializes each child as a `<Region>` whose `id` is the
 * parent's id joined with the child's key. Children pass through the
 * same dispatcher recursively, so further nesting + per-child cap
 * gating work without coordination.
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

/* ─────────────────────── sidebar ─────────────────────── */

function SidebarRegion( { region } ) {
	const cfg = region.config || {};
	const isCollapsed = !! cfg.collapsed;
	const width = cfg.width || 300;

	return (
		<nav
			aria-label={ cfg.label || __( 'Navigation', 'wp-admin-shell' ) }
			className={ `wp-admin-shell-nav${ isCollapsed ? ' is-collapsed' : '' }` }
			data-region-id={ region.id }
			style={ { '--wp-admin-shell-nav-width': `${ width }px` } }
		>
			{ renderContains( region ) }
			{ renderChildren( region ) }
		</nav>
	);
}

/* ─────────────────────── toolbar ─────────────────────── */

function ToolbarRegion( { region } ) {
	return (
		<div
			className="wp-admin-shell-toolbar"
			data-region-id={ region.id }
		>
			{ renderContains( region ) }
			{ renderChildren( region ) }
		</div>
	);
}

/* ─────────────────────── content ─────────────────────── */

function ContentRegion( { region } ) {
	const cfg = region.config || {};
	const isRouted = cfg.router === true;
	const route = useRoute();
	const { config } = useKernel();

	if ( ! isRouted ) {
		return (
			<main
				className="wp-admin-shell-content"
				data-region-id={ region.id }
			>
				{ renderContains( region ) }
				{ renderChildren( region ) }
			</main>
		);
	}

	const apps = getApplications( config );
	const defaultRoute =
		config.settings?.defaultRoute || config.defaultRoute || null;
	const fallbackId = defaultRoute
		? routeToAppId( defaultRoute, apps )
		: ( apps.find( ( a ) => ! a.hidden )?.id || null );

	const requestedId = route.appId || fallbackId;
	const matched = apps.find( ( a ) => a.id === requestedId ) || null;

	if ( ! matched ) {
		return (
			<div
				className="wp-admin-shell-areas"
				data-region-id={ region.id }
			>
				<main className="wp-admin-shell-content">
					<div className="wp-admin-shell-content__empty">
						{ __( 'Page not found.', 'wp-admin-shell' ) }
					</div>
				</main>
			</div>
		);
	}

	if ( matched.capability && ! userCan( matched.capability ) ) {
		return (
			<main className="wp-admin-shell-content" data-region-id={ region.id }>
				<div className="wp-admin-shell-content__forbidden">
					<h2>{ __( 'Access denied', 'wp-admin-shell' ) }</h2>
					<p>
						{ __(
							'You do not have permission to view this app.',
							'wp-admin-shell'
						) }
					</p>
				</div>
			</main>
		);
	}

	const isFullscreen =
		matched.source.startsWith( 'iframe:' ) ||
		matched.source === 'core:editor';
	const contentWidth = matched.config?.contentWidth;

	return (
		<main
			className="wp-admin-shell-content"
			data-region-id={ region.id }
			style={
				contentWidth
					? { maxWidth: contentWidth, flexGrow: 0, flexShrink: 0 }
					: undefined
			}
		>
			<div
				className={ `wp-admin-shell-content__app${
					isFullscreen ? ' is-iframe' : ''
				}` }
			>
				<MountedApp
					appRef={ matched }
					regionId={ region.id }
					segments={ route.segments }
				/>
			</div>
			{ renderChildren( region ) }
		</main>
	);
}

function routeToAppId( route, apps ) {
	const trimmed = String( route ).replace( /^#?\/?/, '' ).split( '/' )[ 0 ];
	if ( ! trimmed ) {
		return null;
	}
	const byId = apps.find( ( a ) => a.id === trimmed );
	if ( byId ) {
		return byId.id;
	}
	const byRoute = apps.find( ( a ) => a.route === '/' + trimmed || a.route === trimmed );
	return byRoute?.id || trimmed;
}

/* ─────────────────────── preview ─────────────────────── */

function PreviewRegion( { region } ) {
	const cfg = region.config || {};
	const respondsTo = cfg.respondsTo;
	useSelection( respondsTo ? scopeFromRespondsTo( respondsTo ) : null );

	return (
		<div
			className="wp-admin-shell-preview"
			data-region-id={ region.id }
		>
			{ ( region.contains || [] ).map( ( appRef, idx ) => (
				<div
					key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
					className="wp-admin-shell-content__app"
				>
					<MountedApp
						appRef={ appRef }
						regionId={ region.id }
					/>
				</div>
			) ) }
			{ renderChildren( region ) }
		</div>
	);
}

function scopeFromRespondsTo( respondsTo ) {
	const idx = respondsTo.lastIndexOf( '.selection' );
	return idx > 0 ? respondsTo.slice( 0, idx ) : respondsTo;
}

/* ─────────────────────── overlay ─────────────────────── */

function OverlayRegion( { region } ) {
	return (
		<div
			className="wp-admin-shell-overlay"
			data-region-id={ region.id }
			style={ { display: 'contents' } }
		>
			{ renderContains( region ) }
			{ renderChildren( region ) }
		</div>
	);
}

/* ─────────────────────── drawer ─────────────────────── */

function DrawerRegion( { region } ) {
	const cfg = region.config || {};
	const position = cfg.position === 'left' ? 'left' : 'right';
	const [ isOpen, setOpen ] = useState( false );

	const close = useCallback( () => setOpen( false ), [] );

	const dismissOn = useMemo(
		() => normalizeDismiss( cfg.dismissOn ),
		[ cfg.dismissOn ]
	);
	const closeOnEscape  = dismissOn.includes( 'escape' );
	const closeOnOverlay = dismissOn.includes( 'overlay-click' );

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

	const labelId = useId();
	const focusOnMountRef     = useFocusOnMount();
	const focusReturnRef      = useFocusReturn();
	const constrainTabbingRef = useConstrainedTabbing();
	const dialogRef = useMergeRefs( [
		focusOnMountRef,
		focusReturnRef,
		constrainTabbingRef,
	] );

	if ( ! isOpen ) {
		return null;
	}

	const accessibleLabel = cfg.label || __( 'Drawer', 'wp-admin-shell' );

	return (
		<>
			<div
				className="wp-admin-shell-drawer__overlay"
				onClick={ closeOnOverlay ? close : undefined }
			/>
			<aside
				ref={ dialogRef }
				role="dialog"
				aria-modal="true"
				aria-labelledby={ labelId }
				className={ `wp-admin-shell-drawer is-${ position }` }
				data-region-id={ region.id }
			>
				<span id={ labelId } className="screen-reader-text">
					{ accessibleLabel }
				</span>
				{ renderContains( region ) }
				{ renderChildren( region ) }
			</aside>
		</>
	);
}

function normalizeDismiss( value ) {
	if ( ! value ) {
		return [];
	}
	if ( Array.isArray( value ) ) {
		return value;
	}
	return String( value )
		.split( /\s*\|\s*/ )
		.filter( Boolean );
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
 */
function GenericRegion( { region } ) {
	const services = getPlatformServices( region );
	if ( services.isModal ) {
		return <ModalRegion region={ region } services={ services } />;
	}
	return <PersistentRegion region={ region } services={ services } />;
}

function PersistentRegion( { region } ) {
	const role = region.role || 'region';
	const className = regionClassName( region );
	return (
		<div
			role={ role }
			className={ className }
			data-region-id={ region.id }
		>
			{ renderRegionApp( region ) }
			{ renderContains( region ) }
			{ renderChildren( region ) }
		</div>
	);
}

function ModalRegion( { region, services } ) {
	const labelId = useId();
	const focusOnMountRef     = useFocusOnMount();
	const focusReturnRef      = useFocusReturn();
	const constrainTabbingRef = useConstrainedTabbing();
	const dialogRef = useMergeRefs( [
		focusOnMountRef,
		focusReturnRef,
		constrainTabbingRef,
	] );

	const closeOnEscape = services.dismissTriggers.includes( 'Escape' );
	const closeOnBackdrop = services.dismissTriggers.includes( 'backdrop-click' );
	const [ isOpen, setOpen ] = useState( true );
	const close = useCallback( () => setOpen( false ), [] );

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
		// Defer one tick so refs are attached.
		const id = window.setTimeout( () => {
			const el = document.querySelector( services.autofocusSelector );
			if ( el && typeof el.focus === 'function' ) {
				el.focus();
			}
		}, 0 );
		return () => window.clearTimeout( id );
	}, [ isOpen, services.autofocusSelector ] );

	if ( ! isOpen ) {
		return null;
	}

	const role = region.role || 'dialog';
	const className = regionClassName( region );

	return (
		<>
			<div
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
			>
				{ region.id ? (
					<span id={ labelId } className="screen-reader-text">
						{ region.id }
					</span>
				) : null }
				{ renderRegionApp( region ) }
				{ renderContains( region ) }
				{ renderChildren( region ) }
			</div>
		</>
	);
}

function regionClassName( region ) {
	if ( ! region.id ) {
		return 'wp-admin-shell-region';
	}
	const slug = String( region.id ).replace( /\//g, '__' );
	return `wp-admin-shell-region wp-admin-shell-region--${ slug }`;
}

function renderRegionApp( region ) {
	if ( ! region.app ) {
		return null;
	}
	return (
		<MountedApp
			appRef={ { id: region.app, source: region.app, config: region.config } }
			regionId={ region.id }
		/>
	);
}
