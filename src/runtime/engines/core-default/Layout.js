/**
 * core:default — flagship engine.
 *
 * Arranges regions into the dark-chrome / elevated-card visual pattern the
 * MVP shipped (see `src/shell/ShellLayout.js`):
 *
 *   ┌─────────────────────────────────────────────┐
 *   │ toolbar (persistent, top)                   │
 *   ├──────────┬──────────────────────────────────┤
 *   │ sidebar  │ content (routable region — body) │
 *   │ (persi-  │                                  │
 *   │ stent,   ├──────────────────────────────────┤
 *   │ left)    │ preview (persistent, right when  │
 *   │          │ provided)                        │
 *   └──────────┴──────────────────────────────────┘
 *
 *   overlay regions  → floating layer over body
 *   drawer regions   → slide in from left/right
 *
 * Region kind drives bucket placement; well-known region ids drive slot
 * assignment within the persistent bucket. V2.M2 rewrote region rendering
 * onto the generic `<Region>` renderer; bucketing now uses `getRegionKind`
 * (legacy source-id mapping plus per-region override). V2.M6 will swap
 * kind-based dispatch for platform-service dispatch.
 */

import { Region } from '../../regions/Region';
import { getRegionKind } from '../../regions/regionKind';

const SLOT_IDS = {
	toolbar: 'toolbar',
	sidebar: 'sidebar',
	content: 'content',
	detail: 'detail',
	preview: 'preview',
};

function classifyRegions( regions ) {
	const buckets = {
		persistent: [],
		overlay: [],
		drawer: [],
	};
	Object.values( regions ).forEach( ( region ) => {
		const kind = getRegionKind( region );
		if ( ! buckets[ kind ] ) {
			return;
		}
		buckets[ kind ].push( region );
	} );
	return buckets;
}

function findById( bucket, id ) {
	return bucket.find( ( region ) => region.id === id );
}

export default function CoreSiteEditorLayout( { regions } ) {
	const buckets = classifyRegions( regions );

	const toolbar = findById( buckets.persistent, SLOT_IDS.toolbar );
	const sidebar = findById( buckets.persistent, SLOT_IDS.sidebar );
	const content = findById( buckets.persistent, SLOT_IDS.content );
	const detail = findById( buckets.persistent, SLOT_IDS.detail );
	const preview = findById( buckets.persistent, SLOT_IDS.preview );

	const claimed = new Set(
		[ toolbar, sidebar, content, detail, preview ]
			.filter( Boolean )
			.map( ( region ) => region.id )
	);
	const stragglers = buckets.persistent.filter(
		( region ) => ! claimed.has( region.id )
	);

	return (
		<div className="wp-admin-shell-layout" data-engine="core:default">
			{ toolbar && <Region key={ toolbar.id } region={ toolbar } /> }

			<div className="wp-admin-shell-layout__body">
				{ sidebar && <Region key={ sidebar.id } region={ sidebar } /> }

				<div
					className={ `wp-admin-shell-areas${
						preview ? ' has-preview' : ''
					}${ detail ? ' has-detail' : '' }` }
				>
					{ content && (
						<Region key={ content.id } region={ content } />
					) }
					{ detail && <Region key={ detail.id } region={ detail } /> }
					{ preview && (
						<Region key={ preview.id } region={ preview } />
					) }
				</div>
			</div>

			{ stragglers.map( ( region ) => (
				<Region key={ region.id } region={ region } />
			) ) }

			{ buckets.drawer.map( ( region ) => (
				<Region key={ region.id } region={ region } />
			) ) }
			{ buckets.overlay.map( ( region ) => (
				<Region key={ region.id } region={ region } />
			) ) }
		</div>
	);
}
