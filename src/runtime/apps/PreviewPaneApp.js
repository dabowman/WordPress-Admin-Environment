import { __ } from '@wordpress/i18n';
import { useSelection } from '../selection/useSelection';

/**
 * core:preview-pane — placeholder preview app.
 *
 * Reads the configured `follow` selection scope and displays whatever is
 * there. For M1 this is a debug stub; M4 will replace it with real preview
 * content for posts/pages/templates.
 *
 * The default `follow` value (`'content.selection'`) is intentionally
 * single-region — v1 ships with one routable region, so the only
 * publishing scope worth following by default is the content region's.
 * v2 multi-routable regions need explicit `config.follow` per consumer;
 * the resolver does not auto-pick when more than one publisher exists.
 */
export default function PreviewPaneApp( { config = {} } ) {
	const follow = config.follow || 'content.selection';
	const scope = follow.replace( /\.selection$/, '' );
	const [ value ] = useSelection( scope );

	if ( value === undefined || value === null ) {
		return (
			<div className="wp-admin-shell-content__empty">
				{ __( 'Select an item to preview.', 'wp-admin-shell' ) }
			</div>
		);
	}

	return (
		<pre style={ { padding: 16, fontSize: 12 } }>
			{ JSON.stringify( value, null, 2 ) }
		</pre>
	);
}
