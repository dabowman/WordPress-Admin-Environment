import { __ } from '@wordpress/i18n';
import { useEntityRecord } from '@wordpress/core-data';
import { Spinner } from '@wordpress/components';

import { useRoute } from '../../runtime/routing/router';
import { matchRoute } from '../../runtime/routing/matchRoute.mjs';
import { useKernel } from '../../runtime/kernel-context';

/**
 * core:preview-pane — preview the entity matched by another routable
 * region's URL slot.
 *
 * Spec §6.4 + V2.M4 task 2: regions coordinate via URL state, not via
 * a shell-level selection bus. PreviewPaneApp reads the routes block
 * + the URL slot value at `config.follow` (default `_self`) and maps
 * the matched route's `config` to a `core-data` entity, then renders
 * a JSON preview. Designed for shells whose `detail` region (or any
 * routable region) holds an editor-style app and whose `preview`
 * region wants to mirror what the editor is editing.
 *
 * Config:
 *   - `follow`: route-key to follow. Defaults to `_self` (primary
 *     path). Use `'detail'` to mirror a detail region.
 *
 * Routes whose config carries `post-type` + `post-id` are interpreted
 * as `core-data` posts — `useEntityRecord('postType', post-type, id)`.
 * Other shapes render their config object as JSON for now.
 * @param {Object} root0
 * @param {*}      root0.config
 */
export default function PreviewPaneApp( { config = {} } ) {
	const follow = config.follow || '_self';
	const route = useRoute();
	const { config: shellConfig } = useKernel();
	const routesBlock = shellConfig?.routes || {};

	const slotValue =
		follow === '_self' ? route.primary : route.params?.[ follow ] || '';
	const matched = slotValue ? matchRoute( routesBlock, slotValue ) : null;

	if ( ! matched ) {
		return (
			<div className="wp-admin-shell-region__empty">
				{ __( 'Select an item to preview.', 'wp-admin-shell' ) }
			</div>
		);
	}

	const postType =
		matched.config?.[ 'post-type' ] || matched.config?.postType;
	const postIdRaw = matched.config?.[ 'post-id' ] || matched.config?.postId;
	const postId =
		postIdRaw && /^\d+$/.test( String( postIdRaw ) )
			? Number( postIdRaw )
			: null;

	if ( postType && postId ) {
		return (
			<PreviewEntity kind="postType" name={ postType } id={ postId } />
		);
	}

	return (
		<pre style={ { padding: 16, fontSize: 12 } }>
			{ JSON.stringify(
				{ app: matched.app, config: matched.config },
				null,
				2
			) }
		</pre>
	);
}

function PreviewEntity( { kind, name, id } ) {
	const { record, isResolving } = useEntityRecord( kind, name, id, {
		enabled: !! id,
	} );

	if ( isResolving ) {
		return (
			<div className="wp-admin-shell-region__empty">
				<Spinner />
			</div>
		);
	}
	if ( ! record ) {
		return (
			<div className="wp-admin-shell-region__empty">
				{ __( 'Item not found.', 'wp-admin-shell' ) }
			</div>
		);
	}
	return (
		<pre style={ { padding: 16, fontSize: 12 } }>
			{ JSON.stringify( record, null, 2 ) }
		</pre>
	);
}
