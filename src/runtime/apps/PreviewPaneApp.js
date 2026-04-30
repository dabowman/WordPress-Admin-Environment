import { __ } from '@wordpress/i18n';
import { useSelection } from '../selection/useSelection';

/**
 * core:preview-pane — placeholder preview app.
 *
 * Reads the configured `follow` selection scope and displays whatever is
 * there. For M1 this is a debug stub; M4 will replace it with real preview
 * content for posts/pages/templates.
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
