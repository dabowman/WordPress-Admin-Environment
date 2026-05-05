/**
 * Generic, declaration-driven region renderer (V2.M2 task 2).
 *
 * Replaces the six per-source region modules
 * (`{sidebar,toolbar,content,preview,overlay,drawer}-region/`). The
 * region-source-as-class abstraction is gone — regions are just region
 * declarations, dispatched here by their resolved shape.
 *
 * v1 admin.json shells still ship `region.source: "core:sidebar-region"`
 * (etc.); this module dispatches behavior off that legacy id. V2.M3+
 * will route through engine templates, V2.M6 will move dispatch onto
 * platform services, and V2.M7 will migrate the bundled shells off the
 * legacy source ids entirely. Until then, the behaviors below preserve
 * v1 DOM, classes, and a11y so existing shells render unchanged.
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

export function Region( { region } ) {
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
			return null;
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
