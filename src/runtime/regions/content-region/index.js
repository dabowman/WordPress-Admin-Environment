import { __ } from '@wordpress/i18n';
import { MountedApp, toApplicationList } from '../mountApp';
import { useRoute } from '../../routing/useRoute';
import { useKernel } from '../../kernel-context';

/**
 * core:content-region — main content area.
 *
 * When `region.config.router === true`, the region is the routable region:
 * it mounts whatever routable app the current hash resolves to (instead of
 * the static contains list). Sub-route segments pass through as `segments`.
 *
 * When `router` is false/missing, the region behaves like any other
 * persistent region and mounts the apps in `contains[]`.
 */
function ContentRegion( { region } ) {
	const cfg = region.config || {};
	const isRouted = cfg.router === true;
	const route = useRoute();
	const { config } = useKernel();

	if ( isRouted ) {
		const apps = toApplicationList( config.applications );
		const fallbackId = config.defaultRoute
			? routeToAppId( config.defaultRoute, apps )
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

	// Static contains[] mode.
	return (
		<main
			className="wp-admin-shell-content"
			data-region-id={ region.id }
		>
			{ ( region.contains || [] ).map( ( appRef, idx ) => (
				<MountedApp
					key={ typeof appRef === 'string' ? appRef : ( appRef.id || idx ) }
					appRef={ appRef }
					regionId={ region.id }
				/>
			) ) }
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

/** @type {import('../../registry/source-types.js').RegionSource} */
const contentRegion = {
	kind: 'region',
	id: 'core:content-region',
	title: 'Content region',
	regionKind: 'persistent',
	routable: true,
	Component: ContentRegion,
};

export default contentRegion;
