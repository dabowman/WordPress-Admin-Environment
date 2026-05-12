import { useEffect } from '@wordpress/element';

import { setDirty, clearDirty } from './dirtyState.mjs';

/**
 * Report this app's unsaved-changes status to the engine.
 *
 * Apps whose manifest declares `platform.dirty-state: true` call this
 * hook with their region id and a boolean. When the manifest also
 * declares `platform.block-navigation-on-dirty: true`, pass
 * `blocksNavigation: true` so the engine guards navigation while
 * dirty (browser-analog: `beforeunload`).
 *
 * `regionId` is the prop the kernel passes to every mounted app
 * (`MountedApp` provides it). On unmount the entry is cleared so a
 * stale flag from a previously mounted app cannot block navigation.
 * @param {*}      regionId
 * @param {*}      isDirty
 * @param {Object} root0
 * @param {*}      root0.blocksNavigation
 */
export function useDirtyState(
	regionId,
	isDirty,
	{ blocksNavigation = false } = {}
) {
	useEffect( () => {
		if ( ! regionId ) {
			return undefined;
		}
		setDirty( regionId, isDirty, { blocksNavigation } );
		return () => clearDirty( regionId );
	}, [ regionId, isDirty, blocksNavigation ] );
}
