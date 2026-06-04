/**
 * Trigger store for triggerable apps (spec §5.3 `platform.triggerable`).
 *
 * A region whose mounted app has `platform.triggerable: true` is
 * closed-by-default and waits for an external invocation. The workspace's
 * `bindings` block in workspace.json maps keystrokes to app ids; when a
 * binding fires, the bindings consumer calls `trigger(appId)` to open
 * the matching region.
 *
 * The region itself registers an open handler at mount time. This
 * module is the rendezvous point so the bindings layer doesn't need
 * to walk the React tree to find the region.
 *
 * Pure ESM. Mirrors `dirtyState.mjs` in shape — small Map + emit.
 */

const handlers = new Map();

/**
 * Register an open handler for an app id. Returns a disposer; call it
 * on unmount to remove the entry. Multiple registrations for the same
 * id replace the previous handler — usually only one region mounts a
 * given triggerable app at a time.
 */
export function registerTrigger( appId, openFn ) {
	if ( ! appId || typeof openFn !== 'function' ) {
		return () => {};
	}
	handlers.set( appId, openFn );
	return () => {
		if ( handlers.get( appId ) === openFn ) {
			handlers.delete( appId );
		}
	};
}

/**
 * Invoke the registered open handler for an app id. No-op if nothing
 * is registered. Returns `true` when the trigger fired, so callers can
 * choose to swallow the underlying event only on a successful trigger.
 */
export function trigger( appId ) {
	const handler = handlers.get( appId );
	if ( ! handler ) {
		return false;
	}
	try {
		handler();
		return true;
	} catch ( e ) {
		// eslint-disable-next-line no-console
		console.error( '[wp-admin-workspaces] trigger handler threw', e );
		return false;
	}
}

export function hasTrigger( appId ) {
	return handlers.has( appId );
}

export function reset() {
	handlers.clear();
}
