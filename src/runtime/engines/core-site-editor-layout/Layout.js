/**
 * core:site-editor-layout — v1's only engine.
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
 * assignment within the persistent bucket. Unknown persistent regions
 * render as stragglers below the body. `floating` and `tiled` collapse to
 * `persistent` for v1.
 */

const SLOT_IDS = {
	toolbar: 'toolbar',
	sidebar: 'sidebar',
	content: 'content',
	preview: 'preview',
};

function classifyRegions( regions, regionSources ) {
	const buckets = {
		persistent: [],
		overlay: [],
		drawer: [],
	};
	Object.values( regions ).forEach( ( region ) => {
		const sourceDef = regionSources[ region.source ];
		if ( ! sourceDef ) {
			return;
		}
		// Per-source default kind. Region instance can override via
		// `region.kind`, but the default comes from the source.
		let kind = region.kind || sourceDef.regionKind || 'persistent';
		if ( kind === 'floating' || kind === 'tiled' ) {
			kind = 'persistent';
		}
		buckets[ kind ].push( { region, sourceDef } );
	} );
	return buckets;
}

function findById( bucket, id ) {
	return bucket.find( ( { region } ) => region.id === id );
}

export default function CoreSiteEditorLayout( { config, regions, regionSources } ) {
	const buckets = classifyRegions( regions, regionSources );

	const toolbar = findById( buckets.persistent, SLOT_IDS.toolbar );
	const sidebar = findById( buckets.persistent, SLOT_IDS.sidebar );
	const content = findById( buckets.persistent, SLOT_IDS.content );
	const preview = findById( buckets.persistent, SLOT_IDS.preview );

	const claimed = new Set(
		[ toolbar, sidebar, content, preview ]
			.filter( Boolean )
			.map( ( { region } ) => region.id )
	);
	const stragglers = buckets.persistent.filter(
		( { region } ) => ! claimed.has( region.id )
	);

	const accent =
		config?.styles?.color?.accent?.brand ||
		config?.branding?.accentColor ||
		'#3858e9';

	return (
		<div
			className="wp-admin-shell-layout"
			data-engine="core:site-editor-layout"
			style={ { '--wp-admin-shell-accent': accent } }
		>
			{ toolbar && renderRegion( toolbar ) }

			<div className="wp-admin-shell-layout__body">
				{ sidebar && renderRegion( sidebar ) }

				<div
					className={ `wp-admin-shell-areas${
						preview ? ' has-preview' : ''
					}` }
				>
					{ content && renderRegion( content ) }
					{ preview && renderRegion( preview ) }
				</div>
			</div>

			{ stragglers.map( ( entry ) => renderRegion( entry ) ) }

			{ buckets.drawer.map( ( entry ) => renderRegion( entry ) ) }
			{ buckets.overlay.map( ( entry ) => renderRegion( entry ) ) }
		</div>
	);
}

function renderRegion( { region, sourceDef } ) {
	const Component = sourceDef.Component;
	return (
		<Component
			key={ region.id }
			region={ region }
		/>
	);
}
